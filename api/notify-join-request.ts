// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Prévient l'hôte d'une partie qu'un joueur demande à la rejoindre. Appelée
// par le client juste après un appel réussi à join_game ou
// request_join_public_game, quand la réponse indique une demande en attente
// (statut 'pending' pour join_game — request_join_public_game, lui, crée
// toujours une demande, voir PublicGamesBrowser.tsx).
//
// Même principe de confiance que les autres routes notify-* : on revérifie
// ici, avec la clé service_role, qu'une ligne game_join_requests
// correspondant exactement à (l'appelant en user_id, statut 'pending')
// existe bien pour cette partie — impossible donc de faire croire à un hôte
// qu'une demande existe alors qu'elle n'a jamais été créée.
import { createClient } from '@supabase/supabase-js'
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

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Authentification invalide.' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const { gameId } = body ?? {}
  if (typeof gameId !== 'string') {
    res.status(400).json({ error: 'Requête invalide.' })
    return
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: request } = await serviceClient
    .from('game_join_requests')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userData.user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (!request) {
    res.status(403).json({ error: 'Demande introuvable.' })
    return
  }

  const [{ data: game }, { data: fromProfile }] = await Promise.all([
    serviceClient.from('games').select('host_id, code').eq('id', gameId).maybeSingle(),
    serviceClient.from('profiles').select('username').eq('id', userData.user.id).maybeSingle(),
  ])

  if (!game) {
    res.status(404).json({ error: 'Partie introuvable.' })
    return
  }

  const { data: hostProfile } = await serviceClient.from('profiles').select('lang').eq('id', game.host_id).maybeSingle()
  const fromUsername = fromProfile?.username || 'Un joueur'
  const isEnglish = hostProfile?.lang === 'en'

  const { sent, removed } = await sendPushToUser(serviceClient, game.host_id, {
    title: isEnglish ? '🚪 Join request' : '🚪 Demande pour rejoindre',
    body: isEnglish
      ? `${fromUsername} wants to join your game (${game.code}).`
      : `${fromUsername} veut rejoindre ta partie (${game.code}).`,
    url: `/partie/${game.code}/lobby`,
  })

  res.status(200).json({ sent, removed })
}
