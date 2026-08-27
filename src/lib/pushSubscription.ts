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
