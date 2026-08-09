import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import type { EventBannerColor, GameEvent } from '../types/events'

// Un bandeau de couleur par événement (voir migration 0067) — pas de fond
// lié au thème jour/nuit ici : Landing.tsx n'a qu'un seul thème (contrairement
// à GameRoom), donc pas besoin des variantes night-*/moon-400 spécifiques.
const BANNER_STYLES: Record<EventBannerColor, string> = {
  gold: 'border-moon-400/50 bg-gradient-to-r from-moon-400/15 via-moon-400/5 to-transparent',
  blood: 'border-blood-500/50 bg-gradient-to-r from-blood-600/25 via-blood-600/5 to-transparent',
  emerald: 'border-emerald-500/50 bg-gradient-to-r from-emerald-600/25 via-emerald-600/5 to-transparent',
  violet: 'border-violet-500/50 bg-gradient-to-r from-violet-600/25 via-violet-600/5 to-transparent',
}

export function EventBanner({ event }: { event: GameEvent }) {
  const { lang } = useLanguage()
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
      <div className="relative flex items-center gap-3 px-4 py-3 sm:px-5">
        <span className="text-xl" aria-hidden="true">
          🎉
        </span>
        <p className="flex-1 text-left text-sm font-semibold text-moon-200">{text}</p>
        {bonusBadge && (
          <span className="shrink-0 rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold text-moon-200">{bonusBadge}</span>
        )}
      </div>
    </div>
  )
}
