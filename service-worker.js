// Deployment replaces this marker with a digest of every app-shell file.
const VERSION = 'development-v1';
const ROOT = new URL('./', self.location.href);
const PREFIX = `coffee-cellar:${ROOT.pathname}:`;
const CACHE = PREFIX + VERSION;
const FILES = [
  'index.html', 'style.css', 'app.js', 'db.js', 'dates.js', 'validation.js',
  'backup.js', 'presets.js', 'pwa.js', 'manifest.webmanifest',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];
const URLS = new Set(FILES.map(file => new URL(file, ROOT).href));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll([...URLS].map(url => new Request(url, { cache: 'reload' })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
  // No skipWaiting: keep existing windows and unsaved forms on their current version.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  let key;
  if (request.mode === 'navigate' && [ROOT.pathname, ROOT.pathname + 'index.html'].includes(url.pathname)) {
    key = new URL('index.html', ROOT).href;
  } else if (URLS.has(url.href)) key = url.href;
  if (!key) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(key);
    // Never mix a newer network module into an older release.
    return cached || new Response('アプリのキャッシュが見つかりません。通信可能な状態でアプリを開き直してください。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
