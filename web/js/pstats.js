// Derived "essential" stats from a season's player rows (works for Retrosheet seasons and the live season).
import { WOBA_W } from './data.js';

const ctxCache = new WeakMap();

/** League context for a season object: wOBA, runs per PA, FIP constant, ERA. */
export function leagueContext(S) {
  if (ctxCache.has(S)) return ctxCache.get(S);
  let pa = 0; const c = new Array(8).fill(0);
  for (const b of Object.values(S.base || {})) { for (const k of ['bat', 'batP']) { pa += b[k][0]; for (let i = 0; i < 8; i++) c[i] += b[k][1 + i]; } break; }
  // both leagues can share one baseline object (live season): count each distinct one once
  const seen = new Set(); pa = 0; c.fill(0);
  for (const b of Object.values(S.base || {})) { if (seen.has(b)) continue; seen.add(b); for (const k of ['bat', 'batP']) { pa += b[k][0]; for (let i = 0; i < 8; i++) c[i] += b[k][1 + i]; } }
  let lgwoba = 0; for (let i = 0; i < 8; i++) lgwoba += WOBA_W[i] * (pa ? c[i] / pa : 0);
  let rs = 0; for (const t of Object.values(S.teams || {})) rs += t.rs || 0;
  const lgR = pa && rs ? Math.min(0.16, Math.max(0.08, rs / pa)) : 0.115;
  // pitching totals for FIP constant
  let ip = 0, er = 0, r = 0, k = 0, bb = 0, hbp = 0, hr = 0;
  for (const { n, raw } of S.pitRows.values()) {
    const outs = raw ? raw.outs : n[14], ers = raw ? raw.er : n[20], runs = raw ? raw.r : n[21];
    ip += outs / 3; er += ers; r += runs; k += raw ? raw.o[0] : n[1]; bb += raw ? raw.o[1] : n[2]; hbp += raw ? raw.o[2] : n[3]; hr += raw ? raw.o[6] : n[8 - 1 + 0];
  }
  hr = 0; for (const { n, raw } of S.pitRows.values()) hr += raw ? raw.o[6] : n[7];
  const lgEra = ip ? (er > ip * 0.3 ? er : r) * 9 / ip : 4.3;
  const fipRaw = ip ? (13 * hr + 3 * (bb + hbp) - 2 * k) / ip : 0;
  const ctx = { lgwoba, lgR, lgEra, cFip: lgEra - fipRaw, usesER: er > ip * 0.3 };
  ctxCache.set(S, ctx);
  return ctx;
}

const pct = (a, b) => (b > 0 ? a / b : 0);

export function batStats(S, idx) {
  const row = S.batRows.get(idx);
  if (!row) return null;
  let n;
  if (row.raw) {                       // live season: pure current-season counts
    const r = row.raw, b = row.n;
    n = { pa: r.pa, k: r.o[0], bb: r.o[1], hbp: r.o[2], s1: r.o[3], d: r.o[4], t: r.o[5], hr: r.o[6], gb: b[9], ld: b[10], fb: b[11], pull: b[12], ctr: b[13], opp: b[14], att: r.sb + r.cs, sb: r.sb };
  } else {
    const b = row.n;
    n = { pa: b[0], k: b[1], bb: b[2], hbp: b[3], s1: b[4], d: b[5], t: b[6], hr: b[7], gb: b[9], ld: b[10], fb: b[11], pull: b[12], ctr: b[13], opp: b[14], att: b[16], sb: b[17] };
  }
  if (!n.pa) return null;
  const ctx = leagueContext(S);
  const h = n.s1 + n.d + n.t + n.hr, ab = n.pa - n.bb - n.hbp;
  const tb = n.s1 + 2 * n.d + 3 * n.t + 4 * n.hr;
  const avg = pct(h, ab), obp = pct(h + n.bb + n.hbp, n.pa), slg = pct(tb, ab);
  const woba = (WOBA_W[1] * n.bb + WOBA_W[2] * n.hbp + WOBA_W[3] * n.s1 + WOBA_W[4] * n.d + WOBA_W[5] * n.t + WOBA_W[6] * n.hr) / n.pa;
  const wrcPlus = Math.round(((woba - ctx.lgwoba) / 1.15 + ctx.lgR) / ctx.lgR * 100);
  const bip = n.gb + n.ld + n.fb, dirs = n.pull + n.ctr + n.opp;
  return {
    pa: n.pa, ab, h, d: n.d, t: n.t, hr: n.hr, bb: n.bb, k: n.k, hbp: n.hbp, sb: n.sb, cs: Math.max(0, n.att - n.sb),
    avg, obp, slg, ops: obp + slg, iso: slg - avg, babip: pct(h - n.hr, ab - n.k - n.hr), kpct: pct(n.k, n.pa), bbpct: pct(n.bb, n.pa), hrpct: pct(n.hr, n.pa), woba, wrcPlus,
    gb: pct(n.gb, bip), ld: pct(n.ld, bip), fb: pct(n.fb, bip), pull: pct(n.pull, dirs), ctr: pct(n.ctr, dirs), opp: pct(n.opp, dirs), bipN: bip, sbPct: pct(n.sb, n.att),
  };
}

export function pitStats(S, idx) {
  const row = S.pitRows.get(idx);
  if (!row) return null;
  let n;
  if (row.raw) { const r = row.raw, b = row.n; n = { bf: r.bf, k: r.o[0], bb: r.o[1], hbp: r.o[2], s1: r.o[3], d: r.o[4], t: r.o[5], hr: r.o[6], g: r.g, gs: r.gs, outs: r.outs, er: r.er, r: r.r, gb: b[9], ld: b[10], fb: b[11], sv: r.sv }; }
  else { const b = row.n; n = { bf: b[0], k: b[1], bb: b[2], hbp: b[3], s1: b[4], d: b[5], t: b[6], hr: b[7], g: b[12], gs: b[13], outs: b[14], er: b[20], r: b[21], gb: b[9], ld: b[10], fb: b[11], sv: b[18] }; }
  if (!n.bf && !n.outs) return null;
  const ctx = leagueContext(S);
  const ip = n.outs / 3, h = n.s1 + n.d + n.t + n.hr;
  const woba = n.bf ? (WOBA_W[1] * n.bb + WOBA_W[2] * n.hbp + WOBA_W[3] * n.s1 + WOBA_W[4] * n.d + WOBA_W[5] * n.t + WOBA_W[6] * n.hr) / n.bf : 0;
  const bip = n.gb + n.ld + n.fb;
  const hasER = n.er > 0;
  return {
    g: n.g, gs: n.gs, ip, bf: n.bf, h, hr: n.hr, bb: n.bb, k: n.k, sv: n.sv,
    era: ip ? (hasER ? n.er : n.r) * 9 / ip : 0, eraLabel: hasER ? 'ERA' : 'RA/9',
    fip: ip ? (13 * n.hr + 3 * (n.bb + n.hbp) - 2 * n.k) / ip + ctx.cFip : 0,
    whip: ip ? (h + n.bb) / ip : 0, k9: ip ? n.k * 9 / ip : 0, bb9: ip ? n.bb * 9 / ip : 0, hr9: ip ? n.hr * 9 / ip : 0, h9: ip ? h * 9 / ip : 0,
    kpct: pct(n.k, n.bf), bbpct: pct(n.bb, n.bf), kbb: pct(n.k - n.bb, n.bf), babip: pct(h - n.hr, n.bf - n.k - n.bb - n.hbp - n.hr), woba,
    gb: pct(n.gb, bip), ld: pct(n.ld, bip), fb: pct(n.fb, bip), bipN: bip,
    lgEra: ctx.lgEra,
  };
}

export const fmt = {
  r3: x => (x >= 1 ? x.toFixed(3) : x.toFixed(3).replace(/^0/, '')),
  p1: x => (x * 100).toFixed(1) + '%',
  d2: x => x.toFixed(2),
  d1: x => x.toFixed(1),
};
