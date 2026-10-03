import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { apiUrl } from '../lib/apiUrl'
import { Button, Card, ErrorText } from './ui'

// Suivi de l'usage vocal Daily.co pour la Vue d'ensemble admin. Les données
// viennent de daily_usage_days (migration 0211), alimentée depuis l'API REST de
// Daily par api/admin-daily-usage.ts : minutes-participant PAR JOUR (UTC). C'est
// une approximation — la facture exacte est sur le tableau de bord Daily.
export const DAILY_FREE_MINUTES = 10000
// Tarif audio seul (voir api/daily-room.ts : start_video_off). Une piste vidéo
// à un moment donné fait facturer tout l'appel 4 fois plus cher.
export const DAILY_AUDIO_RATE = 0.00099
export const DAILY_THRESHOLDS = [5000, 10000, 20000] as const
const STALE_MS = 15 * 60 * 1000

interface UsageDay {
  day: string
  minutes: number
  sessions: number
}
interface UsageData {
  days: UsageDay[]
  synced_at: string | null
}

export interface MonthUsage {
  key: string
  label: string
  shortLabel: string
  daysInMonth: number
  isCurrent: boolean
  daily: number[]
  cum: (number | null)[]
  total: number
  sessions: number
  reached: Record<number, number | null>
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const money = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Regroupe les jours par mois (le mois en cours et les 2 précédents, UTC) et
 * calcule cumul quotidien, total et jour d'atteinte de chaque seuil. */
export function buildMonths(days: UsageDay[], now = new Date()): MonthUsage[] {
  const byDay = new Map(days.map((d) => [d.day, d]))
  const out: MonthUsage[] = []
  for (let back = 0; back < 3; back++) {
    const y = now.getUTCFullYear()
    const m = now.getUTCMonth() - back
    const first = new Date(Date.UTC(y, m, 1))
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    const isCurrent = back === 0
    const lastDay = isCurrent ? now.getUTCDate() : daysInMonth
    const daily: number[] = []
    const cum: (number | null)[] = []
    let running = 0
    let sessions = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const key = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d)).toISOString().slice(0, 10)
      const row = byDay.get(key)
      const minutes = row?.minutes ?? 0
      sessions += row?.sessions ?? 0
      daily.push(minutes)
      if (d <= lastDay) {
        running += minutes
        cum.push(running)
      } else {
        cum.push(null)
      }
    }
    const reached: Record<number, number | null> = {}
    for (const t of DAILY_THRESHOLDS) {
      const idx = cum.findIndex((v) => v !== null && v >= t)
      reached[t] = idx === -1 ? null : idx + 1
    }
    out.push({
      key: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}`,
      label: first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      shortLabel: first.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }),
      daysInMonth,
      isCurrent,
      daily,
      cum,
      total: running,
      sessions,
      reached,
    })
  }
  return out
}

const COLORS = ['text-moon-300', 'text-sky-300', 'text-purple-300']

function UsageChart({ months, projected }: { months: MonthUsage[]; projected: number | null }) {
  const W = 340
  const H = 190
  const L = 44
  const R = 10
  const T = 12
  const B = 22
  const maxCum = Math.max(...months.map((m) => m.total), projected ?? 0)
  const yMax = Math.max(DAILY_THRESHOLDS[2] * 1.08, maxCum * 1.08)
  const x = (day: number) => L + ((day - 1) / 30) * (W - L - R)
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B)
  const current = months[0]
  const todayIdx = current.cum.reduce<number>((acc, v, i) => (v !== null ? i : acc), 0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Minutes cumulées par jour, par mois">
      {/* seuils */}
      {DAILY_THRESHOLDS.map((t) => {
        const free = t === DAILY_FREE_MINUTES
        return (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={free ? 'stroke-blood-400' : 'stroke-night-500'} strokeWidth={free ? 1.2 : 0.8} strokeDasharray="3 3" />
            <text x={L - 5} y={y(t) + 3} textAnchor="end" className={`text-[8.5px] ${free ? 'fill-blood-400' : 'fill-moon-200/50'}`}>
              {fmt(t)}
            </text>
          </g>
        )
      })}
      <text x={W - R} y={y(DAILY_FREE_MINUTES) - 3} textAnchor="end" className="fill-blood-400 text-[8px]">
        fin du gratuit
      </text>
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="stroke-night-600" strokeWidth="0.8" />
      {[1, 8, 15, 22, 29].map((d) => (
        <text key={d} x={x(d)} y={H - 7} textAnchor="middle" className="fill-moon-200/45 text-[8.5px]">
          {d}
        </text>
      ))}

      {/* mois précédents puis mois en cours au premier plan */}
      {[...months].reverse().map((m) => {
        const idx = months.indexOf(m)
        const pts = m.cum.flatMap((v, i) => (v === null ? [] : [`${x(i + 1)},${y(v)}`]))
        return (
          <polyline
            key={m.key}
            points={pts.join(' ')}
            fill="none"
            stroke="currentColor"
            className={COLORS[idx]}
            strokeWidth={m.isCurrent ? 2.2 : 1.4}
            strokeOpacity={m.isCurrent ? 1 : 0.65}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )
      })}

      {/* projection de fin de mois (mois en cours) */}
      {projected !== null && current.cum[todayIdx] !== null && (
        <line
          x1={x(todayIdx + 1)}
          y1={y(current.cum[todayIdx] as number)}
          x2={x(current.daysInMonth)}
          y2={y(projected)}
          stroke="currentColor"
          className="text-moon-300"
          strokeWidth="1.4"
          strokeDasharray="2 3"
          strokeOpacity="0.75"
        />
      )}

      {/* repères : jour où chaque seuil est franchi + point d'aujourd'hui */}
      {DAILY_THRESHOLDS.map((t) => {
        const d = current.reached[t]
        if (!d) return null
        return <circle key={t} cx={x(d)} cy={y(t)} r="3.2" className="fill-moon-300 stroke-night-900" strokeWidth="1.2" />
      })}
      {current.cum[todayIdx] !== null && (
        <circle cx={x(todayIdx + 1)} cy={y(current.cum[todayIdx] as number)} r="3.6" className="fill-moon-200 stroke-moon-300" strokeWidth="1.5" />
      )}
    </svg>
  )
}

export function DailyUsageCard() {
  const [data, setData] = useState<UsageData | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoSynced = useRef(false)

  const load = useCallback(async (): Promise<UsageData | null> => {
    const { data: result, error: rpcError } = await supabase.rpc('admin_get_daily_usage')
    if (rpcError) {
      setError(rpcError.message)
      return null
    }
    const next = result as UsageData
    setData(next)
    return next
  }, [])

  const sync = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const jwt = sessionData.session?.access_token
      if (!jwt) throw new Error('Non authentifié.')
      // La route traite des fenêtres de 7 jours dans un budget de temps :
      // on la rappelle tant qu'il en reste (premier passage = historique).
      for (let i = 0; i < 8; i++) {
        const res = await fetch(apiUrl('/api/admin-daily-usage'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: '{}',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Synchronisation Daily impossible.')
        await load()
        if (!json.remaining) break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Synchronisation Daily impossible.')
    } finally {
      setSyncing(false)
    }
  }, [load])

  useEffect(() => {
    void load().then((loaded) => {
      if (autoSynced.current || !loaded) return
      autoSynced.current = true
      const age = loaded.synced_at ? Date.now() - new Date(loaded.synced_at).getTime() : Infinity
      if (age > STALE_MS) void sync()
    })
  }, [load, sync])

  const months = useMemo(() => buildMonths(data?.days ?? []), [data])
  const current = months[0]

  const now = new Date()
  const elapsedDays = Math.max(0.25, now.getUTCDate() - 1 + (now.getUTCHours() + now.getUTCMinutes() / 60) / 24)
  const avgPerDay = current.total / elapsedDays
  const projected = current.total > 0 ? avgPerDay * current.daysInMonth : null
  const pct = (current.total / DAILY_FREE_MINUTES) * 100
  const tone = pct >= 100 ? 'text-blood-400' : pct >= 75 ? 'text-amber-300' : 'text-emerald-400'
  const barTone = pct >= 100 ? 'bg-blood-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-400'
  const cost = (total: number) => Math.max(0, total - DAILY_FREE_MINUTES) * DAILY_AUDIO_RATE
  const freeRunsOutDay =
    projected !== null && projected >= DAILY_FREE_MINUTES && current.total < DAILY_FREE_MINUTES && avgPerDay > 0
      ? Math.ceil(DAILY_FREE_MINUTES / avgPerDay)
      : null
  const dayLabel = (m: MonthUsage, day: number) => `${day} ${m.shortLabel}`
  const syncedAgo = data?.synced_at ? Math.max(0, Math.round((Date.now() - new Date(data.synced_at).getTime()) / 60000)) : null

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-[15px] text-moon-200">
            🎙️ Vocal Daily <span className="text-xs font-normal text-moon-200/40">minutes-participant, approximatif</span>
          </h2>
          <p className="text-[11px] text-moon-200/40">
            {syncing ? 'Mise à jour depuis Daily…' : syncedAgo === null ? 'Jamais synchronisé' : syncedAgo < 1 ? 'Mis à jour à l’instant' : `Mis à jour il y a ${syncedAgo} min`}
          </p>
        </div>
        <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={syncing} onClick={() => void sync()}>
          {syncing ? '…' : '↻ Actualiser'}
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs capitalize text-moon-200/50">{current.label}</p>
            <p className="font-display text-[34px] leading-none tabular-nums text-moon-200">
              {fmt(current.total)} <span className="text-base text-moon-200/45">min</span>
            </p>
            <p className={`mt-1 text-xs font-semibold ${tone}`}>
              {pct >= 100 ? `Quota gratuit dépassé · ≈ ${money(cost(current.total))} $ à ce jour` : `${Math.round(pct)} % des ${fmt(DAILY_FREE_MINUTES)} minutes gratuites`}
            </p>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-night-800">
            <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, pct)}%` }} />
            <div className="absolute inset-y-0 left-1/2 w-px bg-night-500" />
          </div>
          {projected !== null && (
            <p className="text-xs leading-relaxed text-moon-200/65">
              Au rythme actuel (≈ {fmt(avgPerDay)} min/jour) : <strong className="text-moon-200">≈ {fmt(projected)} min</strong> en fin de mois
              {projected > DAILY_FREE_MINUTES ? <> soit <strong className="text-moon-200">≈ {money(cost(projected))} $</strong></> : ' — sous le quota gratuit'}.
              {freeRunsOutDay !== null && <> Quota gratuit épuisé vers le <strong className="text-moon-200">{dayLabel(current, Math.min(freeRunsOutDay, current.daysInMonth))}</strong></>}
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {months.map((m, i) => (
              <span key={m.key} className="inline-flex items-center gap-1.5 text-moon-200/70">
                <span className={`inline-block h-0.5 w-4 rounded-full bg-current ${COLORS[i]}`} />
                <span className="capitalize">{m.shortLabel}</span>
              </span>
            ))}
          </div>
        </div>

        <UsageChart months={months} projected={projected} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-moon-200/40">
              <th className="pb-1.5 pr-2 font-semibold">Mois</th>
              <th className="pb-1.5 pr-2 text-right font-semibold">Minutes</th>
              <th className="pb-1.5 pr-2 text-right font-semibold">Sessions</th>
              <th className="pb-1.5 pr-2 text-right font-semibold">Coût estimé</th>
              {DAILY_THRESHOLDS.map((t) => (
                <th key={t} className="pb-1.5 pr-2 text-right font-semibold">
                  {fmt(t)} atteint
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m.key} className="border-t border-night-700/60">
                <td className={`py-1.5 pr-2 font-semibold ${COLORS[i]}`}>
                  <span className="capitalize">{m.label}</span>
                  {m.isCurrent && <span className="ml-1 text-[10px] font-normal text-moon-200/40">en cours</span>}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-moon-200">{fmt(m.total)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-moon-200/70">{fmt(m.sessions)}</td>
                <td className={`py-1.5 pr-2 text-right tabular-nums ${cost(m.total) > 0 ? 'text-blood-400' : 'text-moon-200/50'}`}>
                  {cost(m.total) > 0 ? `≈ ${money(cost(m.total))} $` : '0 $'}
                </td>
                {DAILY_THRESHOLDS.map((t) => (
                  <td key={t} className={`py-1.5 pr-2 text-right tabular-nums ${m.reached[t] ? 'text-moon-200' : 'text-moon-200/30'}`}>
                    {m.reached[t] ? dayLabel(m, m.reached[t] as number) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-moon-200/40">
        Approximation : sessions Daily rattachées au jour où elles démarrent (horodatage à ±15 s), coût au tarif audio ({DAILY_AUDIO_RATE.toString().replace('.', ',')} $/min,
        4 fois plus si une piste vidéo existe). La facture exacte est dans Daily → Billing.
      </p>
    </Card>
  )
}
