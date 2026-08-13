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

// Texte du petit badge "aperçu" — la bannière peut désormais être visible
// avant même le début officiel de l'événement (voir preview_starts_at,
// migration 0075), un cas que ce composant n'affichait pas du tout avant :
// pas de traduction complète via i18n/translations.ts pour ces deux mots,
// mais un simple repli bilingue local, même principe que le repli FR/EN déjà
// utilisé juste en dessous pour banner_text_fr/en.
const PREVIEW_LABEL: Record<'fr' | 'en', string> = { fr: 'Bientôt', en: 'Coming soon' }

/** Compte à rebours en deux phases : tant que l'événement n'a pas
 * officiellement commencé (now < starts_at), vers son DÉBUT ; une fois
 * commencé, vers sa FIN, comme avant. `onEnd` (facultatif) n'est appelé
 * qu'une fois que la vraie fin (ends_at) est atteinte — pas à la bascule
 * aperçu → actif, qui ne fait que changer l'affichage local sans que la
 * bannière doive disparaître ni se recharger depuis le serveur. */
function useEventCountdown(startsAt: string, endsAt: string, onEnd?: () => void) {
  const startMs = new Date(startsAt).getTime()
  const endMs = new Date(endsAt).getTime()

  function computePhase() {
    const now = Date.now()
    const started = now >= startMs
    return { started, remaining: (started ? endMs : startMs) - now }
  }

  const [state, setState] = useState(computePhase)

  useEffect(() => {
    let ended = false
    const tick = () => {
      const next = computePhase()
      setState(next)
      if (next.started && next.remaining <= 0 && !ended) {
        ended = true
        onEnd?.()
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startsAt, endsAt])

  return state
}

export function EventBanner({ event, onExpire }: { event: GameEvent; onExpire?: () => void }) {
  const { lang } = useLanguage()
  const { started, remaining } = useEventCountdown(event.starts_at, event.ends_at, onExpire)
  // Retombe sur l'autre langue si celle du joueur n'a pas été renseignée par
  // l'admin, plutôt que d'afficher un bandeau vide.
  const text = (lang === 'fr' ? event.banner_text_fr : event.banner_text_en) || event.banner_text_fr || event.banner_text_en
  if (!text) return null

  // Même repli que le texte juste au-dessus (voir migration 0076) : une
  // image anglaise dédiée si elle existe, sinon l'image FR/par défaut —
  // jamais de bannière sans image simplement parce que l'admin n'a importé
  // qu'une seule version.
  const imagePath = (lang === 'en' ? event.banner_image_path_en : event.banner_image_path) || event.banner_image_path || event.banner_image_path_en
  const imageUrl = imagePath ? supabase.storage.from('event-banners').getPublicUrl(imagePath).data.publicUrl : null

  // Le bonus de points ne s'active qu'à partir du vrai début (apply_rank_result
  // ne regarde que starts_at/ends_at, jamais preview_starts_at) — l'annoncer
  // pendant l'aperçu induirait en erreur (donnerait l'impression qu'il compte
  // déjà) : masqué tant que `started` est faux.
  const bonusBadge =
    started && event.bonus_type === 'multiplier'
      ? `×${event.bonus_value}`
      : started && event.bonus_type === 'flat'
        ? `+${event.bonus_value}`
        : null

  const content = (
    <>
      <span className="text-xl" aria-hidden="true">
        {started ? '🎉' : '🔜'}
      </span>
      <p className="min-w-0 flex-1 basis-full text-left text-sm font-semibold text-moon-200 sm:basis-auto">{text}</p>
      <div className="flex shrink-0 items-center gap-2">
        {bonusBadge && (
          <span className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold text-moon-200">{bonusBadge}</span>
        )}
        <span className="whitespace-nowrap rounded-full bg-black/20 px-2.5 py-1 text-[11px] text-moon-200/80">
          {started ? '⏳' : PREVIEW_LABEL[lang]} {formatRemaining(remaining)}
        </span>
      </div>
    </>
  )

  return (
    <div className={`relative mb-4 overflow-hidden rounded-2xl border backdrop-blur-sm ${BANNER_STYLES[event.banner_color]}`}>
      {/* Retour utilisateur : le texte (légende + badges) superposé EN BAS de
          l'image sur un dégradé cachait une partie du visuel importé sur
          mobile — d'autant plus gênant que ces images contiennent souvent
          déjà leur propre titre dessiné (ex. "LE WEEKEND DES ROIS"), donc le
          texte se retrouvait à recouvrir un autre texte. L'image occupe
          maintenant sa propre ligne, entièrement visible, sans rien dessus ;
          la légende + le compte à rebours vivent dans une bande séparée en
          dessous, sur le fond de couleur de l'événement (jamais sur l'image
          elle-même) — plus de conflit possible quelle que soit la taille de
          l'écran ou le contenu de l'image. */}
      {imageUrl && (
        <div className="aspect-[3/1] w-full">
          <img src={imageUrl} alt="" className="h-full w-full object-cover object-center" aria-hidden="true" />
        </div>
      )}
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:flex-nowrap sm:px-5">{content}</div>
    </div>
  )
}
