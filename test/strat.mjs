import { setDataBase, loadGlobal, loadSeason } from '../web/js/data.js';
import { Sim, mulberry32 } from '../web/js/engine.js';
import { buildTeam } from '../web/js/teams.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal(); const S = await loadSeason(2019);
const A = buildTeam(S, 'HOU'), H = buildTeam(S, 'NYA');
function run(strat, n = 800) { const rng = mulberry32(3); let rs = 0, sh = 0, ibb = 0, sb = 0, cs = 0;
  for (let i = 0; i < n; i++) { const sim = new Sim(A, H, { rng, dh: true, strat: { 0: strat, 1: strat } }); const r = sim.playGame(); rs += r.score[0] + r.score[1]; for (const b of r.box.values()) { sh += b.sh; ibb += b.ibb; sb += b.sb; cs += b.cs; } }
  return `R/G ${(rs / n).toFixed(2)} SH/G ${(sh / n).toFixed(2)} IBB/G ${(ibb / n).toFixed(2)} SB/G ${(sb / n).toFixed(2)} CS/G ${(cs / n).toFixed(2)}`; }
console.log('default   ', run({}));
console.log('steal x2  ', run({ steal: 2 }));
console.log('steal x0  ', run({ steal: 0 }));
console.log('bunts sit ', run({ bunt: 'situational' }));
console.log('ibb sit   ', run({ ibb: 'situational' }));
console.log('inf in    ', run({ infieldIn: 'situational' }));
console.log('hook .8   ', run({ hook: 0.8 }));
