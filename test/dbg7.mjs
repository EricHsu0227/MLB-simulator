import { setDataBase, loadGlobal, loadSeason, baselineRates } from '../web/js/data.js';
import { Sim, mulberry32 } from '../web/js/engine.js';
import { buildTeam } from '../web/js/teams.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal();
const S = await loadSeason(2019);
const teams = {};
for (const code of Object.keys(S.teams)) if (S.gamesByTeam.get(code)?.some(g => g.type === 'R')) teams[code] = buildTeam(S, code);
const rng = mulberry32(5);
// monkey patch paProbs to accumulate expectations
const exp = new Float64Array(8); let n = 0; const real = new Float64Array(8);
const byRole = { hit: new Float64Array(8), pit: new Float64Array(8), pb: new Float64Array(8) }; let cnt = { hit: 0, pit: 0, pb: 0 };
const orig = Sim.prototype.paProbs;
Sim.prototype.paProbs = function (b, p, bt, out) { const r = orig.call(this, b, p, bt, out); for (let i = 0; i < 8; i++) exp[i] += r[i]; n++; return r; };
let games = 0, runs = 0;
for (const g of S.games.slice(0, 1200)) {
  if (g.type !== 'R') continue;
  const A = teams[g.vis], H = teams[g.home]; if (!A || !H) continue;
  const sim = new Sim(A, H, { rng, dh: H.dh });
  const r = sim.playGame(); games++; runs += r.score[0] + r.score[1];
  for (const l of sim.st.log) if (l.kind === 'pa') { const k = ['K','BB','HBP','1B','2B','3B','HR','OUT'].indexOf(l.ev); real[k]++; }
}
const f = a => Array.from(a).map(v => (v / n).toFixed(4)).join(' ');
console.log('games', games, 'R/G', (runs / games).toFixed(2), 'n', n);
console.log('expected', f(exp));
console.log('realized', f(real));
const b = baselineRates(S, 'AL'); console.log('base AL ', Array.from(b.bat).map(v => v.toFixed(4)).join(' '));
