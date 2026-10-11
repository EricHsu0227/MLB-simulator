// AI manager + game setup helpers
(function (G) {
const C = G.BSB_CHARTS, B = G.BSB;

// ---------- weather ----------
function monthKey(dateStr) {
  const m = +dateStr.slice(4, 6);
  if (m <= 5) return 'April/May'; if (m === 6) return 'June'; if (m === 7) return 'July'; if (m === 8) return 'August'; return 'September';
}
function rollWeather(park, dateStr, dn, rng) {
  const r6 = () => 1 + Math.floor(rng() * 6), r10 = () => Math.floor(rng() * 10);
  const key = monthKey(dateStr) + '|' + (dn === 'D' ? 'D' : 'N');
  let e = park.wx[key] || park.wx[monthKey(dateStr) + '|N'] || park.wx[Object.keys(park.wx)[0]];
  const pick = (list) => { const wb = r6() * 10 + r6(); return list.find(x => wb >= x[0] && wb <= x[1]) || list[list.length - 1] || [0, 0, 0, '']; };
  const adj = (base, flag) => { let a = C.wxAdj[r10()]; if (flag.includes('+') && a < 0) a = -a; if (flag.includes('-') && a > 0) a = -a; return base + a; };
  const t = pick(e.t.length ? e.t : [[11, 66, 72, '']]);
  const roof = (t[3] || '').includes('*');
  const temp = roof ? t[2] : adj(t[2], t[3] || '');
  let dir = 0, speed = 0;
  if (!roof) {
    const d = pick(e.d.length ? e.d : [[11, 66, 2, '']]); dir = d[2];
    const v = pick(e.v.length ? e.v : [[11, 66, 5, '']]); speed = Math.max(0, adj(v[2], v[3] || ''));
  }
  return { temp, dir, speed, roof, dn: dn === 'D' ? 'D' : 'N', src: 'rolled' };
}
function realWeather(g, park) {
  const roof = g.sky === 'dome';
  const dir = roof ? 0 : (C.retroWind[g.wd] || 0);
  return { temp: g.temp || 72, dir, speed: roof ? 0 : (g.ws || 0), roof, dn: g.dn === 'd' ? 'D' : 'N', src: 'actual' };
}

// ---------- lineup helpers ----------
const POSORD = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
function defaultLineup(D, code, oppThrows) {
  const T = D.teams[code];
  const lu = (oppThrows === 'L' ? T.luL : T.luR) || T.luR;
  return lu.map(([cid, pos]) => [cid, B.NUMPOS[pos]]);
}
function asPlayedLineup(D, g, side, code) {
  const L = side === 0 ? g.vl : g.hl;
  const T = D.teams[code];
  const out = [];
  const used = new Set();
  for (const [cid, pos] of L.bat) {
    let c = cid;
    const p = B.NUMPOS[pos] || 'DH';
    if (c == null || D.cards[c].t !== 'B' || used.has(c)) {
      // replace with team batter who plays that position
      c = T.bat.find(x => !used.has(x) && !L.bat.some(b => b[0] === x) && (D.cards[x].pos.includes(p) || p === 'DH')) || T.bat.find(x => !used.has(x) && !L.bat.some(b => b[0] === x));
    }
    used.add(c); out.push([c, p === 'P' ? 'DH' : p]);
  }
  return out;
}
function benchFor(D, code, lineup) {
  const ids = new Set(lineup.map(x => x[0]));
  return D.teams[code].bat.filter(c => !ids.has(c));
}

// ---------- pitching staff roles ----------
function staffRoles(D, code, rot) {
  const T = D.teams[code];
  const pen = T.pit.filter(c => !rot.includes(c));
  const cards = D.cards;
  const relievers = pen.filter(c => cards[c].GS <= Math.max(2, cards[c].G * 0.3));
  const closer = relievers.slice().sort((a, b) => cards[b].SV - cards[a].SV || cards[b].G - cards[a].G)[0];
  const setup = relievers.filter(c => c !== closer).sort((a, b) => (cards[b].G - cards[a].G) || (cards[a].ERA - cards[b].ERA)).slice(0, 3);
  const longmen = pen.filter(c => c !== closer && !setup.includes(c)).sort((a, b) => cards[b].IP / Math.max(1, cards[b].G) - cards[a].IP / Math.max(1, cards[a].G));
  return { closer, setup, longmen, all: pen };
}

// ---------- AI decisions ----------
function battingStrength(g, cid, pThrows) {
  const c = g.card(cid); if (!c || c.t !== 'B') return 0.15;
  const s = c[pThrows] || c.R;
  const pw = { P: 0.07, N: 0.03, W: 0 }[s.pow] || 0;
  return (s.avg || 0) + pw;
}
function aiPre(g) {
  // returns decision object for the coming PA (and may perform pitching changes / steals)
  const dec = {};
  const off = g.off, def = g.def;
  const lead = g.score[1 - g.half] - g.score[g.half]; // defense lead
  const inn = g.inning, outs = g.outs, b = g.bases;
  // --- defense: pitching change ---
  if (def.ai) aiPitching(g);
  const pc = g.card(def.pitcher);
  // --- defense: infield in / guard lines / IBB ---
  if (def.ai) {
    def.guardLines = inn >= 8 && Math.abs(lead) <= 1 && lead >= 0;
    if (b[2] && outs < 2 && ((inn >= 7 && lead >= -1 && lead <= 1) || (inn >= 9 && lead <= 2 && lead >= 0))) dec.infieldIn = true;
    if (!b[0] && (b[1] || b[2]) && inn >= 7 && Math.abs(lead) <= 1 && outs < 2) {
      const cur = battingStrength(g, g.batterCid(), pc.th);
      const nxt = off.lineup[(off.bi + 1) % off.lineup.length].cid;
      if (cur >= 0.33 && battingStrength(g, nxt, pc.th) < cur - 0.07) dec.ibb = true;
    }
  }
  if (dec.ibb) return dec;
  // --- offense ---
  if (off.ai) {
    const diff = -lead; // offense lead
    const bc = g.batterCard(); const s = bc[pc.th] || bc.R;
    const over = (inn <= 6 && (diff >= 5 || diff <= -4)) || (inn >= 7 && inn <= 8 && (diff >= 4 || diff <= -3)) || (inn >= 9 && (diff >= 3 || diff <= -2));
    // sacrifice bunt
    if (b[0] && !b[2] && outs === 0 && inn >= 7 && diff >= -1 && diff <= 0 && (s.bnt === 'Ex' || s.bnt === 'Vg') && (s.avg < 0.245 && s.pow !== 'P') && g.rng() < 0.7) { dec.bunt = true; return dec; }
    // squeeze
    if (b[2] && outs === 1 && inn >= 7 && Math.abs(diff) <= 1 && (s.bnt === 'Ex' || s.bnt === 'Vg') && s.avg < 0.24 && g.rng() < 0.12) { dec.squeeze = true; return dec; }
    // auto steal
    if (!over) {
      const st = aiSteal(g, pc);
      if (st) { dec.steal = st; return dec; }
    }
    // hit and run
    if (b[0] && !b[1] && outs < 2 && (s.hnr === 'A' || s.hnr === 'B') && s.pow !== 'P' && g.rng() < 0.08) dec.hitRun = true;
    if (b[2] && dec.infieldIn !== undefined && outs < 2 && inn >= 8 && diff <= 0 && diff >= -1 && g.rng() < 0.3) dec.contact = true;
  }
  return dec;
}
function aiSteal(g, pc) {
  const b = g.bases, outs = g.outs;
  let from = null;
  if (b[0] && !b[1] && !b[2]) from = 0;
  else if (b[1] && !b[2] && !b[0] && outs === 1) from = 1;
  else if (b[0] && b[2] && !b[1]) from = 0;
  if (from == null) return null;
  const rc = g.card(b[from].cid);
  let sbf = (rc.SBF || 0) + (pc.SBF || 0);
  if (outs === 0) sbf -= 1; else if (outs === 2 && from === 0) sbf += 1;
  const rd = g.d10(), bd = g.d6();
  const lvl = bd <= 2 ? 'L' : bd <= 4 ? 'M' : 'H';
  let need;
  if (from === 0 && !b[2]) need = rd === 9 ? C.auto2['9' + lvl] : C.auto2[rd];
  else { const k = rd <= 3 ? rd + lvl : null; need = k ? C.auto3[k] : null; if (from === 0 && b[2]) { if (bd % 2) need = null; } }
  if (need == null || sbf < need) return null;
  // the "E" suffix (BD even on 0) -> pickoff error check flavour; treat as normal attempt
  return { from };
}
function aiPitching(g) {
  const def = g.def, side = 1 - g.half;
  const cid = def.pitcher; const f = def.fatigue[cid];
  const lead = g.score[side] - g.score[1 - side];
  const inn = g.inning; const pl = def.pit[cid];
  const isSP = cid === def.spCid;
  const roles = def.roles || { closer: null, setup: [], longmen: def.pen.slice(), all: def.pen.slice() };
  const avail = (c) => def.pen.includes(c) && !def.used.has(c) && !(def.tired && def.tired.has(c));
  let want = null, why = '';
  const startOfInning = g.outs === 0 && !g.bases.some(Boolean);
  // save situation: closer for the 9th
  if (inn >= 9 && lead > 0 && lead <= 3 && startOfInning && cid !== roles.closer && avail(roles.closer)) { want = roles.closer; why = 'save situation'; }
  else if (inn === 8 && lead > 0 && lead <= 3 && startOfInning && !roles.setup.includes(cid) && cid !== roles.closer) { want = roles.setup.find(avail); why = 'setup man for the 8th'; }
  else if (inn >= 9 && lead === 0 && startOfInning && g.half === 0 && cid !== roles.closer && avail(roles.closer) && side === 1) { want = roles.closer; why = 'tie game, 9th'; }
  if (!want) {
    let tired = f <= 0;
    const blowout = Math.abs(lead) >= 5;
    if (isSP) {
      if (pl.R >= 5 && f < 10) tired = true;
      if (f <= 1.5 && g.bases.some(Boolean)) tired = true;
      if (inn >= 6 && f <= 5 && startOfInning && !blowout) tired = true;
      if (pl.BF >= 25 && startOfInning) tired = true;
      if (pl.BF >= 22 && g.bases.filter(Boolean).length >= 2 && Math.abs(lead) <= 2) tired = true;
    } else {
      const isLong = roles.longmen.indexOf(cid) >= 0 && roles.longmen.indexOf(cid) < 3;
      if (f <= 1 && g.bases.some(Boolean) && Math.abs(lead) <= 3) tired = true;
      if (pl.OUTS >= 3 && startOfInning && !(blowout && isLong && pl.OUTS < 9)) tired = true;
      if (pl.BF >= 7 && g.bases.some(Boolean) && Math.abs(lead) <= 2) tired = true;
    }
    if (tired) {
      why = `fatigue ${f.toFixed(1)}`;
      // pick next reliever
      if (def.plan && def.plan.length) { want = def.plan.find(c => avail(c)); }
      if (!want) {
        const late = inn >= 7 && Math.abs(lead) <= 3;
        const pool = late ? roles.setup.concat(roles.longmen) : roles.longmen.concat(roles.setup);
        want = pool.find(avail) || roles.all.find(avail);
        if (!want && inn >= 8 && avail(roles.closer)) want = roles.closer;
      }
    }
  }
  if (want && want !== cid) g.changePitcher(side, want, why);
}

// ---------- run a full CPU turn (one event) ----------
function aiStep(g, userDec) {
  if (g.over) return null;
  let dec = aiPre(g);
  if (userDec) {
    // user-controlled sides override AI choices for that side
    if (!g.off.ai) { for (const k of ['steal', 'bunt', 'squeeze', 'hitRun', 'contact']) delete dec[k]; }
    if (!g.def.ai) { for (const k of ['ibb', 'infieldIn']) delete dec[k]; }
    dec = Object.assign(dec, userDec);
  }
  if (dec.ibb) { delete dec.steal; delete dec.bunt; delete dec.squeeze; delete dec.hitRun; }
  if (dec.steal) {
    const ev = g.stealEvent(dec.steal.from, { skipJump: false });
    return ev;
  }
  return g.plateAppearance(dec);
}

// ---------- build a game from data ----------
function buildGame(D, o) {
  // o: {away, home, date, dn, gameRef, asPlayed, seed, opts, sp:{0,1}, isPost, weatherMode:'roll'|'actual', ai:[bool,bool], fatigue state...}
  const codes = [o.away, o.home];
  const rng = B.mulberry32((o.seed || 1) ^ 0x9e3779b9);
  const park = D.parks[o.parkCode || o.home];
  const date = o.date || '20250701';
  const dn = o.dn || 'N';
  const sps = [], lineups = [];
  for (let s = 0; s < 2; s++) {
    const code = codes[s];
    let sp = o.sp && o.sp[s] != null ? o.sp[s] : null;
    if (sp == null && o.asPlayed && o.gameRef) { const L = s === 0 ? o.gameRef.vl : o.gameRef.hl; sp = L.sp; if (sp != null && D.cards[sp].tm !== code && !D.teams[code].pit.includes(sp)) { /* traded pitcher: still allowed */ } }
    if (sp == null) sp = D.teams[code].rot[0];
    sps.push(sp);
  }
  for (let s = 0; s < 2; s++) {
    const code = codes[s];
    const oppT = D.cards[sps[1 - s]].th;
    let lu;
    if (o.lineups && o.lineups[s]) lu = o.lineups[s];
    else if (o.asPlayed && o.gameRef) lu = asPlayedLineup(D, o.gameRef, s, code);
    else lu = defaultLineup(D, code, oppT);
    lineups.push(lu);
  }
  const teams = codes.map((code, s) => {
    const T = D.teams[code];
    const rot = T.rot.slice();
    const roles = staffRoles(D, code, rot.concat([sps[s]]));
    let pen = roles.all.filter(c => c !== sps[s]);
    let plan = null;
    if (o.asPlayed && o.gameRef) { const L = s === 0 ? o.gameRef.vl : o.gameRef.hl; plan = L.pit.filter(c => c !== sps[s]); pen = Array.from(new Set(plan.concat(pen))); }
    if (o.tired && o.tired[s]) pen = pen.filter(c => !o.tired[s].has(c) || (plan && plan.includes(c)));
    return { code, name: T.city + ' ' + T.nick, abbr: T.abbr, lineup: lineups[s], sp: sps[s], pen, bench: benchFor(D, code, lineups[s]), plan, ai: o.ai ? o.ai[s] : true };
  });
  let weather;
  if (o.weatherMode === 'actual' && o.gameRef) weather = realWeather(o.gameRef, park);
  else weather = rollWeather(park, date, dn, rng);
  if (park.roof && weather.roof === undefined) weather.roof = false;
  const g = new B.Game(D, { teams, park, parkCode: o.parkCode || o.home, weather, seed: o.seed, opts: o.opts, isPost: o.isPost });
  g.teams.forEach((T, s) => { T.roles = staffRoles(D, codes[s], D.teams[codes[s]].rot.concat([sps[s]])); T.ai = o.ai ? o.ai[s] : true; if (o.tired && o.tired[s]) T.tired = o.tired[s]; });
  g.date = date; g.ref = o.gameRef || null;
  return g;
}

function simGame(g, maxEvents) {
  let n = 0;
  while (!g.over && n < (maxEvents || 2000)) { aiStep(g); n++; }
  return g;
}

G.BSB_AI = { aiPre, aiStep, aiPitching, buildGame, simGame, rollWeather, realWeather, defaultLineup, asPlayedLineup, staffRoles, monthKey };
})(typeof window !== 'undefined' ? window : globalThis);
