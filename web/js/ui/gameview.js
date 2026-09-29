// Live game viewer: scoreboard, diamond, play-by-play, box score, manager controls.
import { h, clear, ip, f3, select, table, POS } from './common.js';
import { ordinal } from '../engine.js';
import { batLine } from '../data.js';

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

  destroy() { this.stop(); }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.updateCtrl(); }

  // ------------------------------------------------------------ actions
  step(kind) {
    const sim = this.sim;
    if (sim.isOver()) return;
    if (kind === 'pa') sim.playPA();
    else if (kind === 'half') sim.playHalf();
    else if (kind === 'inning') {
      const i = sim.st.inning; let g = 0;
      while (!sim.isOver() && sim.st.inning === i && g++ < 400) sim.playHalf();
    } else if (kind === 'end') sim.playGame();
    this.refresh();
    if (sim.isOver()) { this.stop(); this.finished(); }
  }
  auto() {
    if (this.timer) { this.stop(); return; }
    const speed = { slow: 900, medium: 350, fast: 90 }[this.speed || 'medium'];
    this.timer = setInterval(() => { this.step('pa'); }, speed);
    this.updateCtrl();
  }
  finished() {
    if (this._fin) return;
    this._fin = true;
    this.tab = 'box';
    this.refresh();
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
      cells.push(h('td', { class: 'tot' }, st.score[ti]), h('td', { class: 'tot' }, st.hits[ti]));
      return cells;
    };
    clear(this.boardEl);
    this.boardEl.appendChild(h('table', { class: 'linescore' },
      h('thead', null, h('tr', null, head.map(x => h('th', null, x)))),
      h('tbody', null, h('tr', null, row(0)), h('tr', null, row(1)))));
  }

  renderField() {
    const sim = this.sim, st = sim.st;
    clear(this.fieldEl);
    const over = sim.isOver();
    const bt = st.half, ft = 1 - st.half;
    const bases = st.bases;
    const pos = { 1: [168, 108], 2: [110, 52], 3: [52, 108] };
    let svg = `<svg viewBox="0 0 220 190" class="diamond" role="img" aria-label="Baseball diamond">
      <polygon points="110,160 178,108 110,48 42,108" class="dia-fill"/>
      <polygon points="110,160 178,108 110,48 42,108" class="dia-line"/>`;
    for (const b of [1, 2, 3]) {
      const [x, y] = pos[b];
      svg += `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" transform="rotate(45 ${x} ${y})" class="base ${bases[b] ? 'occ' : ''}"/>`;
      if (bases[b]) svg += `<text x="${x}" y="${y + (b === 2 ? -14 : 24)}" text-anchor="${b === 1 ? 'start' : b === 3 ? 'end' : 'middle'}" class="rname" dx="${b === 1 ? -6 : b === 3 ? 6 : 0}">${esc(short(bases[b].p.name))}</text>`;
    }
    svg += `<polygon points="110,166 102,158 102,152 118,152 118,158" class="home"/>`;
    for (let i = 0; i < 3; i++) svg += `<circle cx="${22 + i * 16}" cy="176" r="5" class="out ${st.outs > i ? 'on' : ''}"/>`;
    svg += `<text x="12" y="16" class="inn">${over ? 'Final' : (st.half ? '▼' : '▲') + ' ' + ordinal(st.inning)}</text></svg>`;
    const dia = h('div', { html: svg });
    let mu = null;
    if (!over) {
      const b = sim.currentBatter();
      const pit = st.pitcher[ft];
      const bb = sim.bx(b.p), pb = sim.pbx(pit);
      const S = b.p.S;
      const line = S ? batLine(S, b.p.idx) : null;
      const pl = pit.S ? pit.S.pitRows.get(pit.idx) : null;
      mu = h('div', { class: 'matchup' },
        h('div', { class: 'mu-side' },
          h('div', { class: 'mu-role' }, 'At bat'),
          h('div', { class: 'mu-name' }, b.p.name, ' ', h('span', { class: 'chip' }, POS[b.pos] || b.pos), ' ', h('span', { class: 'chip alt' }, 'bats ' + b.p.bats)),
          h('div', { class: 'muted' }, `Today ${bb.h}-${bb.ab}${bb.bb ? ', ' + bb.bb + ' BB' : ''}${bb.hr ? ', ' + bb.hr + ' HR' : ''}${bb.k ? ', ' + bb.k + ' K' : ''}`),
          line ? h('div', { class: 'muted' }, `${b.p.y}: ${f3(line.avg)}/${f3(line.obp)}/${f3(line.slg)}, wOBA ${f3(line.woba)}`) : null),
        h('div', { class: 'mu-side' },
          h('div', { class: 'mu-role' }, 'Pitching'),
          h('div', { class: 'mu-name' }, pit.name, ' ', h('span', { class: 'chip alt' }, pit.throws + 'HP'), sim.isStarterOfGame(ft) ? h('span', { class: 'chip' }, 'SP') : h('span', { class: 'chip' }, (pit.role || 'RP').toUpperCase())),
          h('div', { class: 'muted' }, `${pb.bf} BF · ${ip(pb.outs)} IP · ${pb.r} R · ~${pb.pc} pitches`),
          h('div', { class: 'muted' }, `${pit.y} wOBA against ${f3(pit.pit.wobaAgainst)} · usual ${Math.round(pit.pit.endur)} BF`)));
    }
    add(this.fieldEl, [dia, mu]);
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
    const b = (label, fn, cls = '') => h('button', { class: 'btn ' + cls, onclick: fn }, label);
    add(this.ctrlEl, [
      b('Next batter', () => this.step('pa'), 'primary'),
      b('Finish half-inning', () => this.step('half')),
      b('Finish inning', () => this.step('inning')),
      b('Sim to end', () => this.step('end')),
      h('div', { class: 'auto' },
        b(this.timer ? '❚❚ Pause' : '▶ Auto-play', () => this.auto()),
        select([['slow', 'Slow'], ['medium', 'Medium'], ['fast', 'Fast']], this.speed || 'medium', v => { this.speed = v; if (this.timer) { this.stop(); this.auto(); } })),
    ]);
  }

  renderTabs() {
    clear(this.tabsEl);
    const tabs = [['log', 'Play-by-play'], ['box', 'Box score'], ['manage', 'Managers']];
    if (this.opts.real) tabs.push(['real', this.opts.realTitle || 'Real game']);
    for (const [k, l] of tabs) this.tabsEl.appendChild(h('button', { class: 'tab' + (this.tab === k ? ' on' : ''), onclick: () => { this.tab = k; this.renderTabs(); this.renderBody(); } }, l));
  }

  renderBody() {
    clear(this.bodyEl);
    if (this.tab === 'log') this.bodyEl.appendChild(this.logEl());
    else if (this.tab === 'box') this.bodyEl.appendChild(this.boxEl());
    else if (this.tab === 'manage') this.bodyEl.appendChild(this.manageEl());
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
        return { cells: [h('td', { class: 'pn' }, p.name, ' ', h('span', { class: 'muted' }, cur ? (POS[cur.pos] || '') : '')), b.ab, b.r, b.h, b.rbi, b.bb, b.k, b.hr + b.d + b.t > 0 ? [b.d ? b.d + ' 2B ' : '', b.t ? b.t + ' 3B ' : '', b.hr ? b.hr + ' HR' : ''].join('').trim() : ''] };
      });
      const tot = st.batSeen[ti].reduce((a, p) => { const b = sim.bx(p); for (const k of ['ab', 'r', 'h', 'rbi', 'bb', 'k']) a[k] += b[k]; return a; }, { ab: 0, r: 0, h: 0, rbi: 0, bb: 0, k: 0 });
      rows.push({ cls: 'tot', cells: ['Totals', tot.ab, tot.r, tot.h, tot.rbi, tot.bb, tot.k, ''] });
      const prow = st.pitSeen[ti].map(p => {
        const b = sim.pbx(p);
        return [h('td', { class: 'pn' }, p.name), ip(b.outs), b.h, b.r, b.bb, b.k, b.hr, b.bf, b.pc];
      });
      wrap.appendChild(h('div', { class: 'boxteam' },
        h('h4', null, teamLabel(t)),
        table(['Batting', 'AB', 'R', 'H', 'RBI', 'BB', 'K', ''], rows, 'compact'),
        table(['Pitching', 'IP', 'H', 'R', 'BB', 'K', 'HR', 'BF', 'PC'], prow, 'compact')));
    }
    return wrap;
  }

  manageEl() {
    const sim = this.sim, st = sim.st;
    const wrap = h('div', { class: 'manage' });
    for (let ti = 0; ti < 2; ti++) {
      const t = sim.teams[ti];
      const mgrOpts = [['auto', 'Auto manager'], ['manual', 'You manage']];
      if (t.script && t.script.length) mgrOpts.unshift(['script', 'As played (real substitutions)']);
      const col = h('div', { class: 'mcol' });
      col.appendChild(h('h4', null, teamLabel(t)));
      col.appendChild(h('div', { class: 'row' }, 'Manager: ', select(mgrOpts, sim.opts.mgr[ti], v => { sim.opts.mgr[ti] = v; this.renderBody(); })));
      // lineup
      const lu = st.lineup[ti];
      col.appendChild(table(['#', 'Player', 'Pos', 'Today'], lu.map((x, i) => {
        const b = sim.bx(x.p);
        return { cls: (st.half === ti && st.slot[ti] === i && !sim.isOver()) ? 'now' : '', cells: [i + 1, x.p.name, POS[x.pos] || x.pos, `${b.h}-${b.ab}`] };
      }), 'compact'));
      const pit = st.pitcher[ti];
      col.appendChild(h('div', { class: 'muted small' }, 'Pitching: ', h('b', null, pit.name), ` (${sim.pbx(pit).bf} BF)`));
      if (!sim.isOver()) {
        const bench = sim.availBench[ti], pen = sim.availBull[ti];
        // pitching change
        if (pen.length) {
          let sel = pen[0].key;
          col.appendChild(h('div', { class: 'act' }, h('b', null, 'Change pitcher '),
            select(pen.map(p => [p.key, `${p.name} · ${(p.role || 'RP')} · ${f3(p.pit.wobaAgainst)} wOBA-a`]), sel, v => { sel = v; }),
            h('button', { class: 'btn sm', onclick: () => { const p = pen.find(x => x.key === sel); sim.opts.mgr[ti] = sim.opts.mgr[ti] === 'auto' ? 'manual' : sim.opts.mgr[ti]; sim.replacePitcher(ti, p, 'manager'); this.refresh(); } }, 'Bring in')));
        }
        if (bench.length) {
          let sel = bench[0].key, slotSel = st.slot[ti];
          const opts = bench.map(p => [p.key, `${p.name} (${p.bats}) · wOBA ${f3(p.bat.woba)}`]);
          col.appendChild(h('div', { class: 'act' }, h('b', null, 'Pinch-hit / replace '),
            select(lu.map((x, i) => [i, `${i + 1}. ${x.p.name}`]), slotSel, v => { slotSel = +v; }),
            select(opts, sel, v => { sel = v; }),
            h('button', { class: 'btn sm', onclick: () => { const p = bench.find(x => x.key === sel); if (st.half === ti && slotSel === st.slot[ti]) sim.pinchHit(ti, slotSel, p); else sim.defSub(ti, slotSel, p, lu[slotSel].pos); sim.opts.mgr[ti] = sim.opts.mgr[ti] === 'auto' ? 'manual' : sim.opts.mgr[ti]; this.refresh(); } }, 'Make move')));
          const runners = [1, 2, 3].filter(b => st.bases[b] && st.bases[b].ti === ti);
          if (runners.length) {
            let rb = runners[0], rp = bench[0].key;
            col.appendChild(h('div', { class: 'act' }, h('b', null, 'Pinch-run '),
              select(runners.map(b => [b, `${ordinal(b)}: ${st.bases[b].p.name}`]), rb, v => { rb = +v; }),
              select(opts, rp, v => { rp = v; }),
              h('button', { class: 'btn sm', onclick: () => { sim.pinchRun(ti, rb, bench.find(x => x.key === rp)); this.refresh(); } }, 'Send in')));
          }
        }
      }
      wrap.appendChild(col);
    }
    return wrap;
  }
}

function add(el, kids) { for (const k of kids) if (k) el.appendChild(k); return el; }
function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
