// Service worker: saves the app on the device so it opens with no signal.
//
// IMPORTANT: whenever any file below changes, bump VERSION (tools/bump.sh).
// That is how phones and iPads learn there's an update to download.
const VERSION = 'v7';
// The editor and the band app share this file; name the cache after the app's folder so they don't clear each other's.
const NAME = new URL(self.registration.scope).pathname.split('/').filter(Boolean).pop() || 'sos';
const CACHE = `${NAME}-${VERSION}`;
const FONTS = 'sos-fonts';
const CHARTS = 'sos-charts';   // chord charts, kept so they open at a gig with no signal

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './vendor/pdf-lib.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // Ask for each file with the version number on it, so GitHub's servers can't hand back a stale copy.
    caches.open(CACHE).then((cache) => Promise.all(ASSETS.map((url) =>
      fetch(`${url}?v=${VERSION}`, { cache: 'reload' }).then((res) => {
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return cache.put(url, res);
      })
    )))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // Also clear 'sos-v1', left over from before the editor and band app were split.
        keys.filter((key) => (key.startsWith(`${NAME}-v`) || /^sos-v\d+$/.test(key)) && key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// The page sends this when you tap "Update".
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Google Fonts: keep a copy after the first visit so the fonts work offline too.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then((cache) =>
        cache.match(request).then((cached) => {
          const fresh = fetch(request).then((res) => { cache.put(request, res.clone()); return res; });
          return cached || fresh;
        })
      )
    );
    return;
  }

  // Chord charts: get the latest when online, fall back to the saved copy.
  if (url.pathname.startsWith('/sos-band-data/charts/')) {
    event.respondWith(
      caches.open(CHARTS).then((cache) =>
        fetch(request)
          .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
          .catch(() => cache.match(request, { ignoreSearch: true }).then((hit) => hit || Response.error()))
      )
    );
    return;
  }

  if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then((c) => c.match('./index.html')).then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(
    caches.open(CACHE).then((c) => c.match(request, { ignoreSearch: true })).then((cached) => cached || fetch(request))
  );
});
