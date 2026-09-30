// Player card: essential stats + Baseball Savant / Statcast, opened by clicking any player name.
import { h, clear, ip, table } from './common.js';
import { loadSeason, loadCareer, getIndex } from '../data.js';
import { batStats, pitStats, fmt, splitStats, splitFromArr, pseudoSeason, quickOvr, hitterRatings, pitcherRatings } from '../pstats.js';
import { ROLE_NAME } from '../teams.js';
import { savantFor, mlbamFor } from '../savant.js';

const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'tv' }, value), h('div', { class: 'tl' }, label), sub ? h('div', { class: 'ts muted' }, sub) : null);
const grid = tiles => h('div', { class: 'tiles' }, tiles);

export function playerLink(ref, label) {
  return h('a', { class: 'plink', href: '#', title: 'Player card', onclick: e => { e.preventDefault(); e.stopPropagation(); openPlayerCard(ref); } }, label ?? (ref.p ? ref.p.name : ref.name));
}


const r3 = fmt.r3;
const ratingBar = (label, v) => h('div', { class: 'rbar' }, h('span', { class: 'rl' }, label), h('span', { class: 'rtrack' }, h('i', { style: `width:${Math.max(4, (v - 20) / 60 * 100)}%`, class: v >= 65 ? 'hi' : v >= 50 ? 'mid' : 'lo' })), h('b', null, v));
function ratingCard(title, r, bars) {
  return h('div', { class: 'rcard' },
    h('div', { class: 'ovr ' + (r.ovr >= 80 ? 'a' : r.ovr >= 65 ? 'b' : r.ovr >= 50 ? 'c' : 'd') }, h('b', null, r.ovr), h('span', null, 'OVR')),
    h('div', { class: 'rbars' }, h('div', { class: 'mu-role' }, `${title} — ${r.tier}`), bars.map(([l, k]) => ratingBar(l, r[k]))));
}
const splitRow = (label, l) => l ? [label, l.pa, r3(l.avg), r3(l.obp), r3(l.slg), r3(l.ops), l.hr, fmt.p1(l.bbpct), fmt.p1(l.kpct), r3(l.woba)] : [label, 0, '', '', '', '', '', '', '', ''];
const spark = (vals, labels, base, fmtv = x => Math.round(x)) => {
  const ok = vals.filter(v => v != null);
  if (ok.length < 2) return null;
  const lo = Math.min(...ok, base), hi = Math.max(...ok, base), w = 28, H = 84;
  const y = v => H - 12 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 30);
  let g = `<line x1="0" x2="${vals.length * w}" y1="${y(base)}" y2="${y(base)}" class="sbase"/>`;
  vals.forEach((v, i) => {
    if (v == null) return;
    const top = Math.min(y(v), y(base)), ht = Math.max(2, Math.abs(y(v) - y(base)));
    g += `<rect x="${i * w + 4}" y="${top}" width="${w - 8}" height="${ht}" class="${v >= base ? 'up' : 'dn'}"/><text x="${i * w + w / 2}" y="${top - 2}" text-anchor="middle">${fmtv(v)}</text>`;
  });
  labels.forEach((l, i) => { g += `<text x="${i * w + w / 2}" y="${H - 1}" text-anchor="middle" class="sy">'${String(l).slice(2)}</text>`; });
  return h('div', { class: 'sparkwrap' }, h('div', { html: `<svg viewBox="0 0 ${vals.length * w} ${H}" style="width:${vals.length * w}px;height:${H}px" class="sparksvg">${g}</svg>` }));
};

export async function openPlayerCard(ref) {
  const overlay = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  const sheet = h('div', { class: 'sheet wide' });
  overlay.appendChild(sheet);
  const close = () => { overlay.remove(); document.body.classList.remove('noscroll'); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay); document.body.classList.add('noscroll');
  const headName = h('div', { class: 'gv-h1' }, ref.p ? ref.p.name : ref.name);
  sheet.appendChild(h('div', { class: 'sheet-head' }, headName, h('button', { class: 'btn sm', onclick: close }, '✕ Close')));
  const meta = h('div', { class: 'muted' });
  const tabsEl = h('div', { class: 'tabs' });
  const body = h('div', { class: 'stack' }, h('div', { class: 'spin' }, h('span', { class: 'dot' }), 'Loading…'));
  sheet.append(meta, tabsEl, body);

  try {
    let S, idx;
    if (ref.p) { S = ref.p.S; idx = ref.p.idx; }
    else {
      S = ref.S || (ref.y >= 2026 ? null : await loadSeason(ref.y));
      idx = S ? S.playersById.get(ref.id)?.idx : undefined;
    }
    const info = S && idx !== undefined ? S.players[idx] : { name: ref.name || '?', bats: '?', throws: '?', id: ref.id };
    const mlbam = info.mlbam || (info.id && !String(info.id).startsWith('mlb') ? await mlbamFor(info.id) : (String(info.id).startsWith('mlb') ? +String(info.id).slice(3) : null));
    const year = S ? S.y : ref.y;
    const hand = { R: 'Right', L: 'Left', B: 'Switch' };
    meta.textContent = `${year} season · bats ${hand[info.bats] || info.bats} · throws ${hand[info.throws] || info.throws}${ref.p && ref.p.lg ? ' · ' + ref.p.lg : ''}`;
    const b = S && idx !== undefined ? batStats(S, idx) : null;
    const p = S && idx !== undefined ? pitStats(S, idx) : null;
    const isPit = !!(p && p.bf >= (b ? b.pa : 0) && p.bf >= 30) || (!!p && !b);
    const showBat = !!(b && (!isPit || b.pa >= 40));
    const hr = showBat && S.bspMap !== undefined ? hitterRatings(S, idx) : (showBat ? hitterRatings(S, idx) : null);
    const pr = p ? pitcherRatings(S, idx) : null;
    const tabDefs = [['season', `${year} season`], ['splits', 'Lefty / righty'], ['career', 'Every season'], ['savant', 'Statcast']];
    let cur = 'season';
    const built = {};
    const show = k => { cur = k; clear(tabsEl); tabDefs.forEach(([kk, l]) => tabsEl.appendChild(h('button', { class: 'tab' + (cur === kk ? ' on' : ''), onclick: () => show(kk) }, l))); clear(body); if (!built[k]) built[k] = mk[k](); body.appendChild(built[k]); if (k === 'savant' && !built.savantLoaded) { built.savantLoaded = true; loadSavant(); } };

    const mk = {
      season() {
        const w = h('div', { class: 'stack' });
        if (!b && !p) w.appendChild(h('p', { class: 'muted' }, `No ${year} regular-season stats on file for this player.`));
        if (hr || pr) w.appendChild(h('div', { class: 'rrow' }, hr ? ratingCard('As a hitter', hr, [['Contact', 'contact'], ['Power', 'power'], ['Eye', 'eye'], ['Speed', 'speed']]) : null, pr ? ratingCard('As a pitcher', pr, [['Stuff', 'stuff'], ['Control', 'control'], ['Contact mgmt', 'contact'], ['Stamina', 'stamina']]) : null));
        if (hr || pr) w.appendChild(h('p', { class: 'muted small' }, 'Ratings are 20–80 (50 = league average) with a 1–99 overall, built from this season’s real rates and shrunk toward average for small samples. They summarise the player; the simulator itself uses the underlying rates.'));
        if (ref.p && ref.p.roleWhy) w.appendChild(h('div', { class: 'card' }, h('b', null, 'Role: '), ref.p.roleWhy));
        if (showBat) {
          w.appendChild(h('h3', null, 'Batting'));
          w.appendChild(grid([
            tile('AVG / OBP / SLG', `${r3(b.avg)} / ${r3(b.obp)} / ${r3(b.slg)}`), tile('OPS', r3(b.ops)), tile('wOBA', r3(b.woba)), tile('wRC+', b.wrcPlus, '100 = league avg'),
            tile('ISO', r3(b.iso)), tile('BABIP', r3(b.babip)), tile('K%', fmt.p1(b.kpct)), tile('BB%', fmt.p1(b.bbpct)), tile('HR%', fmt.p1(b.hrpct)),
            tile('PA', b.pa), tile('HR', b.hr), tile('SB / CS', `${b.sb} / ${b.cs}`, b.sb + b.cs ? fmt.p1(b.sbPct) + ' success' : ''),
          ]));
          if (b.bipN >= 20) w.appendChild(grid([tile('Ground ball %', fmt.p1(b.gb)), tile('Line drive %', fmt.p1(b.ld)), tile('Fly ball %', fmt.p1(b.fb)), tile('Pull %', fmt.p1(b.pull)), tile('Center %', fmt.p1(b.ctr)), tile('Oppo %', fmt.p1(b.opp))]));
        }
        if (p) {
          w.appendChild(h('h3', null, 'Pitching'));
          w.appendChild(grid([
            tile(p.eraLabel, fmt.d2(p.era)), tile('FIP', fmt.d2(p.fip)), tile('WHIP', fmt.d2(p.whip)), tile('IP', ip(Math.round(p.ip * 3)), `${p.g} G, ${p.gs} GS`),
            tile('K%', fmt.p1(p.kpct)), tile('BB%', fmt.p1(p.bbpct)), tile('K−BB%', fmt.p1(p.kbb)), tile('K/9', fmt.d1(p.k9)), tile('BB/9', fmt.d1(p.bb9)), tile('HR/9', fmt.d2(p.hr9)),
            tile('BABIP against', r3(p.babip)), tile('wOBA against', r3(p.woba)), tile('SV', p.sv),
          ]));
          if (p.bipN >= 30) w.appendChild(grid([tile('GB% allowed', fmt.p1(p.gb)), tile('LD% allowed', fmt.p1(p.ld)), tile('FB% allowed', fmt.p1(p.fb))]));
        }
        if (ref.p && ref.p.bat) w.appendChild(h('p', { class: 'muted small' }, `How the simulator rates him: park-neutral wOBA ${r3(ref.p.bat.woba)} as a hitter${ref.p.pit && ref.p.pit.bf ? `, ${r3(ref.p.pit.wobaAgainst)} wOBA against as a pitcher` : ''}.`));
        return w;
      },
      splits() {
        const w = h('div', { class: 'stack' });
        const bs = S && idx !== undefined ? splitStats(S, idx, 'bat') : null;
        const ps = S && idx !== undefined ? splitStats(S, idx, 'pit') : null;
        if (!bs && !ps) w.appendChild(h('p', { class: 'muted' }, 'No left/right split data for this season.'));
        const head = ['', 'PA', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'BB%', 'K%', 'wOBA'];
        if (bs && showBat) {
          w.appendChild(h('h3', null, 'Hitting vs. left- and right-handed pitchers'));
          w.appendChild(table(head, [splitRow('vs LHP', bs.L), splitRow('vs RHP', bs.R), splitRow('Overall', { pa: b.pa, avg: b.avg, obp: b.obp, slg: b.slg, ops: b.ops, hr: b.hr, bbpct: b.bbpct, kpct: b.kpct, woba: b.woba })], 'compact'));
          if (ref.p && ref.p.bat && ref.p.bat.vs) {
            const wv = k => { const r = ref.p.bat.vs[k]; if (!r) return '—'; let x = 0; for (let i = 0; i < 8; i++) x += [0, 0.69, 0.72, 0.88, 1.24, 1.56, 2.08, 0][i] * r[i]; return r3(x); };
            w.appendChild(h('p', { class: 'muted small' }, `What the simulator uses (his split regressed toward his overall line and the league platoon effect, park-neutral): vs LHP ${wv('L')} wOBA, vs RHP ${wv('R')} wOBA.`));
          }
        }
        if (ps && (isPit || !showBat)) {
          w.appendChild(h('h3', null, 'Pitching vs. left- and right-handed batters'));
          w.appendChild(table(['', 'BF', 'AVG', 'OBP', 'SLG', 'OPS', 'HR', 'BB%', 'K%', 'wOBA against'], [splitRow('vs LHB', ps.L), splitRow('vs RHB', ps.R)], 'compact'));
        }
        if (bs && !showBat && !ps) w.appendChild(h('p', { class: 'muted small' }, 'Not enough plate appearances for a meaningful hitting split.'));
        return w;
      },
      career() {
        const w = h('div', { class: 'stack' }, h('div', { class: 'spin' }, h('span', { class: 'dot' }), 'Loading every season…'));
        (async () => {
          const c = info.id && !String(info.id).startsWith('mlb') ? await loadCareer(info.id) : null;
          clear(w);
          if (!c) { w.appendChild(h('p', { class: 'muted' }, 'No multi-season history for this player (live-season players start their history in 2026).')); return; }
          const ix = getIndex();
          const ctxOf = y => (ix && ix.ctx && ix.ctx[y]) || [0.32, 0.115, 4.3, 3.1];
          const rows = c.y.map(([y, tm, bat, pit, bsp, psp]) => {
            const ctx = ctxOf(y), ps = pseudoSeason(ctx, bat, pit);
            const bb = bat ? batStats(ps, 0) : null, pp = pit ? pitStats(ps, 0) : null;
            return { y, tm, bb, pp, ov: quickOvr(ctx, bb, pp), bsp, psp, ctx };
          });
          const hit = rows.filter(r => r.bb && r.bb.pa >= 20), pit = rows.filter(r => r.pp && r.pp.bf >= 20);
          w.appendChild(h('div', { class: 'muted small' }, `${c.n} · ${rows[0].y}–${rows[rows.length - 1].y} · regular seasons only`));
          if (hit.length) {
            w.appendChild(h('h3', null, 'Batting by season'));
            const tot = hit.reduce((a, r) => { a.pa += r.bb.pa; a.ab += r.bb.ab; a.h += r.bb.h; a.hr += r.bb.hr; a.bb += r.bb.bb; a.k += r.bb.k; a.sb += r.bb.sb; a.tb += r.bb.slg * r.bb.ab; a.ob += r.bb.obp * r.bb.pa; a.wo += r.bb.woba * r.bb.pa; a.wrc += r.bb.wrcPlus * r.bb.pa; return a; }, { pa: 0, ab: 0, h: 0, hr: 0, bb: 0, k: 0, sb: 0, tb: 0, ob: 0, wo: 0, wrc: 0 });
            const trs = hit.map(r => ({ cells: [r.y, r.tm, r.bb.pa, `${r3(r.bb.avg)}/${r3(r.bb.obp)}/${r3(r.bb.slg)}`, r.bb.hr, fmt.p1(r.bb.bbpct), fmt.p1(r.bb.kpct), r.bb.sb, r3(r.bb.woba), r.bb.wrcPlus, r.ov.bat ?? ''] }));
            trs.push({ cls: 'tot', cells: ['Career', '', tot.pa, `${r3(tot.h / tot.ab)}/${r3(tot.ob / tot.pa)}/${r3(tot.tb / tot.ab)}`, tot.hr, fmt.p1(tot.bb / tot.pa), fmt.p1(tot.k / tot.pa), tot.sb, r3(tot.wo / tot.pa), Math.round(tot.wrc / tot.pa), ''] });
            w.appendChild(table(['Year', 'Tm', 'PA', 'AVG/OBP/SLG', 'HR', 'BB%', 'K%', 'SB', 'wOBA', 'wRC+', 'OVR'], trs, 'compact'));
            const sp1 = spark(hit.map(r => r.bb.wrcPlus), hit.map(r => r.y), 100);
            if (sp1) w.appendChild(h('div', null, h('div', { class: 'mu-role' }, 'wRC+ by season (100 = league average)'), sp1));
          }
          if (pit.length) {
            w.appendChild(h('h3', null, 'Pitching by season'));
            const tot = pit.reduce((a, r) => { a.g += r.pp.g; a.gs += r.pp.gs; a.ip += r.pp.ip; a.bf += r.pp.bf; a.k += r.pp.k; a.bb += r.pp.bb; a.hr += r.pp.hr; a.er += r.pp.era * r.pp.ip / 9; a.h += r.pp.h; a.sv += r.pp.sv; a.wo += r.pp.woba * r.pp.bf; return a; }, { g: 0, gs: 0, ip: 0, bf: 0, k: 0, bb: 0, hr: 0, er: 0, h: 0, sv: 0, wo: 0 });
            const trs = pit.map(r => ({ cells: [r.y, r.tm, r.pp.g, r.pp.gs, ip(Math.round(r.pp.ip * 3)), fmt.d2(r.pp.era), fmt.d2(r.pp.fip), fmt.d2(r.pp.whip), fmt.p1(r.pp.kpct), fmt.p1(r.pp.bbpct), r3(r.pp.woba), r.pp.sv, r.ov.pit ?? ''] }));
            trs.push({ cls: 'tot', cells: ['Career', '', tot.g, tot.gs, ip(Math.round(tot.ip * 3)), fmt.d2(tot.er * 9 / tot.ip), '', fmt.d2((tot.h + tot.bb) / tot.ip), fmt.p1(tot.k / tot.bf), fmt.p1(tot.bb / tot.bf), r3(tot.wo / tot.bf), tot.sv, ''] });
            w.appendChild(table(['Year', 'Tm', 'G', 'GS', 'IP', 'ERA', 'FIP', 'WHIP', 'K%', 'BB%', 'wOBA-a', 'SV', 'OVR'], trs, 'compact'));
            const sp2 = spark(pit.map(r => r.pp.era), pit.map(r => r.y), pit[0].ctx[2], x => x.toFixed(1));
            if (sp2) w.appendChild(h('div', null, h('div', { class: 'mu-role' }, 'ERA by season (line = that year’s league average)'), sp2));
          }
          // left/right splits, every season
          const splitRows = rows.filter(r => r.bsp && hit.includes(r)).map(r => { const s2 = splitFromArr(r.bsp); return { cells: [r.y, ...['L', 'R'].map(k => s2[k] ? `${r3(s2[k].avg)}/${r3(s2[k].obp)}/${r3(s2[k].slg)} (${s2[k].pa})` : '—'), ...['L', 'R'].map(k => s2[k] ? r3(s2[k].woba) : '—')] }; });
          if (splitRows.length) { w.appendChild(h('h3', null, 'Hitting splits by season')); w.appendChild(table(['Year', 'vs LHP (PA)', 'vs RHP (PA)', 'wOBA vs L', 'wOBA vs R'], splitRows, 'compact')); }
          const psplitRows = rows.filter(r => r.psp && pit.includes(r)).map(r => { const s2 = splitFromArr(r.psp); return { cells: [r.y, ...['L', 'R'].map(k => s2[k] ? `${r3(s2[k].avg)}/${r3(s2[k].obp)}/${r3(s2[k].slg)} (${s2[k].pa})` : '—'), ...['L', 'R'].map(k => s2[k] ? r3(s2[k].woba) : '—')] }; });
          if (psplitRows.length) { w.appendChild(h('h3', null, 'Pitching splits by season')); w.appendChild(table(['Year', 'vs LHB (BF)', 'vs RHB (BF)', 'wOBA-a vs L', 'wOBA-a vs R'], psplitRows, 'compact')); }
        })().catch(e => { clear(w); w.appendChild(h('p', { class: 'warn' }, 'Could not load career: ' + e.message)); });
        return w;
      },
      savant() {
        const sv = h('div', { class: 'stack' }, h('h3', null, 'Baseball Savant'), h('div', { class: 'spin' }, h('span', { class: 'dot' }), 'Asking Baseball Savant…'));
        built.sv = sv;
        return sv;
      },
    };
    async function loadSavant() {
      const sv = built.sv;
      const roles = [];
      if (b && b.pa >= 30 && (!isPit || b.pa >= 40)) roles.push(false);
      if (p && p.bf >= 30) roles.push(true);
      if (!roles.length) roles.push(!!p && !b);
      const results = await Promise.all(roles.map(r => savantFor({ mlbam, year, isPitcher: r }).catch(e => ({ ok: false, sections: [], notes: [String(e.message || e)], link: 'https://baseballsavant.mlb.com/' }))));
      clear(sv); sv.appendChild(h('h3', null, 'Baseball Savant'));
      results.forEach((r, i) => {
        if (roles.length > 1) sv.appendChild(h('div', { class: 'mu-role' }, roles[i] ? 'As a pitcher' : 'As a hitter'));
        for (const sec of r.sections) sv.appendChild(h('div', null, h('div', { class: 'mu-role' }, sec.title), grid(sec.rows.map(([l, v]) => tile(l, v)))));
        for (const n of r.notes) sv.appendChild(h('p', { class: 'muted small' }, n));
      });
      sv.appendChild(h('div', { class: 'btnrow' }, h('a', { class: 'btn primary', href: results[0].link, target: '_blank', rel: 'noopener' }, 'Open on Baseball Savant ↗'),
        mlbam ? h('a', { class: 'btn', href: `https://www.mlb.com/player/${mlbam}`, target: '_blank', rel: 'noopener' }, 'MLB.com ↗') : null));
    }
    show('season');
  } catch (e) {
    clear(body); body.appendChild(h('p', { class: 'warn' }, 'Could not load this player: ' + e.message));
  }
}
