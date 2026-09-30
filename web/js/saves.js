// Saved runs: games in progress, seasons, custom leagues, tournaments and postseasons.
// Everything is deterministic from a seed, so a run is stored as {spec, cmds}: the setup plus the ordered list of things you
// did (sim a week, play game X with these moves, …). Resuming rebuilds the setup and replays the commands.
import { kvGet, kvSet } from './store.js';

const IDX = 'runs';
export const newId = kind => `${kind}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export async function listRuns() { return (await kvGet(IDX, [])).slice().sort((a, b) => b.ts - a.ts); }
export async function getRun(id) { return kvGet('run:' + id); }
export async function putRun(run) {
  run.ts = Date.now();
  await kvSet('run:' + run.id, run);
  const idx = await kvGet(IDX, []);
  const meta = { id: run.id, kind: run.kind, title: run.title, sub: run.sub || '', ts: run.ts, n: run.cmds ? run.cmds.length : 0, game: !!run.game };
  const i = idx.findIndex(x => x.id === run.id);
  if (i >= 0) idx[i] = meta; else idx.push(meta);
  await kvSet(IDX, idx);
}
export async function deleteRun(id) {
  await kvSet('run:' + id, null);
  await kvSet(IDX, (await kvGet(IDX, [])).filter(x => x.id !== id));
}

/** A run being recorded. Saves (debounced) after every command. */
export class Recorder {
  constructor(run) { this.run = run; this.t = null; this.replaying = false; run.cmds = run.cmds || []; }
  add(cmd) { if (this.replaying) return; this.run.cmds.push(cmd); this.touch(); }
  touch() { if (this.replaying) return; clearTimeout(this.t); this.t = setTimeout(() => putRun(this.run).catch(() => {}), 250); }
  async flush() { clearTimeout(this.t); await putRun(this.run); }
}

// ---- team edits (lineup screen) are stored as player keys so a replay can rebuild them
const idxOf = key => +String(key).split(':')[1];
export function teamSpec(t) {
  return { lineup: t.lineup.map(x => [x.p.key, x.pos]), sp: t.sp ? t.sp.key : null, bench: t.bench.map(p => p.key), bullpen: t.bullpen.map(p => p.key) };
}
export function applySpec(t, s) {
  if (!s) return t;
  const P = k => t.P(idxOf(k));
  t.lineup = s.lineup.map(([k, pos]) => ({ p: P(k), pos }));
  t.sp = s.sp ? P(s.sp) : t.sp;
  t.bench = s.bench.map(P);
  t.bullpen = s.bullpen.map(P);
  t.script = null;
  return t;
}
