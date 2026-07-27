
// SW v999 — auto-destruccion completa
self.addEventListener('install', e => {
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
  );
});
// Sin cache — todo va directo a la red
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
