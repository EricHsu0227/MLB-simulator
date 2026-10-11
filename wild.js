// Wild Play Chart (2) — Box Seat Baseball Under The Hood
(function (G) {
const B = G.BSB;
function W(g, wb, sit, outs, cur) {
  const T = g.off, D = g.def;
  const bl = T.bat[cur.batter], pl = D.pit[D.pitcher];
  const bn = g.name(cur.batter);
  const occ = g.bases.slice();
  const r = (i) => occ[i] ? g.name(occ[i].cid) : '';
  const BR = (cid) => { const c = g.card(cid); return c && c.BR ? c.BR : 'C'; };
  const ge = B.brGE;
  const done = (txt, result) => { cur.desc = 'WILD PLAY: ' + txt.replace(/([!.?])\. /g, '$1 '); cur.result = result || cur.result || 'WILD'; cur.wild = true; g.say(cur.desc, 'res wild'); return cur; };
  const mv = (moves, o) => { o = o || {}; const outsN = moves.filter(m => m[1] === 'out').length; const res = g.applyMoves(moves, cur, Object.assign({ rbi: true, noRunsOn3rdOut: g.outs + outsN >= 3 && o.force !== false, batterRunner: { cid: cur.batter, resp: D.pitcher, unearned: !!o.unearned } }, o)); return res.text; };
  const all1 = () => { const m = []; for (let i = 2; i >= 0; i--) if (occ[i]) m.push([i, i + 1]); return m; };
  const forced1 = () => { const m = []; if (occ[0]) { m.push([0, 1]); if (occ[1]) { m.push([1, 2]); if (occ[2]) m.push([2, 3]); } } return m; };
  const outB = () => { bl.AB++; return ['B', 'out']; };
  const hit = (n) => { bl.AB++; bl.H++; pl.H++; g.hits[g.half]++; if (n === 2) bl.D++; if (n === 3) bl.T++; g.fatigueAdj(-1); };
  const stay = () => { cur.noAdvanceBatter = true; bl.PA--; pl.BF--; };
  const err = (side) => { g.errors[1 - g.half]++; };
  const eject = (side, cid, why) => {
    const Tm = g.teams[side];
    const slot = Tm.lineup.find(x => x.cid === cid); if (!slot) return '';
    const sub = Tm.bench.find(x => g.card(x).pos.includes(slot.pos) || slot.pos === 'DH') || Tm.bench[0];
    if (sub == null) return '';
    g.substitute(side, cid, sub, slot.pos, why);
    return ` ${g.name(sub)} takes his place.`;
  };
  const reroll = (why) => {
    const d = g.roll(); g.d = d; const WB = d.w * 10 + d.b;
    const tok = g.bc.res[g.hr.pcol][B.DICE.indexOf(WB)];
    g.say(`${why} — new roll ${WB}: ${tok}`, 'dice');
    if (tok === 'RP/+WP') return g.pitcherField('RG', cur);
    return g.resolveToken(tok, cur);
  };
  const lfWall = (g.park && g.park.dims && g.park.dims.LEFT && g.park.dims.LEFT[1]) || 8;
  const pc = g.parkCode;
  const night = g.weather && g.weather.dn === 'N';
  const roof = g.weather && g.weather.roof;

  if (wb === 11) {
    const t = g.weather ? g.weather.temp : 72;
    g.say(`Wild Play 11: game time temperature ${t}°`);
    if (t >= 80) return g.sphChart(cur);
    if (t >= 70) return reroll('Temperature 70-79: re-roll for a new play result');
    return g.specialOut(cur);
  }
  if (wb === 12 || wb === 13) {
    bl.AB++; bl.SO++; pl.SO++; g.outRecorded(1, cur);
    const s = eject(g.half, cur.batter, 'Ejection replacement');
    return done(`${bn} can't believe the called third strike, argues with the plate umpire and is EJECTED!${s}`, 'K');
  }
  if (wb === 14) {
    if (sit === '' || sit === '3' || sit === '23') { hit(1); const t = mv([...all1().filter(m => m[0] >= 1).map(m => [m[0], 3]), outB()], { force: false }); bl.AB--; return done(`${bn} singles to right but changes his mind heading to 2nd and is tagged out after a five-throw rundown (9-3-6-3-4-6-2)!${t}`, 'SN'); }
    hit(1); const m = forced1().filter(x => x[0] !== 0); const t = mv([[0, 'out'], ...m.map(x => x), ['B', 0]]);
    return done(`${bn} scorches a grounder off the first base bag that hits ${r(0)} — single, but the runner is out!${t}`, 'SN');
  }
  if (wb === 15) {
    if (sit === '1' && outs < 2) { const t = mv([[0, 'out'], outB()]); return done(`${bn} flies out to right... the first baseman pulls the HIDDEN BALL TRICK and tags out ${r(0)}! Double play.${t}`, 'FNF'); }
    const t = mv([outB()]); return done(`${bn} pops up down the first base line and runs into the first baseman — out for obstruction!${t}`, 'PU');
  }
  if (wb === 16) {
    if (['', '2', '3', '23'].includes(sit)) { const t = mv([...all1(), outB()]); return done(`Smash up the middle — backhand flip from the second baseman to short, 4-6-3 at first!${t}`, 'RG'); }
    hit(2); const t = mv([[2, 3], [1, 3], [0, 'out'], ['B', 1]]); return done(`${bn} rips a double into the right-center gap clearing the bases — but on appeal ${r(0)} missed 2nd and is called out!${t}`, 'DB');
  }
  if (wb === 21) {
    if (sit === '') { const t = mv([outB()]); return done(`${bn} lines one into the left field corner but doesn't run thinking it was foul — 7-5-1-3 putout!${t}`, 'LO'); }
    hit(1); const t = mv([...all1(), ['B', 0]]); return done(`Broken-bat squibber — the pitcher hits the turf to avoid the bat and it rolls by for an infield single!${t}`, 'SN');
  }
  if (wb === 22 || wb === 23) {
    if ((sit === '3' || sit === '23') && outs < 2) { const t = mv([[2, 3], outB()], { force: false }); bl.SF++; bl.AB--; return done(`Foul pop — the first baseman makes a great grab with his back to the plate but slips, and ${r(2)} tags and scores!${t}`, 'FP'); }
    if (occ[0] && outs < 2) { const t = mv([[0, 'out'], outB(), ...(occ[1] ? [[1, 2]] : []), ...(occ[2] ? [[2, 2]] : [])]); bl.GDP++; return done(`Grounder off the pitcher's heel goes right to the second baseman standing on the bag — easy 4-3 double play!${t}`, 'RG'); }
    const t = mv([outB()]); return done(`Line drive off the pitcher's leg caroms to short — throw to first for the out.${t}`, 'LO');
  }
  if (wb === 24) {
    if (sit === '3') {
      const br = BR(occ[2].cid); stay();
      if (ge(br, 'A')) { const t = mv([[2, 3]], { rbi: false }); T.bat[occ[2].cid].SB++; return done(`${r(2)} STEALS HOME!${t}`, 'SB'); }
      if (br === 'B') { const rr = g.d10(); if (rr <= 4) return done(`${r(2)} breaks for home, is caught in a rundown but scrambles back to 3rd safely`, 'NP'); const t = mv([[2, 'out']]); return done(`${r(2)} is caught in a rundown and tagged out by the catcher${t}`, 'CS'); }
      const t = mv([[2, 'out']]); return done(`${r(2)} is picked off third by the pitcher!${t}`, 'PO');
    }
    const t = mv([outB()]); return done(`Foul pop near first — the base coach can't get out of the way. ${bn} is out on interference!${t}`, 'FP');
  }
  if (wb === 25) {
    if (sit === '13') { stay(); const t = mv([[0, 'out']]); return done(`The fake-to-third, throw-to-first pickoff never works... but this time it does! ${r(0)} is picked off!${t}`, 'PO'); }
    const t = mv([outB()]); return done(`Foul pop by the stands — a fan reaches out and ${bn} is ruled out for fan interference!${t}`, 'FP');
  }
  if (wb === 26) {
    if (['', '2', '3', '23'].includes(sit)) {
      err(); bl.AB++;
      const m = outs === 2 ? all1() : (occ[2] && !D.infieldIn ? [[2, 3]] : []);
      const t = mv([...m, ['B', 0]], { rbi: false, unearned: true }); return done(`Routine grounder to short — strike to first, but the first baseman drops it! E3.${t}`, 'E');
    }
    if (outs === 2) { err(); bl.AB++; const t = mv([...all1().map(m => [m[0], Math.min(3, m[0] + 2)]), ['B', 0]], { rbi: false, unearned: true }); return done(`The center fielder drops the fly ball! E8 — everybody moves up two.${t}`, 'E'); }
    const t = mv([outB()]); return done(`Fly to center is dropped — but ${r(0)} never saw it, stays at first, and ${bn} passes him on the bases: batter out!${t}`, 'E');
  }
  if (wb === 31) {
    if (sit === '') { hit(3); err(); const t = mv([['B', 3]], { rbi: false }); return done(`${bn} triples into the right field corner — the appeal throw to first sails down the line and he scores! (E1)${t}`, 'TP'); }
    if (sit === '1') { const t = mv([[0, 'out'], outB()]); return done(`Liner caught inches off the grass by the right fielder, who runs in and steps on first — unassisted double play!${t}`, 'LO'); }
    if (sit === '12') { err(); const t = mv([[1, 3], [0, 1], outB()], { rbi: false }); return done(`Long fly to center is caught; the throw to first is wild, then the first baseman throws it away at the plate — ${r(1)} scores, ${r(0)} to 2nd (E3).${t}`, 'FLF'); }
    if (sit === '13') { const t = mv([[0, 'out'], outB()]); return done(`Grounder to second freezes both runners — the second baseman tags ${r(0)} and steps on the bag: unassisted double play!${t}`, 'RG'); }
    stay(); const s = eject(g.half, cur.batter, 'Injury replacement');
    return done(`${bn} is struck in the face by the catcher's return throw and has to leave the game.${s}`, 'NP');
  }
  if (wb === 32) { const t = mv([outB()]); return done(`High pop into short left — it pops out of the third baseman's glove and the left fielder snatches it out of the air!${t}`, 'PU'); }
  if (wb === 33) {
    if (['', '2', '3', '23'].includes(sit)) { bl.AB++; bl.SO++; pl.SO++; pl.WP++; const t = mv([...(sit === '2' ? [[1, 2]] : []), ['B', 0]], { rbi: false }); return done(`${bn} strikes out — but the pitch bounces to the backstop and he beats the throw to first! (K + WP)${t}`, 'K'); }
    hit(2); err(); const t = mv([...all1().map(m => [m[0], 3]), outB()]); return done(`Hard shot down the left field line — ${r(0)} scores when the catcher drops the ball, but he guns down ${bn} trying for third (double, E2).${t}`, 'DB');
  }
  if (wb === 34) {
    const side = 1 - g.half; const cand = g.def.pen.find(c => !g.def.used.has(c));
    if (cand != null) g.changePitcher(side, cand, 'injury (stiff arm)');
    g.say(`WILD PLAY: the pitcher calls for the trainer — he has to leave the game with a stiff arm!`, 'res wild');
    g.pc = g.card(g.def.pitcher); g.hr = g.hands(g.bc, g.pc);
    return reroll('New pitcher');
  }
  if (wb >= 35 && wb <= 41) {
    if (pc === 'CHN') {
      if (g.d10() <= 4) { const w = g.weather; g.windBoost = { LF: 0, CF: 0, RF: 0 }; const inn = w && w.dir >= 5 && w.dir <= 7; const f = w && (w.dir === 1 || w.dir === 5) ? 'LF' : w && (w.dir === 3 || w.dir === 7) ? 'RF' : 'CF'; g.windBoost[f] = inn ? -5 : 5; g.say(`The wind at Wrigley picks up greatly! Deep fly effect now ${inn ? -5 : +5} to ${f}.`); return reroll('Wind change'); }
      hit(2); const t = mv([...all1().map(m => [m[0], Math.min(3, m[0] + 2)]), ['B', 1]]); return done(`Drive into the left-center alley gets lost in the IVY — ground rule double!${t}`, 'DB');
    }
    if (pc === 'BOS' || pc === 'HOU') { hit(1); const t = mv([[2, 3], [1, 3], [0, 1], ['B', 0]]); return done(`High liner off the ${pc === 'BOS' ? 'Green Monster' : 'tall left field wall'} — played perfectly, ${bn} held to a long single.${t}`, 'SN'); }
    if (roof) { hit(2); const t = mv([...all1().map(m => [m[0], Math.min(3, m[0] + 2)]), ['B', 1]]); return done(`Soaring fly ball hits a speaker near the roof — ground rule double!${t}`, 'DB'); }
    if (pc === 'COL') { hit(1); const t = mv([...all1(), ['B', 0]]); return done(`Routine grounder to short takes a horrendous hop over his head — a Coors Field single!${t}`, 'SN'); }
    if (pc === 'SFN') { hit(3); const t = mv([...all1().map(m => [m[0], 3]), ['B', 2]]); return done(`Deep fly bounces wildly off the archway in right — ${bn} goes all the way to third with a stand-up triple!${t}`, 'TP'); }
    hit(2); const a = outs === 2 ? 2 : 1; const t = mv([...all1().map(m => [m[0], Math.min(3, m[0] + a)]), ['B', 1]]);
    return done(night ? `Low liner to left — the left fielder loses it in the lights and it lands on the warning track. Double!${t}` : `High fly to right — the right fielder loses it in the sun and it drops behind him. Where were his shades? Double!${t}`, 'DB');
  }
  if (wb === 42) { hit(1); const t = mv([...all1(), ['B', 0]]); return done(`High pop near the mound — three infielders surround it, nobody takes charge and it drops. Single!${t}`, 'SN'); }
  if (wb === 43) {
    if (['', '1', '12', '2'].includes(sit)) { hit(1); const t = mv([...all1(), ['B', 0]]); const s = eject(g.half, cur.batter, 'Pinch runner'); return done(`Surprise drag bunt — ${bn} collides with the covering pitcher, who drops the ball. Infield hit, but ${bn} is shaken up and leaves.${t}${s}`, 'SN'); }
    if (outs < 2) { const t = mv([...all1(), outB()], { rbi: true }); return done(`Medium fly to right — the right fielder catches it and HANDS IT TO A FAN thinking it was the third out! Everybody tags and advances.${t}`, 'FNF'); }
    stay(); err(); const t = mv(all1(), { rbi: false }); return done(`The catcher tries to pick off the runner at third and throws it into left — all runners advance! (E2)${t}`, 'E');
  }
  if (wb === 44) {
    const br = BR(cur.batter);
    if (br === 'A+') { g.doHomeRun(cur, 'CF'); cur.desc = `WILD PLAY: Long drive into left-center — the outfielders collide and ${bn} circles the bases: INSIDE-THE-PARK HOME RUN!`; return cur; }
    if (br === 'C-') { hit(2); const t = mv([...all1().map(m => [m[0], 3]), ['B', 1]]); return done(`The left and center fielders collide on a drive into the gap — ${bn} chugs into second.${t}`, 'DB'); }
    hit(3); const t = mv([...all1().map(m => [m[0], 3]), ['B', 2]]); return done(`The left and center fielders collide on a drive into the gap — ${bn} stops at third with a triple!${t}`, 'TP');
  }
  if (wb === 45) {
    if (sit === '') { const t = mv([outB()]); return done(`The second baseman cuts in front of the first baseman and flips to the covering pitcher — a rare 4-1 putout.${t}`, 'RG'); }
    if (sit === '1') { const t = mv([[0, 1], outB()]); return done(`Grounder to second — throw to 2nd too late, but they get the batter: rare 4-6-3 putout at first only.${t}`, 'RG'); }
    if (sit === '2') { const t = mv([[1, 2], outB()]); return done(`Squibber up the line — ${bn} knocks the ball out of the pitcher's glove and is called out. Runner to 3rd.${t}`, 'SG'); }
    if (sit === '3') { if (outs < 2) { const t = mv([[2, 'out'], outB()]); return done(`Line drive right to the second baseman, who fires to third to double off ${r(2)}! (DP 4-5)${t}`, 'LO'); } stay(); const t = mv([[2, 'out']]); return done(`The pitch gets away, ${r(2)} breaks for the plate — a lucky carom and ${r(2)} is nailed at home!${t}`, 'NP'); }
    if (sit === '12') { const t = mv([[1, 2], [0, 1], outB()]); return done(`Hard grounder deflects off the first baseman's glove to the second baseman — rare 3-4-1 putout. Runners to 2nd and 3rd.${t}`, 'HG'); }
    if (sit === '13' || sit === '23') { hit(1); const t = mv([[2, 3], [1, 3], [0, 3], outB()]); bl.AB--; return done(`Long drive off the right field fence — ${bn} admired it, tries for second and is nailed by the right fielder. Both runners score (single).${t}`, 'SN'); }
    if (outs < 2) { const t = mv([[2, 3], ['B', 'out'], [0, 'out'], [1, 1]], { force: false }); bl.AB++; bl.GDP++; return done(`Grounder to second — out at first, then the throw to short tags ${r(0)}: rare 4-3-6 double play. A run scores while the confused ${r(1)} stays at second.${t}`, 'RG'); }
    const t = mv([outB()]); return done(`Hard grounder off the pitcher bounds high — the catcher makes an acrobatic grab and throws to first. 1-2-3!${t}`, 'HG');
  }
  if (wb >= 46 && wb <= 51) {
    if (sit === '') {
      const prior = g.hbpCount > 0; g.hbpCount = (g.hbpCount || 0) + 1; const d6 = g.d6();
      g.doHBP(cur);
      if (!prior) { if (d6 <= 5) return done(`${bn} is hit by a pitch near his head and starts toward the mound — but is restrained. Hit by pitch.`, 'HBP'); const s = eject(g.half, cur.batter, 'Pinch runner'); return done(`${bn} is hit near the head and CHARGES THE MOUND — benches clear! He is ejected for starting the brawl.${s}`, 'HBP'); }
      const cand = g.def.pen.find(c => !g.def.used.has(c)); if (cand != null) g.changePitcher(1 - g.half, cand, 'ejected');
      return done(`${bn} is hit near the head after warnings — the pitcher and manager are EJECTED!`, 'HBP');
    }
    if (sit === '1') { stay(); const t = mv([[0, 'out']]); return done(`After a called strike the catcher side-arms a throw to first and catches ${r(0)} napping!${t}`, 'PO'); }
    if (sit === '2') { const t = mv([[1, 'out'], ['B', 0]]); bl.AB++; return done(`Grounder to short — ${r(1)} is caught in a rundown (6-5-4-5). ${bn} safe on a fielder's choice.${t}`, 'FC'); }
    if (sit === '3') { if (outs < 2) { err(); err(); const t = mv([[2, 3], ['B', 1]], { rbi: false }); bl.AB++; return done(`Comebacker — the first baseman leaves the bag early and throws wildly home! ${r(2)} scores, batter to 2nd (2 errors on 1B).${t}`, 'E'); } stay(); const t = mv([[2, 'out']]); return done(`Pitch gets away, ${r(2)} breaks for home and is cut down at the plate!${t}`, 'NP'); }
    if (sit === '12') { if (outs === 0) { const t = mv([[1, 'out'], [0, 'out'], outB()]); return done(`One-hop shot to third — step on the bag, to second, to first: TRIPLE PLAY!${t}`, 'TP3'); } err(); err(); const t = mv([[1, 3], [0, 3], ['B', 2]], { rbi: false }); bl.AB++; return done(`Wild off-balance throw by the shortstop, then the right fielder throws it into the dugout — two runs score, ${bn} ends up on third (2 errors).${t}`, 'E'); }
    if (sit === '13' || sit === '23') { hit(1); const t = mv([[2, 3], [1, 3], [0, 3], outB()]); bl.AB--; return done(`Long drive off the right field fence — ${bn} is thrown out trying for second. Both runners score (single).${t}`, 'SN'); }
    stay(); const t = mv(all1().map(m => [m[0], Math.min(3, m[0] + 2)]), { rbi: false }); return done(`Wild pitch — the catcher stops it with his MASK! Rule 7.05: all runners advance two bases!${t}`, 'WP');
  }
  if (wb === 52) {
    if (sit === '') { const t = mv([outB()]); return done(`Hard grounder off the third baseman's glove — the shortstop guns him down: rare 5-6-3.${t}`, 'HG'); }
    if (occ[0]) { const safe = ge(BR(cur.batter), 'A'); const t = mv([...all1(), safe ? ['B', 0] : outB()]); if (safe) bl.AB++; return done(`Grounder to third, throw to second is late — ${safe ? bn + ' beats the relay, safe on a fielder\'s choice' : 'they get the out at first (rare 5-4-3 out at first only)'}.${t}`, 'RG'); }
    if (sit === '2') { const t = mv([[1, 'out'], outB()]); return done(`Out at first, then the first baseman fires to short covering third — ${r(1)} cut down on a delayed advance. DP 5-3-6!${t}`, 'RG'); }
    const t = mv([[2, 'out'], ['B', 1]]); bl.AB++; return done(`Grounder to second, throw home — ${r(2)} is caught in a rundown and tagged out (4-2-5-3) while ${bn} reaches second on the fielder's choice.${t}`, 'FC');
  }
  if (wb === 53 || wb === 54 || wb === 55) {
    if (sit === '' && wb === 53) { const t = mv([outB()]); return done(`The pitcher forgets to cover but the second baseman races over — rare 3-4 putout at first.${t}`, 'RG'); }
    if (sit === '' ) { if (lfWall <= 10) { hit(2); const t = mv([['B', 1]]); return done(`Deep drive to left bounces on the track and over the wall — ground rule double!${t}`, 'DB'); } hit(1); const t = mv([['B', 0]]); return done(`High line shot caroms off the tall left field wall right back to the left fielder — long single.${t}`, 'SN'); }
    if (sit === '1') {
      if (wb === 53) { const t = mv([[0, 1], outB()]); return done(`Grounder to the pitcher — throw to second too late, but they get the out at first.${t}`, 'RG'); }
      stay(); const arm = g.fr('CF').arm; const out = arm === 'A' || arm === 'B'; T.bat[occ[0].cid][out ? 'CS' : 'SB']++; const t = mv([[0, out ? 'out' : 2]], { rbi: false }); return done(`${r(0)} steals, the catcher's throw sails into center, and he tries for third — ${out ? 'thrown out by the center fielder (arm ' + arm + ')' : 'SAFE at third'}!${t}`, 'SB');
    }
    if (sit === '2') {
      if (wb === 53) { if (outs < 2) { const t = mv([[1, 'out'], outB()]); return done(`Line drive caught by the pitcher in self-defense — he turns and doubles off ${r(1)} at second. DP 1-6!${t}`, 'LO'); } err(); const t = mv([[1, 2], ['B', 0]], { rbi: false }); bl.AB++; return done(`Squibber — the pitcher tags ${bn} with the ball NOT in his glove. Safe! E1, runner to 3rd.${t}`, 'E'); }
      const t = mv([[1, 'out'], outB()]); return done(`Hard grounder to short — out at first, and the first baseman cuts down ${r(1)} at third on a delayed break. DP 6-3-5!${t}`, 'HG');
    }
    if (sit === '3') { if (outs < 2) { const t = mv([[2, 'out'], ['B', 1]]); bl.AB++; return done(`Hard grounder to third — ${r(2)} hung up and tagged out at the plate after a long rundown; ${bn} makes it to second.${t}`, 'FC'); } const t = mv([outB()]); return done(`Slow roller — the pitcher can't get the ball out, so he tosses the whole GLOVE to first. Bizarre 1-3 putout!${t}`, 'SG'); }
    if (sit === '13') {
      if (wb === 53) { if (outs < 2) { const t = mv([[2, 'out'], [0, 'out'], ['B', 1]]); bl.AB++; return done(`Pitcher snags a hard grounder, gets the force at second, then ${r(2)} is run down at the plate! DP 1-4-2-5-1, batter to 2nd.${t}`, 'HG'); } const t = mv([[0, 'out'], ['B', 0]]); bl.AB++; return done(`Fly to right is dropped but the right fielder recovers to force ${r(0)} at second (9-6).${t}`, 'FC'); }
      err(); if (outs < 2) { const t = mv([[2, 3], [0, 2], ['B', 1]], { rbi: true }); bl.AB++; return done(`Hard slide takes out the second baseman and his throw goes down the right field line — run scores, ${bn} to second on the error.${t}`, 'E'); }
      const t = mv([[2, 3], [0, 1], ['B', 0]], { rbi: true }); bl.AB++; return done(`Runner jars the ball loose with a hard slide at second — everyone safe, a run scores (E4).${t}`, 'E');
    }
    if (sit === '12') { hit(1); err(); const t = mv([[1, 3], [0, 2], ['B', 1]]); return done(`Single to left — the throw home gets past the catcher, the pitcher backs it up and angrily throws it away! Both runners take an extra base (E1).${t}`, 'SN'); }
    if (sit === '23') { stay(); const t = mv([[2, 'out'], [1, 2]], { rbi: false }); return done(`Pitch sails behind the batter, ${r(2)} tries to score and is thrown out (2-1). Words exchanged, no brawl.${t}`, 'NP'); }
    hit(1); err(); err(); const t = mv([[2, 3], [1, 3], [0, 3], ['B', 2]]); return done(`Line single to center — the catcher drops the throw home, then throws the ball into center! Three runs score, ${bn} ends up on third (2 errors on the catcher).${t}`, 'SN');
  }
  if (wb === 56) {
    if (sit === '') { bl.AB++; bl.SO++; pl.SO++; err(); const t = mv([['B', 0]], { rbi: false }); return done(`Strike three gets past the catcher, who argues it was foul while ${bn} reaches — sent back to first after an umpires' conference (K, E2 + PB).${t}`, 'K'); }
    if (sit === '1') { hit(1); const t = mv([[0, 'out'], ['B', 0]]); return done(`Single to center — ${r(0)} knocks the ball out of the third baseman's glove, but is ruled out after the umpires confer!${t}`, 'SN'); }
    if (sit === '2') { stay(); T.bat[occ[1].cid].SB++; const t = mv([[1, 2]], { rbi: false }); return done(`${r(1)} takes off early as the pitcher steps off — a successful delayed steal of third!${t}`, 'SB'); }
    if (sit === '12') { err(); const t = mv([[1, 3], [0, 'out'], outB()], { force: false, rbi: false }); bl.AB--; bl.AB++; return done(`Grounder mishandled by the second baseman, ${r(1)} scores — but ${r(0)} is run down (4-2-5-2) and ${bn} is caught trying for second. Much-delayed double play!${t}`, 'E'); }
    if (sit === '13') { hit(1); const t = mv([[2, 3], [0, 'out'], ['B', 0]], { force: false }); return done(`Single to center scores ${r(2)}, but ${r(0)} gets caught in a rundown between second and third (8-5-4-5)!${t}`, 'SN'); }
    g.say('WILD PLAY: the third baseman tries the hidden ball trick — the umpire rules the runner safe and the third baseman is ejected arguing!', 'res wild');
    return reroll('Play resumes');
  }
  if (wb === 61) {
    if (sit === '') { err(); const t = mv([outB()]); return done(`Slow roller — the third baseman throws it over first, but ${bn} rounds too far and is tagged out (E5, 2-3).${t}`, 'E'); }
    if (sit === '1') { const t = mv([[0, 'out'], ['B', 0]]); bl.AB++; return done(`Liner to right ruled trapped — ${r(0)} had to hold up and is forced at second by the right fielder (9-6).${t}`, 'FC'); }
    if (sit === '2' || sit === '12') { hit(1); const lead = occ[1] ? 1 : 0; const t = mv([[lead, 'out'], ...(sit === '12' ? [[0, 1]] : []), ['B', 0]]); return done(`Hard grounder strikes ${r(lead)} — the runner is out and ${bn} gets a single.${t}`, 'SN'); }
    if (sit === '13') { const m = outs < 2 ? [[2, 3]] : [[2, 2]]; const t = mv([...m, [0, 'out'], ['B', 0]], { force: false }); bl.SF += outs < 2 ? 1 : 0; bl.AB += outs < 2 ? 0 : 1; return done(`Routine fly to right is dropped, but the right fielder forces ${r(0)} at second (9-6)${outs < 2 ? ' as the run scores' : ''}.${t}`, 'FC'); }
    if (sit === '3' || sit === '23') { stay(); const t = mv([[2, 3]], { rbi: false }); return done(`The upset pitcher snaps at the catcher's return throw and misses it — ${r(2)} alertly races home!${t}`, 'NP'); }
    if (outs < 2) { const t = mv([[2, 'out'], [1, 'out'], [0, 2], ['B', 0]]); bl.AB++; bl.GDP++; return done(`Hard grounder — the third baseman steps on the bag and fires home to tag ${r(2)}. Unusual double play!${t}`, 'HG'); }
    hit(1); const t = mv([[2, 3], [1, 'out'], [0, 1], ['B', 0]], { force: false }); return done(`Single to left scores one, but after a trip and a rundown the inning ends on a throw home — 7-2-5-6-4-1 with one RBI!${t}`, 'SN');
  }
  if (wb === 62) { bl.AB++; bl.SO++; pl.SO++; g.outRecorded(1, cur); const s = eject(g.half, cur.batter, 'Injury replacement'); return done(`${bn} swings through strike three and goes down to one knee — a muscle strain, he has to leave the game.${s}`, 'K'); }
  if (wb === 63) { const t = mv([outB()]); return done(`Little dribbler — the catcher's throw hits ${bn}, who is called out for running inside the baseline!${t}`, 'SG'); }
  if (wb === 64) { hit(2); const t = mv([...all1().map(m => [m[0], m[0] === 0 ? 2 : 3]), outB()]); bl.AB--; return done(`Drive into the right-center gap — ${bn} rounds second, changes his mind, and is tagged out diving back!${t}`, 'DB'); }
  if (wb === 65) { const arm = g.fr('RF').arm; const out = arm === 'A' || arm === 'B'; err(); const t = mv([...all1(), out ? outB() : ['B', 1]], { rbi: false, unearned: true }); if (!out) bl.AB++; return done(`High fly to right is DROPPED — ${bn} tries for second and is ${out ? 'thrown out by the strong-armed right fielder' : 'safe (E9)'}.${t}`, 'E'); }
  if (wb === 66) {
    if (sit === '') { if (g.d10() <= 4) { g.doHomeRun(cur, g.hr.bats === 'R' ? 'LF' : 'RF'); cur.desc = `WILD PLAY: High fly down the line curls around the foul pole — umpire rules it a HOME RUN!`; return cur; } bl.AB++; bl.SO++; pl.SO++; g.outRecorded(1, cur); return done(`High fly curls around the pole — ruled foul! ${bn} strikes out on the next pitch.`, 'K'); }
    if (sit === '1') { const t = mv([[0, 1], ['B', 0]]); bl.AB++; return done(`Comebacker — the pitcher's throw to second hits the umpire! Everybody safe.${t}`, 'FC'); }
    if (sit === '2' || sit === '12') { const t = mv([[1, 'out'], outB(), ...(occ[0] ? [[0, 0]] : [])]); return done(`Short fly to center — caught on the run, and the center fielder keeps going to tag ${r(1)}: unassisted double play!${t}`, 'SF'); }
    if (sit === '13') { if (outs < 2) { const t = mv([[2, 'out'], [0, 2], outB()]); return done(`Comebacker — ${r(2)} run down at the plate, ${r(0)} to third, but ${bn} overruns second and is tagged out!${t}`, 'HG'); } stay(); const t = mv([[2, 'out']]); return done(`Double steal — the shortstop cuts off the throw and fires home to nail ${r(2)}!${t}`, 'CS'); }
    if (sit === '3' || sit === '23') { if (outs < 2) { const t = mv([[2, 'out'], outB()]); return done(`Grounder to first — he steps on the bag and throws home to get ${r(2)}! DP 3-2.${t}`, 'RG'); } hit(1); const t = mv([[2, 3], [1, 2], ['B', 0]]); return done(`Great diving stop by the first baseman, but the pitcher doesn't cover — ${bn} is safe and a run scores!${t}`, 'SN'); }
    for (let s = 0; s < 2; s++) { const Tm = g.teams[s]; const cand = Tm.pen.find(c => !Tm.used.has(c)); if (cand != null) g.changePitcher(s, cand, roof ? 'power outage delay' : 'rain delay'); }
    g.say(`WILD PLAY: ${roof ? 'A power outage' : 'A hard rain'} forces a long delay — both pitchers have to be replaced!`, 'res wild');
    g.pc = g.card(g.def.pitcher); g.hr = g.hands(g.bc, g.pc);
    return reroll('Play resumes');
  }
  return null;
}
G.BSB_WILD = W;
})(typeof window !== 'undefined' ? window : globalThis);
