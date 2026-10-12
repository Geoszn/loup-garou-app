import { useEffect, useState, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useVoiceSession } from './VoiceChat'
import type { MyGameView, PublicPlayer } from '../types/game'
import { BottomSheet } from './BottomSheet'
import { ChatPanel } from './ChatPanel'
import { JournalDrawer, useJournalUnread } from './GameJournal'
import { NIGHT_STEP_ICON, NIGHT_STEP_LABEL } from './PhaseBanner'
import { ChatStrip, MicButton, STRIP_BUTTON, stripTone, VoiceFaces, VoiceSheet, voiceSpeakers, voiceStatus } from './DayDiscussion'

// Écran de nuit (joueur vivant), plein écran comme le débat de jour : le chat anonyme du village remplit l'écran, sa
// bulle d'écriture flotte au-dessus de la barre du bas. Le panneau d'action du rôle (vote des loups, Voyante,
// Sorcière...) vit dans un tiroir qui s'ouvre tout seul quand c'est le tour du joueur ; rôle et joueurs ont leurs tiroirs.
// Onglet Village pour tous, Loups en plus pour la meute (avec son vocal) ; le journal est un volet (📜).

type Sheet = 'action' | 'players' | 'role' | 'voice'

interface Props {
  view: MyGameView
  gameId: string
  code: string
  selfId: string
  me: PublicPlayer | undefined
  isWolf: boolean
  nightTab: 'village' | 'wolves'
  setNightTab: (t: 'village' | 'wolves') => void
  unreadWolves: number
  unreadVillage: number
  /** Panneau d'action à jouer maintenant (vote des loups, Voyante...) ; null quand rien n'est attendu du joueur. */
  actionPanel: ReactNode | null
  /** Résultat de l'action de la nuit (vision de la Voyante...) et s'il y en a un. */
  resultPanel: ReactNode
  hasResult: boolean
  playersSheet: ReactNode
  roleSheet: ReactNode
  roleDot?: boolean
}

export function NightScreen({
  view,
  gameId,
  code,
  selfId,
  me,
  isWolf,
  nightTab,
  setNightTab,
  unreadWolves,
  unreadVillage,
  actionPanel,
  resultPanel,
  hasResult,
  playersSheet,
  roleSheet,
  roleDot = false,
}: Props) {
  const { t } = useLanguage()
  const villageMuted = view.village_muted
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // Vocal de la meute : actif tant qu'on est loup, quel que soit l'onglet affiché (sans quoi un loup qui passe sur
  // l'onglet Village serait coupé de sa meute) ; jamais de vocal pour le village de nuit.
  const session = useVoiceSession({
    gameId,
    code,
    channel: isWolf ? 'wolves' : null,
    displayName: me?.display_name ?? t('common.playerFallback'),
    selfUserId: selfId,
  })
  const alive = view.players.filter((p) => p.is_alive)
  const inWolves = isWolf && nightTab === 'wolves'
  const channel = inWolves ? 'wolves' : 'village'
  const [journalOpen, setJournalOpen] = useState(false)
  const unreadJournal = useJournalUnread(gameId, view.log.length, journalOpen)

  // Le tiroir d'action s'ouvre dès que le tour du joueur commence — sauf s'il est en train d'écrire, auquel cas seule
  // la pastille pulse. Une clé par étape : une action déjà fermée à la main ne se rouvre pas toute seule.
  const actionKey = actionPanel ? `${view.game.night_number}:${view.game.night_step}:${view.pending_action_required}` : null
  useEffect(() => {
    if (!actionKey) return
    const el = document.activeElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
    setSheet('action')
  }, [actionKey])
  // Une fois l'action jouée : le tiroir reste ouvert s'il y a un résultat à lire, sinon il se referme.
  useEffect(() => {
    if (sheet === 'action' && !actionPanel && !hasResult) setSheet(null)
  }, [sheet, actionPanel, hasResult])

  const [seenResultNight, setSeenResultNight] = useState<number | null>(null)
  const resultUnseen = hasResult && seenResultNight !== view.game.night_number
  useEffect(() => {
    if (sheet === 'action' && hasResult) setSeenResultNight(view.game.night_number)
  }, [sheet, hasResult, view.game.night_number])

  // Onglet Village, micro ouvert : rappelle que le village n'entend pas le vocal de la meute (celui qui parle reste indiqué).
  let stripStatus: string | undefined
  if (inWolves) stripStatus = voiceStatus(session, view.players, selfId, t)
  else if (isWolf && session.joined) {
    const speakers = voiceSpeakers(session, view.players, selfId, t)
    stripStatus = [speakers.length > 0 ? t('dayLayout.speaking', { names: speakers.join(', ') }) : '', t('nightScreen.wolfVoiceNote')].filter(Boolean).join(' · ')
  }

  // Qui joue en ce moment : rappelé en permanence sous les onglets (la barre de phase le dit aussi, mais tronqué sur mobile).
  const actorKey = view.game.night_step ? NIGHT_STEP_LABEL[view.game.night_step] : undefined
  const actorIcon = view.game.night_step ? NIGHT_STEP_ICON[view.game.night_step] : undefined
  // Hauteur réelle de la rangée du haut (onglets + bloc « qui joue » + ligne d'état + visages du vocal), mesurée par ChatStrip.
  const [topPx, setTopPx] = useState<number | undefined>(undefined)

  const tab = (id: 'village' | 'wolves', label: string, unread: number) => (
    <button
      type="button"
      onClick={() => setNightTab(id)}
      aria-pressed={nightTab === id}
      className={`${STRIP_BUTTON} ${stripTone(nightTab === id ? 'on' : 'idle')} gap-1 px-2 text-xs font-semibold`}
    >
      {label}
      {unread > 0 && nightTab !== id && (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blood-600 px-1 text-center text-[9px] leading-4 text-[#fdf6e3]">{unread}</span>
      )}
    </button>
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ChatPanel
        floating
        floatingTopPx={topPx}
        fill
        hideHeader
        embedded
        players={view.players}
        gameId={gameId}
        channel={channel}
        selfId={selfId}
        readOnly={channel === 'village' && villageMuted}
        note={channel === 'village' ? (villageMuted ? t('game.villageMutedNote') : t('game.nightChatNote')) : undefined}
        onComposerFocus={() => setJournalOpen(false)}
        // Le micro des loups est disponible dans les deux onglets : le vocal reste celui de la meute.
        composerLead={isWolf ? <MicButton session={session} listenOnly={false} small /> : undefined}
      />

      <ChatStrip status={stripStatus} onHeight={setTopPx}>
        <div className="flex items-center gap-1.5 px-3">
          {tab('village', t('nightScreen.tab.village'), unreadVillage)}
          {isWolf && tab('wolves', t('tabs.wolves'), unreadWolves)}
          <span className="flex-1" />
          {(actionPanel || hasResult) && (
            <button
              type="button"
              onClick={() => setSheet('action')}
              aria-label={t('nightScreen.sheet.action')}
              className={`${STRIP_BUTTON} ${stripTone(actionPanel ? 'accent' : 'idle')} gap-1 px-2.5 text-xs font-semibold ${actionPanel ? 'animate-pulse' : ''}`}
            >
              🎯 {actionPanel ? t('nightScreen.chip.play') : ''}
              {resultUnseen && !actionPanel && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-950 bg-blood-500" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setJournalOpen((v) => !v)}
            aria-expanded={journalOpen}
            aria-label={t('tabs.journal')}
            className={`${STRIP_BUTTON} ${stripTone(journalOpen ? 'accent' : 'idle')} w-8`}
          >
            📜
            {unreadJournal > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-950 bg-blood-500" />}
          </button>
          <button type="button" onClick={() => setSheet('players')} aria-label={t('dayLayout.sheet.players')} className={`${STRIP_BUTTON} ${stripTone()} gap-1 px-2.5 text-[11px] font-semibold`}>
            👥 {alive.length}/{view.players.length}
          </button>
          <button type="button" onClick={() => setSheet('role')} aria-label={t('dayLayout.sheet.role')} className={`${STRIP_BUTTON} ${stripTone()} w-8`}>
            🔮
            {roleDot && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-950 bg-blood-500" />}
          </button>
        </div>
        {actorKey && (
          <div className="px-3">
            <div className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${actionPanel ? 'border-moon-400/50 bg-moon-400/15' : 'border-night-600/50 bg-night-800/60'}`}>
              <span className="animate-breathe text-2xl drop-shadow-[0_0_10px_rgba(224,168,74,0.55)]" aria-hidden="true">
                {actorIcon}
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm leading-tight text-moon-200">{t(actorKey)}</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-moon-200/50">{actionPanel ? t('nightScreen.yourTurn') : t('game.waitingOthers')}</p>
              </div>
            </div>
          </div>
        )}
        {inWolves && <VoiceFaces session={session} players={view.players} selfId={selfId} onOpen={() => setSheet('voice')} />}
      </ChatStrip>

      <JournalDrawer open={journalOpen} onClose={() => setJournalOpen(false)} entries={view.log} topPx={topPx} />

      <BottomSheet
        open={sheet === 'action'}
        onClose={() => setSheet(null)}
        title={`🎯 ${t('nightScreen.sheet.action')}`}
        // Les loups se concertent pendant leur vote : tiroir plus bas et raccourci vers le chat de la meute.
        maxHeightClass={isWolf ? 'max-h-[62%]' : 'max-h-[78%]'}
        banner={
          isWolf && (
            <button
              type="button"
              onClick={() => {
                setNightTab('wolves')
                setSheet(null)
              }}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-blood-700/50 bg-blood-900/20 px-3 py-2 text-left text-sm font-semibold text-moon-200 transition-colors active:scale-[0.99]"
            >
              <span>{t('nightScreen.wolfChatLink')}</span>
              <span className="flex items-center gap-2">
                {unreadWolves > 0 && nightTab !== 'wolves' && (
                  <span className="min-w-5 rounded-full bg-blood-600 px-1.5 text-center text-[11px] leading-5 text-[#fdf6e3]">{unreadWolves}</span>
                )}
                <span className="text-moon-200/40">›</span>
              </span>
            </button>
          )
        }
      >
        <div className="flex flex-col gap-4">
          {resultPanel}
          {actionPanel}
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'players'} onClose={() => setSheet(null)} title={`👥 ${t('dayLayout.sheet.players')}`}>
        {playersSheet}
      </BottomSheet>
      <BottomSheet open={sheet === 'role'} onClose={() => setSheet(null)} title={`🔮 ${t('dayLayout.sheet.role')}`}>
        {roleSheet}
      </BottomSheet>
      <BottomSheet open={sheet === 'voice'} onClose={() => setSheet(null)} title={`🎙️ ${t('dayLayout.voiceLabel')}`}>
        <VoiceSheet session={session} players={alive} selfId={selfId} listenOnly={false} status={voiceStatus(session, view.players, selfId, t)} />
      </BottomSheet>
    </div>
  )
}
