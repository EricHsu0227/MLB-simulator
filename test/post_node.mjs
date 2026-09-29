process.env.POST = '1'; process.env.CUTOFF = '20261001';
const { handle } = await import('./mlbfixture.mjs');
import { setDataBase, loadGlobal, loadSeason, loadJSONGz } from '../web/js/data.js';
import { fetchLive, buildLiveSeason, buildLiveTeam, buildLivePostseason } from '../web/js/live.js';
globalThis.fetch = async (url) => { const j = handle(String(url)); return { ok: !!j, status: j ? 200 : 404, statusText: 'x', json: async () => j }; };
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal();
const prior = await loadSeason(2025);
const idmap = await loadJSONGz(new URL('../data/idmap.json.gz', import.meta.url).pathname);
const live = await fetchLive(2026, () => {});
console.log('errors', live.errors, 'post games', live.post.length, 'regular final', live.schedule.filter(g => g.state === 'Final').length);
const S = buildLiveSeason(live, prior, idmap);
const meta = Object.fromEntries(Object.entries(S.teams).map(([c, t]) => [c, { name: t.n, lg: t.lg, div: t.d }]));
const ps = buildLivePostseason(live, meta);
console.log('real?', ps.hasReal, 'nodes', ps.nodes.length);
for (const n of ps.nodes) { const [a, b] = ps.teams(n); console.log(n.round.padEnd(3), n.label.padEnd(34), (a?.id || 'TBD') + ' v ' + (b?.id || 'TBD'), 'need', n.need, n.actual ? `real ${n.actual.wins.join('-')} ${n.actual.inProgress ? '(in progress)' : 'winner ' + n.actualWinner.id}` : ''); }
import { realSeries } from '../web/js/live.js';
console.log(realSeries(live.post).map(s => `${s.round} ${s.teams.join('/')} wins ${JSON.stringify(s.wins)} need ${s.need} done ${s.done}`).join('\n'));
