import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { cachedRpc } from '../lib/rpcCache'
import { supabase } from '../lib/supabase'
import { ONBOARDING_DISMISSED, ONBOARDING_PRACTICE_DONE, ONBOARDING_TUTORIAL_SEEN, useOnboardingFlags } from '../lib/onboarding'
import { useMyAvatarConfig } from './AvatarEditor'
import { TutorialFlow } from './TutorialFlow'
import { ErrorText } from './ui'

/**
 * « Bien démarrer » : en haut de l'accueil d'un joueur qui n'a encore joué aucune vraie
 * partie. Trois étapes qui se cochent d'elles-mêmes (tutoriel, avatar, partie
 * d'entraînement contre des bots), puis le bouton pour jouer une vraie partie. Disparaît
 * dès la première vraie partie, ou quand on la masque.
 */
export function GettingStartedCard() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { flags, mark } = useOnboardingFlags()
  const myAvatar = useMyAvatarConfig()
  const [played, setPlayed] = useState<number | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    cachedRpc<{ games_played: number }>('get_my_stats').then(({ data }) => {
      if (active) setPlayed(data?.games_played ?? 0)
    })
    return () => {
      active = false
    }
  }, [])

  if (!flags || played === null || !myAvatar.loaded) return null
  if (played > 0 || flags.has(ONBOARDING_DISMISSED)) return null

  const steps = [
    { id: 'tuto', icon: '🎬', done: flags.has(ONBOARDING_TUTORIAL_SEEN), title: t('start.tuto.title'), sub: t('start.tuto.sub'), go: () => { setTutorialOpen(true); mark(ONBOARDING_TUTORIAL_SEEN) } },
    { id: 'avatar', icon: '🎭', done: !!myAvatar.config, title: t('start.avatar.title'), sub: t('start.avatar.sub'), go: () => navigate('/compte?avatar=1') },
    { id: 'practice', icon: '🐺', done: flags.has(ONBOARDING_PRACTICE_DONE), title: t('start.practice.title'), sub: t('start.practice.sub'), go: () => void startPractice() },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const current = steps.find((s) => !s.done)

  async function startPractice() {
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

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-moon-400/40 bg-gradient-to-b from-night-700/80 to-night-900/90 p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg text-moon-200">{t('start.title')}</p>
          <p className="text-xs text-moon-200/55">{t('start.progress', { done: doneCount, total: steps.length })}</p>
        </div>
        <button type="button" onClick={() => mark(ONBOARDING_DISMISSED)} className="shrink-0 rounded-lg px-2 py-1 text-xs text-moon-200/50 transition hover:text-moon-200">
          {t('start.dismiss')}
        </button>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-night-800">
        <div className="h-full rounded-full bg-gradient-to-r from-moon-400 to-amber-300 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ul className="flex flex-col gap-2">
        {steps.map((s) => {
          const isCurrent = current?.id === s.id
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={s.go}
                disabled={starting && s.id === 'practice'}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${isCurrent ? 'border-moon-400/60 bg-moon-400/10' : 'border-night-600/60 bg-night-900/50'} ${s.done ? 'opacity-60' : ''}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${s.done ? 'bg-emerald-500/25 text-emerald-300' : 'bg-night-800'}`} aria-hidden="true">
                  {s.done ? '✓' : s.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${s.done ? 'text-moon-200/70 line-through' : 'text-moon-200'}`}>{s.title}</span>
                  <span className="block text-[11px] text-moon-200/55">{s.sub}</span>
                </span>
                {!s.done && <span className="shrink-0 text-xs font-semibold text-moon-300">{starting && s.id === 'practice' ? '…' : t('start.go')} ›</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => navigate('/jouer')}
        className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-blood-500 to-blood-700 px-4 py-3 text-sm font-semibold text-[#fdf6e3] shadow-blood-btn transition-all active:scale-[0.97]"
      >
        {t('start.play')}
      </button>
      <ErrorText>{error}</ErrorText>

      {tutorialOpen && (
        <TutorialFlow
          onClose={() => setTutorialOpen(false)}
          onPlay={() => {
            setTutorialOpen(false)
            navigate('/jouer')
          }}
        />
      )}
    </div>
  )
}
