// Per-team default lineups (batting order, positions, optional starting pitcher), saved on this device.
import { kvGet, kvSet } from './store.js';

const DEF = new Map();
let loaded = false;
export async function loadDefaultLineups() {
  if (loaded) return;
  loaded = true;
  const all = await kvGet('lineups', {});
  for (const [k, v] of Object.entries(all)) DEF.set(k, v);
}
const keyOf = (team, dh) => `${team.year}${team.code}:${(dh ?? team.dh) ? 1 : 0}`;
export const hasDefault = (team, dh) => DEF.has(keyOf(team, dh));

async function persist() { const o = {}; for (const [k, v] of DEF) o[k] = v; await kvSet('lineups', o); }

export async function saveDefaultLineup(team, dh) {
  const d = { order: team.lineup.map(x => ({ id: x.p.id, y: x.p.y, pos: x.pos })), sp: team.sp ? { id: team.sp.id, y: team.sp.y } : null, ts: Date.now() };
  DEF.set(keyOf(team, dh), d);
  await persist();
}
export async function clearDefaultLineup(team, dh) { DEF.delete(keyOf(team, dh)); await persist(); }

/** Replace an auto-built lineup with the saved default, if every saved player is still available. */
export function applyUserDefault(team) {
  const d = DEF.get(keyOf(team));
  if (!d) return team;
  const S = team.S;
  const lu = [];
  for (const o of d.order) {
    const pl = S.playersById.get(o.id);
    if (!pl) return team;
    lu.push({ p: team.P(pl.idx), pos: o.pos });
  }
  if (lu.length !== 9) return team;
  const before = team.lineup.map(x => x.p);
  const used = new Set(lu.map(x => x.p));
  team.lineup = lu;
  team.bench = [...team.bench, ...before].filter((p, i, a) => !used.has(p) && a.indexOf(p) === i && p.bat).slice(0, 9);
  if (d.sp) {
    const pl = S.playersById.get(d.sp.id);
    if (pl) { const sp = team.P(pl.idx); team.rotation = [sp, ...team.rotation.filter(x => x !== sp)]; team.sp = sp; team.bullpen = team.bullpen.filter(x => x !== sp); }
  }
  team.userDefault = true;
  return team;
}
