// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Déclenchée par le dashboard admin juste après la création d'une campagne
// (admin_create_notification_campaign, migration 0129) quand elle doit
// partir immédiatement ("Envoyer maintenant" — pas de date programmée).
// L'envoi programmé, lui, passe par api/cron-send-campaigns.ts et n'appelle
// jamais cette route.
//
// L'admin ne peut PAS choisir librement quel texte est envoyé à qui : cette
// route ne fait que déclencher l'envoi d'une campagne déjà créée en base
// (par id) — le contenu vient entièrement de la ligne notification_campaigns,
// jamais du corps de cette requête.
import { createClient } from '@supabase/supabase-js'
// Extension .js explicite obligatoire — voir le même commentaire dans
// api/send-push.ts.
import { configureVapid, dispatchNotificationCampaign } from '../server/pushSend.js'

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

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  // Revérifie ici, avec la clé service_role, que l'appelant est bien admin —
  // ne jamais faire confiance à un flag côté client (voir AdminDashboard.tsx).
  const { data: profile } = await serviceClient.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle()
  if (!profile?.is_admin) {
    res.status(403).json({ error: 'Accès refusé.' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const campaignId = body?.campaignId
  if (typeof campaignId !== 'string') {
    res.status(400).json({ error: 'Requête invalide.' })
    return
  }

  try {
    const result = await dispatchNotificationCampaign(serviceClient, campaignId)
    if (!result.handled) {
      // Déjà envoyée/annulée/en cours (course avec le cron, ou double clic) —
      // pas une erreur, le dashboard recharge simplement l'historique.
      res.status(200).json({ handled: false, sent: 0, removed: 0 })
      return
    }
    res.status(200).json(result)
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message ?? err) })
  }
}
