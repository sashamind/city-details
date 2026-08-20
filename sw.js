const CACHE_NAME = 'city-details-v5';
const urlsToCache = [
    '/',
    '/index.html',
    '/app.js',
    '/styles.css',
    '/manifest.json',
    '/favicon.png',
    '/icon-192.png',
    // Библиотеки лежат локально, поэтому их можно положить в офлайн-кэш —
    // раньше карта офлайн не работала вовсе, так как Leaflet грузился с CDN.
    '/vendor/leaflet/leaflet.js',
    '/vendor/leaflet/leaflet.css',
    '/vendor/markercluster/leaflet.markercluster.js',
    '/vendor/markercluster/MarkerCluster.css',
    '/vendor/markercluster/MarkerCluster.Default.css',
    '/vendor/lottie/lottie.min.js',
    '/vendor/emailjs/email.min.js',
    '/vendor/fonts/fonts.css'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // Сеть в приоритете, чтобы пользователи получали обновления; кэш — офлайн-запас
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names.filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});
