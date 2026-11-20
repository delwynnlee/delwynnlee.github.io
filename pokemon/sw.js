// Service worker for the Pokémon Browser. Its scope is /pokemon/ only, so the rest of the site is untouched.
// App files: fetched fresh when online, saved copy when offline.
// Artwork and fonts: saved after the first view, then served from the device.
const SHELL = 'pokemon-shell-v1';
const MEDIA = 'pokemon-media-v1';
const SHELL_FILES = ['./', 'pokemon.json', 'icon.png'];
const SAVED_FIRST = [
  'https://raw.githubusercontent.com/PokeAPI/sprites/',
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith('pokemon-') && key !== SHELL && key !== MEDIA)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (SAVED_FIRST.some(prefix => req.url.startsWith(prefix))) event.respondWith(savedFirst(req));
  else if (new URL(req.url).origin === location.origin) event.respondWith(networkFirst(req));
});

async function savedFirst(req) {
  const cache = await caches.open(MEDIA);
  const saved = await cache.match(req.url);
  if (saved) return saved;
  const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
  if (res.ok) cache.put(req.url, res.clone()).catch(() => {}); // storage full: serve it without saving
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const saved = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' && await cache.match('./'));
    return saved || Response.error();
  }
}
