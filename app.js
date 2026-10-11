// Box Seat Baseball Table — UI
(function () {
const B = window.BSB, AI = window.BSB_AI, C = window.BSB_CHARTS;
const $ = (s, el) => (el || document).querySelector(s);
const main = $('#main');
let D = null;
const st = { prefs: null, tab: 'home', game: null, showUth: true, histFilter: { team: '', type: '', q: '' }, cardsTeam: 'NYA', exh: { away: 'LAN', home: 'NYA', n: 1, user: 'home', asPlayed: false }, seasonView: 'standings', leaderLg: 'AL' };
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Could not save to this browser — progress lives only in this tab.'); } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tn = (cid) => cid == null ? '—' : B.titleName(D.cards[cid].n);
const team = (c) => D.teams[c];
const tName = (c) => c === 'ATH' ? 'Athletics' : team(c).city + ' ' + team(c).nick;
const fmtDate = (d) => { const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+d.slice(4, 6) - 1]; return `${m} ${+d.slice(6, 8)}, ${d.slice(0, 4)}`; };
const dayNum = (d) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) / 864e5;
const avg3 = (x) => isFinite(x) ? x.toFixed(3).replace(/^0/, '') : '.000';
const ipStr = (outs) => Math.floor(outs / 3) + '.' + (outs % 3);
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
const TYN = { r: 'Regular season', WC: 'Wild Card', DS: 'Division Series', LCS: 'League Championship', WS: 'World Series' };
const TEAMLIST = () => Object.keys(D.teams).sort((a, b) => tName(a).localeCompare(tName(b)));
const teamSelect = (id, val) => `<select id="${id}">${TEAMLIST().map(c => `<option value="${c}"${c === val ? ' selected' : ''}>${esc(tName(c))}</option>`).join('')}</select>`;

// ======================================================
// boot
// ======================================================
st.prefs = Object.assign({ fatigue: 'L2H', bpEffects: true, wildPlays: true, autoRunner: true, speed: 'normal' }, store.get('bsb-prefs') || {});
document.addEventListener('keydown', e => { if (st.tab === 'game' && (e.code === 'Space' || e.key === 'Enter') && !/INPUT|SELECT|BUTTON|TEXTAREA/.test((e.target.tagName || ''))) { e.preventDefault(); playStep(); } });
fetch('bsb.json').then(r => r.json()).then(d => { D = d; D.gamesById = {}; D.games.forEach(g => D.gamesById[g.id] = g); loadState(); render(); })
  .catch(e => { main.innerHTML = `<div class="loading">Couldn't load the card data (${esc(e.message)}). Reload the page to try again.</div>`; });

$('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) { st.tab = b.dataset.tab; render(); window.scrollTo(0, 0); } });
main.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && !el.disabled) act(el.dataset.act, el, e); });
main.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el) chg(el.dataset.chg, el); });

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === st.tab ? 'true' : 'false'));
  if (!D) return;
  const v = { tour: vTour, records: vRecords, home: vHome, game: vGame, season: vSeason, post: vPost, exh: vExh, hist: vHist, cards: vCards, rules: vRules }[st.tab] || vHome;
  main.innerHTML = v();
  if (st.game && !st.game.busy) saveLive();
  if (st.tab === 'game') { const l = $('.log'); if (l) l.scrollTop = 0; }
}

// ======================================================
// state: season & postseason
// ======================================================
let S = null, P = null;
function loadState() {
  S = store.get('bsb-season'); P = store.get('bsb-post'); st.one = store.get('bsb-one'); st.exhSeries = store.get('bsb-exh'); st.tour = store.get('bsb-tour');
  const L = store.get('bsb-live');
  if (L && L.g) { try { st.game = { g: B.Game.restore(D, L.g), ctx: L.ctx, dec: {}, lowerTab: L.lowerTab, lastCall: L.lastCall, timers: [], resumed: true }; } catch (e) { store.del('bsb-live'); } }
}
let saveT = null;
function saveLive(now) {
  const GS = st.game; if (!GS) return;
  if (GS.g.over) { store.del('bsb-live'); return; }
  const doSave = () => { saveT = null; store.set('bsb-live', { g: GS.g, ctx: GS.ctx, lowerTab: GS.lowerTab, lastCall: GS.lastCall, ts: Date.now() }); };
  if (now) { if (saveT) clearTimeout(saveT); doSave(); } else if (!saveT) saveT = setTimeout(doSave, 250);
}
addEventListener('pagehide', () => saveLive(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveLive(true); });
function saveSeason() { if (S) store.set('bsb-season', S); }
function savePost() { if (P) store.set('bsb-post', P); }

function newSeason(asPlayed) {
  const sched = D.games.filter(g => g.ty === 'r').map(g => g.id);
  S = { asPlayed, sched, next: 0, rec: {}, bat: {}, pit: {}, res: {}, plog: {}, rot: {}, opts: readOpts() };
  Object.keys(D.teams).forEach(c => { S.rec[c] = { W: 0, L: 0, RS: 0, RA: 0, home: [0, 0], away: [0, 0], last10: [] }; S.rot[c] = 0; });
  saveSeason();
}
function pitchedRecently(stt, cid, day) {
  const L = stt.plog[cid]; if (!L) return false;
  const y = L.filter(x => day - x[0] === 1), y2 = L.filter(x => day - x[0] === 2);
  if (y.length && (y[0][1] >= 12 || y2.length)) return true;
  if (y2.length && y2[0][1] >= 25) return true;
  return false;
}
function pickStarter(stt, code, day) {
  const T = team(code); const rot = T.rot;
  const rest = (cid) => { const L = stt.plog[cid]; if (!L || !L.length) return 99; const last = L.filter(x => x[1] >= 12).map(x => x[0]); return last.length ? day - Math.max(...last) : 99; };
  for (let k = 0; k < rot.length; k++) { const cid = rot[(stt.rot[code] + k) % rot.length]; if (rest(cid) >= 5) { stt.rot[code] = (stt.rot[code] + k + 1) % rot.length; return cid; } }
  let best = rot[0], br = -1; rot.forEach(c => { const r = rest(c); if (r > br) { br = r; best = c; } });
  stt.rot[code] = (rot.indexOf(best) + 1) % rot.length;
  return best;
}
function tiredSet(stt, code, day) {
  const s = new Set();
  team(code).pit.forEach(c => { if (pitchedRecently(stt, c, day)) s.add(c); });
  return s;
}
function logPitching(stt, g, day) {
  g.teams.forEach(T => {
    Object.values(T.pit).forEach(p => { const L = stt.plog[p.cid] = (stt.plog[p.cid] || []).filter(x => day - x[0] < 7); L.push([day, p.BF]); });
  });
}
function accumulate(stt, g, gid) {
  const [a, h] = g.score; const codes = g.teams.map(T => T.code);
  g.teams.forEach((T, s) => {
    for (const b of Object.values(T.bat)) {
      const x = stt.bat[b.cid] = stt.bat[b.cid] || { G: 0, PA: 0, AB: 0, R: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, SO: 0, HBP: 0, SB: 0, CS: 0, SF: 0, SH: 0, tm: T.code };
      x.G++; for (const k of ['PA', 'AB', 'R', 'H', 'D', 'T', 'HR', 'RBI', 'BB', 'SO', 'HBP', 'SB', 'CS', 'SF', 'SH', 'IBB', 'WPA']) x[k] = (x[k] || 0) + (b[k] || 0);
    }
    for (const p of Object.values(T.pit)) {
      const x = stt.pit[p.cid] = stt.pit[p.cid] || { G: 0, GS: 0, W: 0, L: 0, SV: 0, OUTS: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, BF: 0, tm: T.code };
      x.G++; if (p.cid === T.spCid) x.GS++; if (p.dec === 'W') x.W++; if (p.dec === 'L') x.L++; if (p.dec === 'S') x.SV++;
      for (const k of ['OUTS', 'H', 'R', 'ER', 'BB', 'SO', 'HR', 'BF', 'HBP', 'D', 'T', 'SF', 'SH', 'IBB', 'WPA']) x[k] = (x[k] || 0) + (p[k] || 0);
    }
  });
  if (stt.rec) {
    const ra = stt.rec[codes[0]], rh = stt.rec[codes[1]];
    if (ra && rh) {
      const aw = a > h;
      ra.RS += a; ra.RA += h; rh.RS += h; rh.RA += a;
      if (aw) { ra.W++; rh.L++; ra.away[0]++; rh.home[1]++; } else { rh.W++; ra.L++; rh.home[0]++; ra.away[1]++; }
      ra.last10 = (ra.last10.concat([aw ? 'W' : 'L'])).slice(-10); rh.last10 = (rh.last10.concat([aw ? 'L' : 'W'])).slice(-10);
    }
  }
  const W = g.teams.flatMap(T => Object.values(T.pit)).find(p => p.dec === 'W'), L = g.teams.flatMap(T => Object.values(T.pit)).find(p => p.dec === 'L'), SV = g.teams.flatMap(T => Object.values(T.pit)).find(p => p.dec === 'S');
  stt.res[gid] = { sc: [a, h], inn: g.inning - (g.half === 0 ? 1 : 0), w: W && W.cid, l: L && L.cid, s: SV && SV.cid, line: g.line };
}
function seasonGameSetup(stt, ref, extra) {
  const day = dayNum(ref.d);
  const sp = [null, null];
  if (!stt.asPlayed) { sp[0] = pickStarter(stt, ref.v, day); sp[1] = pickStarter(stt, ref.h, day); }
  let lineups = null;
  if (!stt.asPlayed && stt.rec) lineups = [usageLineup(stt, ref.v, D.cards[sp[1]].th), usageLineup(stt, ref.h, D.cards[sp[0]].th)];
  return Object.assign({ lineups, away: ref.v, home: ref.h, date: ref.d, dn: ref.dn === 'd' ? 'D' : 'N', gameRef: ref, asPlayed: stt.asPlayed, seed: (Math.random() * 2 ** 31) | 0,
    weatherMode: stt.asPlayed ? 'actual' : 'roll', sp: stt.asPlayed ? null : sp, tired: [tiredSet(stt, ref.v, day), tiredSet(stt, ref.h, day)], opts: stt.opts, isPost: ref.ty !== 'r' }, extra || {});
}
// keep part-time players near their real 2025 playing time
function usageLineup(stt, code, oppThrows) {
  const lu = AI.defaultLineup(D, code, oppThrows).map(x => x.slice());
  const r = stt.rec[code]; const gp = r ? r.W + r.L : 0;
  if (gp < 10) return lu;
  const frac = gp / 162;
  const cardAB = (c) => (D.cards[c].L.ab || 0) + (D.cards[c].R.ab || 0);
  const over = (c) => { const x = stt.bat[c]; return x && x.AB > cardAB(c) * frac * 1.06 + 10; };
  const used = new Set(lu.map(x => x[0]));
  const canPlay = (c, pos) => pos === 'DH' || D.cards[c].pos.includes(pos) || (D.cards[c].allpos || []).includes(B.POSNUM[pos]) || (['LF', 'CF', 'RF'].includes(pos) && D.cards[c].pos.includes('OF'));
  for (const slot of lu) {
    if (!over(slot[0])) continue;
    const cand = team(code).bat.filter(c => !used.has(c) && !over(c) && canPlay(c, slot[1])).sort((a, b) => cardAB(b) - cardAB(a))[0];
    if (cand != null) { used.delete(slot[0]); used.add(cand); slot[0] = cand; }
  }
  return lu;
}
function simSeasonGames(count, untilDate, done) {
  let n = 0;
  const step = () => {
    const t0 = performance.now();
    while (S.next < S.sched.length && n < count && performance.now() - t0 < 40) {
      const ref = D.gamesById[S.sched[S.next]];
      if (untilDate && ref.d > untilDate) { n = count; break; }
      if (!S.res[ref.id]) {
        const g = AI.buildGame(D, seasonGameSetup(S, ref));
        AI.simGame(g);
        accumulate(S, g, ref.id); logPitching(S, g, dayNum(ref.d));
        archiveGame(g, 'season', 'Season replay', 'S:' + ref.id, false); st.recs = null;
      }
      S.next++; n++;
    }
    const pr = $('#simprog'); if (pr) pr.textContent = `Simulated through ${fmtDate(D.gamesById[S.sched[Math.max(0, S.next - 1)]].d)} (${S.next} / ${S.sched.length} games)`;
    if (S.next < S.sched.length && n < count) setTimeout(step, 0);
    else { saveSeason(); done && done(); }
  };
  step();
}

// ======================================================
// game session
// ======================================================
function startGame(setup, ctx) {
  const g = AI.buildGame(D, setup);
  const user = ctx.user || 'none';
  g.teams[0].ai = !(user === 'away' || user === 'both');
  g.teams[1].ai = !(user === 'home' || user === 'both');
  st.game = { g, ctx, setup, dec: {}, lastIdx: 0, timers: [] };
  saveLive(true);
  st.tab = 'game'; render(); window.scrollTo(0, 0);
}
function gameFinished() {
  const GS = st.game; if (!GS || GS.recorded) return;
  GS.recorded = true; store.del('bsb-live');
  const ctx = GS.ctx, g = GS.g;
  if (ctx.kind === 'season' && S) { accumulate(S, g, ctx.gid); logPitching(S, g, dayNum(g.date)); while (S.next < S.sched.length && S.res[S.sched[S.next]]) S.next++; saveSeason(); }
  if (ctx.kind === 'post' && P) { recordSeriesGame(P, ctx.sid, g); savePost(); }
  if (ctx.kind === 'exh' && st.exhSeries) { recordSeriesGame(st.exhSeries, 'x', g); store.set('bsb-exh', st.exhSeries); }
  if (ctx.kind === 'tour' && st.tour) tourRecord(st.tour, ctx, g);
  if (ctx.kind === 'one' && st.one) { recordSeriesGame(st.one, ctx.sid, g); store.set('bsb-one', st.one); }
  const sid = ctx.sid ? seriesLabel(ctx.kind === 'post' ? P : ctx.kind === 'one' ? st.one : st.exhSeries, ctx.sid) : '';
  const id = ctx.kind === 'season' ? 'S:' + ctx.gid : (ctx.kind + ':' + Date.now());
  archiveGame(g, ctx.kind, KINDN[ctx.kind] + (sid ? ' · ' + sid : '') + (ctx.kind === 'hist' ? ' · real ' + TYN[D.gamesById[ctx.ref].ty].toLowerCase() + ' game' : ''), id, true);
  st.recs = null;
}
function seriesLabel(obj, sid) {
  if (!obj) return '';
  const s = obj.series ? obj.series.find(x => x.id === sid) : obj; if (!s) return '';
  return `${s.round === 'EXH' ? 'Series' : TYN[s.round] || s.round} game ${s.games.length}`;
}
function stepGame(mode) {
  const GS = st.game; if (!GS) return; const g = GS.g;
  if (g.over || GS.busy) return;
  GS.auto = false;
  const startInn = g.inning, startHalf = g.half;
  let guard = 0;
  const once = () => {
    const userDec = Object.keys(GS.dec).length ? GS.dec : null;
    AI.aiStep(g, userDec); GS.dec = {}; guard++;
  };
  if (mode === 'pa') once();
  else if (mode === 'half') { do { once(); } while (!g.over && g.inning === startInn && g.half === startHalf && guard < 200); }
  else if (mode === 'end') {
    const saved = g.teams.map(T => T.ai); g.teams.forEach(T => T.ai = true);
    while (!g.over && guard < 3000) once();
    g.teams.forEach((T, i) => T.ai = saved[i]);
  }
  if (g.over) gameFinished();
  const last = g.log.filter(e => e.type !== 'SUB').pop(); GS.lastCall = callFor(last);
  render();
}

// ======================================================
// actions
// ======================================================
function act(a, el) {
  const GS = st.game, g = GS && GS.g;
  const v = el.dataset.v;
  switch (a) {
    case 'tab': st.tab = v; render(); window.scrollTo(0, 0); return;
    case 'pa': return playStep();
    case 'skip': skipAnim(); return;
    case 'auto': { GS.auto = !GS.auto; if (GS.auto && !GS.busy) playStep(); else render(); return; }
    case 'ltab': GS.lowerTab = v; render(); return;
    case 'dsub': { const side = +el.dataset.side; const out = +$('#phout2').value, inn = +$('#phin2').value; if (isNaN(out) || isNaN(inn)) return; const slot = g.teams[side].lineup.find(x => x.cid === out); g.substitute(side, out, inn, slot.pos, 'Defensive replacement'); render(); return; }
    case 'half': return stepGame('half');
    case 'end': return stepGame('end');
    case 'uth': st.showUth = !st.showUth; render(); return;
    case 'dec': { const k = v; if (k === 'steal2' || k === 'steal3') { const from = k === 'steal2' ? 0 : 1; const ev = g.stealEvent(from, { skipJump: false }); if (g.over) gameFinished(); render(); return; }
      GS.dec[k] = !GS.dec[k]; if (k === 'bunt' && GS.dec.bunt) { delete GS.dec.hitRun; delete GS.dec.squeeze; } if (k === 'hitRun' && GS.dec.hitRun) { delete GS.dec.bunt; delete GS.dec.squeeze; }
      if (k === 'squeeze' && GS.dec.squeeze) { delete GS.dec.bunt; delete GS.dec.hitRun; }
      if (k === 'guardLines') { g.def.guardLines = !g.def.guardLines; delete GS.dec.guardLines; }
      render(); return; }
    case 'pchange': { const sel = $('#pensel'); if (!sel || !sel.value) return; const side = +el.dataset.side; g.changePitcher(side, +sel.value, 'manager decision'); render(); return; }
    case 'ph': { const side = +el.dataset.side; const out = +$('#phout').value, inn = +$('#phin').value; if (isNaN(out) || isNaN(inn)) return; const slot = g.teams[side].lineup.find(x => x.cid === out); g.substitute(side, out, inn, slot.pos, el.dataset.kind || 'Pinch hitter'); render(); return; }
    case 'autoside': { const side = +el.dataset.side; g.teams[side].ai = !g.teams[side].ai; render(); return; }
    case 'style': { const side = +el.dataset.side; g.teams[side].style = $('#stylesel').value; render(); return; }
    // ----- exhibition -----
    case 'exh-start': {
      const x = st.exh; x.away = $('#exaway').value; x.home = $('#exhome').value; x.n = +$('#exn').value; x.user = $('#exuser').value;
      if (x.away === x.home) { toast('Pick two different teams.'); return; }
      const opts = readOpts();
      st.exhSeries = { id: 'x', hi: x.home, lo: x.away, best: x.n, fixed: $('#exfmt').value === 'fixed', wins: { [x.home]: 0, [x.away]: 0 }, games: [], round: 'EXH', opts, user: x.user, tired: {} };
      store.set('bsb-exh', x.n === 1 ? null : st.exhSeries);
      if (x.n === 1) { st.exhSeries = null; startGame({ away: x.away, home: x.home, date: '20250715', dn: Math.random() < .3 ? 'D' : 'N', seed: (Math.random() * 2 ** 31) | 0, opts }, { kind: 'exh', user: x.user }); return; }
      render(); return;
    }
    case 'exh-next': { const s = st.exhSeries; const gs = seriesGameSetup(s, null); startGame(gs.setup, { kind: 'exh', user: s.user, sid: 'x' }); return; }
    case 'exh-sim': { const s = st.exhSeries; simSeriesGame(s, null); store.set('bsb-exh', s); render(); return; }
    case 'exh-simall': { const s = st.exhSeries; let k = 0; while (!seriesOver(s) && k++ < 20) simSeriesGame(s, null); store.set('bsb-exh', s); render(); return; }
    case 'exh-reset': st.exhSeries = null; store.del('bsb-exh'); render(); return;
    // ----- historical -----
    case 'hist-play': case 'hist-sim': {
      const ref = D.gamesById[v]; const asP = $('#hasp').checked, wx = $('#hwx').checked, user = $('#huser').value;
      const setup = { away: ref.v, home: ref.h, date: ref.d, dn: ref.dn === 'd' ? 'D' : 'N', gameRef: ref, asPlayed: asP, seed: (Math.random() * 2 ** 31) | 0, weatherMode: wx ? 'actual' : 'roll', isPost: ref.ty !== 'r', opts: readOpts() };
      if (a === 'hist-sim') { startGame(setup, { kind: 'hist', user: 'none', ref: ref.id }); stepGame('end'); return; }
      startGame(setup, { kind: 'hist', user, ref: ref.id }); return;
    }
    case 'hist-more': st.histLimit = (st.histLimit || 60) + 120; render(); return;
    // ----- season -----
    case 'season-new': { newSeason($('#sasp') ? $('#sasp').checked : false); render(); return; }
    case 'season-reset': { if (el.dataset.confirm !== 'yes') { el.dataset.confirm = 'yes'; el.textContent = 'Click again to erase the season and its game history'; return; } S = null; store.del('bsb-season'); ARC.clearKind('season'); st.recs = null; render(); return; }
    case 'season-sim': { const n = +v; el.disabled = true; simSeasonGames(n === 0 ? 99999 : n, null, render); return; }
    case 'season-simday': { const d = D.gamesById[S.sched[S.next]].d; simSeasonGames(99999, d, render); return; }
    case 'season-simweek': { const d0 = D.gamesById[S.sched[S.next]].d; const t = new Date(Date.UTC(+d0.slice(0, 4), +d0.slice(4, 6) - 1, +d0.slice(6, 8) + 6)); const d = t.toISOString().slice(0, 10).replace(/-/g, ''); simSeasonGames(99999, d, render); return; }
    case 'season-play': { const ref = D.gamesById[v]; const user = $('#suser') ? $('#suser').value : 'home'; startGame(seasonGameSetup(S, ref), { kind: 'season', gid: ref.id, user }); return; }
    case 'season-view': st.seasonView = v; render(); return;
    case 'lg': st.leaderLg = v; render(); return;
    case 'season-to-post': { P = newPost(seedsFromSeason(), { asPlayed: false, from: 'season' }); savePost(); st.tab = 'post'; render(); return; }
    // ----- postseason -----
    case 'post-new': { P = newPost(REAL_SEEDS, { asPlayed: $('#pasp').checked, from: '2025' }); savePost(); render(); return; }
    case 'post-reset': { if (el.dataset.confirm !== 'yes') { el.dataset.confirm = 'yes'; el.textContent = 'Click again to erase'; return; } P = null; store.del('bsb-post'); ARC.clearKind('post'); st.recs = null; render(); return; }
    case 'post-play': { const s = P.series.find(x => x.id === v); const gs = seriesGameSetup(s, P); startGame(gs.setup, { kind: 'post', sid: s.id, user: $('#puser').value === 'both' ? 'both' : ($('#puser').value === 'hi' ? (gs.homeIsHi ? 'home' : 'away') : $('#puser').value === 'lo' ? (gs.homeIsHi ? 'away' : 'home') : 'none') }); return; }
    case 'post-sim': { const s = P.series.find(x => x.id === v); simSeriesGame(s, P); advancePost(P); savePost(); render(); return; }
    case 'post-simser': { const s = P.series.find(x => x.id === v); let k = 0; while (!seriesOver(s) && k++ < 10) simSeriesGame(s, P); advancePost(P); savePost(); render(); return; }
    case 'post-simround': { let k = 0; const r = P.round; P.series.filter(s => s.round === r && s.hi && s.lo).forEach(s => { while (!seriesOver(s) && k++ < 60) simSeriesGame(s, P); }); advancePost(P); savePost(); render(); return; }
    case 'post-simall': { let guard = 0; while (!P.champ && guard++ < 10) { P.series.filter(s => s.round === P.round && s.hi && s.lo).forEach(s => { let k = 0; while (!seriesOver(s) && k++ < 10) simSeriesGame(s, P); }); advancePost(P); } savePost(); render(); return; }
    // ----- tournaments -----
    case 'tpick': { const sel = st.tourPick = st.tourPick || []; const i = sel.indexOf(v); if (i >= 0) sel.splice(i, 1); else sel.push(v); st.tourName = ($('#tname') || {}).value || st.tourName; render(); return; }
    case 'tq': { const all = TEAMLIST(); st.tourName = ($('#tname') || {}).value || st.tourName;
      st.tourPick = v === 'NONE' ? [] : v === 'ALL' ? all.slice() : v === 'P25' ? REAL_SEEDS.AL.concat(REAL_SEEDS.NL) : all.filter(c => D.teams[c].lg === v); render(); return; }
    case 'tour-new': {
      let teams = (st.tourPick || []).slice(); const fmt = $('#tfmt').value; const seed = $('#tseed').value;
      const w25 = { TOR: 94, SEA: 90, CLE: 88, NYA: 94, BOS: 89, DET: 87, MIL: 97, PHI: 96, LAN: 93, CHN: 92, SDN: 90, CIN: 83 };
      const realW = (c) => { const gs = D.games.filter(g => g.ty === 'r' && (g.v === c || g.h === c)); return gs.filter(g => (g.v === c) === (g.sc[0] > g.sc[1])).length; };
      if (seed === 'record' || fmt !== 'bracket') teams.sort((a, b) => realW(b) - realW(a));
      if (seed === 'random') for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [teams[i], teams[j]] = [teams[j], teams[i]]; }
      const poSize = Math.min(+$('#tpo').value, teams.length);
      st.tour = newTour({ name: $('#tname').value || 'Tournament', teams, format: fmt, rrGames: +$('#trr').value, poSize: Math.max(2, poSize), bestPO: +$('#tbest').value, bestFinal: +$('#tfinal').value, myTeam: $('#tmy').value, seedOrder: teams });
      store.set('bsb-tour', st.tour); render(); return; }
    case 'tour-reset': { if (!st.tour.champ && el.dataset.confirm !== 'yes') { el.dataset.confirm = 'yes'; el.textContent = 'Click again to abandon'; return; } st.tour = null; store.del('bsb-tour'); render(); return; }
    case 'tour-play-rr': { const t = st.tour; const i = tourNextRR(t); const x = t.rr[i]; startGame(tourGameSetup(t, x.v, x.h, x.day), { kind: 'tour', rr: i, user: tourUser(t, x.v, x.h) }); return; }
    case 'tour-sim-rr': { tourSimRR(st.tour, +v); render(); return; }
    case 'tour-play-s': { const t = st.tour; const s = t.series.find(x => x.id === v); const gs = seriesGameSetup(s, t); startGame(gs.setup, { kind: 'tour', sid: s.id, user: tourUser(t, gs.setup.away, gs.setup.home) }); return; }
    case 'tour-sim-s': { const t = st.tour; tourSimSeries(t, t.series.find(x => x.id === v), false); render(); return; }
    case 'tour-sim-ser': { const t = st.tour; tourSimSeries(t, t.series.find(x => x.id === v), true); render(); return; }
    case 'tour-sim-all': { const t = st.tour; let guard = 0; while (!t.champ && guard++ < 200) { const open = t.series.filter(s => !seriesOver(s)); if (!open.length) break; open.forEach(s => tourSimSeries(t, s, true)); } store.set('bsb-tour', t); render(); return; }
    // ----- records / export -----
    case 'rec-view': st.recOpen = st.recOpen === v ? null : v; render(); return;
    case 'rec-export': { const r = (st.recs || []).find(x => x.id === v); if (r) offerFile(fileBase(r) + '.txt', gameText(r)); return; }
    case 'rec-bulk': { const recs = scopedRecs(); if (!recs.length) { toast('No games in this scope yet.'); return; } const sc = (st.recScope || 'all');
      if (v === 'txt') offerFile(`box-seat-${sc}-games.txt`, recs.slice().sort(recSort).map(gameText).join('\n\n' + '='.repeat(72) + '\n\n'));
      if (v === 'json') offerFile(`box-seat-${sc}-games.json`, JSON.stringify(recs.slice().sort(recSort), null, 1));
      if (v === 'pbp') offerFile(`box-seat-${sc}-play-by-play.csv`, pbpCSV(recs.slice().sort(recSort)));
      if (v === 'bat') offerFile(`box-seat-${sc}-batting.csv`, battingCSV(statsFromRecords(recs).bat));
      if (v === 'pit') offerFile(`box-seat-${sc}-pitching.csv`, pitchingCSV(statsFromRecords(recs).pit));
      return; }
    case 'rec-close': st.exportText = null; render(); return;
    case 'rec-copy': { const ta = $('#exporttext'); try { navigator.clipboard.writeText(ta.value).then(() => toast('Copied'), () => { ta.select(); toast('Selected — press copy'); }); } catch (e) { ta.select(); } return; }
    case 'game-pbp': { const r = archiveLike(g); if (v === 'csv') offerFile(fileBase(r) + '-pbp.csv', pbpCSV([r])); else offerFile(fileBase(r) + '-pbp.txt', pbpText(r)); return; }
    case 'rec-pbp': { const r = (st.recs || []).find(x => x.id === v); if (r) offerFile(fileBase(r) + '-pbp.csv', pbpCSV([r])); return; }
    case 'game-export': { const r = archiveLike(g); offerFile(fileBase(r) + '.txt', gameText(r)); return; }
    case 'rec-more': st.recLimit = (st.recLimit || 100) + 200; render(); return;
    // ----- single series -----
    case 'one-new': {
      const pick = $('#onepick').value; let hi, lo, round;
      if (pick === 'custom') { hi = $('#onehi').value; lo = $('#onelo').value; round = $('#oneround').value; if (hi === lo) { toast('Pick two different teams.'); return; } }
      else { const r = realSeries().find(x => x.key === pick); hi = r.hi; lo = r.lo; round = r.ty; }
      const best = { WC: 3, DS: 5, LCS: 7, WS: 7 }[round];
      st.one = { from: 'one', asPlayed: $('#oneasp').checked, opts: readOpts(), plog: {}, rot: {}, user: $('#oneuser').value,
        series: [{ id: 'ONE', round, best, hi, lo, lg: 'MLB', wins: { [hi]: 0, [lo]: 0 }, games: [], winner: null }] };
      store.set('bsb-one', st.one); render(); return;
    }
    case 'one-play': { const s = st.one.series[0]; const gs = seriesGameSetup(s, st.one); const u = st.one.user; startGame(gs.setup, { kind: 'one', sid: 'ONE', user: u === 'both' ? 'both' : u === 'hi' ? (gs.homeIsHi ? 'home' : 'away') : u === 'lo' ? (gs.homeIsHi ? 'away' : 'home') : 'none' }); return; }
    case 'one-sim': { simSeriesGame(st.one.series[0], st.one); store.set('bsb-one', st.one); render(); return; }
    case 'one-simser': { const s = st.one.series[0]; let k = 0; while (!seriesOver(s) && k++ < 10) simSeriesGame(s, st.one); store.set('bsb-one', st.one); render(); return; }
    case 'one-reset': st.one = null; store.del('bsb-one'); render(); return;
    // ----- cards -----
    case 'box': st.boxOpen = !st.boxOpen; render(); return;
  }
}
function chg(k, el) {
  if (k === 'hist-team') { st.histFilter.team = el.value; render(); }
  if (k === 'hist-type') { st.histFilter.type = el.value; render(); }
  if (k === 'hist-date') { st.histFilter.date = el.value.replace(/-/g, ''); render(); }
  if (k === 'cards-team') { st.cardsTeam = el.value; render(); }
  if (k === 'pref') { st.prefs[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; store.set('bsb-prefs', st.prefs); }
  if (k === 'stepmode') { st.prefs.stepMode = el.checked; store.set('bsb-prefs', st.prefs); if (st.game && !st.game.busy) render(); }
  if (k === 'speed') { st.prefs.speed = el.value; store.set('bsb-prefs', st.prefs); }
  if (k === 'rec-scope') { st.recScope = el.value; render(); }
  if (k === 'rec-team') { st.recTeam = el.value; render(); }
  if (k === 'one-pick') { st.onePick = el.value; render(); }
}
function readOpts() { const p = st.prefs; return { fatigue: p.fatigue, wildPlays: p.wildPlays, bpEffects: p.bpEffects, autoRunner: p.autoRunner }; }
const FATIGUE_OPTS = [['L1', 'Level 1 fatigue'], ['L2', 'Level 2 fatigue'], ['L2H', 'Level 2, relievers' + "'" + ' rating halved']];
const optsBlock = () => { const p = st.prefs; return `<div class="row opts"><label class="fld">Pitcher fatigue <select data-chg="pref" data-k="fatigue">${FATIGUE_OPTS.map(([v, l]) => `<option value="${v}" ${p.fatigue === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  <label class="chk"><input type="checkbox" data-chg="pref" data-k="bpEffects" ${p.bpEffects ? 'checked' : ''}> Optional ballpark range effects</label>
  <label class="chk"><input type="checkbox" data-chg="pref" data-k="wildPlays" ${p.wildPlays ? 'checked' : ''}> Wild plays</label>
  <label class="chk"><input type="checkbox" data-chg="pref" data-k="autoRunner" ${p.autoRunner ? 'checked' : ''}> Runner on 2nd in extra innings</label></div>`; };


// ======================================================
// game archive (IndexedDB) + export
// ======================================================
const ARC = {
  db: null, mem: new Map(), q: [], t: null,
  open() {
    if (this.p) return this.p;
    this.p = new Promise(res => {
      try {
        const r = indexedDB.open('bsb-archive', 1);
        r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('games')) d.createObjectStore('games', { keyPath: 'id' }); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    return this.p;
  },
  put(rec) { this.mem.set(rec.id, rec); this.q.push(rec); if (!this.t) this.t = setTimeout(() => this.flush(), 300); },
  async flush() {
    this.t = null; const batch = this.q.splice(0); const db = await this.open(); if (!db || !batch.length) return;
    try { const tx = db.transaction('games', 'readwrite'); const os = tx.objectStore('games'); batch.forEach(r => os.put(r)); } catch (e) { }
  },
  async all() {
    const db = await this.open(); if (this.q.length) await this.flush();
    if (!db) return Array.from(this.mem.values());
    return new Promise(res => { try { const r = db.transaction('games').objectStore('games').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res(Array.from(this.mem.values())); } catch (e) { res(Array.from(this.mem.values())); } });
  },
  async clearKind(kind) {
    for (const [k, v] of this.mem) if (v.kind === kind) this.mem.delete(k);
    const db = await this.open(); if (!db) return;
    const all = await this.all();
    try { const tx = db.transaction('games', 'readwrite'); const os = tx.objectStore('games'); all.filter(r => r.kind === kind).forEach(r => os.delete(r.id)); } catch (e) { }
  }
};
const KINDN = { tour: 'Tournament', season: 'Season replay', post: 'Postseason', one: 'Single series', exh: 'Exhibition', hist: 'Real game replay' };
function archiveGame(g, kind, label, id, keepUth) {
  const box = g.teams.map(T => ({
    code: T.code, name: T.name, abbr: T.abbr,
    bat: Object.values(T.bat).sort((a, b) => (a.order - b.order) || ((a.sub ? 1 : 0) - (b.sub ? 1 : 0))).map(b => ({ cid: b.cid, n: tn(b.cid), pos: b.pos, sub: !!b.sub, PA: b.PA, AB: b.AB, R: b.R, H: b.H, D: b.D, T: b.T, HR: b.HR, RBI: b.RBI, BB: b.BB, SO: b.SO, HBP: b.HBP, SB: b.SB, CS: b.CS, SF: b.SF, SH: b.SH, GDP: b.GDP, IBB: b.IBB || 0, WPA: +(b.WPA || 0).toFixed(4) })),
    pit: T.pitOrder.map(cid => { const p = T.pit[cid]; return { cid, n: tn(cid), GS: cid === T.spCid ? 1 : 0, OUTS: p.OUTS, BF: p.BF, H: p.H, R: p.R, ER: p.ER, BB: p.BB, SO: p.SO, HR: p.HR, HBP: p.HBP, WP: p.WP, D: p.D || 0, T: p.T || 0, SF: p.SF || 0, SH: p.SH || 0, IBB: p.IBB || 0, WPA: +(p.WPA || 0).toFixed(4), dec: p.dec }; })
  }));
  const w = g.weather || {};
  const rec = { id: id || ('X' + Date.now() + Math.random().toString(36).slice(2, 6)), kind, label: label || KINDN[kind], date: g.date || '', ts: Date.now(),
    park: g.park.name, wx: `${w.temp}° ${w.dn === 'D' ? 'day' : 'night'}, ${w.roof ? 'roof closed' : (w.dir ? `wind ${w.speed} mph ${C.windDir[w.dir].toLowerCase()}` : 'calm')}`,
    score: g.score.slice(), line: g.line.map(l => l.slice()), hits: g.hits.slice(), errors: g.errors.slice(), inn: g.inning - (g.half === 0 ? 1 : 0), box,
    pbp: g.log.map(e => [e.inning, e.half, e.desc || '', keepUth && e.lines ? e.lines.filter(l => !String(l[0]).startsWith('res')).map(l => l[1]) : null,
      e.type === 'SUB' ? { t: 'SUB' } : { t: e.type, b: e.batter != null ? tn(e.batter) : '', run: e.runner != null ? tn(e.runner) : '', p: e.pitcher != null ? tn(e.pitcher) : '', o: e.outsBefore, s: e.sitBefore || '', r: e.result || '', sc: e.scoreAfter || null, weB: e.weB != null ? +e.weB.toFixed(4) : null, weA: e.weA != null ? +e.weA.toFixed(4) : null, wpa: e.wpa != null ? +e.wpa.toFixed(4) : null }]) };
  ARC.put(rec);
  return rec;
}
function gameText(r) {
  const L = [];
  const pad = (x, n) => String(x).padStart(n), padE = (x, n) => String(x).padEnd(n);
  L.push(`${r.box[0].name} ${r.score[0]}, ${r.box[1].name} ${r.score[1]}${r.inn > 9 ? ` (${r.inn} inn.)` : ''}`);
  L.push(`${r.label}${r.date ? ' · ' + fmtDate(r.date) : ''} · ${r.park} · ${r.wx}`);
  L.push('');
  const n = Math.max(9, r.line[0].length, r.line[1].length);
  L.push(padE('', 6) + Array.from({ length: n }, (_, i) => pad(i + 1, 3)).join('') + '    R  H  E');
  [0, 1].forEach(s => L.push(padE(r.box[s].abbr, 6) + Array.from({ length: n }, (_, i) => pad(r.line[s][i] == null ? (i < r.line[s].length ? '' : 'x') : r.line[s][i], 3)).join('') + '  ' + pad(r.score[s], 3) + pad(r.hits[s], 3) + pad(r.errors[s], 3)));
  for (const T of r.box) {
    L.push(''); L.push(T.name.toUpperCase());
    L.push(padE('Batter', 28) + ['AB', 'R', 'H', 'RBI', 'BB', 'SO', '2B', '3B', 'HR'].map(h => pad(h, 4)).join('') + pad('WPA', 8));
    T.bat.forEach(b => L.push(padE((b.sub ? '  ' : '') + b.n + ' ' + b.pos, 28) + [b.AB, b.R, b.H, b.RBI, b.BB, b.SO, b.D, b.T, b.HR].map(v => pad(v, 4)).join('') + pad(b.WPA != null ? wpaStr(b.WPA) : '', 8)));
    L.push(padE('Pitcher', 28) + ['IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR'].map(h => pad(h, 5)).join('') + pad('WPA', 8));
    T.pit.forEach(p => L.push(padE(p.n + (p.dec ? ` (${p.dec})` : ''), 28) + [ipStr(p.OUTS), p.H, p.R, p.ER, p.BB, p.SO, p.HR].map(v => pad(v, 5)).join('') + pad(p.WPA != null ? wpaStr(p.WPA) : '', 8)));
  }
  if (r.pbp && r.pbp.length) {
    L.push(''); L.push('PLAY-BY-PLAY'); let key = null;
    for (const [inn, half, d, uth] of r.pbp) {
      const k = inn + '-' + half; if (k !== key) { key = k; L.push(`-- ${half === 0 ? 'Top' : 'Bottom'} ${B.ord(inn)} (${r.box[half].abbr} batting)`); }
      if (d) L.push('  ' + d);
      if (uth) uth.forEach(u => L.push('      ' + u));
    }
  }
  return L.join('\n');
}
const csvEsc = (v) => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
function statsFromRecords(recs) {
  const bat = {}, pit = {};
  for (const r of recs) for (const T of r.box) {
    for (const b of T.bat) { const x = bat[b.cid] = bat[b.cid] || { n: b.n, tm: T.abbr, G: 0, PA: 0, AB: 0, R: 0, H: 0, D: 0, T: 0, HR: 0, RBI: 0, BB: 0, IBB: 0, SO: 0, HBP: 0, SB: 0, CS: 0, SF: 0, SH: 0, GDP: 0, WPA: 0 }; x.G++; for (const k in x) if (typeof x[k] === 'number' && k !== 'G' && b[k] != null) x[k] += b[k]; }
    for (const p of T.pit) { const x = pit[p.cid] = pit[p.cid] || { n: p.n, tm: T.abbr, G: 0, GS: 0, W: 0, L: 0, SV: 0, OUTS: 0, BF: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, HBP: 0, D: 0, T: 0, SF: 0, SH: 0, IBB: 0, WPA: 0 }; x.G++; x.GS += p.GS; if (p.dec === 'W') x.W++; if (p.dec === 'L') x.L++; if (p.dec === 'S') x.SV++; for (const k of ['OUTS', 'BF', 'H', 'R', 'ER', 'BB', 'SO', 'HR', 'HBP', 'D', 'T', 'SF', 'SH', 'IBB', 'WPA']) x[k] += p[k] || 0; }
  }
  return { bat, pit };
}
const WW = { BB: .689, HBP: .720, S: .882, D: 1.254, T: 1.590, HR: 2.050 };
function wobaBat(x) { const ubb = (x.BB || 0) - (x.IBB || 0); const s1 = x.H - x.D - x.T - x.HR; const den = (x.AB || 0) + ubb + (x.SF || 0) + (x.HBP || 0); return den ? (WW.BB * ubb + WW.HBP * (x.HBP || 0) + WW.S * s1 + WW.D * x.D + WW.T * x.T + WW.HR * x.HR) / den : null; }
function wobaPit(x) { const ubb = (x.BB || 0) - (x.IBB || 0); const s1 = x.H - (x.D || 0) - (x.T || 0) - x.HR; const den = (x.BF || 0) - (x.IBB || 0) - (x.SH || 0); return den > 0 ? (WW.BB * ubb + WW.HBP * (x.HBP || 0) + WW.S * s1 + WW.D * (x.D || 0) + WW.T * (x.T || 0) + WW.HR * x.HR) / den : null; }
const f3 = (v) => v == null || !isFinite(v) ? '' : v.toFixed(3);
const wpaStr = (v) => v == null ? '' : (v >= 0 ? '+' : '') + v.toFixed(3);
function battingCSV(bat) {
  const head = ['Player', 'Team', 'G', 'PA', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'IBB', 'SO', 'HBP', 'SB', 'CS', 'SF', 'SH', 'GDP', 'AVG', 'OBP', 'SLG', 'OPS', 'wOBA', 'WPA'];
  const rows = Object.values(bat).sort((a, b) => b.PA - a.PA).map(x => {
    const avg = x.H / (x.AB || 1), obp = (x.H + x.BB + x.HBP) / ((x.AB + x.BB + x.HBP + x.SF) || 1), slg = (x.H + x.D + 2 * x.T + 3 * x.HR) / (x.AB || 1);
    return [x.n, x.tm, x.G, x.PA, x.AB, x.R, x.H, x.D, x.T, x.HR, x.RBI, x.BB, x.IBB || 0, x.SO, x.HBP, x.SB, x.CS, x.SF, x.SH, x.GDP, avg.toFixed(3), obp.toFixed(3), slg.toFixed(3), (obp + slg).toFixed(3), f3(wobaBat(x)), (x.WPA || 0).toFixed(3)];
  });
  return [head].concat(rows).map(r => r.map(csvEsc).join(',')).join('\n');
}
function pitchingCSV(pit) {
  const head = ['Pitcher', 'Team', 'G', 'GS', 'W', 'L', 'SV', 'IP', 'BF', 'H', '2B', '3B', 'R', 'ER', 'BB', 'IBB', 'SO', 'HR', 'HBP', 'ERA', 'WHIP', 'K/9', 'BB/9', 'wOBA allowed', 'WPA'];
  const rows = Object.values(pit).sort((a, b) => b.OUTS - a.OUTS).map(x => { const ip = x.OUTS / 3 || 0.0001; return [x.n, x.tm, x.G, x.GS, x.W, x.L, x.SV, ipStr(x.OUTS), x.BF, x.H, x.D || 0, x.T || 0, x.R, x.ER, x.BB, x.IBB || 0, x.SO, x.HR, x.HBP, (x.ER * 9 / ip).toFixed(2), ((x.H + x.BB) / ip).toFixed(2), (x.SO * 9 / ip).toFixed(1), (x.BB * 9 / ip).toFixed(1), f3(wobaPit(x)), (x.WPA || 0).toFixed(3)]; });
  return [head].concat(rows).map(r => r.map(csvEsc).join(',')).join('\n');
}
function pbpCSV(recs) {
  const head = ['Game', 'Date', 'Type', 'Away', 'Home', 'Inning', 'Half', 'Batting', 'Batter', 'Pitcher', 'Outs before', 'Runners before', 'Result', 'Play', 'Away score', 'Home score', 'Home win exp before', 'Home win exp after', 'WPA (batting team)'];
  const rows = [];
  for (const r of recs) {
    const sitN = (s) => !s ? 'empty' : s.split('').map(c => ({ 1: '1st', 2: '2nd', 3: '3rd' }[c])).join(' & ');
    for (const e of r.pbp || []) {
      const x = e[4] || {};
      rows.push([r.id, r.date || '', r.label, r.box[0].abbr, r.box[1].abbr, e[0], e[1] === 0 ? 'Top' : 'Bottom', r.box[e[1]].abbr, x.t === 'SB' ? (x.run || x.b || '') : (x.b || ''), x.p || '', x.o != null ? x.o : '', x.t === 'SUB' ? '' : sitN(x.s), x.t === 'SUB' ? 'SUB' : (x.r || x.t || ''), e[2], x.sc ? x.sc[0] : '', x.sc ? x.sc[1] : '', f3(x.weB), f3(x.weA), x.wpa != null ? x.wpa.toFixed(3) : '']);
    }
  }
  return [head].concat(rows).map(r => r.map(csvEsc).join(',')).join('\n');
}
function pbpText(r) {
  const L = [`${r.box[0].name} ${r.score[0]}, ${r.box[1].name} ${r.score[1]}`, `${r.label}${r.date ? ' · ' + fmtDate(r.date) : ''} · ${r.park}`, '']; let key = null;
  for (const [inn, half, d, uth, x] of r.pbp || []) {
    const k = inn + '-' + half; if (k !== key) { key = k; L.push(`-- ${half === 0 ? 'Top' : 'Bottom'} ${B.ord(inn)} (${r.box[half].abbr} batting)`); }
    if (d) L.push('  ' + d + (x && x.wpa != null ? `   [WPA ${wpaStr(x.wpa)}]` : ''));
    if (uth) uth.forEach(u => L.push('      ' + u));
  }
  return L.join('\n');
}
let DL = undefined;
async function offerFile(filename, data) {
  if (DL === undefined) { try { DL = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { DL = null; } }
  if (DL) {
    try { await DL.save({ filename, data }); toast('Saved ' + filename); return; }
    catch (e) { if (e && e.code === 'declined') return; if (e && e.code === 'rate_limited') { toast('A save is already waiting for your answer.'); return; } }
  }
  if (!window.claude) {
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: filename.endsWith('.csv') ? 'text/csv' : filename.endsWith('.json') ? 'application/json' : 'text/plain' })); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast('Downloading ' + filename); return; } catch (e) { }
  }
  showExportText(filename, data);
}
function showExportText(filename, data) {
  st.exportText = { filename, data }; st.tab = 'records'; render(); window.scrollTo(0, 0);
}

// ======================================================
// series (postseason + exhibition)
// ======================================================
const REAL_SEEDS = { AL: ['TOR', 'SEA', 'CLE', 'NYA', 'BOS', 'DET'], NL: ['MIL', 'PHI', 'LAN', 'CHN', 'SDN', 'CIN'] };
const ROUNDS = ['WC', 'DS', 'LCS', 'WS'];
function newPost(seeds, o) {
  const mk = (id, round, best, hi, lo, lg) => ({ id, round, best, hi, lo, lg, wins: hi && lo ? { [hi]: 0, [lo]: 0 } : {}, games: [], winner: null });
  const P = { seeds, asPlayed: o.asPlayed, from: o.from, round: 'WC', series: [], champ: null, tired: {}, opts: readOpts() };
  for (const lg of ['AL', 'NL']) {
    const s = seeds[lg];
    P.series.push(mk(lg + 'WC1', 'WC', 3, s[2], s[5], lg), mk(lg + 'WC2', 'WC', 3, s[3], s[4], lg));
    P.series.push(mk(lg + 'DS1', 'DS', 5, s[0], null, lg), mk(lg + 'DS2', 'DS', 5, s[1], null, lg));
    P.series.push(mk(lg + 'CS', 'LCS', 7, null, null, lg));
  }
  P.series.push(mk('WS', 'WS', 7, null, null, 'MLB'));
  return P;
}
function seriesOver(s) { if (!s.hi || !s.lo) return true; if (s.fixed) return s.games.length >= s.best; const need = Math.floor(s.best / 2) + 1; return (s.wins[s.hi] || 0) >= need || (s.wins[s.lo] || 0) >= need; }
function homeOfGame(s, k) {
  // k: 0-based game number; returns home team code
  if (s.round === 'TOUR') { if (s.best >= 7) return [0, 1, 5, 6].includes(k) ? s.hi : s.lo; if (s.best === 5) return [0, 1, 4].includes(k) ? s.hi : s.lo; return k % 2 === 0 ? s.hi : s.lo; }
  if (s.round === 'WC') return s.hi;
  if (s.round === 'DS') return [0, 1, 4].includes(k) ? s.hi : s.lo;
  if (s.round === 'LCS' || s.round === 'WS') return [0, 1, 5, 6].includes(k) ? s.hi : s.lo;
  return k % 2 === 0 ? s.hi : s.lo;
}
function realSeriesGame(s, P, k) {
  if (!P || !P.asPlayed) return null;
  const list = D.games.filter(g => g.ty === s.round && ((g.v === s.hi && g.h === s.lo) || (g.v === s.lo && g.h === s.hi))).sort((a, b) => a.d.localeCompare(b.d));
  return list[k] || null;
}
function seriesGameSetup(s, P) {
  const k = s.games.length; const home = homeOfGame(s, k); const away = home === s.hi ? s.lo : s.hi;
  const ref = realSeriesGame(s, P, k);
  const asPlayed = !!(ref && ref.h === home);
  const stt = P || s;
  stt.plog = stt.plog || {}; stt.rot = stt.rot || {};
  [home, away].forEach(c => { if (stt.rot[c] == null) stt.rot[c] = 0; });
  const day = 100 + k * 1 + (ROUNDS.indexOf(s.round) + 1) * 10;
  const sp = asPlayed ? null : [pickStarter(stt, away, day), pickStarter(stt, home, day)];
  const setup = { away, home, date: ref ? ref.d : '20251005', dn: ref ? (ref.dn === 'd' ? 'D' : 'N') : 'N', gameRef: asPlayed ? ref : null, asPlayed, seed: (Math.random() * 2 ** 31) | 0,
    weatherMode: asPlayed ? 'actual' : 'roll', sp, isPost: s.round !== 'EXH', tired: [tiredSet(stt, away, day), tiredSet(stt, home, day)], opts: s.opts || (P && P.opts) || readOpts() };
  return { setup, homeIsHi: home === s.hi, day };
}
function recordSeriesGame(s0, sid, g) {
  const s = s0.series ? s0.series.find(x => x.id === sid) : s0;
  const winner = g.score[0] > g.score[1] ? g.teams[0].code : g.teams[1].code;
  s.wins[winner] = (s.wins[winner] || 0) + 1;
  s.games.push({ v: g.teams[0].code, h: g.teams[1].code, sc: g.score.slice(), w: winner });
  const stt = s0.series ? s0 : s;
  stt.bat = stt.bat || {}; stt.pit = stt.pit || {}; stt.res = stt.res || {};
  const keepRec = stt.rec; if (s0.from === 'tour') stt.rec = null;
  accumulate(stt, g, sid + '-' + s.games.length);
  stt.rec = keepRec;
  const day = 100 + (s.games.length - 1) + (ROUNDS.indexOf(s.round) + 1) * 10;
  stt.plog = stt.plog || {}; logPitching(stt, g, day);
  if (seriesOver(s) && !s.fixed) s.winner = (s.wins[s.hi] || 0) > (s.wins[s.lo] || 0) ? s.hi : s.lo;
  if (s0.series && s0.from !== 'one' && s0.from !== 'tour') advancePost(s0);
}
function simSeriesGame(s, P) {
  if (seriesOver(s)) return;
  const gs = seriesGameSetup(s, P);
  const g = AI.buildGame(D, gs.setup); AI.simGame(g);
  recordSeriesGame(P || s, s.id, g);
  const kind = !P ? 'exh' : (P.from === 'one' ? 'one' : P.from === 'tour' ? 'tour' : 'post');
  archiveGame(g, kind, KINDN[kind] + ' · ' + seriesLabel(P || s, s.id), kind + ':' + Date.now() + ':' + s.id + s.games.length, false); st.recs = null;
}
function advancePost(P) {
  const by = (id) => P.series.find(s => s.id === id);
  for (const lg of ['AL', 'NL']) {
    const s = P.seeds[lg];
    const w1 = by(lg + 'WC1'), w2 = by(lg + 'WC2'), d1 = by(lg + 'DS1'), d2 = by(lg + 'DS2'), cs = by(lg + 'CS');
    if (w2.winner && !d1.lo) { d1.lo = w2.winner; d1.wins = { [d1.hi]: 0, [d1.lo]: 0 }; }
    if (w1.winner && !d2.lo) { d2.lo = w1.winner; d2.wins = { [d2.hi]: 0, [d2.lo]: 0 }; }
    if (d1.winner && d2.winner && !cs.hi) { const a = d1.winner, b = d2.winner; const sa = s.indexOf(a), sb = s.indexOf(b); cs.hi = sa < sb ? a : b; cs.lo = sa < sb ? b : a; cs.wins = { [cs.hi]: 0, [cs.lo]: 0 }; }
  }
  const ws = by('WS'), ac = by('ALCS'), nc = by('NLCS');
  if (ac.winner && nc.winner && !ws.hi) {
    const rec = (c) => { if (P.from === 'season' && S && S.rec[c]) return S.rec[c].W / Math.max(1, S.rec[c].W + S.rec[c].L); return { TOR: 94, SEA: 90, CLE: 88, NYA: 94, BOS: 89, DET: 87, MIL: 97, PHI: 96, LAN: 93, CHN: 92, SDN: 90, CIN: 83 }[c] || 0; };
    const a = ac.winner, b = nc.winner; const ra = rec(a), rb = rec(b);
    ws.hi = ra >= rb ? a : b; ws.lo = ws.hi === a ? b : a; ws.wins = { [ws.hi]: 0, [ws.lo]: 0 };
  }
  if (ws.winner) P.champ = ws.winner;
  const order = ['WC', 'DS', 'LCS', 'WS'];
  for (const r of order) { const ss = P.series.filter(s => s.round === r); if (ss.some(s => !s.winner)) { P.round = r; break; } }
}
function seedsFromSeason() {
  const out = {};
  for (const lg of ['AL', 'NL']) {
    const pct = (c) => { const r = S.rec[c]; return r.W / Math.max(1, r.W + r.L) + (r.RS - r.RA) / 1e5; };
    const divs = Object.keys({ E: 1, C: 1, W: 1 }).map(d => lg + d);
    const leaders = divs.map(d => Object.keys(D.teams).filter(c => D.teams[c].div === d).sort((a, b) => pct(b) - pct(a))[0]).sort((a, b) => pct(b) - pct(a));
    const rest = Object.keys(D.teams).filter(c => D.teams[c].lg === lg && !leaders.includes(c)).sort((a, b) => pct(b) - pct(a)).slice(0, 3);
    out[lg] = leaders.concat(rest);
  }
  return out;
}

// ======================================================
// views
// ======================================================
function vHome() {
  const cur = st.game && !st.game.g.over;
  return `${cur ? '' : ''}<section class="hero"><div class="eyebrow">2025 card set · Under The Hood standard rules</div>
  <h1>Pull up a box seat.</h1>
  <p>Every 2025 player card, ballpark card and Tri-Fold chart, played by the book. Each at-bat shows the dice, the card it hit, and every chart the play passed through.</p></section>
  <div class="modes">
    <div class="mode"><div class="eyebrow">162 games</div><h3>Season replay</h3><p class="muted">Replay the real 2025 schedule. Use the actual starting lineups and pitchers from every game, or let the manager AI set lineups and run a five-man rotation.</p>
      <div class="row"><button class="btn go" data-act="tab" data-v="season">${S ? 'Continue season' : 'Start a season'}</button></div></div>
    <div class="mode"><div class="eyebrow">October</div><h3>Postseason</h3><p class="muted">The 2025 bracket from the Wild Card round to the World Series, or the bracket from your own season replay. Real lineups are used whenever the matchup actually happened.</p>
      <div class="row"><button class="btn go" data-act="tab" data-v="post">${P ? 'Continue postseason' : 'Open bracket'}</button></div></div>
    <div class="mode"><div class="eyebrow">Any matchup</div><h3>Exhibition</h3><p class="muted">Any two 2025 teams for one game or a best-of series. Manage one side, both sides, or watch the AI play it out.</p>
      <div class="row"><button class="btn go" data-act="tab" data-v="exh">Set up a game</button></div></div>
    <div class="mode"><div class="eyebrow">Your rules</div><h3>Custom tournament</h3><p class="muted">Pick any clubs and run a knockout bracket, a round robin, or a round robin into playoffs, with your own series lengths.</p>
      <div class="row"><button class="btn go" data-act="tab" data-v="tour">${st.tour ? 'Continue tournament' : 'Build a tournament'}</button></div></div>
    <div class="mode"><div class="eyebrow">${D.games.length.toLocaleString()} games</div><h3>Real games</h3><p class="muted">Pick any game played in 2025, regular season or postseason, and replay it with the as-played lineups and the actual game-time weather.</p>
      <div class="row"><button class="btn go" data-act="tab" data-v="hist">Find a game</button></div></div>
  </div>
  ${cur ? `<div class="panel resume" style="margin-top:16px"><div class="eyebrow">Saved game in progress · ${esc(KINDN[st.game.ctx.kind] || 'Game')}</div><div class="row" style="justify-content:space-between"><b style="font:700 18px var(--font-display)">${esc(st.game.g.teams[0].abbr)} ${st.game.g.score[0]}, ${esc(st.game.g.teams[1].abbr)} ${st.game.g.score[1]} · ${st.game.g.half === 0 ? 'Top' : 'Bottom'} ${B.ord(st.game.g.inning)}, ${st.game.g.outs} out</b><button class="btn go" data-act="tab" data-v="game">Resume game</button></div></div>` : ''}`;
}

// ---------- game view ----------
const SPEEDS = { slow: 1.6, normal: 1, fast: 0.45, instant: 0 };
const H0 = [200, 345];
const pt = (r, a) => [200 + r * Math.sin(a * Math.PI / 180), 345 - r * Math.cos(a * Math.PI / 180)];
const BASEXY = [H0, [260, 285], [200, 225], [140, 285], H0];
const FXY = { P: [200, 292], C: [200, 362], '1B': pt(124, 41), '2B': pt(142, 16), SS: pt(142, -16), '3B': pt(124, -41), LF: pt(205, -28), CF: pt(228, 0), RF: pt(205, 28) };
const FANG = { LF: -28, CF: 0, RF: 28, '3B': -38, SS: -15, '2B': 15, '1B': 38, P: 0, C: 0 };
const woStr = (w) => w ? avg3(w[0]) : '—';
const lastName = (cid) => tn(cid).split(' ').filter(x => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(x)).slice(-1)[0] || '';
function gameColors(code) { const c = { NYA: '#1c2f5c', LAN: '#1d5fb4', TOR: '#1d5fb4', BOS: '#bd3039', CHN: '#0e3386', SFN: '#fd5a1e', HOU: '#eb6e1f', SEA: '#0c8a8a', ATL: '#ce1141', PHI: '#e81828', SDN: '#7a5c2e', NYN: '#ff5910', DET: '#0c2340', CLE: '#c8102e', MIL: '#12284b', CIN: '#c6011f', BAL: '#df4601', ANA: '#ba0021', ATH: '#003831', TBA: '#5b8fd1', TEX: '#003278', KCA: '#004687', MIN: '#002b5c', CHA: '#333', ARI: '#a71930', COL: '#5a3e8c', MIA: '#00a3e0', PIT: '#b08800', SLN: '#c41e3a', WAS: '#ab0003' }; return c[code] || '#444'; }

function vGame() {
  const GS = st.game;
  if (!GS) return `<div class="section"><div class="panel"><h3>No game on the table</h3><p class="muted">Start one from Exhibition, Season, Postseason or Real Games.</p><button class="btn go" data-act="tab" data-v="exh">Set up an exhibition</button></div></div>`;
  const g = GS.g;
  const lt = GS.lowerTab || 'log';
  const user = !g.teams[0].ai || !g.teams[1].ai;
  const tabs = [['log', 'Play-by-play'], ['cards', 'Cards', 'm-only'], ['box', 'Box score'], ['manage', user ? 'Manage' : 'Managers']];
  return `<div class="gm">
    <div class="gm-stage">${bugHtml(g)}<div class="fieldwrap" id="fieldwrap">${fieldSvg(g)}</div>
      <div class="callout ${GS.lastCall ? 'show' : ''}" id="callout">${GS.lastCall ? callHtml(GS.lastCall) : ''}</div></div>
    <div class="gm-now panel">${nowHtml(g, GS)}</div>
    <div class="gm-cards" id="cardsbox">${cardsHtml(g)}</div>
    <div class="gm-lower panel">
      <div class="ltabs" role="tablist">${tabs.map(([k, l, c]) => `<button role="tab" class="${c || ''}" aria-selected="${lt === k}" data-act="ltab" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="lbody">${lt === 'log' ? `<div class="row" style="justify-content:space-between"><div class="row" style="gap:6px"><button class="btn sm" data-act="game-pbp" data-v="txt">Export play-by-play (.txt)</button><button class="btn sm" data-act="game-pbp" data-v="csv">(.csv)</button></div><label class="chk"><input type="checkbox" ${st.showUth ? 'checked' : ''} data-act="uth"> Show chart lookups</label></div><div class="log ${st.showUth ? '' : 'hidden-uth'}">${logHtml(g)}</div>`
        : lt === 'cards' ? `<div class="cards2">${cardsHtml(g)}</div>`
        : lt === 'box' ? `<div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="game-export">Export this game (.txt)</button></div><div class="scroll">${lineScore(g)}</div><div class="scroll" style="margin-top:12px">${boxScore(g)}</div>`
        : managePanel(g, GS)}</div>
    </div>
  </div>
  ${actionBar(g, GS)}`;
}
function bugHtml(g) {
  const half = g.over ? 'FINAL' : `${g.half === 0 ? '▲' : '▼'}${g.inning}`;
  const w = g.weather || {};
  return `<div class="bug"><div class="bug-t">${[0, 1].map(s => `<div class="bug-r ${!g.over && g.half === s ? 'bat' : ''}"><span class="sw" style="background:${gameColors(g.teams[s].code)}"></span><b>${esc(g.teams[s].abbr)}</b><span class="bug-n">${g.score[s]}</span></div>`).join('')}</div>
    <div class="bug-s"><div class="bug-inn">${half}</div>${g.over ? '' : `<div class="outs">${[0, 1, 2].map(i => `<i class="${i < g.outs ? 'on' : ''}"></i>`).join('')}</div>`}</div>
    <div class="bug-w">${esc(g.park.name.split(' - ')[0])}<br>${w.temp}° ${w.roof ? 'roof closed' : (w.dir ? w.speed + ' mph ' + C.windDir[w.dir].toLowerCase() : 'calm')}</div></div>`;
}
function fieldSvg(g, pre) {
  // pre: optional snapshot {bases:[cid|null], batter, def side}
  const bases = pre ? pre.bases : g.bases.map(r => r ? r.cid : null);
  const defSide = pre ? pre.defSide : 1 - g.half;
  const offSide = 1 - defSide;
  const T = g.teams[defSide];
  const fence = 265;
  const lp = pt(fence, -45), rp = pt(fence, 45);
  const grassIn = 'M200 345 L' + pt(150, -45).join(' ') + ' A150 150 0 0 1 ' + pt(150, 45).join(' ') + ' Z';
  const fielders = Object.keys(FXY).map(pos => {
    const cid = pos === 'P' ? T.pitcher : (T.lineup.find(x => x.pos === pos) || {}).cid;
    const [x, y] = FXY[pos];
    const nm = cid != null ? lastName(cid) : '';
    return `<g class="fd" id="fd-${pos}"><circle cx="${x}" cy="${y}" r="7" fill="${gameColors(T.code)}" stroke="#fff" stroke-width="1.5"/><text x="${x}" y="${y + 18}" text-anchor="middle" class="fl">${esc(nm)}</text><title>${pos}: ${esc(cid != null ? tn(cid) : '')}</title></g>`;
  }).join('');
  const runners = bases.map((cid, i) => cid == null ? '' : runnerEl(cid, BASEXY[i + 1], gameColors(g.teams[offSide].code))).join('');
  const bcid = pre ? pre.batter : (g.over ? null : g.batterCid());
  let batter = '';
  if (bcid != null) { let bc = D.cards[bcid]; if (bc.t === 'P') bc = g.genericFor(bc); const pth = D.cards[T.pitcher].th; const side = bc.b === 'B' ? (pth === 'L' ? 'R' : 'L') : bc.b; batter = runnerEl(bcid, [side === 'L' ? 214 : 186, 343], gameColors(g.teams[offSide].code), true); }
  return `<svg viewBox="0 30 400 366" id="fsvg" role="img" aria-label="Field">
    <defs><radialGradient id="gr" cx="50%" cy="95%" r="100%"><stop offset="0" stop-color="var(--grass2)"/><stop offset="1" stop-color="var(--grass)"/></radialGradient></defs>
    <path d="M200 345 L${lp.join(' ')} A${fence} ${fence} 0 0 1 ${rp.join(' ')} Z" fill="url(#gr)" stroke="var(--wall)" stroke-width="5"/>
    <path d="${grassIn}" fill="var(--dirt)"/>
    <path d="M200 345 L260 285 L200 225 L140 285 Z" fill="var(--grass2)"/>
    <circle cx="200" cy="290" r="9" fill="var(--dirt)"/>
    <path d="M200 345 L${pt(fence, -45).join(' ')} M200 345 L${pt(fence, 45).join(' ')}" stroke="#fff" stroke-width="1.5" opacity=".8"/>
    ${[BASEXY[1], BASEXY[2], BASEXY[3]].map(([x, y]) => `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="#fff" transform="rotate(45 ${x} ${y})"/>`).join('')}
    <path d="M194 343 h12 v4 l-6 5 l-6 -5 z" fill="#fff"/>
    <text x="${pt(fence + 12, -30)[0]}" y="${pt(fence + 12, -30)[1]}" class="dist" text-anchor="middle">${g.park.dims.LEFT ? g.park.dims.LEFT[0] : ''}</text>
    <text x="200" y="${345 - fence - 6}" class="dist" text-anchor="middle">${g.park.dims.CENTER ? g.park.dims.CENTER[0] : ''}</text>
    <text x="${pt(fence + 12, 30)[0]}" y="${pt(fence + 12, 30)[1]}" class="dist" text-anchor="middle">${g.park.dims.RIGHT ? g.park.dims.RIGHT[0] : ''}</text>
    ${fielders}<g id="runners">${runners}${batter}</g>
    <g id="ballg" opacity="0"><ellipse id="ballsh" cx="200" cy="345" rx="4" ry="2" fill="rgba(0,0,0,.35)"/><circle id="ball" cx="200" cy="345" r="3.6" fill="#fff" stroke="#c22" stroke-width=".8"/></g>
    <text id="fx" x="200" y="200" text-anchor="middle" class="fx" opacity="0"></text>
  </svg>`;
}
function runnerEl(cid, xy, color, atBat) {
  const nm = lastName(cid);
  return `<g class="rn" id="rn-${cid}" data-x="${xy[0]}" data-y="${xy[1]}" transform="translate(${xy[0]} ${xy[1]})"><circle r="${atBat ? 6 : 7.5}" fill="${color}" stroke="#ffd36b" stroke-width="2"/><text y="-11" text-anchor="middle" class="rl">${esc(nm)}</text></g>`;
}
function nowHtml(g, GS) {
  if (g.over) {
    const w = g.teams[g.winner];
    const ctx = GS.ctx; let extra = '';
    if (ctx.kind === 'hist') { const r = D.gamesById[ctx.ref]; extra = `<p class="muted" style="margin:4px 0 0">Actual result: ${team(r.v).abbr} ${r.sc[0]}, ${team(r.h).abbr} ${r.sc[1]}.</p>`; }
    const back = { tour: ['tour', 'Back to the tournament'], season: ['season', 'Back to the season'], post: ['post', 'Back to the bracket'], one: ['post', 'Back to the series'], hist: ['hist', 'Pick another real game'], exh: ['exh', 'Back to exhibition'] }[ctx.kind] || ['home', 'Home'];
    return `<h2>${esc(w ? w.name : 'Tie')} win ${Math.max(...g.score)}–${Math.min(...g.score)}</h2>${extra}<div class="row" style="margin-top:8px"><button class="btn go" data-act="tab" data-v="${back[0]}">${back[1]}</button><button class="btn" data-act="ltab" data-v="box">Box score</button></div>`;
  }
  const off = g.off, def = g.def; const bcid = g.batterCid(); const bc = g.batterCard(); const pc = D.cards[def.pitcher];
  const bats = bc.b === 'B' ? (pc.th === 'L' ? 'R' : 'L') : bc.b;
  const bl = off.bat[bcid] || { H: 0, AB: 0 }; const pl = def.pit[def.pitcher]; const f = def.fatigue[def.pitcher];
  const bw = D.cards[bcid].wo, pw = pc.wo;
  const nxt = (k) => off.lineup[(off.bi + k) % off.lineup.length].cid;
  const d = g.cur && g.cur.dice;
  return `<div class="mu">
    <div class="mu-p"><div class="eyebrow">At bat · ${esc(off.abbr)}</div><div class="mu-n">${esc(tn(bcid))}</div>
      <div class="mu-s">${bats}HB · ${bl.H}-for-${bl.AB} today · wOBA vs ${pc.th}HP <b>${woStr(bw && bw[pc.th])}</b></div></div>
    <div class="mu-vs">vs</div>
    <div class="mu-p"><div class="eyebrow">Pitching · ${esc(def.abbr)}</div><div class="mu-n">${esc(tn(def.pitcher))}</div>
      <div class="mu-s">${pc.th}HP · ${ipStr(pl.OUTS)} IP · BF ${pl.BF} · fatigue <b class="${f <= 0 ? 'hot' : ''}">${f.toFixed(1)}</b> · wOBA vs ${bats}HB <b>${woStr(pw && pw[bats])}</b></div></div>
  </div>
  <div class="tray"><div class="dice" id="dice">${diceFaces(d)}</div><div class="ticker" id="ticker">${GS.lastCall ? `<div class="tk res">${esc(GS.lastCall.desc)}</div>` : '<div class="tk muted">Tap Pitch to roll the dice.</div>'}</div></div>
  <div class="chartslot" id="chartslot">${GS.lastChart || ''}</div>
  <div class="ondeck muted">On deck ${esc(tn(nxt(1)))} · in the hole ${esc(tn(nxt(2)))}${def.infieldIn ? ' · infield in' : ''}${def.guardLines ? ' · guarding the lines' : ''}</div>`;
}
function diceFaces(d) {
  if (!d) d = { w: '–', b: '–', r: '–', g: '–', p: null };
  return `<span class="die w" title="White die">${d.w}</span><span class="die b" title="Black die">${d.b}</span><span class="die rd" title="Red die">${d.r}</span><span class="die gr" title="Green die">${d.g}</span><span class="die pd" title="Pitcher die">${d.p == null ? '–' : C.pdie[d.p]}</span>`;
}
function cardsHtml(g, cell, pcell, bcidOverride, pcidOverride, fatOverride) {
  if (g.over && bcidOverride == null) return `<div class="panel muted">Game over.</div>`;
  const bcid = bcidOverride != null ? bcidOverride : g.batterCid();
  const pcid = pcidOverride != null ? pcidOverride : g.def.pitcher;
  const pc = D.cards[pcid];
  let c = D.cards[bcid]; if (c.t === 'P') c = g.genericFor(c);
  if (cell === undefined) { const last = g.plays.length ? g.plays[g.plays.length - 1] : null; cell = last && last.batter === bcid ? last.cell : null; pcell = last && last.pitcher === pcid && last.batter === bcid ? last.pcell : null; }
  const fat = fatOverride != null ? fatOverride : (g.teams.find(T => T.pitcher === pcid) ? g.teams.find(T => T.pitcher === pcid).fatigue[pcid] : null);
  return batterCard(c, pc.th, cell, null) + pitcherCard(pc, pcell, fat);
}
function lineScore(g) {
  const n = Math.max(9, g.line[0].length, g.line[1].length);
  const cells = (s) => Array.from({ length: n }, (_, i) => { const v = g.line[s][i]; return `<td>${v == null ? (i < g.inning - 1 || (i === g.inning - 1 && s < g.half) ? 'x' : '') : v}</td>`; }).join('');
  return `<table class="mini ls"><thead><tr><th class="l"></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>R</th><th>H</th><th>E</th></tr></thead>
    <tbody>${[0, 1].map(s => `<tr><td class="l"><b>${esc(g.teams[s].abbr)}</b></td>${cells(s)}<td><b>${g.score[s]}</b></td><td>${g.hits[s]}</td><td>${g.errors[s]}</td></tr>`).join('')}</tbody></table>`;
}
function actionBar(g, GS) {
  if (g.over) return '';
  const sp = st.prefs.speed;
  return `<div class="abar"><div class="abar-in">
    <button class="btn go big" data-act="pa" id="pitchbtn">${st.prefs.stepMode ? 'Roll the dice' : 'Pitch'}</button>
    <button class="btn" data-act="skip" id="skipbtn" hidden>Skip to result</button>
    <label class="chk stepchk"><input type="checkbox" data-chg="stepmode" ${st.prefs.stepMode ? 'checked' : ''}> Board-game steps</label>
    <button class="btn ${GS.auto ? 'on' : ''}" data-act="auto">${GS.auto ? 'Pause' : 'Auto-play'}</button>
    <button class="btn" data-act="half">Finish inning</button>
    <button class="btn" data-act="end">Sim to final</button>
    <label class="spd">Speed <select data-chg="speed" aria-label="Animation speed">${Object.keys(SPEEDS).map(k => `<option value="${k}" ${sp === k ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)}</option>`).join('')}</select></label>
  </div></div>`;
}
function managePanel(g, GS) {
  const off = g.off, def = g.def, offU = !off.ai, defU = !def.ai;
  const b = g.bases, d = GS.dec;
  const tog = (k, label, ok) => `<button class="btn sm ${d[k] ? 'on' : ''}" data-act="dec" data-v="${k}" ${ok ? '' : 'disabled'}>${label}</button>`;
  let mgr = '';
  if (offU && !g.over) {
    const side = g.half;
    const benchOpts = off.bench.filter(c => !off.used.has(c)).map(c => `<option value="${c}">${esc(tn(c))} (${D.cards[c].pos.join('/')}, B/R ${D.cards[c].BR})</option>`).join('');
    mgr += `<div class="grp"><span class="eyebrow">${esc(off.abbr)} offense — you</span>
      <button class="btn sm" data-act="dec" data-v="steal2" ${b[0] && !b[1] ? '' : 'disabled'}>Steal 2nd</button>
      <button class="btn sm" data-act="dec" data-v="steal3" ${b[1] && !b[2] ? '' : 'disabled'}>Steal 3rd</button>
      ${tog('bunt', 'Sacrifice bunt', b.some(Boolean) && g.outs < 2)}${tog('squeeze', 'Squeeze', b[2] && g.outs < 2)}${tog('hitRun', 'Hit and run', b[0] && g.outs < 2)}${tog('contact', 'Go on contact', b[2] && g.outs < 2)}</div>
      <div class="grp"><label class="fld">Base running <select id="stylesel">${['N', 'A', 'C'].map(s => `<option value="${s}" ${off.style === s ? 'selected' : ''}>${{ N: 'Normal', A: 'Aggressive', C: 'Conservative' }[s]}</option>`).join('')}</select></label><button class="btn sm" data-act="style" data-side="${side}">Set</button></div>
      ${benchOpts ? `<div class="grp"><label class="fld">Replace <select id="phout">${off.lineup.map(x => `<option value="${x.cid}">${esc(tn(x.cid))} (${x.pos})</option>`).join('')}</select></label><label class="fld">With <select id="phin">${benchOpts}</select></label>
      <button class="btn sm" data-act="ph" data-side="${side}" data-kind="Pinch hitter">Pinch hit / run</button></div>` : ''}`;
  }
  if (defU && !g.over) {
    const side = 1 - g.half;
    const pen = def.pen.filter(c => !def.used.has(c)).map(c => { const p = D.cards[c]; return `<option value="${c}">${esc(tn(c))} ${p.th}HP · ERA ${p.ERA} · ${p.SV} SV · wOBA L ${woStr(p.wo && p.wo.L)} R ${woStr(p.wo && p.wo.R)}${def.tired && def.tired.has(c) ? ' · tired' : ''}</option>`; }).join('');
    const benchOpts = def.bench.filter(c => !def.used.has(c)).map(c => `<option value="${c}">${esc(tn(c))} (${D.cards[c].pos.join('/')})</option>`).join('');
    mgr += `<div class="grp"><span class="eyebrow">${esc(def.abbr)} defense — you</span>${tog('ibb', 'Intentional walk', true)}${tog('infieldIn', 'Infield in', b[2])}
      <button class="btn sm ${def.guardLines ? 'on' : ''}" data-act="dec" data-v="guardLines">Guard the lines</button></div>
      <div class="grp"><label class="fld">Bullpen <select id="pensel">${pen}</select></label><button class="btn sm" data-act="pchange" data-side="${side}" ${pen ? '' : 'disabled'}>Change pitcher</button></div>
      ${benchOpts ? `<div class="grp"><label class="fld">Replace <select id="phout2">${def.lineup.map(x => `<option value="${x.cid}">${esc(tn(x.cid))} (${x.pos})</option>`).join('')}</select></label><label class="fld">With <select id="phin2">${benchOpts}</select></label>
      <button class="btn sm" data-act="dsub" data-side="${side}">Defensive sub</button></div>` : ''}`;
  }
  const who = [0, 1].map(s => `<button class="btn sm ${g.teams[s].ai ? '' : 'on'}" data-act="autoside" data-side="${s}">${esc(g.teams[s].abbr)}: ${g.teams[s].ai ? 'AI manages' : 'You manage'}</button>`).join('');
  const pending = Object.keys(d).filter(k => d[k]);
  return `<div class="mgr">${mgr || '<p class="muted">The AI is managing both clubs. Take over a team below.</p>'}
    ${pending.length ? `<p class="note">Called for the next pitch: ${pending.map(k => ({ bunt: 'sacrifice bunt', squeeze: 'suicide squeeze', hitRun: 'hit and run', contact: 'runner goes on contact', ibb: 'intentional walk', infieldIn: 'infield in' }[k] || k)).join(', ')}</p>` : ''}
    <div class="grp"><span class="eyebrow">Managers</span>${who}</div></div>`;
}
const CALLS = { SN: 'SINGLE', DB: 'DOUBLE', TP: 'TRIPLE', HR: 'HOME RUN', K: 'STRIKEOUT', BB: 'WALK', HBP: 'HIT BY PITCH', E: 'ERROR', HG: 'GROUND OUT', RG: 'GROUND OUT', SG: 'GROUND OUT', FDF: 'FLY OUT', FLF: 'FLY OUT', FNF: 'FLY OUT', FSF: 'FLY OUT', LO: 'LINE OUT', PU: 'POP OUT', FP: 'FOUL OUT', SH: 'SACRIFICE', BUNT: 'BUNT', RNG: 'WHAT A PLAY', FNF2: 'FLY OUT' };
function callFor(ev) {
  if (!ev) return null;
  let h;
  if (ev.type === 'SB') h = /steals/.test(ev.desc) ? 'STOLEN BASE' : /caught|picked/.test(ev.desc) ? 'OUT ON THE BASES' : /Balk/.test(ev.desc) ? 'BALK' : 'HOLDS';
  else if (ev.wild) h = 'WILD PLAY';
  else if (ev.dp) h = 'DOUBLE PLAY';
  else if (/DOUBLE PLAY/.test(ev.desc || '')) h = 'DOUBLE PLAY';
  else if (ev.result === 'HR' && /GRAND SLAM/.test(ev.desc)) h = 'GRAND SLAM';
  else h = CALLS[ev.result] || (ev.result || 'PLAY');
  if (ev.wp && !h) h = ev.wp === 'WP' ? 'WILD PITCH' : 'PASSED BALL';
  const good = ev.hit || ['BB', 'HBP', 'E', 'SB'].includes(ev.result) || ev.runs > 0 || h === 'STOLEN BASE';
  return { h, desc: ev.desc || '', runs: ev.runs || 0, good, hr: ev.result === 'HR' };
}
function callHtml(c) { return `<div class="call-h ${c.hr ? 'hr' : c.good ? 'good' : 'bad'}">${esc(c.h)}${c.runs ? `<span class="call-r">${c.runs} run${c.runs > 1 ? 's' : ''}</span>` : ''}</div><div class="call-d">${esc(c.desc)}</div>`; }

// ---------- animation ----------
function sleep(ms) { const GS = st.game; return new Promise(r => { if (!ms || (GS && GS.skip)) return r(); const t = setTimeout(r, ms); if (GS) GS.timers.push([t, r]); }); }
function tween(ms, fn) {
  const GS = st.game;
  return new Promise(res => {
    if (!ms || GS.skip) { fn(1); return res(); }
    const t0 = performance.now();
    const step = (now) => { if (GS.skip) { fn(1); return res(); } const k = Math.min(1, (now - t0) / ms); fn(k); if (k < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
}
const ease = (k) => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
function ballTarget(ball, g) {
  const f = ball.fld; const a = FANG[f] != null ? FANG[f] : 0;
  const jit = () => (Math.random() - .5) * 8;
  if (ball.t === 'hr') return { xy: pt(300, a), arc: 95 };
  if (ball.t === 'k' || ball.t === 'bb' || ball.t === 'hbp') return null;
  if (ball.t === 'bunt') return { xy: f === 'C' ? [200 + jit(), 335] : f === '1B' ? [228, 318] : f === '3B' ? [172, 318] : [200 + jit(), 318], arc: 0 };
  if (ball.hit) {
    const desc = ball.desc;
    if (desc === 'dtl') return { xy: pt(230, f === 'LF' ? -42 : 42), arc: 10, bounce: true };
    if (desc === 'ilg') return { xy: pt(235, -15), arc: 25, bounce: true };
    if (desc === 'irg') return { xy: pt(235, 15), arc: 25, bounce: true };
    if (desc === 'otw' || desc === 'btw') return { xy: pt(258, a), arc: 45 };
    if (ball.hit === 'TP') return { xy: pt(250, a > 0 ? 18 : a < 0 ? -18 : 12), arc: 30, bounce: true };
    if (ball.t === 'gb') { const of = /^(1B|2B|SS|3B)$/.test(f) ? FXY[f] : pt(170, a); return { xy: [of[0] + jit(), of[1] + jit()], arc: 0, bounce: true }; }
    const fx = FXY[f] || pt(180, a); const r = ball.t === 'bloop' ? 150 : 175;
    return { xy: pt(r, a + (Math.random() - .5) * 14), arc: ball.t === 'bloop' ? 45 : 18 };
  }
  const fx = FXY[f] || FXY.CF;
  if (ball.t === 'gb') return { xy: [fx[0] + jit(), fx[1] + jit()], arc: 0, bounce: true };
  if (ball.t === 'pop') return { xy: [fx[0] + jit(), fx[1] + 6], arc: 120 };
  if (ball.t === 'line') return { xy: [fx[0] + jit(), fx[1] + jit()], arc: 8 };
  if (ball.t === 'fly') {
    const r = Math.hypot(fx[0] - 200, fx[1] - 345) * (ball.depth === 'DF' ? 1.12 : ball.depth === 'LF' ? 1.04 : ball.depth === 'SF' ? 0.7 : 0.95);
    return { xy: pt(Math.min(r, 258), a + (Math.random() - .5) * 6), arc: ball.depth === 'DF' ? 90 : 70 };
  }
  return { xy: fx, arc: 20 };
}
async function animateBall(ball, g, sp) {
  const tgt = ballTarget(ball, g); if (!tgt) return;
  const bgEl = $('#ballg'), bEl = $('#ball'), sh = $('#ballsh'); if (!bgEl) return;
  bgEl.setAttribute('opacity', '1');
  const [x0, y0] = [200, 338]; const [x1, y1] = tgt.xy;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const dur = (ball.t === 'gb' ? 420 + dist * 2.2 : 500 + dist * 3.2) * sp;
  await tween(dur, k => {
    const e = ball.t === 'gb' ? k : ease(k);
    const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * e;
    const hgt = tgt.arc * 4 * k * (1 - k) + (tgt.bounce ? Math.abs(Math.sin(k * Math.PI * 3)) * 3 * (1 - k) : 0);
    bEl.setAttribute('cx', x); bEl.setAttribute('cy', y - hgt); bEl.setAttribute('r', 3.6 + hgt / 22);
    sh.setAttribute('cx', x); sh.setAttribute('cy', y);
  });
  const fd = ball.fld && $('#fd-' + ball.fld);
  if (fd && !ball.hit && ball.t !== 'hr') fd.classList.add('glove');
  if (ball.t === 'hr') { bgEl.setAttribute('opacity', '0'); fx('GONE!', 200, 120, sp); }
}
async function fx(text, x, y, sp) { const t = $('#fx'); if (!t) return; t.textContent = text; t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('opacity', '1'); await sleep(700 * sp); t.setAttribute('opacity', '0'); }
function pathPoints(from, to) { const pts = []; for (let i = from; i <= to; i++) pts.push(BASEXY[i]); return pts; }
async function moveRunner(cid, from, to, sp, out) {
  const el = $('#rn-' + cid); if (!el) return;
  const target = out ? Math.min(4, from + 1) : to;
  let pts = pathPoints(from, target);
  if (from === 0 && !out && to === 0) return;
  if (out) { const a = BASEXY[from], b = BASEXY[Math.min(4, from + 1)]; pts = [a, [a[0] + (b[0] - a[0]) * .7, a[1] + (b[1] - a[1]) * .7]]; }
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    await tween(380 * sp, k => { el.setAttribute('transform', `translate(${ax + (bx - ax) * k} ${ay + (by - ay) * k})`); });
  }
  if (out) { el.classList.add('outed'); }
  if (to === 4 && !out) { el.classList.add('scored'); }
}
async function animateRunners(ev, pre, g, sp) {
  const after = g.bases.map(r => r ? r.cid : null);
  const scored = ev.scored || [];
  const jobs = [];
  const moverOf = (cid, from) => {
    const ai = after.indexOf(cid);
    let to, out = false;
    if (ai >= 0) to = ai + 1;
    else if (scored.includes(cid)) to = 4;
    else if (from === 0 && ev.noAdvanceBatter) return null;
    else if (ev.type === 'SB' && from === 0) return null;
    else { to = from; out = true; }
    if (to === from && !out) return null;
    return [cid, from, to, out];
  };
  const list = [];
  for (let i = 2; i >= 0; i--) if (pre.bases[i] != null) { const m = moverOf(pre.bases[i], i + 1); if (m) list.push(m); }
  if (ev.type === 'PA' && pre.batter != null) { const m = moverOf(pre.batter, 0); if (m) list.push(m); }
  for (const m of list) jobs.push(moveRunner(m[0], m[1], m[2], sp, m[3]));
  await Promise.all(jobs);
}
function chartHtml(ch) {
  if (!ch || ch.k !== 't') return '';
  const rows = ch.rows.map((r, i) => `<tr class="${i === ch.hr ? 'hl' : ''}">${r.map((c, j) => `<td class="${j === 0 ? 'l' : ''} ${i === ch.hr && j === ch.hc ? 'hc' : ''} ${ch.hc != null && j === ch.hc ? 'col' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="chart"><div class="chart-t">${esc(ch.title)}</div><div class="chart-b"><table><thead><tr>${ch.cols.map((c, j) => `<th class="${j === 0 ? 'l' : ''} ${ch.hc === j ? 'col' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${ch.note ? `<div class="chart-n">${esc(ch.note)}</div>` : ''}</div>`;
}
function showChart(ch, ev, g, pre) {
  const slot = $('#chartslot'); const cb = $('#cardsbox');
  if (!ch) return;
  if (ch.k === 't') {
    if (slot) { slot.innerHTML = chartHtml(ch); st.game.lastChart = slot.innerHTML; slot.classList.add('pulled'); const r = slot.querySelector('tr.hl'); const body = slot.querySelector('.chart-b'); if (r && body) body.scrollTop = Math.max(0, r.offsetTop - body.clientHeight / 2); }
    return;
  }
  const isB = ch.k === 'bcard';
  if (cb) { cb.innerHTML = cardsHtml(g, ev.cell, isB ? null : ev.pcell, pre.batter, ev.pitcher, pre.fat); const el = cb.querySelectorAll('.card')[isB ? 0 : 1]; if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }
  if (slot) {
    let c = D.cards[pre.batter]; if (c.t === 'P') c = g.genericFor(c);
    const pc = D.cards[ev.pitcher];
    slot.innerHTML = `<div class="slotcard">${isB ? batterCard(c, pc.th, ev.cell) : pitcherCard(pc, ev.pcell, pre.fat)}</div>`;
    slot.classList.add('pulled');
    const act = slot.querySelector('.act'); if (act) { const sc = slot.querySelector('.slotcard'); if (sc) sc.scrollTop = Math.max(0, act.offsetTop - 80); }
  }
}
const ROLL_RE = /(;|,)?\s*(red die \d|green die \d|black die \d|re-?roll|roll \d|Roll \d)/i;
function splitRoll(text) {
  // returns [setup, full] when the line contains a new roll, else null
  if (/^Dice:/.test(text)) return null;
  if (/^OF CK \(/.test(text)) return ['OF CK range check — roll green and red', text];
  const m = text.match(ROLL_RE);
  if (!m || m.index < 4) return m ? [text.split(':')[0] + ' — roll', text] : null;
  return [text.slice(0, m.index).replace(/[\s:;,→-]+$/, ''), text];
}
function waitStep(label) {
  const GS = st.game;
  if (!st.prefs.stepMode || GS.skip || GS.auto) return null;
  const pb = $('#pitchbtn'); if (pb) pb.textContent = label;
  return new Promise(res => { GS.waiter = () => { GS.waiter = null; res(); }; });
}
const hideHl = (ch) => ch && ch.k === 't' ? Object.assign({}, ch, { hr: -1, hc: null, note: '' }) : ch;
async function tickerLines(ev, sp, pre, g) {
  const tk = $('#ticker'); if (!tk) return;
  tk.innerHTML = '';
  const lines = (ev.lines || []).filter(l => !String(l[0]).startsWith('res') && l[0] !== 'end');
  const steps = st.prefs.stepMode && !st.game.auto;
  let first = true;
  for (const l of lines) {
    const isDice = l[0] === 'dice';
    const div = document.createElement('div'); div.className = 'tk ' + (l[0] || '');
    if (isDice) {
      // the button press that started this at-bat is the dice roll
      if (!first) { const w = waitStep('Roll the dice'); if (w) await w; }
      await rollDice(ev, sp);
    } else if (steps) {
      const sp2 = splitRoll(l[1]);
      if (sp2) {
        const w = waitStep('Next'); if (w) await w;
        div.textContent = sp2[0] + ' …'; tk.appendChild(div); tk.scrollTop = tk.scrollHeight;
        if (l[2]) showChart(hideHl(l[2]), ev, g, pre);
        const w2 = waitStep('Roll'); if (w2) await w2;
      } else { const w = waitStep('Next'); if (w) await w; }
    }
    first = false;
    div.textContent = l[1]; if (!div.parentNode) tk.appendChild(div);
    tk.scrollTop = tk.scrollHeight;
    if (l[2]) showChart(l[2], ev, g, pre);
    if (!steps) await sleep(Math.min(700, 220 + l[1].length * 5) * sp * (l[2] ? 1.6 : 1));
  }
}
async function rollDice(ev, sp) {
  const box = $('#dice'); if (!box || !ev.dice) return;
  const t0 = performance.now(); const dur = Math.max(st.prefs.stepMode ? 650 : 0, 520 * sp);
  while (performance.now() - t0 < dur && !st.game.skip) {
    box.innerHTML = diceFaces({ w: 1 + (Math.random() * 6 | 0), b: 1 + (Math.random() * 6 | 0), r: Math.random() * 10 | 0, g: Math.random() * 10 | 0, p: Math.random() * 10 | 0 });
    box.classList.add('rolling'); await sleep(70);
  }
  box.classList.remove('rolling'); box.innerHTML = diceFaces(ev.dice);
}
async function animateEvent(ev, pre, g) {
  const sp0 = SPEEDS[st.prefs.speed] != null ? SPEEDS[st.prefs.speed] : 1;
  const sp = st.prefs.stepMode && sp0 === 0 ? 0.45 : sp0;
  const fw = $('#fieldwrap'); if (fw) fw.innerHTML = fieldSvg(g, pre);
  const co = $('#callout'); if (co) co.classList.remove('show');
  const slot = $('#chartslot'); if (slot) { slot.innerHTML = ''; slot.classList.remove('pulled'); } st.game.lastChart = '';
  const cb = $('#cardsbox'); if (cb && ev.type === 'PA' && pre.batter != null) cb.innerHTML = cardsHtml(g, null, null, pre.batter, ev.pitcher, pre.fat);
  await tickerLines(ev, sp, pre, g);
  const w = waitStep('Next'); if (w) await w;
  if (ev.type === 'PA' && ev.ball) await animateBall(ev.ball, g, sp);
  await animateRunners(ev, pre, g, sp);
  await sleep(250 * sp);
}

async function playStep() {
  const GS = st.game; if (!GS) return; const g = GS.g;
  if (GS.busy) { if (GS.waiter) { GS.waiter(); return; } skipAnim(); return; }
  if (g.over) return;
  const pre = { bases: g.bases.map(r => r ? r.cid : null), batter: g.batterCid(), defSide: 1 - g.half, fat: g.def.fatigue[g.def.pitcher] };
  const n0 = g.log.length;
  const userDec = Object.keys(GS.dec).length ? GS.dec : null;
  AI.aiStep(g, userDec); GS.dec = {};
  saveLive(true);
  const evs = g.log.slice(n0); const ev = evs.filter(e => e.type !== 'SUB').pop() || evs[evs.length - 1];
  if (g.over) gameFinished();
  GS.lastCall = callFor(ev);
  if ((st.prefs.speed !== 'instant' || st.prefs.stepMode) && ev && st.tab === 'game') {
    GS.busy = true; GS.skip = false; GS.timers = [];
    const pb = $('#pitchbtn'); if (pb) pb.textContent = 'Skip';
    const sk = $('#skipbtn'); if (sk) sk.hidden = false;
    try { await animateEvent(ev, pre, g); } catch (e) { console.error(e); }
    GS.busy = false; GS.skip = false; GS.waiter = null;
  }
  render();
  const co = $('#callout'); if (co && GS.lastCall) { co.classList.add('show'); }
  if (GS.auto && !g.over && st.tab === 'game') { const sp = SPEEDS[st.prefs.speed] || 0; GS.autoT = setTimeout(() => { if (st.game === GS && GS.auto) playStep(); }, 500 + 900 * sp); }
}
function skipAnim() { const GS = st.game; if (!GS || !GS.busy) return; GS.skip = true; if (GS.waiter) GS.waiter(); GS.timers.forEach(([t, r]) => { clearTimeout(t); r(); }); GS.timers = []; }

const isRed = (t) => /^(SN|DB|TP|DFH|HBP)/.test(t);
function batterCard(c, focus, cell, note) {
  const s = (x) => c[x] || {};
  const vs = (x, lbl) => { const v = s(x); const w = c.wo && c.wo[x]; return `<div><b>Vs ${lbl}:</b> ${v.ab != null ? `${v.ab} ab ${avg3(v.avg)} ${v.hr} HR ${v.rbi} RBI` : ''} · <span class="wo">wOBA ${w ? avg3(w[0]) : '—'}</span> · ${{ P: 'Power', N: 'Norm', W: 'Weak' }[v.pow] || ''} · H/R ${v.hnr} · Bnt ${v.bnt} · ${v.chrt != null ? 'Chrt(uth) ' + v.chrt : 'Hit(uth) ' + (v.hit != null ? v.hit : '') + (v.spo != null ? '(' + v.spo + ')' : '')}</div>`; };
  const cols = [0, 1, 2].map(ci => {
    let h = `<div class="col"><span class="h"></span><span class="h ${focus === 'L' ? '' : 'dim'}">vs L</span><span class="h ${focus === 'R' ? '' : 'dim'}">vs R</span>`;
    for (let k = 0; k < 12; k++) {
      const idx = ci * 12 + k; const dn = B.DICE[idx];
      const cellH = (side) => { const t = c.res[side][idx]; const act = cell && cell.col === side && cell.idx === idx; return `<span class="${isRed(t) ? 'r' : 'bl'} ${act ? 'act' : ''} ${focus && focus !== side ? 'dim' : ''}" title="${t}">${t}</span>`; };
      h += `<span class="n">${dn}</span>${cellH('L')}${cellH('R')}`;
    }
    return h + '</div>';
  }).join('');
  const T = D.teams[c.tm];
  const pos = (c.pos || []).join('/');
  return `<div class="card"><div class="hd"><span class="nm">${esc(c.n)}</span><span style="font-weight:700">B/${{ R: 'Right', L: 'Left', B: 'Both' }[c.b]} [${c.tend}]</span></div>
    <div class="meta"><span>${pos}</span>${c.F && c.F.length ? `<span>F${c.arm ? '(Arm)' : ''}: ${c.F.join('/')}${c.arm ? '(' + c.arm + ')' : ''}</span>` : ''}${c.E && c.E.length ? `<span>E: ${c.E.join('/')}</span>` : ''}${c.DP != null ? `<span>DP: ${c.DP}</span>` : ''}<span class="tm">${T ? '2025 ' + esc(T.nick) : (note || 'Generic')}</span></div>
    <div class="meta"><span>B/R: ${c.BR}</span><span>SB/R: ${c.SBR}</span><span>SBF: ${c.SBF}</span></div>
    <div class="vs">${vs('L', 'LEFT')}${vs('R', 'RIGHT')}</div><div class="cgrid">${cols}</div></div>`;
}
function pitcherCard(c, pcell, fat) {
  const g = c.g; const rows = [-3, -2, -1, 0, 1, 2, 3];
  let grid = `<span></span><span class="h">HIT L</span><span class="h">HIT R</span><span class="h">BB L</span><span class="h">BB R</span><span class="h">K L</span><span class="h">K R</span>`;
  for (const r of rows) {
    grid += `<span class="lab">${r > 0 ? '+' + r : r}</span>`;
    for (const [k, sd] of [['hit', 'L'], ['hit', 'R'], ['bb', 'L'], ['bb', 'R'], ['k', 'L'], ['k', 'R']]) {
      const v = (g[k][sd] || {})[String(r)] || '';
      const act = pcell && pcell.kind === k && pcell.col === sd && +pcell.n === r;
      const valid = k === 'hit' || (k === 'bb' && r >= -2) || (k === 'k' && r <= 2);
      grid += `<span class="${act ? 'act' : ''}" title="${v}">${valid ? (v || '·') : (k === 'bb' && r === -3 && c.ewr && c.ewr[sd] ? 'EWR' : '')}</span>`;
    }
  }
  const T = D.teams[c.tm];
  return `<div class="card"><div class="hd"><span class="nm">${esc(c.n)}</span><span style="font-weight:700">T/${c.th === 'L' ? 'Left' : 'Right'} [${c.tend}]</span></div>
    <div class="meta"><span>P · E: ${c.E}</span><span>Bats: ${c.b}</span><span>Hit: ${c.hc}</span><span class="tm">2025 ${T ? esc(T.nick) : ''}</span></div>
    <div class="meta"><span>G ${c.G} GS ${c.GS} IP ${c.IP}</span><span>ERA ${c.ERA}</span><span>W/L ${c.W}-${c.Lo}</span><span>SV ${c.SV}</span></div>
    <div class="meta"><span>L1 Ftg ${c.F1}</span><span>L2 Ftg ${c.F2}${fat != null ? ` (now ${fat.toFixed(1)})` : ''}</span><span>SBR ${c.SBR}</span><span>SBF ${c.SBF}</span></div>
    <div class="meta"><span>Early ${c.early}</span><span>Late ${c.late}</span><span>WP ${c.WP}</span><span>PO/BK ${c.PO}</span><span>HBP ${c.HBP}</span><span>HR vs L ${B.fmtS(c.HRL)} · vs R ${B.fmtS(c.HRR)}</span></div>
    <div class="meta"><span class="wo">wOBA vs LHB ${c.wo && c.wo.L ? avg3(c.wo.L[0]) + ' (' + c.wo.L[1] + ' PA)' : '—'}</span><span class="wo">vs RHB ${c.wo && c.wo.R ? avg3(c.wo.R[0]) + ' (' + c.wo.R[1] + ' PA)' : '—'}</span></div>
    <div class="pgrid">${grid}</div></div>`;
}
function logHtml(g) {
  const evs = g.log.slice().reverse();
  let lastKey = null, out = '';
  const latest = evs[0];
  for (const ev of evs) {
    const key = ev.inning + '-' + ev.half;
    if (key !== lastKey) { out += `<div class="ihead">${ev.half === 0 ? 'Top' : 'Bottom'} ${B.ord(ev.inning)} · ${esc(g.teams[ev.half].abbr)} batting</div>`; lastKey = key; }
    if (ev.type === 'SUB') { out += `<div class="ev sub">${esc(ev.desc)}</div>`; continue; }
    const uth = ev.lines.filter(l => !String(l[0]).startsWith('res')).map(l => `<div class="${l[0]}">${esc(l[1])}</div>`).join('');
    const sc = ev.runs ? ` <span class="tag">${esc(g.teams[0].abbr)} ${ev.scoreAfter[0]}, ${esc(g.teams[1].abbr)} ${ev.scoreAfter[1]}</span>` : '';
    out += `<div class="ev ${ev.runs ? 'run' : ''} ${ev === latest ? 'new' : ''}"><div class="d">${esc(ev.desc || '')}${sc} <span class="muted" style="font-weight:400">${ev.outsAfter != null ? `· ${Math.min(3, ev.outsAfter)} out` : ''}${ev.wpa != null && Math.abs(ev.wpa) >= 0.005 ? ` · WPA ${wpaStr(ev.wpa)}` : ''}</span></div><div class="uth">${uth}</div></div>`;
  }
  return out || '<p class="muted">Press <b>Pitch</b> (or <b>Roll the dice</b>) to start.</p>';
}
function gameScope() {
  const GS = st.game; if (!GS) return null; const k = GS.ctx.kind;
  const stt = k === 'season' ? S : k === 'post' ? P : k === 'one' ? st.one : k === 'tour' ? st.tour : k === 'exh' ? st.exhSeries : null;
  const label = { season: 'Season', post: 'Postseason', one: 'Series', tour: 'Tournament', exh: 'Series' }[k];
  if (!stt || !stt.bat) return { label: 'Game', stt: null };
  return { label, stt };
}
function scopeLine(kind, cid, cur, sc) {
  const base = sc && sc.stt ? (kind === 'b' ? sc.stt.bat : sc.stt.pit)[cid] : null;
  if (!base || (st.game && st.game.recorded)) return base && st.game && st.game.recorded ? base : cur;
  const o = Object.assign({}, base);
  for (const k of Object.keys(cur)) if (typeof cur[k] === 'number' && k !== 'cid' && k !== 'order') o[k] = (o[k] || 0) + cur[k];
  return o;
}
function boxScore(g) {
  const sc = gameScope() || { label: 'Game' };
  const wl = sc.label === 'Game' ? 'wOBA' : `wOBA (${sc.label})`;
  return [0, 1].map(s => {
    const T = g.teams[s];
    const bats = Object.values(T.bat).sort((a, b) => (a.order - b.order) || ((a.sub ? 1 : 0) - (b.sub ? 1 : 0)));
    const brow = (b) => { const x = scopeLine('b', b.cid, b, sc); const w = wobaBat(x); return `<tr><td class="l">${b.sub ? '&nbsp;&nbsp;' : ''}${esc(tn(b.cid))} <span class="muted">${b.pos}</span></td><td>${b.AB}</td><td>${b.R}</td><td>${b.H}</td><td>${b.RBI}</td><td>${b.BB}</td><td>${b.SO}</td><td>${b.D ? b.D + ' 2B' : ''}${b.T ? (b.D ? ', ' : '') + b.T + ' 3B' : ''}${b.HR ? ((b.D || b.T) ? ', ' : '') + b.HR + ' HR' : ''}</td><td class="${(b.WPA || 0) >= 0 ? 'pos' : 'neg'}">${wpaStr(b.WPA || 0)}</td><td>${w == null ? '—' : avg3(w)}</td></tr>`; };
    const tot = bats.reduce((a, b) => { for (const k of ['AB', 'R', 'H', 'RBI', 'BB', 'SO', 'WPA']) a[k] += b[k] || 0; return a; }, { AB: 0, R: 0, H: 0, RBI: 0, BB: 0, SO: 0, WPA: 0 });
    const prow = (cid) => { const p = T.pit[cid]; const x = scopeLine('p', cid, p, sc); const w = wobaPit(x); return `<tr><td class="l">${esc(tn(cid))}${p.dec ? ` <span class="tag ${p.dec === 'W' ? 'w' : ''}">${p.dec}</span>` : ''}</td><td>${ipStr(p.OUTS)}</td><td>${p.H}</td><td>${p.R}</td><td>${p.ER}</td><td>${p.BB}</td><td>${p.SO}</td><td>${p.HR}</td><td class="${(p.WPA || 0) >= 0 ? 'pos' : 'neg'}">${wpaStr(p.WPA || 0)}</td><td>${w == null ? '—' : avg3(w)}</td></tr>`; };
    return `<h3 style="margin-top:${s ? 14 : 0}px">${esc(T.name)}</h3><table class="mini"><thead><tr><th class="l">Batter</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>K</th><th>XBH</th><th>WPA</th><th>${wl}</th></tr></thead><tbody>${bats.map(brow).join('')}
      <tr><td class="l"><b>Totals</b></td><td>${tot.AB}</td><td>${tot.R}</td><td>${tot.H}</td><td>${tot.RBI}</td><td>${tot.BB}</td><td>${tot.SO}</td><td></td><td>${wpaStr(tot.WPA)}</td><td></td></tr></tbody></table>
      <table class="mini" style="margin-top:6px"><thead><tr><th class="l">Pitcher</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th><th>HR</th><th>WPA</th><th>${sc.label === 'Game' ? 'wOBA allowed' : `wOBA allowed (${sc.label})`}</th></tr></thead><tbody>${T.pitOrder.map(prow).join('')}</tbody></table>`;
  }).join('') + `<p class="muted" style="font-size:12px;margin-top:8px">WPA is this game's win probability added, from a win-expectancy table built from Box Seat simulations. ${sc.label === 'Game' ? 'wOBA is for this game.' : `wOBA covers the whole ${sc.label.toLowerCase()} so far, including this game.`}</p>`;
}

// ---------- exhibition ----------
function vExh() {
  const x = st.exh, s = st.exhSeries;
  let ser = '';
  if (s) {
    const over = seriesOver(s);
    ser = `<div class="panel"><h3>${esc(tName(s.lo))} at ${esc(tName(s.hi))} · ${s.fixed ? s.best + '-game set' : 'best of ' + s.best}</h3>
      <p><b>${team(s.hi).abbr} ${s.wins[s.hi] || 0}, ${team(s.lo).abbr} ${s.wins[s.lo] || 0}</b>${over && !s.fixed ? ` — ${esc(tName(s.winner))} win the series` : over ? ' — set complete' : ''}</p>
      <div class="schedule">${s.games.map((g, i) => `<div class="gline"><span>Game ${i + 1}: ${team(g.v).abbr} ${g.sc[0]} @ ${team(g.h).abbr} ${g.sc[1]}</span><span class="tag ${''}">${team(g.w).abbr} win</span><span></span></div>`).join('')}</div>
      <div class="row" style="margin-top:10px">${!over ? `<button class="btn go" data-act="exh-next">Play game ${s.games.length + 1}</button><button class="btn" data-act="exh-sim">Sim game ${s.games.length + 1}</button><button class="btn" data-act="exh-simall">Sim the rest</button>` : ''}<button class="btn" data-act="exh-reset">New matchup</button></div></div>`;
  }
  return `<div class="section"><div class="panel"><h2>Exhibition</h2><p class="muted">Lineups come from each club's most-used 2025 lineup against the opposing starter's hand. Starters rotate through the five most-used 2025 starters, and relievers tire across a series.</p>
    <div class="row" style="margin-top:10px;align-items:end"><label class="fld">Visitors ${teamSelect('exaway', x.away)}</label><label class="fld">Home ${teamSelect('exhome', x.home)}</label>
    <label class="fld">Games <select id="exn">${[1, 3, 4, 5, 7].map(n => `<option ${n === x.n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="fld">Format <select id="exfmt"><option value="best">Best of</option><option value="fixed">Play all games</option></select></label>
    <label class="fld">You manage <select id="exuser">${[['none', 'Nobody (watch)'], ['away', 'Visitors'], ['home', 'Home'], ['both', 'Both teams']].map(([v, l]) => `<option value="${v}" ${x.user === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div style="margin-top:10px">${optsBlock()}</div>
    <div class="row" style="margin-top:12px"><button class="btn go" data-act="exh-start">Start</button></div></div>${ser}</div>`;
}

// ---------- historical games ----------
function vHist() {
  const f = st.histFilter; const lim = st.histLimit || 60;
  let list = D.games;
  if (f.team) list = list.filter(g => g.v === f.team || g.h === f.team);
  if (f.type) list = list.filter(g => f.type === 'post' ? g.ty !== 'r' : g.ty === f.type);
  if (f.date) list = list.filter(g => g.d >= f.date);
  const shown = list.slice(0, lim);
  return `<div class="section"><div class="panel"><h2>Real 2025 games</h2><p class="muted">Every game from the 2025 Retrosheet record. With as-played lineups on, both clubs use the starters who actually took the field, and the bullpen follows the real order of relievers when it can. Final scores are shown so you can compare.</p>
    <div class="row" style="margin-top:10px;align-items:end">
      <label class="fld">Team <select data-chg="hist-team"><option value="">All teams</option>${TEAMLIST().map(c => `<option value="${c}" ${f.team === c ? 'selected' : ''}>${esc(tName(c))}</option>`).join('')}</select></label>
      <label class="fld">Games <select data-chg="hist-type"><option value="">All</option><option value="r" ${f.type === 'r' ? 'selected' : ''}>Regular season</option><option value="post" ${f.type === 'post' ? 'selected' : ''}>Postseason</option>${['WC', 'DS', 'LCS', 'WS'].map(t => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${TYN[t]}</option>`).join('')}</select></label>
      <label class="fld">From date <input type="date" data-chg="hist-date" min="2025-03-18" max="2025-11-01" value="${f.date ? f.date.slice(0, 4) + '-' + f.date.slice(4, 6) + '-' + f.date.slice(6, 8) : ''}"></label>
      <label class="chk"><input type="checkbox" id="hasp" checked> As-played lineups</label><label class="chk"><input type="checkbox" id="hwx" checked> Actual weather</label>
      <label class="fld">You manage <select id="huser"><option value="none">Nobody (watch)</option><option value="away">Visitors</option><option value="home">Home</option><option value="both">Both</option></select></label></div>
    <div style="margin-top:8px">${optsBlock()}</div></div>
    <div class="schedule">${shown.map(g => `<div class="gline"><span><span class="muted">${fmtDate(g.d)}${g.ty !== 'r' ? ' · ' + TYN[g.ty] : ''}</span><br><b>${esc(team(g.v).abbr)} ${g.sc[0]} @ ${esc(team(g.h).abbr)} ${g.sc[1]}</b> <span class="muted">${esc(tn(g.vl.sp))} vs ${esc(tn(g.hl.sp))}</span></span>
      <button class="btn sm go" data-act="hist-play" data-v="${g.id}">Play</button><button class="btn sm" data-act="hist-sim" data-v="${g.id}">Sim</button></div>`).join('')}
    ${list.length > lim ? `<button class="btn" data-act="hist-more">Show more (${list.length - lim} left)</button>` : ''}${!list.length ? '<p class="muted">No games match those filters.</p>' : ''}</div></div>`;
}

// ---------- season ----------
function standingsHtml(rec) {
  const divs = [['ALE', 'AL East'], ['ALC', 'AL Central'], ['ALW', 'AL West'], ['NLE', 'NL East'], ['NLC', 'NL Central'], ['NLW', 'NL West']];
  return `<div class="grid2">${divs.map(([d, nm]) => {
    const ts = Object.keys(D.teams).filter(c => D.teams[c].div === d).sort((a, b) => (rec[b].W - rec[b].L) - (rec[a].W - rec[a].L));
    const top = rec[ts[0]];
    return `<div class="scroll"><h3>${nm}</h3><table class="mini"><thead><tr><th class="l">Team</th><th>W</th><th>L</th><th>Pct</th><th>GB</th><th>RS</th><th>RA</th><th>L10</th></tr></thead><tbody>${ts.map(c => { const r = rec[c]; const gb = ((top.W - r.W) + (r.L - top.L)) / 2;
      return `<tr><td class="l">${esc(tName(c))}</td><td>${r.W}</td><td>${r.L}</td><td>${avg3(r.W / Math.max(1, r.W + r.L))}</td><td>${gb ? gb.toFixed(1) : '—'}</td><td>${r.RS}</td><td>${r.RA}</td><td>${r.last10.filter(x => x === 'W').length}-${r.last10.filter(x => x === 'L').length}</td></tr>`; }).join('')}</tbody></table></div>`;
  }).join('')}</div>`;
}
function leadersHtml(stt, lg, gamesPlayed) {
  const isLg = (cid, rec) => { const t = D.teams[rec.tm]; return t && t.lg === lg; };
  const bat = Object.entries(stt.bat).filter(([c, r]) => isLg(c, r));
  const pit = Object.entries(stt.pit).filter(([c, r]) => isLg(c, r));
  const minPA = Math.max(1, gamesPlayed * 3.1), minIP = Math.max(1, gamesPlayed * 1) * 3;
  const top = (arr, f, n, asc) => arr.map(([c, r]) => [c, r, f(r)]).filter(x => x[2] != null && isFinite(x[2])).sort((a, b) => asc ? a[2] - b[2] : b[2] - a[2]).slice(0, n || 5);
  const obp = (r) => (r.H + r.BB + r.HBP) / Math.max(1, r.AB + r.BB + r.HBP + r.SF), slg = (r) => (r.H + r.D + 2 * r.T + 3 * r.HR) / Math.max(1, r.AB);
  const cats = [
    ['Batting average', top(bat.filter(([c, r]) => r.PA >= minPA), r => r.H / r.AB), avg3],
    ['Home runs', top(bat, r => r.HR), v => v], ['Runs batted in', top(bat, r => r.RBI), v => v],
    ['OPS', top(bat.filter(([c, r]) => r.PA >= minPA), r => obp(r) + slg(r)), avg3], ['Stolen bases', top(bat, r => r.SB), v => v],
    ['ERA', top(pit.filter(([c, r]) => r.OUTS >= minIP), r => r.ER * 27 / r.OUTS, 5, true), v => v.toFixed(2)], ['Wins', top(pit, r => r.W), v => v],
    ['Strikeouts', top(pit, r => r.SO), v => v], ['Saves', top(pit, r => r.SV), v => v]
  ];
  return `<div class="row"><button class="btn sm ${lg === 'AL' ? 'on' : ''}" data-act="lg" data-v="AL">American League</button><button class="btn sm ${lg === 'NL' ? 'on' : ''}" data-act="lg" data-v="NL">National League</button></div>
  <div class="modes" style="margin-top:10px">${cats.map(([nm, rows, fmt]) => `<div class="panel"><h3>${nm}</h3><table class="mini"><tbody>${rows.map(([c, r, v]) => `<tr><td class="l">${esc(tn(+c))} <span class="muted">${team(r.tm).abbr}</span></td><td><b>${fmt(v)}</b></td></tr>`).join('') || '<tr><td class="l muted">No qualifiers yet</td></tr>'}</tbody></table></div>`).join('')}</div>`;
}
function vSeason() {
  if (!S) return `<div class="section"><div class="panel"><h2>2025 season replay</h2><p class="muted">Replays all 2,430 games of the real 2025 schedule in order. Simulate a day, a week or the whole year, or step in and manage any game yourself. Your season is saved in this browser.</p>
    <label class="chk" style="margin-top:10px"><input type="checkbox" id="sasp"> Use as-played lineups (real starting lineups, starting pitchers, reliever order and weather from every game)</label>
    <p class="muted" style="font-size:13px">Without it, each club uses its most common 2025 lineup against the opposing starter's hand, a five-man rotation that needs four days of rest, and weather rolled from the ballpark card.</p>
    <div style="margin-top:10px">${optsBlock()}</div>
    <div class="row" style="margin-top:10px"><button class="btn go" data-act="season-new">Start the season</button></div></div></div>`;
  const done = S.next >= S.sched.length;
  const nextRef = !done ? D.gamesById[S.sched[S.next]] : null;
  const today = nextRef ? D.games.filter(g => g.ty === 'r' && g.d === nextRef.d && !S.res[g.id]) : [];
  const played = Object.keys(S.res).length;
  const gp = played * 2 / 30;
  const v = st.seasonView;
  let body = '';
  if (v === 'standings') body = standingsHtml(S.rec);
  else if (v === 'leaders') body = leadersHtml(S, st.leaderLg, gp);
  else if (v === 'results') {
    const recent = S.sched.slice(Math.max(0, S.next - 60), S.next).reverse().map(id => D.gamesById[id]).filter(g => S.res[g.id]);
    body = `<div class="schedule">${recent.map(g => { const r = S.res[g.id]; return `<div class="gline"><span><span class="muted">${fmtDate(g.d)}</span> · <b>${team(g.v).abbr} ${r.sc[0]} @ ${team(g.h).abbr} ${r.sc[1]}</b>${r.inn > 9 ? ` (${r.inn})` : ''} <span class="muted">W ${esc(tn(r.w))}${r.l != null ? ' · L ' + esc(tn(r.l)) : ''}${r.s != null ? ' · SV ' + esc(tn(r.s)) : ''}</span></span><span class="muted" style="font-size:12px">Real: ${g.sc[0]}-${g.sc[1]}</span><span></span></div>`; }).join('') || '<p class="muted">No games played yet.</p>'}</div>`;
  }
  return `<div class="section"><div class="panel"><div class="row" style="justify-content:space-between"><div><div class="eyebrow">${S.asPlayed ? 'As-played lineups' : 'Manager AI lineups'}</div><h2>2025 season replay</h2></div>
    <button class="btn sm" data-act="season-reset">Erase season</button></div>
    <p id="simprog" class="muted">${done ? 'Regular season complete.' : `Next up: ${fmtDate(nextRef.d)} · ${played} of ${S.sched.length} games played`}</p>
    ${!done ? `<div class="row"><button class="btn" data-act="season-simday">Sim this day</button><button class="btn" data-act="season-simweek">Sim a week</button><button class="btn" data-act="season-sim" data-v="0">Sim to end of season</button></div>` : `<div class="row"><button class="btn go" data-act="season-to-post">Start postseason from these standings</button></div>`}
    ${today.length ? `<div style="margin-top:12px"><div class="row" style="justify-content:space-between"><h3>${fmtDate(nextRef.d)}</h3><label class="fld">You manage <select id="suser"><option value="home">Home team</option><option value="away">Visitors</option><option value="both">Both</option><option value="none">Nobody (watch)</option></select></label></div>
      <div class="schedule" style="margin-top:6px">${today.map(g => `<div class="gline"><span><b>${esc(tName(g.v))} @ ${esc(tName(g.h))}</b> <span class="muted">${g.dn === 'd' ? 'day' : 'night'}${S.asPlayed ? ' · ' + esc(tn(g.vl.sp)) + ' vs ' + esc(tn(g.hl.sp)) : ''}</span></span><button class="btn sm go" data-act="season-play" data-v="${g.id}">Play</button><span></span></div>`).join('')}</div></div>` : ''}
    </div>
    <div class="row">${[['standings', 'Standings'], ['leaders', 'Leaders'], ['results', 'Recent results']].map(([k, l]) => `<button class="btn sm ${v === k ? 'on' : ''}" data-act="season-view" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="panel">${body}</div></div>`;
}

// ---------- postseason ----------
function vPost() {
  if (!P) return `<div class="section"><div class="panel"><h2>2025 postseason</h2><p class="muted">The real 2025 bracket: Toronto, Seattle, Cleveland, New York, Boston and Detroit in the American League; Milwaukee, Philadelphia, Los Angeles, Chicago, San Diego and Cincinnati in the National League.${S && S.next >= S.sched.length ? ' Your finished season replay can seed its own bracket from the Season tab.' : ''}</p>
    <label class="chk" style="margin-top:8px"><input type="checkbox" id="pasp" checked> Use as-played lineups whenever the real series had that game</label>
    <div style="margin-top:10px">${optsBlock()}</div>
    <div class="row" style="margin-top:10px"><button class="btn go" data-act="post-new">Open the bracket</button></div></div>${oneSeriesHtml()}</div>`;
  const col = (r, title) => `<div style="display:grid;gap:10px;align-content:start"><div class="eyebrow">${title}</div>${P.series.filter(s => s.round === r).map(serBox).join('')}</div>`;
  return `<div class="section"><div class="panel"><div class="row" style="justify-content:space-between"><div><div class="eyebrow">${P.from === 'season' ? 'Seeded from your season replay' : 'Real 2025 seeds'}${P.asPlayed ? ' · as-played lineups' : ''}</div><h2>${P.champ ? esc(tName(P.champ)) + ' win the World Series' : 'Postseason bracket'}</h2></div>
    <div class="row"><label class="fld">You manage <select id="puser"><option value="none">Nobody</option><option value="hi">Higher seed</option><option value="lo">Lower seed</option><option value="both">Both</option></select></label>
    ${!P.champ ? `<button class="btn" data-act="post-simround">Sim this round</button><button class="btn" data-act="post-simall">Sim the rest</button>` : ''}<button class="btn sm" data-act="post-reset">Erase bracket</button></div></div></div>
    <div class="bracket">${col('WC', 'Wild Card · best of 3')}${col('DS', 'Division Series · best of 5')}${col('LCS', 'LCS · best of 7')}${col('WS', 'World Series · best of 7')}</div>${oneSeriesHtml()}</div>`;
}
function serBox(s) {
  if (!s.hi || !s.lo) return `<div class="ser"><span class="muted">${s.lg} ${s.round}: ${s.hi ? esc(team(s.hi).abbr) + ' vs ' : ''}awaiting</span></div>`;
  const seed = (c) => { const i = (P.seeds[s.lg] || P.seeds.AL.concat(P.seeds.NL)).indexOf(c); return s.lg === 'MLB' ? '' : (i + 1) + ' '; };
  const over = seriesOver(s);
  return `<div class="ser">${[s.hi, s.lo].map(c => `<div class="t ${s.winner === c ? 'win' : ''}"><span>${seed(c)}${esc(tName(c))}</span><b>${s.wins[c] || 0}</b></div>`).join('')}
    ${s.games.length ? `<div class="muted" style="font-size:12px">${s.games.map((g, i) => `G${i + 1} ${team(g.v).abbr} ${g.sc[0]}-${g.sc[1]} ${team(g.h).abbr}`).join(' · ')}</div>` : ''}
    ${!over && P.round === s.round ? `<div class="row"><button class="btn sm go" data-act="post-play" data-v="${s.id}">Play G${s.games.length + 1}</button><button class="btn sm" data-act="post-sim" data-v="${s.id}">Sim G${s.games.length + 1}</button><button class="btn sm" data-act="post-simser" data-v="${s.id}">Sim series</button></div>` : ''}</div>`;
}



// ======================================================
// custom tournaments
// ======================================================
function bracketOrder(n) { let o = [1]; while (o.length < n) { const m = o.length * 2; o = o.flatMap(x => [x, m + 1 - x]); } return o; }
function rrSchedule(teams, reps) {
  const t = teams.slice(); if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; if (a && b) games.push((r + i) % 2 ? [a, b] : [b, a]); }
    rounds.push(games); t.splice(1, 0, t.pop());
  }
  const out = [];
  for (let k = 0; k < reps; k++) rounds.forEach((gs, r) => gs.forEach(([v, h]) => out.push({ v: k % 2 ? h : v, h: k % 2 ? v : h, day: (k * rounds.length + r) * 2, sc: null })));
  return out;
}
function newTour(o) {
  const t = { from: 'tour', name: o.name, teams: o.teams, format: o.format, rrGames: o.rrGames, poSize: o.poSize, bestPO: o.bestPO, bestFinal: o.bestFinal, myTeam: o.myTeam,
    opts: readOpts(), rr: [], rec: {}, series: [], rounds: [], champ: null, plog: {}, rot: {}, res: {}, bat: {}, pit: {}, stage: 'rr', seeds: [] };
  t.teams.forEach(c => { t.rec[c] = { W: 0, L: 0, RS: 0, RA: 0, home: [0, 0], away: [0, 0], last10: [] }; t.rot[c] = 0; });
  if (o.format === 'bracket') { t.stage = 'po'; tourBracket(t, o.seedOrder); }
  else t.rr = rrSchedule(t.teams, o.rrGames);
  return t;
}
function tourStandings(t) { return t.teams.slice().sort((a, b) => { const A = t.rec[a], Bv = t.rec[b]; const pa = A.W / Math.max(1, A.W + A.L), pb = Bv.W / Math.max(1, Bv.W + Bv.L); return pb - pa || (Bv.RS - Bv.RA) - (A.RS - A.RA); }); }
function tourBracket(t, seeds) {
  t.seeds = seeds.slice(); t.stage = 'po';
  const P = seeds.length, size = 2 ** Math.ceil(Math.log2(Math.max(2, P)));
  const nRounds = Math.log2(size);
  const order = bracketOrder(size);
  t.rounds = [];
  for (let r = 0; r < nRounds; r++) t.rounds.push(Array.from({ length: size / 2 ** (r + 1) }, (_, i) => null));
  // first round slots
  t.slots = order.map(sd => sd <= P ? seeds[sd - 1] : null);
  t.nRounds = nRounds; t.series = [];
  tourAdvance(t);
}
function tourMk(t, r, i, a, b) {
  const sa = t.seeds.indexOf(a), sb = t.seeds.indexOf(b);
  const hi = sa <= sb ? a : b, lo = hi === a ? b : a;
  const best = r === t.nRounds - 1 ? t.bestFinal : t.bestPO;
  const s = { id: `T${r}-${i}`, round: 'TOUR', r, i, best, hi, lo, wins: { [hi]: 0, [lo]: 0 }, games: [], winner: null };
  t.series.push(s); t.rounds[r][i] = s.id; return s;
}
function tourAdvance(t) {
  if (t.stage !== 'po') return;
  const by = (id) => t.series.find(s => s.id === id);
  for (let r = 0; r < t.nRounds; r++) {
    for (let i = 0; i < t.rounds[r].length; i++) {
      if (t.rounds[r][i]) { const s = by(t.rounds[r][i]); if (s && !s.winner && seriesOver(s)) s.winner = (s.wins[s.hi] || 0) > (s.wins[s.lo] || 0) ? s.hi : s.lo; continue; }
      const feed = (j) => { if (r === 0) return { team: t.slots[j], done: true }; const id = t.rounds[r - 1][j]; if (id === 'BYE') return { team: t.byeWinner[(r - 1) + ':' + j], done: true }; const s = id && by(id); return s && s.winner ? { team: s.winner, done: true } : { team: null, done: false }; };
      const A = feed(2 * i), Bf = feed(2 * i + 1);
      if (!A.done || !Bf.done) continue;
      if (A.team && Bf.team) tourMk(t, r, i, A.team, Bf.team);
      else { t.rounds[r][i] = 'BYE'; t.byeWinner = t.byeWinner || {}; t.byeWinner[r + ':' + i] = A.team || Bf.team; }
    }
  }
  const finalId = t.rounds[t.nRounds - 1][0];
  if (finalId === 'BYE') t.champ = t.byeWinner[(t.nRounds - 1) + ':0'];
  else { const f = finalId && by(finalId); if (f && f.winner) { t.champ = f.winner; t.stage = 'done'; } }
}
function tourGameSetup(t, v, h, day) {
  t.plog = t.plog || {};
  const sp = [pickStarter(t, v, day), pickStarter(t, h, day)];
  return { away: v, home: h, date: '20250801', dn: Math.random() < .3 ? 'D' : 'N', seed: (Math.random() * 2 ** 31) | 0, sp, tired: [tiredSet(t, v, day), tiredSet(t, h, day)], opts: t.opts, isPost: false };
}
function tourUser(t, v, h) { const m = t.myTeam; if (m === 'all') return 'both'; if (m === v) return 'away'; if (m === h) return 'home'; return 'none'; }
function tourNextRR(t) { return t.rr.findIndex(x => !x.sc); }
function tourRecord(t, ctx, g) {
  if (ctx.rr != null) {
    const x = t.rr[ctx.rr]; x.sc = g.score.slice();
    accumulate(t, g, 'R' + ctx.rr); logPitching(t, g, x.day);
    if (tourNextRR(t) < 0 && t.format === 'rrpo') tourBracket(t, tourStandings(t).slice(0, t.poSize));
    else if (tourNextRR(t) < 0) { t.stage = 'done'; t.champ = tourStandings(t)[0]; }
  } else {
    recordSeriesGame(t, ctx.sid, g); tourAdvance(t);
  }
  store.set('bsb-tour', t);
}
function tourSimRR(t, n) {
  let k = 0;
  while (k++ < n) {
    const i = tourNextRR(t); if (i < 0) break;
    const x = t.rr[i]; const g = AI.buildGame(D, tourGameSetup(t, x.v, x.h, x.day)); AI.simGame(g);
    archiveGame(g, 'tour', `${t.name} · round robin`, 'tour:' + Date.now() + ':' + i, false);
    tourRecord(t, { rr: i }, g);
  }
  st.recs = null;
}
function tourSimSeries(t, s, all) {
  let k = 0;
  do { if (seriesOver(s)) break; simSeriesGame(s, t); tourAdvance(t); k++; } while (all && k < 10);
  store.set('bsb-tour', t);
}
function vTour() {
  const t = st.tour;
  if (!t) {
    const sel = st.tourPick || [];
    const quick = [['AL', 'American League'], ['NL', 'National League'], ['P25', '2025 playoff teams'], ['ALL', 'All 30'], ['NONE', 'Clear']];
    return `<div class="section"><div class="panel"><h2>Custom tournament</h2><p class="muted">Pick any 2025 clubs and a format. Round-robin games rotate starters with rest days, and playoff series follow 2-2-1 (five games) or 2-3-2 (seven games) home field for the higher seed.</p>
      <div class="row" style="align-items:end;margin-top:10px"><label class="fld">Name <input type="text" id="tname" value="${esc(st.tourName || 'Box Seat Invitational')}"></label>
        <label class="fld">Format <select id="tfmt"><option value="bracket">Bracket (knockout series)</option><option value="rrpo">Round robin, then playoffs</option><option value="rr">Round robin only</option></select></label>
        <label class="fld">Round-robin meetings <select id="trr">${[1, 2, 3, 4, 6].map(n => `<option ${n === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="fld">Playoff teams <select id="tpo">${[2, 4, 6, 8, 12, 16].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="fld">Series length <select id="tbest">${[1, 3, 5, 7].map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>Best of ${n}</option>`).join('')}</select></label>
        <label class="fld">Final <select id="tfinal">${[1, 3, 5, 7].map(n => `<option value="${n}" ${n === 7 ? 'selected' : ''}>Best of ${n}</option>`).join('')}</select></label>
        <label class="fld">Seeding (bracket) <select id="tseed"><option value="pick">Order picked</option><option value="record">2025 record</option><option value="random">Random draw</option></select></label>
        <label class="fld">You manage <select id="tmy"><option value="none">Nobody (watch)</option><option value="all">Every game, both sides</option>${TEAMLIST().map(c => `<option value="${c}">${esc(tName(c))}</option>`).join('')}</select></label></div>
      <div class="row" style="margin-top:12px"><span class="eyebrow">Teams (${sel.length} picked)</span>${quick.map(([k, l]) => `<button class="btn sm" data-act="tq" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="tpick">${TEAMLIST().map(c => `<label class="chk ${sel.includes(c) ? 'on' : ''}"><input type="checkbox" data-act="tpick" data-v="${c}" ${sel.includes(c) ? 'checked' : ''}> ${sel.includes(c) ? `<b>${sel.indexOf(c) + 1}</b> ` : ''}${esc(tName(c))}</label>`).join('')}</div>
      <div style="margin-top:10px">${optsBlock()}</div>
      <div class="row" style="margin-top:12px"><button class="btn go" data-act="tour-new" ${sel.length < 2 ? 'disabled' : ''}>Start tournament</button></div></div></div>`;
  }
  const nxt = tourNextRR(t);
  let body = '';
  if (t.rr.length) {
    const stand = tourStandings(t);
    body += `<div class="panel"><div class="row" style="justify-content:space-between"><h3>Round robin · ${t.rr.filter(x => x.sc).length} of ${t.rr.length} games</h3>
      ${nxt >= 0 ? `<div class="row"><button class="btn go sm" data-act="tour-play-rr">Play next</button><button class="btn sm" data-act="tour-sim-rr" data-v="1">Sim next</button><button class="btn sm" data-act="tour-sim-rr" data-v="10">Sim 10</button><button class="btn sm" data-act="tour-sim-rr" data-v="9999">Sim the rest</button></div>` : ''}</div>
      ${nxt >= 0 ? `<p class="muted">Next: ${esc(tName(t.rr[nxt].v))} at ${esc(tName(t.rr[nxt].h))}</p>` : ''}
      <div class="scroll"><table class="mini"><thead><tr><th class="l">#</th><th class="l">Team</th><th>W</th><th>L</th><th>Pct</th><th>RS</th><th>RA</th><th>Diff</th></tr></thead><tbody>${stand.map((c, i) => { const r = t.rec[c]; return `<tr class="${t.format === 'rrpo' && i < t.poSize ? 'po' : ''}"><td class="l">${i + 1}</td><td class="l">${esc(tName(c))}</td><td>${r.W}</td><td>${r.L}</td><td>${avg3(r.W / Math.max(1, r.W + r.L))}</td><td>${r.RS}</td><td>${r.RA}</td><td>${r.RS - r.RA > 0 ? '+' : ''}${r.RS - r.RA}</td></tr>`; }).join('')}</tbody></table></div>
      ${t.format === 'rrpo' ? `<p class="muted" style="font-size:13px">Top ${t.poSize} advance to the playoffs.</p>` : ''}</div>`;
  }
  if (t.stage !== 'rr' && t.rounds.length) {
    const by = (id) => t.series.find(s => s.id === id);
    const rname = (r) => { const left = t.nRounds - r; return left === 1 ? 'Final' : left === 2 ? 'Semifinals' : left === 3 ? 'Quarterfinals' : `Round ${r + 1}`; };
    body += `<div class="bracket tb" style="grid-template-columns:repeat(${t.nRounds}, minmax(190px,1fr))">${t.rounds.map((round, r) => `<div style="display:grid;gap:10px;align-content:start"><div class="eyebrow">${rname(r)} · best of ${r === t.nRounds - 1 ? t.bestFinal : t.bestPO}</div>${round.map(id => {
      if (id === 'BYE') return '';
      const s = id && by(id);
      if (!s) return `<div class="ser"><span class="muted">Awaiting winners</span></div>`;
      const over = seriesOver(s);
      return `<div class="ser">${[s.hi, s.lo].map(c => `<div class="t ${s.winner === c ? 'win' : ''}"><span>${t.seeds.indexOf(c) + 1} ${esc(tName(c))}</span><b>${s.wins[c] || 0}</b></div>`).join('')}
        ${s.games.length ? `<div class="muted" style="font-size:12px">${s.games.map((g, i) => `G${i + 1} ${team(g.v).abbr} ${g.sc[0]}-${g.sc[1]} ${team(g.h).abbr}`).join(' · ')}</div>` : ''}
        ${!over ? `<div class="row"><button class="btn sm go" data-act="tour-play-s" data-v="${s.id}">Play G${s.games.length + 1}</button><button class="btn sm" data-act="tour-sim-s" data-v="${s.id}">Sim G${s.games.length + 1}</button><button class="btn sm" data-act="tour-sim-ser" data-v="${s.id}">Sim series</button></div>` : ''}</div>`;
    }).join('')}</div>`).join('')}</div>`;
  }
  return `<div class="section"><div class="panel"><div class="row" style="justify-content:space-between"><div><div class="eyebrow">${{ bracket: 'Knockout bracket', rrpo: 'Round robin + playoffs', rr: 'Round robin' }[t.format]} · ${t.teams.length} teams</div>
    <h2>${t.champ ? esc(tName(t.champ)) + ' win the ' + esc(t.name) : esc(t.name)}</h2></div>
    <div class="row">${t.stage === 'po' && !t.champ ? `<button class="btn sm" data-act="tour-sim-all">Sim the rest</button>` : ''}<button class="btn sm" data-act="tour-reset">${t.champ ? 'New tournament' : 'Abandon tournament'}</button></div></div></div>${body}</div>`;
}

// ---------- records ----------
const recSort = (a, b) => (a.date || '').localeCompare(b.date || '') || a.ts - b.ts;
function fileBase(r) { return `${r.date || 'game'}-${r.box[0].abbr}-at-${r.box[1].abbr}`.replace(/[^\w-]/g, ''); }
function archiveLike(g) { const r = archiveGameObj(g); return r; }
function archiveGameObj(g) { const saved = ARC.put; ARC.put = () => {}; const ctx = st.game.ctx; const r = archiveGame(g, ctx.kind, KINDN[ctx.kind] + (g.over ? '' : ' · in progress'), 'tmp', true); ARC.put = saved; return r; }
function scopedRecs() { let r = st.recs || []; if (st.recScope && st.recScope !== 'all') r = r.filter(x => x.kind === st.recScope); if (st.recTeam) r = r.filter(x => x.box.some(T => T.code === st.recTeam)); return r; }
function vRecords() {
  if (!st.recs) { ARC.all().then(r => { st.recs = r; if (st.tab === 'records') render(); }); return `<div class="loading">Opening the scorebook…</div>`; }
  const E = st.exportText;
  const exp = E ? `<div class="panel"><div class="row" style="justify-content:space-between"><h3>${esc(E.filename)}</h3><div class="row"><button class="btn sm go" data-act="rec-copy">Copy all</button><button class="btn sm" data-act="rec-close">Close</button></div></div>
    <p class="muted">Saving files isn't available in this view, so the export is shown here. Copy it into a text editor or spreadsheet and save it with the name above.</p><textarea id="exporttext" readonly>${esc(E.data)}</textarea></div>` : '';
  const recs = scopedRecs().slice().sort((a, b) => recSort(b, a));
  const lim = st.recLimit || 100;
  const counts = {}; (st.recs || []).forEach(r => counts[r.kind] = (counts[r.kind] || 0) + 1);
  return `<div class="section">${exp}<div class="panel"><h2>Scorebook</h2><p class="muted">Every game you play, watch or simulate is kept in this browser with its box score and play-by-play. Games you played or watched also keep every chart lookup.</p>
    <div class="row" style="align-items:end;margin-top:8px"><label class="fld">Games <select data-chg="rec-scope"><option value="all">All (${(st.recs || []).length})</option>${Object.keys(KINDN).map(k => `<option value="${k}" ${st.recScope === k ? 'selected' : ''}>${KINDN[k]} (${counts[k] || 0})</option>`).join('')}</select></label>
      <label class="fld">Team <select data-chg="rec-team"><option value="">All teams</option>${TEAMLIST().map(c => `<option value="${c}" ${st.recTeam === c ? 'selected' : ''}>${esc(tName(c))}</option>`).join('')}</select></label></div>
    <div class="row" style="margin-top:10px"><span class="eyebrow" style="width:100%">Export ${recs.length} game${recs.length === 1 ? '' : 's'}</span>
      <button class="btn" data-act="rec-bulk" data-v="txt">Game logs &amp; box scores (.txt)</button><button class="btn" data-act="rec-bulk" data-v="pbp">Play-by-play (.csv)</button><button class="btn" data-act="rec-bulk" data-v="bat">Batting stats (.csv)</button>
      <button class="btn" data-act="rec-bulk" data-v="pit">Pitching stats (.csv)</button><button class="btn" data-act="rec-bulk" data-v="json">Full data (.json)</button></div></div>
    <div class="schedule">${recs.slice(0, lim).map(r => `<div class="gline rec"><span><span class="muted">${r.date ? fmtDate(r.date) + ' · ' : ''}${esc(r.label)}</span><br><b>${esc(r.box[0].abbr)} ${r.score[0]} @ ${esc(r.box[1].abbr)} ${r.score[1]}</b>${r.inn > 9 ? ` <span class="muted">(${r.inn})</span>` : ''}</span>
      <span class="row" style="gap:6px"><button class="btn sm" data-act="rec-view" data-v="${esc(r.id)}">${st.recOpen === r.id ? 'Hide' : 'View'}</button><button class="btn sm" data-act="rec-export" data-v="${esc(r.id)}">Export</button><button class="btn sm" data-act="rec-pbp" data-v="${esc(r.id)}">Play-by-play</button></span>
      ${st.recOpen === r.id ? `<pre class="gametext">${esc(gameText(r))}</pre>` : ''}</div>`).join('') || '<p class="muted">No games yet. Play or simulate a game and it will appear here.</p>'}
    ${recs.length > lim ? `<button class="btn" data-act="rec-more">Show more (${recs.length - lim} left)</button>` : ''}</div></div>`;
}

// ---------- single series ----------
function realSeries() {
  const m = {};
  D.games.filter(g => g.ty !== 'r').sort((a, b) => a.d.localeCompare(b.d)).forEach(g => {
    const key = g.ty + ':' + [g.v, g.h].sort().join('-');
    if (!m[key]) m[key] = { key, ty: g.ty, hi: g.h, lo: g.v, w: {} };
    const win = g.sc[0] > g.sc[1] ? g.v : g.h; m[key].w[win] = (m[key].w[win] || 0) + 1;
  });
  return Object.values(m).sort((a, b) => ['WC', 'DS', 'LCS', 'WS'].indexOf(b.ty) - ['WC', 'DS', 'LCS', 'WS'].indexOf(a.ty));
}
function oneSeriesHtml() {
  const O = st.one;
  if (O) {
    const s = O.series[0]; const over = seriesOver(s);
    const winner = over ? ((s.wins[s.hi] || 0) > (s.wins[s.lo] || 0) ? s.hi : s.lo) : null;
    return `<div class="panel"><div class="row" style="justify-content:space-between"><div><div class="eyebrow">Single series · ${TYN[s.round]} · best of ${s.best}${O.asPlayed ? ' · as-played lineups' : ''}</div>
      <h2>${esc(tName(s.lo))} vs ${esc(tName(s.hi))}</h2></div><button class="btn sm" data-act="one-reset">New series</button></div>
      <p><b>${team(s.hi).abbr} ${s.wins[s.hi] || 0}, ${team(s.lo).abbr} ${s.wins[s.lo] || 0}</b>${winner ? ` — ${esc(tName(winner))} win the series` : ''}</p>
      <div class="schedule">${s.games.map((g, i) => `<div class="gline"><span>Game ${i + 1}: ${team(g.v).abbr} ${g.sc[0]} @ ${team(g.h).abbr} ${g.sc[1]}</span><span class="tag">${team(g.w).abbr}</span><span></span></div>`).join('')}</div>
      ${!over ? `<div class="row" style="margin-top:10px"><button class="btn go" data-act="one-play">Play game ${s.games.length + 1}</button><button class="btn" data-act="one-sim">Sim game ${s.games.length + 1}</button><button class="btn" data-act="one-simser">Sim the series</button></div>` : ''}</div>`;
  }
  const rs = realSeries(); const pick = st.onePick || rs[0].key;
  return `<div class="panel"><h2>Play one series</h2><p class="muted">Replay a single 2025 postseason series, or set up any matchup in a playoff format. Home field follows the postseason pattern (2-2-1 for five games, 2-3-2 for seven).</p>
    <div class="row" style="align-items:end;margin-top:8px"><label class="fld">Series <select id="onepick" data-chg="one-pick">${rs.map(r => `<option value="${r.key}" ${pick === r.key ? 'selected' : ''}>${r.ty} · ${esc(team(r.lo).abbr)} vs ${esc(team(r.hi).abbr)} (real: ${Object.entries(r.w).map(([c, n]) => team(c).abbr + ' ' + n).join('-')})</option>`).join('')}<option value="custom" ${pick === 'custom' ? 'selected' : ''}>Custom matchup…</option></select></label>
    ${pick === 'custom' ? `<label class="fld">Home field ${teamSelect('onehi', 'LAN')}</label><label class="fld">Opponent ${teamSelect('onelo', 'NYA')}</label><label class="fld">Format <select id="oneround"><option value="WC">Wild Card (best of 3)</option><option value="DS">Division Series (5)</option><option value="LCS">LCS (7)</option><option value="WS" selected>World Series (7)</option></select></label>` : ''}
    <label class="fld">You manage <select id="oneuser"><option value="none">Nobody</option><option value="hi">Home-field team</option><option value="lo">Other team</option><option value="both">Both</option></select></label>
    <label class="chk"><input type="checkbox" id="oneasp" checked> As-played lineups when the real game exists</label></div>
    <div style="margin-top:8px">${optsBlock()}</div>
    <div class="row" style="margin-top:10px"><button class="btn go" data-act="one-new">Start series</button></div></div>`;
}

// ---------- cards ----------
function vCards() {
  const c = st.cardsTeam; const T = team(c);
  const bats = T.bat.slice().sort((a, b) => (D.cards[b].L.ab + D.cards[b].R.ab) - (D.cards[a].L.ab + D.cards[a].R.ab));
  const pits = T.pit.slice().sort((a, b) => D.cards[b].IP - D.cards[a].IP);
  const park = D.parks[c];
  return `<div class="section"><div class="panel"><div class="row" style="justify-content:space-between;align-items:end"><div><div class="eyebrow">2025 card set</div><h2>${esc(tName(c))}</h2></div>
    <label class="fld">Team <select data-chg="cards-team">${TEAMLIST().map(x => `<option value="${x}" ${x === c ? 'selected' : ''}>${esc(tName(x))}</option>`).join('')}</select></label></div>
    <div class="grid2" style="margin-top:10px"><div><h3>Default lineups</h3><table class="mini"><thead><tr><th class="l">vs RHP</th><th class="l">vs LHP</th></tr></thead><tbody>${T.luR.map((x, i) => `<tr><td class="l">${esc(tn(x[0]))} <span class="muted">${B.NUMPOS[x[1]]}</span></td><td class="l">${T.luL[i] ? esc(tn(T.luL[i][0])) + ` <span class="muted">${B.NUMPOS[T.luL[i][1]]}</span>` : ''}</td></tr>`).join('')}</tbody></table>
      <p class="muted" style="font-size:13px">Rotation: ${T.rot.map(tn).map(esc).join(', ')}</p></div>
      <div><h3>${esc(park.name)}</h3><div class="kv"><span class="muted">Home run ratings</span><span>LF ${B.fmtS(park.hrL)} · CF ${B.fmtS(park.hrC)} · RF ${B.fmtS(park.hrR)}</span>
        <span class="muted">Dimensions</span><span>${Object.entries(park.dims).map(([k, v]) => `${k.toLowerCase()} ${v[0]} ft${v[1] ? ' (' + v[1] + ' ft wall)' : ''}`).join(' · ')}</span>
        <span class="muted">Roof</span><span>${park.roof ? 'Retractable or dome (roof-closed temperatures on the weather chart)' : 'Open air'}</span>${park.pec ? `<span class="muted">Peculiarity</span><span>${esc(park.pec)}</span>` : ''}</div>
        <table class="mini" style="margin-top:8px"><thead><tr><th>BP #</th><th>Singles / NF / GB</th><th>Doubles / LF</th><th>Triples</th></tr></thead><tbody>${[4, 3, 2, 1, 0, -1, -2, -3, -4].map(r => `<tr><td>${r}</td><td>${park.bp.S[r] || ''}</td><td>${park.bp.D[r] || ''}</td><td>${park.bp.T[r] || ''}</td></tr>`).join('')}</tbody></table></div></div></div>
    <h3>Batters (${bats.length})</h3><div class="cards2">${bats.map(x => batterCard(D.cards[x])).join('')}</div>
    <h3>Pitchers (${pits.length})</h3><div class="cards2">${pits.map(x => pitcherCard(D.cards[x])).join('')}</div>
    <h3>Generic pitcher hitting cards</h3><div class="cards2">${D.gen.slice(0, 2).map(x => batterCard(D.cards[x], null, null, 'Generic')).join('')}</div></div>`;
}

// ---------- rules ----------
function vRules() {
  const fb = C.cd.fb; const cdRow = (t) => Object.entries(t).map(([br, a]) => `<tr><td class="l">${br}</td>${a.map(v => `<td>${v == null ? 'No adv' : v === 'Adv' ? 'Adv' : v + '-9'}</td>`).join('')}</tr>`).join('');
  return `<div class="section rules"><div class="panel"><div class="eyebrow">Under The Hood standard version (2026 Tri-Folds)</div><h2>How every play is resolved</h2>
  <p>Each at-bat rolls five dice: the white and black six-sided dice (read as a two-digit number, 11–66), the red and green ten-sided dice, and the pitcher die (R, −3, −2, −1, 0, 1, 2D, 3E, A, B). The engine follows the board-game routines below and writes every lookup into the play-by-play when <b>Under the hood</b> is on.</p>
  <h3>1. The batter's card</h3><p>White-black picks the row on the batter's card, in the column for the pitcher's throwing hand. Switch hitters bat from the opposite side. Results split with a slash (SN2/HBP) use the red die: 0–4 takes the first, 5–9 the second.</p>
  <h3>2. Blue results</h3><p><b>K(n)</b> and <b>BB(n)</b> check the pitcher's K or BB column at row n against the batter's side; a listed result overrides the strikeout or walk. <b>BB(n)*</b> becomes a strikeout when the pitcher blocks it. Pitcher results split by a slash read bases empty / runners on, and BTR keeps the batter's result. Extreme control (EWR) pitchers turn a plain BB into a special-situations out on red 5–9. <b>RNG-</b> results start a range check; <b>-SPH</b> results go to the Scoring Position Hit chart with runners in scoring position. DFL and DFM split into deep fly checks or long flies by the red die. <b>RP/+WP</b> checks for a wild pitch or passed ball with runners on (red die + pitcher WP against the catcher's F rating), then rolls the Rare Play chart, where 11–16 sends you to the five-page Wild Play chart.</p>
  <h3>3. Red results and the hit check</h3><p>Green (tens) and red (ones) are compared with the batter's Hit(uth) range. A number in parentheses is an automatic scoring-position out with runners on second or third. A roll at or above the hit range is an automatic hit. Otherwise the pitcher die decides: a number checks the pitcher's Hit column, R starts a range check, 2D and 3E defer to a starter's Early (1st inning) or Late (7th+) rating, and A or B can turn the hit into a special-situations out. Batters with a Chrt(uth) rating use the Low Average Batter Hit Check chart instead. Hit by pitch has its own routine against the pitcher's HBP rating.</p>
  <h3>4. Fielders, base advance and checks</h3><p>The red die (or the green die when red shows 0, which also triggers an error check) picks the fielder from the Tri-Fold charts for the base situation: bases empty, runner on first, or scoring position. Ground balls use the hard, regular and slow grounder advance rules, infield in and back, double play checks adjusted by the pivot man's DP rating, and the SG Home coach's decision. Hits use the single and double charts with B/R requirements (two-out codes in parentheses), coach's decisions against the outfielder's arm, and the OF CK range routine that can stretch a single or hold a double. Deep flies add the pitcher's HR rating, the ballpark's field rating and the wind effect, then roll the red die for a home run.</p>
  <h3>5. Fatigue, weather and strategy</h3><p>Choose the fatigue rule in each setup screen. <b>Level 1</b>: −1 per batter faced (not intentional walks); starters begin at 20 or higher, relievers at 15 or lower; +4 when a starter finishes 7 innings allowing one earned run or fewer. <b>Level 2</b>: −1 per baserunner, −0.66 per out, +1 for each runner erased on the bases; starters begin at 15 or higher, relievers at 11 or lower; +3 for the 7-inning bonus. <b>Level 2, relievers halved</b> is your house rule: a reliever's Level 2 rating is cut in half when he enters. Once a pitcher reaches 0, the Level 1 or Level 2 section of the Fatigued Pitcher chart lets hits and walks through on low red rolls. Game-time temperature and wind are rolled from each ballpark card's month and day/night table (or taken from the real game). Stolen bases use the auto-steal chart for the AI and the jump chart when you send a runner. Sacrifice bunts, suicide squeezes, hit and run, intentional walks, infield in and guarding the lines all follow the Miscellaneous Game Charts.</p>
  <h3>Coach's decision on fly balls (red die needed to be safe)</h3><div class="scroll"><table class="mini" style="max-width:420px"><thead><tr><th class="l">B/R</th><th>Arm A</th><th>Arm B</th><th>Arm C</th><th>Arm D</th></tr></thead><tbody>${cdRow(fb)}</tbody></table></div>
  <h3>Deep fly check</h3><p>Total of pitcher HR rating + park field rating + wind: ${Object.entries(C.dfck).sort((a, b) => b[0] - a[0]).map(([k, v]) => `<span class="tag">${k}: ${v}</span>`).join(' ')}. An "r" means an exact match re-rolls (0–4 out, 5–9 home run).</p>
  <h3>Special situations outs (red die)</h3><p>${C.specOut.map((v, i) => `<span class="tag">${i}: ${v}</span>`).join(' ')}</p>
  <h3>House notes</h3><p>Pitchers never bat (the universal DH applied in 2025). Extra innings in the regular season start with a runner on second unless you turn that off. Coach's decisions, pitching changes and other judgment calls are made by the manager AI for any side you aren't managing, and the AI follows the Auto Steal Overrides guideline for steals.</p></div></div>`;
}
})();
