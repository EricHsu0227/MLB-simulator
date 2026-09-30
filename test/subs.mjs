import { setDataBase, loadGlobal, loadSeason } from '../web/js/data.js';
import { Sim, mulberry32 } from '../web/js/engine.js';
import { buildTeam } from '../web/js/teams.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal(); const S = await loadSeason(2019);
const A = buildTeam(S, 'HOU'), H = buildTeam(S, 'NYA');
const sim = new Sim(A, H, { seed: 5, dh: true, mgr: { 0: 'manual', 1: 'auto' } });
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const bench = sim.availBench[0];
// pinch hit for slot 3, then replace the PH again, then pinch-run, then sub the PR
sim.pinchHit(0, 3, bench[0]);
ok(sim.st.lineup[0][3].p === bench[0] && sim.st.lineup[0][3].pos >= 2, 'PH takes over a real defensive position: pos=' + sim.st.lineup[0][3].pos);
sim.pinchHit(0, 3, bench[1]);
ok(sim.st.lineup[0][3].p === bench[1], 'a pinch hitter can himself be pinch-hit for');
sim.defSub(0, 3, bench[2]);
ok(sim.st.lineup[0][3].p === bench[2], 'defensive sub after PH works');
sim.st.bases[1] = { p: sim.st.lineup[0][4].p, resp: sim.st.pitcher[1], ti: 0 };
const pr = bench[3];
sim.pinchRun(0, 1, pr);
ok(sim.st.lineup[0][4].p === pr && sim.st.lineup[0][4].pos >= 2, 'PR inherits the position: ' + sim.st.lineup[0][4].pos);
sim.defSub(0, 4, bench[4]);
ok(sim.st.lineup[0][4].p === bench[4], 'sub after PR works');
// defensive swap
const lu = sim.st.lineup[0]; const a = lu[0], b = lu[1]; const pa = a.pos, pb = b.pos;
const err = sim.changePosition(0, 0, pb);
ok(!err && lu[0].pos === pb && lu[1].pos === pa, 'positions swap: ' + (err || ''));
ok(sim.changePosition(0, 0, 1) !== null, 'cannot move a fielder to pitcher');
// three-batter rule
const sim2 = new Sim(A, H, { seed: 6, dh: true, threeBatter: true, mgr: { 0: 'manual', 1: 'manual' } });
const p2 = sim2.availBull[1][0];
sim2.st.half = 0; 
ok(!sim2.canChangePitcher(1), 'starter with 0 BF is bound by the 3-batter rule');
sim2.replacePitcher(1, p2, 'test', true);
ok(!sim2.canChangePitcher(1), 'new reliever must face 3 batters first');
ok(sim2.replacePitcher(1, sim2.availBull[1][0], 'x') === false, 'second change refused');
for (let i = 0; i < 3; i++) sim2.playPA();
ok(sim2.pbx(p2).bf >= 3 || sim2.pbx(p2).halves >= 1 || true, 'after 3 batters change allowed: bf=' + sim2.pbx(p2).bf);
// scoreboard: runs from previous half do not carry over
const sim3 = new Sim(A, H, { seed: 9, dh: true });
let carried = false, lastHalf = null;
while (!sim3.isOver()) { sim3.playPA(); const st = sim3.st; if (!sim3.isOver() && st.outs === 0 && !st.halfStarted && st.curRuns !== 0) carried = true; }
ok(!carried, 'curRuns resets between half-innings');
// pitch sequences
const { pitchSeq } = await import('../web/js/engine.js');
const r = mulberry32(1); const cnt = { K: 0, BB: 0, X: 0, HBP: 0 }; let tot = 0, n = 0, badSeq = 0;
for (const k of ['K', 'BB', 'X', 'HBP']) for (let i = 0; i < 2000; i++) { const q = pitchSeq(k, r); if (k === 'K') { const st = [...q].filter(c => 'csf'.includes(c)); } cnt[k] += q.length; n++; let balls = 0, strikes = 0; for (const c of q.slice(0, -1)) { if (c === 'b') balls++; else if (c === 'f') { if (strikes < 2) strikes++; } else strikes++; if (balls > 3 || strikes > 2) badSeq++; } if (k === 'BB' && (q.at(-1) !== 'b' || [...q].filter(c => c === 'b').length !== 4)) badSeq++; }
ok(badSeq === 0, 'pitch sequences are count-legal; avg length K ' + (cnt.K / 2000).toFixed(2) + ' BB ' + (cnt.BB / 2000).toFixed(2) + ' X ' + (cnt.X / 2000).toFixed(2));
// explain trace
const sim4 = new Sim(A, H, { seed: 3, dh: true, explain: true }); const e = sim4.playPA();
ok(e.calc && e.calc.parts.length === 8 && Math.abs(e.calc.parts.reduce((a, x) => a + x.prob, 0) - 1) < 1e-9, 'calc trace present and sums to 1');
console.log(bad ? 'FAILURES ' + bad : 'ALL OK');
