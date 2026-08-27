// Service worker minimal, écrit à la main (pas de plugin PWA / dépendance
// supplémentaire) : son seul rôle est de satisfaire les critères
// d'installabilité (manifest + fetch handler) et d'offrir un filet de
// sécurité réseau-d'abord en cas de coupure passagère — jamais de données
// de partie périmées.
const CACHE_NAME = 'lg-shell-v3'

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

// Réception d'une notification push (envoyée par api/send-push.ts via
// web-push). payload attendu : { title, body, url }. `url` sert à rouvrir
// l'appli au bon endroit au clic (ex. directement dans la partie concernée)
// plutôt que sur le dashboard par défaut.
self.addEventListener('push', (event) => {
  let payload = { title: 'Loup Garou d’Afrique', body: '' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Payload texte brut (pas de JSON) : on l'utilise tel quel comme corps.
    if (event.data) payload.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      // Pas de `badge` : ce champ attend une silhouette monochrome avec
      // canal alpha (l'OS la recolore lui-même, en tout petit, dans la
      // barre de statut côté Android/Chrome) — icon-192.png est un PNG
      // plein sans transparence, le réutiliser ici donnait un badge qui
      // ressemblait à un carré plein plutôt qu'à une icône propre. Sans ce
      // champ, l'OS retombe sur `icon` ou une icône par défaut, jamais
      // pire que ce carré.
      data: { url: payload.url || '/dashboard' },
    })
  )
})

// Clic sur la notification : si un onglet de l'appli est déjà ouvert, on le
// ramène au premier plan et on le navigue vers l'URL cible plutôt que
// d'ouvrir un doublon.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'push-navigate', url: targetUrl })
          return client.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    })
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
        // La Cache API refuse les réponses HTTP 206 (Partial Content) — le
        // cas typique étant un fichier audio (sons de l'appli, voir
        // public/sounds/) rejoué via une requête Range. Sans ce filtre,
        // cache.put() rejette et remonte en "Uncaught (in promise)" dans la
        // console (visible notamment dans Logcat côté Android) alors même
        // que la réponse est bien servie à la page — inoffensif mais
        // bruyant. Le .catch() final couvre les cas restants (réponse
        // opaque d'une origine différente, quota de stockage dépassé...).
        if (response.status === 200) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy).catch(() => {}))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  )
})
