import { setDataBase, loadGlobal, loadSeason, makePlayer, baselineRates } from '../web/js/data.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal();
const S = await loadSeason(2019);
const name = process.argv[2] || 'Villar';
for (const [idx, p] of S.players.entries()) if (p.name.includes(name)) {
  const row = S.batRows.get(idx); if (!row || row.n[0] < 300) continue;
  const pl = makePlayer(S, idx, 'AL');
  console.log(p.name, p.bats, 'row', row.n.slice(0, 9).join(','), 'pf', row.pf.join(','));
  console.log(' r', Array.from(pl.bat.r).map(x => x.toFixed(4)).join(' '));
  console.log(' realrates', row.n.slice(1, 9).map(x => (x / row.n[0]).toFixed(4)).join(' '));
}
console.log('base', Array.from(baselineRates(S, 'AL').bat).map(x => x.toFixed(4)).join(' '));
console.log('parks BAL', S.parks[S.teams.BAL.p], S.teams.BAL.p);
