import { setDataBase, loadGlobal } from '../web/js/data.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal();
const { createHistoricLeague } = await import('../web/js/ui/mode_season.js');
const y = +(process.argv[2] || 2019);
const t0 = Date.now();
const lg = await createHistoricLeague(y, {});
console.log('built', Date.now() - t0, 'ms', lg.entries.length, 'teams', lg.total, 'games');
const bad = lg.schedule.filter(g => !lg.by.get(g.home) || !lg.by.get(g.away));
console.log('bad games', bad.length, bad.slice(0, 3));
const t1 = Date.now();
lg.simAll();
console.log('season simmed in', Date.now() - t1, 'ms');
for (const g of lg.standings()) { console.log(g.lg, g.div); for (const r of g.rows.slice(0, 5)) console.log('  ', r.e.name.padEnd(24), r.w, r.l, 'real', r.e.real.join('-'), 'RS', r.rs, 'RA', r.ra); }
console.log(lg.stats.batLeaders('hr', 5).map(a => a.p.name + ' ' + a.hr).join(', '));
console.log(lg.stats.pitLeaders('k', 5).map(a => a.p.name + ' ' + a.k).join(', '));
import { batLine } from '../web/js/data.js';
console.log('player       simPA simHR  sim%  realPA realHR real%   simK% realK%   simBB% realBB%  simwOBA realwOBA');
const wo = (a, r) => 0; 
const rows = lg.stats.batLeaders('hr', 12);
for (const a of rows) {
  const bl = batLine(a.p.S, a.p.idx);
  console.log(a.p.name.padEnd(18), String(a.pa).padStart(5), String(a.hr).padStart(5), (a.hr / a.pa).toFixed(4), String(bl.pa).padStart(6), String(bl.hr).padStart(6), (bl.hr / bl.pa).toFixed(4), (a.k / a.pa).toFixed(3), (bl.k / bl.pa).toFixed(3), (a.bb / a.pa).toFixed(3), (bl.bb / bl.pa).toFixed(3), ((a.h + a.bb + a.hbp) / a.pa).toFixed(3), bl.obp.toFixed(3));
}
let sPA=0, sHR=0, rPA=0, rHR=0;
for (const a of lg.stats.bat.values()) { sPA += a.pa; sHR += a.hr; }
console.log('league sim HR/PA', (sHR/sPA).toFixed(4), 'PA', sPA);
