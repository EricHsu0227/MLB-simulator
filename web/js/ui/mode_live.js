// Live season mode: follow the real season as it unfolds and play/sim any game.
import { h, clear, select, table, spinner, card, f3, nextFrame, toast, fmtDate } from './common.js';
import { loadSeason, loadJSONGz } from '../data.js';
import { Sim } from '../engine.js';
import { buildTeam } from '../teams.js';
import { GameView, teamLabel } from './gameview.js';
import { fetchLive, saveLive, loadSavedLive, loadResults, saveResult, clearResults, buildLiveSeason, buildLiveTeam, liveGameTeams, standingsFrom, projectSeason, buildLivePostseason, MLB_TEAM } from '../live.js';
import { PostseasonView } from './postview.js';
import { archiveGame, registerUniverse, universeGames } from '../archive.js';

const YEAR = 2026;
const UNI = 'live2026';
const DIVN = { E: 'East', C: 'Central', W: 'West' };
const STALE_MS = 20 * 60 * 1000;

function todayNum() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function shiftDate(n, delta) {
  const d = new Date(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100 + delta);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
const inputDate = n => `${Math.floor(n / 10000)}-${String(Math.floor(n / 100) % 100).padStart(2, '0')}-${String(n % 100).padStart(2, '0')}`;

export async function renderLiveMode(root, ctx) {
  const st = ctx.state.live = ctx.state.live || { tab: 'games', date: null, live: null, S: null, prior: null, idmap: null, proj: null };
  clear(root);
  const wrap = h('div', { class: 'stack' });
  root.appendChild(wrap);
  const head = h('div'), body = h('div');
  wrap.append(head, body);
  body.appendChild(spinner('Starting up…'));

  // ------------------------------------------------------------ data
  async function ensurePrior() {
    if (!st.prior) st.prior = await loadSeason(YEAR - 1);
    if (!st.idmap) st.idmap = await loadJSONGz('data/idmap.json.gz');
  }
  async function refresh(force) {
    let live = st.live || loadSavedLive(YEAR);
    const stale = !live || force || (Date.now() - live.fetchedAt > STALE_MS);
    if (stale) {
      clear(body); const msg = h('span', null, 'Contacting the MLB Stats API…');
      body.appendChild(h('div', { class: 'spin' }, h('span', { class: 'dot' }), msg));
      await nextFrame();
      const fresh = await fetchLive(YEAR, m => { msg.textContent = m; });
      // keep older data for parts that failed this time
      if (live && fresh.flags.stats === 'none' && live.flags.stats === 'mlb') { fresh.hit = live.hit; fresh.pit = live.pit; fresh.flags.stats = live.flags.stats; }
      if (live && fresh.flags.rosters === 'none' && live.flags.rosters === 'mlb') { fresh.roster = live.roster; fresh.people = live.people; fresh.flags.rosters = 'mlb'; }
      if (live && fresh.flags.schedule === 'bundled' && live.flags.schedule === 'mlb') { fresh.schedule = live.schedule; fresh.flags.schedule = 'mlb'; }
      live = fresh; saveLive(live);
    }
    st.live = live;
    await ensurePrior();
    st.useLive = live.flags.stats === 'mlb' && live.flags.rosters === 'mlb';
    st.S = st.useLive ? buildLiveSeason(live, st.prior, st.idmap) : null;
    st.teamCache = new Map();
    st.ps = null; st.psView = null;
    st.meta = {};
    const src = st.S || st.prior;
    for (const c of Object.keys(MLB_TEAM).map(k => MLB_TEAM[k])) { const t = src.teams[c] || {}; st.meta[c] = { name: live.teams[c]?.name || t.n || c, lg: live.teams[c]?.lg || t.lg, div: live.teams[c]?.div || t.d || '' }; }
    if (!st.date) {
      const days = live.schedule.concat(live.post || []).map(g => g.date);
      const lo = Math.min(...days), hi = Math.max(...days), t = todayNum();
      st.date = t < lo ? lo : t > hi ? hi : t;
    }
  }
  function teamFor(code) {
    if (st.teamCache.has(code)) return st.teamCache.get(code);
    let t;
    if (st.useLive) t = buildLiveTeam(st.S, code, st.live);
    else { t = buildTeam(st.prior, code); t.name = st.meta[code].name; }
    st.teamCache.set(code, t);
    return t;
  }
  async function teamsForGame(g, useFeed = false) {
    if (st.useLive) { const r = await liveGameTeams(st.S, st.live, g, { useFeed }); return { away: r.away, home: r.home, note: r.feedUsed ? 'Using the lineups posted for this game.' : '' }; }
    // fallback: 2025 ratings, starters rotate through the team's schedule
    const n = code => st.live.schedule.filter(x => (x.away === code || x.home === code) && (x.date < g.date || (x.date === g.date && x.pk < g.pk))).length;
    const mk = code => { const t = Object.assign({}, teamFor(code)); const rot = t.rotation; t.sp = rot[n(code) % rot.length]; t.lineup = t.lineup.map(x => (x.pos === 1 ? { p: t.sp, pos: 1 } : x)); t.dh = true; return t; };
    return { away: mk(g.away), home: mk(g.home), note: '' };
  }

  // ------------------------------------------------------------ header
  function drawHead() {
    clear(head);
    const live = st.live;
    const f = live.flags;
    const when = new Date(live.fetchedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const chip = (ok, text) => h('span', { class: 'pill ' + (ok ? 'ok' : 'warn') }, text);
    head.append(...[
      h('div', { class: 'row between wrap' },
        h('div', null, h('h2', null, `Live ${YEAR} season`), h('div', { class: 'muted' }, 'Follow the real season and play or sim any game — before it happens or after.')),
        h('button', { class: 'btn', onclick: async () => { await refresh(true); drawHead(); draw(); } }, '↻ Refresh from MLB')),
      h('div', { class: 'pills' },
        chip(f.schedule === 'mlb', f.schedule === 'mlb' ? 'Schedule & scores: MLB (live)' : 'Schedule: bundled (no live scores)'),
        chip(st.useLive, st.useLive ? `Player stats: ${YEAR} to date, blended with ${YEAR - 1} tendencies` : `Ratings: ${YEAR - 1} (live stats unavailable)`),
        h('span', { class: 'pill' }, `Updated ${when}`)),
      live.errors.length ? h('details', { class: 'small muted' }, h('summary', null, `${live.errors.length} data note${live.errors.length > 1 ? 's' : ''}`), h('ul', null, live.errors.map(e => h('li', null, e)))) : null,
      !st.useLive ? h('p', { class: 'small muted' }, 'The live MLB feed could not be reached from this browser, so the app is using the bundled schedule and last season’s player ratings. Tap Refresh once you’re online.') : null,
      h('div', { class: 'row wrap' }, h('a', { class: 'btn sm', href: '#/stats' }, '📊 Stats & game logs')),
      h('div', { class: 'tabs' }, [['games', 'Games'], ['post', 'Postseason'], ['standings', 'Standings'], ['proj', 'Projection'], ['mine', 'My sims'], ['teams', 'Teams']].map(([k, l]) => h('button', { class: 'tab' + (st.tab === k ? ' on' : ''), onclick: () => { st.tab = k; drawHead(); draw(); } }, l)))].filter(Boolean));
  }

  // ------------------------------------------------------------ games tab
  function gamesTab() {
    const live = st.live, results = loadResults(YEAR);
    const every = live.schedule.concat(live.post || []);
    const days = [...new Set(every.map(g => g.date))].sort((a, b) => a - b);
    const lo = days[0], hi = days[days.length - 1];
    const day = every.filter(g => g.date === st.date).sort((a, b) => (a.dt || '').localeCompare(b.dt || '') || String(a.pk).localeCompare(String(b.pk)));
    const out = h('div', { class: 'stack' });
    const nav = h('div', { class: 'row wrap datenav' },
      h('button', { class: 'btn', onclick: () => { st.date = shiftDate(st.date, -1); draw(); } }, '‹'),
      h('input', { type: 'date', value: inputDate(st.date), min: inputDate(lo), max: inputDate(hi), onchange: e => { if (e.target.value) { st.date = +e.target.value.replace(/-/g, ''); draw(); } } }),
      h('button', { class: 'btn', onclick: () => { st.date = shiftDate(st.date, 1); draw(); } }, '›'),
      h('button', { class: 'btn sm', onclick: () => { const t = todayNum(); st.date = t < lo ? lo : t > hi ? hi : t; draw(); } }, 'Today'),
      h('span', { class: 'muted' }, fmtDate(st.date)),
      day.length ? h('button', { class: 'btn primary', onclick: () => simDay(day) }, `Sim all ${day.length} games`) : null);
    out.appendChild(nav);
    if (!day.length) { out.appendChild(h('p', { class: 'muted' }, 'No games scheduled this day.')); return out; }
    const list = h('div', { class: 'games' });
    for (const g of day) list.appendChild(gameCard(g, results[g.pk]));
    out.appendChild(list);
    return out;
  }

  function gameCard(g, mine) {
    const nm = c => st.meta[c].name;
    const final = g.state === 'Final' && g.as !== null;
    const live = g.state === 'Live';
    const time = g.dt ? new Date(g.dt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    const status = final ? h('span', { class: 'pill ok' }, 'Final') : live ? h('span', { class: 'pill live' }, 'Live') : /postponed|cancel|suspended/i.test(g.detail) ? h('span', { class: 'pill warn' }, g.detail) : h('span', { class: 'pill' }, time || 'Scheduled');
    const pp = (p) => p ? p.name : 'TBD';
    const line = (c, score, pp0, win) => h('div', { class: 'gline' + (win ? ' win' : '') }, h('span', { class: 'gname' }, nm(c)), h('span', { class: 'gpp muted small' }, pp0 ? pp0 : ''), h('b', { class: 'gscore' }, score ?? ''));
    const card = h('div', { class: 'gamecard' },
      h('div', { class: 'row between' }, status, g.gt && g.gt !== 'R' ? h('span', { class: 'pill live' }, (g.series || 'Postseason') + (g.sgn ? ` · G${g.sgn}` : '')) : (g.venue ? h('span', { class: 'muted small' }, g.venue) : null)),
      line(g.away, final || live ? g.as : '', g.app ? 'SP ' + pp(g.app) : '', final && g.as > g.hs),
      line(g.home, final || live ? g.hs : '', g.hpp ? 'SP ' + pp(g.hpp) : '', final && g.hs > g.as));
    if (mine) {
      const simWin = mine.hs > mine.as ? g.home : g.away;
      let cmp = '';
      if (final) cmp = (mine.hs > mine.as) === (g.hs > g.as) ? '  ✓ you called the winner' : '  ✗ different winner';
      card.appendChild(h('div', { class: 'mine' }, `Your sim: ${nm(g.away)} ${mine.as}, ${nm(g.home)} ${mine.hs}`, h('span', { class: 'muted' }, cmp)));
    }
    card.appendChild(h('div', { class: 'btnrow' },
      h('button', { class: 'btn sm primary', onclick: () => playGame(g) }, mine ? 'Play again' : 'Play it'),
      h('button', { class: 'btn sm', onclick: async () => { await quickSim(g); toast('Simmed and saved'); draw(); } }, 'Quick sim'),
      mine ? h('button', { class: 'btn sm', onclick: () => { ctx.state.stats = { ...(ctx.state.stats || {}), universe: UNI, game: `${UNI}:${g.pk}`, tab: 'games', kind: 'all' }; location.hash = '#/stats'; } }, 'Box score & log') : null));
    return card;
  }

  async function makeSim(g, seed, useFeed = false) {
    const t = await teamsForGame(g, useFeed);
    const sim = new Sim(t.away, t.home, { seed, dh: true, method: ctx.state.method || 'odds', ghost: true, script: null, mgr: { 0: 'auto', 1: 'auto' } });
    return { sim, t };
  }
  async function quickSim(g) {
    const { sim } = await makeSim(g);
    const r = sim.playGame();
    saveResult(YEAR, g.pk, { as: r.score[0], hs: r.score[1], away: g.away, home: g.home, date: g.date, ts: Date.now() });
    archiveGame(r.sim, archiveMetaFor(g));
  }
  function archiveMetaFor(g) { registerUniverse(UNI, 'Live 2026 season'); return { universe: UNI, key: g.pk, kind: g.gt && g.gt !== 'R' ? 'post' : 'R', date: g.date, label: g.gt && g.gt !== 'R' ? `${g.series || 'Postseason'} G${g.sgn || ''}` : `${YEAR} season` }; }
  async function simDay(day) {
    for (const g of day) { await quickSim(g); await nextFrame(); }
    toast(`Simmed ${day.length} games`); draw();
  }
  async function playGame(g) {
    clear(body); body.appendChild(spinner('Loading lineups…'));
    await nextFrame();
    const { sim, t } = await makeSim(g, undefined, true);
    const gv = new GameView(sim, {
      title: `${st.meta[g.away].name} at ${st.meta[g.home].name}`,
      subtitle: `${fmtDate(g.date)} · ${g.venue || ''}${t.note ? ' · ' + t.note : ''}`,
      continueLabel: 'Back to games',
      archive: archiveMetaFor(g),
      onFinish: r => saveResult(YEAR, g.pk, { as: r.score[0], hs: r.score[1], away: g.away, home: g.home, date: g.date, ts: Date.now() }),
      onContinue: () => { drawHead(); draw(); },
    });
    clear(body);
    body.appendChild(h('div', { class: 'stack' }, h('button', { class: 'btn', onclick: () => { gv.destroy(); draw(); } }, '‹ Games'), gv.root));
  }

  // ------------------------------------------------------------ postseason
  function postTab() {
    const out = h('div', { class: 'stack' });
    if (!st.ps) {
      st.ps = buildLivePostseason(st.live, st.meta);
      st.psView = null;
    }
    const ps = st.ps;
    const prepare = (node, entry, gameNo, opp, isHome) => {
      const base = teamFor(entry.code);
      const t = Object.assign({}, base);
      const rot = base.rotation.length ? base.rotation.slice(0, 4) : [base.sp];
      // the real probable pitcher for this game number, when MLB has named one
      const rg = node.realGames && node.realGames[gameNo];
      let sp = rot[gameNo % rot.length];
      if (rg && st.useLive) {
        const pp = rg.home === entry.code ? rg.hpp : rg.away === entry.code ? rg.app : null;
        if (pp) { const idx = st.S.mlbIdx.get(pp.id); if (idx !== undefined) sp = base.P(idx); }
      }
      t.sp = sp;
      t.lineup = base.lineup.map(x => (x.pos === 1 ? { p: sp, pos: 1 } : x));
      t.bullpen = base.bullpen.filter(p => p !== sp);
      t.dh = true;
      return t;
    };
    const nodeKey = n => { const [a, b] = ps.teams(n); return a && b ? `${n.round}:${[a.id, b.id].sort().join('-')}` : null; };
    if (!st.psView) {
      st.psView = new PostseasonView(ps, {
        title: `${YEAR} postseason`, historic: true, prepare, simOpts: { method: ctx.state.method || 'odds' },
        note: ps.hasReal ? 'Real matchups and results from MLB are shown. Play any series game by game or sim it — winners carry forward. Rosters refresh whenever you tap Refresh.' : 'MLB hasn’t set the bracket yet, so this is projected from today’s standings (top 3 division winners + 3 wild cards per league). Once the real series exist they replace it automatically.',
        archiveMeta: (node, pg) => { registerUniverse(UNI, 'Live 2026 season'); return { universe: UNI, key: `PS:${nodeKey(node)}:G${pg.gameNo + 1}`, kind: 'post', label: `${node.label} G${pg.gameNo + 1}`, extra: { homeCode: pg.homeE.id, nodeKey: nodeKey(node), gameNo: pg.gameNo + 1 } }; },
      });
      restorePost(ps, nodeKey).then(() => st.psView && st.psView.render());
    }
    out.appendChild(st.psView.root);
    return out;
  }
  /** Rebuild sim series state from games already saved in the archive. */
  async function restorePost(ps, nodeKey) {
    const games = (await universeGames(UNI)).filter(g => g.kind === 'post' && g.extra && g.extra.nodeKey);
    if (!games.length) return;
    let progressed = true, guard = 0;
    while (progressed && guard++ < 20) {
      progressed = false;
      for (const n of ps.nodes) {
        if (n.winner || !ps.isReady(n)) continue;
        const key = nodeKey(n); if (!key) continue;
        const gs = games.filter(g => g.extra.nodeKey === key).sort((a, b) => a.extra.gameNo - b.extra.gameNo);
        if (!gs.length) continue;
        const series = ps.ensureSeries(n);
        for (const g of gs) {
          if (series.over) break;
          const homeIdx = g.extra.homeCode === series.hi.id ? 0 : 1;
          series.record(g.score[1], g.score[0], homeIdx);
        }
        if (series.over) { ps.finish(n); progressed = true; }
      }
    }
  }

  // ------------------------------------------------------------ standings
  function standingsTab() {
    const rec = standingsFrom(st.live.schedule, st.meta);
    const out = h('div', { class: 'stand' });
    const proj = st.proj;
    for (const lg of ['AL', 'NL']) for (const d of ['E', 'C', 'W']) {
      const rows = Object.keys(st.meta).filter(c => st.meta[c].lg === lg && st.meta[c].div === d).map(c => rec[c]).sort((a, b) => (b.w / Math.max(1, b.w + b.l)) - (a.w / Math.max(1, a.w + a.l)) || (b.rs - b.ra) - (a.rs - a.ra));
      if (!rows.length) continue;
      const lead = rows[0];
      out.appendChild(card(`${lg} ${DIVN[d]}`, table(['Team', 'W', 'L', 'PCT', 'GB', 'Diff', ...(proj ? ['Proj W', 'Playoffs'] : [])], rows.map((r, i) => {
        const p = proj?.[r.code];
        return { cls: i === 0 ? 'lead' : '', cells: [h('td', { class: 'pn' }, st.meta[r.code].name), r.w, r.l, (r.w + r.l ? (r.w / (r.w + r.l)).toFixed(3).replace(/^0/, '') : '.000'), i ? (((lead.w - r.w) + (r.l - lead.l)) / 2).toFixed(1) : '—', (r.rs - r.ra > 0 ? '+' : '') + (r.rs - r.ra), ...(proj ? [p ? p.w.toFixed(1) : '', p ? Math.round(p.po * 100) + '%' : ''] : [])] };
      }), 'compact')));
    }
    const played = st.live.schedule.filter(g => g.state === 'Final').length;
    return h('div', { class: 'stack' }, h('div', { class: 'muted small' }, `${played.toLocaleString()} of ${st.live.schedule.length.toLocaleString()} games final`), out);
  }

  // ------------------------------------------------------------ projection
  function projTab() {
    const out = h('div', { class: 'stack' });
    const n = st.projN || 30;
    const remaining = st.live.schedule.filter(g => g.state !== 'Final').length;
    const bar = h('div', { class: 'bar' }, h('i', { style: 'width:0%' }));
    const status = h('div', { class: 'muted small' });
    out.appendChild(card('Project the rest of the season',
      h('p', { class: 'muted' }, `Starts from the real standings and simulates the ${remaining.toLocaleString()} unplayed games ${n} times with current rosters.`),
      h('div', { class: 'filters' },
        h('label', null, 'Simulations ', select([10, 30, 100, 300].map(x => [x, x]), n, v => { st.projN = +v; })),
        h('button', { class: 'btn primary', onclick: async e => {
          e.target.disabled = true; status.textContent = 'Simulating…';
          const t0 = performance.now();
          st.proj = await projectSeason(teamFor, st.meta, st.live.schedule, st.projN || 30, p => { bar.firstChild.style.width = (p * 100).toFixed(0) + '%'; });
          status.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)}s`;
          draw();
        } }, 'Run projection')), bar, status));
    if (st.proj) {
      const rows = Object.keys(st.meta).map(c => ({ c, ...st.proj[c] })).sort((a, b) => b.po - a.po || b.w - a.w);
      out.appendChild(card('Projected finish', table(['Team', 'Now', 'Proj W-L', 'Div %', 'WC %', 'Playoffs %', 'Best in lg %'], rows.map(r => [st.meta[r.c].name, `${r.cur.w}-${r.cur.l}`, `${r.w.toFixed(1)}-${r.l.toFixed(1)}`, Math.round(r.div * 100) + '%', Math.round(r.wc * 100) + '%', Math.round(r.po * 100) + '%', Math.round(r.best * 100) + '%']), 'compact')));
    }
    return out;
  }

  // ------------------------------------------------------------ my sims
  function mineTab() {
    const results = loadResults(YEAR);
    const byPk = new Map(st.live.schedule.map(g => [String(g.pk), g]));
    const rows = Object.entries(results).map(([pk, r]) => ({ pk, r, g: byPk.get(pk) })).sort((a, b) => b.r.ts - a.r.ts);
    const out = h('div', { class: 'stack' });
    if (!rows.length) { out.appendChild(h('p', { class: 'muted' }, 'You haven’t simmed any real games yet. Open the Games tab and hit Play it or Quick sim.')); return out; }
    let both = 0, hit = 0, exact = 0, err = 0;
    for (const { r, g } of rows) if (g && g.state === 'Final' && g.as !== null) { both++; if ((r.hs > r.as) === (g.hs > g.as)) hit++; if (r.hs === g.hs && r.as === g.as) exact++; err += Math.abs((r.hs + r.as) - (g.hs + g.as)); }
    out.appendChild(card('Your sims vs. reality', h('p', null, both ? `Of ${both} games that have since been played, your sim picked the winner in ${hit} (${Math.round(hit / both * 100)}%), matched the exact score ${exact}×, and missed total runs by ${(err / both).toFixed(1)} on average.` : 'None of your simmed games have been played for real yet — check back after they finish (tap Refresh).'),
      h('button', { class: 'btn sm', onclick: () => { if (confirm('Delete all your saved sims?')) { clearResults(YEAR); draw(); } } }, 'Clear my sims')));
    out.appendChild(card(null, table(['Date', 'Game', 'Your sim', 'Real', ''], rows.slice(0, 200).map(({ r, g }) => {
      const final = g && g.state === 'Final' && g.as !== null;
      return [fmtDate(r.date), `${st.meta[r.away].name} @ ${st.meta[r.home].name}`, `${r.as}–${r.hs}`, final ? `${g.as}–${g.hs}` : 'not played', final ? ((r.hs > r.as) === (g.hs > g.as) ? '✓' : '✗') : ''];
    }), 'compact')));
    return out;
  }

  // ------------------------------------------------------------ teams
  function teamsTab() {
    const code = st.teamSel || 'NYA';
    const out = h('div', { class: 'stack' });
    out.appendChild(h('div', { class: 'filters' }, h('label', null, 'Team ', select(Object.keys(st.meta).sort((a, b) => st.meta[a].name.localeCompare(st.meta[b].name)).map(c => [c, st.meta[c].name]), code, v => { st.teamSel = v; draw(); }))));
    const t = teamFor(code);
    const pos = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH' };
    out.appendChild(card(`${st.meta[code].name} — projected lineup`, table(['#', 'Player', 'Pos', 'B', 'wOBA rating'], t.lineup.map((x, i) => [i + 1, x.p.name, pos[x.pos], x.p.bats, f3(x.p.bat.woba)]), 'compact')));
    out.appendChild(card('Rotation', table(['Pitcher', 'T', 'wOBA against'], t.rotation.map(p => [p.name, p.throws, f3(p.pit.wobaAgainst)]), 'compact')));
    out.appendChild(card('Bullpen', table(['Pitcher', 'Role', 'T', 'wOBA against'], t.bullpen.map(p => [p.name, p.role, p.throws, f3(p.pit.wobaAgainst)]), 'compact')));
    return out;
  }

  function draw() {
    clear(body);
    const tab = { games: gamesTab, post: postTab, standings: standingsTab, proj: projTab, mine: mineTab, teams: teamsTab }[st.tab] || gamesTab;
    body.appendChild(tab());
  }

  try {
    await refresh(false);
    drawHead(); draw();
  } catch (e) {
    console.error(e);
    clear(body);
    body.appendChild(h('div', { class: 'card warn' }, h('h3', null, 'Could not start live mode'), h('p', null, e.message)));
  }
}
