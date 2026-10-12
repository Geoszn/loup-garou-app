import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useVoiceSession, type VoiceSession } from './VoiceChat'
import type { VoiceChannel } from '../hooks/useVoiceChat'
import type { MyGameView, PublicPlayer } from '../types/game'
import { Avatar } from './Avatar'
import { BottomSheet } from './BottomSheet'
import { ChatPanel } from './ChatPanel'

// Écran de débat (jour), plein écran : le chat n'a plus de cadre, il occupe tout l'espace sous la barre de phase
// et seule la bulle d'écriture (micro, texte, envoyer, voter) flotte au-dessus de la barre du bas. Le vocal est une
// rangée de visages fondue en haut du chat ; le journal de la partie s'écrit dans le fil des messages ; joueurs,
// rôle et réglages du vocal vivent dans des tiroirs. Palette du jeu : or, terre cuite, brun savane.

const speakingOf = (session: VoiceSession, p: { id: string; sessionIds: string[] } | undefined, isSelf: boolean) =>
  isSelf ? session.selfSpeaking : !!p && p.sessionIds.some((id) => session.speakingIds.has(id))

/** Le bouton micro : rejoint le vocal, puis coupe / rend la parole. */
export function MicButton({ session, listenOnly, small = false }: { session: VoiceSession; listenOnly: boolean; small?: boolean }) {
  const { t } = useLanguage()
  if (!session.channel) return null
  const base = `relative flex ${small ? 'h-10 w-10 text-lg' : 'h-12 w-12 text-xl'} shrink-0 items-center justify-center rounded-full shadow-md transition-transform active:scale-95`
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


/** Bouton rond de la rangée du haut (joueurs, rôle, amoureux...). Partagé avec l'écran de nuit (NightScreen). */
export const STRIP_BUTTON = 'relative flex h-8 shrink-0 items-center justify-center border text-sm transition-colors active:scale-95'

/** Teintes d'un bouton de la rangée, sans cadre ni fond au repos (ils se posent directement sur le chat) : onglet choisi
 * = souligné en or ; « à toi » = pastille dorée pâle qui attire l'œil. Une seule teinte à la fois : deux classes de
 * couleur sur un même bouton se battraient et l'ordre de la feuille de style déciderait. */
export const stripTone = (tone: 'idle' | 'on' | 'accent' | 'voice' = 'idle') =>
  ({
    idle: 'rounded-full border-transparent bg-transparent text-moon-200/85',
    on: 'rounded-none border-transparent border-b-2 border-b-moon-400 bg-transparent text-moon-200',
    accent: 'rounded-full border-transparent bg-moon-400/20 text-moon-300',
    voice: 'rounded-full border-transparent bg-transparent text-moon-300',
  })[tone]

/** Rangée du haut du chat plein écran : posée sur le chat, fondue vers lui. `status` (même vide) réserve la ligne
 * d'état sous la rangée ; sans lui, pas de ligne. */
export function ChatStrip({ children, status, onHeight }: { children: ReactNode; status?: string; onHeight?: (px: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Hauteur réelle de la rangée (elle varie : onglets, bloc « qui joue », visages du vocal...) : le chat s'en sert pour
  // laisser la place exacte au-dessus de ses premiers messages.
  useEffect(() => {
    const el = ref.current
    if (!el || !onHeight) return
    const report = () => onHeight(el.offsetHeight)
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [onHeight])
  return (
    <div ref={ref} className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-night-950 from-55% via-night-950/90 to-transparent pb-6 pt-2">
      <div className="pointer-events-auto flex flex-col gap-1">{children}</div>
      {status !== undefined && <p className="mt-0.5 h-3.5 truncate px-4 text-[10px] font-semibold text-moon-300/90">{status}</p>}
    </div>
  )
}

/** Noms de ceux qui parlent en ce moment (vide si personne, ou si on n'est pas connecté). */
export function voiceSpeakers(session: VoiceSession, players: PublicPlayer[], selfId: string, t: ReturnType<typeof useLanguage>['t']): string[] {
  if (!session.connected) return []
  const byId = new Map(session.participants.map((p) => [p.id, p]))
  return players
    .filter((p) => p.is_alive && speakingOf(session, byId.get(p.user_id), p.user_id === selfId))
    .map((p) => (p.user_id === selfId ? t('dayLayout.me') : p.display_name))
}

/** Texte d'état du vocal (qui parle, combien sont dans le vocal...). */
export function voiceStatus(session: VoiceSession, players: PublicPlayer[], selfId: string, t: ReturnType<typeof useLanguage>['t']): string {
  const byId = new Map(session.participants.map((p) => [p.id, p]))
  const alive = players.filter((p) => p.is_alive)
  const speakers = voiceSpeakers(session, players, selfId, t)
  const inVoiceCount = session.connected ? alive.filter((p) => p.user_id === selfId || byId.has(p.user_id)).length : session.othersInVoice.length
  if (speakers.length > 0) return t('dayLayout.speaking', { names: speakers.join(', ') })
  if (session.joined) return session.connected ? t('dayLayout.inVoice', { count: inVoiceCount }) : session.connecting ? t('voiceChat.connecting') : (session.error ?? t('voiceChat.unavailable'))
  return session.othersInVoice.length > 0 ? `🎙️ ${t('voiceChat.inVoice', { count: session.othersInVoice.length })}` : ''
}

/** Bouton 🎙️ et rangée de visages (celui qui parle s'allume) ; un tap ouvre les réglages du vocal. */
export function VoiceFaces({ session, players, selfId, onOpen }: { session: VoiceSession; players: PublicPlayer[]; selfId: string; onOpen: () => void }) {
  const { t } = useLanguage()
  const byId = new Map(session.participants.map((p) => [p.id, p]))
  return (
    <div className="flex items-center gap-2 px-3">
      <button type="button" onClick={onOpen} aria-label={t('dayLayout.voiceLabel')} className={`${STRIP_BUTTON} w-8 ${stripTone(session.connected ? 'voice' : 'idle')}`}>
        🎙️
      </button>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {players.filter((p) => p.is_alive).map((p) => {
          const isSelf = p.user_id === selfId
          const part = byId.get(p.user_id)
          const speaking = speakingOf(session, part, isSelf)
          const present = !session.connected || isSelf || !!part
          return (
            <Avatar
              key={p.user_id}
              config={p.avatar_config}
              icon={p.avatar_icon}
              color={p.avatar_color}
              name={p.display_name}
              mood={speaking ? 'talk' : 'smile'}
              className={`h-8 w-8 shrink-0 rounded-full transition-all duration-200 ${present ? '' : 'opacity-30 grayscale'} ${speaking ? 'scale-110 ring-2 ring-moon-400 shadow-[0_0_12px_rgba(224,168,74,0.8)]' : 'ring-1 ring-night-600'}`}
            />
          )
        })}
      </button>
    </div>
  )
}

type Sheet = 'players' | 'role' | 'voice'

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
  /** Contenu du tiroir « Joueurs ». */
  playersSheet: ReactNode
  /** Contenu du tiroir « Mon rôle » (carte + avis du Griot, d'Anancy, de la Chasseuse). */
  roleSheet: ReactNode
  /** Point rouge sur 🔮 : une information de rôle vient d'arriver. */
  roleDot?: boolean
}

export function DayDiscussion({ view, gameId, code, selfId, me, voiceChannel, vote, unreadAmoureux, playersSheet, roleSheet, roleDot = false }: Props) {
  const { t } = useLanguage()
  const listenOnly = !!view.village_muted
  const session = useVoiceSession({ gameId, code, channel: voiceChannel, displayName: me?.display_name ?? t('common.playerFallback'), selfUserId: selfId, listenOnly })
  const [channel, setChannel] = useState<'village' | 'amoureux'>('village')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  useEffect(() => {
    if (!view.lover_id) setChannel('village')
  }, [view.lover_id])

  const alive = view.players.filter((p) => p.is_alive)
  const status = voiceStatus(session, view.players, selfId, t)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ChatPanel
        floating
        fill
        hideHeader
        embedded
        players={view.players}
        gameId={gameId}
        channel={channel}
        selfId={selfId}
        readOnly={channel === 'village' && listenOnly}
        note={channel === 'village' && listenOnly ? t('game.villageMutedNote') : undefined}
        composerLead={<MicButton session={session} listenOnly={listenOnly} small />}
        composerTrail={<span className="flex [&>*]:!h-10 [&>*]:!w-10 [&>*]:!text-lg">{vote}</span>}
        events={channel === 'village' ? view.log : undefined}
      />

      {/* Rangée vocale : des visages sur le fond du chat, qui s'estompent vers les messages ; celui qui parle s'allume. */}
      <ChatStrip status={status}>
        <div className="flex items-center">
          <div className="min-w-0 flex-1">
            <VoiceFaces session={session} players={view.players} selfId={selfId} onOpen={() => setSheet('voice')} />
          </div>
          <div className="flex shrink-0 items-center gap-2 pr-3">
            <button type="button" onClick={() => setSheet('players')} aria-label={t('dayLayout.sheet.players')} className={`${STRIP_BUTTON} ${stripTone()} gap-1 px-2.5 text-[11px] font-semibold`}>
              👥 {alive.length}/{view.players.length}
            </button>
            <button type="button" onClick={() => setSheet('role')} aria-label={t('dayLayout.sheet.role')} className={`${STRIP_BUTTON} ${stripTone()} w-8`}>
              🔮
              {roleDot && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-950 bg-blood-500" />}
            </button>
            {view.lover_id && (
              <button
                type="button"
                onClick={() => setChannel(channel === 'amoureux' ? 'village' : 'amoureux')}
                aria-pressed={channel === 'amoureux'}
                aria-label={t('dayLayout.lovers')}
                className={`${STRIP_BUTTON} w-8 ${stripTone(channel === 'amoureux' ? 'on' : 'idle')}`}
              >
                💘
                {unreadAmoureux > 0 && channel !== 'amoureux' && (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blood-600 px-1 text-center text-[9px] leading-4 text-[#fdf6e3]">{unreadAmoureux}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </ChatStrip>

      <BottomSheet open={sheet === 'players'} onClose={() => setSheet(null)} title={`👥 ${t('dayLayout.sheet.players')}`}>
        {playersSheet}
      </BottomSheet>
      <BottomSheet open={sheet === 'role'} onClose={() => setSheet(null)} title={`🔮 ${t('dayLayout.sheet.role')}`}>
        {roleSheet}
      </BottomSheet>
      <BottomSheet open={sheet === 'voice'} onClose={() => setSheet(null)} title={`🎙️ ${t('dayLayout.voiceLabel')}`}>
        <VoiceSheet session={session} players={alive} selfId={selfId} listenOnly={listenOnly} status={status} />
      </BottomSheet>
    </div>
  )
}

/** Réglages du vocal : qui est là et qui parle, couper le son, quitter (et couper un micro si on modère). */
export function VoiceSheet({ session, players, selfId, listenOnly, status }: { session: VoiceSession; players: PublicPlayer[]; selfId: string; listenOnly: boolean; status: string }) {
  const { t } = useLanguage()
  const byId = new Map(session.participants.map((p) => [p.id, p]))
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-moon-200/70">{status || t('voiceChat.idle')}</p>
      <div className="flex flex-wrap gap-2">
        {!session.joined ? (
          <button type="button" onClick={() => session.setJoined(true)} className="rounded-full bg-gradient-to-b from-moon-400 to-[#c98a1a] px-4 py-2 text-sm font-semibold text-night-950 active:scale-95">
            🎙️ {listenOnly ? t('voiceChat.joinListen') : t('dayLayout.mic.join')}
          </button>
        ) : (
          <>
            {session.connected && (
              <button type="button" onClick={session.toggleSound} className="rounded-full border border-night-600 bg-night-800/80 px-4 py-2 text-sm text-moon-200 active:scale-95">
                {session.deafened ? `🔇 ${t('voiceChat.soundOffTitle')}` : `🔊 ${t('voiceChat.soundOnTitle')}`}
              </button>
            )}
            {!session.connected && !session.connecting && (
              <button type="button" onClick={session.retry} className="rounded-full bg-amber-500/80 px-4 py-2 text-sm font-semibold text-night-950 active:scale-95">
                {t('voiceChat.retry')}
              </button>
            )}
            <button type="button" onClick={() => session.setJoined(false)} className="rounded-full border border-night-600 bg-night-800/80 px-4 py-2 text-sm text-moon-200/80 active:scale-95">
              ✕ {t('dayLayout.leaveVoice')}
            </button>
          </>
        )}
      </div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3">
        {players.map((p) => {
          const isSelf = p.user_id === selfId
          const part = byId.get(p.user_id)
          const speaking = speakingOf(session, part, isSelf)
          const present = !session.connected || isSelf || !!part
          const silenced = session.connected && (isSelf ? session.muted : !!part && !part.audioOn)
          return (
            <div key={p.user_id} className={`relative flex flex-col items-center gap-1 ${present ? '' : 'opacity-35 grayscale'}`}>
              <div className="relative w-14">
                <Avatar
                  config={p.avatar_config}
                  icon={p.avatar_icon}
                  color={p.avatar_color}
                  name={p.display_name}
                  mood={speaking ? 'talk' : 'smile'}
                  className={`aspect-square h-auto w-full rounded-full ${speaking ? 'ring-[3px] ring-moon-400 shadow-[0_0_14px_rgba(224,168,74,0.8)]' : 'ring-1 ring-night-600'}`}
                />
                {silenced && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blood-700 text-[9px] ring-1 ring-night-950">🔇</span>}
                {session.canModerate && part && part.audioOn && !isSelf && (
                  <button
                    type="button"
                    onClick={() => session.muteParticipant(part.sessionIds)}
                    title={t('voiceChat.muteParticipantTitle', { name: p.display_name })}
                    className="absolute -left-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blood-700/90 text-[10px] ring-1 ring-night-950"
                  >
                    🔇
                  </button>
                )}
              </div>
              <span className={`w-full truncate text-center text-[11px] ${speaking ? 'font-bold text-moon-300' : isSelf ? 'font-semibold text-moon-200/80' : 'text-moon-200/60'}`}>
                {isSelf ? t('dayLayout.me') : p.display_name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
