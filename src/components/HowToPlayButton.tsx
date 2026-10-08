import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { ONBOARDING_TUTORIAL_SEEN, useOnboardingFlags } from '../lib/onboarding'
import { TutorialFlow } from './TutorialFlow'

/** « Comment jouer ? » : ouvre le tutoriel interactif là où l'on en a besoin (page Jouer,
 * salon d'attente), au lieu de le cacher dans le menu Aide. */
export function HowToPlayButton({ className = '' }: { className?: string }) {
  const { t } = useLanguage()
  const { session } = useAuth()
  const navigate = useNavigate()
  const { mark } = useOnboardingFlags()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          mark(ONBOARDING_TUTORIAL_SEEN)
        }}
        className={`inline-flex items-center gap-1.5 rounded-full border border-moon-400/40 bg-moon-400/10 px-3 py-1.5 text-xs font-semibold text-moon-300 transition-colors hover:bg-moon-400/20 ${className}`}
      >
        <span aria-hidden="true">🎬</span>
        {t('play.howTo')}
      </button>
      {open && (
        <TutorialFlow
          onClose={() => setOpen(false)}
          onPlay={() => {
            setOpen(false)
            navigate(session ? '/jouer' : '/inscription')
          }}
        />
      )}
    </>
  )
}
