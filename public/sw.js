// Cache apenas a interface publica. Nunca armazenar config.json, Firebase, tokens, APIs ou conversas.
const CACHE = 'sigma-shell-v2';
const shell = ['/', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Precarrega HTML e os arquivos versionados do Vite para a proxima abertura.
    try {
      const response = await fetch('/', {cache: 'reload'});
      if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
        await cache.put('/', response.clone());
        const html = await response.text();
        const assets = [...html.matchAll(/(?:src|href)="(\\/assets\\/[^"]+)"/g)].map(match => match[1]);
        await Promise.allSettled([...new Set([...shell.slice(1), ...assets])].map(url => cache.add(url)));
      }
    } catch {
      // Sem rede, o app continua dependendo do ultimo cache disponivel.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('sigma-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    // A tela abre pelo cache imediatamente; a atualizacao de HTML ocorre em segundo plano.
    const fresh = fetch(request).then(async response => {
      if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
        const cache = await caches.open(CACHE);
        await cache.put('/', response.clone());
      }
      return response;
    });
    event.waitUntil(fresh.catch(() => {}));
    event.respondWith(caches.match('/').then(cached => cached || fresh));
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname === '/icon.svg' || url.pathname === '/manifest.webmanifest') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    })());
  }
});
