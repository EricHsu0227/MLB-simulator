import { setDataBase, loadGlobal } from '../web/js/data.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal();
const { createHistoricLeague } = await import('../web/js/ui/mode_season.js');
const { Sim } = await import('../web/js/engine.js');
const lg = await createHistoricLeague(2019, {});
const exp = new Map();
const orig = Sim.prototype.paProbs;
Sim.prototype.paProbs = function (b, p, bt, out) {
  const r = orig.call(this, b, p, bt, out);
  const k = b.p.name; let e = exp.get(k); if (!e) exp.set(k, e = { n: 0, hr: 0, k: 0, bb: 0, h: 0 });
  e.n++; e.hr += r[6]; e.k += r[0]; e.bb += r[1]; e.h += r[3] + r[4] + r[5] + r[6];
  return r;
};
lg.simAll();
for (const n of ['Jonathan Villar', 'Mike Trout', 'Jose Altuve', 'Pete Alonso']) {
  const e = exp.get(n); const a = [...lg.stats.bat.values()].find(x => x.p.name === n);
  console.log(n, 'PA', e.n, 'expected HR', e.hr.toFixed(1), 'exp HR/PA', (e.hr / e.n).toFixed(4), 'sim HR', a.hr, ' expK', (e.k / e.n).toFixed(3), 'simK', (a.k / a.pa).toFixed(3), 'expH', (e.h / e.n).toFixed(3), 'simH', (a.h / a.pa).toFixed(3), 'statPA', a.pa);
}
