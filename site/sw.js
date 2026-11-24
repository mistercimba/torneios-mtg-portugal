// Service worker do Torneios MTG Portugal: permite instalar o site no telemóvel e abrir a última agenda sem rede.
// Estratégia «rede primeiro»: com ligação vem sempre a versão mais recente; sem ligação usa a última cópia guardada.
const CACHE = 'torneios-mtg-v1';
const SHELL = ['./', 'index.html', 'assets/styles.css', 'assets/app.js', 'manifest.webmanifest', 'assets/icons/icon-192.png', 'data/events.json', 'data/winners.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('torneios-mtg-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Google Calendar, mapas, etc.: sem cache
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // A página guarda-se sem query (?formato=…, ?t=…) para abrir offline com qualquer link.
    const key = req.mode === 'navigate' ? new Request(new URL('./', self.registration.scope)) : new Request(url.origin + url.pathname);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(key, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(key);
      if (hit) return hit;
      throw err;
    }
  })());
});
