// Somente interface pública. Nunca cachear configuração, credenciais ou APIs.
const CACHE = 'sigma-shell-v3';
const shell = ['/', '/sigma-orb.html', '/icon.svg', '/manifest.webmanifest'];
async function cachePage(cache, path, response) {
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return;
  if (path === '/') {
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1]);
    // Só promover HTML quando todos os arquivos necessários estiverem disponíveis offline.
    await Promise.all([...new Set(assets)].map(async url => {
      if (await cache.match(url)) return;
      const asset = await fetch(url, {cache: 'reload'});
      if (!asset.ok || (asset.headers.get('content-type') || '').includes('text/html')) throw Error('Asset indisponível');
      await cache.put(url, asset);
    }));
  }
  await cache.put(path, response);
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Falha de instalação preserva o worker/cache anterior.
    for (const path of shell) {
      const response = await fetch(path, {cache: 'reload'});
      if (!response.ok) throw Error('Interface indisponível');
      if (path === '/' || path.endsWith('.html')) await cachePage(cache, path, response);
      else await cache.put(path, response);
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  // Manter versões anteriores permite que abas já abertas carreguem seus assets.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const page = url.pathname === '/' || url.pathname === '/index.html' ? '/' : url.pathname === '/sigma-orb.html' ? '/sigma-orb.html' : null;
  if (page) {
    const fresh = (async () => {
      const response = await fetch(request, {cache: 'no-cache', signal: AbortSignal.timeout(5000)});
      if (!response.ok) throw Error('Interface indisponível');
      return response;
    })();
    event.waitUntil(fresh.then(async response => cachePage(await caches.open(CACHE), page, response.clone())).catch(() => {}));
    event.respondWith(fresh.catch(async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(page) || await caches.match(page) || new Response('Interface indisponível offline.', {status:503});
    }));
    return;
  }
  if (url.pathname.startsWith('/assets/') || shell.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request) || await caches.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic' && !(response.headers.get('content-type') || '').includes('text/html')) await cache.put(request, response.clone());
      return response;
    })());
  }
});
