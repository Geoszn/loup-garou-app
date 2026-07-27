import { supabase } from './supabase'

export async function getVoiceRoomUrl(
  gameId: string,
  code: string,
  channel: 'lobby' | 'village' | 'graveyard'
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Non authentifié.')

  const res = await fetch('/api/daily-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gameId, code, channel }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Impossible de rejoindre le salon vocal.')
  }
  return data.url as string
}
