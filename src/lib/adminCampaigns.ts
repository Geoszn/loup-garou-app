import { supabase } from './supabase'
import { apiUrl } from './apiUrl'

// Module réservé à l'administration (importé uniquement par AdminDashboard) :
// séparé de pushSubscription.ts, chargé par le site public, pour que le
// chemin de cette API n'apparaisse jamais dans le code servi aux joueurs.

/**
 * Déclenche l'envoi immédiat d'une campagne de notification déjà créée en
 * base (voir admin_create_notification_campaign, migration 0129, et
 * api/admin-send-campaign.ts) — utilisée par l'onglet Notifications du
 * dashboard admin pour le bouton "Envoyer maintenant". Contrairement à
 * notifyBestEffort ci-dessous, une erreur ici doit remonter à l'admin (pas
 * un envoi silencieusement raté).
 */
export async function sendNotificationCampaignNow(campaignId: string): Promise<{ sent: number; removed: number }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Non authentifié.')

  const res = await fetch(apiUrl('/api/admin-send-campaign'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ campaignId }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Envoi de la campagne impossible.')
  }
  return { sent: data.sent ?? 0, removed: data.removed ?? 0 }
}
