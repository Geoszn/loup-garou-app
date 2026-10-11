import { useEffect, useState, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useVoiceSession, type VoiceSession } from './VoiceChat'
import type { VoiceChannel } from '../hooks/useVoiceChat'
import type { MyGameView, PublicPlayer } from '../types/game'
import { Avatar } from './Avatar'
import { ChatPanel } from './ChatPanel'

// Écran de débat (jour) : une carte vocale arrondie, fixe, posée en haut du chat écrit (même cadre) ; seuls les messages
// défilent en dessous. Le micro et « Voter » sont dans la barre d'écriture. Palette du jeu : or, terre cuite, brun savane.

/** Bandeau tissé (esprit kente) au sommet de la carte vocale. */
const WOVEN_BAND = 'repeating-linear-gradient(90deg, #e0a84a 0 14px, #9c331f 14px 28px, #3a2a1c 28px 42px, #c98a1a 42px 56px)'

const speakingOf = (session: VoiceSession, p: { id: string; sessionIds: string[] } | undefined, isSelf: boolean) =>
  isSelf ? session.selfSpeaking : !!p && p.sessionIds.some((id) => session.speakingIds.has(id))

/** Trois petites barres animées : « ça parle ». */
function SoundBars({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex h-3 items-end gap-[2px] ${className}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="voice-bar w-[3px] rounded-full bg-moon-400" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  )
}

/** Le bouton micro : rejoint le vocal, puis coupe / rend la parole. */
export function MicButton({ session, listenOnly }: { session: VoiceSession; listenOnly: boolean }) {
  const { t } = useLanguage()
  if (!session.channel) return null
  const base = 'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl shadow-md transition-transform active:scale-95'
  if (!session.joined) {
    return (
      <button type="button" onClick={() => session.setJoined(true)} aria-label={t('dayLayout.mic.join')} title={t('dayLayout.mic.join')} className={`${base} border-2 border-moon-400/60 bg-moon-400/10 text-moon-300`}>
        🎙️
      </button>
    )
  }
  if (session.connecting) {
    return (
      <span className={`${base} bg-night-700 text-moon-200`} aria-label={t('voiceChat.connecting')}>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-moon-200/30 border-t-moon-200" />
      </span>
    )
  }
  if (!session.connected) {
    return (
      <button type="button" onClick={session.retry} aria-label={t('voiceChat.retry')} title={session.error ?? t('voiceChat.retry')} className={`${base} bg-amber-500/80 text-night-950`}>
        ⚠️
      </button>
    )
  }
  if (listenOnly) {
    return (
      <span className={`${base} bg-night-700 text-moon-200/60`} title={t('dayLayout.mic.listen')} aria-label={t('dayLayout.mic.listen')}>
        🎧
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={session.toggleMute}
      aria-pressed={!session.muted}
      aria-label={session.muted ? t('dayLayout.mic.off') : t('dayLayout.mic.on')}
      title={session.muted ? t('dayLayout.mic.off') : t('dayLayout.mic.on')}
      className={`${base} ${session.muted ? 'bg-blood-700 text-[#fdf6e3]' : 'bg-gradient-to-b from-moon-400 to-[#c98a1a] text-night-950'} ${!session.muted && session.selfSpeaking ? 'ring-4 ring-moon-400/40' : ''}`}
    >
      {session.muted ? '🔇' : '🎤'}
    </button>
  )
}

/** Bande vocale : les visages des joueurs, celui qui parle s'allume ; les absents du vocal sont atténués. */
function VoiceBand({ session, players, selfId, listenOnly }: { session: VoiceSession; players: PublicPlayer[]; selfId: string; listenOnly: boolean }) {
  const { t } = useLanguage()
  const byId = new Map(session.participants.map((p) => [p.id, p]))
  const alive = players.filter((p) => p.is_alive)
  const inVoiceCount = session.connected ? alive.filter((p) => p.user_id === selfId || byId.has(p.user_id)).length : session.othersInVoice.length
  const speakers = session.connected ? alive.filter((p) => speakingOf(session, byId.get(p.user_id), p.user_id === selfId)) : []

  let status: ReactNode
  if (speakers.length > 0) {
    status = (
      <span className="flex min-w-0 items-center gap-1.5 text-moon-300">
        <SoundBars />
        <span className="min-w-0 truncate">{speakers.map((p) => (p.user_id === selfId ? t('dayLayout.me') : p.display_name)).join(', ')}</span>
      </span>
    )
  } else if (session.joined) {
    status = session.connected ? t('dayLayout.inVoice', { count: inVoiceCount }) : session.connecting ? t('voiceChat.connecting') : (session.error ?? t('voiceChat.unavailable'))
  } else {
    status = session.othersInVoice.length > 0 ? `🎙️ ${t('voiceChat.inVoice', { count: session.othersInVoice.length })}` : t('voiceChat.idle')
  }

  return (
    <div className="mx-2.5 mb-1 mt-2.5 shrink-0 overflow-hidden rounded-2xl bg-night-900 shadow-md ring-1 ring-moon-400/45">
      <div aria-hidden="true" className="h-1.5" style={{ background: WOVEN_BAND }} />
      <div className="bg-gradient-to-b from-moon-400/20 to-blood-600/10 px-2.5 pb-1.5 pt-2">
      <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] font-semibold text-moon-300">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full bg-moon-400/20 px-2 py-0.5 text-[9px] tracking-widest">🎙️ {t('dayLayout.voiceLabel')}</span>
          <span className="min-w-0 truncate">{status}</span>
        </span>
        {session.joined && (
          <span className="flex shrink-0 items-center gap-1">
            {session.connected && (
              <button type="button" onClick={session.toggleSound} aria-label={session.deafened ? t('voiceChat.soundOffTitle') : t('voiceChat.soundOnTitle')} className="flex h-8 w-8 items-center justify-center rounded-full bg-night-800/80 text-xs">
                {session.deafened ? '🔇' : '🔊'}
              </button>
            )}
            <button type="button" onClick={() => session.setJoined(false)} aria-label={t('dayLayout.leaveVoice')} title={t('dayLayout.leaveVoice')} className="flex h-8 items-center justify-center rounded-full bg-night-800/80 px-2.5 text-[10px] font-semibold text-moon-200/70">
              ✕ {t('dayLayout.leaveVoiceShort')}
            </button>
          </span>
        )}
        {!session.joined && listenOnly && <span className="shrink-0 text-[10px] font-normal">{t('voiceChat.listenOnly')}</span>}
      </div>

      <div className="mt-1.5 flex gap-1.5 overflow-x-auto px-2 pb-1 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {alive.map((p) => {
          const isSelf = p.user_id === selfId
          const part = byId.get(p.user_id)
          const speaking = speakingOf(session, part, isSelf)
          const present = !session.connected || isSelf || !!part
          const silenced = session.connected && (isSelf ? session.muted : !!part && !part.audioOn)
          return (
            <div key={p.user_id} className={`relative flex min-w-[2.5rem] max-w-[3.25rem] flex-1 flex-col items-center gap-1 transition-all duration-200 ${present ? '' : 'opacity-35 grayscale'}`}>
              <div className={`relative w-full px-0.5 transition-transform duration-200 ${speaking ? 'scale-110' : ''}`}>
                <Avatar
                  config={p.avatar_config}
                  icon={p.avatar_icon}
                  color={p.avatar_color}
                  name={p.display_name}
                  mood={speaking ? 'talk' : 'smile'}
                  className={`aspect-square h-auto w-full rounded-full ${speaking ? 'ring-[3px] ring-moon-400 shadow-[0_0_14px_rgba(224,168,74,0.8)]' : 'ring-1 ring-night-600'}`}
                />
                {speaking && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-night-950 px-1 py-0.5 ring-1 ring-moon-400/60">
                    <SoundBars />
                  </span>
                )}
                {silenced && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blood-700 text-[9px] ring-1 ring-night-950">🔇</span>}
                {session.canModerate && part && part.audioOn && !isSelf && (
                  <button
                    type="button"
                    onClick={() => session.muteParticipant(part.sessionIds)}
                    title={t('voiceChat.muteParticipantTitle', { name: p.display_name })}
                    className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blood-700/90 text-[9px] ring-1 ring-night-950"
                  >
                    🔇
                  </button>
                )}
              </div>
              <span className={`w-full truncate text-center text-[10px] leading-none ${speaking ? 'font-bold text-moon-300' : isSelf ? 'font-semibold text-moon-200/80' : 'text-moon-200/60'}`}>
                {isSelf ? t('dayLayout.me') : p.display_name}
              </span>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

function ChannelToggle({ channel, onChange, unreadAmoureux }: { channel: 'village' | 'amoureux'; onChange: (c: 'village' | 'amoureux') => void; unreadAmoureux: number }) {
  const { t } = useLanguage()
  return (
    <div className="flex shrink-0 gap-1 text-[11px] font-semibold normal-case tracking-normal">
      <button type="button" onClick={() => onChange('village')} className={`rounded-full px-3 py-1 ${channel === 'village' ? 'bg-night-600 text-moon-200' : 'bg-night-800/70 text-moon-200/60'}`}>
        💬 {t('dayLayout.village')}
      </button>
      <button type="button" onClick={() => onChange('amoureux')} className={`relative rounded-full px-3 py-1 ${channel === 'amoureux' ? 'bg-night-600 text-moon-200' : 'bg-night-800/70 text-moon-200/60'}`}>
        💘 {t('dayLayout.lovers')}
        {unreadAmoureux > 0 && channel !== 'amoureux' && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blood-600 px-1 text-center text-[9px] leading-4 text-[#fdf6e3]">{unreadAmoureux}</span>}
      </button>
    </div>
  )
}

interface Props {
  view: MyGameView
  gameId: string
  code: string
  selfId: string
  me: PublicPlayer | undefined
  voiceChannel: VoiceChannel
  /** Le bouton « Voter » (pastille CallVotePanel). */
  vote: ReactNode
  unreadAmoureux: number
}

export function DayDiscussion({ view, gameId, code, selfId, me, voiceChannel, vote, unreadAmoureux }: Props) {
  const { t } = useLanguage()
  const listenOnly = !!view.village_muted
  const session = useVoiceSession({ gameId, code, channel: voiceChannel, displayName: me?.display_name ?? t('common.playerFallback'), selfUserId: selfId, listenOnly })
  const [channel, setChannel] = useState<'village' | 'amoureux'>('village')
  useEffect(() => {
    if (!view.lover_id) setChannel('village')
  }, [view.lover_id])

  return (
    <div className="flex h-[calc(100dvh-6rem-var(--nav-h,0px))] min-h-[26rem] flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-night-600/60 bg-night-900/50 shadow-card">
        <VoiceBand session={session} players={view.players} selfId={selfId} listenOnly={listenOnly} />
        {view.lover_id && (
          <div className="flex shrink-0 justify-end px-3 pb-1">
            <ChannelToggle channel={channel} onChange={setChannel} unreadAmoureux={unreadAmoureux} />
          </div>
        )}
        <ChatPanel
          fill
          hideHeader
          embedded
          players={view.players}
          gameId={gameId}
          channel={channel}
          selfId={selfId}
          readOnly={channel === 'village' && listenOnly}
          note={channel === 'village' && listenOnly ? t('game.villageMutedNote') : undefined}
          composerLead={<MicButton session={session} listenOnly={listenOnly} />}
          composerTrail={vote}
        />
      </div>
    </div>
  )
}
