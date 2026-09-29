// Player card: essential stats + Baseball Savant / Statcast, opened by clicking any player name.
import { h, clear, ip } from './common.js';
import { loadSeason } from '../data.js';
import { batStats, pitStats, fmt } from '../pstats.js';
import { savantFor, mlbamFor } from '../savant.js';

const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'tv' }, value), h('div', { class: 'tl' }, label), sub ? h('div', { class: 'ts muted' }, sub) : null);
const grid = tiles => h('div', { class: 'tiles' }, tiles);

export function playerLink(ref, label) {
  return h('a', { class: 'plink', href: '#', title: 'Player card', onclick: e => { e.preventDefault(); e.stopPropagation(); openPlayerCard(ref); } }, label ?? (ref.p ? ref.p.name : ref.name));
}

export async function openPlayerCard(ref) {
  const overlay = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  const sheet = h('div', { class: 'sheet' });
  overlay.appendChild(sheet);
  const close = () => { overlay.remove(); document.body.classList.remove('noscroll'); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay); document.body.classList.add('noscroll');
  sheet.appendChild(h('div', { class: 'sheet-head' }, h('div', { class: 'gv-h1' }, ref.p ? ref.p.name : ref.name), h('button', { class: 'btn sm', onclick: close }, '✕ Close')));
  const body = h('div', { class: 'stack' }, h('div', { class: 'spin' }, h('span', { class: 'dot' }), 'Loading…'));
  sheet.appendChild(body);

  try {
    let S, idx;
    if (ref.p) { S = ref.p.S; idx = ref.p.idx; }
    else {
      S = ref.S || (ref.y >= 2026 ? null : await loadSeason(ref.y));
      idx = S ? S.playersById.get(ref.id)?.idx : undefined;
    }
    const info = S && idx !== undefined ? S.players[idx] : { name: ref.name || '?', bats: '?', throws: '?', id: ref.id };
    let mlbam = info.mlbam || (info.id && !String(info.id).startsWith('mlb') ? await mlbamFor(info.id) : (String(info.id).startsWith('mlb') ? +String(info.id).slice(3) : null));
    const year = S ? S.y : ref.y;
    clear(body);
    body.appendChild(h('div', { class: 'muted' }, `${year} season · bats ${info.bats} · throws ${info.throws}${ref.p && ref.p.lg ? ' · ' + ref.p.lg : ''}`));
    const b = S && idx !== undefined ? batStats(S, idx) : null;
    const p = S && idx !== undefined ? pitStats(S, idx) : null;
    if (!b && !p) body.appendChild(h('p', { class: 'muted' }, `No ${year} regular-season stats on file for this player.`));
    const isPit = !!(p && p.bf >= (b ? b.pa : 0) && p.bf >= 30) || (!!p && !b);
    if (b && (!isPit || b.pa >= 40)) {
      body.appendChild(h('h3', null, 'Batting'));
      body.appendChild(grid([
        tile('AVG / OBP / SLG', `${fmt.r3(b.avg)} / ${fmt.r3(b.obp)} / ${fmt.r3(b.slg)}`), tile('OPS', fmt.r3(b.ops)), tile('wOBA', fmt.r3(b.woba)), tile('wRC+', b.wrcPlus, '100 = league avg'),
        tile('ISO', fmt.r3(b.iso)), tile('BABIP', fmt.r3(b.babip)), tile('K%', fmt.p1(b.kpct)), tile('BB%', fmt.p1(b.bbpct)), tile('HR%', fmt.p1(b.hrpct)),
        tile('PA', b.pa), tile('HR', b.hr), tile('SB / CS', `${b.sb} / ${b.cs}`, b.sb + b.cs ? fmt.p1(b.sbPct) + ' success' : ''),
      ]));
      if (b.bipN >= 20) body.appendChild(grid([tile('Ground ball %', fmt.p1(b.gb)), tile('Line drive %', fmt.p1(b.ld)), tile('Fly ball %', fmt.p1(b.fb)), tile('Pull %', fmt.p1(b.pull)), tile('Center %', fmt.p1(b.ctr)), tile('Oppo %', fmt.p1(b.opp))]));
      else body.appendChild(h('p', { class: 'muted small' }, 'Batted-ball splits (GB/LD/FB, pull/oppo) are shown when there are enough tracked balls in play.'));
    }
    if (p) {
      body.appendChild(h('h3', null, 'Pitching'));
      body.appendChild(grid([
        tile(p.eraLabel, fmt.d2(p.era)), tile('FIP', fmt.d2(p.fip)), tile('WHIP', fmt.d2(p.whip)), tile('IP', ip(Math.round(p.ip * 3)), `${p.g} G, ${p.gs} GS`),
        tile('K%', fmt.p1(p.kpct)), tile('BB%', fmt.p1(p.bbpct)), tile('K−BB%', fmt.p1(p.kbb)), tile('K/9', fmt.d1(p.k9)), tile('BB/9', fmt.d1(p.bb9)), tile('HR/9', fmt.d2(p.hr9)),
        tile('BABIP against', fmt.r3(p.babip)), tile('wOBA against', fmt.r3(p.woba)), tile('SV', p.sv),
      ]));
      if (p.bipN >= 30) body.appendChild(grid([tile('GB% allowed', fmt.p1(p.gb)), tile('LD% allowed', fmt.p1(p.ld)), tile('FB% allowed', fmt.p1(p.fb))]));
    }
    if (ref.p && ref.p.bat) body.appendChild(h('p', { class: 'muted small' }, `How the simulator rates him: park-neutral wOBA ${fmt.r3(ref.p.bat.woba)} as a hitter${ref.p.pit && ref.p.pit.bf ? `, ${fmt.r3(ref.p.pit.wobaAgainst)} wOBA against as a pitcher` : ''}.`));

    // ---- Baseball Savant / Statcast (live fetch)
    const sv = h('div', { class: 'stack' }, h('h3', null, 'Baseball Savant'), h('div', { class: 'spin' }, h('span', { class: 'dot' }), 'Asking Baseball Savant…'));
    body.appendChild(sv);
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
  } catch (e) {
    clear(body); body.appendChild(h('p', { class: 'warn' }, 'Could not load this player: ' + e.message));
  }
}
