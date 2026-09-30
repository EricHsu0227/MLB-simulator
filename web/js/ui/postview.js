// Postseason bracket view: play series game-by-game or sim them. Used for historic replays and generated playoffs.
import { h, clear, card } from './common.js';
import { playSeriesGame } from '../league.js';
import { mulberry32 } from '../engine.js';
import { GameView, teamLabel } from './gameview.js';
import { archiveGame } from '../archive.js';
import { editLineups, applyEdits, reviewOn } from './lineup.js';
import { teamSpec, applySpec } from '../saves.js';

export class PostseasonView {
  /**
   * @param ps Postseason
   * @param o {prepare(node, entry, gameNo, opp, isHome), title, simOpts, historic, onDone(champion), seasonLabel}
   */
  constructor(ps, o) {
    this.ps = ps;
    this.o = o;
    this.rng = mulberry32(o.seed ?? ((Math.random() * 2 ** 32) >>> 0));
    this.root = h('div', { class: 'post' });
    this.replaying = false;
    this.render();
  }
  /** Everything the user does is a command, so it can be saved and replayed (o.onCmd receives each one). */
  cmd(c) { if (!this.replaying && this.o.onCmd) this.o.onCmd(c); }
  apply(c) {
    const ps = this.ps, node = c.id !== undefined ? ps.nodes.find(n => n.id === c.id) : null;
    if (c.t === 'series') this.simSeries(node);
    else if (c.t === 'round') this.simRound(true);
    else if (c.t === 'all') this.simAll(true);
    else if (c.t === 'reset') { ps.reset(node); ps.invalidateDownstream(node); }
    else if (c.t === 'resetAll') for (const n of ps.nodes) ps.reset(n);
    else if (c.t === 'game') {
      const series = ps.ensureSeries(node);
      const pg = playSeriesGame(series, (e, n, o, ish) => this.o.prepare(node, e, n, o, ish), this.rng, this.o.simOpts || {});
      if (c.specs && (c.specs[0] || c.specs[1])) pg.setTeams(applySpec(pg.at, c.specs[0]), applySpec(pg.ht, c.specs[1]));
      pg.sim.replay(c.actions || [], 1e9);
      pg.record(pg.sim.playGame());
      if (series.over) ps.finish(node);
    }
  }
  replay(cmds) {
    this.replaying = true;
    try { for (const c of cmds) this.apply(c); } finally { this.replaying = false; }
    this.render();
  }
  name(e) { return e ? (e.name + (this.o.showYear && e.year ? ` (${e.year})` : '')) : 'TBD'; }

  simSeries(node, watch = false) {
    const ps = this.ps;
    const series = ps.ensureSeries(node);
    while (!series.over) {
      const pg = playSeriesGame(series, (e, n, o, ish) => this.o.prepare(node, e, n, o, ish), this.rng, this.o.simOpts || {});
      const r = pg.finish();
      const m = !this.replaying && this.o.archiveMeta && this.o.archiveMeta(node, pg);
      if (m) archiveGame(r.sim, m);
    }
    ps.finish(node);
  }

  async watch(node) {
    const ps = this.ps;
    const series = ps.ensureSeries(node);
    if (series.over) { ps.finish(node); this.render(); return; }
    const pg = playSeriesGame(series, (e, n, o, ish) => this.o.prepare(node, e, n, o, ish), this.rng, this.o.simOpts || {});
    let specs = [null, null];
    if (reviewOn()) {
      const res = await editLineups(this.root, { away: pg.at, home: pg.ht, dh: !!pg.ht.dh, title: `${node.label} — Game ${pg.gameNo + 1}: set your lineups`, subtitle: `${teamLabel(pg.at)} at ${teamLabel(pg.ht)}` });
      if (!res) { this.render(); return; }
      applyEdits(res); pg.setTeams(res.away, res.home);
      specs = [res.edited[0] ? teamSpec(res.away) : null, res.edited[1] ? teamSpec(res.home) : null];
    }
    const lead = series.wins[0] === series.wins[1] ? 'Series tied' : `${series.wins[0] > series.wins[1] ? series.hi.name : series.lo.name} lead ${Math.max(...series.wins)}–${Math.min(...series.wins)}`;
    const gv = new GameView(pg.sim, {
      title: `${node.label} — Game ${pg.gameNo + 1}`,
      subtitle: `${teamLabel(pg.at)} at ${teamLabel(pg.ht)} · ${pg.gameNo ? lead : 'Best of ' + (node.need * 2 - 1)}`,
      continueLabel: '',
      archive: this.o.archiveMeta ? this.o.archiveMeta(node, pg) : null,
      onFinish: r => {
        pg.record(r);
        this.cmd({ t: 'game', id: node.id, specs, actions: gv.sim.actions.slice() });
        gv.opts.continueLabel = series.over ? 'Series over — back to bracket' : `Next game (G${series.games.length + 1})`;
        gv.updateCtrl();
      },
      onContinue: () => { if (series.over) { ps.finish(node); this.render(); } else this.watch(node); },
    });
    clear(this.root);
    this.root.appendChild(h('div', { class: 'stack' }, h('button', { class: 'btn', onclick: () => { gv.destroy(); this.render(); } }, '‹ Bracket (game not saved)'), gv.root));
  }

  simRound(silent) {
    const ps = this.ps;
    if (!silent) this.cmd({ t: 'round' });
    const ready = ps.ready();
    if (!ready.length) return;
    const minRound = ps.opts.defaultActual ? null : Math.min(...ready.map(n => n.round));
    for (const n of ready) if (minRound === null || n.round === minRound) this.simSeries(n);
    if (!silent) this.render();
  }
  simAll(silent) {
    const ps = this.ps;
    if (!silent) this.cmd({ t: 'all' });
    let g = 0;
    while (ps.ready().length && g++ < 100) {
      const r = ps.ready();
      // in historic replays only sim series the user hasn't decided: everything ready & unplayed
      for (const n of r) this.simSeries(n);
    }
    if (!silent) this.render();
  }

  render() {
    const ps = this.ps;
    clear(this.root);
    const champ = ps.champion;
    const head = h('div', { class: 'row between' },
      h('h3', null, this.o.title || 'Postseason'),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn', onclick: () => this.simRound() }, 'Sim next round'),
        h('button', { class: 'btn primary', onclick: () => this.simAll() }, 'Sim everything left'),
        h('button', { class: 'btn', onclick: () => { this.cmd({ t: 'resetAll' }); for (const n of ps.nodes) ps.reset(n); this.render(); } }, 'Reset')));
    this.root.appendChild(head);
    if (this.o.note) this.root.appendChild(h('p', { class: 'muted small' }, this.o.note));
    else if (this.o.historic) this.root.appendChild(h('p', { class: 'muted small' }, 'Series you have not replayed show their real result. Replay any series — if a different team wins, the next round is updated to the new matchup and you keep going from there.'));
    if (champ) this.root.appendChild(h('div', { class: 'champ' }, '🏆 ', this.name(champ), ' — champions', this.o.historic && ps.final.actualWinner && ps.final.actualWinner.id !== champ.id ? h('span', { class: 'muted' }, `  (in real life: ${ps.final.actualWinner.name})`) : null));
    const groups = new Map();
    for (const n of ps.nodes) {
      const k = this.o.historic ? ['WC', 'DV', 'LC', 'WS'].indexOf(n.round) : n.round;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    const cols = h('div', { class: 'rounds' });
    for (const k of [...groups.keys()].sort((a, b) => a - b)) {
      const nodes = groups.get(k);
      const title = this.o.historic ? nodes[0].label.replace(/^(AL|NL) /, '') : (nodes[0].round === 99 ? nodes[0].label : `Round ${nodes[0].round + 1}`);
      cols.appendChild(h('div', { class: 'rcol' }, h('h4', null, title), nodes.map(n => this.nodeCard(n))));
    }
    this.root.appendChild(cols);
  }

  nodeCard(n) {
    const ps = this.ps;
    const [a, b] = ps.teams(n);
    const ready = ps.isReady(n);
    const series = n.series;
    const cls = 'node' + (n.winner ? ' done' : ready ? ' ready' : ' wait');
    const teamRow = (e, wins, isWin) => h('div', { class: 'nt' + (isWin ? ' win' : '') }, h('span', null, this.name(e)), h('b', null, wins === null ? '' : wins));
    const card = h('div', { class: cls });
    if (this.o.historic || ps.opts.defaultActual) card.appendChild(h('div', { class: 'muted small' }, n.label));
    else card.appendChild(h('div', { class: 'muted small' }, n.lg ? n.lg + ' · ' : '', n.round === 99 ? n.label : `Best of ${n.need * 2 - 1}`));
    if (n.winner && series) {
      card.append(teamRow(series.hi, series.wins[0], series.winner === series.hi), teamRow(series.lo, series.wins[1], series.winner === series.lo));
      card.appendChild(h('div', { class: 'small muted' }, series.games.map(g => {
        const home = g.home === 0 ? series.hi : series.lo, away = g.home === 0 ? series.lo : series.hi;
        return `G${g.n}: ${away.code || away.id} ${g.as}, ${home.code || home.id} ${g.hs}`;
      }).join(' · ')));
      if (n.actualTeams) card.appendChild(h('div', { class: 'small tag' }, ps.isActualMatchup(n) ? (n.actualWinner ? (n.actualWinner.id === n.winner.id ? 'Same result as real life' : `Real life: ${n.actualWinner.name} won ${n.actual.wins.slice().sort((x, y) => y - x).join('–')}`) : 'Real series still in progress') : 'Alternate matchup (not in real life)'));
      card.appendChild(h('div', { class: 'btnrow' }, h('button', { class: 'btn sm', onclick: () => { this.cmd({ t: 'reset', id: n.id }); ps.reset(n); ps.invalidateDownstream(n); this.render(); } }, 'Replay')));
    } else {
      card.append(teamRow(a, null, false), teamRow(b, null, false));
      if (n.actual && n.actual.inProgress && ps.isActualMatchup(n)) card.appendChild(h('div', { class: 'small tag' }, `Real series in progress: ${n.actualTeams[0]} ${n.actual.wins[0]}, ${n.actualTeams[1]} ${n.actual.wins[1]}`));
      else if (n.actual && n.actualWinner && (!ready || ps.isActualMatchup(n))) card.appendChild(h('div', { class: 'small tag' }, `Real: ${n.actualWinner.name} won ${n.actual.wins.slice().sort((x, y) => y - x).join('–')}`));
      else if (n.actual && ready && !ps.isActualMatchup(n)) card.appendChild(h('div', { class: 'small tag alt' }, 'New matchup (not in real life)'));
      if (ready) card.appendChild(h('div', { class: 'btnrow' },
        h('button', { class: 'btn sm primary', onclick: () => this.watch(n) }, 'Play game by game'),
        h('button', { class: 'btn sm', onclick: () => { this.cmd({ t: 'series', id: n.id }); this.simSeries(n); this.render(); } }, 'Sim series')));
      else card.appendChild(h('div', { class: 'small muted' }, 'Waiting for earlier series'));
    }
    return card;
  }
}
