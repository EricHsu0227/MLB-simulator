// Live season support: pulls the current season from the MLB Stats API (browser -> statsapi.mlb.com),
// blends it with prior-season tendencies from the bundled Retrosheet data, and builds sim-ready teams.
import { loadJSONGz, loadSeason, makePlayer, getGlobal, eraIndex } from './data.js';
import { finishRoles } from './teams.js';
import { applyUserDefault } from './lineups.js';

export const API = 'https://statsapi.mlb.com/api/v1';
export const MLB_TEAM = { 108: 'ANA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHN', 113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KCA', 119: 'LAN', 120: 'WAS', 121: 'NYN', 133: 'ATH', 134: 'PIT', 135: 'SDN', 136: 'SEA', 137: 'SFN', 138: 'SLN', 139: 'TBA', 140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CHA', 146: 'MIA', 147: 'NYA', 158: 'MIL' };
export const RS_TO_MLB = Object.fromEntries(Object.entries(MLB_TEAM).map(([k, v]) => [v, +k]));
const DIV_OF = { 200: 'W', 201: 'E', 202: 'C', 203: 'W', 204: 'E', 205: 'C' };   // AL W/E/C, NL W/E/C division ids
export const TEAM_INFO = {   // fallback names/leagues/divisions if /teams is unavailable
  ANA: ['Los Angeles Angels', 'AL', 'W'], ARI: ['Arizona Diamondbacks', 'NL', 'W'], ATH: ['Athletics', 'AL', 'W'], ATL: ['Atlanta Braves', 'NL', 'E'], BAL: ['Baltimore Orioles', 'AL', 'E'],
  BOS: ['Boston Red Sox', 'AL', 'E'], CHA: ['Chicago White Sox', 'AL', 'C'], CHN: ['Chicago Cubs', 'NL', 'C'], CIN: ['Cincinnati Reds', 'NL', 'C'], CLE: ['Cleveland Guardians', 'AL', 'C'],
  COL: ['Colorado Rockies', 'NL', 'W'], DET: ['Detroit Tigers', 'AL', 'C'], HOU: ['Houston Astros', 'AL', 'W'], KCA: ['Kansas City Royals', 'AL', 'C'], LAN: ['Los Angeles Dodgers', 'NL', 'W'],
  MIA: ['Miami Marlins', 'NL', 'E'], MIL: ['Milwaukee Brewers', 'NL', 'C'], MIN: ['Minnesota Twins', 'AL', 'C'], NYA: ['New York Yankees', 'AL', 'E'], NYN: ['New York Mets', 'NL', 'E'],
  PHI: ['Philadelphia Phillies', 'NL', 'E'], PIT: ['Pittsburgh Pirates', 'NL', 'C'], SDN: ['San Diego Padres', 'NL', 'W'], SEA: ['Seattle Mariners', 'AL', 'W'], SFN: ['San Francisco Giants', 'NL', 'W'],
  SLN: ['St. Louis Cardinals', 'NL', 'C'], TBA: ['Tampa Bay Rays', 'AL', 'E'], TEX: ['Texas Rangers', 'AL', 'W'], TOR: ['Toronto Blue Jays', 'AL', 'E'], WAS: ['Washington Nationals', 'NL', 'E'],
};

async function getJSON(url, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url.replace(API, '')}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const pad = n => String(n).padStart(2, '0');
const ymd = s => +s.replace(/-/g, '');

// ---------------------------------------------------------------- fetching
/** Fetch everything the live mode needs. Each part degrades independently. */
export async function fetchLive(year, onStatus = () => {}) {
  const live = { year, fetchedAt: Date.now(), schedule: [], post: [], teams: {}, hit: {}, pit: {}, roster: {}, people: {}, flags: { schedule: 'bundled', stats: 'none', rosters: 'none' }, errors: [] };
  const step = async (label, fn) => { onStatus(label); try { await fn(); } catch (e) { live.errors.push(`${label}: ${e.message}`); } };

  await step('Loading teams…', async () => {
    const j = await getJSON(`${API}/teams?sportId=1&season=${year}`);
    for (const t of j.teams || []) {
      const code = MLB_TEAM[t.id]; if (!code) continue;
      const lg = /american/i.test(t.league?.name || '') ? 'AL' : 'NL';
      live.teams[code] = { id: t.id, name: t.name, lg, div: DIV_OF[t.division?.id] || (TEAM_INFO[code] || [])[2] || '', venue: t.venue?.name || '' };
    }
  });
  const parseGames = (j, dflt) => {
    const out = [];
    for (const d of j.dates || []) for (const g of d.games || []) {
      const a = g.teams?.away, h = g.teams?.home;
      const ac = MLB_TEAM[a?.team?.id], hc = MLB_TEAM[h?.team?.id];
      if (!ac || !hc) continue;
      out.push({
        pk: g.gamePk, date: ymd(g.officialDate || d.date), dt: g.gameDate, num: g.doubleHeader === 'N' ? 0 : (g.gameNumber || 1),
        away: ac, home: hc, state: g.status?.abstractGameState || 'Preview', detail: g.status?.detailedState || '',
        as: a.score ?? null, hs: h.score ?? null, gt: g.gameType || dflt,
        app: a.probablePitcher ? { id: a.probablePitcher.id, name: a.probablePitcher.fullName } : null,
        hpp: h.probablePitcher ? { id: h.probablePitcher.id, name: h.probablePitcher.fullName } : null,
        venue: g.venue?.name || '', series: g.seriesDescription || '', sgn: g.seriesGameNumber || 0, gis: g.gamesInSeries || 0,
      });
    }
    return out;
  };
  await step('Loading schedule…', async () => {
    const j = await getJSON(`${API}/schedule?sportId=1&season=${year}&gameType=R&startDate=${year}-03-01&endDate=${year}-11-01&hydrate=probablePitcher,team`, 30000);
    const out = parseGames(j, 'R');
    if (out.length) { live.schedule = out; live.flags.schedule = 'mlb'; }
  });
  await step('Loading postseason…', async () => {
    const j = await getJSON(`${API}/schedule?sportId=1&season=${year}&gameType=F,D,L,W&startDate=${year}-09-15&endDate=${year}-11-30&hydrate=probablePitcher,team`, 30000);
    live.post = parseGames(j, 'D');
  });
  if (!live.schedule.length) await step('Loading bundled schedule…', async () => {
    const rows = await loadJSONGz(`data/live/${year}schedule.json.gz`);
    live.schedule = rows.map((r, i) => ({ pk: `b${r[0]}${r[2]}${r[3]}${r[1]}`, date: r[0], dt: null, num: r[1], away: r[2], home: r[3], state: 'Preview', detail: '', as: null, hs: null, app: null, hpp: null, venue: r[4] }));
    live.flags.schedule = 'bundled';
  });
  const statUrl = (group, off) => `${API}/stats?stats=season&group=${group}&season=${year}&sportId=1&gameType=R&playerPool=ALL&limit=1000&offset=${off}`;
  for (const [group, key] of [['hitting', 'hit'], ['pitching', 'pit']]) {
    await step(`Loading ${group} stats…`, async () => {
      for (let off = 0; off < 6000; off += 1000) {
        const j = await getJSON(statUrl(group, off), 30000);
        const splits = j.stats?.[0]?.splits || [];
        for (const sp of splits) if (sp.player?.id) live[key][sp.player.id] = { name: sp.player.fullName, team: sp.team?.id, stat: sp.stat };
        if (splits.length < 1000) break;
      }
      if (Object.keys(live[key]).length) live.flags.stats = 'mlb';
    });
  }
  await step('Loading active rosters…', async () => {
    const ids = Object.values(MLB_TEAM);
    await Promise.all(Object.entries(MLB_TEAM).map(async ([tid, code]) => {
      const j = await getJSON(`${API}/teams/${tid}/roster?rosterType=active&season=${year}`);
      live.roster[code] = (j.roster || []).map(r => ({ id: r.person.id, name: r.person.fullName, pos: r.position?.abbreviation || '' }));
    }));
    if (Object.values(live.roster).some(r => r.length)) live.flags.rosters = 'mlb';
  });
  await step('Loading player details…', async () => {
    const ids = [...new Set(Object.values(live.roster).flat().map(r => r.id))];
    for (let i = 0; i < ids.length; i += 100) {
      const j = await getJSON(`${API}/people?personIds=${ids.slice(i, i + 100).join(',')}`);
      for (const p of j.people || []) live.people[p.id] = { bats: p.batSide?.code || 'R', throws: p.pitchHand?.code || 'R', name: p.fullName };
    }
  });
  return live;
}

const LS_KEY = y => `dsim.live.${y}`;
export function saveLive(live) { try { localStorage.setItem(LS_KEY(live.year), JSON.stringify(live)); } catch (e) { /* quota: fine */ } }
export function loadSavedLive(year) { try { const t = localStorage.getItem(LS_KEY(year)); return t ? JSON.parse(t) : null; } catch (e) { return null; } }

// ---------------------------------------------------------------- results archive (your sims vs reality)
const RES_KEY = y => `dsim.liveresults.${y}`;
export function loadResults(year) { try { return JSON.parse(localStorage.getItem(RES_KEY(year)) || '{}'); } catch (e) { return {}; } }
export function saveResult(year, pk, r) { const all = loadResults(year); all[pk] = r; try { localStorage.setItem(RES_KEY(year), JSON.stringify(all)); } catch (e) { /* ignore */ } }
export function clearResults(year) { try { localStorage.removeItem(RES_KEY(year)); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------- building a season from API stats
const num = x => (x === undefined || x === null || x === '' ? 0 : +x || 0);
function outsFromIP(ip) { if (ip === undefined || ip === null) return 0; const [w, f] = String(ip).split('.'); return (+w || 0) * 3 + (+f || 0); }

function hitCounts(st) {
  const ibb = num(st.intentionalWalks), pa = num(st.plateAppearances) - ibb;
  const h = num(st.hits), d = num(st.doubles), t = num(st.triples), hr = num(st.homeRuns);
  const k = num(st.strikeOuts), bb = num(st.baseOnBalls) - ibb, hbp = num(st.hitByPitch);
  const s1 = Math.max(0, h - d - t - hr);
  const out = Math.max(0, pa - k - bb - hbp - h);
  const sb = num(st.stolenBases), cs = num(st.caughtStealing);
  return { pa, o: [k, bb, hbp, s1, d, t, hr, out], ibb, sb, cs, opp: 0.85 * (s1 + bb + hbp) };
}
function pitCounts(st, lgShare) {
  const ibb = num(st.intentionalWalks), bf = num(st.battersFaced) - ibb;
  const h = num(st.hits), hr = num(st.homeRuns);
  let d = st.doubles !== undefined ? num(st.doubles) : null, t = st.triples !== undefined ? num(st.triples) : null;
  const nonHr = Math.max(0, h - hr);
  if (d === null || t === null) { d = Math.round(nonHr * lgShare[1]); t = Math.round(nonHr * lgShare[2]); }
  const s1 = Math.max(0, nonHr - d - t);
  const k = num(st.strikeOuts), bb = num(st.baseOnBalls) - ibb, hbp = num(st.hitBatsmen);
  const out = Math.max(0, bf - k - bb - hbp - h);
  return { bf, o: [k, bb, hbp, s1, d, t, hr, out], g: num(st.gamesPlayed), gs: num(st.gamesStarted), outs: outsFromIP(st.inningsPitched), bfAll: num(st.battersFaced), gf: num(st.gamesFinished), sv: num(st.saves), er: num(st.earnedRuns), r: num(st.runs) };
}

/**
 * Synthetic "season" object shaped like data.js prepareSeason() output, so makePlayer/buildTeam-style code works.
 * prior: the previous season (Retrosheet) used for batted-ball tendencies and small-sample blending.
 */
export function buildLiveSeason(live, prior, idmap) {
  const year = live.year;
  const S = {
    y: year, players: [], playersById: new Map(), batRows: new Map(), batpRows: new Map(), pitRows: new Map(),
    base: {}, teams: {}, parks: {}, dh: { AL: 1, NL: 1 }, games: [], gamesByTeam: new Map(), _pcache: new Map(), mlbIdx: new Map(), live: true,
    sbLg: { rate: prior.sbLg.rate, succ: prior.sbLg.succ },
  };
  const retroOf = id => idmap[id] || null;
  const ensure = (mlbam, name, bats, throws) => {
    let idx = S.mlbIdx.get(mlbam);
    if (idx !== undefined) {
      const p = S.players[idx];
      if (bats && p.bats === 'R' && !p._set) { p.bats = bats; } if (throws) p.throws = throws;
      return idx;
    }
    idx = S.players.length;
    const retro = retroOf(mlbam);
    S.players.push({ idx, id: retro || 'mlb' + mlbam, name: name || 'Player ' + mlbam, bats: bats || 'R', throws: throws || 'R', mlbam });
    S.playersById.set(retro || 'mlb' + mlbam, S.players[idx]);
    S.mlbIdx.set(mlbam, idx);
    return idx;
  };
  S.ensure = ensure;
  // league share of 2B/3B among non-HR hits (from prior season) for pitchers lacking those fields
  let n1 = 0, n2 = 0, n3 = 0;
  for (const { n } of prior.batRows.values()) { n1 += n[4]; n2 += n[5]; n3 += n[6]; }
  const lgShare = [n1 / (n1 + n2 + n3), n2 / (n1 + n2 + n3), n3 / (n1 + n2 + n3)];
  const priorOf = (mlbam, kind) => {
    const r = retroOf(mlbam); if (!r) return null;
    const p = prior.playersById.get(r); if (!p) return null;
    return (kind === 'bat' ? prior.batRows : prior.pitRows).get(p.idx)?.n || null;
  };
  const lgB = new Array(9).fill(0), lgP = new Array(9).fill(0);
  // hitters
  for (const [id, rec] of Object.entries(live.hit)) {
    const mlbam = +id, c = hitCounts(rec.stat);
    if (c.pa <= 0 && !live.roster) continue;
    const pp = live.people[mlbam] || {};
    const idx = ensure(mlbam, rec.name, pp.bats, pp.throws);
    const pr = priorOf(mlbam, 'bat');
    const row = new Array(19).fill(0);
    row[0] = c.pa; for (let i = 0; i < 8; i++) row[1 + i] = c.o[i];
    row[15] = c.opp; row[16] = c.sb + c.cs; row[17] = c.sb; row[18] = c.ibb;
    for (let i = 0; i < 9; i++) lgB[i] += row[i];
    if (pr && pr[0] > 0) {
      const P = 250 * Math.exp(-c.pa / 400), s = P / pr[0];
      for (let i = 0; i < 9; i++) row[i] += pr[i] * s;
      for (let i = 15; i < 18; i++) row[i] += pr[i] * s;
      for (let i = 9; i < 15; i++) row[i] = pr[i];         // batted-ball type / direction tendencies from last season
    }
    S.batRows.set(idx, { n: row, pf: [1, 1, 1, 1], raw: c });
  }
  // pitchers
  for (const [id, rec] of Object.entries(live.pit)) {
    const mlbam = +id, c = pitCounts(rec.stat, lgShare);
    const pp = live.people[mlbam] || {};
    const idx = ensure(mlbam, rec.name, pp.bats, pp.throws);
    const pr = priorOf(mlbam, 'pit');
    const row = new Array(22).fill(0);
    row[0] = c.bf; for (let i = 0; i < 8; i++) row[1 + i] = c.o[i];
    row[12] = c.g; row[13] = c.gs; row[14] = c.outs; row[15] = c.bfAll; row[16] = c.gs > 0 ? c.bfAll * Math.min(1, c.gs / Math.max(1, c.g)) : 0; row[17] = c.gf; row[18] = c.sv; row[20] = c.er; row[21] = c.r;
    for (let i = 0; i < 9; i++) lgP[i] += row[i];
    if (pr && pr[0] > 0) {
      const P = 300 * Math.exp(-c.bf / 500), s = P / pr[0];
      for (let i = 0; i < 9; i++) row[i] += pr[i] * s;
      for (let i = 9; i < 12; i++) row[i] = pr[i];
      const s2 = Math.exp(-c.g / 10);
      for (const i of [12, 13, 14, 15, 16, 17, 18]) row[i] += pr[i] * s2;
    }
    S.pitRows.set(idx, { n: row, pf: [1, 1, 1, 1], raw: c });
  }
  // league baselines: current totals, padded with last season while the sample is small
  const priorBase = (k) => { const a = prior.base.AL?.[k] || new Array(9).fill(0), b = prior.base.NL?.[k] || new Array(9).fill(0); return a.map((x, i) => x + b[i]); };
  const padTo = (cur, pri, target) => { const tot = cur[0]; if (tot >= target || !pri[0]) return cur.slice(); const s = (target - tot) / pri[0]; return cur.map((x, i) => x + pri[i] * s); };
  const bat = padTo(lgB, priorBase('bat'), 25000), pit = padTo(lgP, priorBase('pit'), 25000);
  S.base.AL = { bat, batP: new Array(9).fill(0), pit }; S.base.NL = S.base.AL;
  // steal environment
  let opp = 0, att = 0, suc = 0;
  for (const { n } of S.batRows.values()) { opp += n[15]; att += n[16]; suc += n[17]; }
  if (att > 400) S.sbLg = { rate: att / Math.max(1, opp), succ: suc / att };
  // teams
  for (const [code, [nm, lg, div]] of Object.entries(TEAM_INFO)) {
    const t = live.teams[code];
    const pt = prior.teams[code];
    S.teams[code] = { n: t?.name || nm, lg: t?.lg || lg, d: t?.div || div, w: 0, l: 0, rs: 0, ra: 0, p: pt?.p || '' };
  }
  for (const site of Object.keys(prior.parks)) S.parks[site] = prior.parks[site];
  // ballpark of each team: this season's home venue if we can identify a Retrosheet site, else last season's
  const homeSite = {};
  for (const g of live.schedule) if (g.venue && /^[A-Z]{3}\d\d$/.test(g.venue)) (homeSite[g.home] ||= {})[g.venue] = 1 + (homeSite[g.home][g.venue] || 0);
  for (const [code, o] of Object.entries(homeSite)) { const best = Object.entries(o).sort((a, b) => b[1] - a[1])[0][0]; S.teams[code].p = best; }
  // records from finals
  for (const g of live.schedule) if (g.state === 'Final' && g.as !== null && g.hs !== null && (!g.gt || g.gt === 'R')) {
    const A = S.teams[g.away], H = S.teams[g.home];
    A.rs += g.as; A.ra += g.hs; H.rs += g.hs; H.ra += g.as;
    if (g.as > g.hs) { A.w++; H.l++; } else if (g.hs > g.as) { H.w++; A.l++; }
  }
  return S;
}

// ---------------------------------------------------------------- teams for the sim
const OF = new Set(['LF', 'CF', 'RF', 'OF']), IF = new Set(['1B', '2B', '3B', 'SS', 'IF']);
const POSN = { C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9, DH: 10 };

/** Auto-managed sim team from the live roster + blended ratings. */
export function buildLiveTeam(S, code, live, opts = {}) {
  const lg = S.teams[code].lg;
  const P = idx => makePlayer(S, idx, lg);
  const roster = (live.roster[code] || []).slice();
  const hit = [], pitch = [];
  for (const r of roster) {
    const idx = S.mlbIdx.get(r.id);
    if (idx === undefined) { const pp = live.people[r.id] || {}; const i2 = S.ensure(r.id, r.name, pp.bats, pp.throws); (r.pos === 'P' ? pitch : hit).push({ idx: i2, pos: r.pos }); continue; }
    if (r.pos === 'P' || (S.pitRows.has(idx) && !S.batRows.has(idx))) pitch.push({ idx, pos: 'P' });
    else hit.push({ idx, pos: r.pos });
    if (r.pos === 'TWP') pitch.push({ idx, pos: 'P' });
  }
  const pa = h => S.batRows.get(h.idx)?.raw.pa || 0;
  const rate = h => P(h.idx).bat.woba;
  hit.sort((a, b) => pa(b) - pa(a));
  const used = new Set(), lineup = [];
  const take = (pos, pred) => { const c = hit.find(h => !used.has(h.idx) && pred(h)); if (c) { used.add(c.idx); lineup.push({ idx: c.idx, pos }); return true; } return false; };
  for (const pos of ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B']) {
    if (!take(pos, h => h.pos === pos)) if (!take(pos, h => (OF.has(pos) && h.pos === 'OF') || (IF.has(pos) && h.pos === 'IF'))) take(pos, h => pa(h) > 50);
  }
  const rest = hit.filter(h => !used.has(h.idx) && pa(h) > 0).sort((a, b) => rate(b) - rate(a));
  if (rest.length) { used.add(rest[0].idx); lineup.push({ idx: rest[0].idx, pos: 'DH' }); }
  for (const l of lineup) if (typeof l.pos === 'string') l.pos = POSN[l.pos] || 10;
  while (lineup.length < 9 && hit.length) { const c = hit.find(h => !used.has(h.idx)); if (!c) break; used.add(c.idx); lineup.push({ idx: c.idx, pos: 10 }); }
  // batting order: best hitters at the top (2nd-best leads off, best bats 2nd)
  lineup.sort((a, b) => rate(b) - rate(a));
  const order = [1, 0, 2, 3, 4, 5, 6, 7, 8];
  const ordered = order.map(i => lineup[i]).filter(Boolean);
  const bench = hit.filter(h => !used.has(h.idx)).slice(0, 8).map(h => P(h.idx)).filter(p => p.bat.pa > 0 || true);
  pitch.sort((a, b) => (S.pitRows.get(b.idx)?.raw.gs || 0) - (S.pitRows.get(a.idx)?.raw.gs || 0) || (S.pitRows.get(b.idx)?.raw.g || 0) - (S.pitRows.get(a.idx)?.raw.g || 0));
  const gs = h => S.pitRows.get(h.idx)?.n[13] || 0;
  let rot = pitch.filter(h => gs(h) >= 3).slice(0, 5);
  if (rot.length < 4) rot = pitch.slice(0, 5);
  const rotSet = new Set(rot.map(h => h.idx));
  const pen = pitch.filter(h => !rotSet.has(h.idx)).sort((a, b) => (S.pitRows.get(b.idx)?.n[12] || 0) - (S.pitRows.get(a.idx)?.n[12] || 0)).slice(0, 9).map(h => P(h.idx));
  const team = {
    key: 'L' + S.y + code, code, year: S.y, name: S.teams[code].n, lg, S, dh: true, live: true,
    park: { id: S.teams[code].p, name: getGlobal()?.parks?.[S.teams[code].p]?.n || live.teams[code]?.venue || 'Home park', pf: S.parks[S.teams[code].p] || [1, 1, 1, 1] },
    lineup: ordered.map(x => ({ p: P(x.idx), pos: x.pos })),
    rotation: rot.map(h => P(h.idx)), bench, bullpen: pen, lookup: P, P, script: null,
  };
  team.sp = team.rotation[0] || pen[0];
  finishRoles(team);
  return applyUserDefault(team);
}

/** Sim teams for one real game: probable pitchers and (if posted) real lineups. */
export async function liveGameTeams(S, live, game, { useFeed = true } = {}) {
  const A = buildLiveTeam(S, game.away, live), H = buildLiveTeam(S, game.home, live);
  const setSP = (team, pp) => {
    if (!pp) return;
    let idx = S.mlbIdx.get(pp.id);
    if (idx === undefined) idx = S.ensure(pp.id, pp.name, live.people[pp.id]?.bats, live.people[pp.id]?.throws);
    const p = team.P(idx);
    team.bullpen = team.bullpen.filter(x => x !== p);
    team.sp = p; team.spNamed = true;
  };
  setSP(A, game.app); setSP(H, game.hpp);
  let feedUsed = false;
  if (useFeed && typeof game.pk === 'number') {
    try {
      const j = await getJSON(`https://statsapi.mlb.com/api/v1.1/game/${game.pk}/feed/live`, 15000);
      const bs = j.liveData?.boxscore?.teams;
      for (const [side, team] of [['away', A], ['home', H]]) {
        const order = bs?.[side]?.battingOrder || [];
        if (order.length === 9) {
          const players = bs[side].players || {};
          const lu = [];
          for (const id of order) {
            const pl = players['ID' + id]; const info = live.people[id] || {};
            let idx = S.mlbIdx.get(id);
            if (idx === undefined) idx = S.ensure(id, pl?.person?.fullName, pl?.batSide?.code || info.bats, info.throws);
            const ab = pl?.position?.abbreviation || pl?.allPositions?.[0]?.abbreviation || 'DH';
            lu.push({ p: team.P(idx), pos: POSN[ab] || 10 });
          }
          team.lineup = lu; feedUsed = true;
          const inLu = new Set(lu.map(x => x.p));
          team.bench = team.bench.filter(b => !inLu.has(b));
        }
        const sp = j.gameData?.probablePitchers?.[side];
        if (sp?.id && !team.spNamed) setSP(team, { id: sp.id, name: sp.fullName });
      }
    } catch (e) { /* feed unavailable: fine */ }
  }
  return { away: A, home: H, feedUsed };
}

/** Standings from a schedule's final games. */
export function standingsFrom(schedule, teams) {
  const rec = {};
  for (const c of Object.keys(teams)) rec[c] = { code: c, w: 0, l: 0, rs: 0, ra: 0, home: [0, 0], away: [0, 0] };
  for (const g of schedule) {
    if (g.state !== 'Final' || g.as === null || g.hs === null || (g.gt && g.gt !== 'R')) continue;
    const A = rec[g.away], H = rec[g.home]; if (!A || !H) continue;
    A.rs += g.as; A.ra += g.hs; H.rs += g.hs; H.ra += g.as;
    if (g.as > g.hs) { A.w++; H.l++; A.away[0]++; H.home[1]++; } else if (g.hs > g.as) { H.w++; A.l++; H.home[0]++; A.away[1]++; }
  }
  return rec;
}

// ---------------------------------------------------------------- rest-of-season projection
import { League } from './league.js';
import { buildTeam } from './teams.js';

const dnum = d => Date.UTC(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100) / 86400000;

/** Simulate the unplayed remainder of the schedule n times from the real current standings. */
export async function projectSeason(getTeam, teamsMeta, schedule, n, onProgress) {
  const codes = Object.keys(teamsMeta);
  const teams = Object.fromEntries(codes.map(c => [c, getTeam(c)]));
  const base = standingsFrom(schedule, teamsMeta);
  const remaining = schedule.filter(g => (!g.gt || g.gt === 'R') && g.state !== 'Final' && !/postponed|cancel/i.test(g.detail || ''));
  const d0 = remaining.length ? Math.min(...remaining.map(g => dnum(g.date))) : 0;
  const sched = remaining.map(g => ({ day: dnum(g.date) - d0, home: g.home, away: g.away, date: g.date }));
  const agg = Object.fromEntries(codes.map(c => [c, { w: 0, l: 0, div: 0, wc: 0, po: 0, best: 0 }]));
  for (let i = 0; i < n; i++) {
    const entries = codes.map(c => ({ id: c, name: teamsMeta[c].name, team: teams[c], lg: teamsMeta[c].lg, div: teamsMeta[c].div }));
    const lg = new League(entries, sched.map(g => ({ ...g })), { method: 'odds', dhRule: 'always', ghost: true, restP: 0 });
    for (const c of codes) { const r = lg.rt.get(c); r.w = base[c].w; r.l = base[c].l; r.rs = base[c].rs; r.ra = base[c].ra; }
    lg.simAll();
    const fin = {};
    for (const c of codes) { const r = lg.rt.get(c); fin[c] = r.w; agg[c].w += r.w; agg[c].l += r.l; }
    for (const L of ['AL', 'NL']) {
      const inL = codes.filter(c => teamsMeta[c].lg === L);
      const key = c => fin[c] + (lg.rt.get(c).rs - lg.rt.get(c).ra) / 100000 + Math.random() * 1e-6;
      const winners = new Set();
      for (const d of ['E', 'C', 'W']) {
        const dv = inL.filter(c => teamsMeta[c].div === d).sort((a, b) => key(b) - key(a));
        if (dv[0]) { winners.add(dv[0]); agg[dv[0]].div++; }
      }
      const rest = inL.filter(c => !winners.has(c)).sort((a, b) => key(b) - key(a)).slice(0, 3);
      for (const c of winners) agg[c].po++;
      for (const c of rest) { agg[c].wc++; agg[c].po++; }
      const top = inL.slice().sort((a, b) => key(b) - key(a))[0]; agg[top].best++;
    }
    if (onProgress) onProgress((i + 1) / n);
    await new Promise(r => setTimeout(r, 0));
  }
  return Object.fromEntries(codes.map(c => [c, { w: agg[c].w / n, l: agg[c].l / n, div: agg[c].div / n, wc: agg[c].wc / n, po: agg[c].po / n, best: agg[c].best / n, cur: base[c] }]));
}

// ---------------------------------------------------------------- postseason bracket
import { Postseason, bracketNodes } from './league.js';
export const ROUND_LABEL = { WC: 'Wild Card Series', DV: 'Division Series', LC: 'League Championship Series', WS: 'World Series' };
const GT_ROUND = { F: 'WC', D: 'DV', L: 'LC', W: 'WS' };
const ROUND_ORDER = ['WC', 'DV', 'LC', 'WS'];

/** Group real postseason games into series: [{round, teams:[home of G1, away of G1], games, wins:{code:n}, done, need}] */
export function realSeries(post) {
  const by = new Map();
  for (const g of post.slice().sort((a, b) => a.date - b.date || (a.dt || '').localeCompare(b.dt || ''))) {
    const round = GT_ROUND[g.gt] || 'DV';
    const key = round + ':' + [g.away, g.home].sort().join('-');
    if (!by.has(key)) by.set(key, { key, round, teams: [g.home, g.away], games: [], wins: { [g.home]: 0, [g.away]: 0 }, need: 0 });
    const s = by.get(key);
    s.games.push(g);
    if (g.state === 'Final' && g.as !== null) s.wins[g.hs > g.as ? g.home : g.away]++;
    if (g.gis) s.need = Math.max(s.need, Math.ceil(g.gis / 2));
  }
  const defNeed = { WC: 2, DV: 3, LC: 4, WS: 4 };
  for (const s of by.values()) { if (!s.need) s.need = defNeed[s.round]; s.done = Math.max(...Object.values(s.wins)) >= s.need; s.winner = s.done ? Object.keys(s.wins).find(c => s.wins[c] >= s.need) : null; }
  return [...by.values()];
}

const wpct = r => (r.w + r.l ? r.w / (r.w + r.l) : 0);

/** Seeds (best first) per league from real standings, overridden by real Wild Card pairings when MLB has set them. */
function leagueSeeds(lg, rec, meta, real) {
  const codes = Object.keys(meta).filter(c => meta[c].lg === lg);
  const key = c => wpct(rec[c]) + (rec[c].rs - rec[c].ra) / 1e7;
  const winners = [];
  for (const d of ['E', 'C', 'W']) { const dv = codes.filter(c => meta[c].div === d).sort((a, b) => key(b) - key(a)); if (dv[0]) winners.push(dv[0]); }
  winners.sort((a, b) => key(b) - key(a));
  const wcs = codes.filter(c => !winners.includes(c)).sort((a, b) => key(b) - key(a)).slice(0, 3);
  let seeds = winners.concat(wcs);
  const wc = real.filter(s => s.round === 'WC' && s.teams.every(t => meta[t]?.lg === lg));
  if (wc.length) {
    // MLB has set the Wild Card round: 3v6 and 4v5 with the better seed at home
    let pairs = wc.slice().sort((a, b) => key(b.teams[0]) - key(a.teams[0]));
    const inWC = new Set(pairs.flatMap(p => p.teams));
    const byes = seeds.filter(c => !inWC.has(c) && winners.includes(c)).slice(0, 2);
    // if the Division Series already exist, they settle which pair is 3v6 and which is 4v5 (seed 1 meets the 4/5 winner)
    const ds = real.filter(x => x.round === 'DV' && byes.some(b => x.teams.includes(b)));
    const top = ds.find(x => x.teams.includes(byes[0]));
    if (top && pairs.length === 2) {
      const opp = top.teams.find(t => t !== byes[0]);
      const i = pairs.findIndex(p => p.teams.includes(opp));
      if (i === 0) pairs = [pairs[1], pairs[0]];
    }
    const s34 = pairs.map(p => p.teams[0]), s65 = pairs.map(p => p.teams[1]);
    if (byes.length === 2 && pairs.length === 2) seeds = [...byes, s34[0], s34[1], s65[1], s65[0]];
  }
  return seeds;
}

/**
 * Postseason for the live season: real matchups/results wherever MLB has them, otherwise a projected 12-team bracket
 * from the current standings. Real results feed forward (defaultActual) so you can play any series and carry on.
 */
export function buildLivePostseason(live, meta) {
  const rec = standingsFrom(live.schedule, meta);
  const real = realSeries(live.post || []);
  const entry = c => ({ id: c, code: c, name: meta[c].name, year: live.year, lg: meta[c].lg, rec: [rec[c].w, rec[c].l] });
  const nodes = [];
  const finalists = [];
  for (const lg of ['AL', 'NL']) {
    const seeds = leagueSeeds(lg, rec, meta, real).slice(0, 6);
    if (seeds.length < 2) continue;
    const b = bracketNodes(seeds.map(entry), [2, 3, 4], lg + ' ');
    const base = nodes.length;
    const rounds = ['WC', 'DV', 'LC'];
    for (const n of b.nodes) {
      n.slots = n.slots.map(sl => (sl.node !== undefined ? { node: sl.node + base } : sl));
      n.round = rounds[n.round]; n.label = `${lg} ${ROUND_LABEL[n.round]}`; n.lg = lg;
      nodes.push(n);
    }
    finalists.push({ node: nodes.length - 1 });
  }
  if (finalists.length === 2) nodes.push({ label: ROUND_LABEL.WS, round: 'WS', slots: finalists.map(f => ({ node: f.node })), need: 4 });
  const ps = new Postseason(nodes, {
    defaultActual: true,
    higherSeed: (A, B, n) => {
      if (n.actualTeams && n.actualTeams.includes(A.id) && n.actualTeams.includes(B.id)) return n.actualTeams[0] === A.id ? -1 : 1;
      return wpct({ w: B.rec[0], l: B.rec[1] }) - wpct({ w: A.rec[0], l: A.rec[1] });
    },
  });
  // attach real series (feeders first, so real winners resolve downstream teams)
  for (const n of ps.nodes) {
    const [a, b] = ps.teams(n);
    if (!a || !b) continue;
    const rs = real.find(s => s.round === n.round && s.teams.includes(a.id) && s.teams.includes(b.id));
    if (!rs) continue;
    n.need = rs.need;
    n.actualTeams = rs.teams;
    n.realGames = rs.games;
    n.actual = { wins: rs.teams.map(t => rs.wins[t]), games: rs.games, winner: rs.winner, inProgress: !rs.done };
    if (rs.done) n.actualWinner = entry(rs.winner);
  }
  ps.real = real;
  ps.hasReal = real.length > 0;
  return ps;
}
