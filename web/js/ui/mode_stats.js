// Stats & logs: every saved game's box score and play-by-play, player stats and game logs, backup/restore.
import { h, clear, select, table, spinner, card, f3, ip, fmtDate, toast, nextFrame } from './common.js';
import { listGames, getGame, deleteGames, getRawLog, putGames, estimate, requestPersistence, kvSet } from '../store.js';
import { aggregate, getUniverses } from '../archive.js';
import { gameDetail } from './gamedetail.js';
import { accountCard } from './account.js';
import { openPlayerCard } from './playercard.js';

const BAT_CATS = [['hr', 'Home runs'], ['rbi', 'RBI'], ['avg', 'Batting average'], ['h', 'Hits'], ['r', 'Runs'], ['sb', 'Stolen bases'], ['ops', 'OPS'], ['obp', 'On-base %'], ['slg', 'Slugging'], ['bb', 'Walks'], ['k', 'Strikeouts']];
const PIT_CATS = [['w', 'Wins'], ['sv', 'Saves'], ['k', 'Strikeouts'], ['era', 'ERA (RA/9)'], ['whip', 'WHIP'], ['ip', 'Innings']];
const KINDS = [['all', 'All games'], ['R', 'Regular season'], ['post', 'Postseason']];

export async function renderStatsMode(root, ctx) {
  const st = ctx.state.stats = ctx.state.stats || { universe: null, kind: 'all', tab: 'leaders', bcat: 'hr', pcat: 'k', q: '', player: null, game: null };
  clear(root);
  const wrap = h('div', { class: 'stack' });
  root.appendChild(wrap);
  wrap.appendChild(spinner('Opening your archive…'));
  const all = await listGames();
  const unis = await getUniverses();
  const counts = {};
  for (const g of all) counts[g.universe] = (counts[g.universe] || 0) + 1;
  const uni = id => (unis[id]?.label) || (id === 'live2026' ? 'Live 2026 season' : id);
  const ids = Object.keys(counts).sort((a, b) => (a === 'live2026' ? -1 : b === 'live2026' ? 1 : (unis[b]?.ts || 0) - (unis[a]?.ts || 0)));
  if (!st.universe || !counts[st.universe]) st.universe = ids[0] || null;

  const draw = async () => {
    clear(wrap);
    wrap.appendChild(h('h2', null, 'Stats & game logs'));
    wrap.appendChild(h('p', { class: 'muted' }, 'Every game you play or sim is saved on this device — full box score and play-by-play — and every player’s stats are built from those games. Sign in to keep them across devices.'));
    wrap.appendChild(accountCard(ctx, () => renderStatsMode(root, ctx)));
    if (!ids.length) { wrap.appendChild(card(null, h('p', null, 'Nothing saved yet. Play or sim a game in any mode and it will show up here.'))); wrap.appendChild(dataTab(all, unis, counts, ids, uni, draw)); return; }
    wrap.appendChild(h('div', { class: 'filters' },
      h('label', null, 'Save ', select(ids.map(i => [i, `${uni(i)} (${counts[i]} games)`]), st.universe, v => { st.universe = v; st.player = null; st.game = null; draw(); })),
      h('label', null, 'Show ', select(KINDS, st.kind, v => { st.kind = v; draw(); }))));
    if (st.game) { const g = await getGame(st.game); wrap.appendChild(h('button', { class: 'btn', onclick: () => { st.game = null; draw(); } }, '‹ Back')); wrap.appendChild(g ? gameDetail(g) : h('p', null, 'Game not found.')); return; }
    const games = all.filter(g => g.universe === st.universe);
    const agg = aggregate(games, st.kind);
    wrap.appendChild(h('div', { class: 'tabs' }, [['leaders', 'Leaders'], ['players', 'Players'], ['games', 'Games'], ['data', 'Data']].map(([k, l]) => h('button', { class: 'tab' + (st.tab === k ? ' on' : ''), onclick: () => { st.tab = k; st.player = null; draw(); } }, l))));
    if (st.tab === 'leaders') wrap.appendChild(leaders(agg, games));
    else if (st.tab === 'players') wrap.appendChild(players(agg, games));
    else if (st.tab === 'games') wrap.appendChild(gamesList(games));
    else wrap.appendChild(dataTab(all, unis, counts, ids, uni, draw));
  };

  const linkName = a => h('td', { class: 'pn' }, h('a', { href: '#/stats', onclick: e => { e.preventDefault(); st.tab = 'players'; st.player = a.key; draw(); } }, a.name));
  function leaders(agg, games) {
    const out = h('div', { class: 'stack' });
    const gp = Math.max(1, ...[...agg.bat.values()].map(a => a.g));
    const teamG = Math.max(1, Math.round(games.length * 2 / Math.max(1, new Set(games.flatMap(g => [g.away.code, g.home.code])).size)));
    out.appendChild(h('div', { class: 'filters' },
      h('label', null, 'Batting ', select(BAT_CATS, st.bcat, v => { st.bcat = v; draw(); })),
      h('label', null, 'Pitching ', select(PIT_CATS, st.pcat, v => { st.pcat = v; draw(); }))));
    const rate = ['avg', 'ops', 'obp', 'slg'].includes(st.bcat);
    const minPA = rate ? Math.max(10, Math.floor(teamG * 3.1 * 0.6)) : 0;
    const bat = [...agg.bat.values()].filter(a => a.pa >= minPA).sort((a, b) => b[st.bcat] - a[st.bcat]).slice(0, 20);
    out.appendChild(card(`Batting leaders${rate ? ` (min ${minPA} PA)` : ''}`, table(['#', 'Player', 'Team', 'G', 'PA', 'AVG', 'OBP', 'SLG', 'HR', 'RBI', 'R', 'SB'], bat.map((a, i) => ({ cells: [i + 1, linkName(a), [...a.teams].join('/'), a.g, a.pa, f3(a.avg), f3(a.obp), f3(a.slg), a.hr, a.rbi, a.r, a.sb] })), 'compact')));
    const lower = ['era', 'whip'].includes(st.pcat);
    const minOuts = lower ? Math.max(9, Math.floor(teamG * 0.5 * 3)) : 0;
    const pit = [...agg.pit.values()].filter(a => a.outs >= minOuts).sort((a, b) => lower ? a[st.pcat] - b[st.pcat] : b[st.pcat] - a[st.pcat]).slice(0, 20);
    out.appendChild(card(`Pitching leaders${lower ? ` (min ${minOuts / 3} IP)` : ''}`, table(['#', 'Player', 'Team', 'G', 'GS', 'W-L', 'SV', 'IP', 'K', 'BB', 'RA/9', 'WHIP'], pit.map((a, i) => ({ cells: [i + 1, linkName(a), [...a.teams].join('/'), a.g, a.gs, `${a.w}-${a.l}`, a.sv, ip(a.outs), a.k, a.bb, a.era.toFixed(2), a.whip.toFixed(2)] })), 'compact')));
    return out;
  }

  function players(agg, games) {
    const out = h('div', { class: 'stack' });
    const box = h('div');
    const input = h('input', { type: 'text', placeholder: 'Search a player…', value: st.q, oninput: e => { st.q = e.target.value; drawList(); } });
    out.appendChild(h('div', { class: 'filters' }, input));
    out.appendChild(box);
    const byId = new Map(games.map(g => [g.id, g]));
    function drawList() {
      clear(box);
      if (st.player) { box.appendChild(playerPage(agg, byId)); return; }
      const q = st.q.trim().toLowerCase();
      const names = new Map();
      for (const a of [...agg.bat.values(), ...agg.pit.values()]) if (!q || a.name.toLowerCase().includes(q)) names.set(a.key, a);
      const rows = [...names.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 80);
      box.appendChild(rows.length ? table(['Player', 'Team', 'Games'], rows.map(a => ({ cls: 'click', cells: [linkName(a), [...a.teams].join('/'), a.g] })), 'compact') : h('p', { class: 'muted' }, 'No players match.'));
    }
    drawList();
    return out;
  }

  function playerPage(agg, byId) {
    const b = agg.bat.get(st.player), p = agg.pit.get(st.player);
    const a = b || p;
    const out = h('div', { class: 'stack' }, h('button', { class: 'btn sm', onclick: () => { st.player = null; draw(); } }, '‹ All players'), h('h3', null, a.name, ' ', h('span', { class: 'muted' }, [...a.teams].join(' / ')), ' ', h('button', { class: 'btn sm primary', onclick: () => openPlayerCard({ y: a.y, id: a.id, name: a.name, S: ctx.state.live?.S && ctx.state.live.S.y === a.y ? ctx.state.live.S : undefined }) }, 'Season stats & Savant')));
    if (b && b.pa) out.appendChild(card('Batting', table(['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'RBI', 'R', 'BB', 'K', 'SB', 'AVG', 'OBP', 'SLG', 'OPS'], [[b.g, b.pa, b.ab, b.h, b.d, b.t, b.hr, b.rbi, b.r, b.bb, b.k, b.sb, f3(b.avg), f3(b.obp), f3(b.slg), f3(b.ops)]], 'compact')));
    if (p && p.bf) out.appendChild(card('Pitching', table(['G', 'GS', 'W-L', 'SV', 'IP', 'H', 'R', 'BB', 'K', 'HR', 'RA/9', 'WHIP', 'K/9'], [[p.g, p.gs, `${p.w}-${p.l}`, p.sv, ip(p.outs), p.h, p.r, p.bb, p.k, p.hr, p.era.toFixed(2), p.whip.toFixed(2), p.k9.toFixed(1)]], 'compact')));
    const ids = new Set([...(b?.games || []), ...(p?.games || [])]);
    const rows = [...ids].map(i => byId.get(i)).filter(Boolean).sort((x, y) => (y.date || 0) - (x.date || 0) || y.ts - x.ts).map(g => {
      const ti = g.batting[0].some(x => x.k === st.player) || g.pitching[0].some(x => x.k === st.player) ? 0 : 1;
      const bl = g.batting[ti].find(x => x.k === st.player), pl = g.pitching[ti].find(x => x.k === st.player);
      const s = bl?.s || {};
      const bat = bl ? `${s.h || 0}-${s.ab || 0}${s.hr ? ', ' + s.hr + ' HR' : ''}${s.rbi ? ', ' + s.rbi + ' RBI' : ''}${s.bb ? ', ' + s.bb + ' BB' : ''}${s.k ? ', ' + s.k + ' K' : ''}` : '';
      const ps = pl?.s || {};
      const pit = pl ? `${ip(ps.outs || 0)} IP, ${ps.h || 0} H, ${ps.r || 0} R, ${ps.k || 0} K` : '';
      const opp = ti === 0 ? `@ ${g.home.code}` : `vs ${g.away.code}`;
      return { cls: 'click', cells: [g.date ? fmtDate(g.date) : new Date(g.ts).toLocaleDateString(), opp, `${g.score[ti]}–${g.score[1 - ti]} ${g.score[ti] > g.score[1 - ti] ? 'W' : 'L'}`, [bat, pit].filter(Boolean).join(' · '), h('td', null, h('button', { class: 'btn sm', onclick: () => { st.game = g.id; draw(); } }, 'Box score'))] };
    });
    out.appendChild(card('Game log', table(['Date', 'Opp', 'Result', 'Line', ''], rows, 'compact')));
    return out;
  }

  function gamesList(games) {
    const out = h('div', { class: 'stack' });
    const rows = games.filter(g => st.kind === 'all' || (st.kind === 'post' ? g.kind !== 'R' : g.kind === st.kind)).slice().sort((a, b) => (b.date || 0) - (a.date || 0) || b.ts - a.ts);
    out.appendChild(h('div', { class: 'muted small' }, `${rows.length} games`));
    out.appendChild(table(['Date', 'Game', 'Score', 'Note', ''], rows.slice(0, 300).map(g => ({ cls: 'click', cells: [g.date ? fmtDate(g.date) : new Date(g.ts).toLocaleDateString(), `${g.away.name} @ ${g.home.name}`, `${g.score[0]}–${g.score[1]}`, g.label, h('td', null, h('button', { class: 'btn sm', onclick: () => { st.game = g.id; draw(); } }, 'Box score & log'))] })), 'compact'));
    return out;
  }
  await draw();
}

function dataTab(all, unis, counts, ids, uni, redraw) {
  const out = h('div', { class: 'stack' });
  const est = h('div', { class: 'muted small' });
  estimate().then(e => { if (e && e.usage != null) est.textContent = `Storage used by this app: ${(e.usage / 1048576).toFixed(1)} MB of ${(e.quota / 1073741824).toFixed(1)} GB available.`; });
  out.appendChild(card('Your data', est,
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn', onclick: async () => { const ok = await requestPersistence(); toast(ok ? 'Storage marked persistent' : 'Browser declined persistent storage'); } }, 'Protect from auto-cleanup'),
      h('button', { class: 'btn', onclick: () => exportData(all, null) }, 'Export everything (JSON)'),
      h('label', { class: 'btn' }, 'Import backup…', h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: e => importData(e.target.files[0], redraw) })))));
  if (ids.length) out.appendChild(card('Saves', table(['Save', 'Games', ''], ids.map(i => [uni(i), counts[i], h('td', null,
    h('button', { class: 'btn sm', onclick: () => exportData(all, i) }, 'Export'), ' ',
    h('button', { class: 'btn sm', onclick: async () => { if (confirm(`Delete all ${counts[i]} games in "${uni(i)}"?`)) { await deleteGames(all.filter(g => g.universe === i).map(g => g.id)); location.reload(); } } }, 'Delete'))]), 'compact')));
  return out;
}

async function exportData(all, universe) {
  const games = all.filter(g => !universe || g.universe === universe);
  const out = [];
  for (const g of games) out.push({ rec: g, log: await getRawLog(g.id) });
  const blob = new Blob([JSON.stringify({ app: 'diamond-sim', v: 1, games: out })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `diamond-sim-${universe || 'all'}-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function importData(file, redraw) {
  if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    if (j.app !== 'diamond-sim') throw new Error('Not a Diamond Sim backup');
    await putGames(j.games.map(x => ({ rec: { ...x.rec, synced: false }, log: x.log || undefined })));
    toast(`Imported ${j.games.length} games`); redraw();
  } catch (e) { toast('Import failed: ' + e.message); }
}
