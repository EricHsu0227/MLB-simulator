import { setDataBase, loadGlobal, loadSeason } from '../web/js/data.js';
import { Sim, mulberry32 } from '../web/js/engine.js';
import { buildTeam } from '../web/js/teams.js';
setDataBase(new URL('../data/', import.meta.url).pathname);
await loadGlobal();
const S = await loadSeason(2019);
const A = buildTeam(S, 'PIT'), H = buildTeam(S, 'CHN');
const rng = mulberry32(3);
const stat = new Map();
for (let i = 0; i < 400; i++) {
  const sim = new Sim(A, H, { rng, dh: false });
  const r = sim.playGame();
  for (const ti of [0, 1]) for (const p of sim.st.pitSeen[ti]) {
    const b = sim.pbx(p); const s = stat.get(p.name) || { g: 0, bf: 0, k: 0, bb: 0, h: 0, hr: 0, r: 0, outs: 0 };
    s.g++; for (const k of ['bf', 'k', 'bb', 'h', 'hr', 'r', 'outs']) s[k] += b[k]; stat.set(p.name, s);
  }
  if (i === 0) { for (const l of sim.st.log.slice(0, 40)) console.log(l.text); }
}
for (const [n, s] of stat) console.log(n.padEnd(20), 'G', s.g, 'BF/G', (s.bf / s.g).toFixed(1), 'K%', (s.k / s.bf).toFixed(3), 'BB%', (s.bb / s.bf).toFixed(3), 'H%', (s.h / s.bf).toFixed(3), 'HR%', (s.hr / s.bf).toFixed(3), 'R/9', (s.r / (s.outs / 3) * 9).toFixed(1));
