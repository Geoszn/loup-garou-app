import type { ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import type { VoiceSession } from './VoiceChat'

// Barre d'actions du chat plein écran (jour et nuit), posée juste au-dessus de la bulle d'écriture, sous le pouce : micro,
// vote, joueurs, rôle, journal. Chaque action a un LIBELLÉ sous son icône (les joueurs ne retrouvaient pas des icônes
// seules) ; micro et vote portent en plus leur ÉTAT en couleur pleine (vert = micro ouvert, rouge = coupé...).

export type TabTone = 'idle' | 'gold' | 'ready' | 'on' | 'off' | 'warn' | 'join'

// Fonds pleins pour les états : lisibles aussi bien en thème de jour que de nuit.
const TONE: Record<TabTone, string> = {
  idle: 'border-night-600 bg-night-800 text-moon-200',
  // Or plein (texte brun fixe) : action à faire / déjà faite ; lisible en jour comme en nuit.
  gold: 'border-amber-500 bg-amber-400 text-[#2b1b00]',
  ready: 'border-amber-500 bg-amber-400 text-[#2b1b00]',
  on: 'border-emerald-600 bg-emerald-600 text-white',
  off: 'border-blood-600 bg-blood-600 text-[#fdf6e3]',
  warn: 'border-amber-500 bg-amber-500 text-night-950',
  join: 'border-dashed border-moon-400 bg-night-800 text-moon-200',
}

export function ActionTab({
  icon,
  label,
  tone = 'idle',
  onClick,
  disabled,
  badge,
  badgeAlert = false,
  dot,
  pulse,
  wide,
  ariaLabel,
  ariaPressed,
  title,
}: {
  icon: ReactNode
  label: string
  tone?: TabTone
  onClick?: () => void
  disabled?: boolean
  /** Compte affiché en pastille (ex. 3/7 accords pour voter, messages non lus). */
  badge?: string | number
  /** Pastille rouge (non lus) plutôt que neutre (simple compte, ex. 3/7). */
  badgeAlert?: boolean
  /** Simple point rouge « du nouveau ». */
  dot?: boolean
  pulse?: boolean
  /** Un peu plus large (micro, vote) : leur libellé est plus long. */
  wide?: boolean
  ariaLabel?: string
  ariaPressed?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      aria-pressed={ariaPressed}
      title={title}
      className={`relative flex h-[46px] min-w-0 ${wide ? 'flex-[1.4]' : 'flex-1'} flex-col items-center justify-center gap-[3px] rounded-2xl border px-1 text-[10px] font-semibold leading-none shadow-sm transition-colors active:scale-95 disabled:opacity-50 ${TONE[tone]} ${pulse ? 'animate-pulse' : ''}`}
    >
      <span className="flex h-[18px] items-center text-[17px] leading-none" aria-hidden="true">
        {icon}
      </span>
      <span className="max-w-full truncate">{label}</span>
      {badge !== undefined && (
        <span
          className={`absolute -right-1 -top-1.5 min-w-[18px] rounded-full px-1 text-center text-[9px] font-bold leading-[18px] tabular-nums ring-1 ${
            badgeAlert ? 'bg-blood-600 text-[#fdf6e3] ring-night-950/40' : 'bg-night-900 text-moon-200 ring-moon-400/60'
          }`}
        >
          {badge}
        </span>
      )}
      {dot && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-950 bg-blood-500" />}
    </button>
  )
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="pointer-events-auto flex items-stretch gap-1.5 px-3">{children}</div>
}

function MicIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" strokeWidth="2.4" />}
    </svg>
  )
}

/** Le micro, avec son état en toutes lettres : rejoindre, connexion, écoute seule, micro ouvert (vert), micro coupé (rouge barré). */
export function MicTab({ session, listenOnly }: { session: VoiceSession; listenOnly: boolean }) {
  const { t } = useLanguage()
  if (!session.channel) return null
  if (!session.joined) {
    return <ActionTab wide tone="join" icon={<MicIcon />} label={t('actionBar.mic.join')} ariaLabel={t('dayLayout.mic.join')} onClick={() => session.setJoined(true)} />
  }
  if (session.connecting) {
    return (
      <ActionTab
        wide
        tone="warn"
        icon={<span className="h-4 w-4 animate-spin rounded-full border-2 border-night-950/30 border-t-night-950" />}
        label={t('actionBar.mic.connecting')}
        ariaLabel={t('voiceChat.connecting')}
      />
    )
  }
  if (!session.connected) {
    return <ActionTab wide tone="warn" icon="⚠️" label={t('actionBar.mic.retry')} ariaLabel={t('voiceChat.retry')} title={session.error ?? undefined} onClick={session.retry} />
  }
  if (listenOnly) {
    return <ActionTab wide icon="🎧" label={t('actionBar.mic.listen')} ariaLabel={t('dayLayout.mic.listen')} />
  }
  return (
    <ActionTab
      wide
      tone={session.muted ? 'off' : 'on'}
      pulse={!session.muted && session.selfSpeaking}
      icon={<MicIcon off={session.muted} />}
      label={session.muted ? t('actionBar.mic.off') : t('actionBar.mic.on')}
      ariaLabel={session.muted ? t('dayLayout.mic.off') : t('dayLayout.mic.on')}
      ariaPressed={!session.muted}
      onClick={session.toggleMute}
    />
  )
}
