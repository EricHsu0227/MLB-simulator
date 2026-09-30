// Live game viewer: scoreboard, diamond, play-by-play, box score, manager controls.
import { h, clear, ip, f3, select, table, POS, toast } from './common.js';
import { ordinal } from '../engine.js';
import { batLine, WOBA_W, wobaOf } from '../data.js';
import { fieldSVG, animateEntry } from './field.js';
import { archiveGame } from '../archive.js';
import { deleteRun } from '../saves.js';
import { playerLink } from './playercard.js';
import { hitterRatings, pitcherRatings } from '../pstats.js';
import { ROLE_NAME } from '../teams.js';

export const teamLabel = t => `${t.year} ${t.name}`;
const short = n => { const p = n.split(' '); return p.length > 1 ? p[p.length - 1] : n; };

export class GameView {
  /**
   * @param sim Sim instance
   * @param opts {title, subtitle, real: Node|null, onFinish(result), continueLabel, autoSpeed}
   */
  constructor(sim, opts = {}) {
    this.sim = sim;
    this.opts = opts;
    this.tab = opts.startTab || 'log';
    this.newestFirst = true;
    this.timer = null;
    this.busy = false;
    this.anim = opts.anim ?? (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1);
    this.logCount = 0;
    this.root = h('div', { class: 'gv' });
    this.build();
    this.refresh();
  }

  build() {
    this.titleEl = h('div', { class: 'gv-title' });
    this.boardEl = h('div', { class: 'gv-board' });
    this.fieldEl = h('div', { class: 'gv-field' });
    this.ctrlEl = h('div', { class: 'gv-ctrl' });
    this.tabsEl = h('div', { class: 'tabs' });
    this.bodyEl = h('div', { class: 'gv-body' });
    add(this.root, [this.titleEl, this.boardEl, h('div', { class: 'gv-mid' }, this.fieldEl, this.ctrlEl), this.tabsEl, this.bodyEl]);
  }

  destroy() { this.stop(); this.gone = true; }
  stop() { this.timer = null; this.updateCtrl(); }

  // ------------------------------------------------------------ actions
  async step(kind) {
    const sim = this.sim;
    if (sim.isOver() || this.busy) return;
    if (kind === 'pa') {
      this.busy = true;
      this.updateCtrl();
      const svg = this.fieldEl.querySelector('svg');
      const fresh = sim.st.log.length;
      const entry = sim.playPA();
      // draw pre-play field without runner labels, animate, then show the new state
      if (this.anim > 0 && entry && svg) {
        const pre = this._preState;
        try {
          for (const l of sim.st.log.slice(fresh)) if (l.kind === 'run' && l !== entry) await animateEntry(svg, l, this.anim);
          await animateEntry(svg, entry, this.anim);
        } catch (e) { console.warn('animation failed', e); }
      }
      this.busy = false;
    } else if (kind === 'half') sim.playHalf();
    else if (kind === 'inning') {
      const i = sim.st.inning; let g = 0;
      while (!sim.isOver() && sim.st.inning === i && g++ < 400) sim.playHalf();
    } else if (kind === 'end') sim.playGame();
    this.refresh();
    if (sim.isOver()) { this.stop(); this.finished(); } else this.autosave();
  }
  /** Single-game runs are saved after every move so leaving the page never loses the game. */
  autosave() {
    const rec = this.opts.save;
    if (!rec) return;
    const sim = this.sim;
    rec.run.game = { seed: sim.seed, actions: sim.actions.slice(), pa: sim.st.paCount };
    rec.touch();
    this.saved = true;
    const el = this.root.querySelector('.savedchip'); if (el) el.textContent = '💾 Saved';
  }
  auto() {
    if (this.timer) { this.stop(); return; }
    this.timer = true;
    this.updateCtrl();
    const pause = { slow: 900, medium: 350, fast: 60 }[this.speed || 'medium'];
    const loop = async () => {
      while (this.timer && !this.sim.isOver()) {
        await this.step('pa');
        await new Promise(r => setTimeout(r, pause));
      }
      this.timer = null;
      this.updateCtrl();
    };
    loop();
  }
  finished() {
    if (this._fin) return;
    this._fin = true;
    if (this.opts.save) { clearTimeout(this.opts.save.t); this.opts.save.replaying = true; deleteRun(this.opts.save.run.id); }
    this.tab = 'box';
    this.refresh();
    if (this.opts.archive) archiveGame(this.sim, this.opts.archive);
    if (this.opts.onFinish) this.opts.onFinish(this.sim.result(), this);
  }

  // ------------------------------------------------------------ render
  refresh() {
    this.renderTitle();
    this.renderBoard();
    this.renderField();
    this.updateCtrl();
    this.renderTabs();
    this.renderBody();
  }

  renderTitle() {
    const sim = this.sim, [a, hm] = sim.teams;
    clear(this.titleEl);
    add(this.titleEl, [
      h('div', { class: 'gv-h1' }, this.opts.title || `${teamLabel(a)} at ${teamLabel(hm)}`),
      this.opts.subtitle ? h('div', { class: 'muted' }, this.opts.subtitle) : null,
      this.opts.save && !sim.isOver() ? h('div', { class: 'muted small savedchip' }, this.saved ? '💾 Saved' : '💾 Autosaves after every move — resume from “Saved games”') : null,
      h('div', { class: 'muted' }, `${hm.park.name}${hm.dh || sim.dh ? ' · DH' : ' · no DH'}`),
    ]);
  }

  renderBoard() {
    const sim = this.sim, st = sim.st, [a, hm] = sim.teams;
    const n = Math.max(9, st.inning);
    const head = ['', ...Array.from({ length: n }, (_, i) => i + 1), 'R', 'H'];
    const row = ti => {
      const cells = [h('td', { class: 'tname' }, (ti === 0 ? a : hm).code)];
      for (let i = 0; i < n; i++) {
        const v = st.lineScore[ti][i];
        const cur = (st.inning === i + 1 && st.half === ti && !st.over);
        cells.push(h('td', { class: cur ? 'cur' : '' }, v === undefined ? (cur ? (st.curRuns || 0) : '') : v));
      }
      const scored = this._lastScore && st.score[ti] > this._lastScore[ti];
      cells.push(h('td', { class: 'tot' + (scored ? ' pop' : '') }, st.score[ti]), h('td', { class: 'tot' }, st.hits[ti]));
      return cells;
    };
    clear(this.boardEl);
    const rows = [row(0), row(1)];
    this._lastScore = st.score.slice();
    this.boardEl.appendChild(h('table', { class: 'linescore' },
      h('thead', null, h('tr', null, head.map(x => h('th', null, x)))),
      h('tbody', null, h('tr', null, rows[0]), h('tr', null, rows[1]))));
  }

  renderField() {
    const sim = this.sim, st = sim.st;
    clear(this.fieldEl);
    const over = sim.isOver();
    const ft = 1 - st.half;
    const label = over ? 'Final' : (st.half ? '▼' : '▲') + ' ' + ordinal(st.inning);
    const dia = h('div', { html: fieldSVG({ bases: st.bases, outs: st.outs, label, fielders: true }) });
    let mu = null, calls = null;
    if (!over) {
      const b = sim.currentBatter();
      const pit = st.pitcher[ft];
      const bb = sim.bx(b.p), pb = sim.pbx(pit);
      const S = b.p.S;
      const line = S ? batLine(S, b.p.idx) : null;
      mu = h('div', { class: 'matchup' },
        h('div', { class: 'mu-side' },
          h('div', { class: 'mu-role' }, 'At bat'),
          h('div', { class: 'mu-name' }, playerLink({ p: b.p }), ' ', h('span', { class: 'chip' }, POS[b.pos] || b.pos), ' ', h('span', { class: 'chip alt' }, 'bats ' + b.p.bats)),
          h('div', { class: 'muted' }, `Today ${bb.h}-${bb.ab}${bb.bb ? ', ' + bb.bb + ' BB' : ''}${bb.hr ? ', ' + bb.hr + ' HR' : ''}${bb.k ? ', ' + bb.k + ' K' : ''}`),
          line ? h('div', { class: 'muted' }, `${b.p.y}: ${f3(line.avg)}/${f3(line.obp)}/${f3(line.slg)} · ${line.hr} HR · wOBA ${f3(line.woba)}`) : null,
          b.p.bat.vs ? h('div', { class: 'muted' }, ['L', 'R'].filter(k => b.p.bat.vs[k]).map(k => `vs ${k}HP ${f3(wobaOf(b.p.bat.vs[k]))}${k === pit.throws ? ' ◂' : ''}`).join(' · '), ' (sim, park-neutral)') : null),
        h('div', { class: 'mu-side' },
          h('div', { class: 'mu-role' }, 'Pitching'),
          h('div', { class: 'mu-name' }, playerLink({ p: pit }), ' ', h('span', { class: 'chip alt' }, pit.throws + 'HP'), sim.isStarterOfGame(ft) ? h('span', { class: 'chip' }, 'SP') : h('span', { class: 'chip' }, (pit.role || 'RP').toUpperCase())),
          h('div', { class: 'muted' }, `${pb.bf} BF · ${ip(pb.outs)} IP · ${pb.r} R · ~${pb.pc} pitches`),
          h('div', { class: 'muted' }, `${pit.y} wOBA against ${f3(pit.pit.wobaAgainst)} · usual ${Math.round(pit.pit.endur)} BF`),
          pit.pit.vs ? h('div', { class: 'muted' }, ['L', 'R'].filter(k => pit.pit.vs[k]).map(k => `vs ${k}HB ${f3(wobaOf(pit.pit.vs[k]))}`).join(' · '), ' (sim)') : null));
      calls = this.callsEl();
    }
    add(this.fieldEl, [dia, mu, calls]);
  }

  callsEl() {
    const sim = this.sim, st = sim.st;
    const ti = st.half, fi = 1 - ti;
    const bm = sim.bmask();
    const btn = (side, key, label, enabled, title) => h('button', {
      class: 'btn sm call' + (sim.manual[side][key] ? ' on' : ''), disabled: !enabled || this.busy, title,
      onclick: () => { sim.human(() => { const v = !sim.manual[side][key]; sim.manual[side][key] = v; sim.rec({ pa: sim.st.paCount, t: 'call', side, key, v }); if (side === ti && (key === 'bunt' || key === 'steal' || key === 'hitrun')) for (const k of ['bunt', 'steal', 'hitrun']) if (k !== key && sim.manual[side][k]) { sim.manual[side][k] = false; sim.rec({ pa: sim.st.paCount, t: 'call', side, key: k, v: false }); } }); this.renderField(); },
    }, label);
    return h('div', { class: 'calls' },
      h('div', { class: 'mu-role' }, `Call it — ${sim.teams[ti].code} batting`),
      h('div', { class: 'btnrow tight' },
        btn(ti, 'bunt', 'Sac bunt', true, 'Bunt the runners over'),
        btn(ti, 'steal', 'Steal', !!(bm & 3) && !(bm & 4 && !(bm & 3)), 'Send the lead runner'),
        btn(ti, 'hitrun', 'Hit & run', !!(bm & 1), 'Runner goes; batter protects')),
      h('div', { class: 'mu-role' }, `${sim.teams[fi].code} defense`),
      h('div', { class: 'btnrow tight' },
        btn(fi, 'ibb', 'Intentional walk', true, 'Put him on'),
        btn(fi, 'infieldIn', 'Infield in', !!(bm & 4) && st.outs < 2, 'Cut off the run at the plate'),
        btn(fi, 'hold', 'Hold runners', !!(bm & 3), 'Fewer steal attempts')));
  }

  updateCtrl() {
    const sim = this.sim;
    clear(this.ctrlEl);
    if (sim.isOver()) {
      const r = sim.result();
      const d = r.decisions || {};
      add(this.ctrlEl, [
        h('div', { class: 'final' }, `Final: ${r.away.code} ${r.score[0]}, ${r.home.code} ${r.score[1]}${r.innings !== 9 ? ` (${r.innings})` : ''}`),
        d.W ? h('div', { class: 'muted' }, `W: ${d.W.name}  ·  L: ${d.L ? d.L.name : '—'}${d.SV ? '  ·  SV: ' + d.SV.name : ''}`) : null,
        this.opts.continueLabel ? h('button', { class: 'btn primary', onclick: () => this.opts.onContinue && this.opts.onContinue(r) }, this.opts.continueLabel) : null,
      ]);
      return;
    }
    const b = (label, fn, cls = '') => h('button', { class: 'btn ' + cls, disabled: this.busy && !/Pause/.test(label), onclick: fn }, label);
    add(this.ctrlEl, [
      b('Next batter ▸', () => this.step('pa'), 'primary'),
      b('Finish half-inning', () => this.step('half')),
      b('Finish inning', () => this.step('inning')),
      b('Sim to end', () => this.step('end')),
      h('div', { class: 'auto' },
        b(this.timer ? '❚❚ Pause' : '▶ Auto-play', () => this.auto()),
        select([['slow', 'Slow'], ['medium', 'Medium'], ['fast', 'Fast']], this.speed || 'medium', v => { this.speed = v; }),
        h('label', { class: 'muted small' }, 'Animation ', select([[1, 'Full'], [0.5, 'Quick'], [0, 'Off']], this.anim, v => { this.anim = +v; })))
    ]);
  }

  renderTabs() {
    clear(this.tabsEl);
    const tabs = [['log', 'Play-by-play'], ['box', 'Box score'], ['manage', 'Managers']];
    if (this.sim.opts.explain) tabs.push(['math', 'The math']);
    if (this.opts.real) tabs.push(['real', this.opts.realTitle || 'Real game']);
    for (const [k, l] of tabs) this.tabsEl.appendChild(h('button', { class: 'tab' + (this.tab === k ? ' on' : ''), onclick: () => { this.tab = k; this.renderTabs(); this.renderBody(); } }, l));
  }

  renderBody() {
    clear(this.bodyEl);
    if (this.tab === 'log') this.bodyEl.appendChild(this.logEl());
    else if (this.tab === 'box') this.bodyEl.appendChild(this.boxEl());
    else if (this.tab === 'manage') this.bodyEl.appendChild(this.manageEl());
    else if (this.tab === 'math') this.bodyEl.appendChild(this.mathEl());
    else if (this.tab === 'real') this.bodyEl.appendChild(this.opts.real);
  }

  logEl() {
    const log = this.sim.st.log;
    const items = log.map(l => {
      if (l.kind === 'half') return h('div', { class: 'lg half' }, l.text);
      if (l.kind === 'sub') return h('div', { class: 'lg sub' }, '⇄ ' + l.text);
      if (l.kind === 'end') return h('div', { class: 'lg end' }, l.text);
      const scored = /score/.test(l.text) && l.kind === 'pa';
      const big = l.ev === 'HR';
      return h('div', { class: 'lg pa' + (scored ? ' scored' : '') + (big ? ' hr' : '') },
        h('span', { class: 'sc' }, `${l.outs}o`),
        h('span', { class: 'tx' }, l.text),
        scored ? h('span', { class: 'sc2' }, `${l.score[0]}–${l.score[1]}`) : null);
    });
    if (this.newestFirst) items.reverse();
    return h('div', null,
      h('label', { class: 'muted small' }, h('input', { type: 'checkbox', checked: this.newestFirst, onchange: e => { this.newestFirst = e.target.checked; this.renderBody(); } }), ' Newest first'),
      h('div', { class: 'log' }, items));
  }

  boxEl() {
    const sim = this.sim, st = sim.st;
    const wrap = h('div', { class: 'box2' });
    for (let ti = 0; ti < 2; ti++) {
      const t = sim.teams[ti];
      const rows = st.batSeen[ti].map(p => {
        const b = sim.bx(p);
        const cur = st.lineup[ti].find(x => x.p === p);
        return { cells: [h('td', { class: 'pn' }, playerLink({ p }), ' ', h('span', { class: 'muted' }, cur ? (POS[cur.pos] || '') : '')), b.ab, b.r, b.h, b.rbi, b.bb, b.k, b.hr + b.d + b.t > 0 ? [b.d ? b.d + ' 2B ' : '', b.t ? b.t + ' 3B ' : '', b.hr ? b.hr + ' HR' : ''].join('').trim() : ''] };
      });
      const tot = st.batSeen[ti].reduce((a, p) => { const b = sim.bx(p); for (const k of ['ab', 'r', 'h', 'rbi', 'bb', 'k']) a[k] += b[k]; return a; }, { ab: 0, r: 0, h: 0, rbi: 0, bb: 0, k: 0 });
      rows.push({ cls: 'tot', cells: ['Totals', tot.ab, tot.r, tot.h, tot.rbi, tot.bb, tot.k, ''] });
      const prow = st.pitSeen[ti].map(p => {
        const b = sim.pbx(p);
        return [h('td', { class: 'pn' }, playerLink({ p })), ip(b.outs), b.h, b.r, b.bb, b.k, b.hr, b.bf, b.pc];
      });
      wrap.appendChild(h('div', { class: 'boxteam' },
        h('h4', null, teamLabel(t)),
        table(['Batting', 'AB', 'R', 'H', 'RBI', 'BB', 'K', ''], rows, 'compact'),
        table(['Pitching', 'IP', 'H', 'R', 'BB', 'K', 'HR', 'BF', 'PC'], prow, 'compact')));
    }
    return wrap;
  }

  stratEl(ti) {
    const sim = this.sim, S = sim.strat[ti];
    const row = (label, key, opts) => h('label', { class: 'srow' }, label, select(opts, S[key], v => { S[key] = isNaN(+v) ? v : +v; sim.human(() => sim.rec({ pa: sim.st.paCount, t: 'strat', ti, key, v: S[key] })); }));
    return h('div', { class: 'strat' },
      h('div', { class: 'mu-role' }, 'Strategy (applies when the auto-manager is in charge)'),
      row('Stolen bases', 'steal', [[0, 'Never run'], [0.5, 'Cautious'], [1, 'Normal'], [1.6, 'Aggressive'], [2.5, 'Green light']]),
      row('Sacrifice bunts', 'bunt', [['default', 'League norm'], ['situational', 'Weak hitters bunt runners over']]),
      row('Intentional walks', 'ibb', [['default', 'League norm (rare)'], ['situational', 'Late, first base open, strong hitter']]),
      row('Infield in', 'infieldIn', [['default', 'Never'], ['situational', 'Late, runner on 3rd, close game']]),
      row('Starter’s leash', 'hook', [[0.8, 'Quick hook'], [1, 'Normal'], [1.2, 'Long leash']]));
  }

  // -------------------------------------------------------------- managers
  wobaVs(p, hand) {
    const r = p.bat && p.bat.vs && p.bat.vs[hand];
    if (!r) return null; let w = 0; for (let i = 0; i < 8; i++) w += WOBA_W[i] * r[i]; return w;
  }
  wobaAgainstVs(p, side) {
    const r = p.pit && p.pit.vs && p.pit.vs[side];
    if (!r) return null; let w = 0; for (let i = 0; i < 8; i++) w += WOBA_W[i] * r[i]; return w;
  }
  batLabel(p, ti) {
    const opp = this.sim.st.pitcher[1 - ti];
    const hand = opp ? opp.throws : 'R';
    const w = this.wobaVs(p, hand);
    const rt = p.S ? hitterRatings(p.S, p.idx) : null;
    return `${p.name} · bats ${p.bats}${p.throws ? '/throws ' + p.throws : ''} · ${f3(w != null ? w : p.bat.woba)} wOBA vs ${hand}HP${rt ? ' · OVR ' + rt.ovr : ''}`;
  }
  penLabel(p, ti) {
    const st = this.sim.st;
    const b = st.lineup[1 - ti][st.slot[1 - ti]];
    const side = b ? (b.p.bats === 'B' ? (p.throws === 'L' ? 'R' : 'L') : b.p.bats) : 'R';
    const w = this.wobaAgainstVs(p, side);
    const rt = p.S ? pitcherRatings(p.S, p.idx) : null;
    return `${p.name} · throws ${p.throws} · ${ROLE_NAME[p.role] || (p.role || 'RP')}${p.rotSlot ? ' #' + p.rotSlot : ''} · ${f3(w != null ? w : p.pit.wobaAgainst)} wOBA-a vs ${side}HB${rt ? ' · OVR ' + rt.ovr : ''}`;
  }

  mgrSwitch(ti) { const sim = this.sim; if (sim.opts.mgr[ti] === 'auto') { sim.opts.mgr[ti] = 'manual'; sim.human(() => sim.rec({ pa: sim.st.paCount, t: 'mgr', ti, v: 'manual' })); } }

  manageEl() {
    const sim = this.sim;
    const wrap = h('div', { class: 'manage' });
    wrap.appendChild(h('div', { class: 'card rulebar' },
      h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: !!sim.opts.threeBatter, onchange: e => { sim.opts.threeBatter = e.target.checked; sim.human(() => sim.rec({ pa: sim.st.paCount, t: 'rule', v: e.target.checked })); this.renderBody(); } }), ' Three-batter minimum (a reliever must face 3 batters or finish the inning)'),
      h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: !!sim.opts.explain, onchange: e => { sim.opts.explain = e.target.checked; this.refresh(); } }), ' Show the math (adds a “The math” tab for every plate appearance from now on)')));
    const cols = h('div', { class: 'box2' });
    for (let ti = 0; ti < 2; ti++) cols.appendChild(this.manageCol(ti));
    wrap.appendChild(cols);
    return wrap;
  }

  manageCol(ti) {
    const sim = this.sim, st = sim.st, t = sim.teams[ti];
    const mgrOpts = [['auto', 'Auto manager'], ['manual', 'You manage']];
    if (t.script && t.script.length) mgrOpts.unshift(['script', 'As played (real substitutions)']);
    const col = h('div', { class: 'mcol' });
    col.appendChild(h('h4', null, teamLabel(t)));
    col.appendChild(h('div', { class: 'row' }, 'Manager: ', select(mgrOpts, sim.opts.mgr[ti], v => { sim.opts.mgr[ti] = v; sim.human(() => sim.rec({ pa: st.paCount, t: 'mgr', ti, v })); this.renderBody(); })));
    col.appendChild(this.stratEl(ti));
    const lu = st.lineup[ti];
    const over = sim.isOver();
    const posOpts = [[2, 'C'], [3, '1B'], [4, '2B'], [5, '3B'], [6, 'SS'], [7, 'LF'], [8, 'CF'], [9, 'RF']].concat(sim.dh ? [[10, 'DH']] : []);
    col.appendChild(table(['#', 'Player', 'Bats', 'Pos', 'Today'], lu.map((x, i) => {
      const b = sim.bx(x.p);
      const posCell = (x.pos >= 2 && x.pos <= 10 && !over)
        ? h('td', null, (x.tag ? x.tag + '→' : ''), select(posOpts, x.pos, v => { const err = sim.human(() => sim.changePosition(ti, i, +v)); if (err) toast(err); else this.mgrSwitch(ti); this.refresh(); }, { class: 'possel' }))
        : h('td', null, (x.tag || '') + (x.pos === 1 ? 'P' : (x.pos >= 2 && x.pos <= 10 ? POS[x.pos] : '')));
      return { cls: (st.half === ti && st.slot[ti] === i && !over) ? 'now' : '', cells: [i + 1, h('td', null, playerLink({ p: x.p })), x.p.bats, posCell, `${b.h}-${b.ab}`] };
    }), 'compact'));
    const pit = st.pitcher[ti];
    col.appendChild(h('div', { class: 'muted small' }, 'Pitching: ', h('b', null, pit.name), ` (${pit.throws}HP, ${sim.pbx(pit).bf} BF)`));
    if (over) return col;
    const bench = sim.availBench[ti], pen = sim.availBull[ti];
    const rotation = (t.rotation || []).concat(t.extraStarters || []);
    const cands = [...new Set([...pen, ...rotation])].filter(p => p !== pit && !st.used.has(p.key) && !lu.some(x => x.p === p));
    if (cands.length) {
      let sel = cands[0].key;
      const can = sim.canChangePitcher(ti);
      const grp = (label, list) => list.length ? h('optgroup', { label }, list.map(p => h('option', { value: p.key }, this.penLabel(p, ti)))) : null;
      const selEl = h('select', { onchange: e => { sel = e.target.value; } }, grp('Bullpen', cands.filter(p => !rotation.includes(p))), grp('Rotation', cands.filter(p => rotation.includes(p))));
      col.appendChild(h('div', { class: 'act' }, h('b', null, 'Change pitcher '), selEl,
        h('button', { class: 'btn sm', disabled: !can, onclick: () => { const p = cands.find(x => x.key === sel); this.mgrSwitch(ti); if (!sim.changePitcher(ti, p, 'manager')) toast('Three-batter minimum: ' + sim.battersLeft(ti) + ' more batter(s) first.'); this.refresh(); } }, 'Bring in')));
      if (!can) col.appendChild(h('div', { class: 'small warn' }, `Three-batter minimum: ${pit.name} must face ${sim.battersLeft(ti)} more batter(s) or finish the inning.`));
    }
    if (t.rotation && t.rotation.length) {
      col.appendChild(h('div', { class: 'small muted' }, 'Rotation: ', t.rotation.map((p, i) => h('span', { class: 'chip' + (p === st.starter[ti] ? '' : ' alt') }, `${i + 1}. ${p.name} (${p.throws})`)), t.restInfo ? h('div', null, t.restInfo) : null));
    }
    const hitters = bench.filter(p => !rotation.includes(p));
    if (hitters.length) {
      let slotSel = st.slot[ti], sel = hitters[0].key;
      const opts = hitters.map(p => [p.key, this.batLabel(p, ti)]);
      col.appendChild(h('div', { class: 'act' }, h('b', null, 'Replace player '),
        select(lu.map((x, i) => [i, `${i + 1}. ${x.p.name} (${x.p.bats}) ${x.tag || POS[x.pos] || ''}`]), slotSel, v => { slotSel = +v; }),
        select(opts, sel, v => { sel = v; }),
        h('button', { class: 'btn sm', onclick: () => {
          const p = hitters.find(x => x.key === sel); this.mgrSwitch(ti);
          sim.human(() => { if (st.half === ti && slotSel === st.slot[ti] && lu[slotSel].pos !== 1) sim.pinchHit(ti, slotSel, p); else sim.defSub(ti, slotSel, p, lu[slotSel].pos === 1 ? 1 : undefined); });
          this.refresh(); } }, 'Make move')));
      const runners = [1, 2, 3].filter(b => st.bases[b] && st.bases[b].ti === ti);
      if (runners.length) {
        let rb = runners[0], rp = hitters[0].key;
        col.appendChild(h('div', { class: 'act' }, h('b', null, 'Pinch-run '),
          select(runners.map(b => [b, `${ordinal(b)}: ${st.bases[b].p.name}`]), rb, v => { rb = +v; }),
          select(opts, rp, v => { rp = v; }),
          h('button', { class: 'btn sm', onclick: () => { this.mgrSwitch(ti); sim.human(() => sim.pinchRun(ti, rb, hitters.find(x => x.key === rp))); this.refresh(); } }, 'Send in')));
      }
    }
    return col;
  }

  // -------------------------------------------------------------- the math
  mathEl() {
    const log = this.sim.st.log.filter(l => l.calc);
    if (!log.length) return h('p', { class: 'muted' }, 'Plate appearances from now on will show how the odds were built.');
    const wrap = h('div', { class: 'mathlist' });
    const pct = x => (x * 100).toFixed(1) + '%';
    for (const l of log.slice().reverse().slice(0, 40)) {
      const c = l.calc, m = c.meta || {};
      const rows = c.parts.map(x => ({ cls: x.ev === c.outcome ? 'now' : '', cells: [x.ev, pct(x.bat), pct(x.batLg), pct(x.pit), pct(x.pitLg), pct(x.env), (x.plat || 1).toFixed(2), (x.park || 1).toFixed(2), (x.fat || 1).toFixed(2), pct(x.prob)] }));
      wrap.appendChild(h('details', { class: 'mathrow', open: wrap.children.length === 0 },
        h('summary', null, `${c.batter} vs ${c.pitcher} → ${c.outcome}`),
        h('div', { class: 'small muted' }, `Method: ${m.method}. Batter bats ${m.side}, pitcher throws ${m.thr}. ${m.splitBat ? 'Used the batter’s own split vs ' + m.splitBat + 'HP. ' : 'No batter split (league platoon factor). '}${m.splitPit ? 'Used the pitcher’s own split vs ' + m.splitPit + 'HB. ' : 'No pitcher split. '}Fatigue ×${(m.fat || 1).toFixed(2)}. Roll ${typeof c.roll === 'number' ? c.roll.toFixed(4) : c.roll}.`),
        table(['Result', 'Batter', 'Bat lg', 'Pitcher', 'Pit lg', 'Env', 'Platoon', 'Park', 'Fatigue', 'Final'], rows, 'compact'),
        c.bip ? h('div', { class: 'small muted' }, 'Batted ball: ' + (typeof c.bip === 'string' ? c.bip : JSON.stringify(c.bip))) : null));
    }
    return wrap;
  }
}

function add(el, kids) { for (const k of kids) if (k) el.appendChild(k); return el; }
function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
