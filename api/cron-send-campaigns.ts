// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Déclenchée périodiquement par Vercel Cron (voir "crons" dans vercel.json)
// pour envoyer les campagnes programmées (notification_campaigns.status =
// 'scheduled') dont la date est passée. Traite au plus 20 campagnes par
// passage, l'une après l'autre (pas en parallèle : plusieurs diffusions
// simultanées vers potentiellement des milliers d'abonnements webpush
// pourraient saturer la fonction) — largement suffisant vu la fréquence du
// cron et le volume de campagnes attendu sur cette app.
//
// Authentification : Vercel envoie automatiquement
// `Authorization: Bearer $CRON_SECRET` sur les requêtes déclenchées par un
// cron défini dans vercel.json, dès que la variable d'env CRON_SECRET est
// configurée côté projet Vercel (voir doc "Securing cron jobs"). Sans ce
// secret configuré, la route refuse tout appel plutôt que de tourner en
// authentification ouverte sur une URL publique devinable.
import { createClient } from '@supabase/supabase-js'
import { configureVapid, dispatchNotificationCampaign } from '../server/pushSend.js'

interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
}
interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): void
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Non autorisé.' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!configureVapid() || !supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Configuration serveur manquante (VAPID / Supabase).' })
    return
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: due, error: dueError } = await serviceClient
    .from('notification_campaigns')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(20)

  if (dueError) {
    res.status(500).json({ error: dueError.message })
    return
  }

  const results: { id: string; sent: number; removed: number }[] = []
  for (const row of due ?? []) {
    try {
      const result = await dispatchNotificationCampaign(serviceClient, row.id)
      if (result.handled) results.push({ id: row.id, sent: result.sent, removed: result.removed })
    } catch {
      // dispatchNotificationCampaign marque déjà la ligne 'failed' — un
      // échec sur une campagne ne doit pas empêcher le passage sur les
      // suivantes.
    }
  }

  res.status(200).json({ processed: results.length, results })
}
