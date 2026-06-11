const CACHE_NAME = 'ephsru-cache-v4'
const URLS = ['/', '/index.html']
self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(URLS)))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (!e.request.url.startsWith('http')) return
  const url = new URL(e.request.url)
  // Never serve API data or uploaded files from cache — stale rosters/auth responses break the portal
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return

  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request).then((r) => {
      if (!r || r.status !== 200 || r.type !== 'basic') return r

      const copy = r.clone()
      caches.open(CACHE_NAME)
        .then((c) => c.put(e.request, copy).catch(() => {}))
        .catch(() => {})
      return r
    }).catch(() => new Response('Offline', { status: 503, statusText: 'Service Unavailable' })))
  )
})
