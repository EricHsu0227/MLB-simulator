// Builds a fake statsapi.mlb.com from the bundled 2025 data, using the API's documented response shapes.
import { setDataBase, loadGlobal, loadSeason, loadJSONGz } from '../web/js/data.js';
import { buildTeam } from '../web/js/teams.js';
import { MLB_TEAM, RS_TO_MLB, TEAM_INFO } from '../web/js/live.js';
const DIVID = { AL: { E: 201, C: 202, W: 200 }, NL: { E: 204, C: 205, W: 203 } };
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal();
const S = await loadSeason(2025);
const idmap = await loadJSONGz(new URL('../data/idmap.json.gz', import.meta.url).pathname);
const retro2mlb = {}; for (const [m, r] of Object.entries(idmap)) retro2mlb[r] = +m;
const POSABB = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH' };
const teams = {}, roster = {}, people = {}, hit = [], pit = [];
for (const [tid, code] of Object.entries(MLB_TEAM)) {
  const t = buildTeam(S, code === 'ATH' ? 'ATH' : code);
  const nm = S.teams[code]?.n || code;
  teams[tid] = { id: +tid, name: nm, abbreviation: code, league: { id: S.teams[code].lg === 'AL' ? 103 : 104, name: S.teams[code].lg === 'AL' ? 'American League' : 'National League' }, division: { id: DIVID[TEAM_INFO[code][1]][TEAM_INFO[code][2]] }, venue: { name: 'Park ' + code } };
  const r = [];
  const add = (p, pos) => { const m = retro2mlb[p.id]; if (!m) return; r.push({ person: { id: m, fullName: p.name }, position: { abbreviation: pos } }); people[m] = { id: m, fullName: p.name, batSide: { code: p.bats }, pitchHand: { code: p.throws } }; };
  for (const x of t.lineup) if (x.pos !== 1) add(x.p, POSABB[x.pos]);
  for (const p of t.bench) add(p, 'OF');
  for (const p of [...t.rotation, ...t.bullpen]) add(p, 'P');
  roster[tid] = { roster: r };
}
// stats from 2025 rows
const P = S.players;
for (const [idx, row] of S.batRows) {
  const m = retro2mlb[P[idx].id]; if (!m) continue; const n = row.n;
  hit.push({ player: { id: m, fullName: P[idx].name }, team: { id: 0 }, stat: { plateAppearances: n[0] + n[18], atBats: n[0] - n[2] - n[3], hits: n[4] + n[5] + n[6] + n[7], doubles: n[5], triples: n[6], homeRuns: n[7], baseOnBalls: n[2] + n[18], intentionalWalks: n[18], hitByPitch: n[3], strikeOuts: n[1], stolenBases: n[17], caughtStealing: n[16] - n[17] } });
}
for (const [idx, row] of S.pitRows) {
  const m = retro2mlb[P[idx].id]; if (!m) continue; const n = row.n;
  pit.push({ player: { id: m, fullName: P[idx].name }, team: { id: 0 }, stat: { battersFaced: n[0], strikeOuts: n[1], baseOnBalls: n[2], hitBatsmen: n[3], hits: n[4] + n[5] + n[6] + n[7], homeRuns: n[7], gamesPlayed: n[12], gamesStarted: n[13], inningsPitched: `${Math.floor(n[14] / 3)}.${n[14] % 3}`, gamesFinished: n[17], saves: n[18], earnedRuns: n[20], runs: n[21] } });
}
// schedule: bundled 2026 schedule; games before the cut-off are Final
const sched = await loadJSONGz(new URL('../data/live/2026schedule.json.gz', import.meta.url).pathname);
const cutoff = +(process.env.CUTOFF || 20260615);
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const rots = {}; for (const c of Object.values(MLB_TEAM)) rots[c] = buildTeam(S, c).rotation;
const games = new Map();
sched.forEach(([d, num, v, hm, park], i) => {
  const ds = `${Math.floor(d / 10000)}-${String(Math.floor(d / 100) % 100).padStart(2, '0')}-${String(d % 100).padStart(2, '0')}`;
  if (!games.has(ds)) games.set(ds, []);
  const final = d < cutoff;
  const pp = c => { const p = rots[c][i % rots[c].length]; const m = retro2mlb[p.id]; return m ? { id: m, fullName: p.name } : undefined; };
  const away = { team: { id: RS_TO_MLB[v], name: v }, score: final ? Math.floor(rnd() * 8) : undefined, probablePitcher: d >= cutoff ? pp(v) : undefined };
  const home = { team: { id: RS_TO_MLB[hm], name: hm }, score: final ? Math.floor(rnd() * 8) : undefined, probablePitcher: d >= cutoff ? pp(hm) : undefined };
  if (final && away.score === home.score) home.score++;
  games.get(ds).push({ gamePk: 800000 + i, gameDate: `${ds}T23:05:00Z`, officialDate: ds, doubleHeader: 'N', gameNumber: 1, status: { abstractGameState: final ? 'Final' : 'Preview', detailedState: final ? 'Final' : 'Scheduled' }, teams: { away, home }, venue: { name: park } });
});
// ---- postseason (only when POST=1): WC series final, DS series 1 game in
const finals = [];
for (const arr of games.values()) for (const g of arr) if (g.status.abstractGameState === 'Final') finals.push(g);
const rec = {}; for (const c of Object.values(MLB_TEAM)) rec[c] = { w: 0, l: 0 };
for (const g of finals) { const a = g.teams.away, h = g.teams.home; const ac = MLB_TEAM[a.team.id], hc = MLB_TEAM[h.team.id]; if (h.score > a.score) { rec[hc].w++; rec[ac].l++; } else { rec[ac].w++; rec[hc].l++; } }
const postGames = [];
if (process.env.POST) {
  const wp = c => rec[c].w / (rec[c].w + rec[c].l);
  const seeds = {};
  for (const L of ['AL', 'NL']) {
    const codes = Object.keys(TEAM_INFO).filter(c => TEAM_INFO[c][1] === L);
    const winners = ['E', 'C', 'W'].map(d => codes.filter(c => TEAM_INFO[c][2] === d).sort((a, b) => wp(b) - wp(a))[0]).sort((a, b) => wp(b) - wp(a));
    const wc = codes.filter(c => !winners.includes(c)).sort((a, b) => wp(b) - wp(a)).slice(0, 3);
    seeds[L] = winners.concat(wc);
  }
  let pk = 900000; const mkGame = (date, gt, series, sgn, gis, home, away, final) => {
    const hs = final ? 2 + Math.floor(rnd() * 6) : undefined, as_ = final ? Math.floor(rnd() * 6) : undefined;
    const ds = `2026-${String(Math.floor(date / 100) % 100).padStart(2, '0')}-${String(date % 100).padStart(2, '0')}`;
    const pp = c => { const p = rots[c][sgn % rots[c].length]; const m = retro2mlb[p.id]; return m ? { id: m, fullName: p.name } : undefined; };
    const H = { team: { id: RS_TO_MLB[home] }, score: hs, probablePitcher: final ? undefined : pp(home) }, A = { team: { id: RS_TO_MLB[away] }, score: as_, probablePitcher: final ? undefined : pp(away) };
    if (final && H.score === A.score) H.score++;
    return { gamePk: pk++, gameDate: `${ds}T23:00:00Z`, officialDate: ds, gameType: gt, seriesDescription: series, seriesGameNumber: sgn, gamesInSeries: gis, doubleHeader: 'N', gameNumber: 1, status: { abstractGameState: final ? 'Final' : 'Preview', detailedState: final ? 'Final' : 'Scheduled' }, teams: { away: A, home: H }, venue: { name: 'Park' } };
  };
  const wcWin = {};
  for (const L of ['AL', 'NL']) {
    const s = seeds[L];
    for (const [hi, lo] of [[2, 5], [3, 4]]) {
      let hw = 0, lw = 0;
      for (let g = 1; g <= 3 && hw < 2 && lw < 2; g++) { const gm = mkGame(1001 + g, 'F', 'Wild Card Series', g, 3, s[hi], s[lo], true); postGames.push(gm); if (gm.teams.home.score > gm.teams.away.score) hw++; else lw++; }
      wcWin[s[hi]] = hw > lw ? s[hi] : s[lo]; wcWin[s[lo]] = wcWin[s[hi]];
    }
    // DS: seed1 v winner(4/5) ; seed2 v winner(3/6): first game played, second scheduled
    const w45 = wcWin[s[3]], w36 = wcWin[s[2]];
    postGames.push(mkGame(1005, 'D', 'Division Series', 1, 5, s[0], w45, true), mkGame(1006, 'D', 'Division Series', 2, 5, s[0], w45, false));
    postGames.push(mkGame(1005, 'D', 'Division Series', 1, 5, s[1], w36, true), mkGame(1006, 'D', 'Division Series', 2, 5, s[1], w36, false));
  }
}
const postJson = { dates: [] };
for (const g of postGames) { const d = g.officialDate; let e = postJson.dates.find(x => x.date === d); if (!e) postJson.dates.push(e = { date: d, games: [] }); e.games.push(g); }
const scheduleJson = { dates: [...games.entries()].map(([date, g]) => ({ date, games: g })) };
export function handle(url) {
  const u = new URL(url);
  const p = u.pathname.replace('/api/v1', '');
  if (p === '/teams') return { teams: Object.values(teams) };
  if (p === '/schedule') return /gameType=F/.test(u.search) || u.searchParams.get('gameType') === 'F,D,L,W' ? postJson : scheduleJson;
  if (p === '/stats') { const off = +u.searchParams.get('offset') || 0; const grp = u.searchParams.get('group'); const all = grp === 'hitting' ? hit : pit; return { stats: [{ splits: all.slice(off, off + 1000) }] }; }
  const m = p.match(/^\/teams\/(\d+)\/roster/); if (m) return roster[m[1]] || { roster: [] };
  if (p === '/people') return { people: u.searchParams.get('personIds').split(',').map(id => people[id]).filter(Boolean) };
  return null;
}
export const stats = { hit: hit.length, pit: pit.length, games: sched.length };
