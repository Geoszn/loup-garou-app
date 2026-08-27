// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Rôle : envoyer une notification de TEST à l'utilisateur authentifié
// lui-même, sur tous ses abonnements enregistrés (voir migration 0105 +
// src/hooks/usePushNotifications.ts), pour valider toute la chaîne
// (abonnement navigateur → base → serveur → notification reçue) depuis le
// bouton "Envoyer un test" de Mon compte.
//
// Notifier un AUTRE joueur (invitation reçue, etc.) passe par
// api/notify-user.ts, pas par ici — cette route ne notifie jamais que
// l'appelant lui-même.
//
// Trois secrets nécessaires (voir README section notifications) :
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — générées une fois avec
//   `npx web-push generate-vapid-keys`, jamais dans VITE_... pour la privée.
//   SUPABASE_SERVICE_ROLE_KEY — pour lire push_subscriptions en contournant
//   RLS (cette table n'a aucune policy cliente, voir 0105).
import { createClient } from '@supabase/supabase-js'
// Extension .js explicite obligatoire : ce projet tourne en ESM natif
// Node ("type": "module" dans package.json), qui — contrairement à Vite
// pour src/ — n'auto-résout jamais un import relatif sans extension à
// l'exécution, même si le fichier source est un .ts (voir le commentaire
// de server/pushSend.ts pour l'historique de ce piège).
import { configureVapid, sendPushToUser } from '../server/pushSend.js'

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

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!configureVapid() || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
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

  // Titre volontairement court, sans répéter le nom de l'app : iOS l'affiche
  // déjà lui-même sous le titre ("from LG Afrique", tiré du short_name du
  // manifest) — le répéter dans notre propre titre donnait une notification
  // à 3 lignes avec le nom du jeu écrit deux fois (signalement utilisateur).
  const { data: profile } = await serviceClient.from('profiles').select('lang').eq('id', userData.user.id).maybeSingle()
  const isEnglish = profile?.lang === 'en'

  const { sent, removed } = await sendPushToUser(serviceClient, userData.user.id, {
    title: isEnglish ? '🐺 Test notification' : '🐺 Notification de test',
    body: isEnglish ? 'If you see this, notifications are working!' : 'Si tu vois ceci, les notifications fonctionnent !',
    url: '/dashboard',
  })

  if (sent === 0) {
    res.status(404).json({ error: 'Aucun abonnement actif — active les notifications avant de tester.', removed })
    return
  }

  res.status(200).json({ sent, removed })
}
