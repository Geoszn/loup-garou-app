// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Appelée toutes les heures par le workflow GitHub Actions
// .github/workflows/engagement-notifications.yml (Vercel Cron gratuit ne
// permet qu'un passage par jour). Le choix des messages se fait en base
// (pick_engagement_notifications, migration 0189) ; cette route ne fait
// qu'envoyer. Même authentification que api/cron-send-campaigns.ts :
// `Authorization: Bearer $CRON_SECRET`, refus sans secret configuré.
import { createClient } from '@supabase/supabase-js'
import { configureVapid, sendPushToUser } from '../server/pushSend.js'

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
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
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
  const { data, error } = await serviceClient.rpc('pick_engagement_notifications')
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  const rows = (data ?? []) as { user_id: string; kind: string; title: string; body: string; url: string }[]
  let sent = 0
  for (const row of rows) {
    try {
      const result = await sendPushToUser(serviceClient, row.user_id, { title: row.title, body: row.body, url: row.url })
      sent += result.sent
    } catch {
      // Un échec d'envoi ne doit pas bloquer les autres joueurs.
    }
  }

  res.status(200).json({ picked: rows.length, sent })
}
