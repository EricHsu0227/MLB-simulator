// Game simulation engine.
//
// Plate appearance model
//   Each batter/pitcher has real outcome rates (K, BB, HBP, 1B, 2B, 3B, HR, in-play out) built from real
//   plate appearances, lightly regressed to their league, and park-neutralised. They are combined with the
//   league environment using the odds-ratio (log5) method -- or a straight average, per option -- then
//   multiplied by park factors, platoon splits and pitcher fatigue.
//   Balls in play then get a batted-ball type (GB/LD/FB) and field zone (pull/center/oppo by batter side)
//   sampled from real league tables, tilted by the batter's and pitcher's own GB/LD/FB and pull/oppo rates.
//   Runner advancement (including double plays, errors, sac flies, extra bases) is drawn from empirical
//   transition tables keyed by (event, type, zone, bases, outs).
import { EV, eraTables, pooledTr, dirOf, WOBA_W, baselineRates, POS_NAME } from './data.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONE_NAME = { 0: 'the field', 1: 'the pitcher', 2: 'the catcher', 3: 'first base', 4: 'second base', 5: 'third base', 6: 'shortstop', 7: 'left field', 8: 'center field', 9: 'right field' };
const ORD = ['', 'first', 'second', 'third'];

export function newBox() {
  return { pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, k: 0, hbp: 0, r: 0, rbi: 0, sb: 0, cs: 0, sf: 0, gdp: 0 };
}
function newPBox() { return { bf: 0, outs: 0, h: 0, r: 0, bb: 0, k: 0, hr: 0, pc: 0, hbp: 0, inn: 0, half: 0 }; }

function pick(w, total, u) {
  let x = u * total;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
  return w.length - 1;
}

export class Sim {
  /**
   * @param away, home  team objects ({code,name,year,lg,S,park,lineup[9]{p,pos},sp,bench[],bullpen[],lookup(idx)})
   * @param opts {seed, rng, dh, ghost, method:'odds'|'avg', mgr:{0:'auto'|'manual'|'script', 1:...}, script:{0:[...],1:[...]}, extraFatigue}
   */
  constructor(away, home, opts = {}) {
    this.teams = [away, home];
    this.opts = Object.assign({ method: 'odds', dh: true, ghost: false, maxInnings: 30, mgr: { 0: 'auto', 1: 'auto' } }, opts);
    this.rng = opts.rng || mulberry32(opts.seed ?? (Math.random() * 2 ** 32));
    this.tables = eraTables(home.year);
    this.pf = home.park?.pf || [1, 1, 1, 1];
    // environment baseline = mean of both teams' league-year baselines
    const bA = baselineRates(away.S, away.lg), bH = baselineRates(home.S, home.lg);
    this.env = { bat: new Float64Array(8), batP: new Float64Array(8), pit: new Float64Array(8) };
    for (let i = 0; i < 8; i++) for (const k of ['bat', 'batP', 'pit']) this.env[k][i] = 0.5 * (bA[k][i] + bH[k][i]);
    this.teamBase = [bA, bH];
    const dh = this.opts.dh;
    this.dh = dh;
    const mkLineup = t => t.lineup.map(x => ({ p: x.p, pos: x.pos }));
    this.st = {
      inning: 1, half: 0, outs: 0, bases: [null, null, null, null], score: [0, 0],
      slot: [0, 0], lineup: [mkLineup(away), mkLineup(home)],
      pitcher: [away.sp, home.sp], box: new Map(), pbox: new Map(),
      batSeen: [[], []], pitSeen: [[], []], lineScore: [[], []], curRuns: 0,
      over: false, halfStarted: false, log: [], used: new Set(), hits: [0, 0], errors: [0, 0],
      starter: [away.sp, home.sp], paCount: 0, halfPA: 0,
      goAhead: [null, null], goAheadL: [null, null], entryLead: new Map(),
    };
    // if no DH in this game, pitcher must be in lineup (pos 1) and no pos 10
    for (let ti = 0; ti < 2; ti++) {
      const lu = this.st.lineup[ti];
      const i1 = lu.findIndex(x => x.pos === 1);
      if (i1 >= 0) lu[i1] = { p: this.st.pitcher[ti], pos: 1 };
      if (dh && i1 >= 0) {
        // NL-style lineup visiting a DH park: give them a designated hitter from the bench
        const bench = this.teams[ti].bench.filter(b => !lu.some(x => x.p === b)).sort((a, c) => c.bat.woba - a.bat.woba);
        if (bench.length) lu[i1] = { p: bench[0], pos: 10 };
      }
      if (!dh) {
        const has1 = lu.some(x => x.pos === 1);
        if (!has1) {
          const di = lu.findIndex(x => x.pos === 10);
          const idx = di >= 0 ? di : 8;
          lu[idx] = { p: this.st.pitcher[ti], pos: 1 };
        }
      } else if (lu.some(x => x.pos === 1)) {
        // lineup came from a non-DH game: fine, pitcher bats.
      }
      for (const x of lu) { this.st.used.add(x.p.key); this.seenBat(ti, x.p); }
      this.st.used.add(this.st.pitcher[ti].key);
      this.seenPit(ti, this.st.pitcher[ti]);
    }
    this.pending = [(this.opts.script?.[0] || []).slice(), (this.opts.script?.[1] || []).slice()];
    this.availBull = [away.bullpen.slice(), home.bullpen.slice()];
    this.availBench = [away.bench.slice(), home.bench.slice()];
    this.events = [];
  }

  // ---------------------------------------------------------------- box helpers
  bx(p) { let b = this.st.box.get(p.key); if (!b) { b = newBox(); this.st.box.set(p.key, b); } return b; }
  pbx(p) { let b = this.st.pbox.get(p.key); if (!b) { b = newPBox(); this.st.pbox.set(p.key, b); } return b; }
  seenBat(ti, p) { if (!this.st.batSeen[ti].includes(p)) this.st.batSeen[ti].push(p); this.bx(p); }
  seenPit(ti, p) {
    if (!this.st.pitSeen[ti].includes(p)) {
      this.st.pitSeen[ti].push(p);
      const b = this.pbx(p); b.inn = this.st.inning; b.half = this.st.half;
      this.st.entryLead.set(p.key, this.st.score[ti] - this.st.score[1 - ti]);
    }
  }

  // ---------------------------------------------------------------- queries
  batTeam() { return this.st.half; }
  fieldTeam() { return 1 - this.st.half; }
  currentBatter() { const ti = this.st.half; const s = this.st.slot[ti]; return { slot: s, ...this.st.lineup[ti][s] }; }
  bmask() { const b = this.st.bases; return (b[1] ? 1 : 0) | (b[2] ? 2 : 0) | (b[3] ? 4 : 0); }
  scoreDiff(ti) { return this.st.score[ti] - this.st.score[1 - ti]; }
  isOver() { return this.st.over; }

  // ---------------------------------------------------------------- substitutions (used by scripts, auto & manual)
  replacePitcher(ti, np, why) {
    const st = this.st;
    const old = st.pitcher[ti];
    if (old === np) return;
    const lu = st.lineup[ti];
    if (!this.dh || lu.some(x => x.pos === 1)) {
      let slot = lu.findIndex(x => x.p === old);
      if (slot < 0) slot = lu.findIndex(x => x.pos === 11 || x.pos === 12);
      if (slot >= 0 && lu[slot].pos !== 10) { this.logSub(ti, `${np.name} replaces ${lu[slot].p.name} at pitcher${why ? ' (' + why + ')' : ''}`); lu[slot] = { p: np, pos: 1 }; }
      else this.logSub(ti, `${np.name} relieves ${old.name}${why ? ' (' + why + ')' : ''}`);
    } else this.logSub(ti, `${np.name} relieves ${old.name}${why ? ' (' + why + ')' : ''}`);
    st.pitcher[ti] = np;
    st.used.add(np.key);
    this.seenPit(ti, np);
    this.availBull[ti] = this.availBull[ti].filter(x => x !== np);
    this.availBench[ti] = this.availBench[ti].filter(x => x !== np);
    // inherited runners' responsibility stays with the previous pitcher (resp field)
  }
  pinchHit(ti, slot, np, pos = 11) {
    const st = this.st;
    const old = st.lineup[ti][slot];
    this.logSub(ti, `${np.name} pinch-hits for ${old.p.name}`);
    st.lineup[ti][slot] = { p: np, pos };
    st.used.add(np.key);
    this.seenBat(ti, np);
    this.availBench[ti] = this.availBench[ti].filter(x => x !== np);
    this.availBull[ti] = this.availBull[ti].filter(x => x !== np);
  }
  pinchRun(ti, base, np) {
    const st = this.st;
    const r = st.bases[base];
    if (!r) return;
    this.logSub(ti, `${np.name} pinch-runs for ${r.p.name}`);
    const slot = st.lineup[ti].findIndex(x => x.p === r.p);
    if (slot >= 0) st.lineup[ti][slot] = { p: np, pos: 12 };
    st.bases[base] = { p: np, resp: r.resp, ti };
    st.used.add(np.key); this.seenBat(ti, np);
    this.availBench[ti] = this.availBench[ti].filter(x => x !== np);
  }
  defSub(ti, slot, np, pos) {
    const st = this.st;
    const old = st.lineup[ti][slot];
    this.logSub(ti, `${np.name} replaces ${old.p.name} (${POS_NAME[pos] || pos})`);
    st.lineup[ti][slot] = { p: np, pos };
    st.used.add(np.key); this.seenBat(ti, np);
    this.availBench[ti] = this.availBench[ti].filter(x => x !== np);
  }
  setPosition(ti, slot, pos) { this.st.lineup[ti][slot].pos = pos; }
  logSub(ti, text) { this.st.log.push({ kind: 'sub', text, inn: this.st.inning, half: this.st.half, ti, score: this.st.score.slice(), outs: this.st.outs }); }

  // ---------------------------------------------------------------- scripted (as-played) substitutions
  runScript() {
    const st = this.st;
    for (let ti = 0; ti < 2; ti++) {
      const q = this.pending[ti];
      if (this.opts.mgr[ti] === 'manual') continue;
      let guard = 0;
      while (q.length && guard++ < 20) {
        const s = q[0];
        const reached = st.inning > s.inn || (st.inning === s.inn && (st.half > s.half || (st.half === s.half && st.halfPA >= s.pa)));
        if (!reached) break;
        const stale = st.inning > s.inn + 1;
        const p = s.p;
        if (!p || st.used.has(p.key)) { q.shift(); continue; }
        const lu = st.lineup[ti];
        if (s.pos === 1) {
          this.replacePitcher(ti, p, 'as played'); q.shift(); continue;
        }
        if (s.slot < 0 || s.slot >= 9) { q.shift(); continue; }
        if (s.pos === 11) {
          // pinch hitter: wait until his slot is due (or up in the current half)
          if (st.half === ti && st.slot[ti] === s.slot) { this.pinchHit(ti, s.slot, p); q.shift(); continue; }
          if (stale) { q.shift(); continue; }
          break;
        }
        if (s.pos === 12) {
          const bi = [1, 2, 3].find(b => st.bases[b] && lu.findIndex(x => x.p === st.bases[b].p) === s.slot);
          if (bi) { this.pinchRun(ti, bi, p); q.shift(); continue; }
          if (st.half === ti && st.slot[ti] === s.slot) { this.pinchHit(ti, s.slot, p, 12); q.shift(); continue; }
          if (stale) { q.shift(); continue; }
          break;
        }
        // defensive replacement / position change
        if (!(st.half === ti && st.slot[ti] === s.slot && false)) { this.defSub(ti, s.slot, p, s.pos); q.shift(); continue; }
      }
    }
  }

  // ---------------------------------------------------------------- auto manager
  fatigueOf(ti) {
    const p = this.st.pitcher[ti];
    const b = this.pbx(p);
    return { p, b, E: p.pit.endur };
  }
  isStarterOfGame(ti) { return this.st.pitcher[ti] === this.st.starter[ti]; }

  autoManagePitching(ti, atHalfStart) {
    const st = this.st;
    const { p, b, E } = this.fatigueOf(ti);
    const lead = this.scoreDiff(ti);
    const pen = this.availBull[ti];
    if (!pen.length) return;
    const inn = st.inning;
    const starter = this.isStarterOfGame(ti);
    let pull = false, why = '';
    const lineupLost = !st.lineup[ti].some(x => x.p === p) && !this.dh;
    if (lineupLost) { pull = true; why = 'pinch-hit for'; }
    const scriptMode = this.opts.mgr[ti] === 'script';
    const slack = scriptMode ? 1.45 : 1;
    if (starter) {
      const limit = E * 1.03 * slack + 0.5;
      if (b.bf >= limit) { pull = true; why = 'tiring'; }
      else if (b.r >= 7 * slack) { pull = true; why = 'shelled'; }
      else if (b.r >= 5 && b.bf >= E * 0.7 && !scriptMode) { pull = true; why = 'rocked'; }
      else if (atHalfStart && inn >= 6 && b.bf >= E * 0.85 && lead <= 3 && !scriptMode && this.rng() < 0.5) { pull = true; why = 'high leverage'; }
    } else {
      const lim = Math.max(E * 1.5, 5) * slack;
      if (b.bf >= lim) { pull = true; why = 'tiring'; }
      else if (b.r >= 4 && !scriptMode) { pull = true; why = 'struggling'; }
      else if (atHalfStart && b.outs >= 3 && !scriptMode && this.rng() < 0.55) { pull = true; why = 'fresh arm'; }
      else if (atHalfStart && b.outs >= 6 && !scriptMode) { pull = true; why = 'fresh arm'; }
    }
    // save situation: bring in the closer at the start of a late inning
    const closer = pen[0] && pen[0].role === 'closer' ? pen[0] : pen.find(x => x.role === 'closer');
    if (!pull && atHalfStart && closer && !scriptMode && p !== closer) {
      const late = inn >= 9 || (inn === 8 && lead >= 1 && lead <= 2 && this.rng() < 0.2);
      if (late && lead >= 1 && lead <= 3 && b.bf >= 1) { pull = true; why = 'save situation'; }
      else if (late && lead === 0 && ti === 1 && st.half === 0 && inn >= 9 && this.rng() < 0.7) { pull = true; why = 'tie game'; }
    }
    if (!pull) return;
    // pick replacement
    const cand = pen.filter(x => x !== p);
    if (!cand.length) return;
    let np;
    const isSave = closer && cand.includes(closer) && inn >= 9 && lead >= 1 && lead <= 3;
    const highLev = inn >= 7 && Math.abs(lead) <= 3;
    if (isSave) np = closer;
    else if (highLev) np = cand.find(x => x.role !== 'mop') || cand[0];
    else if (inn <= 6 || Math.abs(lead) >= 5) {
      // long man / mop-up
      np = cand.slice().sort((a, c) => c.pit.endur - a.pit.endur || c.pit.wobaAgainst - a.pit.wobaAgainst)[0];
      if (Math.abs(lead) < 5 && inn <= 6) np = cand.slice().sort((a, c) => c.pit.endur - a.pit.endur)[0];
      else np = cand[cand.length - 1];
    } else np = cand[Math.min(cand.length - 1, Math.floor(cand.length / 2))];
    this.replacePitcher(ti, np, why);
  }

  autoManageBatting(ti) {
    // pinch-hit for a pitcher in a no-DH game
    if (this.dh) return;
    const st = this.st;
    const slot = st.slot[ti];
    const cur = st.lineup[ti][slot];
    if (cur.pos !== 1) return;
    const pit = cur.p;
    const b = this.pbx(pit);
    const bench = this.availBench[ti].filter(x => x.bat.pa >= 30);
    if (!bench.length) return;
    const diff = this.scoreDiff(ti);
    const E = pit.pit.endur;
    let doIt = false;
    if (st.inning >= 7 && diff <= 1 && diff >= -3 && (st.half === ti)) doIt = this.isStarterOfGame(ti) ? b.bf >= E * 0.6 : this.rng() < 0.5;
    if (st.inning >= 6 && diff <= 0 && this.isStarterOfGame(ti) && b.bf >= E * 0.75) doIt = true;
    if (!doIt) return;
    const best = bench.slice().sort((a, c) => c.bat.woba - a.bat.woba)[0];
    this.pinchHit(ti, slot, best);
  }

  beforePA() {
    const st = this.st;
    if (this.opts.script) this.runScript();
    for (let ti = 0; ti < 2; ti++) {
      const m = this.opts.mgr[ti];
      if (m === 'manual') continue;
      if (st.half !== ti) {
        // defence: manage pitching
        this.autoManagePitching(ti, st.halfPA === 0);
      } else {
        this.autoManageBatting(ti);
      }
    }
  }

  // ---------------------------------------------------------------- probabilities
  paProbs(batter, pit, bt, out = new Float64Array(8)) {
    const st = this.st;
    const pos = batter.pos;
    const isP = pos === 1;
    const bR = (isP ? batter.p.batP : batter.p.bat).r;
    const pR = pit.pit.r;
    const baseB = isP ? this.teamBase[bt].batP : this.teamBase[bt].bat;
    const baseP = this.teamBase[1 - bt].pit;
    const env = isP ? this.env.batP : this.env.bat;
    const envP = this.env.pit;
    // platoon
    const bats = batter.p.bats;
    const thr = pit.throws === 'L' ? 'L' : 'R';
    let side = bats === 'B' ? (thr === 'L' ? 'R' : 'L') : (bats === 'L' ? 'L' : 'R');
    const plat = this.tables.plat[side][thr];
    // fatigue
    const pb = this.pbx(pit);
    const E = pit.pit.endur;
    let fat = 0;
    if (pb.bf > E * 0.85) fat = Math.min(0.6, 0.022 * (pb.bf - E * 0.85));
    const avg = this.opts.method === 'avg';
    let tot = 0;
    for (let i = 0; i < 8; i++) {
      const rb = bR[i] / baseB[i];
      const rp = pR[i] / baseP[i];
      let w;
      if (avg) w = env[i] * 0.5 * (rb + rp);
      else w = rb * rp * env[i];
      w *= plat[i];
      if (i >= 3 && i <= 6) w *= this.pf[i - 3];
      if (fat) { if (i === 0 || i === 7) w /= (1 + fat * 0.5); else w *= (1 + fat); }
      out[i] = w; tot += w;
    }
    for (let i = 0; i < 8; i++) out[i] /= tot;
    out.side = side;
    return out;
  }

  // sample batted ball type & zone for a ball in play outcome
  sampleBIP(evName, batter, pit, side) {
    const J = this.tables.joint[side][evName];
    const bt = (batter.pos === 1 ? batter.p.batP : batter.p.bat);
    const T = this.tables.typShare[side];
    const D = this.tables.dirShare[side];
    // combined type shares (odds-ratio of batter & pitcher relative to league)
    const tb = bt.t, tp = pit.pit.t;
    const comb = [0, 0, 0];
    let cs = 0;
    for (let i = 0; i < 3; i++) { comb[i] = (tb[i] / T[i]) * (tp[i] / T[i]) * T[i]; cs += comb[i]; }
    const tiltT = comb.map((c, i) => (c / cs) / T[i]);
    const dB = bt.d;
    const n = J.keys.length;
    const w = new Array(n);
    let tot = 0;
    const ti = { G: 0, L: 1, F: 2 };
    for (let i = 0; i < n; i++) {
      const d = dirOf(J.zone[i], side);
      w[i] = J.w[i] * tiltT[ti[J.typ[i]]] * (dB[d] / D[d]);
      tot += w[i];
    }
    const k = pick(w, tot, this.rng());
    return { typ: J.typ[k], zone: J.zone[k] };
  }

  sampleHRZone(side) {
    const h = this.tables.hrz[side];
    const ks = Object.keys(h);
    if (!ks.length) return 8;
    const w = ks.map(k => h[k]);
    return +ks[pick(w, w.reduce((a, b) => a + b, 0), this.rng())];
  }

  lookupTr(key) {
    let arr = this.tables.tr[key];
    if (arr) { let n = 0; for (const x of arr) n += x[1]; if (n >= 6) return arr; }
    const pooled = pooledTr()[key];
    return pooled || arr || null;
  }
  sampleVec(evName, typ, zone, bm, outs) {
    let arr = null;
    if (typ && zone) arr = this.lookupTr(`${evName}|${typ}|${zone}|${bm}|${outs}`);
    if (!arr && typ) arr = this.lookupTr(`${evName}|${typ}|0|${bm}|${outs}`);
    if (!arr) arr = this.lookupTr(`${evName}|-|0|${bm}|${outs}`);
    if (!arr) return null;
    let tot = 0; for (const x of arr) tot += x[1];
    let u = this.rng() * tot;
    for (const x of arr) { u -= x[1]; if (u < 0) return x[0]; }
    return arr[arr.length - 1][0];
  }
  defaultVec(evName, bm) {
    // very rare fallback: batter to base, forced runners advance
    const b = [bm & 1, (bm >> 1) & 1, (bm >> 2) & 1];
    const bd = { K: 0, OUT: 0, BB: 1, HBP: 1, '1B': 1, '2B': 2, '3B': 3, HR: 4 }[evName];
    let v = String(bd);
    let occ1 = bd >= 1 ? bd : 0;
    for (let s = 1; s <= 3; s++) {
      if (!b[s - 1]) { v += '-'; continue; }
      if (evName === 'HR' || evName === '3B') v += '4';
      else if (bd >= s && bd > 0) v += String(Math.min(4, s + Math.max(1, bd - s + 1)));
      else v += String(s);
    }
    return v;
  }

  // ---------------------------------------------------------------- vector application
  applyVec(vec, batter, pitcher, opts = {}) {
    const st = this.st;
    const ti = st.half;
    const nb = [null, null, null, null];
    let outsAdded = 0;
    const scored = [];
    const moves = [];
    for (let s = 3; s >= 1; s--) {
      const r = st.bases[s];
      if (!r) continue;
      const c = vec[s];
      const d = c === '-' || c === undefined ? s : +c;
      if (d === 0) { outsAdded++; moves.push({ r, from: s, to: 0 }); }
      else if (d >= 4) { scored.push(r); moves.push({ r, from: s, to: 4 }); }
      else { nb[d] = r; moves.push({ r, from: s, to: d }); }
    }
    let batterRunner = null;
    if (batter) {
      batterRunner = { p: batter.p, resp: pitcher, ti };
      const d = +vec[0];
      if (d === 0) outsAdded++;
      else if (d >= 4) { scored.push(batterRunner); }
      else nb[d] = batterRunner;
      moves.push({ r: batterRunner, from: 0, to: d >= 4 ? 4 : d });
    }
    // resolve base collisions (shouldn't occur): push the trailing runner up
    st.bases = nb;
    return { outsAdded, scored, moves, batterRunner };
  }

  scoreRuns(scored, pitcherFallback, rbiBatter) {
    const st = this.st;
    const ti = st.half;
    let n = 0;
    const prevD = st.score[ti] - st.score[1 - ti];
    for (const r of scored) {
      st.score[ti]++; st.curRuns++; n++;
      this.bx(r.p).r++;
      const resp = r.resp || pitcherFallback;
      this.pbx(resp).r++;
    }
    if (rbiBatter && n) this.bx(rbiBatter).rbi += n;
    if (n) {
      const d = st.score[ti] - st.score[1 - ti];
      if (d > 0 && prevD <= 0) { st.goAhead[ti] = st.pitcher[ti]; st.goAheadL[ti] = st.pitcher[1 - ti]; }
      else if (d <= 0) { st.goAhead[ti] = null; }
      if (st.score[1 - ti] - st.score[ti] <= 0 && d <= 0 && prevD > 0) { /* lead lost */ }
    }
    return n;
  }

  // ---------------------------------------------------------------- running events
  runningEvent(pitcher) {
    const st = this.st;
    const bm = this.bmask();
    if (!bm) return null;
    const rr = this.tables.runrate[bm + '|' + st.outs];
    if (!rr || !rr[0]) return null;
    const [expo, kinds] = rr;
    const ti = st.half;
    const p = {};
    let tot = 0;
    for (const k in kinds) {
      let c = kinds[k] / expo;
      if (k === 'SB' || k === 'CS') continue;
      p[k] = c; tot += c;
    }
    const sb = kinds.SB || 0, cs = kinds.CS || 0;
    if (sb + cs > 0) {
      // lead runner who would steal
      let rs = null;
      if ((bm & 1) && !(bm & 2)) rs = st.bases[1]; else if ((bm & 2) && !(bm & 4)) rs = st.bases[2]; else rs = st.bases[bm & 4 ? 3 : 1];
      const att = (sb + cs) / expo * (rs ? rs.p.bat.attMult : 1) * (this.opts.stealScale ?? 1);
      let succ = sb / (sb + cs) * (rs ? rs.p.bat.succRel : 1);
      succ = Math.min(0.97, Math.max(0.3, succ));
      p.SB = att * succ; p.CS = att * (1 - succ);
      tot += att;
    }
    if (this.rng() >= tot) return null;
    const keys = Object.keys(p);
    const k = keys[pick(keys.map(x => p[x]), tot, this.rng())];
    const varr = this.tables.runvec[`${k}|${bm}|${st.outs}`];
    if (!varr) return null;
    let vt = 0; for (const x of varr) vt += x[1];
    let u = this.rng() * vt, vec = varr[varr.length - 1][0];
    for (const x of varr) { u -= x[1]; if (u < 0) { vec = x[0]; break; } }
    const before = st.bases.slice();
    const res = this.applyVec(vec, null, pitcher);
    const ptb = this.pbx(pitcher);
    st.outs += res.outsAdded;
    ptb.outs += res.outsAdded;
    const runs = this.scoreRuns(res.scored, pitcher, null);
    // text
    const nm = r => r.p.name;
    let text = '';
    const mv = res.moves;
    if (k === 'SB') {
      const m = mv.find(x => x.to > x.from);
      if (m) { text = `${nm(m.r)} steals ${m.to >= 4 ? 'home' : ORD[m.to] + ' base'}.`; this.bx(m.r.p).sb++; }
    } else if (k === 'CS') {
      const m = mv.find(x => x.to === 0);
      if (m) { text = `${nm(m.r)} is caught stealing ${ORD[Math.min(3, m.from + 1)]} base.`; this.bx(m.r.p).cs++; }
      else text = 'Stolen base attempt.';
    } else if (k === 'PO') {
      const m = mv.find(x => x.to === 0);
      text = m ? `${nm(m.r)} is picked off ${ORD[m.from]}.` : 'Pickoff throw, runner safe.';
    } else if (k === 'WP') text = 'Wild pitch.';
    else if (k === 'PB') text = 'Passed ball.';
    else if (k === 'BK') text = 'Balk.';
    else text = 'Runner advances.';
    if (runs) text += ` ${runs} run${runs > 1 ? 's' : ''} score${runs > 1 ? '' : 's'}.`;
    this.pushLog({ kind: 'run', text });
    return { kind: k, outs: res.outsAdded, runs };
  }

  pushLog(o) {
    const st = this.st;
    o.inn = st.inning; o.half = st.half; o.outs = st.outs; o.score = st.score.slice();
    st.log.push(o);
  }

  // ---------------------------------------------------------------- plate appearance
  startHalf() {
    const st = this.st;
    st.halfStarted = true;
    st.outs = 0; st.bases = [null, null, null, null]; st.curRuns = 0; st.halfPA = 0;
    const ti = st.half;
    if (this.opts.ghost && st.inning >= 10) {
      const lu = st.lineup[ti];
      const prev = lu[(st.slot[ti] + 8) % 9];
      st.bases[2] = { p: prev.p, resp: st.pitcher[1 - ti], ti, ghost: true };
      this.pushLog({ kind: 'info', text: `Extra innings: ${prev.p.name} starts on second base.` });
    }
    this.pushLog({ kind: 'half', text: `${st.half === 0 ? 'Top' : 'Bottom'} of the ${ordinal(st.inning)} — ${this.teams[st.half].name} batting` });
  }

  playPA() {
    const st = this.st;
    if (st.over) return null;
    if (!st.halfStarted) this.startHalf();
    this.beforePA();
    const ti = st.half, fi = 1 - ti;
    const batterInfo = this.currentBatter();
    const batter = batterInfo;
    let pitcher = st.pitcher[fi];
    // running events preceding the PA outcome
    for (let g = 0; g < 4; g++) {
      const re = this.runningEvent(pitcher);
      if (!re) break;
      if (st.outs >= 3) { return this.afterPA(null, true); }
    }
    const probs = this.paProbs(batter, pitcher, ti);
    const ev = pick(probs, 1, this.rng());
    const evName = EV[ev];
    const side = probs.side;
    const bm = this.bmask();
    const outs0 = st.outs;
    let typ = null, zone = 0;
    if (ev === 3 || ev === 4 || ev === 5 || ev === 7) { const s = this.sampleBIP(evName, batter, pitcher, side); typ = s.typ; zone = s.zone; }
    else if (ev === 6) { zone = this.sampleHRZone(side); typ = 'F'; }
    let vec = this.sampleVec(evName, typ, zone, bm, outs0) || this.defaultVec(evName, bm);
    const bx = this.bx(batter.p), pb = this.pbx(pitcher);
    const res = this.applyVec(vec, batter, pitcher);
    st.outs += res.outsAdded;
    pb.outs += res.outsAdded;
    // RBI eligibility
    const gdp = ev === 7 && res.outsAdded >= 2;
    const inplayRbi = !(gdp);
    const runs = this.scoreRuns(res.scored, pitcher, inplayRbi ? batter.p : null);
    // stats
    bx.pa++; pb.bf++;
    const sf = ev === 7 && typ === 'F' && runs > 0 && outs0 < 2 && res.moves.some(m => m.from === 3 && m.to === 4);
    if (sf) bx.sf++;
    if (ev === 0) { bx.k++; pb.k++; }
    else if (ev === 1) { bx.bb++; pb.bb++; }
    else if (ev === 2) { bx.hbp++; pb.hbp++; }
    else if (ev >= 3 && ev <= 6) { bx.h++; pb.h++; st.hits[ti]++; if (ev === 4) bx.d++; if (ev === 5) bx.t++; if (ev === 6) { bx.hr++; pb.hr++; } }
    if (gdp) bx.gdp++;
    bx.ab = bx.pa - bx.bb - bx.hbp - bx.sf;
    const pcBase = ev === 0 ? 4.8 : ev === 1 ? 5.6 : ev === 2 ? 3.2 : 3.3;
    pb.pc += Math.max(1, Math.round(pcBase + (this.rng() - 0.5) * 2.4));
    const text = this.describe(ev, typ, zone, vec, batter, res, runs, bm, outs0, sf);
    st.slot[ti] = (st.slot[ti] + 1) % 9;
    st.paCount++; st.halfPA++;
    const entry = { kind: 'pa', text, ev: evName, typ, zone, batter: batter.p.name, pitcher: pitcher.name, runs, side };
    this.pushLog(entry);
    return this.afterPA(entry, false);
  }

  afterPA(entry, midPA) {
    const st = this.st;
    const ti = st.half;
    // walk-off
    if (st.inning >= 9 && ti === 1 && st.score[1] > st.score[0]) {
      st.lineScore[ti][st.inning - 1] = st.curRuns;
      st.over = true; st.walkoff = true;
      this.pushLog({ kind: 'end', text: `Final: ${this.teams[0].name} ${st.score[0]}, ${this.teams[1].name} ${st.score[1]}` });
      return entry;
    }
    if (st.outs >= 3) {
      st.lineScore[ti][st.inning - 1] = st.curRuns;
      st.halfStarted = false;
      if (ti === 0) {
        st.half = 1;
        if (st.inning >= 9 && st.score[1] > st.score[0]) { st.over = true; st.lineScore[1][st.inning - 1] = 'x'; }
      } else {
        if (st.inning >= 9 && st.score[0] !== st.score[1]) st.over = true;
        else if (st.inning >= this.opts.maxInnings) st.over = true;
        else { st.inning++; st.half = 0; }
      }
      if (st.over) this.pushLog({ kind: 'end', text: `Final: ${this.teams[0].name} ${st.score[0]}, ${this.teams[1].name} ${st.score[1]}` });
    }
    return entry;
  }

  playHalf() {
    const st = this.st;
    const h = st.half, i = st.inning;
    let guard = 0;
    while (!st.over && st.half === h && st.inning === i && guard++ < 200) this.playPA();
  }
  playGame() {
    let guard = 0;
    while (!this.st.over && guard++ < 3000) this.playPA();
    return this.result();
  }

  decisions() {
    const st = this.st;
    if (!st.over || st.score[0] === st.score[1]) return {};
    const w = st.score[0] > st.score[1] ? 0 : 1, l = 1 - w;
    let W = st.goAhead[w] || st.pitcher[w];
    if (W === st.starter[w] && this.pbx(W).outs < 15 && st.pitSeen[w].length > 1) W = st.pitSeen[w][1];
    let L = st.goAheadL[w] || st.pitcher[l];
    const last = st.pitSeen[w][st.pitSeen[w].length - 1];
    let SV = null;
    if (last !== W && last !== st.starter[w]) {
      const lead = st.entryLead.get(last.key);
      if (lead >= 1 && lead <= 3 && st.score[w] - st.score[l] <= 3 && this.pbx(last).outs >= 1) SV = last;
    }
    return { W, L, SV, wi: w };
  }

  result() {
    const st = this.st;
    return { away: this.teams[0], home: this.teams[1], score: st.score.slice(), innings: st.inning, lineScore: st.lineScore, box: st.box, pbox: st.pbox, over: st.over,
      winner: st.score[0] > st.score[1] ? 0 : st.score[1] > st.score[0] ? 1 : -1, hits: st.hits, decisions: this.decisions(), pitSeen: st.pitSeen, batSeen: st.batSeen, walkoff: !!st.walkoff };
  }

  // ---------------------------------------------------------------- text
  describe(ev, typ, zone, vec, batter, res, runs, bm, outs0, sf) {
    const name = batter.p.name;
    const zn = ZONE_NAME[zone] || 'the field';
    const trajA = { G: 'on a ground ball', L: 'on a line drive', F: 'on a fly ball' };
    const traj = typ ? trajA[typ] : '';
    let t = '';
    const infield = zone >= 1 && zone <= 6;
    switch (ev) {
      case 0: t = `${name} strikes out${vec[0] !== '0' ? ' (reaches on the dropped third strike)' : ''}.`; break;
      case 1: t = `${name} walks.`; break;
      case 2: t = `${name} is hit by a pitch.`; break;
      case 3: t = infield ? `${name} singles on a ${typ === 'G' ? 'ground ball' : 'soft liner'} to ${zn}${zone <= 6 && typ === 'G' ? '' : ''}.` : `${name} singles ${traj} to ${zn}.`; break;
      case 4: t = `${name} doubles ${traj} to ${zn}.`; break;
      case 5: t = `${name} triples ${traj} to ${zn}.`; break;
      case 6: t = `${name} homers to ${ZONE_NAME[zone] === 'the field' ? 'the seats' : zn}.`; break;
      case 7: {
        const batterOut = vec[0] === '0';
        const dp = res.outsAdded >= 2 && batterOut;
        if (!batterOut) {
          const runnerOut = res.moves.some(m => m.to === 0);
          t = runnerOut ? `${name} reaches on a fielder's choice to ${zn}.` : `${name} reaches on an error by ${zn === 'the field' ? 'the defense' : 'the ' + (zn.replace('the ', ''))}.`;
        } else if (dp) t = `${name} grounds into a double play (${zn}).`;
        else if (sf) t = `${name} hits a sacrifice fly to ${zn}.`;
        else if (typ === 'G') t = `${name} grounds out to ${zn}.`;
        else if (typ === 'L') t = `${name} lines out to ${zn}.`;
        else t = infield ? `${name} pops out to ${zn}.` : `${name} flies out to ${zn}.`;
        break;
      }
    }
    const outsRunners = res.moves.filter(m => m.r !== res.batterRunner && m.to === 0);
    if (outsRunners.length && ev !== 7) t += ` ${outsRunners.map(m => m.r.p.name).join(', ')} out on the play.`;
    if (runs) t += ` ${runs} run${runs > 1 ? 's' : ''} score${runs > 1 ? '' : 's'}.`;
    return t;
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export { ordinal, ZONE_NAME };
