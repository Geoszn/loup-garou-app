import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import type { MyGameView } from '../types/game'
import { ErrorText } from './ui'

/** Quel conseil afficher pour cette étape de la partie (null = aucun). */
function tipFor(view: MyGameView): { key: string; text: TranslationKey } | null {
  const { status, night_step: step } = view.game
  if (!view.my_alive) return { key: 'dead', text: 'practice.tip.dead' }
  switch (status) {
    case 'role_reveal':
      return { key: 'role_reveal', text: 'practice.tip.role_reveal' }
    case 'night':
      return step === 'voyante' ? { key: 'night_voyante', text: 'practice.tip.night_voyante' } : { key: 'night_other', text: 'practice.tip.night_other' }
    case 'day_reveal':
      return { key: 'day_reveal', text: 'practice.tip.day_reveal' }
    case 'day_discussion':
      return { key: 'day_discussion', text: 'practice.tip.day_discussion' }
    case 'day_vote':
      return { key: 'day_vote', text: 'practice.tip.day_vote' }
    case 'day_vote_recap':
      return { key: 'day_vote_recap', text: 'practice.tip.day_vote_recap' }
    default:
      return null
  }
}

/**
 * Partie d'entraînement (seul contre des bots) : fait jouer les bots à intervalles réguliers
 * et affiche un conseil à chaque étape, puis un bilan à la fin. Ne fait rien dans une
 * partie normale (la vérification `is_practice_game` est la seule requête qui y part).
 */
export function PracticeAssistant({ view, gameId }: { view: MyGameView; gameId: string }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [practice, setPractice] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = view.game.status
  const step = view.game.night_step
  const night = view.game.night_number

  useEffect(() => {
    let active = true
    supabase.rpc('is_practice_game', { p_game_id: gameId }).then(({ data }) => {
      if (active) setPractice(data === true)
    })
    return () => {
      active = false
    }
  }, [gameId])

  // Les bots jouent leur étape dès qu'elle change, puis toutes les 2,5 s : ils attendent
  // le joueur quand c'est à lui d'agir, et enchaînent dès qu'il a fini.
  useEffect(() => {
    if (!practice || status === 'ended' || status === 'lobby') return
    const tick = () => {
      if (document.visibilityState === 'visible') void supabase.rpc('practice_auto_play', { p_game_id: gameId })
    }
    tick()
    const id = setInterval(tick, 2500)
    return () => clearInterval(id)
  }, [practice, status, step, night, gameId])

  if (!practice) return null

  async function again() {
    if (starting) return
    setStarting(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('start_practice_game')
    setStarting(false)
    if (rpcError || !data) {
      setError(rpcError?.message ?? t('start.practice.error'))
      return
    }
    navigate(`/partie/${(data as { code: string }).code}`)
  }

  if (status === 'ended') {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-moon-400/40 bg-gradient-to-b from-night-700/80 to-night-900/90 p-4 text-center shadow-card">
        <p className="text-3xl" aria-hidden="true">🎓</p>
        <p className="font-display text-lg text-moon-200">{t('practice.end.title')}</p>
        <p className="text-sm text-moon-200/70">{t('practice.end.text')}</p>
        <button
          type="button"
          onClick={() => navigate('/jouer')}
          className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-blood-500 to-blood-700 px-4 py-3 text-sm font-semibold text-[#fdf6e3] shadow-blood-btn transition-all active:scale-[0.97]"
        >
          {t('start.play')}
        </button>
        <button type="button" disabled={starting} onClick={again} className="text-sm text-moon-200/60 transition hover:text-moon-200 disabled:opacity-50">
          {starting ? '…' : t('practice.end.again')}
        </button>
        <ErrorText>{error}</ErrorText>
      </div>
    )
  }

  const tip = tipFor(view)
  const tipKey = tip ? `${tip.key}:${night}:${step ?? ''}` : null
  const showTip = tip && tipKey && !hidden.has(tipKey)

  return (
    <div className="flex flex-col gap-2">
      <p className="mx-auto w-fit rounded-full border border-moon-400/40 bg-moon-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-moon-300">🎓 {t('practice.badge')}</p>
      {showTip && (
        <div className="flex items-start gap-3 rounded-2xl border border-moon-400/50 bg-night-800/95 p-3 shadow-card" role="status">
          <span className="text-2xl" aria-hidden="true">💡</span>
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-moon-200/90">{t(tip.text)}</p>
          <button type="button" onClick={() => setHidden((h) => new Set(h).add(tipKey))} className="shrink-0 rounded-lg border border-night-500 px-2.5 py-1 text-xs font-semibold text-moon-200/80 transition hover:text-moon-200">
            {t('practice.gotIt')}
          </button>
        </div>
      )}
    </div>
  )
}
