// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Elle seule connaît la clé secrète Daily.co (DAILY_API_KEY), qui ne doit
// jamais être exposée côté client. Le rôle de cette route :
//   1. Vérifier, via Supabase (avec le token de l'utilisateur), qu'il a
//      réellement le droit d'accéder au salon vocal demandé en ce moment.
//   2. Créer (ou réutiliser) le salon vocal Daily.co correspondant.
//   3. Renvoyer uniquement l'URL du salon au client.
//
// NOTE (revert) : ce fichier était passé en `privacy: 'private'` avec un
// jeton obligatoire pour chaque participant (durcissement contre le nom de
// salon devinable "wg-{code}-{channel}"). Ce changement a cassé le vocal
// pour tout le monde en prod — très probablement parce que la création de
// meeting tokens n'est pas disponible telle quelle sur le plan Daily.co
// utilisé ici (ou une autre contrainte côté compte Daily que je n'ai pas pu
// tester sans y avoir accès). Revenu à la version publique qui fonctionnait
// pour restaurer le service immédiatement. Le risque théorique (quelqu'un
// qui devine un code de partie pourrait rejoindre l'URL Daily brute sans
// passer par can_listen_channel) redevient donc présent, comme avant ce
// durcissement — si tu veux qu'on retente une version privée, il faudra
// d'abord regarder le journal de la fonction /api/daily-room dans Vercel au
// moment d'un échec pour voir l'erreur exacte renvoyée par Daily.
import { createClient } from '@supabase/supabase-js'

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

const DAILY_API_URL = 'https://api.daily.co/v1/rooms'
const DAILY_TOKENS_URL = 'https://api.daily.co/v1/meeting-tokens'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS : nécessaire depuis que l'app native (Capacitor) appelle cette
  // route en URL absolue (voir src/lib/apiUrl.ts) plutôt qu'en chemin
  // relatif — la WebView native a pour origine un pseudo-domaine local
  // (capacitor://localhost / https://localhost), donc chaque appel devient
  // une requête cross-origin. Le navigateur/WebView envoie d'abord une
  // requête OPTIONS de "preflight" (le POST a un Content-Type JSON et un
  // header Authorization, tous deux hors de la liste des "requêtes
  // simples") : sans réponse explicite ici, elle recevait 405 "Method not
  // allowed" et bloquait le vrai POST avant même qu'il parte, malgré
  // src/lib/apiUrl.ts pointant déjà vers la bonne URL. Pas de cookies/
  // session ici (auth par Bearer token), donc `*` est sans risque.
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

  const dailyApiKey = process.env.DAILY_API_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!dailyApiKey || !supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Configuration serveur manquante (DAILY_API_KEY / Supabase).' })
    return
  }

  const authHeader = req.headers.authorization
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : null
  if (!token) {
    res.status(401).json({ error: 'Non authentifié.' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const { gameId, channel, code } = body ?? {}

  if (!gameId || !code || (channel !== 'lobby' && channel !== 'village' && channel !== 'graveyard')) {
    res.status(400).json({ error: 'Requête invalide.' })
    return
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  // can_listen_channel : mêmes règles que can_access_channel pour rejoindre
  // un salon vocal, avec une seule différence — un fantôme peut aussi
  // rejoindre le village en écoute pendant que les vivants y discutent (voir
  // migration 0041). Le texte écrit, lui, reste soumis à can_access_channel
  // seul (send_chat_message) : rien ne change côté chat.
  const { data: allowed, error: rpcError } = await supabase.rpc('can_listen_channel', {
    p_game_id: gameId,
    p_channel: channel,
  })

  if (rpcError) {
    res.status(500).json({ error: rpcError.message })
    return
  }
  if (!allowed) {
    res.status(403).json({ error: "Ce salon vocal n'est pas ouvert pour vous en ce moment." })
    return
  }

  // is_host détermine qui reçoit le jeton "propriétaire" Daily plus bas
  // (voir ownerToken) — seul lui pourra couper à distance le micro des
  // autres joueurs de ce salon. display_name récupéré ici aussi : depuis que
  // le jeton est réellement appliqué (voir plus bas), sa propriété
  // `user_name` prend le pas sur le `userName` passé côté client à join() —
  // sans ça, l'hôte apparaîtrait comme "Hôte" au lieu de son vrai pseudo dans
  // la liste des participants du salon vocal.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let isHost = false
  let hostDisplayName = 'Hôte'
  if (user) {
    const { data: me } = await supabase
      .from('game_players')
      .select('is_host, display_name')
      .eq('game_id', gameId)
      .eq('user_id', user.id)
      .maybeSingle()
    isHost = !!me?.is_host
    if (me?.display_name) hostDisplayName = me.display_name
  }

  const roomName = `wg-${String(code).toLowerCase()}-${channel}`.slice(0, 41)

  // L'hôte de la partie reçoit un jeton Daily "propriétaire" (is_owner) pour
  // ce salon précis : c'est ce qui lui permet ensuite, côté client, de
  // couper à distance le micro d'un autre joueur via updateParticipant().
  // Les autres joueurs rejoignent la même URL publique sans jeton.
  //
  // BUG corrigé : ce jeton était jusqu'ici concaténé à l'URL en `?t=...`,
  // dans l'idée (répandue dans la doc/les exemples Daily côté Prebuilt/
  // iframe) qu'un call object le lirait tout seul depuis l'URL. En pratique,
  // avec `DailyIframe.createCallObject()` (mode "call object", pas Prebuilt),
  // ce n'est PAS fiable : Daily documente explicitement que la seule façon
  // recommandée de fournir un jeton est la propriété `token` de `join()`
  // (voir https://docs.daily.co/reference/rest-api/meeting-tokens#using-meeting-tokens).
  // Le jeton "propriétaire" était donc silencieusement ignoré à la connexion
  // — l'hôte rejoignait comme un participant normal, `canModerate` restait
  // toujours faux côté client, et les boutons de coupure de micro n'apparaissaient
  // jamais. Corrigé en renvoyant le jeton à part (voir useVoiceChat.ts, qui le
  // passe désormais explicitement à `call.join({ url, token })`).
  async function ownerToken(): Promise<string | null> {
    if (!isHost) return null
    try {
      const tokenRes = await fetch(DAILY_TOKENS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dailyApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            is_owner: true,
            user_name: hostDisplayName,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 6,
          },
        }),
      })
      if (!tokenRes.ok) return null
      const tokenData = await tokenRes.json()
      return tokenData.token as string
    } catch {
      // En cas de souci avec l'émission du jeton, l'hôte rejoint quand même
      // le salon vocal normalement — il perd juste la capacité de couper le
      // micro des autres, plutôt que de bloquer complètement le vocal.
      return null
    }
  }

  try {
    const existing = await fetch(`${DAILY_API_URL}/${roomName}`, {
      headers: { Authorization: `Bearer ${dailyApiKey}` },
    })
    if (existing.ok) {
      const data = await existing.json()
      res.status(200).json({ url: data.url, token: await ownerToken() })
      return
    }

    const created = await fetch(DAILY_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dailyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: {
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 6,
          eject_at_room_exp: true,
          enable_screenshare: false,
          enable_chat: false,
          start_video_off: true,
          // Micros coupés par défaut à l'entrée dans le salon : les joueurs
          // doivent explicitement s'activer pour parler (voir aussi
          // startAudioOff dans useVoiceChat.ts, qui applique la même règle
          // côté client au moment du join()).
          start_audio_off: true,
          max_participants: 25,
        },
      }),
    })

    if (!created.ok) {
      const errText = await created.text()

      // Course entre plusieurs joueurs qui rejoignent le même salon vocal au
      // même instant (typiquement juste au début du débat, quand tout le
      // monde bascule sur le vocal du village en même temps) : chacun
      // vérifie d'abord "existing" ci-dessus avant de créer, mais deux
      // requêtes peuvent passer ce test simultanément et tenter de créer la
      // même salle toutes les deux. Daily refuse la seconde avec une erreur
      // "already exists" — ce n'est pas un vrai échec, juste un doublon
      // inoffensif : on récupère la salle que l'autre requête vient de
      // créer, au lieu de renvoyer une erreur qui obligeait jusqu'ici le
      // joueur à recharger la page à la main pour réessayer.
      if (created.status === 400 && /already exists/i.test(errText)) {
        const retry = await fetch(`${DAILY_API_URL}/${roomName}`, {
          headers: { Authorization: `Bearer ${dailyApiKey}` },
        })
        if (retry.ok) {
          const data = await retry.json()
          res.status(200).json({ url: data.url, token: await ownerToken() })
          return
        }
      }

      res.status(502).json({ error: `Daily.co: ${errText}` })
      return
    }

    const data = await created.json()
    res.status(200).json({ url: data.url, token: await ownerToken() })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur inconnue' })
  }
}
