import { supabase } from './supabase'
import { apiUrl } from './apiUrl'

export interface VoiceRoom {
  url: string
  // Jeton "propriétaire" Daily (voir api/daily-room.ts), uniquement pour
  // l'hôte de la partie — null pour tout le monde d'autre. À passer
  // explicitement à `call.join({ url, token })` (useVoiceChat.ts) : Daily
  // ne le lit PAS de manière fiable s'il est juste concaténé à l'URL en
  // `?t=...`, seule la propriété `token` de join() est documentée comme
  // garantie pour un call object (voir historique de ce fichier).
  token: string | null
}

export async function getVoiceRoomUrl(
  gameId: string,
  code: string,
  channel: 'lobby' | 'village' | 'wolves' | 'graveyard'
): Promise<VoiceRoom> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Non authentifié.')

  const res = await fetch(apiUrl('/api/daily-room'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gameId, code, channel }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Impossible de rejoindre le salon vocal.')
  }
  return { url: data.url as string, token: (data.token as string | null) ?? null }
}
