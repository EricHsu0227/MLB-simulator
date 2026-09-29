// Pre-game screen: set the batting order, positions, bench swaps and the starting pitcher for both teams.
import { h, clear, select, f3, POS } from './common.js';
import { playerLink } from './playercard.js';

const KEY = 'dsim.reviewLineups';
export const reviewOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };
export const setReview = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } };

const clone = t => ({ ...t, lineup: t.lineup.map(x => ({ p: x.p, pos: x.pos })), bench: (t.bench || []).slice(), bullpen: (t.bullpen || []).slice(), rotation: (t.rotation || []).slice() });
const POSOPTS = [[2, 'C'], [3, '1B'], [4, '2B'], [5, '3B'], [6, 'SS'], [7, 'LF'], [8, 'CF'], [9, 'RF'], [10, 'DH']];

/**
 * @param root container to render in
 * @param o {away, home, dh, title, subtitle, playLabel}
 * @returns Promise<{away, home, edited:[bool,bool]} | null>  (null = cancelled)
 */
export function editLineups(root, o) {
  return new Promise(resolve => {
    const orig = [o.away, o.home];
    const eds = orig.map(clone);
    const origKey = eds.map(t => sig(t));
    const dh = !!o.dh;
    const pitchersOf = (t, ot) => {
      const seen = new Set(), out = [];
      for (const p of [ot.sp, ...(ot.rotation || []), ...(ot.extraStarters || []), ...(ot.bullpen || [])]) if (p && !seen.has(p)) { seen.add(p); out.push(p); }
      return out;
    };
    const origPen = orig.map(t => (t.bullpen || []).slice());
    const wrap = h('div', { class: 'stack' });
    clear(root); root.appendChild(wrap);

    function draw() {
      clear(wrap);
      wrap.appendChild(h('div', null, h('h2', null, o.title || 'Set your lineups'), o.subtitle ? h('div', { class: 'muted' }, o.subtitle) : null));
      const cols = h('div', { class: 'box2' });
      for (let ti = 0; ti < 2; ti++) cols.appendChild(teamPanel(ti));
      wrap.appendChild(cols);
      const edited = eds.map((t, i) => sig(t) !== origKey[i]);
      wrap.appendChild(h('div', { class: 'card' },
        h('div', { class: 'row wrap between' },
          h('label', { class: 'muted' }, h('input', { type: 'checkbox', checked: reviewOn(), onchange: e => setReview(e.target.checked) }), ' Show this screen before every game'),
          h('div', { class: 'btnrow' },
            h('button', { class: 'btn', onclick: () => resolve(null) }, '‹ Back'),
            h('button', { class: 'btn primary big', onclick: () => resolve({ away: eds[0], home: eds[1], edited }) }, o.playLabel || '⚾ Play ball'))),
        edited.some(Boolean) && (orig[0].script?.length || orig[1].script?.length) ? h('p', { class: 'small warn' }, 'You changed a lineup, so this game’s real substitutions are switched off for the changed team(s); the auto-manager takes over.') : null));
    }

    function teamPanel(ti) {
      const t = eds[ti], ot = orig[ti];
      const pens = pitchersOf(t, ot);
      const box = h('div', { class: 'boxteam' });
      box.appendChild(h('h4', null, `${t.year ? t.year + ' ' : ''}${t.name} ${ti === 0 ? '(away)' : '(home)'}`));
      // starting pitcher
      box.appendChild(h('div', { class: 'srow' }, h('b', null, 'Starting pitcher'),
        select(pens.map(p => [p.key, `${p.name} (${p.throws}) · ${f3(p.pit.wobaAgainst)} wOBA-a · ~${Math.round(p.pit.endur)} BF`]), t.sp?.key, v => {
          const p = pens.find(x => x.key === v);
          t.sp = p; t.bullpen = origPen[ti].filter(x => x !== p);
          t.lineup = t.lineup.map(x => (x.pos === 1 ? { p, pos: 1 } : x));
          draw();
        })));
      if (t.sp) box.appendChild(h('div', { class: 'small' }, playerLink({ p: t.sp }, 'Open ' + t.sp.name + '’s card')));
      // lineup rows
      const dup = new Map();
      for (const x of t.lineup) if (x.pos !== 1) dup.set(x.pos, (dup.get(x.pos) || 0) + 1);
      const tbl = h('table', { class: 'tbl compact' }, h('thead', null, h('tr', null, ['#', '', 'Player', 'Pos', 'wOBA', 'Swap in'].map(x => h('th', null, x)))));
      const tb = h('tbody');
      t.lineup.forEach((x, i) => {
        const isP = x.pos === 1;
        const mv = (d) => { const j = i + d; if (j < 0 || j >= t.lineup.length) return; [t.lineup[i], t.lineup[j]] = [t.lineup[j], t.lineup[i]]; draw(); };
        const bench = t.bench.filter(b => b.bat);
        tb.appendChild(h('tr', { class: dup.get(x.pos) > 1 ? 'dupe' : '' },
          h('td', null, i + 1),
          h('td', { class: 'mv' }, h('button', { class: 'btn sm', onclick: () => mv(-1), disabled: i === 0 }, '▲'), h('button', { class: 'btn sm', onclick: () => mv(1), disabled: i === t.lineup.length - 1 }, '▼')),
          h('td', { class: 'pn' }, playerLink({ p: x.p }), ' ', h('span', { class: 'muted small' }, x.p.bats)),
          h('td', null, isP ? 'P' : select(POSOPTS.filter(([v]) => dh || v !== 10), x.pos, v => { x.pos = +v; draw(); })),
          h('td', null, isP ? '—' : f3(x.p.bat.woba)),
          h('td', null, isP ? '—' : select([['', 'Swap in…'], ...bench.map(b => [b.key, `${b.name} (${b.bats}) ${f3(b.bat.woba)}`])], '', v => {
            if (!v) return; const nb = bench.find(b => b.key === v);
            t.bench = t.bench.filter(b => b !== nb); t.bench.unshift(x.p); t.lineup[i] = { p: nb, pos: x.pos }; draw();
          }))));
      });
      tbl.appendChild(tb);
      box.appendChild(h('div', { class: 'tblwrap' }, tbl));
      if ([...dup.values()].some(n => n > 1)) box.appendChild(h('p', { class: 'small warn' }, 'Two players share a position — fine for the sim, but check it’s what you want.'));
      box.appendChild(h('div', { class: 'btnrow tight' },
        h('button', { class: 'btn sm', onclick: () => { const hit = t.lineup.filter(x => x.pos !== 1).sort((a, b) => b.p.bat.woba - a.p.bat.woba); const pit = t.lineup.filter(x => x.pos === 1); const order = [1, 0, 2, 3, 4, 5, 6, 7, 8]; const arranged = order.map(k => hit[k]).filter(Boolean); t.lineup = arranged.concat(pit); draw(); } }, 'Best hitters up top'),
        h('button', { class: 'btn sm', onclick: () => { eds[ti] = clone(orig[ti]); draw(); } }, 'Reset')));
      return box;
    }
    draw();
  });
}

function sig(t) { return t.sp?.key + '|' + t.lineup.map(x => x.p.key + ':' + x.pos).join(','); }

/** After editing: real-substitution scripts no longer line up, so hand those teams to the auto-manager. */
export function applyEdits(res) {
  if (res.edited[0]) res.away.script = null;
  if (res.edited[1]) res.home.script = null;
  return res;
}
