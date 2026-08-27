// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Prévient un joueur que sa demande pour rejoindre une partie vient d'être
// acceptée. Appelée par l'hôte (voir JoinRequestsPanel.tsx) juste après un
// appel réussi à respond_join_request(p_accept: true).
//
// Revérifie ici, avec la clé service_role, que la demande existe bien, est
// désormais 'accepted', ET que l'appelant est bien l'hôte de la partie
// concernée (games.host_id) — un joueur authentifié ne peut donc jamais
// notifier n'importe qui de n'importe quoi, seulement confirmer une
// acceptation qu'il vient réellement de prononcer en tant qu'hôte.
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
  const { requestId } = body ?? {}
  if (typeof requestId !== 'string') {
    res.status(400).json({ error: 'Requête invalide.' })
    return
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: request } = await serviceClient
    .from('game_join_requests')
    .select('game_id, user_id, status')
    .eq('id', requestId)
    .maybeSingle()

  if (!request || request.status !== 'accepted') {
    res.status(403).json({ error: 'Demande introuvable ou pas encore acceptée.' })
    return
  }

  const { data: game } = await serviceClient.from('games').select('host_id, code').eq('id', request.game_id).maybeSingle()

  if (!game || game.host_id !== userData.user.id) {
    res.status(403).json({ error: 'Seul l’hôte peut déclencher cette notification.' })
    return
  }

  const { data: toProfile } = await serviceClient.from('profiles').select('lang').eq('id', request.user_id).maybeSingle()
  const isEnglish = toProfile?.lang === 'en'

  const { sent, removed } = await sendPushToUser(serviceClient, request.user_id, {
    title: isEnglish ? '✅ Request accepted' : '✅ Demande acceptée',
    body: isEnglish
      ? `You can now join the game (${game.code}).`
      : `Tu peux maintenant rejoindre la partie (${game.code}).`,
    url: `/partie/${game.code}/lobby`,
  })

  res.status(200).json({ sent, removed })
}
