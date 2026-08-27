import { supabase } from './supabase'
import { apiUrl } from './apiUrl'

/** Convertit la clé publique VAPID (base64url, format renvoyé par
 * `npx web-push generate-vapid-keys`) vers le Uint8Array attendu par
 * PushManager.subscribe({ applicationServerKey }) — l'API Push n'accepte
 * pas directement une chaîne. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** iPhone/iPad, y compris l'iPadOS 13+ qui s'annonce comme "Macintosh" dans
 * le user-agent mais se distingue d'un vrai Mac par son écran tactile. */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** true si le site tourne déjà en PWA installée (icône sur l'écran
 * d'accueil) plutôt que dans un onglet Safari/Chrome classique —
 * `standalone` n'existe que sur Safari/iOS, `display-mode` est le standard
 * suivi ailleurs. Sert notamment à savoir s'il vaut la peine de rappeler à
 * quelqu'un qui ouvre un lien d'invitation dans un simple onglet qu'il a
 * peut-être déjà l'app sur son écran d'accueil (voir JoinByLink.tsx) — on ne
 * peut jamais savoir avec certitude si elle est installée depuis un onglet
 * classique (aucune API cross-navigateur pour ça), seulement si on tourne
 * DÉJÀ dedans. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    (window.navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/**
 * Déclenche l'envoi d'une notification de test à l'utilisateur connecté, sur
 * tous ses abonnements actifs (voir api/send-push.ts). Utilisée par le
 * bouton "Envoyer un test" dans Mon compte, pour vérifier la chaîne
 * complète (abonnement → serveur → notification reçue) sans attendre un
 * vrai événement de jeu.
 */
export async function sendTestPush(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Non authentifié.')

  const res = await fetch(apiUrl('/api/send-push'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ test: true }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Envoi de la notification de test impossible.')
  }
}

/** POST authentifié best-effort vers une route de notification — n'échoue
 * jamais bruyamment (voir le commentaire de notifyGameInvite ci-dessous) :
 * la plupart des joueurs n'auront pas activé les notifications, et ces
 * appels suivent toujours une action côté jeu déjà réussie (invitation,
 * demande d'ami, lancement de partie) qui ne doit jamais paraître avoir
 * échoué à cause de ça. */
async function notifyBestEffort(path: string, body: Record<string, unknown>): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return

  try {
    await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    // Best-effort : voir le commentaire de la fonction.
  }
}

/**
 * Prévient un ami par notification push qu'il vient de recevoir une
 * invitation à une partie (voir api/notify-user.ts). Appelée juste après un
 * appel réussi à invite_friend_to_game (voir Lobby.tsx).
 */
export function notifyGameInvite(gameId: string, friendId: string): Promise<void> {
  return notifyBestEffort('/api/notify-user', { gameId, friendId })
}

/**
 * Prévient un joueur par notification push qu'il vient de recevoir une
 * demande d'ami (voir api/notify-friend-request.ts). Appelée juste après un
 * appel réussi à send_friend_request / send_friend_request_by_user_id, SEULEMENT
 * quand la réponse indique 'pending' — un statut 'accepted' veut dire que
 * les deux comptes étaient déjà en attente l'un vers l'autre et sont
 * maintenant amis directement, rien à notifier dans ce cas.
 */
export function notifyFriendRequest(targetUserId: string): Promise<void> {
  return notifyBestEffort('/api/notify-friend-request', { targetUserId })
}

/**
 * Prévient les joueurs d'un salon que la partie vient de démarrer — mais
 * seulement ceux passés dans `candidateUserIds`, calculée côté appelant à
 * partir de `onlineUserIds` (voir usePushNotifications.ts et le commentaire
 * de api/notify-game-started.ts) : jamais quelqu'un qui a déjà l'écran du
 * salon sous les yeux. Appelée juste après un appel réussi à start_game
 * (voir Lobby.tsx).
 */
export function notifyGameStarted(gameId: string, candidateUserIds: string[]): Promise<void> {
  if (candidateUserIds.length === 0) return Promise.resolve()
  return notifyBestEffort('/api/notify-game-started', { gameId, candidateUserIds })
}

/**
 * Prévient l'hôte d'une partie qu'un joueur demande à la rejoindre (voir
 * api/notify-join-request.ts). Appelée après un appel réussi à join_game
 * (statut 'pending') ou request_join_public_game (voir Dashboard.tsx,
 * JoinByLink.tsx, PublicGamesBrowser.tsx).
 */
export function notifyJoinRequest(gameId: string): Promise<void> {
  return notifyBestEffort('/api/notify-join-request', { gameId })
}

/**
 * Prévient un joueur que sa demande pour rejoindre une partie vient d'être
 * acceptée (voir api/notify-join-accepted.ts). Appelée par l'hôte juste
 * après un appel réussi à respond_join_request(p_accept: true) (voir
 * JoinRequestsPanel.tsx).
 */
export function notifyJoinAccepted(requestId: string): Promise<void> {
  return notifyBestEffort('/api/notify-join-accepted', { requestId })
}
