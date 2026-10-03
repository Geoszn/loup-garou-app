// Fonction serverless Vercel — ne s'exécute JAMAIS dans le navigateur.
// Alimente le suivi d'usage vocal de la Vue d'ensemble admin (voir
// migration 0211 et src/components/DailyUsageCard.tsx) : relit les sessions
// Daily.co (GET /meetings — chaque participant y a sa durée en secondes), en
// fait le total de minutes-participant PAR JOUR (UTC) et le range dans
// daily_usage_days.
//
// Réservée aux admins (revérifié ici avec la clé service_role, comme
// api/admin-send-campaign.ts). Reprise par morceaux : chaque appel traite des
// fenêtres de 7 jours, de la plus récente à la plus ancienne, dans la limite
// d'un budget de temps, et renvoie `remaining` (fenêtres restantes) — le
// client rappelle tant que `remaining > 0`. Au premier appel, on remonte
// jusqu'au 1er du mois d'il y a 2 mois ; ensuite seuls les jours manquants,
// plus hier et aujourd'hui (encore en cours), sont relus.
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
  end(): void
}

const DAILY_MEETINGS_URL = 'https://api.daily.co/v1/meetings'
const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_DAYS = 7
const MONTHS_BACK = 2
const PAGE_SIZE = 100
const MAX_PAGES_PER_WINDOW = 200
const TIME_BUDGET_MS = 40_000

interface DailyParticipant {
  join_time?: number
  duration?: number | null
}
interface DailyMeeting {
  id: string
  start_time: number
  duration?: number | null
  max_participants?: number
  participants?: DailyParticipant[]
}

const dayKey = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchPage(apiKey: string, url: string): Promise<DailyMeeting[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (res.status === 429) {
      await sleep(1200 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`Daily.co ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as { data?: DailyMeeting[] }
    return json.data ?? []
  }
  throw new Error('Daily.co: trop de requêtes (429), réessaie dans un instant.')
}

/** Minutes-participant d'une session, en secondes. Une session encore en
 * cours n'a pas de durée définitive : on compte jusqu'à maintenant. */
function participantSeconds(m: DailyMeeting, nowSec: number): number {
  if (Array.isArray(m.participants)) {
    return m.participants.reduce((sum, p) => sum + Math.max(0, p.duration ?? (p.join_time ? nowSec - p.join_time : 0)), 0)
  }
  // Repli (liste sans détail des participants) : durée de la session × pic de
  // participants — borne haute, jamais en dessous du réel.
  return Math.max(0, m.duration ?? nowSec - m.start_time) * Math.max(1, m.max_participants ?? 1)
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

  const dailyApiKey = process.env.DAILY_API_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!dailyApiKey || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    res.status(500).json({ error: 'Configuration serveur manquante (DAILY_API_KEY / Supabase).' })
    return
  }

  const authHeader = req.headers.authorization
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : null
  if (!token) {
    res.status(401).json({ error: 'Non authentifié.' })
    return
  }
  const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Authentification invalide.' })
    return
  }
  const service = createClient(supabaseUrl, serviceRoleKey)
  const { data: profile } = await service.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle()
  if (!profile?.is_admin) {
    res.status(403).json({ error: 'Accès refusé.' })
    return
  }

  try {
    const startedAt = Date.now()
    const nowSec = Math.floor(startedAt / 1000)
    const now = new Date(startedAt)
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const targetStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS_BACK, 1)

    const { data: stored, error: storedError } = await service
      .from('daily_usage_days')
      .select('day')
      .gte('day', new Date(targetStart).toISOString().slice(0, 10))
    if (storedError) throw new Error(storedError.message)
    const have = new Set((stored ?? []).map((r: { day: string }) => r.day))

    // Fenêtres à (re)lire, de la plus récente à la plus ancienne : toute fenêtre
    // où un jour manque, plus celle qui contient hier/aujourd'hui (encore
    // susceptibles de changer).
    const windows: { start: number; end: number }[] = []
    for (let end = todayStart + DAY_MS; end > targetStart; end -= WINDOW_DAYS * DAY_MS) {
      const start = Math.max(targetStart, end - WINDOW_DAYS * DAY_MS)
      let missing = end > todayStart - DAY_MS
      for (let d = start; d < end && !missing; d += DAY_MS) {
        if (!have.has(new Date(d).toISOString().slice(0, 10))) missing = true
      }
      if (missing) windows.push({ start, end })
    }

    let processed = 0
    for (const w of windows) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break

      const perDay = new Map<string, { seconds: number; sessions: number }>()
      for (let d = w.start; d < w.end; d += DAY_MS) perDay.set(new Date(d).toISOString().slice(0, 10), { seconds: 0, sessions: 0 })

      let cursor: string | null = null
      for (let page = 0; page < MAX_PAGES_PER_WINDOW; page++) {
        const qs = new URLSearchParams({
          timeframe_start: String(Math.floor(w.start / 1000)),
          timeframe_end: String(Math.floor(w.end / 1000)),
          limit: String(PAGE_SIZE),
        })
        if (cursor) qs.set('starting_after', cursor)
        const meetings = await fetchPage(dailyApiKey, `${DAILY_MEETINGS_URL}?${qs.toString()}`)
        for (const m of meetings) {
          const bucket = perDay.get(dayKey(m.start_time))
          if (!bucket) continue // hors fenêtre (débordement de bord) : relu par la fenêtre voisine
          bucket.seconds += participantSeconds(m, nowSec)
          bucket.sessions += 1
        }
        if (meetings.length < PAGE_SIZE) break
        cursor = meetings[meetings.length - 1].id
      }

      const rows = Array.from(perDay.entries()).map(([day, v]) => ({
        day,
        participant_seconds: Math.round(v.seconds),
        sessions: v.sessions,
        updated_at: new Date().toISOString(),
      }))
      const { error: upsertError } = await service.from('daily_usage_days').upsert(rows, { onConflict: 'day' })
      if (upsertError) throw new Error(upsertError.message)
      processed++
    }

    res.status(200).json({ processed, remaining: windows.length - processed })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur inconnue' })
  }
}
