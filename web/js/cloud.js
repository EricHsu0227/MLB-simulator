// Sign in with Google / Apple (Firebase Auth) and sync the game archive through Firestore.
// The archive is local-first (IndexedDB); the cloud is a mirror so every device sees the same games.
import { FIREBASE_CONFIG } from './config.js';
import { listGames, putGames, getRawLog, kvGet, kvSet, onChange } from './store.js';

const V = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;
let sdk = null, app = null, auth = null, db = null, initP = null;
const state = { user: null, status: 'idle', msg: '', last: null };
const subs = new Set();
const emit = () => subs.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
const safeId = id => id.replace(/[\/\s]/g, '_');

export const cloud = {
  enabled: !!FIREBASE_CONFIG,
  get user() { return state.user; },
  get state() { return state; },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  init, signIn, signOut, syncNow,
};

async function loadSdk() {
  if (sdk) return sdk;
  const [a, au, fs] = await Promise.all([import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js'), import(CDN + 'firebase-firestore.js')]);
  sdk = { ...a, ...au, ...fs };
  return sdk;
}

function init() {
  if (!cloud.enabled) return Promise.resolve();
  if (initP) return initP;
  initP = (async () => {
    try {
      const s = await loadSdk();
      app = s.initializeApp(FIREBASE_CONFIG);
      auth = s.getAuth(app);
      db = s.getFirestore(app);
      try { await s.setPersistence(auth, s.browserLocalPersistence); } catch (e) { /* private mode */ }
      s.getRedirectResult(auth).catch(e => { state.msg = friendly(e); emit(); });
      s.onAuthStateChanged(auth, u => {
        state.user = u ? { uid: u.uid, name: u.displayName || u.email || 'Signed in', email: u.email || '', photo: u.photoURL || '', provider: u.providerData?.[0]?.providerId || '' } : null;
        state.status = u ? 'signed-in' : 'idle';
        emit();
        if (u) syncNow();
      });
      onChange(() => { if (state.user) debounceSync(); });
    } catch (e) {
      state.status = 'error'; state.msg = 'Could not load the sign-in service (' + e.message + '). You can keep playing; games are saved on this device.'; emit();
    }
  })();
  return initP;
}

function friendly(e) {
  const c = e && e.code || '';
  if (c === 'auth/unauthorized-domain') return 'This website address isn’t on your Firebase “Authorized domains” list yet (see docs/SETUP_LOGIN.md).';
  if (c === 'auth/operation-not-allowed') return 'That sign-in method isn’t enabled in your Firebase project yet.';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
  return (e && e.message) || 'Sign-in failed';
}

async function signIn(kind) {
  await init();
  if (!auth) return;
  const s = sdk;
  let provider;
  if (kind === 'apple') { provider = new s.OAuthProvider('apple.com'); provider.addScope('email'); provider.addScope('name'); }
  else { provider = new s.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); }
  state.msg = ''; state.status = 'signing-in'; emit();
  try {
    await s.signInWithPopup(auth, provider);
  } catch (e) {
    const c = e.code || '';
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(c)) {
      try { await s.signInWithRedirect(auth, provider); return; } catch (e2) { e = e2; }
    }
    state.status = 'idle'; state.msg = friendly(e); emit();
  }
}

async function signOut() {
  if (auth) await sdk.signOut(auth);
  state.user = null; state.status = 'idle'; emit();
}

let syncing = false, timer = null;
function debounceSync() { clearTimeout(timer); timer = setTimeout(syncNow, 4000); }

async function syncNow() {
  if (!state.user || !db || syncing) return;
  syncing = true;
  state.status = 'syncing'; state.msg = 'Syncing…'; emit();
  const s = sdk, uid = state.user.uid;
  let up = 0, down = 0;
  try {
    const col = s.collection(db, 'users', uid, 'games');
    // ---- push unsynced local games
    const local = await listGames();
    const dirty = local.filter(g => !g.synced);
    for (let i = 0; i < dirty.length; i += 25) {
      const chunk = dirty.slice(i, i + 25);
      const batch = s.writeBatch(db);
      const docs = [];
      for (const g of chunk) {
        const log = await getRawLog(g.id);
        const { synced, ...rec } = g;
        batch.set(s.doc(col, safeId(g.id)), { id: g.id, ts: g.ts, universe: g.universe, rec: JSON.stringify(rec), log: log || '' });
        docs.push({ ...g, synced: true });
      }
      await batch.commit();
      await putGames(docs.map(rec => ({ rec })));
      up += chunk.length;
    }
    // ---- pull newer remote games
    let last = await kvGet('cloud:lastPull:' + uid, 0);
    const byId = new Map(local.map(g => [g.id, g]));
    for (;;) {
      const q = s.query(col, s.where('ts', '>', last), s.orderBy('ts'), s.limit(200));
      const snap = await s.getDocs(q);
      if (snap.empty) break;
      const incoming = [];
      snap.forEach(d => {
        const x = d.data();
        const have = byId.get(x.id);
        if (!have || have.ts < x.ts) { const rec = JSON.parse(x.rec); rec.synced = true; incoming.push({ rec, log: x.log || undefined }); }
        if (x.ts > last) last = x.ts;
      });
      if (incoming.length) { await putGames(incoming); down += incoming.length; }
      if (snap.size < 200) break;
    }
    await kvSet('cloud:lastPull:' + uid, last);
    // ---- universe labels
    const uref = s.doc(db, 'users', uid, 'meta', 'universes');
    const usnap = await s.getDoc(uref);
    const mine = await kvGet('universes', {});
    const theirs = usnap.exists() ? JSON.parse(usnap.data().json || '{}') : {};
    const merged = { ...theirs, ...mine };
    await kvSet('universes', merged);
    await s.setDoc(uref, { json: JSON.stringify(merged) });
    state.last = Date.now();
    state.status = 'signed-in';
    state.msg = `Synced ${new Date(state.last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} — ${up} uploaded, ${down} downloaded`;
  } catch (e) {
    state.status = 'signed-in';
    state.msg = /permission/i.test(e.message || '') ? 'Sync blocked: publish the Firestore rules from docs/SETUP_LOGIN.md.' : 'Sync failed: ' + (e.message || e);
  } finally { syncing = false; emit(); }
}
