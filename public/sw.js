// No private responses, Firebase traffic or conversation content is cached.
const CACHE='sigma-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/icon.svg'])));self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin===self.location.origin&&url.pathname==='/icon.svg')event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));});
