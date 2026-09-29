import { setDataBase, loadGlobal, loadSeason, baselineRates } from '../web/js/data.js';
import { Sim } from '../web/js/engine.js';
import { buildTeam } from '../web/js/teams.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal();
const y = +(process.argv[2]||2019);
const S = await loadSeason(y);
const codes = Object.keys(S.teams).filter(c => S.gamesByTeam.get(c)?.some(g => g.type === 'R'));
const teams = codes.map(c => buildTeam(S, c));
const avg = a => { const o = new Float64Array(8); for (const r of a) for (let i = 0; i < 8; i++) o[i] += r[i] / a.length; return o; };
const f = a => Array.from(a).map(v => v.toFixed(4)).join(' ');
const hit = teams.flatMap(t => t.lineup.filter(x => x.pos !== 1).map(x => x.p.bat.r));
const pit = teams.flatMap(t => t.rotation.map(p => p.pit.r));
const pen = teams.flatMap(t => t.bullpen.map(p => p.pit.r));
const b = baselineRates(S, 'NL');
console.log('EV      K      BB     HBP    1B     2B     3B     HR     OUT');
console.log('base', f(b.bat));
console.log('hit ', f(avg(hit)));
console.log('rot ', f(avg(pit)));
console.log('pen ', f(avg(pen)));
// actual league split by lg
for (const lg of ['AL','NL']) { const B = S.base[lg]; console.log(lg, 'bat PA', B.bat[0], 'pit PA', B.pit[0], 'batP', B.batP[0]); }
let tot=[0,0,0,0,0,0,0,0,0]; for (const {n} of S.batRows.values()) for (let i=0;i<9;i++) tot[i]+=n[i];
console.log('all bat rows', tot.slice(1).map(x=>(x/tot[0]).toFixed(4)).join(' '), tot[0]);
let bp=[0,0,0,0,0,0,0,0,0]; for (const {n} of S.batpRows.values()) for (let i=0;i<9;i++) bp[i]+=n[i];
console.log('all batP rows', bp.slice(1).map(x=>(x/bp[0]).toFixed(4)).join(' '), bp[0]);
let pp=[0,0,0,0,0,0,0,0,0]; for (const {n} of S.pitRows.values()) for (let i=0;i<9;i++) pp[i]+=n[i];
console.log('all pit rows', pp.slice(1).map(x=>(x/pp[0]).toFixed(4)).join(' '), pp[0]);
