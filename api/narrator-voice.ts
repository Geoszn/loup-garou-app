// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Elle seule connaît la clé secrète ElevenLabs (ELEVENLABS_API_KEY). Rôle :
//   1. Vérifier, via Supabase (avec le token de l'utilisateur), qu'il
//      participe bien à la partie pour laquelle il demande une annonce
//      vocale (empêche n'importe qui d'épuiser le quota gratuit).
//   2. Convertir le texte en voix réaliste via l'API ElevenLabs.
//   3. Renvoyer directement l'audio (mp3) au client.
//
// Si la clé n'est pas configurée, ou si ElevenLabs échoue (quota mensuel
// gratuit épuisé, etc.), on renvoie une erreur explicite : le client bascule
// alors automatiquement sur la voix gratuite du navigateur (voir
// src/hooks/useNarrator.ts), la narration ne casse jamais.
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
  send(body: any): void
}

const MAX_CHARS = 300

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const elevenApiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'
  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5'
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!elevenApiKey || !supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Configuration serveur manquante (ELEVENLABS_API_KEY / Supabase).' })
    return
  }

  const authHeader = req.headers.authorization
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : null
  if (!token) {
    res.status(401).json({ error: 'Non authentifié.' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  // gameId est optionnel : le bouton "Tester le narrateur" (avant même de
  // rejoindre une partie, voir useNarrator.testVoice) appelle cette fonction
  // sans partie associée. Dans ce cas on saute la vérification de
  // participation ci-dessous, mais l'authentification reste obligatoire.
  const { gameId, text } = body ?? {}

  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Requête invalide.' })
    return
  }
  const cleanText = text.trim().slice(0, MAX_CHARS)

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  // Vérifie explicitement que le token correspond à un compte authentifié —
  // avant, cette vérification passait implicitement par is_game_participant,
  // qui n'est plus appelée quand gameId est absent (test hors-partie).
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Authentification invalide.' })
    return
  }

  if (gameId) {
    const { data: allowed, error: rpcError } = await supabase.rpc('is_game_participant', { p_game_id: gameId })
    if (rpcError) {
      res.status(500).json({ error: rpcError.message })
      return
    }
    if (!allowed) {
      res.status(403).json({ error: "Vous ne participez pas à cette partie." })
      return
    }
  }

  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenApiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: modelId,
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8,
            style: 0.35,
            use_speaker_boost: true,
          },
        }),
      }
    )

    if (!elevenRes.ok) {
      const errText = await elevenRes.text()
      res.status(502).json({ error: `ElevenLabs: ${errText.slice(0, 300)}` })
      return
    }

    const audioBuffer = Buffer.from(await elevenRes.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(audioBuffer)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur inconnue' })
  }
}
