import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { ONBOARDING_TUTORIAL_SEEN, useOnboardingFlags } from '../lib/onboarding'
import { TutorialFlow } from './TutorialFlow'

/** « Comment jouer ? » : ouvre le tutoriel interactif là où l'on en a besoin (page Jouer,
 * salon d'attente), au lieu de le cacher dans le menu Aide.
 *
 * `compact` : une simple icône (en-tête étroit d'un téléphone). `stayHere` : à la fin du
 * tutoriel on revient simplement à la page (salon d'attente) au lieu d'aller sur « Jouer ». */
export function HowToPlayButton({ className = '', compact = false, stayHere = false }: { className?: string; compact?: boolean; stayHere?: boolean }) {
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
        aria-label={t('play.howTo')}
        className={
          compact
            ? `flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-moon-400/40 bg-moon-400/10 text-xl transition-colors hover:bg-moon-400/20 ${className}`
            : `inline-flex items-center gap-1.5 rounded-full border border-moon-400/40 bg-moon-400/10 px-3 py-1.5 text-xs font-semibold text-moon-300 transition-colors hover:bg-moon-400/20 ${className}`
        }
      >
        <span aria-hidden="true">🎬</span>
        {!compact && t('play.howTo')}
      </button>
      {open && (
        <TutorialFlow
          onClose={() => setOpen(false)}
          playLabel={stayHere ? t('tuto.backToPage') : undefined}
          onPlay={() => {
            setOpen(false)
            if (!stayHere) navigate(session ? '/jouer' : '/inscription')
          }}
        />
      )}
    </>
  )
}
