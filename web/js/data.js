// Data loading + derived rate tables. Works in browsers (fetch + DecompressionStream) and Node (fs + zlib).
const isNode = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node;
let BASE = 'data/';
export function setDataBase(b) { BASE = b.endsWith('/') ? b : b + '/'; }

async function readBytes(path) {
  if (isNode) {
    const fs = await import('node:fs');
    return fs.readFileSync(path);
  }
  const r = await fetch(path);
  if (!r.ok) throw new Error('Failed to load ' + path + ' (' + r.status + ')');
  return new Uint8Array(await r.arrayBuffer());
}

export async function loadJSONGz(path) {
  const bytes = await readBytes(path);
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  let text;
  if (!gz) text = new TextDecoder().decode(bytes);
  else if (isNode) {
    const zlib = await import('node:zlib');
    text = zlib.gunzipSync(bytes).toString('utf8');
  } else {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    text = await new Response(stream).text();
  }
  return JSON.parse(text);
}

export async function loadIndex() {
  const bytes = await readBytes(BASE + 'index.json');
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ---------------------------------------------------------------- constants
export const EV = ['K', 'BB', 'HBP', '1B', '2B', '3B', 'HR', 'OUT'];
export const WOBA_W = [0, 0.69, 0.72, 0.88, 1.24, 1.56, 2.08, 0];
export const POS_NAME = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH', 11: 'PH', 12: 'PR' };

const ERAS_RANGE = [[1901, 1919], [1920, 1945], [1946, 1968], [1969, 1992], [1993, 2019], [2020, 2100]];
export function eraIndex(y) {
  for (let i = 0; i < ERAS_RANGE.length; i++) if (y >= ERAS_RANGE[i][0] && y <= ERAS_RANGE[i][1]) return i;
  return ERAS_RANGE.length - 1;
}

// ---------------------------------------------------------------- global tables
let GLOBAL = null;
export async function loadGlobal() {
  if (GLOBAL) return GLOBAL;
  const g = await loadJSONGz(BASE + 'global.json.gz');
  GLOBAL = g;
  g.derived = g.eras.map(() => null);
  g.pooled = null;
  return g;
}
export function getGlobal() { return GLOBAL; }

function sumCounts(dst, src) { for (const k in src) dst[k] = (dst[k] || 0) + src[k]; }

function buildEraTables(G, ei) {
  const T = G.eras[ei];
  const out = { joint: {}, hrz: {}, plat: null, tr: T.tr, runrate: T.runrate, runvec: T.runvec, ei };
  const pooled = pooledTables(G);
  for (const side of ['R', 'L']) {
    out.joint[side] = {};
    for (const ev of ['1B', '2B', '3B', 'OUT']) {
      let c = T.joint[side + '|' + ev] || {};
      let tot = 0; for (const k in c) tot += c[k];
      if (tot < 1500) c = pooled.joint[side + '|' + ev] || c;
      const keys = Object.keys(c);
      out.joint[side][ev] = { keys, typ: keys.map(k => k[0]), zone: keys.map(k => +k.slice(1)), w: keys.map(k => c[k]) };
    }
    let h = T.hrz[side] || {}; let tot = 0; for (const k in h) tot += h[k];
    if (tot < 100) h = pooled.hrz[side] || h;
    out.hrz[side] = h;
  }
  // league type / dir shares from the joint table (all outcomes)
  out.typShare = { R: [0, 0, 0], L: [0, 0, 0] };
  out.dirShare = { R: [0, 0, 0], L: [0, 0, 0] };
  const ti = { G: 0, L: 1, F: 2 };
  for (const side of ['R', 'L']) {
    const J = out.joint[side];
    for (const ev in J) {
      const e = J[ev];
      for (let i = 0; i < e.keys.length; i++) {
        out.typShare[side][ti[e.typ[i]]] += e.w[i];
        out.dirShare[side][dirOf(e.zone[i], side)] += e.w[i];
      }
    }
    const a = out.typShare[side]; const s = a[0] + a[1] + a[2] || 1; out.typShare[side] = a.map(x => x / s);
    const b = out.dirShare[side]; const s2 = b[0] + b[1] + b[2] || 1; out.dirShare[side] = b.map(x => x / s2);
  }
  // platoon factors: factor[side][throws][ev] relative to that batter-side's average
  const P = T.plat && Object.keys(T.plat).length > 200 ? T.plat : pooled.plat;
  const cnt = (s, t, e) => P[s + t + '|' + e] || 0;
  out.plat = {};
  for (const side of ['R', 'L']) {
    out.plat[side] = {};
    for (const thr of ['R', 'L']) {
      const f = new Float64Array(8);
      let nT = 0, nA = 0;
      for (let e = 0; e < 8; e++) { nT += cnt(side, thr, e); nA += cnt(side, 'R', e) + cnt(side, 'L', e); }
      for (let e = 0; e < 8; e++) {
        const rt = nT ? cnt(side, thr, e) / nT : 0;
        const ra = nA ? (cnt(side, 'R', e) + cnt(side, 'L', e)) / nA : 0;
        f[e] = ra > 0 && rt > 0 ? Math.min(1.35, Math.max(0.7, rt / ra)) : 1;
      }
      out.plat[side][thr] = f;
    }
  }
  return out;
}

function pooledTables(G) {
  if (G.pooled) return G.pooled;
  const p = { joint: {}, hrz: {}, plat: {}, tr: {} };
  for (const T of G.eras) {
    for (const k in T.joint) sumCounts(p.joint[k] = p.joint[k] || {}, T.joint[k]);
    for (const k in T.hrz) sumCounts(p.hrz[k] = p.hrz[k] || {}, T.hrz[k]);
    sumCounts(p.plat, T.plat);
    for (const k in T.tr) {
      const m = p.tr[k] = p.tr[k] || {};
      for (const [v, n] of T.tr[k]) m[v] = (m[v] || 0) + n;
    }
  }
  for (const k in p.tr) p.tr[k] = Object.entries(p.tr[k]).map(([v, n]) => [v, n]);
  G.pooled = p;
  return p;
}

export function eraTables(year) {
  const G = GLOBAL;
  const ei = eraIndex(year);
  if (!G.derived[ei]) G.derived[ei] = buildEraTables(G, ei);
  return G.derived[ei];
}

export function pooledTr() { return pooledTables(GLOBAL).tr; }

export function dirOf(zone, side) {
  if (!zone) return 1;
  const pull = side === 'R' ? [5, 7] : [3, 9];
  const opp = side === 'R' ? [3, 9] : [5, 7];
  if (pull.includes(zone)) return 0;
  if (opp.includes(zone)) return 2;
  return 1;
}

// ---------------------------------------------------------------- seasons
const SEASONS = new Map();
export async function loadSeason(y) {
  if (SEASONS.has(y)) return SEASONS.get(y);
  const raw = await loadJSONGz(BASE + 'seasons/' + y + '.json.gz');
  const S = prepareSeason(raw);
  SEASONS.set(y, S);
  return S;
}

function prepareSeason(raw) {
  const S = raw;
  S.playersById = new Map();
  S.players = raw.players.map((p, i) => ({ idx: i, id: p[0], name: p[1], bats: p[2] || 'R', throws: p[3] || 'R' }));
  for (const p of S.players) S.playersById.set(p.id, p);
  const mk = (rows, nb) => {
    const m = new Map();
    for (const r of rows) m.set(r[0], { n: r.slice(1, 1 + nb), pf: r.slice(1 + nb, 5 + nb) });
    return m;
  };
  S.batRows = mk(raw.bat, 19);
  S.batpRows = mk(raw.batp, 19);
  S.pitRows = mk(raw.pit, 22);
  // league baselines as rates
  S.base = {};
  for (const lg in raw.lg) {
    const L = raw.lg[lg];
    S.base[lg] = { bat: L.bat, batP: L.batP, pit: L.pit };
  }
  // steal league rates
  let opp = 0, att = 0, suc = 0;
  for (const { n } of S.batRows.values()) { opp += n[15]; att += n[16]; suc += n[17]; }
  S.sbLg = { rate: opp ? att / opp : 0.05, succ: att ? suc / att : 0.7 };
  // team game index
  S.gamesByTeam = new Map();
  S.games.forEach((g, i) => {
    g.i = i;
    for (const t of [g.vis, g.home]) {
      if (!S.gamesByTeam.has(t)) S.gamesByTeam.set(t, []);
      S.gamesByTeam.get(t).push(g);
    }
  });
  return S;
}

export function teamLeague(S, code) { return S.teams[code]?.lg || 'AL'; }

// ---------------------------------------------------------------- rates
function normRates(counts, pa) {
  const r = new Float64Array(8);
  if (pa <= 0) return r;
  for (let i = 0; i < 8; i++) r[i] = counts[i] / pa;
  return r;
}

const PB_RATIO_FALLBACK = [0.55, 1.0, 0.7, 0.75, 0.55, 0.4, 0.15, 1.05];

export function baselineRates(S, lg) {
  S._baseCache = S._baseCache || {};
  if (S._baseCache[lg]) return S._baseCache[lg];
  let B = S.base[lg];
  if (!B) { const k = Object.keys(S.base)[0]; B = S.base[k]; }
  const bat = normRates(B.bat.slice(1, 9), B.bat[0]);
  const pit = normRates(B.pit.slice(1, 9), B.pit[0]);
  let batP;
  if (B.batP[0] >= 1500) batP = normRates(B.batP.slice(1, 9), B.batP[0]);
  else {
    const T = eraTables(S.y);
    const ratio = GLOBAL.eras[T.ei].pbRatio || PB_RATIO_FALLBACK;
    batP = new Float64Array(8);
    let s = 0;
    for (let i = 0; i < 7; i++) { batP[i] = bat[i] * ratio[i]; s += batP[i]; }
    batP[7] = Math.max(0.3, 1 - s);
  }
  const res = { bat, batP, pit };
  S._baseCache[lg] = res;
  return res;
}

export const REG_K = { pa: 25, typ: 80, dir: 80 };

/** Build a Player rating object for season S index idx on a team of league lg. */
export function makePlayer(S, idx, lg, cfg = {}) {
  S._pcache = S._pcache || new Map();
  const ck = idx + '|' + lg;
  if (S._pcache.has(ck)) return S._pcache.get(ck);
  const info = S.players[idx];
  const base = baselineRates(S, lg);
  const T = eraTables(S.y);
  const K = cfg.regK ?? REG_K.pa;
  const p = {
    key: S.y + ':' + idx, y: S.y, S, idx, id: info.id, name: info.name, bats: info.bats, throws: info.throws, lg,
  };
  const mkBat = (row, baseR) => {
    const n = row ? row.n : null;
    const pa = n ? n[0] : 0;
    const r = new Float64Array(8);
    let pf = row ? row.pf : [1, 1, 1, 1];
    for (let i = 0; i < 8; i++) r[i] = ((n ? n[1 + i] : 0) + K * baseR[i]) / (pa + K);
    // park-neutralise
    for (let j = 0; j < 4; j++) r[3 + j] /= (pf[j] || 1);
    let s = 0; for (let i = 0; i < 7; i++) s += r[i];
    r[7] = Math.max(0.2, 1 - s);
    const side0 = info.bats === 'L' ? 'L' : 'R';
    const ts = T.typShare[side0], ds = T.dirShare[side0];
    const tn = n ? [n[9], n[10], n[11]] : [0, 0, 0];
    const dn = n ? [n[12], n[13], n[14]] : [0, 0, 0];
    const tT = tn[0] + tn[1] + tn[2], dT = dn[0] + dn[1] + dn[2];
    const t = ts.map((x, i) => (tn[i] + REG_K.typ * x) / (tT + REG_K.typ));
    let dsl = ds;
    if (info.bats === 'B') dsl = ds; // pull/oppo are side-relative already
    const d = dsl.map((x, i) => (dn[i] + REG_K.dir * x) / (dT + REG_K.dir));
    const opp = n ? n[15] : 0, att = n ? n[16] : 0, suc = n ? n[17] : 0;
    const lgAtt = S.sbLg.rate, lgSucc = S.sbLg.succ;
    const attRate = (att + 30 * lgAtt) / (opp + 30);
    const succ = (suc + 12 * lgSucc) / (att + 12);
    return { pa, r, t, d, attMult: Math.min(6, Math.max(0.15, attRate / (lgAtt || 0.05))), succRel: succ / (lgSucc || 0.7), n };
  };
  p.bat = mkBat(S.batRows.get(idx), base.bat);
  const rowP = S.batpRows.get(idx);
  p.batP = mkBat(rowP && rowP.n[0] >= 8 ? rowP : null, base.batP);
  // pitching
  const prow = S.pitRows.get(idx);
  const pr = new Float64Array(8);
  const pn = prow ? prow.n : null;
  const bf = pn ? pn[0] : 0;
  for (let i = 0; i < 8; i++) pr[i] = ((pn ? pn[1 + i] : 0) + (K * 2) * base.pit[i]) / (bf + K * 2);
  const ppf = prow ? prow.pf : [1, 1, 1, 1];
  for (let j = 0; j < 4; j++) pr[3 + j] /= (ppf[j] || 1);
  let ps = 0; for (let i = 0; i < 7; i++) ps += pr[i];
  pr[7] = Math.max(0.2, 1 - ps);
  const ts = T.typShare.R;
  const ptn = pn ? [pn[9], pn[10], pn[11]] : [0, 0, 0];
  const ptT = ptn[0] + ptn[1] + ptn[2];
  const G = pn ? pn[12] : 0, GS = pn ? pn[13] : 0;
  const bfAll = pn ? pn[15] : 0, bfStart = pn ? pn[16] : 0, outs = pn ? pn[14] : 0;
  const isStarter = GS >= Math.max(3, G * 0.5);
  const relApps = G - GS;
  const endStart = GS > 0 ? bfStart / GS : 0;
  const endRel = relApps > 0 ? Math.max(3, (bfAll - bfStart) / relApps) : 4;
  p.pit = {
    bf, r: pr, t: ts.map((x, i) => (ptn[i] + REG_K.typ * x) / (ptT + REG_K.typ)),
    G, GS, isStarter, gf: pn ? pn[17] : 0, sv: pn ? pn[18] : 0, outs,
    endStart: endStart || 24, endRel,
    endur: isStarter ? (endStart || 24) : Math.min(endRel, 16),
    er: pn ? pn[20] : 0,
  };
  // quality index for bullpen ordering: smaller = better (wOBA-against of neutral rates)
  let w = 0; for (let i = 0; i < 8; i++) w += WOBA_W[i] * pr[i];
  p.pit.wobaAgainst = w;
  let wb = 0; for (let i = 0; i < 8; i++) wb += WOBA_W[i] * p.bat.r[i];
  p.bat.woba = wb;
  S._pcache.set(ck, p);
  return p;
}

/** Real (unregressed) counting stat lines for display. */
export function batLine(S, idx) {
  const row = S.batRows.get(idx);
  if (!row) return null;
  const n = row.n;
  const pa = n[0], h = n[4] + n[5] + n[6] + n[7];
  const ab = pa - n[2] - n[3];
  const tb = n[4] + 2 * n[5] + 3 * n[6] + 4 * n[7];
  let w = 0; for (let i = 1; i < 8; i++) w += WOBA_W[i - 1] * n[i];   // n[0] is PA; n[1..8] follow EV order
  return { pa, ab, h, hr: n[7], bb: n[2], k: n[1], avg: ab ? h / ab : 0, obp: pa ? (h + n[2] + n[3]) / pa : 0, slg: ab ? tb / ab : 0, woba: pa ? w / pa : 0 };
}
export function pitLine(S, idx) {
  const row = S.pitRows.get(idx);
  if (!row) return null;
  const n = row.n;
  let w = 0; for (let i = 1; i < 8; i++) w += WOBA_W[i - 1] * n[i];
  return { g: n[12], gs: n[13], ip: n[14] / 3, bf: n[0], k: n[1], bb: n[2], hr: n[7], woba: n[0] ? w / n[0] : 0, r: n[21], er: n[20] };
}
