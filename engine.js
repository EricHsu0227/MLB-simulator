// Box Seat Baseball — Under The Hood rules engine
(function (G) {
const C = G.BSB_CHARTS;
const BR = C.BRORD;
const POSNUM = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9, DH: 10 };
const NUMPOS = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH' };
const DICE = [11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26, 31, 32, 33, 34, 35, 36, 41, 42, 43, 44, 45, 46, 51, 52, 53, 54, 55, 56, 61, 62, 63, 64, 65, 66];
const BASEN = ['1st', '2nd', '3rd', 'home'];

// ---------- RNG ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- helpers ----------
const brGE = (br, req) => BR[br] >= BR[req];
const inR = (v, lo, hi) => v >= lo && v <= hi;
function lookupRange(list, v) { for (const e of list) if (v >= e[0] && v <= e[1]) return e[2]; return null; }
function brStep(br, d) { const o = ['C-', 'C', 'B', 'A', 'A+']; let i = o.indexOf(br) + d; return o[Math.max(0, Math.min(4, i))]; }

// ---------- Card helpers ----------
function fieldRating(card, pos) {
  // returns {F, E, arm, DP}
  if (!card) return { F: 4, E: 5, arm: 'D', DP: 1 };
  if (card.t === 'P') return { F: 3, E: card.E, arm: 'C', DP: 0 };
  const list = card.pos || [];
  let idx = list.indexOf(pos);
  if (idx < 0) {
    const of = ['LF', 'CF', 'RF'];
    idx = list.findIndex(p => (p === 'OF' && of.includes(pos)) || (p === 'OO' && (pos === 'LF' || pos === 'RF')) || (p === 'II' && (pos === '2B' || pos === 'SS')) || (p === 'OI' && (pos === '1B' || pos === '3B')) || (p === 'IF' && ['1B', '2B', '3B', 'SS'].includes(pos)));
  }
  const Fs = card.F || [], Es = card.E || [];
  let F, E, known = idx >= 0;
  if (known) {
    F = Fs[Math.min(idx, Fs.length - 1)]; E = Es[Math.min(idx, Es.length - 1)];
  }
  if (!known || F == null) {
    const n = POSNUM[pos];
    const inAll = card.allpos && card.allpos.includes(n);
    F = Math.min(4, (Fs[0] || 3) + (inAll ? 1 : 2));
    E = Math.max(0, (Es[0] != null ? Es[0] : 10) - (inAll ? 2 : 6));
  }
  if (F == null) F = 3; if (E == null) E = 10;
  let arm = card.arm || 'C';
  if (pos === 'C' && !card.pos.includes('C')) arm = 'E';
  let DP = card.DP != null ? card.DP : ((pos === '2B' || pos === 'SS') ? 1 : 0);
  return { F, E, arm, DP };
}

// ---------- Game creation ----------
function makeRunner(cid, g, extra) { return Object.assign({ cid, resp: g.pitcherOf(1 - g.half), unearned: false }, extra || {}); }

function newBatLine(cid, pos) { return { cid, pos, AB: 0, R: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, SO: 0, HBP: 0, SB: 0, CS: 0, SF: 0, SH: 0, GDP: 0, E: 0, PA: 0 }; }
function newPitLine(cid) { return { cid, OUTS: 0, BF: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, HBP: 0, WP: 0, BK: 0, IBB: 0, dec: '' }; }

class Game {
  constructor(D, setup) {
    this.D = D;
    this.cards = D.cards;
    this.rng = mulberry32(setup.seed != null ? setup.seed : (Math.random() * 2 ** 31) | 0);
    this.opts = Object.assign({ bpEffects: true, bpFielder: true, autoRunner: true, wildPlays: true, styles: ['N', 'N'], dh: true, fatigueLvl: 2, advErrors: true }, setup.opts || {});
    this.park = setup.park; this.parkCode = setup.parkCode;
    this.weather = setup.weather;
    this.isPost = !!setup.isPost;
    this.inning = 1; this.half = 0; this.outs = 0; this.bases = [null, null, null];
    this.score = [0, 0]; this.line = [[], []]; this.hits = [0, 0]; this.errors = [0, 0]; this.lob = [0, 0];
    this.log = []; this.plays = []; this.over = false; this.winner = null;
    this.teams = setup.teams.map((t, i) => this.initTeam(t, i));
    this.inningStats = { hbb: 0 };
    this.defense = [{}, {}];
    this.applyWeatherFatigue();
    this.startHalf(true);
  }
  initTeam(t, side) {
    const T = { code: t.code, name: t.name, abbr: t.abbr || t.code, side, lineup: t.lineup.map(x => ({ cid: x[0], pos: x[1] })), bi: 0,
      bench: (t.bench || []).slice(), pen: (t.pen || []).slice(), used: new Set(), bat: {}, pit: {}, pitOrder: [], sp: t.sp, ai: t.ai !== false,
      plan: t.plan || null, fatigue: {}, infieldIn: false, guardLines: false, style: 'N' };
    T.lineup.forEach(x => { T.used.add(x.cid); T.bat[x.cid] = newBatLine(x.cid, x.pos); T.bat[x.cid].order = T.lineup.indexOf(x); });
    T.pitcher = t.sp; T.used.add(t.sp); T.pit[t.sp] = newPitLine(t.sp); T.pitOrder.push(t.sp);
    const pc = this.cards[t.sp];
    T.fatigue[t.sp] = this.startFatigue(pc, true, t.spFatigue);
    T.spIn = true; T.spCid = t.sp;
    T.restDays = t.restDays || {};
    return T;
  }
  get fl() { return this.opts.fatigue || 'L2'; }
  startFatigue(pc, starter, override) {
    if (this.fl === 'L1') {
      let f = override != null ? override : (pc.F1 || 10);
      if (starter) { if (f < 20) f = 20; } else { if (f >= 20) f = 15; }
      return f;
    }
    let f = override != null ? override : pc.F2;
    if (starter) { if (f < 15) f = 15; } else { if (f >= 15) f = 11; if (this.fl === 'L2H') f = Math.round(f / 2 * 10) / 10; }
    return f;
  }
  applyWeatherFatigue() {
    const w = this.weather; if (!w) return;
    let adj = 0;
    if (w.temp > 90) adj = w.dn === 'D' ? -4 : -2;
    else if (w.temp >= 56 && w.temp <= 77) adj = 2;
    if (w.roof) adj = 2;
    this.wxFatigue = adj;
    for (const T of this.teams) T.fatigue[T.pitcher] += adj;
  }
  pitcherOf(side) { return this.teams[side].pitcher; }
  get off() { return this.teams[this.half]; }
  get def() { return this.teams[1 - this.half]; }
  rnd(n) { return Math.floor(this.rng() * n); }
  roll() { return { w: 1 + this.rnd(6), b: 1 + this.rnd(6), r: this.rnd(10), g: this.rnd(10), p: this.rnd(10) }; }
  d6() { return 1 + this.rnd(6); }
  d10() { return this.rnd(10); }
  wb() { return (1 + this.rnd(6)) * 10 + 1 + this.rnd(6); }
  say(txt, cls, ch) { if (this.cur) this.cur.lines.push([cls || '', txt, ch || this.ch || null]); this.ch = null; }
  card(cid) { return this.cards[cid]; }
  name(cid) { const c = this.cards[cid]; return c ? titleName(c.n) : '?'; }

  // ---------- defense ----------
  fielderAt(pos, side) {
    const T = this.teams[side == null ? 1 - this.half : side];
    if (pos === 'P') return T.pitcher;
    const x = T.lineup.find(l => l.pos === pos);
    return x ? x.cid : null;
  }
  fr(pos) { const cid = this.fielderAt(pos); const c = this.card(cid); const r = fieldRating(c, pos); r.cid = cid; if (pos === 'P' && c) { r.E = c.E; } return r; }

  // ---------- half innings ----------
  startHalf(first) {
    this.outs = 0; this.bases = [null, null, null];
    this.inningStats = { hbb: 0, runs: 0 };
    this.line[this.half][this.inning - 1] = 0;
    if (this.opts.autoRunner && !this.isPost && this.inning >= 10) {
      // automatic runner on 2nd: last batter of previous inning order
      const T = this.off; const i = (T.bi + T.lineup.length - 1) % T.lineup.length;
      const r = makeRunner(T.lineup[i].cid, this, { unearned: true, auto: true });
      this.bases[1] = r;
    }
    const d = this.def;
    d.infieldIn = false;
  }
  endHalf() {
    this.lob[this.half] += this.bases.filter(Boolean).length;
    // starter completes 7 innings allowing 1 or fewer earned runs: fatigue bonus (once)
    { const D = this.def; const pl = D.pit[D.spCid];
      if (D.pitcher === D.spCid && !D.bonus7 && pl.OUTS >= 21 && pl.ER <= 1) { D.bonus7 = true; const b = this.fl === 'L1' ? 4 : 3; D.fatigue[D.pitcher] += b;
        this.log.push({ type: 'SUB', lines: [], inning: this.inning, half: this.half, desc: `${this.name(D.pitcher)} completes 7 innings allowing ${pl.ER} ER — fatigue +${b}` }); } }
    if (this.half === 0) { this.half = 1; }
    else { this.half = 0; this.inning++; }
    // game over checks
    if (this.checkOver()) return;
    this.startHalf();
  }
  checkOver() {
    const [a, h] = this.score;
    if (this.half === 1 && this.inning >= 9 && h > a) { this.finish(); return true; } // home leads going to bottom 9+
    if (this.half === 0 && this.inning > 9 && a !== h) { this.finish(); return true; }
    if (this.half === 0 && this.inning === 10 && a !== h) { this.finish(); return true; }
    if (this.inning > 25) { this.finish(); return true; }
    return false;
  }
  finish() {
    this.over = true;
    const [a, h] = this.score;
    this.winner = a > h ? 0 : (h > a ? 1 : -1);
    this.assignDecisions();
  }

  // ---------- scoring ----------
  scoreRun(r, rbi, cur) {
    const side = this.half;
    this.score[side]++; this.line[side][this.inning - 1] = (this.line[side][this.inning - 1] || 0) + 1;
    if (this.cur) (this.cur.scored = this.cur.scored || []).push(r.cid);
    this.inningStats.runs++;
    const bl = this.off.bat[r.cid]; if (bl) bl.R++;
    const pT = this.def; const pl = pT.pit[r.resp]; if (pl) { pl.R++; if (!r.unearned) pl.ER++; }
    if (rbi && cur && cur.batter != null) { const b = this.off.bat[cur.batter]; if (b) b.RBI++; }
    this.leadTrack();
    // walk-off
    if (this.half === 1 && this.inning >= 9 && this.score[1] > this.score[0]) this.walkoff = true;
  }
  leadTrack() {
    // track pitcher of record for W/L
    const [a, h] = this.score;
    const lead = a > h ? 0 : (h > a ? 1 : -1);
    if (lead !== this.leadSide) {
      this.leadSide = lead;
      if (lead >= 0) {
        this.leadChange = { side: lead, winP: this.teams[lead].pitcher, loseP: this.teams[1 - lead].pitcher, inning: this.inning, half: this.half };
      } else this.leadChange = null;
    }
  }
  assignDecisions() {
    if (this.winner < 0 || !this.leadChange) return;
    const W = this.teams[this.winner], L = this.teams[1 - this.winner];
    let wp = this.leadChange.winP;
    // starter must go 5 innings for win
    if (wp === W.spCid && (W.pit[wp].OUTS < 15)) {
      // give to most effective reliever (simplified: the next pitcher who pitched)
      const rel = W.pitOrder.filter(p => p !== W.spCid);
      if (rel.length) wp = rel[0];
    }
    W.pit[wp].dec = 'W'; L.pit[this.leadChange.loseP].dec = 'L';
    // save: last pitcher of winning team, not winner, lead <=3 when entered or 3+ IP
    const last = W.pitOrder[W.pitOrder.length - 1];
    if (last !== wp && W.saveCand === last) W.pit[last].dec = 'S';
  }
  outRecorded(n, cur) {
    n = n || 1;
    if (this.outs + n > 3) n = Math.max(0, 3 - this.outs);
    this.outs += n;
    const pl = this.def.pit[this.def.pitcher]; pl.OUTS += n;
    this.fatigueAdj(-0.66 * n);
  }
  fatigueAdj(v) { if (this.fl === 'L1') return; const T = this.def; T.fatigue[T.pitcher] = (T.fatigue[T.pitcher] || 0) + v; }
  fatigueBF() { if (this.fl !== 'L1') return; const T = this.def; T.fatigue[T.pitcher] = (T.fatigue[T.pitcher] || 0) - 1; }

  // ---------- current situation ----------
  sitKey() { const b = this.bases; return (b[0] ? '1' : '') + (b[1] ? '2' : '') + (b[2] ? '3' : ''); }
  sitCat() { const b = this.bases; if (b[1] || b[2]) return 'SP'; if (b[0]) return 'R1'; return 'E'; }
  risp() { return !!(this.bases[1] || this.bases[2]); }
  batterCid() { const T = this.off; return T.lineup[T.bi].cid; }
  batterCard() { const cid = this.batterCid(); const c = this.card(cid); return c && c.t === 'B' ? c : this.genericFor(c); }
  genericFor(pc) { const gs = this.D.gen.map(i => this.cards[i]); const b = pc ? pc.b : 'R'; return gs.find(g => g.b === (b === 'L' ? 'L' : 'R')) || gs[0]; }
  hands(bc, pc) {
    const bats = bc.b === 'B' ? (pc.th === 'L' ? 'R' : 'L') : bc.b;
    return { bats, pcol: pc.th, bcol: bats }; // pcol: batter card column (vs pitcher hand); bcol: pitcher card column (vs batter side)
  }

  // ======================================================
  //  PLATE APPEARANCE
  // ======================================================
  plateAppearance(dec) {
    dec = dec || {};
    const T = this.off, D = this.def;
    const bcid = this.batterCid(), bc = this.batterCard(), pc = this.card(D.pitcher);
    const h = this.hands(bc, pc);
    const cur = this.cur = { type: 'PA', inning: this.inning, half: this.half, batter: bcid, pitcher: D.pitcher, lines: [], outsBefore: this.outs, sitBefore: this.sitKey(), scoreBefore: this.score.slice(), runs: 0, dec };
    this.hr = h; this.bc = bc; this.pc = pc;
    const bl = T.bat[bcid] || (T.bat[bcid] = newBatLine(bcid, '?'));
    const pl = D.pit[D.pitcher];
    pl.BF++; bl.PA++;
    if (!dec.ibb) this.fatigueBF();
    D.infieldIn = !!dec.infieldIn;
    let res;
    if (dec.ibb) {
      this.say(`Intentional walk to ${this.name(bcid)}`, 'hd');
      pl.IBB++;
      res = this.doWalk(cur, true);
    } else if (dec.bunt || dec.squeeze) {
      res = this.doBunt(cur, !!dec.squeeze);
    } else {
      const d = this.roll(); cur.dice = d; this.d = d;
      const WB = d.w * 10 + d.b;
      const tok = bc.res[h.pcol][DICE.indexOf(WB)];
      cur.tok = tok; cur.cell = { col: h.pcol, idx: DICE.indexOf(WB) };
      this.ch = { k: 'bcard' };
      this.say(`Dice: White ${d.w} Black ${d.b} Red ${d.r}${d.r === 0 ? 'E' : ''} Green ${d.g} Pitcher die ${C.pdie[d.p]}  →  ${WB} on ${titleName(bc.n)} vs ${h.pcol}HP: ${tok}`, 'dice');
      this.hitRun = !!dec.hitRun;
      if (dec.hitRun) this.say('Hit and run is on!', 'hd');
      res = this.resolveToken(tok, cur);
    }
    this.hitRun = false;
    cur.desc = cur.desc || '';
    // advance batting order
    if (!cur.noAdvanceBatter) T.bi = (T.bi + 1) % T.lineup.length;
    this.finishPlay(cur);
    return cur;
  }
  finishPlay(cur) {
    cur.scoreAfter = this.score.slice(); cur.outsAfter = this.outs; cur.sitAfter = this.sitKey();
    this.plays.push(cur);
    this.log.push(cur);
    if (this.walkoff) { this.finish(); return; }
    if (this.outs >= 3) {
      this.say(`${this.outs > 3 ? 3 : 3} outs — end of ${this.half === 0 ? 'top' : 'bottom'} ${ord(this.inning)}.`, 'end');
      this.outs = 3;
      this.endHalf();
    }
  }

  // ---------- token resolution ----------
  isRed(tok) { return /^(SN|DB|TP|DFH|HBP)/.test(tok); }
  resolveToken(tok, cur) {
    const d = this.d;
    if (tok.includes('/') && tok !== 'RP/+WP') {
      const [a, b] = tok.split('/');
      const pick = d.r <= 4 ? a : b;
      this.say(`Split result ${tok}: red die ${d.r} → ${pick}`);
      tok = pick;
    }
    if (tok === 'RP/+WP') return this.rarePlay(cur, true);
    let m;
    if ((m = tok.match(/^K(?:\((-?\d)\))?$/))) return this.kResult(m[1], cur);
    if ((m = tok.match(/^BB(?:\((-?\d)\)(\*)?)?$/))) return this.bbResult(m[1], !!m[2], cur);
    if ((m = tok.match(/^RNG-([A-Z]{2})(\d)$/))) return this.rangeOut(m[1], +m[2], cur);
    if ((m = tok.match(/^([A-Z]{2})(\d)-SPH$/))) {
      if (this.risp()) { this.say(`${tok}: runner(s) in scoring position → Scoring Position Hit chart`); return this.sphChart(cur); }
      this.say(`${tok}: no runners in scoring position → ${m[1]}${m[2]}`);
      return this.outResult(m[1] + m[2], cur);
    }
    if ((m = tok.match(/^DF([LM])(\d)$/))) {
      const n = +m[2]; const lim = m[1] === 'L' ? 2 : 6;
      const out = d.r <= lim ? 'DFO' + n : (n === 1 ? 'LF1' : 'LF4');
      this.say(`${tok}: red die ${d.r} → ${out}`);
      if (out.startsWith('DFO')) return this.deepFly(n, cur, false);
      return this.outResult(out, cur);
    }
    if ((m = tok.match(/^DFO(\d)$/))) return this.deepFly(+m[1], cur, false);
    if (this.isRed(tok)) return this.hitCheck(tok, cur);
    return this.outResult(tok, cur);
  }

  pitcherCell(kind, n) {
    const g = this.pc.g[kind][this.hr.bcol]; const v = g ? g[String(n)] : undefined;
    if (this.cur) this.cur.pcell = { kind, n: String(n), col: this.hr.bcol };
    return v || null;
  }
  splitPitcher(ptok, orig) {
    // pitcher result: bases empty / runners on ; BTR = batter's result
    let t = ptok;
    if (t.includes('/')) { const [a, b] = t.split('/'); t = this.sitKey() === '' ? a : b; }
    if (t === 'BTR') return { btr: true, tok: orig };
    return { btr: false, tok: t };
  }
  fatigueLet() {
    // returns true if fatigued pitcher fails to block (batter result stands)
    const D = this.def; const f = D.fatigue[D.pitcher];
    if (f > 0) return false;
    const r = this.d.r;
    let lim;
    if (this.fl === 'L1') { if (f >= -2) lim = 0; else if (f >= -4) lim = 2; else if (f >= -5) lim = 4; else if (f >= -6) lim = 7; else lim = 9; }
    else { if (f >= -1) lim = 0; else if (f >= -2) lim = 2; else if (f >= -3) lim = 4; else if (f >= -4) lim = 7; else lim = 9; }
    this.ch = TB.fatigue(this, f, r);
    if (r <= lim) { this.say(`Fatigued pitcher (fatigue ${f.toFixed(1)}): red die ${r} ≤ ${lim} → block fails`, 'warn'); return true; }
    this.say(`Fatigued pitcher (fatigue ${f.toFixed(1)}): red die ${r} > ${lim} → still blocks`);
    return false;
  }
  kResult(n, cur) {
    if (n == null) return this.doStrikeout(cur);
    const pt = this.pitcherCell('k', n);
    if (!pt) { this.ch = { k: 'pcard' }; this.say(`K(${n}): pitcher has no result at K ${n} → strikeout`); return this.doStrikeout(cur); }
    const s = this.splitPitcher(pt, 'K');
    if (s.btr) { this.say(`K(${n}): pitcher K ${n} = ${pt} → BTR → strikeout`); return this.doStrikeout(cur); }
    this.ch = { k: 'pcard' };
    this.say(`K(${n}): pitcher's K ${n} vs ${this.hr.bcol}HB = ${s.tok} → ball in play`);
    return this.outResult(s.tok, cur);
  }
  bbResult(n, star, cur) {
    if (n == null) {
      if (this.pc.ewr && this.pc.ewr[this.hr.bcol]) {
        if (this.d.r >= 5) { this.say('BB vs extreme control pitcher (EWR): red die 5-9 → blocked, special situations out'); return this.specialOut(cur); }
        this.say('BB vs EWR pitcher: red die 0-4 → walk');
      }
      return this.doWalk(cur);
    }
    const pt = this.pitcherCell('bb', n);
    if (!pt) {
      this.ch = { k: 'pcard' };
      this.say(`BB(${n})${star ? '*' : ''}: pitcher has no result at BB ${n} → walk`);
      return this.doWalk(cur);
    }
    const s = this.splitPitcher(pt, 'BB');
    if (s.btr) { this.say(`BB(${n}): pitcher BB ${n} = BTR → walk`); return this.doWalk(cur); }
    if (this.fatigueLet()) return this.doWalk(cur);
    if (star) { this.say(`BB(${n})*: pitcher blocks at BB ${n} → strikeout`); return this.doStrikeout(cur); }
    this.ch = { k: 'pcard' };
    this.say(`BB(${n}): pitcher blocks walk at BB ${n} → ${s.tok}`);
    return this.outResult(s.tok, cur);
  }

  // ---------- hit check ----------
  hitCheck(tok, cur) {
    const d = this.d, bc = this.bc, st = bc[this.hr.pcol];
    const GR = d.g * 10 + d.r;
    const isHBP = tok === 'HBP';
    const risp = this.risp();
    if (this.hitRun && tok.startsWith('HR')) { /* n/a */ }
    let sym;
    if (st.chrt != null) {
      const wb = this.wb();
      const ci = C.lowAvg.cols.indexOf(st.chrt);
      for (const k of Object.keys(C.lowAvg.rows)) { const r = C.lowAvg.rows[k][ci]; if (r && inR(wb, r[0], r[1])) sym = k; }
      this.ch = TB.lowAvg(st.chrt, wb);
      this.say(`${tok} (red): low-average batter Chrt ${st.chrt} → reroll ${wb} → pitcher symbol ${sym}`);
      if (sym == null) return this.batterHit(tok, cur);
      if (isHBP) return this.hbpSymbol(sym === 'R' ? 'Rng' : '(' + sym + ')', cur);
      return this.applySymbol(sym, tok, cur, true);
    }
    if (st.spo != null && risp && GR >= st.spo) {
      this.say(`${tok} (red): scoring position — green+red ${GR} ≥ (${st.spo}) → scoring position out`);
      return this.specialOut(cur);
    }
    if (st.hit != null && GR >= st.hit) {
      this.say(`${tok} (red): green+red ${GR} ≥ hit range ${st.hit} → automatic hit`);
      return isHBP ? this.doHBP(cur) : this.batterHit(tok, cur);
    }
    sym = C.pdie[d.p];
    this.ch = TB.pdie(isHBP, d.p, GR, st);
    this.say(`${tok} (red): green+red ${GR} vs Hit(uth) ${st.hit == null ? '—' : st.hit}${st.spo != null ? '(' + st.spo + ')' : ''} → no auto hit; pitcher die ${isHBP ? C.pdieHBP[d.p] : sym}`);
    if (isHBP) return this.hbpSymbol(C.pdieHBP[d.p], cur);
    return this.applySymbol(sym, tok, cur, false);
  }
  spInGame() { const D = this.def; return D.pitcher === D.spCid; }
  elRating() {
    if (!this.spInGame()) return null;
    if (this.inning === 1) return this.pc.early;
    if (this.inning >= 7) return this.pc.late;
    return null;
  }
  applySymbol(sym, tok, cur, fromLow) {
    if (sym === 'R') return this.rangeHit(tok, cur);
    let col = sym;
    if (sym === '2D' || sym === '3E') {
      const r = this.elRating();
      const need = sym === '2D' ? ['D', 'E'] : ['E'];
      if (r && need.includes(r)) { this.say(`${sym}: starter's ${this.inning === 1 ? 'Early' : 'Late'} rating ${r} → batter's result stands`); return this.batterHit(tok, cur); }
      col = sym[0];
    }
    if (sym === 'A' || sym === 'B') {
      const r = this.elRating();
      const ok = r && (sym === 'A' ? r === 'A' : (r === 'A' || r === 'B'));
      if (ok) { this.say(`${sym}: starter's ${this.inning === 1 ? 'Early' : 'Late'} rating ${r} → special situations out`); return this.specialOut(cur); }
      this.say(`${sym}: ${r ? 'rating ' + r + ' not good enough' : 'not 1st/7th+ inning or starter out'} → batter's result stands`);
      return this.batterHit(tok, cur);
    }
    const pt = this.pitcherCell('hit', col);
    if (!pt) { this.ch = { k: 'pcard' }; this.say(`Pitcher Hit ${col} vs ${this.hr.bcol}HB: blank → ${tok} stands`); return this.batterHit(tok, cur); }
    const s = this.splitPitcher(pt, tok);
    if (s.btr) { this.say(`Pitcher Hit ${col} = ${pt} → BTR → ${tok} stands`); return this.batterHit(tok, cur); }
    this.ch = { k: 'pcard' };
    this.say(`Pitcher Hit ${col} vs ${this.hr.bcol}HB = ${pt} → pitcher blocks with ${s.tok}`);
    if (this.fatigueLet()) return this.batterHit(tok, cur);
    if (s.tok === 'K') return this.doStrikeout(cur);
    return this.outResult(s.tok, cur);
  }
  hbpSymbol(sym, cur) {
    const r = this.pc.HBP;
    const map = { 'Rng': -3, '*A': -3, '*B': -3, '(-3)': -3, '(-2)': -2, '(-1)': -1, '(0)': 0, '(1)': 1, '(2)*D': 2, '(3)*E': 3 };
    let hbp;
    if (sym === 'Rng' || sym === '*A' || sym === '*B') hbp = r >= -3;
    else hbp = r > map[sym];
    this.say(`HBP routine: symbol ${sym} vs pitcher HBP rating ${r} → ${hbp ? 'hit by pitch' : 'special situations out'}`);
    return hbp ? this.doHBP(cur) : this.specialOut(cur);
  }
  specialOut(cur) {
    const r = this.d10(); const res = C.specOut[r];
    this.ch = TB.spec(r);
    this.say(`Special Situations Outs: red die ${r} → ${res}`);
    return this.outResult(res, cur);
  }
  sphChart(cur) {
    const wb = this.wb(); const pw = this.bc[this.hr.pcol].pow;
    const res = lookupRange(C.sph[pw], wb) || 'SN2';
    this.ch = TB.sph(pw, wb);
    this.say(`Scoring Position Hit chart (${pw === 'P' ? 'Power' : pw === 'N' ? 'Norm' : 'Weak'}): roll ${wb} → ${res}`);
    if (res === 'HBP') return this.doHBP(cur);
    if (res === 'HR') { const fld = this.hr.bats === 'R' ? 'LF' : 'RF'; return this.doHomeRun(cur, fld); }
    return this.batterHit(res, cur);
  }

  // ---------- batter's hit result (after hit check) ----------
  batterHit(tok, cur, opts) {
    opts = opts || {};
    let m;
    if (tok === 'HBP') return this.doHBP(cur);
    if ((m = tok.match(/^DFH(\d)$/))) return this.deepFly(+m[1], cur, true);
    if (tok === 'HR') return this.doHomeRun(cur, this.hr.bats === 'R' ? 'LF' : 'RF');
    // hit-and-run play result changes on home runs handled in doHomeRun
    let kind, n, flavor = null;
    if (tok === 'SN-inf') { kind = 'SN'; n = 'inf'; }
    else if ((m = tok.match(/^SN(\d)(-gb)?$/))) { kind = 'SN'; n = +m[1]; flavor = m[2] ? 'gb' : null; }
    else if ((m = tok.match(/^DB(\d)$/))) { kind = 'DB'; n = +m[1]; }
    else if ((m = tok.match(/^TP(\d)$/))) { kind = 'TP'; n = 1; }
    else { this.say('Unknown hit ' + tok); kind = 'SN'; n = 1; }
    return this.executeHit(kind, n, flavor, cur, opts);
  }

  fielderDie() {
    // fielder selection die: red unless 0 (error check) then green (reroll 0)
    const d = this.d;
    if (d.r !== 0) return { rd: d.r, twoBase: false };
    let g = d.g, two = false;
    if (g === 0) { two = true; do { g = this.d10(); } while (g === 0); }
    return { rd: g, twoBase: two };
  }
  chartEntry(chart, rd) {
    const cat = this.sitCat();
    const rows = chart[cat] || chart.E;
    let e = rows.find(r => rd >= r[0] && rd <= r[1]);
    if (!e) e = rows[rows.length - 1];
    let t = e[2];
    if (typeof t === 'object') t = t[this.hr.bats] || t.R;
    return { text: t, cat };
  }

  executeHit(kind, n, flavor, cur, opts) {
    const fd = opts.rd != null ? { rd: opts.rd, twoBase: false } : this.fielderDie();
    let chart;
    if (kind === 'SN' && n === 'inf') chart = C.hits.SNinf;
    else chart = C.hits[kind + n];
    let { text } = this.chartEntry(chart, fd.rd);
    const parts = text.split(' ');
    let fld = parts[0];
    let desc = kind === 'SN' && n === 'inf' ? 'inf' : (parts[1] && /^[a-z]+$/.test(parts[1]) ? parts[1] : '');
    if (flavor === 'gb') desc = 'gb';
    let adv = parts.slice(desc && parts[1] === desc ? 2 : (/^[a-z]+$/.test(parts[1] || '') ? 2 : 1)).join(' ');
    const errCheck = this.d && this.d.r === 0 && !opts.noErr;
    if (opts.forceField) fld = opts.forceField;
    // hit and run changes
    if (this.hitRun && this.bases.some(Boolean)) {
      if (kind === 'SN' && (fld === 'CF' || fld === 'RF')) adv = 'HR_2BASE';
      else if (kind === 'SN' && fld === 'LF') adv = 'HR_LF';
      else if (kind === 'DB') adv = 'HR_DB';
    }
    const kname = { SN: 'Single', DB: 'Double', TP: 'Triple' }[kind];
    const dn = { dtl: 'down the line', otw: 'off the wall', btw: 'bounces to the wall', ilg: 'into the left-center gap', irg: 'into the right-center gap', bl: 'bloop', av: '', hd: 'hard', hs: 'hard', aa: 'angling away', gb: 'on the ground', inf: 'infield' }[desc] || '';
    this.ch = TB.field(this, kind === 'SN' && n === 'inf' ? 'SN inf' : kind + n, chart, fd.rd);
    this.say(`${kname}${n !== 'inf' && n ? ' ' + n : ''} — fielder die ${fd.rd} (${this.sitCat() === 'E' ? 'bases empty' : this.sitCat() === 'R1' ? 'runner on 1st' : 'scoring position'}): ${text}`);
    return this.hitPlay(kind, fld, desc, adv, cur, { errCheck, twoBase: fd.twoBase, n, dn });
  }

  hitPlay(kind, fld, desc, adv, cur, o) {
    cur.ball = { t: (desc === 'gb' || desc === 'inf' || /^(1B|2B|SS|3B)$/.test(fld)) ? 'gb' : (desc === 'bl' ? 'bloop' : 'line'), fld, hit: kind, desc };
    const T = this.off, bcid = cur.batter;
    const bl = T.bat[bcid]; const pl = this.def.pit[this.def.pitcher];
    const twoOut = this.outs === 2;
    const occ = this.bases.slice();
    let bases = kind === 'SN' ? 1 : kind === 'DB' ? 2 : 3;
    let outAt2 = false;      // batter thrown out at 2nd (OF CK arm)
    let ofAdv = null;        // OF CK advance mode for converted hits: 'Z' | 'norm' | 'ARMSGL'
    // --- OF CK on the batter's hit (bases empty code, or runner code that calls for it) ---
    const r1code = (adv.match(/R1[^;]*/) || [''])[0];
    let needOF = false;
    if (/(^|\s)OFCK$/.test(adv) && !/R\d/.test(adv)) { needOF = true; adv = ''; }
    if (occ[0] && kind === 'DB' && /R1->OFCK/.test(r1code)) needOF = true;
    if (occ[0] && kind === 'SN' && /OFCK/.test(r1code)) {
      // singles: OFCK applies with <2 outs for 'R1->OFCK(..)', with 2 outs for '(OFCK)'
      const inParen = /\(OFCK\)/.test(r1code);
      if ((inParen && twoOut) || (!inParen && !twoOut)) needOF = true;
    }
    if (needOF && (kind === 'SN' || kind === 'DB')) {
      const oc = this.ofck(kind, fld);
      if (oc.result === 'OUT2') outAt2 = true;
      else if (oc.result === 'ARMSGL') { bases = 1; ofAdv = 'ARMSGL'; }
      else if (oc.result === 'SGL') { if (kind === 'DB') cur.dblToSgl = true; bases = 1; ofAdv = oc.adv; }
      else if (oc.result === 'DBL') { if (kind === 'SN') cur.sglToDbl = true; bases = 2; ofAdv = oc.adv; }
    }
    const moves = [];
    let infDesc = null;
    if (kind === 'TP') {
      for (let i = 2; i >= 0; i--) if (occ[i]) moves.push([i, 3]);
      moves.push(['B', 2]);
    } else if (outAt2) {
      for (let i = 2; i >= 0; i--) if (occ[i]) moves.push([i, i === 0 ? 2 : 3]);
      moves.push(['B', 'out']);
    } else if (bases === 2) {
      if (adv === 'HR_DB') { for (let i = 2; i >= 0; i--) if (occ[i]) moves.push([i, 3]); }
      else {
        // Z rare advance: only sits 2nd / 2nd&3rd with < 2 outs
        if (ofAdv === 'Z' && !occ[0] && occ[1] && !twoOut) {
          if (occ[2]) moves.push([2, 3]);
          const br2 = this.effBR(occ[1]);
          if (br2 === 'C' || br2 === 'C-') { moves.push([1, 2]); this.say(`OF CK (Z): ${this.name(occ[1].cid)} (B/R ${br2}) misreads the drive and only reaches 3rd`); }
          else moves.push([1, 3]);
        } else {
          for (let i = 2; i >= 1; i--) if (occ[i]) moves.push([i, 3]);
          if (occ[0]) {
            let dest;
            if (ofAdv || /R1->OFCK/.test(adv) || /R1->cd/.test(adv)) dest = 'cdDBL';
            else if (/R1->Hm/.test(adv) && !/R1B->Hm/.test(adv)) dest = 3;
            else if (/R1->3rd/.test(adv)) dest = 2;
            else if (/R1B->Hm/.test(adv)) { const br = this.effBR(occ[0]); dest = brGE(br, 'B') ? 3 : (br === 'C' ? 'cdDBL' : 2); }
            else dest = 2;
            moves.push([0, dest]);
          }
        }
      }
      moves.push(['B', 1]);
    } else {
      // singles
      if (desc === 'inf' || (kind === 'SN' && /^(1B|2B|SS|3B)$/.test(fld))) {
        infDesc = this.infSingle(fld, occ, twoOut, moves);
      } else if (adv === 'ONE') {
        for (let i = 2; i >= 0; i--) if (occ[i]) moves.push([i, i + 1]);
      } else if (ofAdv === 'ARMSGL') {
        for (let i = 2; i >= 0; i--) if (occ[i]) { const br = this.effBR(occ[i]); moves.push([i, i === 2 ? 3 : (brGE(br, 'B') ? i + 2 : i + 1)]); }
      } else if (ofAdv === 'Z' || ofAdv === 'norm') {
        if (occ[2]) moves.push([2, 3]);
        if (occ[1]) moves.push([1, 3]);
        if (occ[0]) {
          const br = this.effBR(occ[0]);
          if (ofAdv === 'Z' && brGE(br, 'A')) { this.say(`OF CK (Z): ${this.name(occ[0].cid)} (B/R ${br}) scores from 1st!`); moves.push([0, 3]); }
          else moves.push([0, this.coachDecision(0, 2, fld === 'RF' ? C.cd.ofck1to3RF : C.cd.ofck1to3LC, fld, cur)]);
        }
      } else {
        this.singleAdvance(adv, occ, fld, twoOut, moves, cur);
      }
      moves.push(['B', 0]);
    }
    // error check on hits (auto advances first, then the error)
    let errExtra = 0;
    if (o.errCheck) {
      const e = this.errorCheck('HIT', fld);
      if (e) { errExtra = o.twoBase ? 2 : 1; }
    }
    const res = this.applyMoves(moves, cur, { rbi: true, errExtra, batterRunner: makeRunner(bcid, this), unearnedOnErr: errExtra > 0 });
    bl.AB++; bl.H++; pl.H++; this.hits[this.half]++;
    const hitType = outAt2 ? 'SN' : (kind === 'TP' ? 'TP' : bases === 2 ? 'DB' : 'SN');
    if (hitType === 'DB') bl.D++; if (hitType === 'TP') bl.T++;
    this.fatigueAdj(-1); this.inningStats.hbb++;
    const hn = { SN: 'singles', DB: 'doubles', TP: 'triples' }[hitType];
    let txt = `${this.name(bcid)} ${hn}${o.dn && hitType === kind ? ' ' + o.dn : ''} to ${posName(fld)}`;
    if (infDesc) txt = `${this.name(bcid)} infield single — ${infDesc}`;
    if (outAt2) txt = `${this.name(bcid)} singles to ${posName(fld)} but is thrown out trying to stretch it`;
    if (cur.sglToDbl) txt += ' (gets past the outfielder)';
    if (cur.dblToSgl) txt += ' (cut off quickly by the outfielder)';
    if (errExtra) txt += ` — ${errExtra === 2 ? 'two-base ' : ''}error on the ${fld}`;
    txt += res.text;
    cur.desc = txt; cur.result = hitType; cur.hit = true;
    this.say(txt, 'res');
    return cur;
  }
  effBR(r) {
    const c = this.card(r.cid); let br = c && c.BR ? c.BR : 'C';
    const st = this.off.style || 'N';
    if (r.isBatter) return br;
    if (st === 'A') br = brStep(br, 1); else if (st === 'C') br = brStep(br, -1);
    return br;
  }

  singleAdvance(adv, occ, fld, twoOut, moves, cur) {
    if (occ[2]) moves.push([2, 3]);
    if (adv === 'HR_2BASE') { if (occ[1]) moves.push([1, 3]); if (occ[0]) moves.push([0, 2]); return; }
    if (adv === 'HR_LF') {
      if (occ[1]) moves.push([1, 3]);
      if (occ[0]) { const br = this.effBR(occ[0]); const need = { 'A+': 2, A: 4, B: 6 }[br]; const rr = this.d10(); moves.push([0, need != null && rr >= need ? 2 : 1]); }
      return;
    }
    const parts = adv.split(';').map(s => s.trim()).filter(Boolean);
    let r2c = null, r1c = null;
    for (const p of parts) { if (p.startsWith('R2')) r2c = p; if (p.startsWith('R1')) r1c = p; }
    const pick = (code) => {
      const m = code.match(/^R\d([A-C][+-]?)?(?:\(([A-C][+-]?)\))?->([A-Za-z0-9]+)(?:\(([A-C][+-]?)?([A-Za-z0-9]+)\))?$/);
      if (!m) return { dest: '2nd' };
      const [, req1, req2, d1, req3, d2] = m;
      if (!twoOut) return { req: req1, dest: d1 };
      if (req2) return { req: req2, dest: d1 };
      if (d2) return { req: req3, dest: d2 };
      return { req: req1, dest: d1 };
    };
    let r2dest = 3;
    if (occ[1]) {
      if (r2c) {
        const p = pick(r2c);
        if (p.dest === 'Hm') r2dest = 3;
        else if (p.dest === 'cd') r2dest = this.coachDecision(1, 3, fld === 'CF' ? C.cd.sgl2HmCF : C.cd.sgl2HmCorner, fld, cur);
        else if (p.dest === '3rd') r2dest = 2;
      }
      moves.push([1, r2dest]);
    }
    if (occ[0]) {
      let dest = 1;
      if (r1c) {
        const p = pick(r1c);
        const br = this.effBR(occ[0]);
        if (p.dest === '3rd') dest = (!p.req || brGE(br, p.req)) ? 2 : 1;
        else if (p.dest === 'Hm') dest = 3;
        else if (p.dest === 'OFCK') dest = this.coachDecision(0, 2, fld === 'RF' ? C.cd.ofck1to3RF : C.cd.ofck1to3LC, fld, cur);
      }
      if (dest === 2 && occ[1] && r2dest === 2) dest = 1;
      moves.push([0, dest]);
    }
  }

  infSingle(fld, occ, twoOut, moves) {
    const g = this.d.g; const letter = (C.infSingle[fld] || C.infSingle.SS)[g];
    const [txt, code] = C.infDesc[letter];
    if (code === '**') {
      for (let i = 2; i >= 0; i--) if (occ[i]) { const br = this.effBR(occ[i]); moves.push([i, br === 'C-' ? i + 1 : Math.min(3, i + 2)]); }
    } else if ((code === '*+' || code === '***') && twoOut) {
      if (occ[2]) moves.push([2, 3]);
      if (occ[1]) { const br = this.effBR(occ[1]); let dst = 2; if (brGE(br, 'A')) dst = 3; else { const r = this.d10(); if (r >= C.sgHome[br]) dst = 3; } moves.push([1, dst]); }
      if (occ[0]) { const br = this.effBR(occ[0]); moves.push([0, code === '***' && brGE(br, 'B') && !(occ[1] && moves.find(m => m[0] === 1 && m[1] === 2)) ? 2 : 1]); }
    } else {
      // one base: forced runners advance, others too
      for (let i = 2; i >= 0; i--) if (occ[i]) moves.push([i, i + 1]);
    }
    return `${letter}: ${txt}`;
  }

  // ---------- OF CK ----------
  ofck(kind, fld, forRunner) {
    const g = this.d10(), r = this.d10(); const v = g * 10 + r;
    const row = C.ofck.find(e => v >= e[0] && v <= e[1]);
    const of = this.fr(fld);
    let q, adv, result;
    if (kind === 'SN') { q = row[2]; adv = row[3]; }
    else { q = row[4]; adv = row[5]; }
    if (q === 'MP') result = kind === 'SN' ? 'SGL' : 'DBL';
    else if (q === 'Arm') {
      const rr = this.d10(); const a = C.ofckArm[of.arm] || C.ofckArm.C;
      result = rr >= a[0] ? 'DBL' : (rr >= a[1] ? 'SGL' : 'OUT2');
      const st = this.off.style;
      if (st === 'A' && result === 'SGL') result = 'OUT2';
      if (st === 'C' && result !== 'SGL') result = 'SGL';
      this.ch = TB.ofck(v, kind, of.arm, rr);
      this.say(`OF CK (${v}): ${kind === 'SN' ? 'SNG' : 'DBL'} Arm — ${fld} arm ${of.arm}, red die ${rr} → ${result === 'OUT2' ? 'batter out at 2nd' : result}`);
      return { result: result === 'SGL' && kind === 'SN' ? 'ARMSGL' : result, adv };
    } else {
      if (kind === 'SN') result = of.F < q ? 'SGL' : 'DBL';
      else result = of.F < q ? 'SGL' : 'DBL';
    }
    this.ch = TB.ofck(v, kind);
    this.say(`OF CK (${v}): ${kind === 'SN' ? 'SNG' : 'DBL'} ${q === 'MP' ? 'MP' : '< ' + q} (${adv}) — ${fld} ${this.name(of.cid)} F${of.F} → ${result === 'SGL' ? 'single' : 'double'}`);
    return { result, adv };
  }

  // ---------- coach's decisions ----------
  coachDecision(fromIdx, toIdx, chart, fld, cur, opts) {
    // returns destination index (0..3) or 'out'
    opts = opts || {};
    const r = this.bases[fromIdx]; if (!r) return fromIdx;
    const br = this.effBR(r);
    let armL = fld === 'C' ? 'C' : (this.fr(fld).arm || 'C');
    if (!['A', 'B', 'C', 'D'].includes(armL)) armL = armL === 'E' ? 'D' : 'C';
    const ai = 'ABCD'.indexOf(armL);
    const row = chart[br] || chart.C;
    const need = row[ai];
    const hold = Math.min(toIdx - 1, 3);
    this.ch = TB.cd(chart, br, armL);
    if (need == null) { this.say(`Coach's decision: ${this.name(r.cid)} (B/R ${br}) vs ${fld} arm ${armL} — no advance`); return hold; }
    if (need === 'Adv') { this.say(`Coach's decision: ${this.name(r.cid)} (B/R ${br}) vs ${fld} arm ${armL} — automatic advance`); return toIdx; }
    const pSafe = (10 - need) / 10;
    const send = this.decideSend(pSafe, toIdx, cur, opts);
    if (!send) { this.say(`Coach's decision: ${this.name(r.cid)} (B/R ${br}) vs ${fld} arm ${armL} needs ${need}-9 — holds`); return hold; }
    const rd = this.d10();
    const safe = rd >= need;
    this.say(`Coach's decision: send ${this.name(r.cid)} (B/R ${br}) vs ${fld} arm ${armL}: needs ${need}-9, red die ${rd} → ${safe ? 'SAFE' : 'OUT'}`, safe ? '' : 'warn');
    if (toIdx === 3) this.pendingPlate = { rd };
    return safe ? toIdx : 'out';
  }
  decideSend(pSafe, toIdx, cur, opts) {
    const T = this.off;
    const st = T.style || 'N';
    if (st === 'A') return true;
    // manual override hook
    if (T.sendPolicy === 'always') return true; if (T.sendPolicy === 'never') return false;
    const outs = this.outs; const diff = this.score[this.half] - this.score[1 - this.half];
    let thr = toIdx === 3 ? (outs === 2 ? 0.45 : outs === 1 ? 0.6 : 0.72) : (outs === 0 ? 0.62 : outs === 1 ? 0.7 : 0.85);
    if (this.inning >= 8 && diff < 0 && diff >= -2 && toIdx === 3) thr -= 0.1;
    if (diff >= 4) thr += 0.1;
    if (st === 'C') thr += 0.15;
    return pSafe >= thr;
  }

  // ---------- move application ----------
  applyMoves(moves, cur, o) {
    // moves: [from (0..2 | 'B'), to (0..3 | 'out' | 'cdDBL')]
    o = o || {};
    const occ = this.bases.slice();
    const nb = [null, null, null];
    const texts = [];
    let batterBase = null;
    const errExtra = o.errExtra || 0;
    const ordered = moves.slice().sort((a, b) => (b[0] === 'B' ? -1 : b[0]) - (a[0] === 'B' ? -1 : a[0]));
    const outsBefore = this.outs;
    let runs = [];
    for (let [from, to] of ordered) {
      const r = from === 'B' ? o.batterRunner : occ[from];
      if (!r) continue;
      if (to === 'cdDBL') {
        to = this.coachDecision(from, 3, this.outs === 2 ? C.cd.dbl1Hm2 : C.cd.dbl1Hm01, 'CF', cur);
      }
      if (to === 'out') {
        if (this.outs >= 3) continue;
        this.outRecorded(1, cur); if (from !== 'B') this.fatigueAdj(1);
        texts.push(`${this.name(r.cid)} out at ${BASEN[from === 'B' ? 0 : Math.min(3, from + 1)]}`);
        continue;
      }
      if (typeof to === 'number' && errExtra) to = Math.min(3, to + errExtra);
      if (o.unearnedOnErr && from === 'B') r.unearned = true;
      // avoid collisions: if target occupied in nb, step back (never behind own base); else push forward
      const minB = from === 'B' ? 0 : from;
      let t2 = to; while (t2 < 3 && t2 >= minB && nb[t2]) t2--;
      if (t2 < minB) { t2 = to; while (t2 < 3 && nb[t2]) t2++; }
      to = t2;
      if (to === 3) { runs.push(r); }
      else if (to >= 0) nb[to] = r;
      if (from === 'B') batterBase = to;
    }
    // runs score unless third out on force/batter (simplified: if outs reached 3 and o.forceOut, no runs)
    let scoredTxt = [];
    for (const r of runs) {
      if (this.outs >= 3 && o.noRunsOn3rdOut) continue;
      this.scoreRun(r, o.rbi && !o.noRbi, cur);
      scoredTxt.push(this.name(r.cid));
      cur.runs = (cur.runs || 0) + 1;
    }
    this.bases = nb;
    // trailing runners on throw home
    if (this.pendingPlate) { this.pendingPlate = null; }
    let text = '';
    if (scoredTxt.length) text += `. ${scoredTxt.join(', ')} scor${scoredTxt.length > 1 ? 'e' : 'es'}`;
    if (texts.length) text += `. ${texts.join('; ')}`;
    return { batterBase, text, runs: runs.length };
  }

  // ---------- walks / K / HBP / HR ----------
  doWalk(cur, ibb) {
    cur.ball = { t: 'bb' };
    const T = this.off, bl = T.bat[cur.batter], pl = this.def.pit[this.def.pitcher];
    if (this.hitRun && !ibb) {
      const bd = this.d6();
      if (bd <= 2) { this.say(`Hit & run on a walk: black die ${bd} → special situations out`); this.hitRun = false; return this.specialOut(cur); }
    }
    bl.BB++; pl.BB++;
    this.forceAdvance(cur, true);
    this.fatigueAdj(ibb ? 0 : -1); if (!ibb) this.inningStats.hbb++;
    cur.desc = `${this.name(cur.batter)} ${ibb ? 'intentionally walked' : 'walks'}` + (cur.runs ? ` — run forced in` : '');
    cur.result = 'BB';
    this.say(cur.desc, 'res');
    return cur;
  }
  doHBP(cur) {
    cur.ball = { t: 'hbp' };
    const T = this.off, bl = T.bat[cur.batter], pl = this.def.pit[this.def.pitcher];
    bl.HBP++; pl.HBP++;
    this.forceAdvance(cur, true);
    this.fatigueAdj(-1); this.inningStats.hbb++;
    cur.desc = `${this.name(cur.batter)} hit by pitch` + (cur.runs ? ' — run forced in' : '');
    cur.result = 'HBP';
    this.say(cur.desc, 'res');
    return cur;
  }
  forceAdvance(cur, rbi) {
    const b = this.bases; const batter = makeRunner(cur.batter, this);
    if (b[0] && b[1] && b[2]) { this.scoreRun(b[2], rbi, cur); cur.runs = (cur.runs || 0) + 1; this.bases = [batter, b[0], b[1]]; return; }
    if (b[0] && b[1]) { this.bases = [batter, b[0], b[1]]; return; }
    if (b[0]) { this.bases = [batter, b[0], b[2]]; return; }
    this.bases = [batter, b[1], b[2]];
  }
  doStrikeout(cur) {
    cur.ball = { t: 'k' };
    const T = this.off, bl = T.bat[cur.batter], pl = this.def.pit[this.def.pitcher];
    if (this.hitRun) {
      const bd = this.d6();
      if (bd === 1) { this.say(`Hit & run: black die 1 → strikeout becomes a ground ball single`); const f = this.hr.bats === 'R' ? 'RF' : 'LF'; return this.hitPlay('SN', f, 'gb', 'HR_' + (f === 'LF' ? 'LF' : '2BASE'), cur, { dn: 'on the ground' }); }
    }
    bl.AB++; bl.SO++; pl.SO++;
    this.outRecorded(1, cur);
    const looking = this.d && this.d.r >= 7;
    cur.desc = `${this.name(cur.batter)} strikes out${looking ? ' looking' : ' swinging'}`;
    cur.result = 'K';
    this.say(cur.desc, 'res');
    if (this.hitRun && this.outs < 3) { this.say('Hit & run: runner going on the strikeout — steal attempt with SB/R −2.5'); this.stealAttempt(this.bases[1] && !this.bases[2] ? 2 : 1, cur, -2.5); }
    return cur;
  }
  doHomeRun(cur, fld) {
    cur.ball = { t: 'hr', fld, hit: 'HR' };
    if (this.hitRun && this.bases.some(Boolean)) {
      const bd = this.d6();
      if (bd <= 3) { this.say(`Hit & run: black die ${bd} → home run becomes ground ball single`); const f = this.hr.bats === 'R' ? 'RF' : 'LF'; return this.hitPlay('SN', f, 'gb', f === 'LF' ? 'HR_LF' : 'HR_2BASE', cur, { dn: 'on the ground' }); }
    }
    const T = this.off, bl = T.bat[cur.batter], pl = this.def.pit[this.def.pitcher];
    const runners = this.bases.filter(Boolean);
    for (const r of [this.bases[2], this.bases[1], this.bases[0]]) if (r) { this.scoreRun(r, true, cur); cur.runs = (cur.runs || 0) + 1; }
    const br = makeRunner(cur.batter, this);
    this.bases = [null, null, null];
    this.scoreRun(br, true, cur); cur.runs = (cur.runs || 0) + 1;
    bl.AB++; bl.H++; bl.HR++; pl.H++; pl.HR++; this.hits[this.half]++;
    this.fatigueAdj(-1); this.inningStats.hbb += 2;
    const n = runners.length;
    cur.desc = `${this.name(cur.batter)} ${n === 3 ? 'GRAND SLAM' : 'HOME RUN'} to ${posName(fld)}${n && n < 3 ? ` (${n + 1} runs)` : ''}`;
    cur.result = 'HR'; cur.hit = true;
    this.say(cur.desc, 'res hr');
    return cur;
  }

  // ---------- deep fly ----------
  windEffect(fld) {
    const w = this.weather; if (!w || w.roof || !w.dir) return 0;
    const v = w.speed; let e = v >= 25 ? 5 : v >= 20 ? 4 : v >= 15 ? 3 : v >= 10 ? 2 : v >= 5 ? 1 : 0;
    const half = Math.floor(e / 2);
    const dir = w.dir;
    const m = { LF: 0, CF: 0, RF: 0 };
    if (dir === 1) m.LF = e; if (dir === 2) { m.CF = e; m.LF = half; m.RF = half; } if (dir === 3) m.RF = e;
    if (dir === 5) m.LF = -e; if (dir === 6) { m.CF = -e; m.LF = -half; m.RF = -half; } if (dir === 7) m.RF = -e;
    if (dir === 4) { m.LF = -half; m.RF = half; } if (dir === 8) { m.LF = half; m.RF = -half; }
    return m[fld] + (this.windBoost ? (this.windBoost[fld] || 0) : 0);
  }
  deepFly(n, cur, isDFH) {
    const fd = this.fielderDie();
    const chart = C.flies['DF' + n];
    const { text } = this.chartEntry(chart, fd.rd);
    const fld = text.split(' ')[0];
    const adv = text.split(' ').slice(1).join(' ');
    this.ch = TB.field(this, 'DF' + n, chart, fd.rd);
    this.say(`DF${n} — fielder die ${fd.rd} (${this.sitCat()}): ${text}`);
    return this.dfCheck(n, fld, adv, cur, isDFH, fd);
  }
  dfCheck(n, fld, adv, cur, isDFH, fd, fromRange) {
    const pHR = this.hr.bcol === 'L' ? this.pc.HRL : this.pc.HRR;
    const park = this.park ? this.park['hr' + fld[0]] : 0;
    const wind = this.windEffect(fld);
    let tot = pHR + (park || 0) + wind;
    const key = Math.max(-10, Math.min(10, tot));
    const need = C.dfck[key];
    const rd = this.d10();
    let hr = false, detail = '';
    if (need === 'HR') hr = true;
    else if (need === 'NoHR') hr = false;
    else {
      const v = parseInt(need); const r = need.endsWith('r');
      if (rd > v) hr = true;
      else if (rd === v) { if (r) { const rr = this.d10(); hr = rr >= 5; detail = ` (exact — reroll ${rr})`; } else hr = true; }
    }
    this.ch = TB.df(tot);
    this.say(`Deep fly to ${fld}: pitcher HR ${fmtS(pHR)} + park ${fmtS(park || 0)} + wind ${fmtS(wind)} = ${tot} → need ${need}; red die ${rd}${detail} → ${hr ? 'HOME RUN' : 'no home run'}`);
    if (hr) return this.doHomeRun(cur, fld);
    if (fromRange) return this.hitPlay('DB', fld, 'otw', '', cur, { dn: 'off the wall' });
    return this.flyOut('DF', fld, adv, cur, fd);
  }

  // ---------- outs ----------
  outResult(tok, cur, opts) {
    opts = opts || {};
    let m = tok.match(/^([A-Z]{2})(\d)$/);
    if (!m) { if (tok === 'K') return this.doStrikeout(cur); this.say('?? ' + tok); m = [0, 'NF', '2']; }
    const kind = m[1], n = +m[2];
    if (kind === 'DF') return this.deepFly(n, cur, false);
    if (['HG', 'RG', 'SG'].includes(kind)) return this.groundBall(kind, n, cur, opts);
    if (['LF', 'NF', 'SF'].includes(kind)) {
      const fd = opts.rd != null ? { rd: opts.rd } : this.fielderDie();
      const { text } = this.chartEntry(C.flies[kind + n], fd.rd);
      const fld = text.split(' ')[0]; const adv = text.split(' ').slice(1).join(' ');
      this.ch = TB.field(this, kind + n, C.flies[kind + n], fd.rd);
      this.say(`${kind}${n} — fielder die ${fd.rd} (${this.sitCat()}): ${text}`);
      return this.flyOut(kind, fld, adv, cur, fd, opts);
    }
    if (['PU', 'FP', 'LO'].includes(kind)) return this.popLine(kind, n, cur, opts);
    return this.flyOut('NF', 'CF', '', cur, {});
  }

  errorCheck(type, fld, rating) {
    const d = this.d; const WB = d.w * 10 + d.b; const gd = d.g;
    const tbl = C.err[type];
    let req = -1;
    for (const [e, wb, g] of tbl) { if (WB > wb || (WB === wb && gd >= g)) { req = Math.max(req, e); } }
    if (req < 0) req = -1;
    const fr = rating != null ? { E: rating } : this.fr(fld);
    const err = fr.E < req;
    this.ch = TB.err(type, req);
    this.say(`Error check (${type}, dice ${WB}(${gd})): ${fld} needs E ≥ ${req}, has ${fr.E} → ${err ? 'ERROR' : 'clean'}`, err ? 'err' : '');
    if (err) { this.errors[1 - this.half]++; const cid = fld === 'P' ? this.def.pitcher : this.fielderAt(fld); const bl = this.def.bat[cid]; if (bl) bl.E++; }
    return err;
  }

  flyOut(kind, fld, adv, cur, fd, opts) {
    opts = opts || {};
    cur.ball = { t: 'fly', fld, depth: kind };
    const T = this.off, bl = T.bat[cur.batter], pl = this.def.pit[this.def.pitcher];
    const errCheck = this.d && this.d.r === 0 && !opts.noErr;
    if (errCheck && this.errorCheck('FB', fld)) {
      return this.flyError(kind, fld, cur, fd && fd.twoBase);
    }
    bl.AB++;
    this.outRecorded(1, cur);
    const kn = { DF: 'deep fly', LF: 'long fly', NF: 'fly ball', SF: 'short fly' }[kind];
    let txt = `${this.name(cur.batter)} ${kind === 'SF' ? 'pops a short fly' : 'flies out'} to ${posName(fld)} (${kn})`;
    // hit and run: double plays
    if (this.hitRun && this.bases[0] && this.outs < 3) {
      const bd = this.d6(); const arm = this.fr(fld).arm;
      let dp = false;
      if (kind === 'NF' && fld === 'RF') dp = bd <= ({ A: 3, B: 2 }[arm] || 1);
      if (kind === 'NF' && fld === 'CF') dp = (arm === 'A' || arm === 'B') && bd === 1;
      if (kind === 'SF' && fld === 'RF') dp = true;
      if (kind === 'SF' && fld === 'CF') dp = bd <= ({ A: 4, B: 2 }[arm] || 1);
      if (dp) {
        const r = this.bases[0]; this.bases[0] = null; this.outRecorded(1, cur); this.fatigueAdj(1);
        txt += `; ${this.name(r.cid)} doubled off 1st on the hit & run`;
      }
    }
    if (this.outs < 3 && adv && kind !== 'SF') {
      const res = this.flyAdvance(kind, fld, adv, cur);
      if (res.sf) { bl.AB--; bl.SF++; }
      txt += res.text;
    }
    cur.desc = txt; cur.result = 'F' + kind;
    this.say(txt, 'res');
    return cur;
  }
  flyAdvance(kind, fld, adv, cur) {
    const parts = adv.split(';').map(s => s.trim()).filter(Boolean);
    const occ = this.bases.slice();
    const moves = [];
    let sf = false, cdRunner = null, cdRD = null;
    const texts = [];
    for (const p of parts) {
      const m = p.match(/^R(\d)([A-C][+-]?)?->(Hm|cd|3rd|2nd)$/); if (!m) continue;
      const i = +m[1] - 1; const r = occ[i]; if (!r) continue;
      const br = this.effBR(r);
      if (m[2] && !brGE(br, m[2])) continue;
      if (m[3] === 'Hm') moves.push([i, 3]);
      else if (m[3] === '3rd') moves.push([i, 2]);
      else if (m[3] === '2nd') moves.push([i, 1]);
      else if (m[3] === 'cd') {
        // only lead runner gets CD; others tag only if base open
        const target = i + 1;
        if (target < 3 && occ[target] && !moves.find(x => x[0] === target)) continue;
        const dest = this.coachDecision(i, target, C.cd.fb, fld, cur);
        if (dest !== i) { cdRunner = i; }
        moves.push([i, dest]);
      }
    }
    // back runner advance on CD plays
    if (cdRunner != null) {
      const sit = this.sitKey(); const ft = kind === 'DF' ? 'DF' : kind === 'LF' ? 'LF' : 'NF';
      const row = C.backFB.find(r => r[0] === ft && r[1] === sit && r[2] === fld);
      if (row) {
        const rd = this.d10();
        if (rd % 2 === 0) {
          for (let k = 3; k < row.length; k += 2) {
            const ri = row[k] - 1; const r = occ[ri];
            if (r && brGE(this.effBR(r), row[k + 1]) && !moves.find(x => x[0] === ri)) { moves.push([ri, ri + 1]); }
          }
        }
      }
    }
    if (!moves.length) return { text: '' };
    const before = this.score[this.half];
    const res = this.applyMoves(moves, cur, { rbi: true });
    if (this.score[this.half] > before) sf = true;
    // describe tags
    return { text: res.text + (moves.some(m => m[1] !== 3 && m[1] !== 'out') ? ' (runner tags up)' : ''), sf };
  }
  flyError(kind, fld, cur, two) {
    const T = this.off, bl = T.bat[cur.batter];
    bl.AB++;
    const twoOut = this.outs === 2;
    const occ = this.bases.slice();
    const moves = [];
    let bTo = 0, adv = 1;
    if (kind === 'DF') adv = 2;
    else if (kind === 'LF') adv = twoOut ? 2 : 1;
    else adv = twoOut ? 2 : 1;
    if (two) adv++;
    for (let i = 2; i >= 0; i--) if (occ[i]) moves.push([i, Math.min(3, i + adv)]);
    const bbr = this.effBR({ cid: cur.batter });
    bTo = kind === 'DF' ? 1 : (kind === 'LF' && twoOut ? 1 : 0);
    if (brGE(bbr, 'A') && kind !== 'DF') bTo = Math.max(bTo, 1);
    if (kind === 'DF' && brGE(bbr, 'A') && !twoOut) bTo = 2;
    moves.push(['B', bTo]);
    const res = this.applyMoves(moves, cur, { rbi: false, batterRunner: makeRunner(cur.batter, this, { unearned: true }) });
    cur.desc = `${this.name(cur.batter)} reaches on a dropped fly ball — E${POSNUM[fld]}` + res.text;
    cur.result = 'E'; this.fatigueAdj(-1);
    this.say(cur.desc, 'res err');
    return cur;
  }

  popLine(kind, n, cur, opts) {
    const fd = opts.rd != null ? { rd: opts.rd } : this.fielderDie();
    const { text } = this.chartEntry(C.gb[kind + n], fd.rd);
    const fld = text.replace(/\*/g, '');
    cur.ball = { t: kind === 'LO' ? 'line' : 'pop', fld, depth: kind };
    const T = this.off, bl = T.bat[cur.batter];
    const errCheck = this.d && this.d.r === 0 && !opts.noErr && (kind !== 'LO' || this.d.b % 2 === 0);
    this.ch = TB.field(this, kind + n, C.gb[kind + n], fd.rd);
    this.say(`${kind}${n} — fielder die ${fd.rd}: ${fld}`);
    // infield in hit check on line outs
    if (kind === 'LO' && this.def.infieldIn && ['1B', '2B', '3B', 'SS'].includes(fld) && this.d.b >= 5) {
      this.say(`Infield in: line drive gets past drawn-in ${fld} (black die ${this.d.b}) → single`);
      return this.hitPlay('SN', fld === '3B' || fld === 'SS' ? 'LF' : 'RF', 'hd', '', cur, { dn: '' });
    }
    if (errCheck && this.errorCheck('POP', fld)) {
      bl.AB++;
      const moves = []; for (let i = 2; i >= 0; i--) if (this.bases[i]) moves.push([i, i + 1]);
      moves.push(['B', 0]);
      const res = this.applyMoves(moves, cur, { batterRunner: makeRunner(cur.batter, this, { unearned: true }) });
      cur.desc = `${this.name(cur.batter)} safe on error by ${fld}` + res.text; cur.result = 'E';
      this.say(cur.desc, 'res err'); return cur;
    }
    bl.AB++;
    this.outRecorded(1, cur);
    let txt = `${this.name(cur.batter)} ${kind === 'PU' ? 'pops up' : kind === 'FP' ? 'fouls out' : 'lines out'} to ${posName(fld)}`;
    if (kind === 'LO' && this.outs < 3 && this.bases.some(Boolean)) {
      // line out DP check
      const sit = this.sitKey();
      let dpRunner = null;
      if (this.hitRun) { const lead = [2, 1, 0].find(i => this.bases[i]); dpRunner = lead; }
      else {
        const tbl = C.loDP[fld === 'C' ? '1B' : fld]; const e = tbl && tbl[sit];
        const bd = this.d.b;
        if (e) {
          const runnersIdx = sit.split('').map(x => +x - 1);
          if (sit.length === 1) { if (inR(bd, e[0], e[1])) dpRunner = runnersIdx[0]; }
          else {
            const ri = sit === '123' ? [0, 1] : runnersIdx;
            if (e[0] && inR(bd, e[0][0], e[0][1])) dpRunner = ri[0];
            else if (e[1] && inR(bd, e[1][0], e[1][1])) dpRunner = ri[1];
          }
        }
        this.ch = TB.loDP(fld, sit);
        this.say(`Line out DP check (black die ${bd}, ${fld}, runners ${sit}): ${dpRunner != null ? 'runner on ' + BASEN[dpRunner] + ' doubled off' : 'no double play'}`);
      }
      if (dpRunner != null) {
        const r = this.bases[dpRunner]; this.bases[dpRunner] = null;
        this.outRecorded(1, cur); this.fatigueAdj(1 - 0.33);
        txt += ` — DOUBLE PLAY, ${this.name(r.cid)} doubled off ${BASEN[dpRunner]}`;
        bl.GDP++;
      }
    }
    cur.desc = txt; cur.result = kind;
    this.say(txt, 'res');
    return cur;
  }

  // ---------- ground balls ----------
  groundBall(kind, n, cur, opts) {
    opts = opts || {};
    const fd = opts.rd != null ? { rd: opts.rd, twoBase: false } : this.fielderDie();
    const { text } = this.chartEntry(C.gb['GB' + n], fd.rd);
    const star = (text.match(/\*+/) || [''])[0];
    let fld = opts.field || text.replace(/\*/g, '');
    cur.ball = { t: 'gb', fld, depth: kind };
    const T = this.off, bl = T.bat[cur.batter];
    const kname = { HG: 'hard grounder', RG: 'grounder', SG: 'slow roller' }[kind];
    this.ch = TB.field(this, 'GB' + n, C.gb['GB' + n], fd.rd);
    this.say(`${kind}${n} (GB${n}) — fielder die ${fd.rd} (${this.sitCat()}): ${text}`);
    const iin = this.def.infieldIn;
    // guarding lines
    if (this.def.guardLines && kind === 'HG' && (fld === '3B' || fld === '1B')) {
      const r = this.d10();
      if (r >= 6) { this.say(`Guarding the lines: red die ${r} → grounder gets through`); return this.hitPlay('SN', fld === '3B' ? 'LF' : 'RF', 'gb', '', cur, { dn: 'on the ground' }); }
    }
    // infield-in hit check for HG
    if (iin && kind === 'HG' && this.d.b >= 4) {
      this.say(`Infield in hit check: black die ${this.d.b} (4-6) → hard grounder gets through the drawn-in infield`);
      return this.hitPlay('SN', fld === '3B' || fld === 'SS' ? 'LF' : (fld === '2B' ? 'CF' : 'RF'), 'gb', '', cur, { dn: 'past the drawn-in infield' });
    }
    // error check
    if (this.d && this.d.r === 0 && !opts.noErr && this.errorCheck('GB', fld)) {
      return this.gbError(kind, fld, cur, fd.twoBase);
    }
    const occ = this.bases.slice();
    const sit = this.sitKey();
    const outs = this.outs;
    const moves = [];
    let dp = false, extraOuts = 0, txt = `${this.name(cur.batter)} ${kind === 'SG' ? 'hits a slow roller' : kind === 'HG' ? 'smashes a hard grounder' : 'grounds'} to ${posName(fld)}`;
    let batterOut = true, noRbi = false;
    const pivot = (fld === '3B' || fld === 'SS') ? '2B' : 'SS';
    const dpCheck = (table) => {
      const bbr = this.effBRraw(cur.batter);
      const row = table[bbr];
      if (this.hitRun) { if (kind === 'HG' && (fld === 'SS' || fld === '2B') && this.d6() >= 5) return true; return false; }
      this.ch = TB.dp(kind, bbr, fld);
      if (row === 'DP') { this.say(`DP check: batter B/R ${bbr} → double play`); return true; }
      const v = row[fld === 'P' ? 'SS' : fld];
      if (v === 'DP') { this.say(`DP check: batter B/R ${bbr} vs ${fld} → double play`); return true; }
      if (v == null) { this.say(`DP check: batter B/R ${bbr} vs ${fld} → no double play`); return false; }
      const unassisted = (fld === '2B' || fld === 'SS') && this.d.b === 1 && this.d.w % 2 === 0;
      const dpr = unassisted ? 0 : (this.fr(pivot).DP || 0);
      const adj = this.d.g + dpr;
      const ok = adj >= -1 && adj <= v;
      this.say(`DP check (${kind}): green die ${this.d.g}${dpr ? ' ' + fmtS(dpr) + ' pivot ' + pivot : ''} = ${adj} vs batter B/R ${bbr} @ ${fld} (≤ ${v}) → ${ok ? 'DOUBLE PLAY' : 'no DP, batter safe at 1st'}`);
      return ok;
    };
    if (sit === '') {
      // bases empty: batter out
    } else if (sit === '1') {
      if (kind === 'SG') {
        const br1 = this.effBR(occ[0]);
        const need = (fld === '3B' || fld === '1B') ? 'B' : 'A';
        if (brGE(br1, need)) { moves.push([0, 1]); txt += `; ${this.name(occ[0].cid)} to 2nd`; }
        else {
          moves.push([0, 'out']);
          const bbr = this.effBRraw(cur.batter);
          const bd = this.d.b; const lim = (fld === '3B' || fld === '1B') ? 2 : 4;
          if (bbr === 'C-' && bd <= lim && outs < 2) { dp = true; }
          else { batterOut = false; }
          txt += `; force at 2nd`;
        }
      } else if (outs < 2) {
        moves.push([0, 'out']);
        if (dpCheck(kind === 'HG' ? C.dpHG : C.dpRG)) dp = true; else batterOut = false;
        if (this.hitRun) { moves.length = 0; moves.push([0, 1]); batterOut = !dp; if (dp) { moves.length = 0; moves.push([0, 'out']); batterOut = true; } }
      }
    } else {
      // scoring position situations
      const r3 = occ[2], r2 = occ[1], r1 = occ[0];
      if (kind === 'HG' || kind === 'RG') {
        if (!iin) {
          if (r3) moves.push([2, 3]);
          if (r2) {
            let hold = false;
            if (!r1 && (sit === '2' || sit === '23')) {
              if (kind === 'HG' && (fld === '3B' || fld === 'SS')) hold = true;
              if (kind === 'RG' && fld === '3B') hold = true;
              if (kind === 'RG' && fld === 'SS') { const bd = this.d.b; const okd = this.hr.bats === 'L' ? bd <= 4 : bd >= 5; hold = !okd; }
              if (kind === 'HG' && sit === '2' && this.effBR(r2) === 'C-') hold = true;
            }
            moves.push([1, hold ? 1 : 2]);
          }
          // R3 must attempt on ball to 3B (sits 3 or 23, <2 outs)
          if (r3 && !r1 && (sit === '3' || sit === '23') && fld === '3B' && outs < 2) {
            const rd = this.d10() - (kind === 'HG' ? 3 : 0);
            const safe = rd >= C.sgHome[this.effBR(r3)];
            this.say(`R3 must try to score on grounder to 3B: SG Home CD red die ${rd + (kind === 'HG' ? 3 : 0)}${kind === 'HG' ? '−3' : ''} → ${safe ? 'safe' : 'out at home'}`);
            const i = moves.findIndex(m => m[0] === 2); moves[i] = [2, safe ? 3 : 'out'];
            if (!safe) batterOut = false;
          }
          if (r1) {
            moves.push([0, 'out']);
            if (outs < 2) { if (dpCheck(kind === 'HG' ? C.dpHG : C.dpRG)) dp = true; else batterOut = false; }
            if (this.hitRun) { const i = moves.findIndex(m => m[0] === 0); moves[i] = [0, 1]; batterOut = true; dp = false; }
          }
        } else {
          // infield in
          if (sit === '123') {
            moves.push([2, 'out'], [1, 2], [0, 1]);
            const bbr = this.effBRraw(cur.batter);
            const safe = kind === 'HG' ? (brGE(bbr, 'B') && this.d.b >= 5) : brGE(bbr, 'B');
            if (safe) batterOut = false; else dp = true;
            txt += '; force at home (infield in)';
          } else {
            if (r3 && cur.dec && cur.dec.contact) {
              const rd = this.d10() - (kind === 'HG' ? 3 : 0);
              const safe = rd >= C.sgHome[this.effBR(r3)];
              this.say(`Runner on 3rd going on contact: red die → ${safe ? 'scores' : 'out at home'}`);
              moves.push([2, safe ? 3 : 'out']); if (!safe) batterOut = false;
            } else if (r3) moves.push([2, 2]);
            if (r2) moves.push([1, r1 ? 2 : 1]);
            if (r1) moves.push([0, 1]);
            txt += ' (infield in, runners hold)';
          }
        }
      } else {
        // slow grounder
        if (r3) {
          if (!iin) {
            moves.push([2, 3]); if (r2) moves.push([1, 2]); if (r1) moves.push([0, 1]);
            if ((sit === '3' || sit === '23') && fld === '3B' && outs < 2) {
              const raw = this.d10(); const rd = raw + 3; const safe = rd >= C.sgHome[this.effBR(r3)];
              this.say(`R3 must try to score on slow roller to 3B: red die ${raw}+3 → ${safe ? 'safe' : 'out at home'}`);
              moves[0] = [2, safe ? 3 : 'out']; if (!safe) batterOut = false;
            }
          } else {
            const br3 = this.effBR(r3);
            const contact = cur.dec && cur.dec.contact;
            let send = contact || this.decideSend((10 - C.sgHome[br3]) / 10, 3, cur);
            if (contact && brGE(br3, 'B')) { moves.push([2, 3]); if (r2) moves.push([1, 2]); if (r1) moves.push([0, 1]); }
            else if (send) {
              const raw = this.d10(); const rd = raw + (contact ? 5 : 0); const safe = rd >= C.sgHome[br3];
              this.say(`Coach's decision: R3 tries to score on slow roller vs drawn-in infield: red die ${raw}${contact ? '+5' : ''} → ${safe ? 'safe' : 'out at home'}`);
              moves.push([2, safe ? 3 : 'out']); if (r2) moves.push([1, 2]); if (r1) moves.push([0, 1]);
              batterOut = false;
            } else { moves.push([2, 2]); if (r2) moves.push([1, 1]); if (r1) moves.push([0, r2 ? 0 : 1]); }
          }
        } else {
          if (r2) moves.push([1, 2]);
          if (r1) { if (brGE(this.effBR(r1), 'B')) moves.push([0, 1]); else { moves.push([0, 'out']); batterOut = false; } }
        }
      }
    }
    // batter
    if (dp) {
      moves.push(['B', 'out']); bl.GDP++;
    } else if (batterOut) moves.push(['B', 'out']);
    else moves.push(['B', 0]);
    // execute: outs first then runs (runs don't score if 3rd out is force/batter)
    const before = this.outs;
    const outsMade = moves.filter(m => m[1] === 'out').length;
    bl.AB++;
    const willEnd = before + outsMade >= 3;
    const res = this.applyMoves(moves, cur, { rbi: !dp, noRunsOn3rdOut: willEnd, batterRunner: makeRunner(cur.batter, this) });
    if (dp) { txt += ' — DOUBLE PLAY'; this.fatigueAdj(-0.33); }
    else if (!batterOut) txt += `; ${this.name(cur.batter)} safe at 1st on fielder's choice`;
    cur.desc = txt + res.text; cur.result = kind; cur.dp = dp;
    this.say(cur.desc, 'res');
    return cur;
  }
  effBRraw(cid) { const c = this.card(cid); return c && c.BR ? c.BR : 'C'; }
  gbError(kind, fld, cur, two) {
    const T = this.off, bl = T.bat[cur.batter];
    bl.AB++;
    const adv = two ? 2 : 1;
    const moves = [];
    for (let i = 2; i >= 0; i--) if (this.bases[i]) moves.push([i, Math.min(3, i + adv)]);
    moves.push(['B', two ? 1 : 0]);
    const rr = this.d10();
    const desc = errDesc(fld, rr);
    const res = this.applyMoves(moves, cur, { rbi: false, batterRunner: makeRunner(cur.batter, this, { unearned: true }) });
    cur.desc = `${this.name(cur.batter)} reaches on ${two ? 'a two-base ' : 'an '}error by ${fld} — ${desc}` + res.text; cur.result = 'E';
    this.fatigueAdj(-1);
    this.say(cur.desc, 'res err');
    return cur;
  }

  // ---------- range checks ----------
  rangeReq(GR, F, bpType) {
    const [req, bp] = C.range[GR];
    if (this.opts.bpEffects && bp != null && bpType && this.park) {
      let v = bp; if (this.opts.bpFielder) v += C.bpFieldAdj[F] || 0;
      v = Math.max(-4, Math.min(4, v));
      const cell = this.park.bp[bpType][String(v)];
      return { bp: v, cell, req };
    }
    if (req === 'MP') return { made: true, req };
    if (req === 'DNMP') return { made: false, req };
    return { made: F < req, req };
  }
  bpOutcome(cell) {
    if (!cell) return 'OUT';
    let c = cell.replace(/\*/g, '');
    const m = c.match(/^\(0-4\)(\w+)\(5-9\)(\w+)$/);
    if (m) { const r = this.d10(); return r <= 4 ? 'HIT' : 'OUT'; }
    return c === 'OUT' ? 'OUT' : 'HIT';
  }
  rangeHit(tok, cur) {
    // pitcher die 'R' on a red result
    let kind, n, flavor = null, m;
    if ((m = tok.match(/^DFH(\d)$/))) {
      const fd = this.fielderDie(); const { text } = this.chartEntry(C.flies['DF' + m[1]], fd.rd); const fld = text.split(' ')[0];
      const f = this.fr(fld); const GR = this.d.g * 10 + this.d.r; const rq = this.rangeReq(GR, this.iinF(fld, f.F), null);
      this.ch = TB.range(GR, rq, null);
      this.say(`Range check on deep drive to ${fld}: dice ${GR} → ${rq.req === 'MP' || rq.req === 'DNMP' ? rq.req : '<' + rq.req}, ${this.name(f.cid)} F${f.F} → ${rq.made ? 'MAKES THE PLAY' : 'no play'}`);
      if (rq.made) return this.rangeMadeHit('DFH', fld, cur);
      return this.dfCheck(+m[1], fld, '', cur, true, fd, true);
    }
    if (tok === 'SN-inf') { kind = 'SN'; n = 'inf'; }
    else if ((m = tok.match(/^SN(\d)(-gb)?$/))) { kind = 'SN'; n = +m[1]; flavor = m[2] ? 'gb' : null; }
    else if ((m = tok.match(/^(DB|TP)(\d)$/))) { kind = m[1]; n = +m[2]; }
    else return this.batterHit(tok, cur);
    // fielder by green die
    let g = this.d.g; if (g === 0) g = 1 + this.rnd(9);
    const chart = n === 'inf' ? C.hits.SNinf : C.hits[kind + n];
    const { text } = this.chartEntry(chart, g);
    const parts = text.split(' '); let fld = parts[0]; const desc = n === 'inf' ? 'inf' : (flavor || parts[1] || '');
    let checkF = fld, htype;
    if (kind === 'SN') {
      if (n === 'inf') htype = 'SN (inf)';
      else if (flavor === 'gb') { const pw = this.bc[this.hr.pcol].pow; checkF = C.gbSingleFielder[fld][this.hr.bats][pw]; htype = 'SN (gb)'; }
      else htype = 'SN (fb)';
    } else if (kind === 'DB') {
      if (desc === 'dtl') { checkF = fld === 'LF' ? '3B' : '1B'; htype = 'DB (dtl)'; }
      else if (desc === 'otw' || desc === 'btw') htype = 'DB (otw)'; else htype = 'DB (itg)';
    } else htype = 'TP';
    const f = this.fr(checkF);
    const GR = this.d.g * 10 + this.d.r;
    const bpType = kind === 'SN' ? 'S' : kind === 'DB' ? 'D' : 'T';
    const rq = this.rangeReq(GR, this.iinF(checkF, f.F), bpType);
    let made;
    this.ch = TB.range(GR, rq, this.park);
    if (rq.cell !== undefined) { const o = this.bpOutcome(rq.cell); made = o === 'OUT'; this.say(`Range check (R) on ${tok} — ${htype} to ${fld}, checking ${checkF} ${this.name(f.cid)}: dice ${GR} → BP # ${rq.bp} (fielder F${f.F} adj) → ballpark ${rq.cell} → ${made ? 'PLAY MADE' : 'hit'}`); }
    else { made = rq.made; this.say(`Range check (R) on ${tok} — ${htype} to ${fld}, checking ${checkF} ${this.name(f.cid)} F${f.F}: dice ${GR} → ${typeof rq.req === 'number' ? '< ' + rq.req : rq.req} → ${made ? 'PLAY MADE' : 'hit stands'}`); }
    if (!made) return this.executeHit(kind, n, flavor, cur, { rd: g, noErr: true });
    return this.rangeMadeHit(htype, checkF, cur, fld);
  }
  iinF(pos, F) { if (this.def.infieldIn && ['1B', '2B', '3B', 'SS'].includes(pos)) return F >= 4 ? 9 : F + 1; return F; }
  rangeMadeHit(htype, fld, cur, field) {
    cur.ball = { t: /gb|inf|dtl/.test(htype) ? 'gb' : (htype === 'SN (fb)' ? 'line' : 'fly'), fld, depth: htype === 'DFH' ? 'DF' : 'LF', robbed: true };
    const bd = this.d.b; const T = this.off, bl = T.bat[cur.batter];
    const occ = this.bases.slice(); const moves = []; let txt = '';
    const twoOut = this.outs === 2;
    bl.AB++;
    const r3Scores = () => { if (occ[2] && this.outs < 2) moves.push([2, 3]); };
    let batterOut = true, extraOut = null;
    switch (htype) {
      case 'SN (inf)':
        txt = `${posName(fld)} makes a bare-handed pickup and perfect throw to get ${this.name(cur.batter)}`;
        for (let i = 2; i >= 0; i--) if (occ[i]) moves.push([i, i + 1]);
        break;
      case 'SN (gb)':
        if (bd <= 3 || (bd <= 5 && (fld === '2B' || fld === 'SS'))) {
          txt = bd <= 3 ? `${posName(fld)} makes a diving stop, gets up and throws` : `${posName(fld)} ranges deep into the hole, perfect off-balance throw`;
          if (occ[0]) { txt += ' — force at 2nd'; moves.push([0, 'out']); batterOut = false; for (let i = 2; i >= 1; i--) if (occ[i]) moves.push([i, (occ[i - 1] || i === 1) ? i + 1 : i]); }
          else txt += ` out ${this.name(cur.batter)}`;
        } else if (bd <= 5) { txt = `${posName(fld)} backhands a wicked one-hopper and gets the out at first`; for (let i = 2; i >= 0; i--) if (occ[i] && (i === 0 || (occ[0] && (i === 1 || occ[1])))) moves.push([i, i + 1]); }
        else {
          txt = `perfect positioning — ${posName(fld)} fields it for the out`;
          if (occ[0] && this.outs < 2) { moves.push([0, 'out']); txt += ' — DOUBLE PLAY'; bl.GDP++; }
          for (let i = 2; i >= 1; i--) if (occ[i] && occ[0]) moves.push([i, i + 1]);
        }
        break;
      case 'SN (fb)':
        if (bd <= 3) { txt = `${posName(fld)} makes a ${bd <= 2 ? 'sliding' : 'diving'} catch to rob ${this.name(cur.batter)}`; r3Scores(); }
        else if (bd <= 5) { txt = `perfect positioning — ${posName(fld)} catches the liner`; this.bases = occ; }
        else txt = `${posName(fld)} makes a sprinting grab of the blooper`;
        break;
      case 'DB (dtl)':
        if (bd <= 5) { txt = `${posName(fld)} dives to stop the hard grounder down the line, throws out the runner`; if (occ[0]) moves.push([0, 1]); if (occ[0] && occ[1]) moves.push([1, 2]); if (occ[0] && occ[1] && occ[2]) moves.push([2, 3]); }
        else txt = `${posName(fld)} makes a diving grab of the line drive`;
        break;
      case 'DB (otw)':
        txt = bd <= 5 ? `${posName(fld)} makes a sprinting grab of the drive ticketed for the wall` : `${posName(fld)} makes a leaping grab at the wall`;
        r3Scores(); if (bd === 6 && fld === 'RF' && occ[1] && brGE(this.effBR(occ[1]), 'B') && this.outs < 2) moves.push([1, 2]);
        break;
      case 'DB (itg)': case 'TP':
        txt = bd <= 5 ? `${posName(fld)} sprints into the alley for a going-away grab` : `${posName(fld)} makes a ${htype === 'TP' ? 'leaping grab at the fence in the gap' : 'sprinting, diving grab in the gap'}`;
        r3Scores(); if (htype === 'TP' && bd === 6 && occ[1] && brGE(this.effBR(occ[1]), 'B') && this.outs < 2) moves.push([1, 2]);
        break;
      case 'DFH':
        txt = bd <= 2 ? `${posName(fld)} leaps at the wall and ROBS ${this.name(cur.batter)} of a home run!` : `${posName(fld)} crashes into the fence to make the catch`;
        r3Scores(); if (bd <= 2 && fld === 'RF' && occ[1] && this.outs < 2) moves.push([1, 2]);
        break;
    }
    if (batterOut) moves.push(['B', 'out']); else moves.push(['B', 0]);
    // outs first
    const outsN = moves.filter(m => m[1] === 'out').length;
    const willEnd = this.outs + outsN >= 3;
    const res = this.applyMoves(moves, cur, { rbi: true, noRunsOn3rdOut: willEnd, batterRunner: makeRunner(cur.batter, this) });
    cur.desc = `${this.name(cur.batter)}: ${txt}` + res.text; cur.result = 'RNG';
    this.say(cur.desc, 'res');
    return cur;
  }
  rangeOut(kind, n, cur) {
    // blue RNG- result: fielder from out chart
    const fd = this.fielderDie();
    let fld, chartKind;
    if (['HG', 'RG', 'SG'].includes(kind)) { const { text } = this.chartEntry(C.gb['GB' + n], fd.rd); fld = text.replace(/\*/g, ''); chartKind = 'GB'; }
    else { const { text } = this.chartEntry(C.flies[kind + n] || C.flies.NF1, fd.rd); fld = text.split(' ')[0]; chartKind = 'FB'; }
    const f = this.fr(fld); const GR = this.d.g * 10 + this.d.r;
    const bpType = kind === 'LF' ? 'D' : 'S';
    const rq = this.rangeReq(GR, this.iinF(fld, f.F), bpType);
    let made;
    this.ch = TB.range(GR, rq, this.park);
    if (rq.cell !== undefined) { made = this.bpOutcome(rq.cell) === 'OUT'; this.say(`RNG-${kind}${n}: range check on ${fld} ${this.name(f.cid)} — dice ${GR} → BP # ${rq.bp} → ballpark ${rq.cell} → ${made ? 'out' : 'HIT'}`); }
    else { made = rq.made; this.say(`RNG-${kind}${n}: range check on ${fld} ${this.name(f.cid)} F${f.F} — dice ${GR} → ${typeof rq.req === 'number' ? '< ' + rq.req : rq.req} → ${made ? 'play made' : 'NOT MADE — hit'}`); }
    if (made) return this.outResult(kind + n, cur, { rd: fd.rd, field: fld });
    const bd = this.d.b; const twoOut = this.outs === 2;
    if (kind === 'LF') {
      if (bd <= 3) return this.hitPlay('DB', fld, fld === 'LF' ? 'otw' : 'itg', fld === 'LF' ? '' : 'R1->Hm', cur, { dn: fld === 'LF' ? 'off the wall' : 'into the gap' });
      if (bd === 4) {
        const br = this.effBRraw(cur.batter); const g = this.d.g; const tc = C.tripleCheck[br];
        if (tc && inR(g, tc[0], tc[1])) return this.hitPlay('TP', fld, '', '', cur, { dn: '' });
        return this.hitPlay('DB', fld, 'itg', '', cur, { dn: 'into the gap' });
      }
      const pw = this.bc[this.hr.pcol].pow; const hc = C.hrCheck[pw];
      if (inR(this.d.g, hc[0], hc[1])) return this.doHomeRun(cur, fld);
      return this.hitPlay('DB', fld, 'otw', '', cur, { dn: 'off the wall' });
    }
    if (kind === 'NF') return this.hitPlay('SN', fld, 'fb', twoOut ? 'HR_2BASE' : 'ONE', cur, { dn: '' });
    if (kind === 'HG' || kind === 'RG') {
      let of = fld === '3B' ? 'LF' : fld === '1B' ? 'RF' : C.gbSingleOF[fld] ? C.gbSingleOF[fld][this.hr.bats][bd <= 4 ? 0 : 1] : 'CF';
      return this.hitPlay('SN', of, 'gb', twoOut ? 'HR_2BASE' : 'ONE', cur, { dn: 'through the infield' });
    }
    if (kind === 'SG') return this.hitPlay('SN', fld, 'inf', 'ONE', cur, { dn: 'infield' });
    return this.hitPlay('SN', fld, '', 'ONE', cur, {});
  }

  // ---------- rare plays, WP/PB ----------
  rarePlay(cur, fromCard) {
    if (fromCard && this.bases.some(Boolean)) {
      const pw = this.pc.WP; const rd = this.d.r; const adj = rd + pw;
      const cf = this.fr('C'); const lim = C.pbwp[cf.F] || 7;
      const wp = adj >= -7 && adj <= lim;
      this.say(`RP/+WP with runners on: red die ${rd} ${fmtS(pw)} (pitcher WP) = ${adj} vs catcher F${cf.F} (−7 to ${fmtS(lim)}) → ${wp ? 'WILD PITCH / PASSED BALL' : 'no wild pitch'}`);
      if (wp) {
        const isWP = this.d.g <= 7;
        const pl = this.def.pit[this.def.pitcher]; if (isWP) pl.WP++;
        const moves = []; for (let i = 2; i >= 0; i--) if (this.bases[i]) moves.push([i, i + 1]);
        if (this.hitRun) { const lead = [2, 1, 0].find(i => this.bases[i]); const br = this.effBR(this.bases[lead]); const need = { 'A+': 0, A: 2, B: 5, C: 6 }[br]; if (need != null && this.d10() >= need) { const i = moves.findIndex(m => m[0] === lead); moves[i] = [lead, Math.min(3, lead + 2)]; } }
        const res = this.applyMoves(moves, cur, { rbi: false });
        this.say(`${isWP ? 'Wild pitch' : 'Passed ball'}!${res.text}`, 'res');
        cur.wp = isWP ? 'WP' : 'PB';
        if (this.over || this.walkoff) return cur;
      }
    }
    const wb = this.wb();
    const r = lookupRange(C.rare, wb) || 'HG-P';
    this.ch = TB.rare(wb);
    this.say(`Rare Play chart: roll ${wb} → ${r}`);
    switch (r) {
      case 'WILD': return this.opts.wildPlays ? this.wildPlay(cur) : this.pitcherField('RG', cur);
      case 'SF-LF': case 'SF-CF': case 'SF-RF': return this.flyOut('SF', r.slice(3), '', cur, {}, { noErr: true });
      case 'HG-P-E': return this.pitcherField('HG', cur, true);
      case 'HG-P': return this.pitcherField('HG', cur);
      case 'RG-P': return this.pitcherField('RG', cur);
      case 'SG-P-E': return this.pitcherField('SG', cur, true);
      case 'SG-P': return this.pitcherField('SG', cur);
      case 'LO-P': { const bl = this.off.bat[cur.batter]; bl.AB++; this.outRecorded(1, cur); cur.desc = `${this.name(cur.batter)} lines out to the pitcher`; cur.result = 'LO'; this.say(cur.desc, 'res'); return cur; }
      case 'SG-C': return this.pitcherField('SG', cur, false, 'C');
      case 'PU-C': { const bl = this.off.bat[cur.batter]; bl.AB++; this.outRecorded(1, cur); cur.desc = `${this.name(cur.batter)} pops up to the catcher`; cur.result = 'PU'; this.say(cur.desc, 'res'); return cur; }
      case 'FNF-LF': case 'FNF-RF': {
        const fld = r.slice(4); const bl = this.off.bat[cur.batter]; bl.AB++; this.outRecorded(1, cur);
        let txt = `${this.name(cur.batter)} flies out to ${posName(fld)} in foul territory`;
        if (this.outs < 3 && this.bases[2]) { const res = this.flyAdvance('NF', fld, 'R3->cd', cur); txt += res.text; if (res.sf) { bl.AB--; bl.SF++; } }
        cur.desc = txt; cur.result = 'FNF'; this.say(txt, 'res'); return cur;
      }
    }
    return this.pitcherField('RG', cur);
  }
  relabel(cur, t) { return cur; }
  pitcherField(kind, cur, eCheck, pos) {
    pos = pos || 'P';
    cur.ball = { t: 'gb', fld: pos };
    const T = this.off, bl = T.bat[cur.batter];
    if (eCheck) {
      const pcard = this.pc; const e = this.errorCheck('GB', 'P', pos === 'P' ? pcard.E : this.fr('C').E);
      if (e) return this.gbError(kind, pos, cur, false);
    }
    const sit = this.sitKey(); const occ = this.bases.slice(); const moves = []; let dp = false, batterOut = true;
    const bbr = this.effBRraw(cur.batter);
    if (kind === 'HG') {
      if (sit === '1' || sit === '12' || sit === '123') {
        if (sit === '12') moves.push([1, 2]); if (sit === '123') { moves.push([2, 3], [1, 2]); }
        moves.push([0, 'out']);
        if (this.outs < 2 && bbr !== 'A+') dp = true; else batterOut = this.outs >= 2 ? true : false;
        if (bbr === 'A+') batterOut = false;
      } else if (sit === '13') { moves.push([2, 2], [0, 'out']); if (this.outs < 2) dp = true; }
    } else if (kind === 'RG') {
      if (sit === '1' || sit === '12' || sit === '13') {
        if (sit === '12') moves.push([1, 2]); if (sit === '13') moves.push([2, 2]);
        moves.push([0, 'out']); batterOut = false;
        if (bbr === 'C-' && this.outs < 2) { dp = true; batterOut = true; }
      } else if (sit === '123') { moves.push([2, 'out'], [1, 2], [0, 1]); batterOut = false; }
    } else {
      if (sit === '1') moves.push([0, 1]); else if (sit === '12') moves.push([1, 2], [0, 1]); else if (sit === '13') moves.push([2, 2], [0, 1]);
      else if (sit === '2') moves.push([1, 2]); else if (sit === '123') moves.push([2, 3], [1, 2], [0, 1]);
    }
    moves.push(['B', batterOut ? 'out' : 0]);
    bl.AB++; if (dp) bl.GDP++;
    const outsN = moves.filter(m => m[1] === 'out').length; const willEnd = this.outs + outsN >= 3;
    const res = this.applyMoves(moves, cur, { rbi: !dp, noRunsOn3rdOut: willEnd, batterRunner: makeRunner(cur.batter, this) });
    const kn = { HG: 'hard comebacker', RG: 'grounder', SG: 'slow roller' }[kind];
    cur.desc = `${this.name(cur.batter)} hits a ${kn} to the ${pos === 'P' ? 'pitcher' : 'catcher'}${dp ? ' — DOUBLE PLAY' : ''}` + res.text; cur.result = kind;
    this.say(cur.desc, 'res');
    return cur;
  }

  // ---------- wild plays ----------
  wildPlay(cur) {
    const wb = this.wb(); const sit = this.sitKey(); const outs = this.outs;
    const bl = this.off.bat[cur.batter];
    this.say(`WILD PLAY chart: roll ${wb}`, 'hd');
    const W = G.BSB_WILD;
    const out = W ? W(this, wb, sit, outs, cur) : null;
    if (out) return out;
    return this.pitcherField('RG', cur);
  }

  // ---------- bunts ----------
  doBunt(cur, squeeze) {
    const bc = this.bc || this.batterCard(); const pc = this.pc || this.card(this.def.pitcher);
    this.bc = bc; this.pc = pc; this.hr = this.hands(bc, pc);
    const d = this.roll(); this.d = d; cur.dice = d;
    const WB = d.w * 10 + d.b; const rating = bc[this.hr.pcol].bnt || 'Pr';
    const tbl = (squeeze ? C.squeeze : C.sac)[rating] || C.sac.Pr;
    let r = lookupRange(tbl, WB) || 'SAC';
    const T = this.off, bl = T.bat[cur.batter];
    this.ch = TB.bunt(squeeze, rating, WB);
    this.say(`${squeeze ? 'Suicide squeeze' : 'Sacrifice bunt'} — bunt rating ${rating}: roll ${WB} (red ${d.r}, green ${d.g}) → ${r}`, 'dice');
    const fld = C.buntFielder[d.g]; cur.ball = { t: 'bunt', fld };
    const occ = this.bases.slice(); const lead = [2, 1, 0].find(i => occ[i]);
    const sacAll = () => { const mv = []; for (let i = 2; i >= 0; i--) if (occ[i]) mv.push([i, i + 1]); return mv; };
    let moves = [], txt = '', sac = false, batterOut = true;
    if (r === 'WILD') return this.buntWild(cur);
    if (squeeze) {
      if (r === 'SAC') { moves = sacAll(); sac = true; txt = 'lays down the squeeze bunt'; }
      else if (r === 'MISS') { if (occ[2]) { moves = [[2, 'out']]; } txt = 'misses the bunt — runner caught at the plate'; cur.noAdvanceBatter = true; batterOut = false; moves.push(['B', 'stay']); }
      else if (r === 'HOME') { moves = sacAll(); moves = moves.map(m => m[0] === 2 ? [2, 'out'] : m); batterOut = false; txt = `bunts to ${fld}, play made at the plate`; }
      else if (r === 'K') { cur.noAdvanceBatter = false; bl.AB++; bl.SO++; this.def.pit[this.def.pitcher].SO++; this.outRecorded(1, cur); cur.desc = `${this.name(cur.batter)} fouls off the 3rd strike bunting — strikeout`; cur.result = 'K'; this.say(cur.desc, 'res'); return cur; }
      else { moves = [[2, 'out']]; txt = 'bunts into a double play'; }
    } else {
      if (r === 'SAC') { moves = sacAll(); sac = true; txt = `sacrifices — bunt fielded by ${fld}`; }
      else if (r === 'LEAD' || r === 'FORCE' || r === '3BF' || r === '1BF') {
        let ok = false;
        if (r === 'LEAD') { const br = this.effBR(occ[lead]); const rr = this.d10(); ok = rr >= C.leadBR[br]; this.say(`Lead runner B/R ${br} check: red die ${rr} → ${ok ? 'sacrifice' : 'force at lead base'}`); }
        if (r === '3BF' || r === '1BF') { const f = this.fr(r === '3BF' ? '3B' : '1B'); const rr = this.d10(); ok = rr >= C.buntField[f.F]; this.say(`${r === '3BF' ? '3B' : '1B'} field check F${f.F}: red die ${rr} → ${ok ? 'sacrifice' : 'force out'}`); }
        if (ok) { moves = sacAll(); sac = true; txt = 'sacrifices successfully'; }
        else { moves = sacAll().map(m => m[0] === lead ? [lead, 'out'] : m); batterOut = false; txt = `bunts to ${fld} — lead runner forced out`; }
      } else if (r === 'K') { bl.AB++; bl.SO++; this.def.pit[this.def.pitcher].SO++; this.outRecorded(1, cur); cur.desc = `${this.name(cur.batter)} strikes out trying to bunt`; cur.result = 'K'; this.say(cur.desc, 'res'); return cur; }
      else if (r === 'PDP') {
        const a = this.d10(), b = this.d10(); const gbB = a <= 6;
        if (b <= 6) { moves = sacAll().map(m => m[0] === lead ? [lead, 'out'] : m); txt = 'bunts into a DOUBLE PLAY'; }
        else if (gbB) { moves = sacAll().map(m => m[0] === lead ? [lead, 'out'] : m); batterOut = false; txt = 'bunts — lead runner out'; }
        else { moves = []; txt = 'pops up the bunt'; }
      }
    }
    if (!moves.find(m => m[0] === 'B')) moves.push(['B', batterOut ? 'out' : 0]);
    moves = moves.filter(m => m[1] !== 'stay');
    if (sac) bl.SH++; else if (!cur.noAdvanceBatter) bl.AB++;
    if (d.r === 0 && this.errorCheck(fld === 'C' ? 'POP' : 'GB', fld)) {
      moves = sacAll(); moves.push(['B', 0]); txt += ` — but ${fld} commits an error, everyone safe`;
      if (sac) { bl.SH--; bl.AB++; }
    }
    const outsN = moves.filter(m => m[1] === 'out').length; const willEnd = this.outs + outsN >= 3;
    const res = this.applyMoves(moves, cur, { rbi: squeeze && sac, noRunsOn3rdOut: willEnd, batterRunner: makeRunner(cur.batter, this) });
    cur.desc = `${this.name(cur.batter)} ${txt}` + res.text; cur.result = sac ? 'SH' : 'BUNT';
    this.say(cur.desc, 'res');
    return cur;
  }
  buntWild(cur) {
    const r = this.d10(); const bl = this.off.bat[cur.batter]; const occ = this.bases.slice();
    const sacAll = () => { const mv = []; for (let i = 2; i >= 0; i--) if (occ[i]) mv.push([i, i + 1]); return mv; };
    let moves = [], txt;
    this.say(`Sacrifice Bunt Wild Play: red die ${r}`);
    switch (r) {
      case 0: if (!this.pitcherCell('k', 0)) { bl.AB++; bl.SO++; this.outRecorded(1, cur); cur.desc = `${this.name(cur.batter)} strikes out swinging on the bunt attempt`; this.say(cur.desc, 'res'); return cur; }
        moves = sacAll(); moves.push(['B', 'out']); bl.SH++; txt = 'gets the sacrifice down'; break;
      case 3: bl.AB++; this.outRecorded(1, cur); cur.desc = `${this.name(cur.batter)} collides with the catcher — out for interference; runners return`; this.say(cur.desc, 'res'); return cur;
      case 4: moves = sacAll(); if (this.sitKey() === '2' && brGE(this.effBRraw(cur.batter), 'B')) { moves.push(['B', 1]); txt = 'bunts down the 3rd base line and it stays fair — bunt double!'; bl.AB++; bl.H++; bl.D++; this.def.pit[this.def.pitcher].H++; this.hits[this.half]++; } else { moves.push(['B', 'out']); bl.SH++; txt = 'sacrifices'; } break;
      case 5: if (!this.pitcherCell('bb', 0)) return this.doWalk(cur); moves = sacAll(); moves.push(['B', 'out']); bl.SH++; txt = 'sacrifices'; break;
      case 7: return this.doHBP(cur);
      case 8: { const br = this.effBRraw(cur.batter); let safe = brGE(br, 'A') || (br === 'B' && this.d10() <= 4); moves = sacAll(); moves.push(['B', safe ? 0 : 'out']); if (safe) { bl.AB++; bl.H++; this.def.pit[this.def.pitcher].H++; this.hits[this.half]++; txt = 'pops the bunt over the mound — beats the throw for a bunt single!'; } else { bl.SH++; txt = 'pops the bunt behind the mound — out at first, runners advance'; } break; }
      default: moves = sacAll(); moves.push(['B', 'out']); bl.SH++; txt = 'sacrifices'; break;
    }
    const res = this.applyMoves(moves, cur, { rbi: false, batterRunner: makeRunner(cur.batter, this) });
    cur.desc = `${this.name(cur.batter)} ${txt}` + res.text; this.say(cur.desc, 'res'); return cur;
  }

  // ======================================================
  //  STOLEN BASES
  // ======================================================
  stealEvent(fromIdx, opts) {
    opts = opts || {};
    const cur = this.cur = { type: 'SB', inning: this.inning, half: this.half, lines: [], outsBefore: this.outs, sitBefore: this.sitKey(), scoreBefore: this.score.slice(), runs: 0, batter: this.batterCid(), pitcher: this.def.pitcher };
    this.pc = this.card(this.def.pitcher);
    this.stealAttempt(fromIdx, cur, 0, opts);
    cur.noAdvanceBatter = true;
    this.finishPlay(cur);
    return cur;
  }
  stealAttempt(fromIdx, cur, sbrAdj, opts) {
    opts = opts || {};
    const r = this.bases[fromIdx]; if (!r) return;
    const rc = this.card(r.cid); const pc = this.card(this.def.pitcher);
    const toIdx = fromIdx + 1;
    // jump (unless auto-steal already granted)
    if (!opts.skipJump && !opts.fromHR && sbrAdj === 0) {
      const sbf = (rc.SBF || 0) + (pc.SBF || 0);
      const tbl = toIdx === 2 ? C.jump3 : C.jump2;
      const key = Math.max(-3, Math.min(6, sbf));
      const lim = tbl[key];
      const wb = this.wb();
      const ok = lim != null && wb <= lim;
      this.ch = TB.jump(toIdx, sbf);
      this.say(`Check for jump: SBF ${fmtS(rc.SBF)} + pitcher ${fmtS(pc.SBF)} = ${sbf}; roll ${wb} ${lim ? '(needs 11-' + lim + ')' : '(holds)'} → ${ok ? 'gets the jump' : 'no jump — runner holds'}`);
      if (!ok) { cur.desc = `${this.name(r.cid)} can't get a jump and holds`; cur.nojump = true; return; }
    }
    const arm = C.catcherArm[this.fr('C').arm] != null ? C.catcherArm[this.fr('C').arm] : 0;
    let tot = (rc.SBR || 0) + ((pc.SBR || 0) + arm) / 2 + (sbrAdj || 0);
    tot = Math.max(-5, Math.min(3, Math.round(tot * 2) / 2));
    const d = { w: this.d6(), b: this.d6(), r: this.d10() };
    let wb = d.w * 10 + d.b;
    let wbAdj = wb;
    if (toIdx === 2 && wb >= 22) wbAdj = wb - 2;
    const rl = this.off.bat[r.cid]; const pl = this.def.pit[this.def.pitcher];
    const cline = `Steal of ${BASEN[toIdx]}: SB/R ${fmtS(rc.SBR)} + (pitcher ${fmtS(pc.SBR)} + catcher arm ${fmtS(arm)})/2${sbrAdj ? ' ' + sbrAdj : ''} = ${tot}; roll ${wb}${wbAdj !== wb ? '−2=' + wbAdj : ''}`;
    if (wb <= 12 || (wb === 13 && (pc.PO === 'Ex' || pc.PO === 'Pr'))) {
      const po = C.pickoff[pc.PO] || C.pickoff.Fr;
      let pick = wb === 13 ? pc.PO === 'Ex' : d.r <= po[0];
      if (wb === 13 && pc.PO === 'Pr') pick = false;
      if (pick) {
        this.bases[fromIdx] = null; this.outRecorded(1, cur); this.fatigueAdj(1); rl.CS++;
        cur.desc = `${this.name(r.cid)} picked off ${BASEN[fromIdx]}!`; this.say(cline + ` → Balk/PO chart (${pc.PO}, red ${d.r}) → PICKOFF`, 'res'); return;
      }
      // balk
      const mv = []; for (let i = 2; i >= 0; i--) if (this.bases[i]) mv.push([i, i + 1]);
      const res = this.applyMoves(mv, cur, { rbi: false }); pl.BK++;
      cur.desc = `Balk! Runners advance` + res.text; this.say(cline + ` → BALK` + res.text, 'res'); return;
    }
    let safe;
    if (wb <= 15) {
      safe = true;
      const cE = this.fr('C').E;
      if (cE === 0) { this.bases[toIdx] = r; this.bases[fromIdx] = null; this.say(cline + ' → SB + E2 (catcher E 0)'); }
    } else {
      const lim = C.sbModern[String(tot)] != null ? C.sbModern[String(tot)] : 16;
      safe = wbAdj <= lim;
    }
    const nb = this.bases;
    nb[fromIdx] = null;
    if (safe) {
      if (toIdx === 3) { this.scoreRun(r, false, cur); cur.runs++; } else nb[toIdx] = r;
      rl.SB++;
      // catcher error check
      if (d.r === 0) {
        const v = this.d10() * 10 + this.d10(); const cE = this.fr('C').E; const req = (C.errSTL.find(e => v >= e[1]) || [0])[0];
        if (cE < req) { this.errors[1 - this.half]++; const nt = toIdx + 1; if (nt === 3) { nb[toIdx] = null; this.scoreRun(r, false, cur); cur.runs++; } else { nb[toIdx] = null; nb[nt] = r; } this.say('Throwing error by the catcher! Runner takes another base', 'err'); }
      }
      cur.desc = `${this.name(r.cid)} steals ${BASEN[toIdx]}`;
    } else {
      this.outRecorded(1, cur); this.fatigueAdj(1); rl.CS++;
      cur.desc = `${this.name(r.cid)} caught stealing ${BASEN[toIdx]}`;
    }
    this.ch = TB.sb(tot, wbAdj);
    this.say(`${cline} (safe 16-${C.sbModern[String(tot)] || 16}) → ${safe ? 'SAFE' : 'CAUGHT STEALING'}`, 'res');
  }

  // ======================================================
  //  SUBSTITUTIONS
  // ======================================================
  changePitcher(side, cid, why) {
    const T = this.teams[side];
    const old = T.pitcher;
    T.pitcher = cid; T.used.add(cid); T.pen = T.pen.filter(x => x !== cid);
    T.pit[cid] = T.pit[cid] || newPitLine(cid); T.pitOrder.push(cid);
    T.fatigue[cid] = this.startFatigue(this.card(cid), false, T.relFatigue ? T.relFatigue[cid] : undefined);
    T.spIn = false;
    // save candidate
    const lead = this.score[side] - this.score[1 - side];
    T.saveCand = (lead > 0 && lead <= 3 && this.inning >= 7) ? cid : (T.saveCand === old ? null : T.saveCand);
    const msg = `Pitching change (${T.abbr}): ${this.name(cid)} replaces ${this.name(old)}${why ? ' — ' + why : ''}`;
    this.log.push({ type: 'SUB', lines: [['sub', msg]], inning: this.inning, half: this.half, desc: msg });
    return msg;
  }
  substitute(side, outCid, inCid, pos, kind) {
    const T = this.teams[side];
    const slot = T.lineup.findIndex(x => x.cid === outCid);
    if (slot < 0) return;
    const p = pos || T.lineup[slot].pos;
    T.lineup[slot] = { cid: inCid, pos: p };
    T.bench = T.bench.filter(x => x !== inCid); T.used.add(inCid);
    T.bat[inCid] = T.bat[inCid] || newBatLine(inCid, p); T.bat[inCid].order = slot; T.bat[inCid].sub = true;
    // runner replacement
    for (let i = 0; i < 3; i++) if (this.bases[i] && this.bases[i].cid === outCid) this.bases[i] = Object.assign({}, this.bases[i], { cid: inCid });
    const msg = `${kind || 'Substitution'} (${T.abbr}): ${this.name(inCid)} for ${this.name(outCid)}${p ? ', plays ' + p : ''}`;
    this.log.push({ type: 'SUB', lines: [['sub', msg]], inning: this.inning, half: this.half, desc: msg });
    return msg;
  }
}


// ---------- chart tables for the board-game view ----------
const RG = (lo, hi) => lo === hi ? String(lo) : lo + '-' + hi;
const tb = (title, cols, rows, hr, hc, note) => ({ k: 't', title, cols, rows, hr, hc, note });
const SITN = { E: 'bases empty', R1: 'runner on 1st', SP: 'scoring position' };
const TB = {
  field(g, name, chart, rd) {
    const cat = g.sitCat(); const rows = chart[cat] || chart.E;
    const hr = rows.findIndex(r => rd >= r[0] && rd <= r[1]);
    return tb(`${name} — ${SITN[cat]}`, ['Red die', 'Fielder / base advance'], rows.map(r => [RG(r[0], r[1]), typeof r[2] === 'object' ? `RHB: ${r[2].R}  ·  LHB: ${r[2].L}` : r[2]]), hr, null, 'Tri-Fold fielder chart');
  },
  pdie(isHBP, p, GR, st) {
    const faces = isHBP ? C.pdieHBP : C.pdie;
    const mean = isHBP ? ['HBP if rating ≥ −3', 'out if rating ≤ −3', 'out if rating ≤ −2', 'out if rating ≤ −1', 'out if rating ≤ 0', 'out if rating ≤ 1', 'out if rating ≤ 2', 'out if rating ≤ 3', 'HBP if rating ≥ −3', 'HBP if rating ≥ −3']
      : ['Range check on the hit', 'Pitcher Hit −3 column', 'Pitcher Hit −2 column', 'Pitcher Hit −1 column', 'Pitcher Hit 0 column', 'Pitcher Hit +1 column', 'Hit 2 column (D/E starter early/late: hit)', 'Hit 3 column (E starter early/late: hit)', 'Special out if starter rated A early/late', 'Special out if starter rated A/B early/late'];
    return tb('Hit check — pitcher die', ['Face', 'Meaning'], faces.map((f, i) => [f, mean[i]]), p, null, `Green+Red ${GR} vs Hit(uth) ${st.hit == null ? '—' : st.hit}${st.spo != null ? ' (' + st.spo + ')' : ''}: no automatic result`);
  },
  lowAvg(chrt, wb) {
    const ci = C.lowAvg.cols.indexOf(chrt); const rows = []; let hr = -1;
    Object.keys(C.lowAvg.rows).forEach(k => { const r = C.lowAvg.rows[k][ci]; if (r) { if (wb >= r[0] && wb <= r[1]) hr = rows.length; rows.push([k, RG(r[0], r[1])]); } });
    return tb(`Low Average Batter Hit Check — rating ${chrt}`, ['Pitcher symbol', 'Dice'], rows, hr, null, `Re-roll white/black: ${wb}`);
  },
  spec(r) { return tb('Special Situations Outs', ['Red die', 'Result'], [['0', 'HG3'], ['1-3', 'RG2'], ['4', 'RG3'], ['5', 'LF2'], ['6-8', 'NF1'], ['9', 'SF3']], [0, 1, 1, 1, 2, 3, 4, 4, 4, 5][r]); },
  sph(pw, wb) { const L = C.sph[pw]; return tb(`Scoring Position Hit chart — ${{ P: 'Power', N: 'Norm', W: 'Weak' }[pw]}`, ['White/black', 'Result'], L.map(e => [RG(e[0], e[1]), e[2]]), L.findIndex(e => wb >= e[0] && wb <= e[1]), null, `Roll ${wb}`); },
  ofck(v, kind, arm, rr) {
    const hr = C.ofck.findIndex(e => v >= e[0] && v <= e[1]);
    const q = (x) => x === 'MP' ? 'MP' : x === 'Arm' ? 'Arm' : '< ' + x;
    const t = tb('OF CK Range Check (green/red)', ['Dice', 'SNG', 'DBL'], C.ofck.map(e => [RG(e[0], e[1]), `${q(e[2])} (${e[3]})`, `${q(e[4])} (${e[5]})`]), hr, kind === 'SN' ? 1 : 2, `Roll ${v}${arm ? ` · Arm ${arm}: red die ${rr} (DBL ≥ ${C.ofckArm[arm] ? C.ofckArm[arm][0] : '?'}, SGL ≥ ${C.ofckArm[arm] ? C.ofckArm[arm][1] : '?'}, else out at 2nd)` : ''}`);
    return t;
  },
  cd(chart, br, armL) {
    const name = Object.keys(C.cd).find(k => C.cd[k] === chart) || 'cd';
    const titles = { sgl2HmCorner: "CD — Single, 2nd to home (LF/RF)", sgl2HmCF: 'CD — Single, 2nd to home (CF)', dbl1Hm01: 'CD — Double, 1st to home (0-1 out)', dbl1Hm2: 'CD — Double, 1st to home (2 out)', fb: 'FB base advance coach’s decision', ofck1to3LC: 'OF CK CD — Single 1st to 3rd (LF/CF)', ofck1to3RF: 'OF CK CD — Single 1st to 3rd (RF)' };
    const cell = (v) => v == null ? 'No adv' : v === 'Adv' ? 'Adv' : v + '-9';
    const brs = Object.keys(chart);
    return tb(titles[name] || 'Coach’s decision', ['B/R', 'Arm A', 'Arm B', 'Arm C', 'Arm D'], brs.map(b => [b].concat(chart[b].map(cell))), brs.indexOf(br), 1 + 'ABCD'.indexOf(armL), 'Red die needed to be safe');
  },
  df(tot) {
    const keys = Object.keys(C.dfck).map(Number).sort((a, b) => b - a); const k = Math.max(-10, Math.min(10, tot));
    return tb('Deep Fly Check (red die)', ['Total', 'HR on'], keys.map(x => [String(x), C.dfck[x] === 'HR' ? 'Always' : C.dfck[x] === 'NoHR' ? 'Never' : C.dfck[x].replace('r', '') + '+' + (C.dfck[x].endsWith('r') ? ' (exact = reroll)' : '')]), keys.indexOf(k), null, 'Pitcher HR rating + park field rating + wind');
  },
  err(type, req) { const L = C.err[type]; return tb(`${type} Error Check (white/black + green)`, ['Fielder needs E', 'Dice ≥'], L.map(e => [String(e[0]), `${e[1]}(${e[2]})`]), L.findIndex(e => e[0] === req), null, ''); },
  dp(kind, bbr, fld) {
    const T = kind === 'HG' ? C.dpHG : C.dpRG; const cols = ['3B', 'SS', '2B', '1B'];
    const cell = (v) => v === 'DP' ? 'DP' : v == null ? 'No DP' : '−1 to ' + (v > 0 ? '+' : '') + v;
    return tb(`${kind === 'HG' ? 'HG' : 'RG'} DP Check (green die + pivot DP)`, ['Batter B/R'].concat(cols), Object.keys(T).map(b => [b].concat(T[b] === 'DP' ? cols.map(() => 'DP') : cols.map(c => cell(T[b][c])))), Object.keys(T).indexOf(bbr), 1 + cols.indexOf(fld === 'P' ? 'SS' : fld), '');
  },
  loDP(fld, sit) {
    const T = C.loDP[fld === 'C' ? '1B' : fld]; const sits = ['1', '2', '3', '12', '13', '23', '123'];
    const cell = (e) => { if (!e) return '—'; if (typeof e[0] === 'number') return RG(e[0], e[1]); return (e[0] ? RG(e[0][0], e[0][1]) : '--') + ' / ' + (e[1] ? RG(e[1][0], e[1][1]) : '--'); };
    return tb(`Line Out Double Play Check — ${fld} (black die)`, ['Runners', 'Black die'], sits.map(x => [x.split('').map(c => ({ 1: '1st', 2: '2nd', 3: '3rd' }[c])).join(' & '), cell(T && T[x])]), sits.indexOf(sit), null, '');
  },
  range(GR, rq, park) {
    const rows = []; let hr = -1; let cur = null;
    for (let i = 99; i >= 0; i--) { const [req, bp] = C.range[i]; const lab = (typeof req === 'number' ? '< ' + req : req) + (bp != null ? ` (BP ${bp > 0 ? '+' : ''}${bp})` : ''); if (cur && cur.lab === lab) cur.lo = i; else { cur = { hi: i, lo: i, lab }; rows.push(cur); } }
    const out = rows.map((r, j) => { if (GR >= r.lo && GR <= r.hi) hr = j; return [RG(r.lo, r.hi), r.lab]; });
    return tb('Range Check (green/red)', ['Dice', 'Fielder needs'], out, hr, null, rq && rq.cell !== undefined ? `Ballpark effect: BP # ${rq.bp} → ${rq.cell}` : `Roll ${GR}`);
  },
  rare(wb) { return tb('Rare Play Chart (white/black)', ['Dice', 'Play'], C.rare.map(e => [RG(e[0], e[1]), e[2].replace('WILD', 'Wild Play chart')]), C.rare.findIndex(e => wb >= e[0] && wb <= e[1]), null, `Roll ${wb}`); },
  jump(toIdx, sbf) { const T = toIdx === 2 ? C.jump3 : C.jump2; const ks = Object.keys(T).map(Number).sort((a, b) => a - b); const k = Math.max(-3, Math.min(6, sbf)); return tb(`Check for Jump — ${toIdx === 2 ? 'third' : 'second'} base`, ['Total SBF', 'Steal on'], ks.map(x => [String(x), T[x] == null ? 'Holds' : '11-' + T[x]]), ks.indexOf(k), null, ''); },
  sb(tot, wb) { const ks = Object.keys(C.sbModern).map(Number).sort((a, b) => a - b); return tb('Stolen Base Attempt (modern seasons)', ['SB/R total', 'Safe steal'], [['any', '11-12 Balk/PO · 13 Psbl Bk/PO · 14-15 SB+Psbl E2']].concat(ks.map(x => [String(x), '16-' + C.sbModern[String(x)]])), 1 + ks.indexOf(tot), null, `Roll ${wb}`); },
  bunt(sq, rating, WB) { const L = (sq ? C.squeeze : C.sac)[rating] || C.sac.Pr; return tb(`${sq ? 'Suicide Squeeze' : 'Sacrifice Bunt Attempt'} — rating ${rating}`, ['Dice', 'Result'], L.map(e => [RG(e[0], e[1]), e[2]]), L.findIndex(e => WB >= e[0] && WB <= e[1]), null, `Roll ${WB}`); },
  fatigue(g, f, r) {
    const L1 = g.fl === 'L1'; const rows = L1 ? [['≤0 and ≥−2', '0'], ['<−2 and ≥−4', '0-2'], ['<−4 and ≥−5', '0-4'], ['<−5 and ≥−6', '0-7'], ['<−6', 'Hit/BB']] : [['≤0 and ≥−1', '0'], ['<−1 and ≥−2', '0-2'], ['<−2 and ≥−3', '0-4'], ['<−3 and ≥−4', '0-7'], ['<−4', 'Hit/BB']];
    const b = L1 ? [-2, -4, -5, -6] : [-1, -2, -3, -4]; let hr = b.findIndex(x => f >= x); if (hr < 0) hr = 4;
    return tb(`Fatigued Pitcher — Level ${L1 ? 1 : 2}`, ['Fatigue', 'Red die lets it through'], rows, hr, null, `Fatigue ${f.toFixed(1)}, red die ${r}`);
  }
};

function errDesc(fld, rr) {
  const D = {
    P: ['drops the ball before making the throw', 'misplays it off his glove', 'misplays it off his glove', 'misplays it off his glove', 'deflects it off his body', 'bad throw pulls the first baseman off the bag', 'bad throw pulls the first baseman off the bag', 'throw gets away from the first baseman', 'throw gets away from the first baseman', "can't get the ball out of his glove"],
    C: ["can't find the handle", "can't find the handle", 'bounces the throw to first', 'bounces the throw to first', 'bounces the throw to first', 'throws wildly to first', 'throws wildly to first', 'throws wildly to first', 'throws wildly to first', 'throws wildly to first'],
    '1B': ['lets it through his legs', 'it goes off his body', 'it goes off his body', 'it goes off his body', 'it goes off his glove into short right', 'it goes off his glove into short right', 'it goes off his glove into short right', 'bad throw to the covering pitcher', 'bad throw to the covering pitcher', 'misses the throw'],
    '2B': ['it goes through his legs', 'it goes off his body', 'it goes off his body', 'it rolls off his glove', 'it rolls off his glove', 'it rolls off his glove', 'it rolls off his glove', 'bad throw to first in the dirt', 'throws wildly past first', "can't find the handle"],
    SS: ['it goes through his legs', 'it goes off his body', 'it rolls off his glove', 'it rolls off his glove', 'it rolls off his glove', 'one-hop throw not dug out', 'one-hop throw not dug out', 'throws wildly over first', 'throws wildly over first', "can't find the handle"],
    '3B': ['it goes through his legs', 'it goes off his body', 'it goes off his body', 'it ricochets into left field', 'it rolls off his glove into foul territory', 'one-hop throw not dug out', 'one-hop throw not dug out', "air-mails the throw over first", "air-mails the throw over first", "can't find the handle"]
  };
  return (D[fld] || D.SS)[rr];
}

function ord(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function fmtS(v) { v = +v; return (v > 0 ? '+' : '') + v; }
function posName(p) { return { P: 'pitcher', C: 'catcher', '1B': 'first', '2B': 'second', '3B': 'third', SS: 'short', LF: 'left', CF: 'center', RF: 'right' }[p] || p; }
function titleName(n) {
  return n.split(' ').map(w => {
    if (/^(II|III|IV|JR\.?|SR\.?)$/.test(w)) return w === 'JR.' ? 'Jr.' : w === 'JR' ? 'Jr.' : w;
    return w.split(/([-'])/).map(p => p.length > 1 ? p[0] + p.slice(1).toLowerCase() : p).join('').replace(/^Mc(\w)/, (m, c) => 'Mc' + c.toUpperCase()).replace(/^De([A-Z])/, 'De$1');
  }).join(' ');
}

G.BSB = { Game, fieldRating, titleName, ord, fmtS, posName, DICE, POSNUM, NUMPOS, BASEN, brGE, mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
