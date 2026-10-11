const V = 'bsb-v9';
const FILES = ['./', 'index.html', 'charts.js', 'engine.js', 'wild.js', 'ai.js', 'we.js', 'app.js', 'bsb.json', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => { if (e.request.method !== 'GET') return; e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok && new URL(e.request.url).origin === location.origin) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return res; }))); });
