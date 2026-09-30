// Mode 2: replay any MLB postseason or series.
import { h, clear, select, spinner, nextFrame, card } from './common.js';
import { loadSeason } from '../data.js';
import { historicPostseason, historicPrepare } from '../post.js';
import { PostseasonView } from './postview.js';
import { registerUniverse } from '../archive.js';
import { Recorder, newId } from '../saves.js';

export async function renderPostMode(root, ctx) {
  const { index } = ctx;
  const years = index.years.filter(y => index.seasons[y].series.length);
  const st = ctx.state.post = ctx.state.post || { year: years[years.length - 1], realSubs: true, method: 'odds' };
  clear(root);
  const box = h('div', { class: 'stack' });
  root.appendChild(box);
  box.appendChild(h('h2', null, 'Replay a postseason'));
  box.appendChild(h('p', { class: 'muted' }, 'Choose a year. Each game uses that team’s real postseason lineups and starting pitchers (the same rotation cycle keeps going if your series runs longer than the real one). Replay any series or the whole October — when a different team wins, the bracket carries your result forward.'));
  const info = h('div');
  const view = h('div');
  box.appendChild(h('div', { class: 'filters' },
    h('label', null, 'Year ', select(years.slice().reverse().map(y => [y, y]), st.year, v => { st.year = +v; draw(); })),
    h('label', null, h('input', { type: 'checkbox', checked: st.realSubs, onchange: e => { st.realSubs = e.target.checked; } }), ' Use real substitutions when the matchup is the real one')));
  box.appendChild(info); box.appendChild(view);

  async function draw() {
    clear(info); clear(view);
    const y = st.year;
    const sm = index.seasons[y];
    info.appendChild(card(`${y} postseason as it happened`, h('table', { class: 'tbl compact' },
      h('tbody', null, sm.series.map(s => h('tr', null, h('td', null, ({ WC: 'Wild Card', DV: 'Division Series', LC: 'LCS', WS: 'World Series' })[s.round]),
        h('td', null, `${sm.teams[s.teams[0]]?.n || s.teams[0]} vs ${sm.teams[s.teams[1]]?.n || s.teams[1]}`),
        h('td', null, h('b', null, `${sm.teams[s.winner]?.n || s.winner} ${s.wins.slice().sort((a, b) => b - a).join('–')}`))))))));
    info.appendChild(h('button', { class: 'btn primary big', onclick: start }, `Replay the ${y} postseason`));
  }
  async function start() {
    clear(view); view.appendChild(spinner('Loading season…'));
    await nextFrame();
    const spec = { year: st.year, realSubs: st.realSubs, method: st.method, seed: (Math.random() * 2 ** 32) >>> 0 };
    const run = { id: newId('post'), kind: 'post', title: `${st.year} postseason replay`, sub: 'Postseason', spec, cmds: [] };
    clear(view);
    await buildPost(view, run);
    view.scrollIntoView({ behavior: 'smooth' });
  }
  draw();
}

/** Build (or rebuild and replay) a postseason run inside `view`. */
async function buildPost(view, run) {
  const sp = run.spec;
  const S = await loadSeason(sp.year);
  const ps = historicPostseason(S);
  const prep = historicPrepare(S, { realSubs: sp.realSubs });
  const uni = `post-${sp.year}`; registerUniverse(uni, `${sp.year} postseason replay`);
  const rec = new Recorder(run);
  const pv = new PostseasonView(ps, { title: `${sp.year} postseason replay`, historic: true, prepare: prep, simOpts: { method: sp.method }, seed: sp.seed,
    onCmd: c => rec.add(c),
    archiveMeta: (node, pg) => ({ universe: uni, key: `${node.id}:G${pg.gameNo + 1}`, kind: 'post', label: `${node.label} G${pg.gameNo + 1}` }) });
  const cmds = run.cmds.slice();
  if (cmds.length) pv.replay(cmds);
  view.appendChild(pv.root);
  view.appendChild(h('p', { class: 'muted small' }, '💾 Saved automatically — resume from “Saved games” on the home page.'));
}

export async function resumePost(root, ctx, run) {
  clear(root);
  const box = h('div', { class: 'stack' }, h('h2', null, run.title), h('button', { class: 'btn', onclick: () => { location.hash = '#/saves'; } }, '‹ Saved games'));
  const view = h('div'); box.appendChild(view); root.appendChild(box);
  view.appendChild(spinner('Restoring your postseason…'));
  await nextFrame();
  clear(view);
  await buildPost(view, run);
}
