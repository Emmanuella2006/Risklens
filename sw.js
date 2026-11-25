// Service worker: keeps a copy of the app files so RiskLens opens and works
// without internet (SRS NFR 5). Data itself is in localStorage, not here.
// Network first, so a new version is used as soon as it is online.
const CACHE = 'risklens-v1.1.0';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png',
  './js/main.js', './js/ui.js', './js/config.js', './js/remote.js', './js/vendor/supabase.js',
  './js/views/login.js', './js/views/dashboard.js', './js/views/sites.js', './js/views/site-detail.js',
  './js/views/site-form.js', './js/views/inspection-form.js', './js/views/reports.js',
  './js/views/settings.js', './js/views/users.js', './js/views/help.js', './js/views/account.js',
  './src/scoring.js', './src/catalog.js', './src/sites.js', './src/validation.js', './src/csv.js',
  './src/auth.js', './src/db.js', './src/sample-data.js', './src/remote-map.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('risklens-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? caches.match('./index.html'))),
  );
});
