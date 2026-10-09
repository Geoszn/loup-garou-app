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

  // Nouveau message dans le chat d'une tribu (migration 0233). Même fonction que les autres
  // notifications (plafond de fonctions atteint). L'appelant ne choisit NI le message NI les
  // destinataires : pick_tribe_chat_push prend SON dernier message récent, jamais notifié, puis
  // décide qui prévenir (pas lui, pas un lecteur actif, pas un silence/archive — sauf réponse à
  // son message —, un push par membre toutes les 2 minutes au plus).
  if (body?.type === 'tribe_message') {
    const service = createClient(supabaseUrl, serviceRoleKey)
    const { data: pick } = await service.rpc('pick_tribe_chat_push', { p_sender: userData.user.id })
    const info = pick as {
      tribe_id: string
      tribe_name: string
      sender_name: string
      is_sticker: boolean
      preview: string
      recipients: { user_id: string; lang: string | null; is_reply: boolean; is_mention?: boolean; unread: number }[]
    } | null
    if (!info || !Array.isArray(info.recipients) || info.recipients.length === 0) {
      res.status(200).json({ sent: 0, removed: 0 })
      return
    }
    const clip = (text: string) => (text.length > 90 ? `${text.slice(0, 89)}…` : text)
    let sent = 0
    let removed = 0
    await Promise.all(
      info.recipients.map(async (r) => {
        const en = r.lang === 'en'
        const preview = info.is_sticker ? '🎭 Sticker' : clip(info.preview)
        let text: string
        if (r.is_mention) text = en ? `${info.sender_name} mentioned you: ${preview}` : `${info.sender_name} t'a mentionné : ${preview}`
        else if (r.is_reply) text = en ? `${info.sender_name} replied to you: ${preview}` : `${info.sender_name} t'a répondu : ${preview}`
        else if (r.unread > 1) text = en ? `${r.unread} new messages · ${info.sender_name}: ${preview}` : `${r.unread} nouveaux messages · ${info.sender_name} : ${preview}`
        else text = en ? `${info.sender_name}: ${preview}` : `${info.sender_name} : ${preview}`
        const out = await sendPushToUser(service, r.user_id, { title: `🛡️ ${info.tribe_name}`, body: text, url: '/tribu?tab=chat', tag: `tribe-chat-${info.tribe_id}` })
        sent += out.sent
        removed += out.removed
      }),
    )
    res.status(200).json({ sent, removed })
    return
  }

  // Quelqu'un a réagi à un message de la tribu (migration 0234) : prévenir l'AUTEUR du message.
  // Même principe : le serveur retrouve lui-même la dernière réaction de l'appelant.
  if (body?.type === 'tribe_reaction') {
    const service = createClient(supabaseUrl, serviceRoleKey)
    const { data: pick } = await service.rpc('pick_tribe_reaction_push', { p_reactor: userData.user.id })
    const info = pick as { user_id: string; lang: string | null; tribe_id: string; tribe_name: string; reactor_name: string; emoji: string; is_sticker: boolean; preview: string } | null
    if (!info) {
      res.status(200).json({ sent: 0, removed: 0 })
      return
    }
    const en = info.lang === 'en'
    const what = info.is_sticker ? '🎭 Sticker' : `« ${info.preview} »`
    const out = await sendPushToUser(service, info.user_id, {
      title: `🛡️ ${info.tribe_name}`,
      body: en ? `${info.reactor_name} reacted ${info.emoji} to your message: ${what}` : `${info.reactor_name} a réagi ${info.emoji} à ton message : ${what}`,
      url: '/tribu?tab=chat',
      tag: `tribe-react-${info.tribe_id}`,
    })
    res.status(200).json({ sent: out.sent, removed: out.removed })
    return
  }

  // Invitation à une tribu (migration 0222). Même fonction que l'invitation à
  // une partie : le plafond de fonctions serverless est déjà atteint, on évite
  // d'en ajouter une. Même garde-fou : la ligne tribe_invites (envoyée PAR
  // l'appelant, toujours en attente) est revérifiée côté serveur, et le texte
  // est reconstruit ici à partir de données vérifiées.
  if (body?.type === 'tribe_invite') {
    const inviteId = body.inviteId
    if (typeof inviteId !== 'string') {
      res.status(400).json({ error: 'Requête invalide.' })
      return
    }
    const service = createClient(supabaseUrl, serviceRoleKey)
    const { data: invite } = await service
      .from('tribe_invites')
      .select('invited_user, tribe_id, expires_at')
      .eq('id', inviteId)
      .eq('invited_by', userData.user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (!invite || new Date(invite.expires_at).getTime() <= Date.now()) {
      res.status(403).json({ error: 'Invitation introuvable.' })
      return
    }
    const [{ data: tribe }, { data: inviter }, { data: target }] = await Promise.all([
      service.from('tribes').select('name').eq('id', invite.tribe_id).maybeSingle(),
      service.from('profiles').select('username').eq('id', userData.user.id).maybeSingle(),
      service.from('profiles').select('lang').eq('id', invite.invited_user).maybeSingle(),
    ])
    if (!tribe) {
      res.status(404).json({ error: 'Tribu introuvable.' })
      return
    }
    const who = inviter?.username || 'Un joueur'
    const en = target?.lang === 'en'
    const { sent, removed } = await sendPushToUser(service, invite.invited_user, {
      title: en ? '🛡️ Tribe invitation' : '🛡️ Invitation à une tribu',
      body: en ? `${who} invites you to join the tribe "${tribe.name}".` : `${who} t'invite à rejoindre la tribu « ${tribe.name} ».`,
      url: '/tribu',
    })
    res.status(200).json({ sent, removed })
    return
  }

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
