// Static viewer for a stored game record: line score, box score, play-by-play.
import { h, table, ip, spinner, clear, POS, fmtDate } from './common.js';
import { getLog } from '../store.js';

const nameOf = t => (t.year ? t.year + ' ' : '') + t.name;

export function boxTables(g) {
  const wrap = h('div', { class: 'box2' });
  for (let ti = 0; ti < 2; ti++) {
    const t = ti === 0 ? g.away : g.home;
    const rows = g.batting[ti].map(b => {
      const s = b.s;
      const xb = [s.d ? s.d + ' 2B' : '', s.t ? s.t + ' 3B' : '', s.hr ? s.hr + ' HR' : ''].filter(Boolean).join(' ');
      return [h('td', { class: 'pn' }, b.name, ' ', h('span', { class: 'muted' }, b.pos ? POS[b.pos] || '' : '')), s.ab || 0, s.r || 0, s.h || 0, s.rbi || 0, s.bb || 0, s.k || 0, xb];
    });
    const tot = g.batting[ti].reduce((a, b) => { for (const k of ['ab', 'r', 'h', 'rbi', 'bb', 'k']) a[k] += b.s[k] || 0; return a; }, { ab: 0, r: 0, h: 0, rbi: 0, bb: 0, k: 0 });
    rows.push({ cls: 'tot', cells: ['Totals', tot.ab, tot.r, tot.h, tot.rbi, tot.bb, tot.k, ''] });
    const prow = g.pitching[ti].map(p => {
      const s = p.s; const dec = g.dec.W === p.k ? ' (W)' : g.dec.L === p.k ? ' (L)' : g.dec.SV === p.k ? ' (SV)' : '';
      return [h('td', { class: 'pn' }, p.name + dec), ip(s.outs || 0), s.h || 0, s.r || 0, s.bb || 0, s.k || 0, s.hr || 0, s.bf || 0, s.pc || 0];
    });
    wrap.appendChild(h('div', { class: 'boxteam' }, h('h4', null, nameOf(t)),
      table(['Batting', 'AB', 'R', 'H', 'RBI', 'BB', 'K', ''], rows, 'compact'),
      table(['Pitching', 'IP', 'H', 'R', 'BB', 'K', 'HR', 'BF', 'PC'], prow, 'compact')));
  }
  return wrap;
}

export function lineScore(g) {
  const n = Math.max(9, g.lineScore[0].length, g.lineScore[1].length);
  const row = ti => [h('td', { class: 'tname' }, (ti ? g.home : g.away).code), ...Array.from({ length: n }, (_, i) => h('td', null, g.lineScore[ti][i] ?? '')), h('td', { class: 'tot' }, g.score[ti]), h('td', { class: 'tot' }, g.hits[ti])];
  return h('div', { class: 'gv-board' }, h('table', { class: 'linescore' },
    h('thead', null, h('tr', null, ['', ...Array.from({ length: n }, (_, i) => i + 1), 'R', 'H'].map(x => h('th', null, x)))),
    h('tbody', null, h('tr', null, row(0)), h('tr', null, row(1)))));
}

export function logList(log) {
  const items = log.map(l => {
    if (l.k === 'half') return h('div', { class: 'lg half' }, l.t);
    if (l.k === 'sub') return h('div', { class: 'lg sub' }, '⇄ ' + l.t);
    if (l.k === 'end') return h('div', { class: 'lg end' }, l.t);
    const scored = /score/.test(l.t) && l.k === 'pa';
    return h('div', { class: 'lg pa' + (scored ? ' scored' : '') + (l.e === 'HR' ? ' hr' : '') }, h('span', { class: 'sc' }, `${l.o}o`), h('span', { class: 'tx' }, l.t), scored ? h('span', { class: 'sc2' }, `${l.s[0]}–${l.s[1]}`) : null);
  });
  return h('div', { class: 'log' }, items);
}

/** Full detail view for a stored game. */
export function gameDetail(g, opts = {}) {
  const wrap = h('div', { class: 'stack' });
  wrap.appendChild(h('div', null, h('div', { class: 'gv-h1' }, `${nameOf(g.away)} ${g.score[0]}, ${nameOf(g.home)} ${g.score[1]}`),
    h('div', { class: 'muted' }, [g.date ? fmtDate(g.date) : new Date(g.ts).toLocaleString(), g.label, g.park].filter(Boolean).join(' · '))));
  wrap.appendChild(lineScore(g));
  const players = k => [...g.batting[0], ...g.batting[1], ...g.pitching[0], ...g.pitching[1]].find(x => x.k === k)?.name;
  if (g.dec.W) wrap.appendChild(h('div', { class: 'muted' }, `W: ${players(g.dec.W)}  ·  L: ${players(g.dec.L) || '—'}${g.dec.SV ? '  ·  SV: ' + players(g.dec.SV) : ''}`));
  wrap.appendChild(boxTables(g));
  const logBox = h('div', null, spinner('Loading play-by-play…'));
  wrap.appendChild(h('h3', null, 'Play-by-play'));
  wrap.appendChild(logBox);
  getLog(g.id).then(log => { clear(logBox); logBox.appendChild(log ? logList(log) : h('p', { class: 'muted' }, 'No play-by-play stored for this game.')); }).catch(() => { clear(logBox); logBox.appendChild(h('p', { class: 'muted' }, 'Play-by-play unavailable.')); });
  return wrap;
}
