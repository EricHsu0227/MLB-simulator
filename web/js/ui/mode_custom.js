// Mode 4: custom leagues and tournaments built from any team-seasons in history.
import { h, clear, select, table, spinner, card, nextFrame, toast } from './common.js';
import { loadSeason } from '../data.js';
import { buildTeam } from '../teams.js';
import { League, structuredSchedule, dailyTeam, newRuntime, bracketNodes, Postseason } from '../league.js';
import { SeasonView } from './mode_season.js';
import { PostseasonView } from './postview.js';

const NEEDS = [[1, 'Single game'], [2, 'Best of 3'], [3, 'Best of 5'], [4, 'Best of 7'], [5, 'Best of 9']];

function defaults() {
  return {
    name: 'My League', teams: [], nLeagues: 2, divsPerLg: 2, format: 'league',
    sched: { intraDiv: 10, intraLg: 6, inter: 3 },
    playoff: { perLeague: 4, needs: [3, 4], finalNeed: 4, divWinnersFirst: false },
    tourn: { seeding: 'listed', needs: [3, 3, 4, 4], rounds: 'auto' },
    dhRule: 'era', method: 'odds',
  };
}

export async function renderCustomMode(root, ctx) {
  const { index } = ctx;
  const st = ctx.state.custom = ctx.state.custom || defaults();
  clear(root);
  const box = h('div', { class: 'stack' });
  root.appendChild(box);
  box.appendChild(h('h2', null, 'Custom league & tournament'));
  box.appendChild(h('p', { class: 'muted' }, 'Mix any team-seasons from 1901–2025 — the 1927 Yankees against the 2001 Mariners, the 1906 Cubs in the AL, whatever you like. Build a league with divisions, a schedule and playoffs, or run a straight elimination tournament.'));
  const teamsBox = h('div'), settings = h('div'), status = h('div');

  // ---------------------------------------------------------- team adder
  const allTeams = [];
  for (const y of index.years) for (const [c, t] of Object.entries(index.seasons[y].teams)) if (c !== 'ALS' && c !== 'NLS' && t.w + t.l > 20) allTeams.push({ year: y, code: c, name: t.n, w: t.w, l: t.l, lg: t.lg });
  let addYear = st.addYear || 1927, addCode = '';
  const adder = h('div', { class: 'card' });
  function drawAdder() {
    clear(adder);
    const list = Object.entries(index.seasons[addYear].teams).filter(([c, t]) => c !== 'ALS' && c !== 'NLS').sort((a, b) => a[1].n.localeCompare(b[1].n));
    if (!addCode || !list.find(x => x[0] === addCode)) addCode = list[0]?.[0];
    adder.append(h('h3', null, 'Add teams'),
      h('div', { class: 'filters' },
        h('label', null, 'Season ', select(index.years.slice().reverse().map(y => [y, y]), addYear, v => { addYear = +v; st.addYear = addYear; drawAdder(); })),
        h('label', null, 'Team ', select(list.map(([c, t]) => [c, `${t.n} (${t.w}-${t.l})`]), addCode, v => { addCode = v; })),
        h('button', { class: 'btn', onclick: () => addTeam(addYear, addCode) }, '+ Add team'),
        h('button', { class: 'btn', onclick: () => list.forEach(([c]) => addTeam(addYear, c, true)) || refresh() }, '+ Add whole season')),
      h('div', { class: 'filters' }, h('span', { class: 'muted' }, 'Presets:'),
        h('button', { class: 'btn sm', onclick: () => preset('best', 16) }, 'Best 16 records ever'),
        h('button', { class: 'btn sm', onclick: () => preset('best', 30) }, 'Best 30 records ever'),
        h('button', { class: 'btn sm', onclick: () => preset('champs', 30) }, 'Last 30 World Series champions'),
        h('button', { class: 'btn sm', onclick: () => preset('random', 30) }, '30 random teams'),
        h('button', { class: 'btn sm', onclick: () => { st.teams = []; refresh(); } }, 'Clear')));
  }
  function addTeam(year, code, quiet) {
    if (st.teams.find(t => t.year === year && t.code === code)) return;
    st.teams.push({ year, code, lg: '', div: '' });
    if (!quiet) refresh();
  }
  function preset(kind, n) {
    st.teams = [];
    let picks = [];
    if (kind === 'best') picks = allTeams.filter(t => t.w + t.l >= 100).sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l)).slice(0, n);
    else if (kind === 'random') picks = allTeams.filter(t => t.w + t.l >= 100).sort(() => Math.random() - 0.5).slice(0, n);
    else if (kind === 'champs') {
      for (const y of index.years.slice().reverse()) {
        const ws = index.seasons[y].series.find(s => s.round === 'WS');
        if (ws) picks.push({ year: y, code: ws.winner });
        if (picks.length >= n) break;
      }
    }
    for (const p of picks) st.teams.push({ year: p.year, code: p.code, lg: '', div: '' });
    autoArrange();
    refresh();
  }
  function autoArrange() {
    const n = st.teams.length;
    const L = Math.max(1, st.nLeagues), D = Math.max(1, st.divsPerLg);
    const lgNames = L === 1 ? [''] : ['AL', 'NL', 'XL', 'YL'].slice(0, L);
    const divNames = D === 1 ? [''] : ['East', 'Central', 'West', 'North'].slice(0, D);
    // interleave by record so leagues are balanced
    const order = st.teams.slice().sort((a, b) => (index.seasons[b.year].teams[b.code].w) - (index.seasons[a.year].teams[a.code].w));
    order.forEach((t, i) => {
      const lgI = i % L;
      const inLg = Math.floor(i / L);
      t.lg = lgNames[lgI];
      t.div = divNames[inLg % D];
    });
  }

  // ---------------------------------------------------------- team table + settings
  function drawTeams() {
    clear(teamsBox);
    if (!st.teams.length) { teamsBox.appendChild(h('p', { class: 'muted' }, 'No teams yet — add some above.')); return; }
    const L = Math.max(1, st.nLeagues), D = Math.max(1, st.divsPerLg);
    const lgNames = L === 1 ? [''] : ['AL', 'NL', 'XL', 'YL'].slice(0, L);
    const divNames = D === 1 ? [''] : ['East', 'Central', 'West', 'North'].slice(0, D);
    const rows = st.teams.map((t, i) => {
      const m = index.seasons[t.year].teams[t.code];
      return [`${t.year} ${m.n}`, `${m.w}-${m.l}`,
        h('td', null, select(lgNames.map(x => [x, x || '—']), t.lg, v => { t.lg = v; })),
        h('td', null, select(divNames.map(x => [x, x || '—']), t.div, v => { t.div = v; })),
        h('td', null, h('button', { class: 'btn sm', onclick: () => { st.teams.splice(i, 1); refresh(); } }, '✕'))];
    });
    teamsBox.appendChild(card(`Teams (${st.teams.length})`, table(['Team', 'Real record', 'League', 'Division', ''], rows, 'compact')));
  }
  function drawSettings() {
    clear(settings);
    const fmt = st.format;
    const n = st.teams.length;
    const wrap = h('div', { class: 'card' });
    wrap.appendChild(h('h3', null, 'Format'));
    wrap.appendChild(h('div', { class: 'filters' },
      h('label', null, 'Type ', select([['league', 'League season + playoffs'], ['tournament', 'Elimination tournament']], fmt, v => { st.format = v; drawSettings(); })),
      h('label', null, 'League name ', h('input', { type: 'text', value: st.name, oninput: e => st.name = e.target.value })),
      h('label', null, 'DH rule ', select([['era', 'As each team’s league used'], ['always', 'DH everywhere'], ['never', 'No DH']], st.dhRule, v => { st.dhRule = v; })),
      h('label', null, 'PA model ', select([['odds', 'Odds-ratio (log5)'], ['avg', 'Straight average']], st.method, v => { st.method = v; ctx.state.method = v; }))));
    if (fmt === 'league') {
      wrap.appendChild(h('div', { class: 'filters' },
        h('label', null, 'Leagues ', select([1, 2, 3, 4].map(x => [x, x]), st.nLeagues, v => { st.nLeagues = +v; autoArrange(); refresh(); })),
        h('label', null, 'Divisions per league ', select([1, 2, 3, 4].map(x => [x, x]), st.divsPerLg, v => { st.divsPerLg = +v; autoArrange(); refresh(); })),
        h('button', { class: 'btn sm', onclick: () => { autoArrange(); refresh(); } }, 'Re-deal teams')));
      const num = (label, key) => h('label', null, label + ' ', h('input', { type: 'number', min: 0, max: 40, value: st.sched[key], style: 'width:4.5em', oninput: e => { st.sched[key] = Math.max(0, +e.target.value || 0); gp.textContent = gamesText(); } }));
      const gp = h('span', { class: 'muted' });
      const gamesText = () => {
        const nl = {}; for (const t of st.teams) { const k = t.lg; nl[k] = (nl[k] || 0) + 1; }
        const t0 = st.teams[0]; if (!t0) return '';
        const dv = st.teams.filter(t => t.lg === t0.lg && t.div === t0.div).length - 1;
        const lgOther = st.teams.filter(t => t.lg === t0.lg && t.div !== t0.div).length;
        const inter = st.teams.filter(t => t.lg !== t0.lg).length;
        return `≈ ${dv * st.sched.intraDiv + lgOther * st.sched.intraLg + inter * st.sched.inter} games per team`;
      };
      gp.textContent = gamesText();
      wrap.appendChild(h('div', { class: 'filters' }, h('b', null, 'Schedule: games vs. each…'), num('division rival', 'intraDiv'), num('other team in league', 'intraLg'), num('team in other league', 'inter'), gp));
      const P = st.playoff;
      const rounds = () => Math.max(0, Math.ceil(Math.log2(Math.max(1, P.perLeague))));
      const pl = h('div', { class: 'filters' });
      const drawP = () => {
        clear(pl);
        pl.append(h('b', null, 'Playoffs:'),
          h('label', null, 'Teams per league ', select([0, 1, 2, 3, 4, 5, 6, 8, 12].map(x => [x, x]), P.perLeague, v => { P.perLeague = +v; while (P.needs.length < rounds()) P.needs.unshift(3); P.needs = P.needs.slice(-Math.max(rounds(), 0)); drawP(); })),
          h('label', null, h('input', { type: 'checkbox', checked: P.divWinnersFirst, onchange: e => { P.divWinnersFirst = e.target.checked; } }), ' Division winners seeded first'));
        P.needs.slice(-rounds()).forEach((nn, i) => pl.appendChild(h('label', null, `Round ${i + 1} `, select(NEEDS, nn, v => { P.needs[P.needs.length - rounds() + i] = +v; }))));
        pl.appendChild(h('label', null, 'Final ', select(NEEDS, P.finalNeed, v => { P.finalNeed = +v; })));
      };
      drawP();
      wrap.appendChild(pl);
    } else {
      const T = st.tourn;
      const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
      const pl = h('div', { class: 'filters' });
      while (T.needs.length < rounds) T.needs.unshift(3);
      pl.append(h('label', null, 'Seeding ', select([['listed', 'Order listed'], ['record', 'By real-life record'], ['random', 'Random']], T.seeding, v => { T.seeding = v; })));
      for (let i = 0; i < rounds; i++) {
        const idx = T.needs.length - rounds + i;
        pl.appendChild(h('label', null, i === rounds - 1 ? 'Final ' : `Round ${i + 1} `, select(NEEDS, T.needs[idx], v => { T.needs[idx] = +v; })));
      }
      wrap.appendChild(pl);
      wrap.appendChild(h('p', { class: 'muted small' }, `${n} teams → ${rounds} rounds. Byes go to the top seeds when the field isn't a power of two.`));
    }
    wrap.appendChild(h('button', { class: 'btn primary big', disabled: n < 2, onclick: start }, st.format === 'league' ? 'Create league' : 'Create tournament'));
    settings.appendChild(wrap);
  }
  function refresh() { drawAdder(); drawTeams(); drawSettings(); }

  // ---------------------------------------------------------- start
  async function start() {
    clear(status); status.appendChild(spinner('Loading seasons…'));
    const years = [...new Set(st.teams.map(t => t.year))];
    const seasons = new Map();
    for (const y of years) { seasons.set(y, await loadSeason(y)); await nextFrame(); }
    const entries = st.teams.map(t => {
      const S = seasons.get(t.year);
      const meta = S.teams[t.code];
      const team = buildTeam(S, t.code);
      return { id: `${t.year}${t.code}`, code: t.code, year: t.year, name: `${t.year} ${meta.n}`, team, lg: t.lg, div: t.div, real: [meta.w, meta.l], S };
    });
    clear(status);
    if (st.format === 'league') {
      const schedule = structuredSchedule(entries, st.sched);
      const lg = new League(entries, schedule, { method: st.method, dhRule: st.dhRule, ghost: false });
      lg.S = null;
      const cfg = { ...st.playoff, needs: st.playoff.needs.slice(), finalLabel: `${st.name} Final` };
      const view = new SeasonView(lg, { title: st.name, kind: 'custom', playoffCfg: cfg });
      clear(root);
      root.appendChild(h('div', { class: 'stack' }, h('button', { class: 'btn', onclick: () => renderCustomMode(root, ctx) }, '‹ Edit league'), view.root));
    } else {
      let seeds = entries.slice();
      if (st.tourn.seeding === 'record') seeds.sort((a, b) => b.real[0] / (b.real[0] + b.real[1]) - a.real[0] / (a.real[0] + a.real[1]));
      else if (st.tourn.seeding === 'random') seeds.sort(() => Math.random() - 0.5);
      const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, seeds.length))));
      const seedEntries = seeds.map(e => ({ id: e.id, code: e.id, name: e.name, year: e.year, entry: e, rec: e.real }));
      const b = bracketNodes(seedEntries, st.tourn.needs.slice(-rounds));
      const ps = new Postseason(b.nodes, { higherSeed: () => 0 });
      // seed order decides who is "higher": nodes list team A (better seed) first
      const rts = new Map(entries.map(e => [e.id, newRuntime(e)]));
      const tl = new League(entries, [], { method: st.method, dhRule: st.dhRule });
      const prepare = (node, entry, gameNo, opp, isHome) => {
        const e = entry.entry;
        const t = dailyTeam(e, tl.rt.get(e.id), 100 + node.id * 12 + gameNo, tl.rng, { restP: 0, restDays: 3 });
        t.dh = tl.dhFor(isHome ? e : opp.entry);
        return t;
      };
      const pv = new PostseasonView(ps, { title: `${st.name} — tournament`, prepare, simOpts: { method: st.method }, showYear: false });
      clear(root);
      root.appendChild(h('div', { class: 'stack' }, h('button', { class: 'btn', onclick: () => renderCustomMode(root, ctx) }, '‹ Edit tournament'), pv.root));
    }
  }

  box.append(adder, teamsBox, settings, status);
  refresh();
}
