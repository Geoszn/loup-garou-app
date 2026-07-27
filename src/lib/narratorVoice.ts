import { supabase } from './supabase'

/**
 * Demande une annonce vocale réaliste (ElevenLabs) au serveur pour un texte
 * donné, et renvoie l'audio sous forme de Blob prêt à être joué. Lève une
 * erreur si la clé n'est pas configurée côté serveur, si le quota gratuit
 * mensuel est épuisé, ou en cas de souci réseau — à charge de l'appelant de
 * retomber sur la voix du navigateur dans ce cas (voir useNarrator.ts).
 *
 * `gameId` est optionnel : le bouton "Tester le narrateur" (avant même de
 * rejoindre une partie) appelle cette fonction sans partie associée — le
 * serveur saute alors simplement la vérification de participation.
 */
export async function fetchNarratorAudio(gameId: string | null, text: string): Promise<Blob> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Non authentifié.')

  // Filet de sécurité réseau : si ElevenLabs met trop de temps à répondre,
  // on abandonne pour ne pas bloquer la file d'annonces trop longtemps.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  let res: Response
  try {
    res = await fetch('/api/narrator-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameId, text }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Voix ElevenLabs indisponible.')
  }
  return res.blob()
}
