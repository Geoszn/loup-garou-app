import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { notifyJoinAccepted } from '../lib/pushSubscription'
import { Button, ErrorText } from './ui'
import { useLanguage } from '../i18n/LanguageContext'
import type { JoinRequest } from '../types/game'

/** Liste des demandes en attente pour une partie publique, avec
 * accepter/refuser — visible uniquement de l'hôte (voir Lobby.tsx, qui ne
 * rend ce panneau que si view.game.is_public). Les données viennent de
 * get_my_game_view (champ join_requests), donc déjà tenues à jour par le
 * polling de useGame — pas de fetch séparé ici. */
export function JoinRequestsPanel({ requests }: { requests: JoinRequest[] }) {
  const { t } = useLanguage()
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function respond(id: string, accept: boolean) {
    setRespondingId(id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('respond_join_request', {
      p_request_id: id,
      p_accept: accept,
    })
    setRespondingId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (accept) void notifyJoinAccepted(id)
  }

  if (requests.length === 0) {
    return <p className="text-sm text-moon-200/40">{t('joinRequests.empty')}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <ErrorText>{error}</ErrorText>
      {requests.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-night-700/60 bg-night-800/40 px-3 py-2.5"
        >
          <p className="text-sm text-moon-200/90">{r.display_name}</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-xs"
              disabled={respondingId === r.id}
              onClick={() => respond(r.id, false)}
            >
              {t('joinRequests.decline')}
            </Button>
            <Button
              className="px-3 py-1.5 text-xs"
              disabled={respondingId === r.id}
              onClick={() => respond(r.id, true)}
            >
              {respondingId === r.id ? '...' : t('joinRequests.accept')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
