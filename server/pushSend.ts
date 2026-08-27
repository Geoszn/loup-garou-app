// Hors du dossier api/ délibérément : Vercel exclut du build final tout
// fichier/dossier préfixé par "_" à l'intérieur de api/ (pas seulement du
// routage, comme on pensait au départ — un fichier api/_lib/pushSend.ts
// causait un `ERR_MODULE_NOT_FOUND` en production dès qu'une fonction
// l'importait, malgré un build Vercel "réussi"). server/ n'a ce problème
// avec aucune fonction : importé normalement par send-push.ts et
// notify-user.ts, qui empaquettent chacun leur propre copie au déploiement.
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

let vapidConfigured = false

/** Doit être appelée avant tout envoi. Renvoie false si les clés VAPID ne
 * sont pas configurées côté serveur — à charge de l'appelant de répondre
 * une erreur 500 explicite dans ce cas plutôt que de laisser web-push
 * planter avec un message moins clair. */
export function configureVapid(): boolean {
  if (vapidConfigured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:contact@loupgarouafrique.com'
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

/**
 * Envoie `payload` à tous les abonnements actifs d'un joueur (il peut en
 * avoir plusieurs — un par navigateur/appareil, voir migration 0105) et
 * retire ceux qui répondent 404/410 (abonnement expiré ou révoqué côté
 * navigateur), pour ne pas continuer à échouer dessus indéfiniment.
 * `serviceClient` doit être créé avec la clé service_role : cette table n'a
 * aucune policy RLS cliente par conception.
 */
export async function sendPushToUser(
  serviceClient: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; removed: number }> {
  const { data: subscriptions } = await serviceClient
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', userId)

  if (!subscriptions || subscriptions.length === 0) return { sent: 0, removed: 0 }

  let sent = 0
  let removed = 0
  const body = JSON.stringify(payload)

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, body)
        sent++
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await serviceClient.from('push_subscriptions').delete().eq('id', sub.id)
          removed++
        }
      }
    })
  )

  return { sent, removed }
}
