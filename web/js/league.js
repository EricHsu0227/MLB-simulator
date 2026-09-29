// Leagues, seasons, series and playoff brackets.
import { Sim, mulberry32 } from './engine.js';
import { lineupForDay } from './teams.js';

function dayNumOf(d) { return Date.UTC(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100) / 86400000; }

// ------------------------------------------------------------------ daily team preparation
export function newRuntime(entry) {
  return { id: entry.id, w: 0, l: 0, t: 0, rs: 0, ra: 0, home: [0, 0], away: [0, 0], rot: 0, lastStart: new Map(), usage: new Map(), results: [], streak: 0, day: -1 };
}

/** Prepare a team object for today's game: next rested starter, resting regulars, available bullpen. */
export function dailyTeam(entry, rt, day, rng, opts = {}) {
  const t = entry.team;
  const out = Object.assign({}, t);
  const dn = opts.dayNum ?? null;                  // real calendar day (historic seasons)
  const avail = dn !== null && t.getAvail ? t.getAvail() : null;
  const isAvail = idx => { if (!avail) return true; const s = avail.get(idx); return !!s && s.has(dn); };
  // starter: next in the rotation who is rested (and around)
  const rot = (t.rotation.length ? t.rotation : [t.sp]).concat(t.extraStarters || []);
  const restDays = opts.restDays ?? (t.year < 1970 ? 3 : 4);
  const core = t.rotation.length || 1;
  let pick = null;
  for (let k = 0; k < core && !pick; k++) {
    const p = rot[(rt.rot + k) % core];
    const last = rt.lastStart.get(p.key);
    if ((last === undefined || day - last >= restDays) && isAvail(p.idx)) { pick = p; rt.rot = (rt.rot + k + 1) % core; }
  }
  if (!pick) {
    for (const p of rot) {
      const last = rt.lastStart.get(p.key);
      if ((last === undefined || day - last >= restDays) && isAvail(p.idx)) { pick = p; break; }
    }
  }
  if (!pick) { pick = rot[rt.rot % core]; rt.rot = (rt.rot + 1) % core; }
  rt.lastStart.set(pick.key, day);
  out.sp = pick;
  // lineup from available hitters, with occasional rest days
  const resting = new Set();
  if (t.pool) {
    // part-timers and platoon players start only as often as they really did while available
    const pool = t.pool;
    const restP = opts.restP;    // explicit override (playoffs pass 0)
    for (const x of t.lineup) {
      if (x.pos === 1) continue;
      const idx = x.p.idx;
      const games = avail ? (avail.winGames.get(idx) || pool.nGames) : pool.nGames;
      const rate = Math.min(1, (pool.starts.get(idx) || 0) / Math.max(1, games));
      const p = restP !== undefined ? restP : 1 - Math.min(1, rate * 1.02);
      if (rng() < p) resting.add(idx);
    }
    const dh = t.dh;
    const lu = lineupForDay(t, dh, idx => resting.has(idx) || !isAvail(idx));
    out.lineup = lu.map(x => (x.p ? x : { p: pick, pos: 1 }));
    if (out.lineup.length < 9) out.lineup = t.lineup.map(x => ({ p: x.p, pos: x.pos }));
  } else out.lineup = t.lineup.map(x => ({ p: x.p, pos: x.pos }));
  out.lineup = out.lineup.map(x => (x.pos === 1 ? { p: pick, pos: 1 } : x));
  const inLu = new Set(out.lineup.map(x => x.p.idx));
  out.bench = (t.hitterIdx ? t.hitterIdx.filter(i => !inLu.has(i) && isAvail(i) && !(t.pool.gs.has(i) && !(t.pool.apps.get(i) > 15))).slice(0, 9).map(t.P).filter(p => p.bat.pa > 0) : t.bench);
  // bullpen availability (tired arms and absent arms sit)
  const penSrc = t.penAll || t.bullpen;
  out.bullpen = penSrc.filter(p => {
    if (p === pick || !isAvail(p.idx)) return false;
    const u = rt.usage.get(p.key);
    if (!u) return true;
    const y1 = u.get(day - 1) || 0, y2 = u.get(day - 2) || 0, y3 = u.get(day - 3) || 0;
    if (y1 >= 16) return false;
    if (y1 > 0 && y2 > 0 && y3 > 0) return false;
    if (y1 >= 8 && y2 >= 8) return false;
    return true;
  }).slice(0, 10);
  if (out.bullpen.length < 4) out.bullpen = t.bullpen.filter(p => p !== pick).slice(0, 8);
  return out;
}

export function recordUsage(rt, result, ti, day) {
  for (const p of result.pitSeen[ti]) {
    const b = result.pbox.get(p.key);
    if (!b) continue;
    let u = rt.usage.get(p.key);
    if (!u) { u = new Map(); rt.usage.set(p.key, u); }
    u.set(day, (u.get(day) || 0) + b.bf);
  }
}

// ------------------------------------------------------------------ stats accumulation
export class StatBook {
  constructor() { this.bat = new Map(); this.pit = new Map(); }
  addGame(result, ids) {
    for (let ti = 0; ti < 2; ti++) {
      const tid = ids[ti];
      for (const p of result.batSeen[ti]) {
        const b = result.box.get(p.key); if (!b || !b.pa && !b.r && !b.sb) continue;
        let a = this.bat.get(p.key + '|' + tid);
        if (!a) { a = { p, team: tid, g: 0, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, k: 0, hbp: 0, r: 0, rbi: 0, sb: 0, cs: 0, sf: 0, gdp: 0 }; this.bat.set(p.key + '|' + tid, a); }
        a.g++;
        for (const k of ['pa', 'ab', 'h', 'd', 't', 'hr', 'bb', 'k', 'hbp', 'r', 'rbi', 'sb', 'cs', 'sf', 'gdp']) a[k] += b[k];
      }
      const dec = result.decisions || {};
      for (const p of result.pitSeen[ti]) {
        const b = result.pbox.get(p.key); if (!b) continue;
        let a = this.pit.get(p.key + '|' + tid);
        if (!a) { a = { p, team: tid, g: 0, gs: 0, w: 0, l: 0, sv: 0, outs: 0, bf: 0, h: 0, r: 0, bb: 0, k: 0, hr: 0 }; this.pit.set(p.key + '|' + tid, a); }
        a.g++;
        if (result.pitSeen[ti][0] === p) a.gs++;
        for (const k of ['outs', 'bf', 'h', 'r', 'bb', 'k', 'hr']) a[k] += b[k];
        if (dec.W === p) a.w++;
        if (dec.L === p) a.l++;
        if (dec.SV === p) a.sv++;
      }
    }
  }
  batLeaders(key, n = 10, minPA = 0, lower = false) {
    const rows = [...this.bat.values()].filter(a => a.pa >= minPA).map(a => ({ ...a, avg: a.ab ? a.h / a.ab : 0, obp: a.pa ? (a.h + a.bb + a.hbp) / a.pa : 0, slg: a.ab ? (a.h + a.d + 2 * a.t + 3 * a.hr) / a.ab : 0 }));
    rows.sort((a, b) => lower ? a[key] - b[key] : b[key] - a[key]);
    return rows.slice(0, n);
  }
  pitLeaders(key, n = 10, minOuts = 0, lower = false) {
    const rows = [...this.pit.values()].filter(a => a.outs >= minOuts).map(a => ({ ...a, era: a.outs ? a.r * 27 / a.outs : 0, whip: a.outs ? (a.h + a.bb) * 3 / a.outs : 0 }));
    rows.sort((a, b) => lower ? a[key] - b[key] : b[key] - a[key]);
    return rows.slice(0, n);
  }
}

// ------------------------------------------------------------------ league
/**
 * entries: [{id, name, team, lg, div}]
 * schedule: [{day, home, away, label?}]
 */
export class League {
  constructor(entries, schedule, opts = {}) {
    this.entries = entries;
    this.by = new Map(entries.map(e => [e.id, e]));
    this.rt = new Map(entries.map(e => [e.id, newRuntime(e)]));
    this.schedule = schedule.slice().sort((a, b) => a.day - b.day);
    this.pos = 0;
    this.opts = Object.assign({ method: 'odds', dhRule: 'era', seed: (Math.random() * 2 ** 32) >>> 0 }, opts);
    this.rng = mulberry32(this.opts.seed);
    this.stats = new StatBook();
    this.results = [];
    this.day = this.schedule.length ? this.schedule[0].day : 0;
  }
  get total() { return this.schedule.length; }
  get played() { return this.pos; }
  done() { return this.pos >= this.schedule.length; }
  get progress() { return this.schedule.length ? this.results.length / this.schedule.length : 1; }
  dhFor(home) {
    const r = this.opts.dhRule;
    if (r === 'always') return true;
    if (r === 'never') return false;
    return !!home.team.dh;
  }
  prepareGame(g) {
    const H = this.by.get(g.home), A = this.by.get(g.away);
    const hr = this.rt.get(g.home), ar = this.rt.get(g.away);
    const o = g.date ? { ...this.opts, dayNum: dayNumOf(g.date) } : this.opts;
    const ht = dailyTeam(H, hr, g.day, this.rng, o);
    const at = dailyTeam(A, ar, g.day, this.rng, o);
    const dh = this.dhFor(H);
    return new Sim(at, ht, { rng: this.rng, dh, method: this.opts.method, ghost: !!this.opts.ghost });
  }
  finishGame(g, r) {
    const hr = this.rt.get(g.home), ar = this.rt.get(g.away);
    const [as, hs] = r.score;
    hr.rs += hs; hr.ra += as; ar.rs += as; ar.ra += hs;
    if (hs > as) { hr.w++; ar.l++; hr.home[0]++; ar.away[1]++; hr.streak = hr.streak > 0 ? hr.streak + 1 : 1; ar.streak = ar.streak < 0 ? ar.streak - 1 : -1; }
    else if (as > hs) { ar.w++; hr.l++; ar.away[0]++; hr.home[1]++; ar.streak = ar.streak > 0 ? ar.streak + 1 : 1; hr.streak = hr.streak < 0 ? hr.streak - 1 : -1; }
    else { hr.t++; ar.t++; }
    recordUsage(hr, r, 1, g.day); recordUsage(ar, r, 0, g.day);
    this.stats.addGame(r, [g.away, g.home]);
    const rec = { day: g.day, home: g.home, away: g.away, hs, as, innings: r.innings };
    g.done = true; g.rec = rec;
    this.results.push(rec);
    while (this.pos < this.schedule.length && this.schedule[this.pos].done) this.pos++;
    return rec;
  }
  playScheduled(g) {
    const sim = this.prepareGame(g);
    const r = sim.playGame();
    const rec = this.finishGame(g, r);
    return { rec, result: r };
  }
  /** Games still to play on the current day. */
  todaysGames() {
    if (this.done()) return [];
    const day = this.schedule[this.pos].day;
    const out = [];
    for (let i = this.pos; i < this.schedule.length && this.schedule[i].day === day; i++) if (!this.schedule[i].done) out.push(this.schedule[i]);
    return out;
  }
  playNextDay() {
    if (this.done()) return [];
    const out = [];
    for (const g of this.todaysGames()) out.push(this.playScheduled(g));
    this.day = this.pos < this.schedule.length ? this.schedule[this.pos].day : this.day;
    return out;
  }
  simDays(n) { const o = []; for (let i = 0; i < n && !this.done(); i++) o.push(...this.playNextDay()); return o; }
  simAll(progress) {
    let c = 0;
    while (!this.done()) { this.playNextDay(); if (progress && (++c % 10 === 0)) progress(this.pos / this.total); }
  }
  standings() {
    const rows = this.entries.map(e => ({ e, ...this.rt.get(e.id) }));
    const wp = r => (r.w + r.l ? r.w / (r.w + r.l) : 0);
    const groups = new Map();
    for (const r of rows) {
      const k = (r.e.lg || '') + '|' + (r.e.div || '');
      if (!groups.has(k)) groups.set(k, { lg: r.e.lg || '', div: r.e.div || '', rows: [] });
      groups.get(k).rows.push(r);
    }
    for (const g of groups.values()) {
      g.rows.sort((a, b) => wp(b) - wp(a) || (b.rs - b.ra) - (a.rs - a.ra));
      const lead = g.rows[0];
      for (const r of g.rows) r.gb = ((lead.w - r.w) + (r.l - lead.l)) / 2;
    }
    return [...groups.values()].sort((a, b) => (a.lg + a.div).localeCompare(b.lg + b.div));
  }
  rankedByLeague() {
    const wp = r => (r.w + r.l ? r.w / (r.w + r.l) : 0);
    const by = new Map();
    for (const e of this.entries) {
      const r = { e, ...this.rt.get(e.id) };
      const k = e.lg || '';
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    }
    for (const a of by.values()) a.sort((x, y) => wp(y) - wp(x) || (y.rs - y.ra) - (x.rs - x.ra));
    return by;
  }
}

// ------------------------------------------------------------------ schedules
export function roundRobinSchedule(ids, gamesPerPair, opts = {}) {
  // circle method; each "round" is a day. gamesPerPair series repeated with home/away alternating.
  const n = ids.length;
  const list = ids.slice();
  if (n % 2) list.push(null);
  const m = list.length;
  const rounds = [];
  const arr = list.slice();
  for (let r = 0; r < m - 1; r++) {
    const pairs = [];
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i], b = arr[m - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  const sched = [];
  let day = 0;
  for (let g = 0; g < gamesPerPair; g++) {
    for (const pairs of rounds) {
      for (const [a, b] of pairs) sched.push({ day, home: g % 2 ? b : a, away: g % 2 ? a : b });
      day++;
    }
  }
  return sched;
}

/** Balanced schedule with heavier weight against division rivals. */
export function structuredSchedule(entries, opts = {}) {
  const { intraDiv = 12, intraLg = 8, inter = 4 } = opts;
  const sched = [];
  const ids = entries.map(e => e.id);
  const day0 = [];
  const games = [];
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i], b = entries[j];
    let n = a.lg === b.lg ? (a.div === b.div ? intraDiv : intraLg) : inter;
    for (let g = 0; g < n; g++) games.push(g % 2 ? [a.id, b.id] : [b.id, a.id]);
  }
  // spread games over days: greedy packing so a team plays at most once per day
  const rng = mulberry32(99);
  for (let i = games.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [games[i], games[j]] = [games[j], games[i]]; }
  const busy = [];
  for (const [home, away] of games) {
    let d = 0;
    while (true) {
      busy[d] = busy[d] || new Set();
      if (!busy[d].has(home) && !busy[d].has(away)) { busy[d].add(home); busy[d].add(away); sched.push({ day: d, home, away }); break; }
      d++;
    }
  }
  return sched;
}

// ------------------------------------------------------------------ series / bracket
export function homePattern(n) {
  // n = games in series (max). 0 = higher seed hosts, 1 = lower seed hosts
  if (n <= 1) return [0];
  if (n === 2) return [0, 1];
  if (n === 3) return [0, 0, 0];
  if (n === 5) return [0, 0, 1, 1, 0];
  if (n === 7) return [0, 0, 1, 1, 1, 0, 0];
  if (n === 9) return [0, 0, 1, 1, 1, 0, 0, 1, 0];
  const a = []; for (let i = 0; i < n; i++) a.push(i % 2);
  return a;
}

export class Series {
  /**
   * teams: [hi, lo] entries ({id,name,...}); need: wins needed
   * makeTeams(entry, gameNo, oppEntry) -> team object for that game
   */
  constructor(hi, lo, need, opts = {}) {
    this.hi = hi; this.lo = lo; this.need = need;
    this.wins = [0, 0];
    this.games = [];
    this.pattern = homePattern(need * 2 - 1);
    this.opts = opts;
  }
  get over() { return this.wins[0] >= this.need || this.wins[1] >= this.need; }
  get winner() { return this.wins[0] >= this.need ? this.hi : this.wins[1] >= this.need ? this.lo : null; }
  get loser() { return this.wins[0] >= this.need ? this.lo : this.wins[1] >= this.need ? this.hi : null; }
  nextGameNo() { return this.games.length; }
  /** Home team index (0=hi,1=lo) of the next game */
  nextHome() { return this.pattern[this.games.length % this.pattern.length]; }
  record(hs, as, homeIdx) {
    const winnerIdx = hs > as ? homeIdx : 1 - homeIdx;
    this.wins[winnerIdx]++;
    this.games.push({ n: this.games.length + 1, home: homeIdx, hs, as, winner: winnerIdx });
  }
  score() { return `${this.wins[0]}-${this.wins[1]}`; }
}

/**
 * Standard seeded bracket. seeds: entries ordered by seed (index 0 = seed 1).
 * Returns rounds: array of arrays of {id, a: seedIdx|{from}, b, series}
 */
export function seededBracket(n) {
  // returns list of first-round pairings and byes using standard bracket order
  let size = 1; while (size < n) size *= 2;
  const order = [1];
  while (order.length < size) {
    const next = [];
    const m = order.length * 2 + 1;
    for (const s of order) { next.push(s); next.push(m - s); }
    order.splice(0, order.length, ...next);
  }
  return { size, order };
}

/**
 * Build a bracket tree for n seeds. Node: {round, a:{seed}|{node}, b:{seed}|{node}}.
 * Top seeds receive byes when n isn't a power of two.
 */
export function buildBracket(n, needs) {
  if (n < 2) return { nodes: [], rounds: 0 };
  const { size, order } = seededBracket(n);
  // slots in bracket order; seeds > n are byes
  let slots = order.map(s => (s <= n ? { seed: s - 1 } : null));
  const nodes = [];
  let round = 0;
  while (slots.length > 1) {
    const nextSlots = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i], b = slots[i + 1];
      if (!a && !b) { nextSlots.push(null); continue; }
      if (!a) { nextSlots.push(b); continue; }
      if (!b) { nextSlots.push(a); continue; }
      const node = { id: nodes.length, round, a, b, need: 4 };
      nodes.push(node);
      nextSlots.push({ node: node.id });
    }
    slots = nextSlots;
    round++;
  }
  const rounds = round;
  for (const nd of nodes) nd.need = needs[Math.min(needs.length - 1, nd.round)] ?? 4;
  return { nodes, rounds };
}

/**
 * Generic postseason: a list of nodes, each with two slots that are either fixed entries or
 * "winner of node N". Historic replays default an unplayed feeder to its real-life winner, so you can
 * replay any single series and carry the (possibly different) winner forward.
 */
export class Postseason {
  constructor(nodes, opts = {}) {
    this.nodes = nodes.map((n, i) => ({ id: i, ...n, series: null, winner: null, played: false }));
    this.opts = opts;
  }
  resolve(slot) {
    if (slot.entry) return slot.entry;
    const n = this.nodes[slot.node];
    return n.winner || (this.opts.defaultActual ? n.actualWinner || null : null);
  }
  teams(n) { return [this.resolve(n.slots[0]), this.resolve(n.slots[1])]; }
  isReady(n) { const [a, b] = this.teams(n); return !!(a && b) && !n.winner; }
  ready() { return this.nodes.filter(n => this.isReady(n)); }
  /** True if the resolved matchup matches real history. */
  isActualMatchup(n) {
    if (!n.actualTeams) return false;
    const [a, b] = this.teams(n);
    return !!a && !!b && n.actualTeams.includes(a.id) && n.actualTeams.includes(b.id);
  }
  ensureSeries(n) {
    if (!n.series) {
      const [A, B] = this.teams(n);
      const cmp = this.opts.higherSeed ? this.opts.higherSeed(A, B, n) : 0;   // <0 => A is higher seed
      const hi = cmp <= 0 ? A : B;
      n.series = new Series(hi, hi === A ? B : A, n.need);
    }
    return n.series;
  }
  reset(n) { n.series = null; n.winner = null; n.played = false; }
  finish(n) { n.winner = n.series.winner; n.played = true; this.invalidateDownstream(n); }
  invalidateDownstream(n) {
    // any node fed by this one that was already played with a different team is stale
    for (const m of this.nodes) {
      if (m.slots.some(s => s.node === n.id) && m.series) {
        const [a, b] = this.teams(m);
        const ids = [m.series.hi.id, m.series.lo.id];
        if (!(a && b && ids.includes(a.id) && ids.includes(b.id))) this.reset(m), this.invalidateDownstream(m);
      }
    }
  }
  get final() { return this.nodes[this.nodes.length - 1]; }
  get champion() { return this.final && this.final.winner; }
}

/** Build seeded single-league bracket nodes from entries ordered by seed. */
export function bracketNodes(seeds, needs, prefix = '') {
  const b = buildBracket(seeds.length, needs);
  const nodes = [];
  for (const nd of b.nodes) {
    const slot = s => (s.seed !== undefined ? { entry: seeds[s.seed], seed: s.seed } : { node: s.node });
    nodes.push({ label: `${prefix}Round ${nd.round + 1}`, round: nd.round, slots: [slot(nd.a), slot(nd.b)], need: nd.need });
  }
  return { nodes, rounds: b.rounds };
}

export function playSeriesGame(series, prepare, rng, simOpts = {}) {
  const homeIdx = series.nextHome();
  const homeE = homeIdx === 0 ? series.hi : series.lo;
  const awayE = homeIdx === 0 ? series.lo : series.hi;
  const gameNo = series.nextGameNo();
  const ht = prepare(homeE, gameNo, awayE, true);
  const at = prepare(awayE, gameNo, homeE, false);
  const script = { 0: at.script || [], 1: ht.script || [] };
  const mgr = { 0: script[0].length ? 'script' : 'auto', 1: script[1].length ? 'script' : 'auto' };
  const sim = new Sim(at, ht, Object.assign({ rng, dh: !!ht.dh, script, mgr }, simOpts));
  return { sim, homeIdx, ht, at, homeE, awayE, gameNo, finish() { const r = sim.playGame(); series.record(r.score[1], r.score[0], homeIdx); return r; }, record(r) { series.record(r.score[1], r.score[0], homeIdx); } };
}
