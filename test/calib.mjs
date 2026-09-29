// Calibration: simulate a full historical schedule with auto-managed teams and compare with reality.
import { setDataBase, loadGlobal, loadSeason, EV } from '../web/js/data.js';
import { Sim, mulberry32 } from '../web/js/engine.js';
import { buildTeam } from '../web/js/teams.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
const year = +(process.argv[2] || 2019);
const method = process.argv[3] || 'odds';
await loadGlobal();
const S = await loadSeason(year);
const teams = {};
for (const code of Object.keys(S.teams)) if (S.gamesByTeam.get(code)?.some(g => g.type === 'R')) teams[code] = buildTeam(S, code);
const rng = mulberry32(12345);
const tot = { g: 0, r: 0, h: 0, hr: 0, bb: 0, k: 0, pa: 0, sb: 0, cs: 0, ab: 0, d: 0, t: 0, hbp: 0, gdp:0 };
const teamRuns = {};
const t0 = Date.now();
const rot = {};
for (const g of S.games) {
  if (g.type !== 'R') continue;
  const A = teams[g.vis], H = teams[g.home];
  if (!A || !H) continue;
  const mk = (t) => { const i = (rot[t.code] = ((rot[t.code] ?? -1) + 1)); return Object.assign({}, t, { sp: t.rotation[i % t.rotation.length] }); };
  const sim = new Sim(mk(A), mk(H), { rng, dh: H.dh, method, ghost: year >= 2020 });
  const r = sim.playGame();
  tot.g++; tot.r += r.score[0] + r.score[1];
  (teamRuns[g.vis] ??= [0, 0])[0] += r.score[0]; teamRuns[g.vis][1] += r.score[1];
  (teamRuns[g.home] ??= [0, 0])[0] += r.score[1]; teamRuns[g.home][1] += r.score[0];
  for (const b of r.box.values()) { tot.h += b.h; tot.hr += b.hr; tot.bb += b.bb; tot.k += b.k; tot.pa += b.pa; tot.sb += b.sb; tot.cs += b.cs; tot.d += b.d; tot.t += b.t; tot.hbp += b.hbp; tot.gdp += b.gdp; }
}
console.log(`sim ${year} ${method}: ${tot.g} games in ${(Date.now() - t0) / 1000}s`);
// actual
const act = { g: 0, r: 0 };
for (const g of S.games) if (g.type === 'R') { act.g++; act.r += g.vs + g.hs; }
// actual league totals from player rows
let A = { pa: 0, k: 0, bb: 0, hbp: 0, s: 0, d: 0, t: 0, hr: 0 };
for (const { n } of S.batRows.values()) { A.pa += n[0]; A.k += n[1]; A.bb += n[2]; A.hbp += n[3]; A.s += n[4]; A.d += n[5]; A.t += n[6]; A.hr += n[7]; }
for (const { n } of S.batpRows.values()) { A.pa += n[0]; A.k += n[1]; A.bb += n[2]; A.hbp += n[3]; A.s += n[4]; A.d += n[5]; A.t += n[6]; A.hr += n[7]; }
const per = (x, n) => (x / n).toFixed(4);
console.log('R/G  sim', (tot.r / tot.g).toFixed(2), ' actual', (act.r / act.g).toFixed(2));
console.log('per PA        K      BB     HR     H      2B     3B     HBP');
console.log('sim   ', ['k','bb','hr','h','d','t','hbp'].map(k => per(tot[k], tot.pa)).join('  '));
console.log('actual', [A.k, A.bb, A.hr, A.s + A.d + A.t + A.hr, A.d, A.t, A.hbp].map(x => per(x, A.pa)).join('  '));
console.log('SB/G sim', (tot.sb/tot.g).toFixed(2), 'CS/G', (tot.cs/tot.g).toFixed(2), 'GDP/G', (tot.gdp/tot.g).toFixed(2));
// team runs correlation
let sx=0,sy=0,sxx=0,syy=0,sxy=0,n=0; const rows=[];
for (const [c, [rs, ra]] of Object.entries(teamRuns)) { const t = S.teams[c]; if (!t?.rs) continue; const x = t.rs, y = rs; rows.push([c, x, y, t.ra, ra]); n++; sx+=x; sy+=y; sxx+=x*x; syy+=y*y; sxy+=x*y; }
const corr = (n*sxy - sx*sy) / Math.sqrt((n*sxx - sx*sx)*(n*syy - sy*sy));
console.log('team RS correlation sim vs actual:', corr.toFixed(3), ' n=', n);
console.log(rows.slice(0, 6).map(r => r.join(' ')).join('\n'));
