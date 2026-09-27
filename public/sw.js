const CACHE_PREFIX = 'serene-public-'
const CACHE_NAME = `${CACHE_PREFIX}v3`
const PUBLIC_FILES = [
  '/offline.html', '/dokumentasi.html', '/favicon.svg', '/favicon.ico',
  '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_FILES)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  // Never cache/replay API requests, transactions, job tokens or private pages.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (PUBLIC_FILES.includes(url.pathname) && !url.search) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      try {
        const response = await fetch(request)
        if (response.ok) await cache.put(request, response.clone())
        return response
      } catch {
        return (await cache.match(url.pathname)) || Response.error()
      }
    })())
  } else if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME)
      return (await cache.match('/offline.html')) || Response.error()
    }))
  }
})
