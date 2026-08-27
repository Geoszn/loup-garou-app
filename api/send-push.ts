// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Rôle actuel, volontairement limité : envoyer une notification de TEST à
// l'utilisateur authentifié lui-même, sur tous ses abonnements enregistrés
// (voir migration 0105 + src/hooks/usePushNotifications.ts), pour valider
// toute la chaîne (abonnement navigateur → base → serveur → notification
// reçue) depuis le bouton "Envoyer un test" de Mon compte.
//
// Ce que cette fonction NE fait PAS encore : notifier un AUTRE joueur (ex.
// "c'est ton tour", "un ami a lancé une partie"). Ça viendra dans une
// brique séparée — il faudra alors un appelant de confiance (une fonction
// Postgres/un webhook, pas le token d'un joueur quelconque) puisqu'on ne
// peut pas laisser n'importe quel utilisateur authentifié déclencher une
// notification vers l'appareil de quelqu'un d'autre.
//
// Deux clés VAPID nécessaires (voir README section notifications) :
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — générées une fois avec
//   `npx web-push generate-vapid-keys`, jamais dans VITE_... pour la privée.
// Plus SUPABASE_SERVICE_ROLE_KEY, pour lire push_subscriptions en
// contournant RLS (cette table n'a aucune policy cliente, voir 0105).
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: any
}
interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): void
  setHeader(name: string, value: string): void
  end(): void
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS : voir le même commentaire dans api/daily-room.ts et
  // api/narrator-voice.ts — l'app native appelle cette route en URL absolue.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:contact@loupgarouafrique.com'
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!vapidPublicKey || !vapidPrivateKey || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    res.status(500).json({ error: 'Configuration serveur manquante (VAPID / Supabase).' })
    return
  }

  const authHeader = req.headers.authorization
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : null
  if (!token) {
    res.status(401).json({ error: 'Non authentifié.' })
    return
  }

  // Client "utilisateur" (clé anon + token du joueur) : sert uniquement à
  // vérifier son identité, jamais à lire push_subscriptions (RLS l'en
  // empêcherait de toute façon, aucune policy n'existe sur cette table).
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Authentification invalide.' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  if (!body?.test) {
    res.status(400).json({ error: 'Requête invalide.' })
    return
  }

  // Client "service" (clé service_role) : seul moyen de lire cette table,
  // qui n'a aucune policy RLS cliente par conception (voir 0105).
  const serviceClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: subscriptions, error: subError } = await serviceClient
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', userData.user.id)

  if (subError) {
    res.status(500).json({ error: subError.message })
    return
  }
  if (!subscriptions || subscriptions.length === 0) {
    res.status(404).json({ error: 'Aucun abonnement actif — active les notifications avant de tester.' })
    return
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const payload = JSON.stringify({
    title: '🐺 Loup Garou d’Afrique',
    body: 'Si tu vois ceci, les notifications fonctionnent !',
    url: '/dashboard',
  })

  let sent = 0
  let removed = 0
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        )
        sent++
      } catch (err: any) {
        // 404/410 = abonnement expiré ou révoqué côté navigateur (ex.
        // permission retirée, cache navigateur vidé) : on le retire de la
        // base plutôt que de continuer à échouer dessus indéfiniment aux
        // prochains envois.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await serviceClient.from('push_subscriptions').delete().eq('id', sub.id)
          removed++
        }
      }
    })
  )

  if (sent === 0) {
    res.status(502).json({ error: 'Aucune notification n’a pu être envoyée (abonnements expirés).', removed })
    return
  }

  res.status(200).json({ sent, removed })
}
