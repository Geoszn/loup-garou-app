// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Première brique de notification vers un AUTRE joueur (voir le
// commentaire retiré de send-push.ts) : prévient un ami qu'il vient de
// recevoir une invitation à une partie.
//
// Appelée par le client juste après un appel réussi à invite_friend_to_game
// (voir src/pages/Lobby.tsx). Le joueur connecté ne peut PAS choisir
// librement qui il notifie : on revérifie ici, avec la clé service_role,
// qu'une ligne game_invites correspondant EXACTEMENT à (gameId, de
// l'appelant, vers friendId) existe bien — c'est-à-dire que
// invite_friend_to_game a déjà validé l'amitié et l'appartenance à la
// partie côté serveur. Sans cette vérification, n'importe quel utilisateur
// authentifié pourrait spammer les notifications de n'importe qui.
//
// Le texte de la notification est entièrement reconstruit ici à partir de
// données déjà vérifiées (pseudo de l'appelant, code de la partie) — jamais
// à partir d'un texte fourni par le client, pour ne laisser aucune place à
// une notification usurpée ou avec un contenu arbitraire.
import { createClient } from '@supabase/supabase-js'
// Extension .js explicite obligatoire — voir le même commentaire dans
// api/send-push.ts.
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
  const { gameId, friendId } = body ?? {}
  if (typeof gameId !== 'string' || typeof friendId !== 'string') {
    res.status(400).json({ error: 'Requête invalide.' })
    return
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  // Revérifie que l'invitation existe bel et bien, envoyée par l'appelant —
  // voir le commentaire en tête de fichier. Un seul aller-retour, indexé
  // (game_invites a une contrainte unique sur (game_id, to_user_id), voir
  // migration 0016).
  const { data: invite } = await serviceClient
    .from('game_invites')
    .select('game_id')
    .eq('game_id', gameId)
    .eq('from_user_id', userData.user.id)
    .eq('to_user_id', friendId)
    .maybeSingle()

  if (!invite) {
    res.status(403).json({ error: 'Invitation introuvable.' })
    return
  }

  const [{ data: game }, { data: fromProfile }, { data: toProfile }] = await Promise.all([
    serviceClient.from('games').select('code').eq('id', gameId).maybeSingle(),
    serviceClient.from('profiles').select('username').eq('id', userData.user.id).maybeSingle(),
    serviceClient.from('profiles').select('lang').eq('id', friendId).maybeSingle(),
  ])

  if (!game) {
    res.status(404).json({ error: 'Partie introuvable.' })
    return
  }

  const fromUsername = fromProfile?.username || 'Un joueur'
  const isEnglish = toProfile?.lang === 'en'

  const { sent, removed } = await sendPushToUser(serviceClient, friendId, {
    title: isEnglish ? '🐺 Game invite' : '🐺 Invitation à une partie',
    body: isEnglish
      ? `${fromUsername} invited you to join a game (${game.code}).`
      : `${fromUsername} t'invite à rejoindre une partie (${game.code}).`,
    url: `/rejoindre/${game.code}`,
  })

  res.status(200).json({ sent, removed })
}
