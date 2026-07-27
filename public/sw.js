// Service worker minimal, écrit à la main (pas de plugin PWA / dépendance
// supplémentaire) : son seul rôle est de satisfaire les critères
// d'installabilité (manifest + fetch handler) et d'offrir un filet de
// sécurité réseau-d'abord en cas de coupure passagère — jamais de données
// de partie périmées.
const CACHE_NAME = 'lg-shell-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Jamais de cache pour l'API ou les domaines tiers (Supabase, Daily,
  // ElevenLabs...) : ce sont des données vivantes, les servir depuis un
  // cache casserait le temps réel du jeu.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  )
})
