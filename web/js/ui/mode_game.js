// Mode 1: play any historical game with as-played lineups, real roster and substitutions.
import { h, clear, select, table, spinner, card, fmtDate, ip, POS, nextFrame } from './common.js';
import { loadSeason } from '../data.js';
import { Sim } from '../engine.js';
import { realGameTeam } from '../teams.js';
import { GameView, teamLabel } from './gameview.js';
import { registerUniverse } from '../archive.js';

const TYPES = [['R', 'Regular season'], ['post', 'Postseason'], ['AS', 'All-Star Game'], ['all', 'All games']];
const ROUND = { WC: 'Wild Card', DV: 'Division Series', LC: 'LCS', WS: 'World Series', AS: 'All-Star Game', R: '' };

export function realSubsText(S, g) {
  const players = idx => S.players[idx]?.name || '?';
  const out = [[], []];
  for (let ti = 0; ti < 2; ti++) {
    const bat = (ti === 0 ? g.vb : g.hb).map(([idx, pos]) => ({ idx, pos }));
    let pitcher = ti === 0 ? g.vsp : g.hsp;
    for (const s of g.subs) {
      if (s[0] !== ti) continue;
      const [, pidx, slot, pos, inn, half, pa] = s;
      const when = `${half === 0 ? 'Top' : 'Bot'} ${inn}`;
      let txt;
      if (pos === 1) {
        txt = `${players(pidx)} relieves ${players(pitcher)}`;
        pitcher = pidx;
        if (slot >= 1 && bat[slot - 1]) bat[slot - 1] = { idx: pidx, pos: 1 };
      } else if (slot >= 1 && bat[slot - 1]) {
        const old = bat[slot - 1];
        if (pos === 11) txt = `${players(pidx)} pinch-hits for ${players(old.idx)}`;
        else if (pos === 12) txt = `${players(pidx)} pinch-runs for ${players(old.idx)}`;
        else if (old.idx === pidx) txt = `${players(pidx)} moves to ${POS[pos] || pos}`;
        else txt = `${players(pidx)} replaces ${players(old.idx)} at ${POS[pos] || pos}`;
        bat[slot - 1] = { idx: pidx, pos };
      } else txt = `${players(pidx)} enters (${POS[pos] || pos})`;
      out[ti].push({ when, txt, inn, half });
    }
  }
  return out;
}

export function realGamePanel(S, g) {
  const name = i => S.players[i]?.name || '?';
  const wrap = h('div', { class: 'realgame' });
  const dec = g.dec || [];
  wrap.appendChild(h('div', { class: 'muted' },
    `As played: ${g.vis} ${g.vs}, ${g.home} ${g.hs}` + (g.outs && g.outs !== 54 && g.outs !== 51 && g.outs !== 53 ? ` (${Math.ceil(g.outs / 6)} inn.)` : ''),
    dec[0] >= 0 ? `  ·  W: ${name(dec[0])}` : '', dec[1] >= 0 ? `  ·  L: ${name(dec[1])}` : '', dec[2] >= 0 ? `  ·  SV: ${name(dec[2])}` : ''));
  if (g.src === 'g') wrap.appendChild(h('p', { class: 'warn' }, 'Only the starting lineups survive for this game (no play-by-play or box score data), so there are no real substitutions to show.'));
  else if (g.src === 'b') wrap.appendChild(h('p', { class: 'muted small' }, 'This game comes from a box score only; the timing of substitutions is estimated from innings played.'));
  const subs = realSubsText(S, g);
  const cols = h('div', { class: 'box2' });
  for (let ti = 0; ti < 2; ti++) {
    const code = ti === 0 ? g.vis : g.home;
    const pl = g.pl.filter(p => p[0] === ti);
    const col = h('div', { class: 'boxteam' }, h('h4', null, `${S.teams[code]?.n || code} — bullpen use & substitutions (as played)`));
    if (pl.length) col.appendChild(table(['Pitcher', 'IP', 'H', 'R', 'ER', 'BB', 'K', 'BF', 'In'], pl.map(p => [name(p[1]), ip(p[2]), p[4], p[5], p[6], p[7], p[8], p[3], p[9] ? p[9] + (p[9] === 1 ? 'st' : '') : '']), 'compact'));
    if (subs[ti].length) col.appendChild(h('ul', { class: 'sublist' }, subs[ti].map(s => h('li', null, h('b', null, s.when), ' — ', s.txt))));
    else col.appendChild(h('p', { class: 'muted small' }, 'No substitutions recorded.'));
    cols.appendChild(col);
  }
  wrap.appendChild(cols);
  return wrap;
}

export async function renderGameMode(root, ctx) {
  const { index } = ctx;
  const years = index.years;
  const st = ctx.state.game = ctx.state.game || { year: 1927, type: 'R', team: '', month: '', page: 0 };
  clear(root);
  const top = h('div', { class: 'stack' });
  root.appendChild(top);
  top.appendChild(h('h2', null, 'Play any game in MLB history'));
  top.appendChild(h('p', { class: 'muted' }, 'Pick a season and a game. You get the as-played lineups, the starting pitchers, the roster that team used around that date, and the real bullpen usage and substitutions to compare against. Then play it — with the real substitutions, an auto-manager, or your own moves.'));
  const filt = h('div', { class: 'filters' });
  const list = h('div', { class: 'gamelist' });
  top.appendChild(filt); top.appendChild(list);

  let S = null;
  async function loadYear() {
    clear(list); list.appendChild(spinner(`Loading ${st.year}…`));
    await nextFrame();
    S = await loadSeason(st.year);
    drawFilters(); drawList();
  }
  function drawFilters() {
    clear(filt);
    const teams = Object.entries(index.seasons[st.year].teams).filter(([c, t]) => c !== 'ALS' && c !== 'NLS').sort((a, b) => a[1].n.localeCompare(b[1].n));
    filt.append(
      h('label', null, 'Season ', select(years.slice().reverse().map(y => [y, y]), st.year, v => { st.year = +v; st.page = 0; st.team = ''; loadYear(); })),
      h('label', null, 'Games ', select(TYPES, st.type, v => { st.type = v; st.page = 0; drawList(); })),
      h('label', null, 'Team ', select([['', 'All teams'], ...teams.map(([c, t]) => [c, t.n])], st.team, v => { st.team = v; st.page = 0; drawList(); })),
      h('label', null, 'Month ', select([['', 'Any'], ...[3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => [m, ['', '', '', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'][m]])], st.month, v => { st.month = v; st.page = 0; drawList(); })));
  }
  function filtered() {
    return S.games.filter(g => {
      if (st.type === 'R' && g.type !== 'R') return false;
      if (st.type === 'post' && !['WC', 'DV', 'LC', 'WS'].includes(g.type)) return false;
      if (st.type === 'AS' && g.type !== 'AS') return false;
      if (st.team && g.vis !== st.team && g.home !== st.team) return false;
      if (st.month && Math.floor(g.date / 100) % 100 !== +st.month) return false;
      return true;
    });
  }
  function drawList() {
    clear(list);
    const all = filtered();
    const per = 60;
    const pages = Math.max(1, Math.ceil(all.length / per));
    st.page = Math.min(st.page, pages - 1);
    const slice = all.slice(st.page * per, st.page * per + per);
    list.appendChild(h('div', { class: 'muted small' }, `${all.length.toLocaleString()} games`));
    const nm = c => S.teams[c]?.n || c;
    const rows = slice.map(g => h('tr', { class: 'click', onclick: () => openGame(g) },
      h('td', null, fmtDate(g.date) + (g.num ? ` (G${g.num})` : '')),
      h('td', null, nm(g.vis)), h('td', { class: 'num' }, g.vs),
      h('td', null, nm(g.home)), h('td', { class: 'num' }, g.hs),
      h('td', { class: 'muted small' }, (ROUND[g.type] ? ROUND[g.type] + ' · ' : '') + (ctx.G.parks[g.park]?.n || g.park) + (g.src === 'g' ? ' · lineup only' : g.src === 'b' ? ' · box score' : '')),
      h('td', null, h('button', { class: 'btn sm primary', onclick: e => { e.stopPropagation(); openGame(g); } }, 'Open'))));
    list.appendChild(h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Date', 'Away', '', 'Home', '', 'Park / notes', ''].map(x => h('th', null, x)))),
      h('tbody', null, rows))));
    list.appendChild(h('div', { class: 'pager' },
      h('button', { class: 'btn sm', disabled: st.page === 0, onclick: () => { st.page--; drawList(); } }, '‹ Prev'),
      h('span', null, ` Page ${st.page + 1} / ${pages} `),
      h('button', { class: 'btn sm', disabled: st.page >= pages - 1, onclick: () => { st.page++; drawList(); } }, 'Next ›')));
  }

  function openGame(g) {
    clear(root);
    const back = h('button', { class: 'btn', onclick: () => renderGameMode(root, ctx) }, '‹ All games');
    const A = realGameTeam(S, g, 0), H = realGameTeam(S, g, 1);
    const hasScript = g.subs.length > 0;
    const setup = { mgrA: hasScript ? 'script' : 'auto', mgrH: hasScript ? 'script' : 'auto', method: ctx.state.method || 'odds', seed: '' };
    const wrap = h('div', { class: 'stack' }, back, h('h2', null, `${fmtDate(g.date)} — ${S.teams[g.vis]?.n || g.vis} at ${S.teams[g.home]?.n || g.home}`));
    const mgrOpts = t => hasScript ? [['script', 'Real substitutions (as played)'], ['auto', 'Auto-manager'], ['manual', 'I manage']] : [['auto', 'Auto-manager'], ['manual', 'I manage']];
    const lineupCard = ti => {
      const t = ti === 0 ? A : H;
      const bat = ti === 0 ? g.vb : g.hb;
      const spIdx = ti === 0 ? g.vsp : g.hsp;
      return h('div', { class: 'boxteam' }, h('h4', null, `${teamLabel(t)} ${ti === 0 ? '(away)' : '(home)'}`),
        table(['#', 'Player', 'Pos', 'Bats'], bat.map(([idx, pos], i) => [i + 1, S.players[idx].name, POS[pos] || pos, S.players[idx].bats]), 'compact'),
        h('div', { class: 'muted small' }, 'Starting pitcher: ', h('b', null, spIdx >= 0 ? S.players[spIdx].name : '?')),
        h('details', null, h('summary', null, `Active roster (approx.): ${t.bench.length} bench · ${t.bullpen.length} pitchers`),
          h('p', { class: 'small' }, h('b', null, 'Bench: '), t.bench.map(p => p.name).join(', ') || '—'),
          h('p', { class: 'small' }, h('b', null, 'Bullpen: '), t.bullpen.map(p => p.name).join(', ') || '—')));
    };
    const opts = h('div', { class: 'card' },
      h('div', { class: 'filters' },
        h('label', null, `${g.vis} manager `, select(mgrOpts(), setup.mgrA, v => setup.mgrA = v)),
        h('label', null, `${g.home} manager `, select(mgrOpts(), setup.mgrH, v => setup.mgrH = v)),
        h('label', null, 'PA model ', select([['odds', 'Odds-ratio (log5)'], ['avg', 'Straight average']], setup.method, v => { setup.method = v; ctx.state.method = v; })),
        h('label', null, 'Seed ', h('input', { type: 'text', size: 8, placeholder: 'random', oninput: e => setup.seed = e.target.value })),
        h('button', { class: 'btn primary big', onclick: () => start() }, '⚾ Play ball')));
    wrap.append(h('div', { class: 'box2' }, lineupCard(0), lineupCard(1)), opts, card('What really happened', realGamePanel(S, g)));
    root.appendChild(wrap);

    function start() {
      const seed = setup.seed ? [...setup.seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) : undefined;
      const a = realGameTeam(S, g, 0), hm = realGameTeam(S, g, 1);
      const sim = new Sim(a, hm, {
        seed, dh: !!g.dh, method: setup.method, ghost: g.type === 'R' && S.y >= 2020,
        script: { 0: a.script, 1: hm.script }, mgr: { 0: setup.mgrA, 1: setup.mgrH },
      });
      registerUniverse('replays', 'Historic game replays');
      clear(root);
      const gv = new GameView(sim, {
        title: `${fmtDate(g.date)} — ${teamLabel(a)} at ${teamLabel(hm)}`,
        subtitle: ROUND[g.type] || 'Regular season',
        real: realGamePanel(S, g), realTitle: 'Real game',
        continueLabel: 'Play again',
        archive: { universe: 'replays', key: `${g.date}-${g.vis}@${g.home}-${g.num}-${Date.now()}`, kind: 'hist', date: g.date, label: `${S.y} ${ROUND[g.type] || 'regular season'} replay` },
        onContinue: () => openGame(g),
      });
      root.appendChild(h('div', { class: 'stack' }, h('button', { class: 'btn', onclick: () => { gv.destroy(); openGame(g); } }, '‹ Game setup'), gv.root));
    }
  }
  await loadYear();
}
