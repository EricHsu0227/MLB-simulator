// Turns a finished sim into a stored game record, and aggregates stored games into player stats.
import { putGames, gz, listGames, kvGet, kvSet } from './store.js';

const BAT_KEYS = ['pa', 'ab', 'h', 'd', 't', 'hr', 'bb', 'k', 'hbp', 'r', 'rbi', 'sb', 'cs', 'sf', 'gdp', 'sh', 'ibb'];
const PIT_KEYS = ['bf', 'outs', 'h', 'r', 'bb', 'k', 'hr', 'pc', 'hbp'];
export const pkey = p => `${p.y}:${p.id}`;

function compact(obj, keys) { const o = {}; for (const k of keys) if (obj[k]) o[k] = obj[k]; return o; }

/**
 * Build {rec, log} for a finished (or in-progress) Sim.
 * meta: {universe, key, kind:'R'|'post'|'hist'|'AS', date, label, extra, unique}
 */
export function snapshotGame(sim, meta) {
  const st = sim.st, res = sim.result(), dec = res.decisions || {};
  const teams = sim.teams.map(t => ({ code: t.code, name: t.name, year: t.year }));
  const batting = [0, 1].map(ti => st.batSeen[ti].map(p => {
    const cur = st.lineup[ti].findIndex(x => x.p === p);
    return { k: pkey(p), id: p.id, y: p.y, name: p.name, bats: p.bats, slot: cur >= 0 ? cur : null, pos: cur >= 0 ? st.lineup[ti][cur].pos : null, s: compact(sim.bx(p), BAT_KEYS) };
  }));
  const pitching = [0, 1].map(ti => st.pitSeen[ti].map((p, i) => ({ k: pkey(p), id: p.id, y: p.y, name: p.name, throws: p.throws, gs: p === st.starter[ti], s: compact(sim.pbx(p), PIT_KEYS) })));
  const id = `${meta.universe}:${meta.key}`;
  const rec = {
    id, universe: meta.universe, kind: meta.kind || 'R', key: String(meta.key), date: meta.date || null, ts: Date.now(), label: meta.label || '',
    away: teams[0], home: teams[1], score: st.score.slice(), innings: st.inning, lineScore: st.lineScore.map(a => a.slice()), hits: st.hits.slice(),
    over: !!st.over, dec: { W: dec.W ? pkey(dec.W) : null, L: dec.L ? pkey(dec.L) : null, SV: dec.SV ? pkey(dec.SV) : null },
    batting, pitching, park: sim.teams[1].park?.name || '', extra: meta.extra || null, synced: false,
  };
  const log = st.log.map(l => ({ k: l.kind, t: l.text, i: l.inn, h: l.half, o: l.outs, s: l.score, e: l.ev || undefined }));
  return { rec, log };
}

const pending = [];
let flushing = null;
/** Queue a game for storage (batched; safe to call thousands of times during a season sim). */
export function archiveGame(sim, meta) {
  if (!sim.st.over) return null;
  const { rec, log } = snapshotGame(sim, meta);
  pending.push({ rec, log: JSON.stringify(log) });
  scheduleFlush();
  return rec;
}
function scheduleFlush() {
  if (flushing) return;
  flushing = new Promise(r => setTimeout(r, 30)).then(async () => {
    while (pending.length) {
      const batch = pending.splice(0, 200);
      const out = [];
      for (const b of batch) out.push({ rec: b.rec, log: await gz(b.log) });
      try { await putGames(out); } catch (e) { console.warn('archive write failed', e); }
    }
    flushing = null;
    for (const f of flushListeners) f();
  });
}
const flushListeners = new Set();
export function whenFlushed() { return flushing || Promise.resolve(); }

// ---------------------------------------------------------------- universes (named saves)
export async function registerUniverse(id, label) {
  const u = await kvGet('universes', {});
  if (!u[id]) { u[id] = { label, ts: Date.now() }; await kvSet('universes', u); }
  return u;
}
export const getUniverses = () => kvGet('universes', {});

// ---------------------------------------------------------------- aggregation
const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
/** kind filter: 'all' | 'R' | 'post' */
export function aggregate(games, kind = 'all') {
  const bat = new Map(), pit = new Map();
  for (const g of games) {
    if (!g.over) continue;
    if (kind !== 'all' && (kind === 'post' ? g.kind === 'R' : g.kind !== kind)) continue;
    for (let ti = 0; ti < 2; ti++) {
      const team = ti === 0 ? g.away : g.home;
      for (const b of g.batting[ti]) {
        let a = bat.get(b.k);
        if (!a) { a = { key: b.k, id: b.id, y: b.y, name: b.name, team: team.code, teams: new Set(), g: 0, ...zero(BAT_KEYS), games: [] }; bat.set(b.k, a); }
        a.g++; a.team = team.code; a.teams.add(team.code);
        for (const k of BAT_KEYS) a[k] += b.s[k] || 0;
        a.games.push(g.id);
      }
      for (const p of g.pitching[ti]) {
        let a = pit.get(p.k);
        if (!a) { a = { key: p.k, id: p.id, y: p.y, name: p.name, team: team.code, teams: new Set(), g: 0, gs: 0, w: 0, l: 0, sv: 0, ...zero(PIT_KEYS), games: [] }; pit.set(p.k, a); }
        a.g++; a.team = team.code; a.teams.add(team.code);
        if (p.gs) a.gs++;
        for (const k of PIT_KEYS) a[k] += p.s[k] || 0;
        if (g.dec.W === p.k) a.w++; if (g.dec.L === p.k) a.l++; if (g.dec.SV === p.k) a.sv++;
        a.games.push(g.id);
      }
    }
  }
  for (const a of bat.values()) { a.avg = a.ab ? a.h / a.ab : 0; a.obp = a.pa ? (a.h + a.bb + a.hbp) / a.pa : 0; a.slg = a.ab ? (a.h + a.d + 2 * a.t + 3 * a.hr) / a.ab : 0; a.ops = a.obp + a.slg; }
  for (const a of pit.values()) { a.ip = a.outs / 3; a.era = a.outs ? a.r * 27 / a.outs : 0; a.whip = a.outs ? (a.h + a.bb) * 3 / a.outs : 0; a.k9 = a.outs ? a.k * 27 / a.outs : 0; }
  return { bat, pit };
}

export async function universeGames(universe) { return (await listGames(universe)).sort((a, b) => (a.date || 0) - (b.date || 0) || a.ts - b.ts); }
