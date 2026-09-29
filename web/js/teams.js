// Team construction: auto-managed team-seasons, as-played game rosters, postseason rosters.
import { makePlayer, teamLeague, getGlobal } from './data.js';

export function dayNum(d) { return Date.UTC(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100) / 86400000; }

export function usesDH(S, lg) { return (S.dh[lg] ?? 0) >= 0.5; }

function parkFor(S, code) {
  const t = S.teams[code];
  const site = t?.p || '';
  const G = getGlobal();
  return { id: site, name: G?.parks?.[site]?.n || site || 'Neutral park', pf: S.parks[site] || [1, 1, 1, 1] };
}

function finish(team) {
  // bullpen roles
  const pen = team.bullpen;
  pen.forEach(p => { p.role = 'mid'; });
  if (pen.length) {
    const ranked = pen.slice().sort((a, b) => (b.pit.sv * 3 + b.pit.gf) - (a.pit.sv * 3 + a.pit.gf));
    if (ranked[0].pit.sv + ranked[0].pit.gf >= 3 || pen.length > 2) ranked[0].role = 'closer';
    const rest = pen.filter(p => p.role !== 'closer').sort((a, b) => a.pit.wobaAgainst - b.pit.wobaAgainst);
    rest.slice(0, 2).forEach(p => { p.role = 'setup'; });
    rest.slice(-2).forEach(p => { if (p.role === 'mid') p.role = 'mop'; });
    const order = { closer: 0, setup: 1, mid: 2, mop: 3 };
    pen.sort((a, b) => order[a.role] - order[b.role] || a.pit.wobaAgainst - b.pit.wobaAgainst);
  }
  return team;
}

function assignLineup(pool, dh, excluded) {
  const want = dh ? [2, 3, 4, 5, 6, 7, 8, 9, 10] : [2, 3, 4, 5, 6, 7, 8, 9];
  const posTaken = new Set(), used = new Set(), lineup = [];
  for (const [n, idx, pos] of pool.cands) {
    if (posTaken.has(pos) || used.has(idx) || !want.includes(pos) || excluded(idx)) continue;
    posTaken.add(pos); used.add(idx); lineup.push({ idx, pos });
  }
  for (const pos of want) {
    if (posTaken.has(pos)) continue;
    const idx = pool.hitters.find(i => !used.has(i) && !excluded(i));
    if (idx === undefined) break;
    used.add(idx); posTaken.add(pos); lineup.push({ idx, pos });
  }
  lineup.sort((a, b) => pool.slotAvg(a.idx) - pool.slotAvg(b.idx));
  return { lineup, used };
}

/** Days (as day numbers) on which a player was in the team's real orbit: ±win days around each real appearance. */
function buildAvailability(S, code, win = 6) {
  const m = new Map();
  for (const g of S.gamesByTeam.get(code) || []) {
    if (g.type !== 'R') continue;
    const home = g.home === code, ti = home ? 1 : 0;
    const d = dayNum(g.date);
    const ids = [];
    for (const [idx] of (home ? g.hb : g.vb)) ids.push(idx);
    const sp = home ? g.hsp : g.vsp; if (sp >= 0) ids.push(sp);
    for (const s of g.subs) if (s[0] === ti) ids.push(s[1]);
    for (const p of g.pl) if (p[0] === ti) ids.push(p[1]);
    for (const idx of ids) {
      let st = m.get(idx); if (!st) { st = new Set(); m.set(idx, st); }
      for (let k = -win; k <= win; k++) st.add(d + k);
    }
  }
  // games each player was around for (for start-rate estimates)
  m.winGames = new Map();
  for (const g of S.gamesByTeam.get(code) || []) {
    if (g.type !== 'R') continue;
    const d = dayNum(g.date);
    for (const [idx, st] of m) if (st.has && st.has(d)) m.winGames.set(idx, (m.winGames.get(idx) || 0) + 1);
  }
  return m;
}

/** Auto-managed team from a team-season (regulars, 5-man rotation, bullpen). */
export function buildTeam(S, code, opts = {}) {
  const lg = teamLeague(S, code);
  const dh = opts.dh ?? usesDH(S, lg);
  const games = (S.gamesByTeam.get(code) || []).filter(g => g.type === 'R');
  const cnt = new Map();      // `${pos}|${idx}` -> starts
  const slotSum = new Map(), slotN = new Map();
  const apps = new Map();     // hitters appearances
  const gs = new Map(), pg = new Map(), firstStart = new Map();
  for (const g of games) {
    const home = g.home === code;
    const bat = home ? g.hb : g.vb;
    const sp = home ? g.hsp : g.vsp;
    bat.forEach(([idx, pos], s) => {
      const k = pos + '|' + idx;
      cnt.set(k, (cnt.get(k) || 0) + 1);
      slotSum.set(idx, (slotSum.get(idx) || 0) + s); slotN.set(idx, (slotN.get(idx) || 0) + 1);
      if (pos !== 1) apps.set(idx, (apps.get(idx) || 0) + 1);
    });
    for (const s of g.subs) if (s[0] === (home ? 1 : 0) && s[3] !== 1) apps.set(s[1], (apps.get(s[1]) || 0) + 1);
    if (sp >= 0) { gs.set(sp, (gs.get(sp) || 0) + 1); if (!firstStart.has(sp)) firstStart.set(sp, g.date); }
    for (const p of g.pl) if (p[0] === (home ? 1 : 0)) pg.set(p[1], (pg.get(p[1]) || 0) + 1);
  }
  const cands = [];
  for (const [k, n] of cnt) {
    const [pos, idx] = k.split('|').map(Number);
    if (pos === 1 || pos > 10) continue;
    cands.push([n, idx, pos]);
  }
  cands.sort((a, b) => b[0] - a[0]);
  const hitters = [...apps.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const pool = { cands, hitters, slotAvg: idx => (slotSum.get(idx) ?? 4) / (slotN.get(idx) || 1), apps, pg, gs, starts: slotN, nGames: games.length };
  const P = idx => makePlayer(S, idx, lg);
  const { lineup, used } = assignLineup(pool, dh, () => false);
  // rotation
  const rot = [...gs.entries()].filter(([i, n]) => n >= Math.max(3, games.length * 0.04)).sort((a, b) => b[1] - a[1]);
  const rsize = S.y < 1970 ? 4 : 5;
  let rotIdx = rot.slice(0, rsize).map(x => x[0]).sort((a, b) => firstStart.get(a) - firstStart.get(b));
  if (rotIdx.length < 3) rotIdx = [...pg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
  const rotation = rotIdx.map(P);
  const extraStarters = rot.slice(rsize, rsize + 4).map(x => x[0]).filter(i => !rotIdx.includes(i)).map(P);
  const rotSet = new Set(rotIdx);
  const penAllIdx = [...pg.entries()].filter(([i]) => !rotSet.has(i)).sort((a, b) => b[1] - a[1]).slice(0, S.y < 1950 ? 9 : 16).map(x => x[0]);
  const pen = penAllIdx.slice(0, Math.max(7, S.y < 1950 ? 5 : 9)).map(P);
  const bench = hitters.filter(i => !used.has(i) && (!pg.has(i) || (apps.get(i) || 0) > 15)).slice(0, 8).map(P).filter(p => p.bat.pa > 0);
  const team = {
    key: S.y + code, code, year: S.y, name: S.teams[code]?.n || code, lg, S, dh,
    park: parkFor(S, code),
    lineup: lineup.map(x => ({ p: P(x.idx), pos: x.pos })),
    rotation, extraStarters, sp: rotation[0], bench, bullpen: pen, penAll: penAllIdx.map(P), lookup: P,
    pool, hitterIdx: hitters, P,
    getAvail() { return (this._avail ||= buildAvailability(S, code)); },
  };
  const ensurePitcher = () => {
    if (!dh && !team.lineup.some(x => x.pos === 1)) team.lineup.push({ p: team.sp, pos: 1 });
    team.lineup = team.lineup.slice(0, 9);
    while (team.lineup.length < 9 && bench.length) team.lineup.push({ p: bench.shift(), pos: 10 });
  };
  ensurePitcher();
  finish(team);
  finish({ bullpen: team.penAll });
  return team;
}

/** Pick the day's lineup from the pool: skip unavailable / resting players. Returns lineup entries or null. */
export function lineupForDay(team, dh, excluded) {
  const { lineup } = assignLineup(team.pool, dh, excluded);
  const out = lineup.map(x => ({ p: team.P(x.idx), pos: x.pos }));
  if (!dh) out.push({ p: null, pos: 1 });
  return out.slice(0, 9);
}

/** Players appearing for `code` within ±days of `date` (any game type). */
export function rosterWindow(S, code, date, days = 14) {
  const d0 = dayNum(date);
  const hit = new Set(), pit = new Set();
  const games = S.gamesByTeam.get(code) || [];
  for (const g of games) {
    if (Math.abs(dayNum(g.date) - d0) > days) continue;
    const home = g.home === code;
    const ti = home ? 1 : 0;
    for (const [idx, pos] of (home ? g.hb : g.vb)) (pos === 1 ? pit : hit).add(idx);
    for (const s of g.subs) if (s[0] === ti) (s[3] === 1 ? pit : hit).add(s[1]);
    for (const p of g.pl) if (p[0] === ti) pit.add(p[1]);
    const sp = home ? g.hsp : g.vsp;
    if (sp >= 0) pit.add(sp);
  }
  return { hit, pit };
}

/** Team object for one side of an actual game, using its as-played lineup and subs. */
export function realGameTeam(S, g, ti, opts = {}) {
  const code = ti === 0 ? g.vis : g.home;
  const lg = teamLeague(S, code) || 'AL';
  const P = idx => makePlayer(S, idx, lg);
  const bat = ti === 0 ? g.vb : g.hb;
  const spIdx = ti === 0 ? g.vsp : g.hsp;
  const lineup = bat.map(([idx, pos]) => ({ p: P(idx), pos }));
  const startIds = new Set(bat.map(x => x[0]));
  const win = code === 'ALS' || code === 'NLS' ? { hit: new Set(), pit: new Set() } : rosterWindow(S, code, g.date, opts.days ?? 14);
  // ensure actual-game participants are on the roster
  for (const s of g.subs) if (s[0] === ti) (s[3] === 1 ? win.pit : win.hit).add(s[1]);
  for (const p of g.pl) if (p[0] === ti) win.pit.add(p[1]);
  const sp = spIdx >= 0 ? P(spIdx) : (lineup.find(x => x.pos === 1)?.p);
  const benchIdx = [...win.hit].filter(i => !startIds.has(i) && !win.pit.has(i));
  const penIdx = [...win.pit].filter(i => i !== spIdx);
  const bench = benchIdx.map(P).sort((a, b) => b.bat.pa - a.bat.pa);
  const bullpen = penIdx.map(P);
  const script = g.subs.filter(s => s[0] === ti).map(s => ({ p: P(s[1]), slot: s[2] > 0 ? s[2] - 1 : s[2] === 0 && s[3] !== 1 ? -1 : -1, pos: s[3], inn: s[4], half: s[5], pa: s[6], rawSlot: s[2] }));
  // Retrosheet batting slots are 1-9 (0 = pitcher in DH games); we use 0-8
  for (const s of script) s.slot = s.rawSlot >= 1 ? s.rawSlot - 1 : -1;
  const team = {
    key: S.y + code + g.date + g.num, code, year: S.y, name: S.teams[code]?.n || code, lg, S, dh: !!g.dh,
    park: parkFor(S, g.home), lineup, sp, rotation: [sp], bench, bullpen, lookup: P, script,
  };
  team.park = parkFor(S, g.home);
  return finish(team);
}
