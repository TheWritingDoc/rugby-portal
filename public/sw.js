const CACHE_NAME = 'ephsru-cache-v1'
const URLS = ['/', '/index.html']
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(URLS)))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  )
})
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request).then((r) => {
      const copy = r.clone()
      caches.open(CACHE_NAME).then((c) => c.put(e.request, copy))
      return r
    }))
  )
})