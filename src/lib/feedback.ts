import { supabase } from './supabase'
import { apiUrl } from './apiUrl'

export async function submitFeedback(message: string): Promise<{ next_allowed_at: string }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Non authentifié.')

  const res = await fetch(apiUrl('/api/feedback'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || "Impossible d'envoyer le message.")
  }
  return data
}
