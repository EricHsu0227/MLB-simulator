// Service worker: app shell is network-first (updates arrive on next load), data files are cache-first
// so seasons you've opened work offline. Live-API requests are never cached here.
const VERSION = 'v6';
const SHELL = `diamond-shell-${VERSION}`, DATA = `diamond-data-${VERSION}`;
const SHELL_FILES = ['./', 'index.html', 'manifest.webmanifest', 'web/css/style.css', 'web/icons/icon-192.png', 'web/icons/apple-touch-icon.png',
  'web/js/app.js', 'web/js/data.js', 'web/js/engine.js', 'web/js/teams.js', 'web/js/league.js', 'web/js/post.js', 'web/js/live.js',
  'web/js/ui/common.js', 'web/js/ui/field.js', 'web/js/ui/gameview.js', 'web/js/ui/postview.js', 'web/js/ui/mode_game.js', 'web/js/ui/mode_post.js',
  'web/js/ui/mode_season.js', 'web/js/ui/mode_custom.js', 'web/js/ui/mode_live.js', 'web/js/store.js', 'web/js/archive.js', 'web/js/cloud.js', 'web/js/config.js', 'web/js/ui/mode_stats.js', 'web/js/ui/gamedetail.js', 'web/js/ui/account.js', 'web/js/pstats.js', 'web/js/savant.js', 'web/js/ui/playercard.js', 'web/js/ui/lineup.js', 'data/idmap.json.gz', 'data/index.json', 'data/global.json.gz'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // live MLB API etc.: straight to network
  if (url.pathname.includes('/data/seasons/') || url.pathname.endsWith('/data/global.json.gz') || url.pathname.includes('/data/live/')) {
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
