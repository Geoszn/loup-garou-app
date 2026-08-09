import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import type { EventBannerColor, GameEvent } from '../types/events'

// Un bandeau de couleur par événement (voir migration 0067) — pas de fond
// lié au thème jour/nuit ici : ni Landing.tsx ni Dashboard.tsx n'ont de
// thème jour/nuit (contrairement à GameRoom), donc pas besoin des variantes
// night-*/moon-400 spécifiques.
const BANNER_STYLES: Record<EventBannerColor, string> = {
  gold: 'border-moon-400/50 bg-gradient-to-r from-moon-400/15 via-moon-400/5 to-transparent',
  blood: 'border-blood-500/50 bg-gradient-to-r from-blood-600/25 via-blood-600/5 to-transparent',
  emerald: 'border-emerald-500/50 bg-gradient-to-r from-emerald-600/25 via-emerald-600/5 to-transparent',
  violet: 'border-violet-500/50 bg-gradient-to-r from-violet-600/25 via-violet-600/5 to-transparent',
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  // Au-delà d'un jour, la seconde près n'a pas d'intérêt — on affiche
  // "2j 04h12" plutôt qu'un décompte à la seconde qui ne bougerait
  // visiblement qu'une fois par minute de toute façon.
  if (days > 0) return `${days}j ${pad(hours)}h${pad(minutes)}`
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** Compte à rebours jusqu'à `endsAt`, remis à jour chaque seconde.
 * `onExpire` (facultatif) est appelé une fois dès que le temps restant
 * atteint zéro — utilisé pour forcer un refresh immédiat de la liste des
 * événements actifs (voir useActiveEvents) plutôt que d'attendre jusqu'à
 * 30s que le polling normal fasse disparaître la bannière tout seul. */
function useCountdown(endsAt: string, onExpire?: () => void) {
  const [remaining, setRemaining] = useState(() => new Date(endsAt).getTime() - Date.now())

  useEffect(() => {
    let expired = false
    const tick = () => {
      const next = new Date(endsAt).getTime() - Date.now()
      setRemaining(next)
      if (next <= 0 && !expired) {
        expired = true
        onExpire?.()
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt])

  return remaining
}

export function EventBanner({ event, onExpire }: { event: GameEvent; onExpire?: () => void }) {
  const { lang } = useLanguage()
  const remaining = useCountdown(event.ends_at, onExpire)
  // Retombe sur l'autre langue si celle du joueur n'a pas été renseignée par
  // l'admin, plutôt que d'afficher un bandeau vide.
  const text = (lang === 'fr' ? event.banner_text_fr : event.banner_text_en) || event.banner_text_fr || event.banner_text_en
  if (!text) return null

  const imageUrl = event.banner_image_path
    ? supabase.storage.from('event-banners').getPublicUrl(event.banner_image_path).data.publicUrl
    : null

  const bonusBadge =
    event.bonus_type === 'multiplier' ? `×${event.bonus_value}` : event.bonus_type === 'flat' ? `+${event.bonus_value}` : null

  return (
    <div className={`relative mb-4 overflow-hidden rounded-2xl border backdrop-blur-sm ${BANNER_STYLES[event.banner_color]}`}>
      {imageUrl && (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" aria-hidden="true" />
      )}
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:flex-nowrap sm:px-5">
        <span className="text-xl" aria-hidden="true">
          🎉
        </span>
        <p className="min-w-0 flex-1 basis-full text-left text-sm font-semibold text-moon-200 sm:basis-auto">{text}</p>
        <div className="flex shrink-0 items-center gap-2">
          {bonusBadge && (
            <span className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold text-moon-200">{bonusBadge}</span>
          )}
          <span className="whitespace-nowrap rounded-full bg-black/20 px-2.5 py-1 text-[11px] text-moon-200/80">
            ⏳ {formatRemaining(remaining)}
          </span>
        </div>
      </div>
    </div>
  )
}
