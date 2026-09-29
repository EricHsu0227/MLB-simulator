import { setDataBase, loadGlobal, loadSeason, baselineRates } from '../web/js/data.js';
import { Sim, mulberry32 } from '../web/js/engine.js';
import { buildTeam } from '../web/js/teams.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal();
const S = await loadSeason(2019);
const mode = process.argv[2] || 'fake';
function tm(code) { return buildTeam(S, code); }
const A = tm(process.argv[3]||'HOU'), H = tm(process.argv[4]||'NYA'); const DH = A.dh;
const b = baselineRates(S, A.lg);
if (mode === 'fake') {
  for (const t of [A, H]) {
    const all = [...t.lineup.map(x => x.p), t.sp, ...t.rotation, ...t.bench, ...t.bullpen];
    for (const p of all) { p.bat = Object.assign({}, p.bat, { r: b.bat }); p.pit = Object.assign({}, p.pit, { r: b.pit }); p.batP = Object.assign({}, p.batP, { r: b.batP }); }
  }
}
const rng = mulberry32(7);
const tot = { pa: 0, k: 0, bb: 0, h: 0, hr: 0, r: 0, hbp: 0 };
let g = 0;
for (let i = 0; i < 1500; i++) {
  const sim = new Sim(A, H, { rng, dh: DH });
  const r = sim.playGame(); g++;
  tot.r += r.score[0] + r.score[1];
  for (const x of r.box.values()) { tot.pa += x.pa; tot.k += x.k; tot.bb += x.bb; tot.h += x.h; tot.hr += x.hr; tot.hbp += x.hbp; }
}
console.log(mode, 'R/G', (tot.r / g).toFixed(2), 'PA/G', (tot.pa/g).toFixed(1), ['k','bb','h','hr','hbp'].map(k => (tot[k]/tot.pa).toFixed(4)).join(' '));
console.log('base K BB HBP 1B..', Array.from(b.bat).map(v=>v.toFixed(4)).join(' '));
