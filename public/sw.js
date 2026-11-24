// Service worker minimal : met en cache la coquille de l'app (démarrage instantané, icône écran d'accueil).
// Jamais l'API ni l'audio (/api/*) : toujours en direct.
const VERSION = 'zeleph-__APP_VERSION__'; // estampillé par le Worker à chaque déploiement → nouveau SW + anciens caches supprimés
const SHELL = ['/', '/index.html', '/css/app.css', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png',
  '/js/app.js', '/js/api.js', '/js/ui.js', '/js/nav.js', '/js/player.js', '/js/queue.js', '/js/lrc.js', '/js/themes.js', '/js/prefs.js', '/js/menu.js', '/js/nowplaying.js', '/js/update.js',
  '/js/views/auth.js', '/js/views/browse.js', '/js/views/library.js', '/js/views/social.js', '/js/views/settings.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord (mises à jour immédiates), cache si hors ligne.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r ?? caches.match('/index.html'))));
});
