// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Prévient un joueur qu'il vient de recevoir une demande d'ami. Appelée par
// le client juste après un appel réussi à send_friend_request ou
// send_friend_request_by_user_id, quand la réponse indique 'pending' (pas
// 'accepted' — dans ce cas les deux comptes sont déjà amis, rien à
// notifier).
//
// Même principe de confiance que api/notify-user.ts : on revérifie ici,
// avec la clé service_role, qu'une ligne friend_requests correspondant
// exactement à (l'appelant en requester_id, targetUserId en addressee_id,
// status 'pending') existe bien — un joueur authentifié ne peut donc
// jamais déclencher de notification vers un compte arbitraire, seulement
// confirmer une demande qu'il vient réellement d'envoyer.
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
  const { targetUserId } = body ?? {}
  if (typeof targetUserId !== 'string') {
    res.status(400).json({ error: 'Requête invalide.' })
    return
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: request } = await serviceClient
    .from('friend_requests')
    .select('id')
    .eq('requester_id', userData.user.id)
    .eq('addressee_id', targetUserId)
    .eq('status', 'pending')
    .maybeSingle()

  if (!request) {
    res.status(403).json({ error: 'Demande introuvable.' })
    return
  }

  const [{ data: fromProfile }, { data: toProfile }] = await Promise.all([
    serviceClient.from('profiles').select('username').eq('id', userData.user.id).maybeSingle(),
    serviceClient.from('profiles').select('lang').eq('id', targetUserId).maybeSingle(),
  ])

  const fromUsername = fromProfile?.username || 'Un joueur'
  const isEnglish = toProfile?.lang === 'en'

  const { sent, removed } = await sendPushToUser(serviceClient, targetUserId, {
    title: isEnglish ? '🐺 New friend request' : '🐺 Nouvelle demande d’ami',
    body: isEnglish ? `${fromUsername} wants to be your friend.` : `${fromUsername} veut devenir ton ami.`,
    url: '/amis',
  })

  res.status(200).json({ sent, removed })
}
