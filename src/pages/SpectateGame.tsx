import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSpectatorGame } from '../hooks/useSpectatorGame'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import type { GameStatus } from '../types/game'
import { translateGameLogMessage } from '../lib/gameLogTranslate'
import { Button, Card } from '../components/ui'
import { ChatPanel } from '../components/ChatPanel'
import { PlayerGrid } from '../components/PlayerGrid'
import { VoiceChat } from '../components/VoiceChat'
import { FullScreenLoader } from '../components/FullScreenLoader'

// Mêmes statuts que GhostPanel (GameRoom.tsx) : phases où les vivants
// discutent réellement au vocal du village.
const VILLAGE_VOICE_STATUSES: GameStatus[] = ['day_reveal', 'day_discussion', 'day_vote', 'captain_election']

const PHASE_TITLE_KEY: Record<GameStatus, TranslationKey> = {
  lobby: 'phase.lobby',
  role_reveal: 'phase.role_reveal',
  captain_election: 'phase.captain_election',
  night: 'phase.night',
  day_reveal: 'phase.day_reveal',
  day_discussion: 'phase.day_discussion',
  day_vote: 'phase.day_vote',
  day_vote_recap: 'phase.day_vote_recap',
  ended: 'phase.ended',
}

const PHASE_EMOJI: Record<GameStatus, string> = {
  lobby: '🕯️',
  role_reveal: '🎭',
  captain_election: '🎖️',
  night: '🌙',
  day_reveal: '☀️',
  day_discussion: '💬',
  day_vote: '🗳️',
  day_vote_recap: '🗳️',
  ended: '🏁',
}

/** Journal de partie en lecture seule — même rendu que LogList (GameRoom.tsx,
 * non exporté), dupliqué ici volontairement plutôt qu'exporté pour ne pas
 * coupler cet écran, à l'audience et aux droits très différents, au fichier
 * de la partie en cours. */
function SpectatorLog({ entries }: { entries: { id: string; message: string }[] }) {
  const { t, lang } = useLanguage()
  if (entries.length === 0) return <p className="text-sm text-moon-200/40">{t('game.logEmpty')}</p>
  return (
    <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto scrollbar-thin">
      {entries.map((e) => (
        <li key={e.id} className="animate-fade-in text-xs text-moon-200/70">
          {translateGameLogMessage(e.message, lang, t)}
        </li>
      ))}
    </ul>
  )
}

/** Écran d'observation : accessible depuis PendingApproval.tsx tant qu'une
 * partie déjà en cours n'a pas encore répondu à notre demande pour la
 * rejoindre (voir join_game / game_join_requests, migration 0038 puis 0101).
 * Demande utilisateur : "il peut cliquer sur un bouton voir la partie en
 * cours [...] pas dans le cimetière, pas dans le village, juste écouter et
 * lire ce qui est en train d'être écrit [...] et c'est uniquement quand la
 * partie se termine et qu'on valide son ajout qu'il rejoint officiellement
 * la partie." Lecture seule stricte : aucun rôle, aucune action, aucun
 * envoi de message (get_spectator_game_view + can_read_channel, migration
 * 0140) — seul un vrai membre de game_players peut agir ou écrire.
 *
 * La demande continue de tourner pendant qu'on observe : ce poll détecte
 * l'acceptation/le refus de l'hôte exactement comme PendingApproval.tsx, et
 * y renvoie dès que ce n'est plus "pending" pour qu'il gère la suite
 * (redirection vers le salon si accepté, écran refusé/introuvable sinon) —
 * pas besoin de dupliquer cette logique ici. */
export default function SpectateGame() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useLanguage()
  const { view, loading } = useSpectatorGame(gameId ?? null)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const redirectedRef = useRef(false)

  useEffect(() => {
    if (!gameId) return
    let cancelled = false

    async function poll() {
      const { data, error } = await supabase.rpc('get_my_join_request_status', { p_game_id: gameId })
      if (cancelled || redirectedRef.current) return
      if (error || !data || data.status !== 'pending') {
        redirectedRef.current = true
        navigate(`/attente/${gameId}`, { replace: true })
      }
    }

    poll()
    const interval = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [gameId, navigate])

  if (!gameId || !user) return null
  if (loading || !view) return <FullScreenLoader />

  const { game, players, log } = view

  return (
    <div className="game-theme-root relative min-h-screen bg-night-950 pb-16">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4">
        <Card className="flex items-center justify-between gap-3 !py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{PHASE_EMOJI[game.status]}</span>
            <div>
              <p className="font-display text-sm text-moon-200">
                {t(PHASE_TITLE_KEY[game.status])}
                {game.status === 'night' ? ` ${game.night_number}` : ''}
              </p>
              <p className="text-xs text-moon-200/40">{t('spectate.badge')}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => navigate(`/attente/${gameId}`)} className="!px-3 !py-2 text-xs">
            {t('spectate.backToWaiting')}
          </Button>
        </Card>

        <Card className="!py-4 text-sm text-moon-200/60">{t('spectate.subtitle')}</Card>

        <Card className="!p-0 border-night-700/60 bg-night-900/40">
          <button
            type="button"
            onClick={() => setRosterOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-xs uppercase tracking-widest text-moon-200/40">
              {t('game.playersGridTitle', { count: String(players.length) })}
            </span>
            <span className="text-xs text-moon-200/40">{rosterOpen ? t('common.hide') : t('common.show')}</span>
          </button>
          {rosterOpen && (
            <div className="px-4 pb-4">
              <PlayerGrid players={players} />
            </div>
          )}
        </Card>

        {VILLAGE_VOICE_STATUSES.includes(game.status) && (
          <VoiceChat gameId={gameId} code={game.code} channel="village" displayName={t('common.playerFallback')} selfUserId={user.id} listenOnly players={players} />
        )}
        <ChatPanel gameId={gameId} channel="village" selfId={user.id} compact readOnly />
        <ChatPanel gameId={gameId} channel="graveyard" selfId={user.id} compact compactHeightClassName="h-96" readOnly />

        <Card className="!p-0 border-night-700/60 bg-night-900/40">
          <button
            type="button"
            onClick={() => setLogOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-xs uppercase tracking-widest text-moon-200/40">
              {t('game.logTitle')}{log.length > 0 ? ` (${log.length})` : ''}
            </span>
            <span className="text-xs text-moon-200/40">{logOpen ? t('common.hide') : t('common.show')}</span>
          </button>
          {logOpen && (
            <div className="px-4 pb-4">
              <SpectatorLog entries={log} />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
