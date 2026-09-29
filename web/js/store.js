// Local-first game archive. Every game's box score + play-by-play is kept in IndexedDB (falls back to memory).
// Records: 'games' store (metadata + box score), 'logs' store (gzip+base64 play-by-play), 'kv' store (settings).
const DB_NAME = 'diamond-sim', DB_VER = 1;
let dbPromise = null;
const mem = { games: new Map(), logs: new Map(), kv: new Map() };
const hasIDB = () => typeof indexedDB !== 'undefined';

function openDB() {
  if (!hasIDB()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      const g = db.createObjectStore('games', { keyPath: 'id' });
      g.createIndex('universe', 'universe'); g.createIndex('ts', 'ts');
      db.createObjectStore('logs', { keyPath: 'id' });
      db.createObjectStore('kv', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}
const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const txDone = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

// ---------------------------------------------------------------- gzip helpers (logs are ~10x smaller compressed)
export async function gz(text) {
  if (typeof CompressionStream === 'undefined') return 'raw:' + text;
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(s).arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return 'gz:' + btoa(bin);
}
export async function gunzip(str) {
  if (str.startsWith('raw:')) return str.slice(4);
  const bin = atob(str.slice(3));
  const buf = Uint8Array.from(bin, c => c.charCodeAt(0));
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(s).text();
}

// ---------------------------------------------------------------- API
export async function putGames(recs) {
  // recs: [{rec, log}] ; rec.synced defaults to false
  const db = await openDB();
  if (!db) { for (const { rec, log } of recs) { mem.games.set(rec.id, rec); if (log !== undefined) mem.logs.set(rec.id, { id: rec.id, log }); } return; }
  const tx = db.transaction(['games', 'logs'], 'readwrite');
  for (const { rec, log } of recs) { tx.objectStore('games').put(rec); if (log !== undefined) tx.objectStore('logs').put({ id: rec.id, log }); }
  await txDone(tx);
  notify();
}
export async function listGames(universe) {
  const db = await openDB();
  if (!db) return [...mem.games.values()].filter(g => !universe || g.universe === universe);
  const tx = db.transaction('games');
  const st = tx.objectStore('games');
  return universe ? await wrap(st.index('universe').getAll(universe)) : await wrap(st.getAll());
}
export async function getGame(id) {
  const db = await openDB();
  if (!db) return mem.games.get(id) || null;
  return (await wrap(db.transaction('games').objectStore('games').get(id))) || null;
}
export async function getLog(id) {
  const db = await openDB();
  const row = db ? await wrap(db.transaction('logs').objectStore('logs').get(id)) : mem.logs.get(id);
  return row ? JSON.parse(await gunzip(row.log)) : null;
}
export async function getRawLog(id) {
  const db = await openDB();
  const row = db ? await wrap(db.transaction('logs').objectStore('logs').get(id)) : mem.logs.get(id);
  return row ? row.log : null;
}
export async function deleteGames(ids) {
  const db = await openDB();
  if (!db) { ids.forEach(i => { mem.games.delete(i); mem.logs.delete(i); }); return; }
  const tx = db.transaction(['games', 'logs'], 'readwrite');
  for (const id of ids) { tx.objectStore('games').delete(id); tx.objectStore('logs').delete(id); }
  await txDone(tx); notify();
}
export async function kvGet(k, d = null) {
  const db = await openDB();
  if (!db) return mem.kv.has(k) ? mem.kv.get(k) : d;
  const row = await wrap(db.transaction('kv').objectStore('kv').get(k));
  return row ? row.v : d;
}
export async function kvSet(k, v) {
  const db = await openDB();
  if (!db) { mem.kv.set(k, v); return; }
  const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ k, v }); await txDone(tx);
}
export async function estimate() {
  try { if (navigator.storage?.estimate) return await navigator.storage.estimate(); } catch (e) { /* ignore */ }
  return null;
}
export async function requestPersistence() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch (e) { /* ignore */ }
  return false;
}
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { for (const f of listeners) try { f(); } catch (e) { /* ignore */ } }
