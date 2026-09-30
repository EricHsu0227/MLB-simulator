import { h, clear, spinner } from './ui/common.js';
import { loadIndex, loadGlobal, setDataBase } from './data.js';
import { renderGameMode } from './ui/mode_game.js';
import { renderPostMode } from './ui/mode_post.js';
import { renderSeasonMode } from './ui/mode_season.js';
import { renderCustomMode } from './ui/mode_custom.js';
import { renderLiveMode } from './ui/mode_live.js';
import { renderStatsMode } from './ui/mode_stats.js';
import { renderSavesMode } from './ui/mode_saves.js';
import { loadDefaultLineups } from './lineups.js';
import { mountNavAccount } from './ui/account.js';
import { cloud } from './cloud.js';
import { requestPersistence } from './store.js';

const ctx = { state: {}, index: null, G: null };
const app = document.getElementById('app');

function home() {
  clear(app);
  const c = (href, title, text) => h('a', { class: 'mode', href }, h('h3', null, title), h('p', null, text));
  app.appendChild(h('div', { class: 'stack' },
    h('div', { class: 'hero' },
      h('h1', null, 'Replay baseball history'),
      h('p', null, `${ctx.index.years[0]}–${ctx.index.years[ctx.index.years.length - 1]} · ${Object.values(ctx.index.seasons).reduce((a, s) => a + s.ng, 0).toLocaleString()} regular-season games · real batters, pitchers and ballparks`)),
    h('div', { class: 'modes' },
      c('#/game', '1 · Play any game', 'Pick any game ever played. Same lineups, same starters, the roster that team actually used that week — and the real bullpen usage and substitutions shown next to your replay.'),
      c('#/post', '2 · Replay a postseason', 'Re-run any October or any single series with the real lineups and rotations. If the other team wins, the bracket carries your result forward and you keep playing.'),
      c('#/season', '3 · Season mode', 'Replay any season on its real schedule: standings, leaders, live games, then the playoffs.'),
      c('#/live', '5 · Live 2026 season', 'Follow the real 2026 season as it unfolds — real rosters, real probable pitchers, real standings — and play or sim any game before (or after) it happens.'),
      c('#/saves', 'Saved games', 'Pick up any game, postseason, season or custom league right where you left it — everything saves itself after every move.'),
      c('#/stats', 'Stats & game logs', 'Every game you play or sim is saved — full box score and play-by-play — with player stats, leaders and game logs. Sign in with Google or Apple to sync.'),
      c('#/custom', '4 · Custom league & tournament', 'Draft your own league from any team-seasons in history — divisions, schedule, playoff format — or a straight elimination tournament.')),
    h('details', { class: 'card how' }, h('summary', null, 'How the simulation works'),
      h('ul', null,
        h('li', null, h('b', null, 'Plate appearances. '), 'Every batter and pitcher carries his real season rates for strikeout, walk, hit-by-pitch, single, double, triple, home run and in-play out — the components of wOBA — lightly regressed toward the league for tiny samples. Batter and pitcher are combined with the league environment using the odds-ratio (log5) method (or a plain average, your choice), then adjusted for park, platoon (L/R) and pitcher fatigue.'),
        h('li', null, h('b', null, 'Batted balls. '), 'Balls in play get a type (ground ball / line drive / fly ball) and a field zone. Each batter’s pull / center / oppo tendency (relative to his batting side) and both players’ GB/LD/FB mix tilt real league distributions, so a pull-side fly ball to left and a grounder to short happen the way they do in real life.'),
        h('li', null, h('b', null, 'Baserunning. '), 'Where runners end up (extra bases, sacrifice flies, double plays, errors, thrown-out runners) is drawn from real transitions for the same situation — event, batted-ball type and zone, bases and outs — from the same era. Stolen-base attempts follow each runner’s real tendencies.'),
        h('li', null, h('b', null, 'Park factors. '), 'Computed from real home/road splits of each park (3-year window, regressed); every player’s rates are neutralized for the parks he actually played in first.'),
        h('li', null, h('b', null, 'Managers. '), 'The auto-manager pulls tiring starters, uses the closer in save spots, pinch-hits for pitchers in non-DH games, and rests regulars in season mode. In Play-a-game mode you can follow the real substitutions.'),
        h('li', null, h('b', null, 'Data notes. '), 'Rosters are reconstructed from who actually appeared for the team within two weeks of the game (there is no daily-roster feed). Pre-1910 seasons are mostly box scores, so their substitution timing is estimated.')))));
}

function route() {
  const r = (location.hash || '#/').replace(/^#\//, '').split('/')[0];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r));
  window.scrollTo(0, 0);
  const fn = { '': home, game: () => renderGameMode(app, ctx), post: () => renderPostMode(app, ctx), season: () => renderSeasonMode(app, ctx), custom: () => renderCustomMode(app, ctx), live: () => renderLiveMode(app, ctx), stats: () => renderStatsMode(app, ctx), saves: () => renderSavesMode(app, ctx) }[r] || home;
  Promise.resolve(fn()).catch(err => { console.error(err); clear(app); app.appendChild(h('div', { class: 'card warn' }, 'Something went wrong: ' + err.message)); });
}

(async function boot() {
  app.appendChild(spinner('Loading data…'));
  try {
    ctx.index = await loadIndex();
    ctx.G = await loadGlobal();
    await loadDefaultLineups().catch(() => {});
  } catch (e) {
    clear(app);
    app.appendChild(h('div', { class: 'card warn' }, h('h3', null, 'Could not load data'), h('p', null, e.message), h('p', null, 'Serve this folder over HTTP (for example ', h('code', null, 'python3 -m http.server 8000'), ' and open http://localhost:8000). Opening index.html directly from disk blocks data loading.')));
    return;
  }
  mountNavAccount(document.getElementById('acct'));
  cloud.init();
  requestPersistence();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
