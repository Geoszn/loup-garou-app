import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, ErrorText } from './ui'
import { JoinChoiceOverlay } from './JoinChoiceOverlay'
import { useJoinPublicGame } from '../hooks/useJoinPublicGame'
import { useLanguage } from '../i18n/LanguageContext'
import type { PublicGameListing } from '../types/game'
import { Avatar } from './Avatar'

/** Liste des parties publiques encore en salon — contenu "nu" (pas de carte
 * repliable autour), pensé pour être déposé tel quel dans la pop-up "Pour
 * rejoindre une partie" du tableau de bord (voir Dashboard.tsx). Se charge
 * dès le montage plutôt qu'à l'ouverture d'un panneau, puisque l'ouverture
 * de la pop-up EST déjà le geste explicite qui déclenche l'affichage. */
export function PublicGamesList({ displayName }: { displayName: string }) {
  const { t } = useLanguage()
  const [games, setGames] = useState<PublicGameListing[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Demande de participation / choix rejoindre-regarder : voir useJoinPublicGame.
  const join = useJoinPublicGame(displayName)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('list_public_games')
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setGames(data ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-moon-200/50">{t('publicGames.hostApprovalNote')}</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 text-xs text-moon-200/50 underline underline-offset-4 hover:text-moon-200 disabled:opacity-50"
        >
          {loading ? t('publicGames.refreshing') : t('publicGames.refresh')}
        </button>
      </div>

      <ErrorText>{error ?? join.error}</ErrorText>

      {loading && games === null && <p className="py-2 text-center text-sm text-moon-200/40">{t('publicGames.searching')}</p>}

      {games !== null && games.length === 0 && (
        <p className="py-2 text-center text-sm text-moon-200/40">{t('publicGames.empty')}</p>
      )}

      {games !== null && games.length > 0 && (
        <div className="flex flex-col gap-2">
          {games.map((g) => (
            <div
              key={g.game_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-night-700/60 bg-night-800/40 px-3 py-2.5"
            >
              <p className="flex flex-wrap items-center gap-1 text-sm text-moon-200/90">
                <Avatar config={g.host_avatar_config} icon={g.host_avatar_icon} name={g.host_name} className="h-7 w-7" />
                <strong className="text-moon-200">{g.host_name}</strong>
                <span className="ml-2 text-xs text-moon-200/40">{t('publicGames.playerCount', { count: g.player_count })}</span>
                {g.status === 'lobby' ? (
                  <span className="ml-2 rounded-full bg-emerald-700/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-400">
                    {t('publicGames.statusLobby')}
                  </span>
                ) : (
                  <span className="ml-2 rounded-full bg-blood-700/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blood-400">
                    {t('publicGames.statusInProgress')}
                  </span>
                )}
              </p>
              <Button
                className="px-3 py-1.5 text-xs"
                variant={g.already_requested ? 'ghost' : 'primary'}
                disabled={g.already_requested || join.requestingId === g.game_id}
                onClick={() => join.requestJoin(g)}
                title={g.status !== 'lobby' ? t('publicGames.inProgressTooltip') : undefined}
              >
                {g.already_requested
                  ? t('publicGames.requestSent')
                  : join.requestingId === g.game_id
                    ? t('publicGames.requesting')
                    : t('publicGames.requestButton')}
              </Button>
            </div>
          ))}
        </div>
      )}

      <JoinChoiceOverlay join={join} />
    </div>
  )
}
