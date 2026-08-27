// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Prévient les joueurs d'un salon que la partie vient de démarrer, mais
// UNIQUEMENT ceux qui ne sont plus dans l'application au moment où l'hôte
// lance la partie — jamais quelqu'un qui a déjà l'écran sous les yeux (voir
// Lobby.tsx handleStart, qui calcule cette liste depuis onlineUserIds, le
// même canal de présence Realtime que le point vert/gris déjà affiché sur
// chaque joueur).
//
// Le client indique QUI notifier (candidateUserIds, tiré de sa propre vue
// de la présence — forcément un peu datée de quelques centaines de ms, mais
// une fausse absence n'est jamais bien grave : au pire un joueur déjà
// présent reçoit une notification pour quelque chose qu'il voit déjà). Le
// serveur revérifie ensuite, avec la clé service_role, que chaque id
// proposé appartient réellement à cette partie (game_players) — impossible
// de notifier quelqu'un d'extérieur — et que l'appelant lui-même en fait
// partie, pour empêcher un tiers de déclencher ça sur une partie à laquelle
// il ne participe pas.
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

const MAX_TARGETS = 25 // taille maximale d'une partie (voir create_game)

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
  const { gameId, candidateUserIds } = body ?? {}
  if (
    typeof gameId !== 'string' ||
    !Array.isArray(candidateUserIds) ||
    candidateUserIds.length === 0 ||
    candidateUserIds.length > MAX_TARGETS ||
    !candidateUserIds.every((id) => typeof id === 'string')
  ) {
    res.status(400).json({ error: 'Requête invalide.' })
    return
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const [{ data: game }, { data: players }] = await Promise.all([
    serviceClient.from('games').select('code').eq('id', gameId).maybeSingle(),
    serviceClient.from('game_players').select('user_id').eq('game_id', gameId),
  ])

  if (!game || !players) {
    res.status(404).json({ error: 'Partie introuvable.' })
    return
  }

  const memberIds = new Set(players.map((p) => p.user_id))
  if (!memberIds.has(userData.user.id)) {
    res.status(403).json({ error: 'Vous ne participez pas à cette partie.' })
    return
  }

  // Ne garde que les cibles proposées par le client qui appartiennent
  // vraiment à cette partie (voir le commentaire en tête de fichier) — et
  // jamais l'appelant lui-même, il vient de lancer la partie, il n'a pas
  // besoin qu'on le prévienne qu'elle a démarré.
  const targetIds = players.map((p) => p.user_id).filter((id) => id !== userData.user.id && candidateUserIds.includes(id))

  if (targetIds.length === 0) {
    res.status(200).json({ notified: 0, sent: 0, removed: 0 })
    return
  }

  const { data: targetProfiles } = await serviceClient.from('profiles').select('id, lang').in('id', targetIds)
  const langById = new Map((targetProfiles ?? []).map((p) => [p.id, p.lang]))

  let sent = 0
  let removed = 0
  await Promise.all(
    targetIds.map(async (targetId) => {
      const isEnglish = langById.get(targetId) === 'en'
      const result = await sendPushToUser(serviceClient, targetId, {
        title: isEnglish ? '🌕 The game has started' : '🌕 La partie a commencé',
        body: isEnglish
          ? `Game ${game.code} has started — join now!`
          : `La partie ${game.code} vient de démarrer — rejoins vite !`,
        url: `/partie/${game.code}`,
      })
      sent += result.sent
      removed += result.removed
    })
  )

  res.status(200).json({ notified: targetIds.length, sent, removed })
}
