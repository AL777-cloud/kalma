// Kálma Service Worker — Offline caching
const CACHE_NAME = 'kalma-v16';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './engine-core.js',
  './engine-music.js',
  './engine-binaural.js',
  './engine-isochronic.js',
  './engine-meditation.js',
  './engine-ambience.js',
  './engine-ui-sounds.js',
  './engine-voice.js',
  './engine-voice-audio.js',
  './engine-visualizer.js',
  './engine-wakelock.js',
  './engine-lyria.js',
  './audio-engine.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache first for core assets, network first for streams/audio
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache radio streams or external audio
  if (url.origin !== location.origin) return;

  // Audio files — network first, cache fallback
  if (url.pathname.match(/\.(wav|mp3|ogg|m4a)$/)) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Core assets — network first, cache fallback (always get fresh during dev)
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
