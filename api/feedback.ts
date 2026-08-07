// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Elle seule connaît la clé secrète Resend (RESEND_API_KEY). Rôle :
//   1. Vérifier l'authentification via Supabase (token du joueur).
//   2. Enregistrer + valider le message via submit_feedback (migration 0056
//      — c'est CETTE fonction SQL, pas celle-ci, qui fait autorité sur la
//      limite d'un message par semaine : Postgres refuse l'insertion avec
//      une erreur explicite si le délai n'est pas écoulé, et on la relaie
//      telle quelle au client).
//   3. Une fois le message enregistré avec succès, envoyer l'email à
//      l'éditeur via Resend — en "best effort" : si Resend n'est pas encore
//      configuré (RESEND_API_KEY absente) ou échoue, le message reste quand
//      même enregistré en base (rien n'est perdu), seul l'email immédiat ne
//      part pas.
import { createClient } from '@supabase/supabase-js'

interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: any
}
interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): void
}

const MAX_CHARS = 2000
const RESEND_API_URL = 'https://api.resend.com/emails'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Configuration serveur manquante (Supabase).' })
    return
  }

  const authHeader = req.headers.authorization
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : null
  if (!token) {
    res.status(401).json({ error: 'Non authentifié.' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const { message } = body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Message vide.' })
    return
  }
  const cleanMessage = message.trim().slice(0, MAX_CHARS)

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    res.status(401).json({ error: 'Authentification invalide.' })
    return
  }

  // submit_feedback fait autorité : valide la longueur, applique la limite
  // d'un message par semaine, et enregistre. Toute erreur (y compris "encore
  // X jours à attendre") est renvoyée telle quelle au client, qui l'affiche
  // directement — un seul message d'erreur à maintenir, côté base.
  const { data: submitData, error: submitError } = await supabase.rpc('submit_feedback', { p_message: cleanMessage })
  if (submitError) {
    res.status(400).json({ error: submitError.message })
    return
  }

  // Envoi de l'email — best effort, voir commentaire en tête de fichier.
  // Le résultat (succès ou échec, avec le détail renvoyé par Resend) est
  // toujours journalisé côté serveur (Vercel > Runtime Logs) même si rien
  // ne remonte jamais au joueur : sans ça, un échec silencieux de Resend
  // (mauvaise clé, domaine non vérifié pour cet alias, etc.) serait
  // impossible à diagnostiquer après coup.
  const resendApiKey = process.env.RESEND_API_KEY
  const toEmail = process.env.FEEDBACK_TO_EMAIL
  if (!resendApiKey || !toEmail) {
    console.warn('[feedback] Resend non configuré (RESEND_API_KEY ou FEEDBACK_TO_EMAIL manquante) — email non envoyé.')
  } else {
    try {
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle()
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'LG Afrique <onboarding@resend.dev>'
      const resendRes = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          subject: `💬 Nouveau message — ${profile?.username ?? 'un joueur'} (LG Afrique)`,
          text: [
            `De : ${profile?.username ?? 'inconnu'} (${user.email ?? 'email inconnu'})`,
            `Envoyé le : ${new Date().toLocaleString('fr-FR')}`,
            '',
            cleanMessage,
          ].join('\n'),
        }),
      })
      const resendBody = await resendRes.text()
      if (!resendRes.ok) {
        console.error(`[feedback] Resend a refusé l'envoi (${resendRes.status}): ${resendBody}`)
      } else {
        console.log(`[feedback] Email envoyé via Resend: ${resendBody}`)
      }
    } catch (err) {
      console.error('[feedback] Erreur réseau vers Resend:', err instanceof Error ? err.message : err)
    }
  }

  res.status(200).json(submitData)
}
