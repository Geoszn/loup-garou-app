import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GameStatus, NightStep, PublicPlayer, RoleCounts } from '../types/game'
import type { TranslationKey } from '../i18n/translations'
import { useLanguage } from '../i18n/LanguageContext'
import { Timer } from './Timer'
import { RosterSummary } from './RosterSummary'

const PHASE_INFO: Record<GameStatus, { titleKey: TranslationKey; emoji: string }> = {
  lobby: { titleKey: 'phase.lobby', emoji: '🕯️' },
  role_reveal: { titleKey: 'phase.role_reveal', emoji: '🎭' },
  captain_election: { titleKey: 'phase.captain_election', emoji: '🎖️' },
  night: { titleKey: 'phase.night', emoji: '🌙' },
  day_reveal: { titleKey: 'phase.day_reveal', emoji: '☀️' },
  day_discussion: { titleKey: 'phase.day_discussion', emoji: '💬' },
  day_vote: { titleKey: 'phase.day_vote', emoji: '🗳️' },
  day_vote_recap: { titleKey: 'phase.day_vote_recap', emoji: '🗳️' },
  ended: { titleKey: 'phase.ended', emoji: '🏁' },
}

// Exporté pour être réutilisé par WaitingCard (GameRoom.tsx) : plutôt qu'un
// "en attente des autres joueurs" générique pendant la nuit, on y affiche
// qui est précisément en train d'agir — même texte que le sous-titre
// ci-dessous, pour ne pas avoir deux formulations différentes du même état.
// Ce sont des CLÉS de traduction (pas le texte final) : l'appelant doit les
// passer à t() lui-même pour suivre la langue choisie.
export const NIGHT_STEP_LABEL: Record<string, TranslationKey> = {
  voleur: 'nightStep.voleur',
  cupidon: 'nightStep.cupidon',
  voyante: 'nightStep.voyante',
  loup_garou: 'nightStep.loup_garou',
  sorciere: 'nightStep.sorciere',
  resolve: 'nightStep.resolve',
}

export function PhaseBanner({
  status,
  nightNumber,
  nightStep,
  deadline,
  players,
  roleCounts,
  onlineUserIds,
  narratorEnabled,
  onToggleNarrator,
  narratorSupported = true,
  sfxEnabled,
  onToggleSfx,
  sfxSupported = true,
  notifEnabled,
  onToggleNotif,
  notifSupported = true,
  onLeave,
  isHost = false,
  onOpenModeration,
  onExtendTime,
  selfId,
}: {
  status: GameStatus
  nightNumber: number
  nightStep: NightStep
  deadline: string | null
  players?: PublicPlayer[]
  roleCounts?: RoleCounts | null
  onlineUserIds?: Set<string>
  selfId?: string
  narratorEnabled?: boolean
  onToggleNarrator?: () => void
  narratorSupported?: boolean
  sfxEnabled?: boolean
  onToggleSfx?: () => void
  sfxSupported?: boolean
  notifEnabled?: boolean
  onToggleNotif?: () => void
  notifSupported?: boolean
  onLeave?: () => void
  isHost?: boolean
  onOpenModeration?: () => void
  // Bouton discret "+30s" pendant le débat, réservé à l'hôte (voir
  // extend_phase_deadline, migration 0041). N'apparaît que si fourni ET que
  // status === 'day_discussion' — inutile ailleurs, le minuteur n'y a pas le
  // même sens (nuit, vote...). Retourne un message d'erreur (ou
  // null/undefined si tout s'est bien passé) : affiché juste sous le
  // bouton, pour ne jamais échouer en silence (ex. migration 0041 pas
  // encore appliquée côté Supabase → "function ... does not exist").
  onExtendTime?: () => Promise<string | null | undefined>
}) {
  const { t } = useLanguage()
  const info = PHASE_INFO[status]
  const nightStepKey = status === 'night' && nightStep ? NIGHT_STEP_LABEL[nightStep] : null
  const subtitle = nightStepKey ? t(nightStepKey) : status === 'night' ? '' : null

  const [extending, setExtending] = useState(false)
  const [extendError, setExtendError] = useState<string | null>(null)

  async function handleExtendTime() {
    if (!onExtendTime || extending) return
    setExtending(true)
    setExtendError(null)
    const err = await onExtendTime()
    setExtending(false)
    if (err) {
      setExtendError(err)
      setTimeout(() => setExtendError(null), 6000)
    }
  }

  return (
    <div
      className={`sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-gradient-to-r px-4 py-3 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.4)] backdrop-blur-md sm:px-6 ${
        status === 'night'
          ? 'border-night-600/60 from-night-950/90 via-night-900/90 to-night-950/90'
          : 'border-blood-700/30 from-night-900/90 via-night-800/90 to-night-900/90'
      }`}
    >
      {/* key={status} : force un remontage de ce bloc à chaque changement de
          phase, pour rejouer le fondu d'entrée sur le titre — sans ça React
          se contente de mettre à jour le texte en place, sans transition. */}
      <div key={status} className="flex min-w-0 animate-fade-in items-center gap-3">
        <span className="shrink-0 text-2xl drop-shadow-[0_0_8px_rgba(245,230,184,0.5)]">{info.emoji}</span>
        <div className="min-w-0">
          <p className="truncate font-display text-base leading-none text-moon-200 sm:text-lg">
            {t(info.titleKey)}
            {status === 'night' ? ` ${nightNumber}` : ''}
          </p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-moon-200/50">{subtitle}</p>}
        </div>
      </div>
      {/* Rangée volontairement réduite au strict nécessaire toujours visible
          (accueil, effectifs, minuteur) : narrateur/SFX/notifications/quitter
          sont des réglages qu'on touche une fois puis qu'on oublie, ils sont
          donc rangés dans le menu ⋮ plutôt que d'encombrer l'écran en
          permanence — voir GameMenu ci-dessous. */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Simple navigation vers le tableau de bord — ne quitte pas la
            partie (pas d'appel serveur, pas d'élimination), contrairement au
            bouton 🚪 du menu qui, lui, élimine le joueur. La partie continue
            de tourner en fond ; on peut y revenir via /partie/:code. */}
        <Link
          to="/dashboard"
          title={t('game.homeLinkTitle')}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-night-600 bg-night-800/60 text-sm text-moon-200/70 transition-colors hover:border-moon-400/50 hover:text-moon-200"
        >
          🏠
        </Link>
        {players && players.length > 0 && (
          <RosterSummary players={players} roleCounts={roleCounts} selfId={selfId} onlineUserIds={onlineUserIds} />
        )}
        <Timer deadline={deadline} />
        {isHost && status === 'day_discussion' && onExtendTime && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={handleExtendTime}
              disabled={extending}
              title={t('game.extendTimeTitle')}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-night-600 bg-night-800/60 text-sm font-semibold text-moon-200/70 transition-colors hover:border-moon-400/50 hover:text-moon-200 disabled:opacity-50"
            >
              +
            </button>
            {extendError && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-48 rounded-lg border border-blood-600/60 bg-night-900 px-2.5 py-2 text-[11px] text-blood-400 shadow-card">
                {extendError}
              </div>
            )}
          </div>
        )}
        <GameMenu
          narratorEnabled={narratorEnabled}
          onToggleNarrator={onToggleNarrator}
          narratorSupported={narratorSupported}
          sfxEnabled={sfxEnabled}
          onToggleSfx={onToggleSfx}
          sfxSupported={sfxSupported}
          notifEnabled={notifEnabled}
          onToggleNotif={onToggleNotif}
          notifSupported={notifSupported}
          onLeave={onLeave}
          isHost={isHost}
          onOpenModeration={onOpenModeration}
        />
      </div>
    </div>
  )
}

/** Menu ⋮ regroupant les réglages qu'on ajuste rarement (narrateur, effets
 * sonores, notifications) et le bouton "Quitter" — même patron que
 * AccountMenu (Dashboard), pour ne pas empiler une icône par réglage dans la
 * barre du haut. */
function GameMenu({
  narratorEnabled,
  onToggleNarrator,
  narratorSupported,
  sfxEnabled,
  onToggleSfx,
  sfxSupported,
  notifEnabled,
  onToggleNotif,
  notifSupported,
  onLeave,
  isHost,
  onOpenModeration,
}: {
  narratorEnabled?: boolean
  onToggleNarrator?: () => void
  narratorSupported: boolean
  sfxEnabled?: boolean
  onToggleSfx?: () => void
  sfxSupported: boolean
  notifEnabled?: boolean
  onToggleNotif?: () => void
  notifSupported: boolean
  onLeave?: () => void
  isHost: boolean
  onOpenModeration?: () => void
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hasNarrator = narratorSupported && !!onToggleNarrator
  const hasSfx = sfxSupported && !!onToggleSfx
  const hasNotif = notifSupported && !!onToggleNotif
  const hasModeration = isHost && !!onOpenModeration
  if (!hasNarrator && !hasSfx && !hasNotif && !hasModeration && !onLeave) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('game.menuTitle')}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors ${
          open ? 'border-moon-400/40 bg-moon-400/10 text-moon-300' : 'border-night-600 bg-night-800/60 text-moon-200/70'
        }`}
      >
        ⋮
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-night-600 bg-night-800 p-1.5 shadow-card">
          {hasNarrator && (
            <MenuToggle
              icon={narratorEnabled ? '🔊' : '🔈'}
              label={t('menu.narrator')}
              enabled={!!narratorEnabled}
              onClick={onToggleNarrator!}
            />
          )}
          {hasSfx && (
            <MenuToggle
              icon={sfxEnabled ? '🎶' : '🔇'}
              label={t('menu.sfx')}
              enabled={!!sfxEnabled}
              onClick={onToggleSfx!}
            />
          )}
          {hasNotif && (
            <MenuToggle
              icon={notifEnabled ? '🔔' : '🔕'}
              label={t('menu.notifications')}
              enabled={!!notifEnabled}
              onClick={onToggleNotif!}
            />
          )}
          {hasModeration && (
            <>
              {(hasNarrator || hasSfx || hasNotif) && <div className="my-1 border-t border-night-700" />}
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenModeration!()
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-moon-200/80 transition-colors hover:bg-night-700/60 hover:text-moon-200"
              >
                {t('moderation.title')}
              </button>
            </>
          )}
          {onLeave && (
            <>
              <div className="my-1 border-t border-night-700" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onLeave()
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-blood-400 transition-colors hover:bg-blood-700/10"
              >
                {t('game.leaveGameMenuItem')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuToggle({
  icon,
  label,
  enabled,
  onClick,
}: {
  icon: string
  label: string
  enabled: boolean
  onClick: () => void
}) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-moon-200/80 transition-colors hover:bg-night-700/60 hover:text-moon-200"
    >
      <span className="flex items-center gap-2">
        <span>{icon}</span> {label}
      </span>
      <span className={`text-[10px] uppercase tracking-wider ${enabled ? 'text-emerald-400' : 'text-moon-200/30'}`}>
        {enabled ? t('common.on') : t('common.off')}
      </span>
    </button>
  )
}
