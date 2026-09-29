// Historic postseason replays and playoff seeding for seasons / custom leagues.
import { Postseason, bracketNodes } from './league.js';
import { buildTeam, realGameTeam, usesDH } from './teams.js';

export const ROUND_NAME = { WC: 'Wild Card', DV: 'Division Series', LC: 'League Championship Series', WS: 'World Series' };
const ROUND_ORDER = { WC: 1, DV: 2, LC: 3, WS: 4 };

export function seriesLabel(round, teams, S) {
  const lg = S?.teams?.[teams[0]]?.lg;
  const a = S?.teams?.[teams[0]]?.lg, b = S?.teams?.[teams[1]]?.lg;
  let l = round === 'WS' ? '' : (a && a === b ? a + ' ' : '');
  return l + (ROUND_NAME[round] || round);
}

export function entryFor(S, code) {
  const t = S.teams[code] || {};
  return { id: code, code, name: t.n || code, year: S.y, lg: t.lg, rec: [t.w || 0, t.l || 0] };
}

/** Build a Postseason from real series data of a season. */
export function historicPostseason(S) {
  const raw = S.series;
  const nodes = raw.map((s, i) => ({
    label: seriesLabel(s.round, s.teams, S),
    round: s.round,
    slots: s.teams.map((t, k) => (s.from[k] >= 0 ? { node: s.from[k] } : { entry: entryFor(S, t) })),
    need: s.need,
    actualTeams: s.teams,
    actualWinner: entryFor(S, s.winner),
    actual: { wins: s.wins, games: s.games, winner: s.winner },
  }));
  const ps = new Postseason(nodes, {
    defaultActual: true,
    higherSeed: (A, B, n) => {
      const pa = A.rec[0] / Math.max(1, A.rec[0] + A.rec[1]), pb = B.rec[0] / Math.max(1, B.rec[0] + B.rec[1]);
      if (n.actualTeams && n.actualTeams.includes(A.id) && n.actualTeams.includes(B.id)) return n.actualTeams[0] === A.id ? -1 : 1;
      return pb - pa;   // negative when A has the better record
    },
  });
  return ps;
}

/** Team-preparation callback for series games in a historic postseason. */
export function historicPrepare(S, opts = {}) {
  const cache = new Map();
  const findGames = (code, node) => {
    if (node.actual && node.actualTeams.includes(code)) return { games: node.actual.games.map(i => S.games[i]), same: true };
    for (let i = S.series.length - 1; i >= 0; i--) {
      const s = S.series[i];
      if (s.teams.includes(code)) return { games: s.games.map(k => S.games[k]), same: false };
    }
    return null;
  };
  return function prepare(node, entry, gameNo, opp, isHome) {
    const code = entry.code;
    const found = findGames(code, node);
    let team;
    if (!found || !found.games.length) {
      team = buildTeam(S, code);
      team.script = null;
    } else {
      const games = found.games.slice().sort((a, b) => a.date - b.date || a.num - b.num);
      const g = games[gameNo % games.length];
      const ti = g.vis === code ? 0 : 1;
      team = realGameTeam(S, g, ti, { days: 25 });
      // rotation of actual starters in this series (for reference / UI)
      team.rotation = [...new Set(games.map(x => (x.vis === code ? x.vsp : x.hsp)).filter(i => i >= 0))].map(i => team.lookup(i));
      const sameMatchup = found.same && opp && node.actualTeams.includes(opp.code) && gameNo < games.length;
      if (!(opts.realSubs && sameMatchup && g.vis === (isHome ? opp.code : code) )) team.script = null;
    }
    team.dh = usesDH(S, team.lg);
    return team;
  };
}

// ------------------------------------------------------------------ playoff seeding for seasons and custom leagues
/**
 * cfg: { perLeague: N, needs: [round0..], finalNeed, divWinnersFirst: bool, singleTable: bool }
 * Returns Postseason (leagues' brackets + final).
 */
export function playoffFromLeague(league, cfg) {
  const ranked = league.rankedByLeague();
  const wp = r => (r.w + r.l ? r.w / (r.w + r.l) : 0);
  const entryOf = r => ({ id: r.e.id, code: r.e.id, name: r.e.name, entry: r.e, rec: [r.w, r.l], lg: r.e.lg });
  const lgSeeds = new Map();
  for (const [lg, rows] of ranked) {
    let seeds;
    const N = Math.min(cfg.perLeague, rows.length);
    if (cfg.divWinnersFirst) {
      const dw = [];
      const seen = new Set();
      for (const r of rows) { const d = r.e.div || ''; if (!seen.has(d)) { seen.add(d); dw.push(r); } }
      const rest = rows.filter(r => !dw.includes(r));
      const dwSorted = dw.slice(0, N);
      seeds = dwSorted.concat(rest).slice(0, N);
    } else seeds = rows.slice(0, N);
    lgSeeds.set(lg, seeds.map(entryOf));
  }
  const nodes = [];
  const finalists = [];
  const lgs = [...lgSeeds.keys()];
  for (const lg of lgs) {
    const seeds = lgSeeds.get(lg);
    if (seeds.length < 2) { if (seeds.length === 1) finalists.push({ entry: seeds[0] }); continue; }
    const rounds = Math.ceil(Math.log2(seeds.length));
    const needs = (cfg.needs || []).slice(-rounds);
    while (needs.length < rounds) needs.unshift(cfg.needs?.[0] ?? 3);
    const b = bracketNodes(seeds, needs, lg ? lg + ' ' : '');
    const base = nodes.length;
    for (const n of b.nodes) {
      n.slots = n.slots.map(s => (s.node !== undefined ? { node: s.node + base } : s));
      n.lg = lg;
      nodes.push(n);
    }
    finalists.push({ node: nodes.length - 1 });
  }
  if (finalists.length === 2) {
    nodes.push({ label: cfg.finalLabel || 'Final', round: 99, slots: finalists.map(f => (f.entry ? { entry: f.entry } : { node: f.node })), need: cfg.finalNeed || 4 });
  }
  const ps = new Postseason(nodes, {
    defaultActual: false,
    higherSeed: (A, B) => {
      const pa = A.rec[0] / Math.max(1, A.rec[0] + A.rec[1]), pb = B.rec[0] / Math.max(1, B.rec[0] + B.rec[1]);
      return pb - pa;
    },
  });
  return ps;
}

/** Playoff format that mirrors a historic year (teams per league, series lengths). */
export function historicFormat(S) {
  const perLg = new Map();
  for (const s of S.series) for (const t of s.teams) { const lg = S.teams[t]?.lg; if (!perLg.has(lg)) perLg.set(lg, new Set()); perLg.get(lg).add(t); }
  let n = 0;
  for (const [lg, set] of perLg) n = Math.max(n, set.size);
  if (S.series.some(s => s.round === 'WS') && n === 0) n = 1;
  const needFor = r => { const x = S.series.filter(s => s.round === r); return x.length ? Math.max(...x.map(s => s.need)) : null; };
  const rounds = [];
  if (n > 4 || (n === 5) || n === 6 || n === 8) { /* wild-card round */ }
  const roundList = ['WC', 'DV', 'LC'].filter(r => S.series.some(s => s.round === r));
  const needs = roundList.map(needFor);
  return { perLeague: n, needs, finalNeed: needFor('WS') || 4, hasDivs: Object.values(S.teams).some(t => t.d) };
}
