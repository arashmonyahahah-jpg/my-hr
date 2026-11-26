// Service worker: caches the app shell so ATL works offline.
// Bump CACHE_VERSION whenever you change any file listed in SHELL.
const CACHE_VERSION = 'atl-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/style.css',
  './js/app.js', './js/db.js', './js/dates.js', './js/i18n.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
