import { useLanguage } from '../i18n/LanguageContext'
import { useAmbientMusicEnabled } from '../lib/ambientMusic'

/** Bouton rond pour couper ou remettre la musique d'ambiance (réglage mémorisé). */
export function MusicToggle({ className = '' }: { className?: string }) {
  const { t } = useLanguage()
  const [on, toggle] = useAmbientMusicEnabled()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? t('music.turnOff') : t('music.turnOn')}
      title={on ? t('music.turnOff') : t('music.turnOn')}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base transition-colors ${on ? 'border-moon-400/50 bg-moon-400/10 text-moon-300' : 'border-night-600 bg-night-800/60 text-moon-200/50'} ${className}`}
    >
      <span aria-hidden="true">{on ? '🎵' : '🔇'}</span>
    </button>
  )
}
