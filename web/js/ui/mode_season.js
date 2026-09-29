// Mode 3: season mode (also the engine room for custom leagues).
import { h, clear, select, table, spinner, card, f3, ip, nextFrame, toast, POS } from './common.js';
import { loadSeason, batLine, pitLine } from '../data.js';
import { buildTeam, dayNum } from '../teams.js';
import { League, dailyTeam, newRuntime } from '../league.js';
import { playoffFromLeague, historicFormat } from '../post.js';
import { PostseasonView } from './postview.js';
import { GameView, teamLabel } from './gameview.js';

const DIV = { E: 'East', C: 'Central', W: 'West', '': '' };

/** Create a League for a historic season with the real schedule. */
export async function createHistoricLeague(year, opts = {}, progress) {
  const S = await loadSeason(year);
  const codes = Object.keys(S.teams).filter(c => c !== 'ALS' && c !== 'NLS' && S.gamesByTeam.get(c)?.some(g => g.type === 'R'));
  const entries = codes.map(c => ({
    id: c, code: c, name: S.teams[c].n, year, team: buildTeam(S, c), lg: S.teams[c].lg, div: S.teams[c].d,
    real: [S.teams[c].w, S.teams[c].l],
  }));
  const reg = S.games.filter(g => g.type === 'R' && codes.includes(g.vis) && codes.includes(g.home));
  const d0 = dayNum(reg[0].date);
  const schedule = reg.map(g => ({ day: dayNum(g.date) - d0, home: g.home, away: g.vis, date: g.date }));
  const lg = new League(entries, schedule, { method: opts.method || 'odds', dhRule: opts.dhRule || 'era', ghost: year >= 2020, seed: opts.seed });
  lg.S = S; lg.year = year;
  return lg;
}

export class SeasonView {
  /**
   * @param league League
   * @param o {title, playoffCfg, defaultPlayoff, kind:'historic'|'custom', S}
   */
  constructor(league, o) {
    this.lg = league;
    this.o = o;
    this.tab = 'standings';
    this.root = h('div', { class: 'season' });
    this.leaderCat = 'hr';
    this.teamSel = league.entries[0].id;
    this.po = null;
    this.render();
  }

  // ---------------------------------------------------------- actions
  async run(fn) {
    const btns = this.root.querySelectorAll('button');
    btns.forEach(b => b.disabled = true);
    await nextFrame();
    fn();
    this.render();
  }
  simDays(n) { this.run(() => this.lg.simDays(n)); }
  async simToEnd() {
    const lg = this.lg;
    this.root.querySelectorAll('button').forEach(b => b.disabled = true);
    const bar = this.root.querySelector('.bar > i');
    while (!lg.done()) {
      lg.simDays(7);
      if (bar) bar.style.width = (lg.progress * 100).toFixed(1) + '%';
      await nextFrame();
    }
    this.render();
  }

  watch(g) {
    const lg = this.lg;
    const sim = lg.prepareGame(g);
    const gv = new GameView(sim, {
      title: `${lg.by.get(g.away).name} at ${lg.by.get(g.home).name}`,
      subtitle: g.date ? `Season game` : `Day ${g.day + 1}`,
      continueLabel: 'Back to season',
      onFinish: r => { lg.finishGame(g, r); },
      onContinue: () => this.render(),
    });
    clear(this.root);
    this.root.appendChild(h('div', { class: 'stack' }, h('button', { class: 'btn', onclick: () => { gv.destroy(); this.render(); } }, '‹ Season (game not played)'), gv.root));
  }

  // ---------------------------------------------------------- render
  render() {
    const lg = this.lg;
    clear(this.root);
    const pct = (lg.progress * 100).toFixed(1);
    const ctrls = h('div', { class: 'row between wrap' },
      h('div', null, h('h2', null, this.o.title), h('div', { class: 'muted' }, lg.done() ? 'Regular season complete' : `${lg.results.length.toLocaleString()} of ${lg.total.toLocaleString()} games played`)),
      lg.done() ? null : h('div', { class: 'btnrow' },
        h('button', { class: 'btn', onclick: () => this.simDays(1) }, 'Sim day'),
        h('button', { class: 'btn', onclick: () => this.simDays(7) }, 'Sim week'),
        h('button', { class: 'btn', onclick: () => this.simDays(30) }, 'Sim month'),
        h('button', { class: 'btn primary', onclick: () => this.simToEnd() }, 'Sim to end of season')));
    this.root.appendChild(ctrls);
    this.root.appendChild(h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })));
    const tabs = [['standings', 'Standings'], ['games', 'Games'], ['leaders', 'Leaders'], ['teams', 'Teams'], ['playoffs', 'Playoffs']];
    this.root.appendChild(h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: 'tab' + (this.tab === k ? ' on' : ''), onclick: () => { this.tab = k; this.render(); } }, l))));
    const body = h('div', { class: 'tabbody' });
    this.root.appendChild(body);
    if (this.tab === 'standings') body.appendChild(this.standings());
    else if (this.tab === 'games') body.appendChild(this.games());
    else if (this.tab === 'leaders') body.appendChild(this.leaders());
    else if (this.tab === 'teams') body.appendChild(this.teams());
    else body.appendChild(this.playoffs());
  }

  standings() {
    const lg = this.lg;
    const wrap = h('div', { class: 'stand' });
    const hist = this.o.kind === 'historic';
    for (const g of lg.standings()) {
      const title = (g.lg ? g.lg + ' ' : '') + (DIV[g.div] ?? g.div);
      const rows = g.rows.map((r, i) => {
        const gp = r.w + r.l;
        const cells = [h('td', { class: 'pn' }, r.e.name), r.w, r.l, gp ? (r.w / gp).toFixed(3).replace(/^0/, '') : '.000', i === 0 ? '—' : r.gb.toFixed(1), r.rs, r.ra, (r.rs - r.ra > 0 ? '+' : '') + (r.rs - r.ra), r.streak ? (r.streak > 0 ? 'W' : 'L') + Math.abs(r.streak) : ''];
        if (hist) cells.push(h('td', { class: 'muted' }, `${r.e.real[0]}-${r.e.real[1]}`));
        return { cls: i === 0 ? 'lead' : '', cells };
      });
      wrap.appendChild(h('div', { class: 'card' }, h('h3', null, title.trim() || 'League'), table(['Team', 'W', 'L', 'PCT', 'GB', 'RS', 'RA', 'Diff', 'Strk', ...(hist ? ['Real'] : [])], rows, 'compact')));
    }
    return wrap;
  }

  games() {
    const lg = this.lg;
    const wrap = h('div', { class: 'stack' });
    const name = id => lg.by.get(id).name;
    const today = lg.todaysGames();
    if (today.length) {
      wrap.appendChild(card(`Next games (day ${today[0].day + 1})`,
        h('p', { class: 'muted small' }, 'Watch or manage any of these live — the rest of the day is simmed when you advance.'),
        table(['Away', 'Home', ''], today.slice(0, 20).map(g => [name(g.away), name(g.home), h('td', null, h('button', { class: 'btn sm primary', onclick: () => this.watch(g) }, 'Play live'))]), 'compact')));
    }
    const recent = lg.results.slice(-40).reverse();
    wrap.appendChild(card('Recent results', recent.length ? table(['Day', 'Away', '', 'Home', ''], recent.map(r => [r.day + 1, name(r.away), h('td', { class: 'num' }, r.as), name(r.home), h('td', { class: 'num' }, r.hs)]), 'compact') : h('p', { class: 'muted' }, 'No games yet.')));
    return wrap;
  }

  leaders() {
    const lg = this.lg;
    const wrap = h('div', { class: 'stack' });
    const bat = [['hr', 'Home runs'], ['rbi', 'RBI'], ['avg', 'Batting average'], ['h', 'Hits'], ['r', 'Runs'], ['sb', 'Stolen bases'], ['obp', 'On-base %'], ['slg', 'Slugging'], ['bb', 'Walks'], ['k', 'Strikeouts (bat)']];
    const pit = [['w', 'Wins'], ['sv', 'Saves'], ['k', 'Strikeouts (pit)'], ['era', 'ERA (RA/9)'], ['whip', 'WHIP']];
    const cats = [...bat.map(([k, l]) => ['b:' + k, l]), ...pit.map(([k, l]) => ['p:' + k, l])];
    wrap.appendChild(h('div', { class: 'filters' }, h('label', null, 'Category ', select(cats, this.leaderCat, v => { this.leaderCat = v; this.render(); }))));
    const [kind, key] = this.leaderCat.includes(':') ? this.leaderCat.split(':') : ['b', this.leaderCat];
    const gp = Math.max(1, Math.max(...[...lg.rt.values()].map(r => r.w + r.l)));
    const name = id => lg.by.get(id)?.name || id;
    if (kind === 'b') {
      const rate = ['avg', 'obp', 'slg'].includes(key);
      const rows = lg.stats.batLeaders(key, 15, rate ? Math.floor(gp * 3.1) : 0).map((a, i) => [i + 1, a.p.name, name(a.team), a.g, a.pa, a.hr, a.rbi, a.r, a.sb, f3(a.avg), f3(a.obp), f3(a.slg)]);
      wrap.appendChild(card(null, table(['#', 'Player', 'Team', 'G', 'PA', 'HR', 'RBI', 'R', 'SB', 'AVG', 'OBP', 'SLG'], rows, 'compact')));
    } else {
      const rate = ['era', 'whip'].includes(key);
      const rows = lg.stats.pitLeaders(key, 15, rate ? gp * 3 : 0, rate).map((a, i) => [i + 1, a.p.name, name(a.team), a.g, a.gs, a.w + '-' + a.l, a.sv, ip(a.outs), a.k, a.bb, a.era.toFixed(2), a.whip.toFixed(2)]);
      wrap.appendChild(card(null, table(['#', 'Player', 'Team', 'G', 'GS', 'W-L', 'SV', 'IP', 'K', 'BB', 'RA/9', 'WHIP'], rows, 'compact')));
    }
    return wrap;
  }

  teams() {
    const lg = this.lg;
    const wrap = h('div', { class: 'stack' });
    wrap.appendChild(h('div', { class: 'filters' }, h('label', null, 'Team ', select(lg.entries.slice().sort((a, b) => a.name.localeCompare(b.name)).map(e => [e.id, e.name]), this.teamSel, v => { this.teamSel = v; this.render(); }))));
    const e = lg.by.get(this.teamSel);
    const t = e.team;
    const S = t.S;
    const row = (p, extra = []) => {
      const bl = batLine(S, p.idx);
      return [p.name, p.bats + '/' + p.throws, bl ? bl.pa : '', bl ? f3(bl.avg) + '/' + f3(bl.obp) + '/' + f3(bl.slg) : '', bl ? bl.hr : '', f3(p.bat.woba), ...extra];
    };
    wrap.appendChild(card(`${teamLabel(t)} — lineup (real ${t.year} stats)`, table(['Player', 'B/T', 'PA', 'AVG/OBP/SLG', 'HR', 'wOBA (sim rating)', 'Pos'], t.lineup.map(x => row(x.p, [POS[x.pos]])), 'compact')));
    wrap.appendChild(card('Bench', table(['Player', 'B/T', 'PA', 'AVG/OBP/SLG', 'HR', 'wOBA'], t.bench.map(p => row(p)), 'compact')));
    const prow = (p, role) => { const pl = pitLine(S, p.idx); return [p.name, p.throws, role, pl ? pl.g + '/' + pl.gs : '', pl ? ip(pl.outs ?? pl.ip * 3) : '', pl ? pl.k : '', pl ? pl.bb : '', f3(p.pit.wobaAgainst)]; };
    wrap.appendChild(card('Rotation', table(['Pitcher', 'T', 'Role', 'G/GS', 'IP', 'K', 'BB', 'wOBA against'], t.rotation.map((p, i) => prow(p, 'SP' + (i + 1))), 'compact')));
    wrap.appendChild(card('Bullpen', table(['Pitcher', 'T', 'Role', 'G/GS', 'IP', 'K', 'BB', 'wOBA against'], t.bullpen.map(p => prow(p, p.role)), 'compact')));
    return wrap;
  }

  playoffs() {
    const lg = this.lg;
    const wrap = h('div', { class: 'stack' });
    if (!lg.done()) { wrap.appendChild(h('p', { class: 'muted' }, 'The playoffs begin when the regular season ends. Sim to the end of the season first.')); return wrap; }
    const cfg = this.o.playoffCfg;
    if (!cfg || !cfg.perLeague) { wrap.appendChild(h('p', null, 'This league has no playoffs configured.')); this.showChampion(wrap); return wrap; }
    if (!this.po) {
      const draft = { ...cfg, needs: cfg.needs.slice() };
      const perLgOpts = [1, 2, 3, 4, 5, 6, 8, 12].map(n => [n, n]);
      const needSel = (val, cb) => select([[1, 'Single game'], [2, 'Best of 3'], [3, 'Best of 5'], [4, 'Best of 7'], [5, 'Best of 9']], val, v => cb(+v));
      const rounds = () => Math.max(0, Math.ceil(Math.log2(Math.max(1, draft.perLeague))));
      const box = h('div', { class: 'card' });
      const draw = () => {
        clear(box);
        box.appendChild(h('h3', null, 'Playoff format'));
        box.appendChild(h('div', { class: 'filters' },
          h('label', null, 'Teams per league ', select(perLgOpts, draft.perLeague, v => { draft.perLeague = +v; while (draft.needs.length < rounds()) draft.needs.unshift(3); draft.needs = draft.needs.slice(-rounds()); draw(); })),
          h('label', null, h('input', { type: 'checkbox', checked: draft.divWinnersFirst, onchange: e => { draft.divWinnersFirst = e.target.checked; } }), ' Division winners get the top seeds')));
        const f = h('div', { class: 'filters' });
        const names = ['Round 1', 'Round 2', 'Round 3', 'Round 4'];
        draft.needs.slice(-rounds()).forEach((n, i) => f.appendChild(h('label', null, (draft.needs.length - i === 1 ? 'League final' : `Round ${i + 1}`) + ' ', needSel(n, v => { draft.needs[i] = v; }))));
        f.appendChild(h('label', null, 'Final (champion) ', needSel(draft.finalNeed, v => { draft.finalNeed = v; })));
        box.appendChild(f);
        box.appendChild(h('button', { class: 'btn primary big', onclick: () => this.startPlayoffs(draft) }, 'Start the playoffs'));
      };
      draw();
      wrap.appendChild(box);
      return wrap;
    }
    wrap.appendChild(this.po.root);
    return wrap;
  }

  startPlayoffs(cfg) {
    const lg = this.lg;
    const ps = playoffFromLeague(lg, cfg);
    const S = lg.S;
    const restRt = new Map(lg.entries.map(e => [e.id, newRuntime(e)]));
    let day = 500;
    const prepare = (node, entry, gameNo, opp, isHome) => {
      const e = entry.entry;
      const rt = lg.rt.get(e.id);
      const t = dailyTeam(e, rt, day + node.id * 12 + gameNo, lg.rng, { restP: 0, restDays: 3 });
      t.dh = lg.dhFor(lg.by.get(isHome ? e.id : opp.entry.id));
      return t;
    };
    this.po = new PostseasonView(ps, { title: this.o.title + ' — playoffs', prepare, simOpts: { method: lg.opts.method, ghost: false }, showYear: this.o.kind === 'custom' });
    this.render();
  }

  showChampion(wrap) {
    const lg = this.lg;
    const top = [...lg.rankedByLeague().values()].map(r => r[0]).sort((a, b) => b.w - a.w)[0];
    if (top) wrap.appendChild(h('div', { class: 'champ' }, '🏆 Best record: ', top.e.name, ` (${top.w}-${top.l})`));
  }
}

export async function renderSeasonMode(root, ctx) {
  const { index } = ctx;
  const st = ctx.state.season = ctx.state.season || { year: 2019, method: ctx.state.method || 'odds', dhRule: 'era' };
  clear(root);
  const top = h('div', { class: 'stack' });
  root.appendChild(top);
  top.appendChild(h('h2', null, 'Season mode'));
  top.appendChild(h('p', { class: 'muted' }, 'Replay any season with its real schedule. Every team plays with its real regulars, rotation and bullpen (regulars sit now and then, starters follow their rest days, tired relievers are unavailable). Watch or manage any game live, then run the playoffs.'));
  const years = index.years;
  const box = h('div', { class: 'card' });
  const status = h('div');
  box.appendChild(h('div', { class: 'filters' },
    h('label', null, 'Season ', select(years.slice().reverse().map(y => [y, y]), st.year, v => { st.year = +v; })),
    h('label', null, 'DH rule ', select([['era', 'Whatever that league used'], ['always', 'DH everywhere'], ['never', 'No DH']], st.dhRule, v => { st.dhRule = v; })),
    h('label', null, 'PA model ', select([['odds', 'Odds-ratio (log5)'], ['avg', 'Straight average']], st.method, v => { st.method = v; ctx.state.method = v; })),
    h('button', { class: 'btn primary big', onclick: start }, 'Start season')));
  top.appendChild(box);
  top.appendChild(status);
  async function start() {
    clear(status); status.appendChild(spinner(`Loading ${st.year} and building rosters…`));
    await nextFrame();
    const lg = await createHistoricLeague(st.year, st);
    const fmt = historicFormat(lg.S);
    const cfg = { perLeague: fmt.perLeague, needs: fmt.needs.length ? fmt.needs : [], finalNeed: fmt.finalNeed, divWinnersFirst: fmt.hasDivs };
    const view = new SeasonView(lg, { title: `${st.year} season`, kind: 'historic', playoffCfg: cfg });
    clear(root);
    root.appendChild(h('div', { class: 'stack' }, h('button', { class: 'btn', onclick: () => renderSeasonMode(root, ctx) }, '‹ New season'), view.root));
  }
}
