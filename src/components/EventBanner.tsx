import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import type { EventBannerColor, GameEvent } from '../types/events'

// Un bandeau de couleur par événement (voir migration 0067) — pas de fond
// lié au thème jour/nuit ici : ni Landing.tsx ni Dashboard.tsx n'ont de
// thème jour/nuit (contrairement à GameRoom), donc pas besoin des variantes
// night-*/moon-400 spécifiques.
//
// Retour utilisateur : rendu "verre dépoli" (fond très translucide +
// backdrop-blur, bordure fine quasi-blanche) plutôt que le dégradé opaque
// d'avant — style que l'admin a explicitement demandé de rapprocher du
// "liquid glass" actuellement très présent chez Apple (iOS 18/26, widgets,
// Dynamic Island...). La teinte de l'événement reste présente mais en fond
// diffus très léger, pas en aplat franc.
const BANNER_STYLES: Record<EventBannerColor, string> = {
  gold: 'border-moon-400/25 bg-moon-400/10',
  blood: 'border-blood-500/25 bg-blood-600/10',
  emerald: 'border-emerald-500/25 bg-emerald-600/10',
  violet: 'border-violet-500/25 bg-violet-600/10',
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
      <span className="shrink-0 text-base" aria-hidden="true">
        {started ? '🎉' : '🔜'}
      </span>
      {/* `truncate` plutôt que le retour à la ligne forcé d'avant (qui
          empilait icône / texte / badges sur 3 lignes et rendait tout le
          bandeau démesurément haut sur mobile) — le texte tient toujours sur
          une seule ligne, quitte à finir en points de suspension, pour que
          la bande garde une hauteur compacte et constante. */}
      <p className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-moon-200 sm:text-sm">{text}</p>
      <div className="flex shrink-0 items-center gap-1.5">
        {bonusBadge && (
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] font-bold text-moon-200 backdrop-blur-sm">
            {bonusBadge}
          </span>
        )}
        <span className="whitespace-nowrap rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-moon-200/80 backdrop-blur-sm">
          {started ? '⏳' : PREVIEW_LABEL[lang]} {formatRemaining(remaining)}
        </span>
      </div>
    </>
  )

  return (
    // Style "verre dépoli" (voir BANNER_STYLES) : fond très translucide +
    // flou du fond derrière, bordure fine quasi-blanche plutôt qu'un aplat
    // de couleur franc — inspiré du "liquid glass" iOS.
    <div className={`relative mb-4 overflow-hidden rounded-2xl border backdrop-blur-xl ${BANNER_STYLES[event.banner_color]}`}>
      {/* L'image, quand il y en a une, reste sur sa propre ligne et
          entièrement visible (rien superposé dessus, voir retour
          utilisateur précédent) — seule la bande de légende juste en
          dessous porte le style verre, en une seule ligne compacte plutôt
          que le bloc haut d'avant qui "remplissait tout l'écran" sur mobile. */}
      {imageUrl && (
        <div className="aspect-[3/1] w-full">
          <img src={imageUrl} alt="" className="h-full w-full object-cover object-center" aria-hidden="true" />
        </div>
      )}
      <div className="relative flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">{content}</div>
    </div>
  )
}
