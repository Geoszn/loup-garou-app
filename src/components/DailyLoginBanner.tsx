import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'

interface StreakResult {
  streak: number
  best: number
  is_new_day: boolean
}

// 12s plutôt que les 7s d'origine : retour utilisateur (première
// découverte de la fonctionnalité, jamais vue avant) — le temps de lire
// n'importe quel message inconnu pour la première fois est sous-estimé
// quand on écrit soi-même le texte. La bannière entière était aussi
// cliquable pour se fermer, ce qui pouvait la faire disparaître par
// accident au premier tap d'inspection — remplacé par un bouton ✕ explicite
// ci-dessous.
const AUTO_HIDE_MS = 12000

/**
 * Bandeau "verre dépoli" affiché une fois par jour au premier chargement du
 * tableau de bord, annonçant la série de connexion (migration 0110 —
 * distincte de current_streak, qui compte les VICTOIRES d'affilée).
 * claim_daily_login() est idempotente : si le joueur a déjà rechargé la
 * page aujourd'hui, is_new_day revient à false et ce composant reste
 * silencieux. refreshProfile() fait suivre le nouveau login_streak jusqu'au
 * badge d'en-tête permanent (LoginStreakBadge), qui lui reste visible que
 * ce bandeau s'affiche ou non.
 *
 * `hasActiveEvent` : Dashboard.tsx passe `events.length > 0` (voir
 * EventBanner.tsx, rendu juste au-dessus). Un événement est une
 * communication de l'équipe (souvent limitée dans le temps, parfois avec un
 * bonus de points) — elle prime sur cette célébration purement automatique.
 * Empiler les deux bandeaux "verre dépoli" au même style à la fois aurait
 * rendu l'ensemble bruyant et aurait mangé l'écran sur mobile, un problème
 * déjà rencontré une fois sur ce tableau de bord (voir le commentaire sur le
 * rappel "partie en cours" dans Dashboard.tsx). L'appel RPC a quand même
 * lieu (le streak doit progresser et le badge d'en-tête doit se mettre à
 * jour), seul l'affichage du bandeau est sauté ce jour-là — l'info n'est
 * pas perdue, juste pas doublée à l'écran.
 */
export function DailyLoginBanner({ hasActiveEvent = false }: { hasActiveEvent?: boolean }) {
  const { user, refreshProfile } = useAuth()
  const { t } = useLanguage()
  const [result, setResult] = useState<StreakResult | null>(null)
  const claimed = useRef(false)

  useEffect(() => {
    if (!user || claimed.current) return
    claimed.current = true
    supabase
      .rpc('claim_daily_login')
      .then(({ data, error }) => {
        if (error || !data) return
        const r = data as StreakResult
        if (r.is_new_day) {
          setResult(r)
          refreshProfile()
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(null), AUTO_HIDE_MS)
    return () => clearTimeout(timer)
  }, [result])

  if (!result || hasActiveEvent) return null

  // Un palier = record personnel (au moins 3 jours, sinon "record" à 1 ou 2
  // jours n'a pas de sens) : accent rouge (comme les records de victoires)
  // plutôt que le doré par défaut, pour signaler que celui-ci sort du lot.
  const isMilestone = result.streak >= 3 && result.streak === result.best
  const isFirstDay = result.streak === 1

  const headline = isMilestone
    ? t('dailyStreak.milestoneHeadline', { count: result.streak })
    : isFirstDay
      ? t('dailyStreak.newHeadline')
      : t('dailyStreak.headline')
  const sub = isMilestone
    ? t('dailyStreak.milestoneSub')
    : isFirstDay
      ? t('dailyStreak.newSub')
      : t('dailyStreak.sub')

  return (
    <div
      className={`mb-4 flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 backdrop-blur-xl ${
        isMilestone ? 'border-blood-400/35 bg-blood-500/10' : 'border-moon-400/25 bg-moon-400/10'
      }`}
    >
      <span className="shrink-0 text-xl" aria-hidden="true">
        {isMilestone ? '🔥' : '📅'}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] font-bold ${isMilestone ? 'text-blood-400' : 'text-moon-200'}`}>{headline}</p>
        <p className="text-xs text-moon-200/65">{sub}</p>
      </div>
      <div
        className={`flex shrink-0 flex-col items-center rounded-xl border bg-night-950/35 px-3 py-1.5 ${
          isMilestone ? 'border-blood-400/40' : 'border-moon-400/30'
        }`}
      >
        <span
          className={`font-display text-lg font-bold leading-none ${isMilestone ? 'text-blood-400' : 'text-moon-300'}`}
        >
          {result.streak}
        </span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wide text-moon-200/55">{t('dailyStreak.days')}</span>
      </div>
      {/* Bouton de fermeture explicite, dans le flux plutôt qu'en position
          absolue par-dessus le chiffre de série (voir commentaire sur
          AUTO_HIDE_MS ci-dessus) — plutôt que toute la bannière cliquable,
          pour qu'un simple tap d'inspection ne la fasse pas disparaître par
          accident. */}
      <button
        type="button"
        onClick={() => setResult(null)}
        aria-label={t('common.close')}
        className="flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-full text-moon-200/50 transition-colors hover:bg-night-950/30 hover:text-moon-200"
      >
        ✕
      </button>
    </div>
  )
}
