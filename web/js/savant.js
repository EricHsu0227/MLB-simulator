// Baseball Savant / Statcast + MLB advanced stats, fetched live in the browser (best effort).
// Retrosheet has no Statcast data, so this is the only source of exit velocity, barrels, xwOBA, etc.
import { API } from './live.js';
import { loadJSONGz } from './data.js';

const BASE = 'https://baseballsavant.mlb.com';
const cache = new Map();
let reverse = null;

/** Retrosheet id -> MLBAM id (from the bundled Chadwick register subset). */
export async function mlbamFor(retroId) {
  if (!reverse) {
    try { const m = await loadJSONGz('data/idmap.json.gz'); reverse = new Map(Object.entries(m).map(([mb, r]) => [r, +mb])); } catch (e) { reverse = new Map(); }
  }
  return reverse.get(retroId) || null;
}

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.replace(/^﻿/, '').replace(/"/g, '').trim());
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

async function fetchText(url, ms = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.text(); } finally { clearTimeout(t); }
}
async function leaderboard(kind, name, year, extra = '') {
  const key = `${name}|${kind}|${year}`;
  if (!cache.has(key)) {
    cache.set(key, fetchText(`${BASE}/leaderboard/${name}?type=${kind}&year=${year}&position=&team=&min=1${extra}&csv=true`).then(parseCSV));
    cache.get(key).catch(() => cache.delete(key));
  }
  return cache.get(key);
}

const num = v => (v === undefined || v === '' || v === null ? null : +v);
const F = { r3: x => (x >= 1 ? x.toFixed(3) : x.toFixed(3).replace(/^0/, '')), p1: x => x.toFixed(1) + '%', d1: x => x.toFixed(1), d2: x => x.toFixed(2), i: x => Math.round(x) };
const BAT_COLS = [['avg_hit_speed', 'Avg exit velo (mph)', F.d1], ['max_hit_speed', 'Max exit velo (mph)', F.d1], ['avg_hit_angle', 'Avg launch angle (°)', F.d1], ['anglesweetspotpercent', 'Sweet-spot %', F.p1], ['brl_percent', 'Barrel % (per BBE)', F.p1], ['brl_pa', 'Barrel % (per PA)', F.p1], ['ev95percent', 'Hard-hit % (95+ mph)', F.p1]];
const EXP_COLS = [['est_ba', 'xBA', F.r3], ['est_slg', 'xSLG', F.r3], ['est_woba', 'xwOBA', F.r3], ['woba', 'wOBA', F.r3]];

/**
 * @returns {{ok:boolean, sections:[{title, rows:[[label,value]]}], link:string, notes:string[]}}
 */
export async function savantFor({ mlbam, year, isPitcher }) {
  const out = { ok: false, sections: [], link: mlbam ? `${BASE}/savant-player/${mlbam}?stats=${isPitcher ? 'pitching' : 'hitting'}-r-${isPitcher ? 'pitching' : 'hitting'}-mlb&season=${year}` : `${BASE}/`, notes: [] };
  if (year < 2015) { out.notes.push('Statcast tracking starts in 2015; earlier seasons have no exit-velocity, barrel or expected-stats data.'); return out; }
  if (!mlbam) { out.notes.push('No MLB player id is known for this player, so live Statcast data can’t be looked up.'); return out; }
  const kind = isPitcher ? 'pitcher' : 'batter';
  const pick = rows => rows.find(r => String(r.player_id) === String(mlbam));
  const tasks = [
    leaderboard(kind, 'statcast', year).then(rows => {
      const r = pick(rows); if (!r) return;
      const cols = BAT_COLS.filter(([k]) => num(r[k]) !== null).map(([k, l, f]) => [isPitcher ? l.replace('Avg exit velo', 'Exit velo allowed') : l, f(+r[k])]);
      if (cols.length) { out.sections.push({ title: isPitcher ? 'Statcast — contact allowed' : 'Statcast — batted balls', rows: cols }); out.ok = true; }
    }),
    leaderboard(kind, 'expected_statistics', year).then(rows => {
      const r = pick(rows); if (!r) return;
      const cols = EXP_COLS.filter(([k]) => num(r[k]) !== null).map(([k, l, f]) => [l, f(+r[k])]);
      if (num(r.est_woba) !== null && num(r.woba) !== null) cols.push(['xwOBA − wOBA', (r.est_woba - r.woba >= 0 ? '+' : '') + (r.est_woba - r.woba).toFixed(3)]);
      if (cols.length) { out.sections.push({ title: 'Expected stats', rows: cols }); out.ok = true; }
    }),
  ];
  if (!isPitcher) tasks.push(leaderboard('', 'sprint_speed', year, '').then(rows => { const r = pick(rows); if (r && num(r.sprint_speed) !== null) { out.sections.push({ title: 'Speed', rows: [['Sprint speed (ft/s)', (+r.sprint_speed).toFixed(1)]] }); out.ok = true; } }));
  const results = await Promise.allSettled(tasks);
  const blocked = results.filter(r => r.status === 'rejected').length;
  // fallback / supplement: MLB Stats API advanced stat types
  try {
    const grp = isPitcher ? 'pitching' : 'hitting';
    const r = await fetch(`${API}/people/${mlbam}/stats?stats=expectedStatistics,sabermetrics&group=${grp}&season=${year}`);
    if (r.ok) {
      const j = await r.json();
      for (const s of j.stats || []) {
        const st = s.splits?.[0]?.stat; if (!st) continue;
        const t = s.type?.displayName;
        if (t === 'expectedStatistics' && !out.sections.some(x => x.title === 'Expected stats')) {
          const rows = [['xBA', st.avg], ['xSLG', st.slg], ['xwOBA', st.woba]].filter(x => x[1] !== undefined && x[1] !== '').map(([l, v]) => [l, v]);
          if (rows.length) { out.sections.push({ title: 'Expected stats (MLB)', rows }); out.ok = true; }
        }
        if (t === 'sabermetrics') {
          const rows = (isPitcher ? [['FIP', st.fip], ['xFIP', st.xfip], ['WAR', st.war]] : [['wRC+', st.wRcPlus], ['wRAA', st.wRaa], ['WAR', st.war], ['Base running (UBR)', st.ubr]]).filter(x => x[1] !== undefined && x[1] !== '' && x[1] !== null);
          if (rows.length) { out.sections.push({ title: 'Advanced (MLB)', rows: rows.map(([l, v]) => [l, typeof v === 'number' ? (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)) : v]) }); out.ok = true; }
        }
      }
    }
  } catch (e) { /* offline or blocked */ }
  if (!out.ok) out.notes.push(blocked ? 'Baseball Savant didn’t answer from this browser (it can block other sites from reading its data). Use the link below to open the full Savant page.' : 'No Statcast rows found for this player and season.');
  return out;
}
