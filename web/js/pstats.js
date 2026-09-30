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

// ---------------------------------------------------------------- left/right splits
function lineFrom(c, batter) {
  const pa = c[0];
  if (!pa) return null;
  const k = c[1], bb = c[2], hbp = c[3], s1 = c[4], d = c[5], t = c[6], hr = c[7];
  const h = s1 + d + t + hr, ab = pa - bb - hbp, tb = s1 + 2 * d + 3 * t + 4 * hr;
  const woba = (WOBA_W[1] * bb + WOBA_W[2] * hbp + WOBA_W[3] * s1 + WOBA_W[4] * d + WOBA_W[5] * t + WOBA_W[6] * hr) / pa;
  return { pa, ab, h, hr, bb, k, avg: pct(h, ab), obp: pct(h + bb + hbp, pa), slg: pct(tb, ab), ops: pct(h + bb + hbp, pa) + pct(tb, ab), woba, kpct: pct(k, pa), bbpct: pct(bb, pa), hrpct: pct(hr, pa), babip: pct(h - hr, ab - k - hr) };
}
/** {L: line, R: line} vs LHP / RHP for a hitter, or vs LHB / RHB for a pitcher. Null if no split data. */
export function splitStats(S, idx, role) {
  const m = role === 'pit' ? S.pspMap : S.bspMap;
  const sp = m && m.get(idx);
  if (!sp) return null;
  return { L: lineFrom(sp.L), R: lineFrom(sp.R) };
}

/** {L, R} lines from a concatenated [L(9), R(9)] count array (career shards). */
export function splitFromArr(a) {
  if (!a) return null;
  return { L: lineFrom(a.slice(0, 9)), R: lineFrom(a.slice(9, 18)) };
}
/** A one-player season object so batStats/pitStats/ratings work on career-shard rows. ctx = [lgwoba, lgR, lgEra, cFip] from index.json. */
export function pseudoSeason(ctx, bat, pit) {
  const S = { batRows: new Map(), pitRows: new Map(), base: {}, teams: {} };
  if (bat) S.batRows.set(0, { n: bat });
  if (pit) S.pitRows.set(0, { n: pit });
  ctxCache.set(S, { lgwoba: ctx[0], lgR: ctx[1], lgEra: ctx[2], cFip: ctx[3], usesER: true });
  return S;
}
/** Rating from career-row stats alone (no league counts needed): centred on the season's league wOBA. */
export function quickOvr(ctx, b, p) {
  const out = {};
  if (b && b.pa >= 30) { const rel = b.pa / (b.pa + 150); out.bat = Math.round(clamp(50 + (b.wrcPlus - 100) * 0.4 * rel, 20, 99)); }
  if (p && p.bf >= 30) { const rel = p.bf / (p.bf + 200); out.pit = Math.round(clamp(50 + (ctx[0] - p.woba) * 330 * rel, 20, 99)); }
  return out;
}

// ---------------------------------------------------------------- player ratings (20-80 scouting scale + 1-99 overall)
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const scale = z => Math.round(clamp(50 + 10 * z, 20, 80) / 5) * 5;
export function tier(ovr) { return ovr >= 90 ? 'Superstar' : ovr >= 80 ? 'All-Star' : ovr >= 70 ? 'Star' : ovr >= 60 ? 'Above average' : ovr >= 50 ? 'Solid' : ovr >= 40 ? 'Role player' : 'Replacement level'; }

export function hitterRatings(S, idx) {
  const b = batStats(S, idx);
  if (!b || b.pa < 30) return null;
  const ctx = leagueContext(S);
  let pa = 0, k = 0, bb = 0, hr = 0, h = 0, tb = 0, ab = 0;
  const seen = new Set();
  for (const B of Object.values(S.base || {})) { if (seen.has(B)) continue; seen.add(B); const c = B.bat; pa += c[0]; k += c[1]; bb += c[2]; ab += c[0] - c[2] - c[3]; hr += c[7]; h += c[4] + c[5] + c[6] + c[7]; tb += c[4] + 2 * c[5] + 3 * c[6] + 4 * c[7]; }
  const lgK = pct(k, pa), lgBB = pct(bb, pa), lgHR = pct(hr, pa), lgISO = pct(tb - h, ab), lgBABIP = pct(h - hr, ab - k - hr);
  const rel = b.pa / (b.pa + 150);              // reliability shrink so 60-PA cameos don't look elite
  const z = v => v * rel;
  const contact = scale(z(0.65 * (lgK - b.kpct) / 0.05 + 0.35 * (b.babip - lgBABIP) / 0.03));
  const power = scale(z(0.6 * (b.iso - lgISO) / 0.05 + 0.4 * (b.hrpct - lgHR) / 0.02));
  const eye = scale(z((b.bbpct - lgBB) / 0.035));
  const spd = (b.sb - b.cs * 1.5) / Math.max(1, b.pa) * 600 / 12 + (b.t / Math.max(1, b.pa) * 600 - 2.5) / 3;
  const speed = scale(z(spd));
  const ovr = Math.round(clamp(50 + (b.wrcPlus - 100) * 0.4 * rel + (rel < 1 ? 0 : 0), 20, 99));
  return { ovr, tier: tier(ovr), contact, power, eye, speed, wrcPlus: b.wrcPlus };
}

export function pitcherRatings(S, idx) {
  const p = pitStats(S, idx);
  if (!p || p.bf < 30) return null;
  const ctx = leagueContext(S);
  let bf = 0, k = 0, bb = 0, hr = 0;
  const seen = new Set();
  for (const B of Object.values(S.base || {})) { if (seen.has(B)) continue; seen.add(B); const c = B.pit; bf += c[0]; k += c[1]; bb += c[2]; hr += c[7]; }
  const lgK = pct(k, bf), lgBB = pct(bb, bf), lgHR = pct(hr, bf);
  const rel = p.bf / (p.bf + 200);
  const stuff = scale(rel * (p.kpct - lgK) / 0.05);
  const control = scale(rel * (lgBB - p.bbpct) / 0.02);
  const contact = scale(rel * (0.6 * (lgHR - pct(p.hr, p.bf)) / 0.008 + 0.4 * (p.gb - 0.43) / 0.07));
  const perApp = p.gs >= p.g * 0.5 ? p.bf / Math.max(1, p.gs) : p.bf / Math.max(1, p.g);
  const stamina = p.gs >= p.g * 0.5 ? scale((perApp - 24) / 5) : scale((perApp - 4.2) / 1.2);
  const ovr = Math.round(clamp(50 + (ctx.lgwoba - p.woba) * 330 * rel, 20, 99));
  return { ovr, tier: tier(ovr), stuff, control, contact, stamina, role: p.gs >= p.g * 0.5 && p.gs >= 3 ? 'Starter' : 'Reliever' };
}
