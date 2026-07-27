import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useNotificationSound } from '../hooks/useNotificationSound'
import { Button, Card } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'

type Status = 'pending' | 'accepted' | 'rejected' | 'gone'

/** Écran d'attente affiché après une demande pour rejoindre une partie
 * publique ou privée (voir PublicGamesList / Dashboard.tsx / JoinByLink.tsx).
 * Le demandeur n'est pas encore membre de la partie — get_my_game_view lui
 * est donc fermé — cette page poll une fonction dédiée
 * (get_my_join_request_status) jusqu'à ce que l'hôte accepte ou refuse.
 *
 * Si la partie était déjà en cours au moment de la demande (voir join_game
 * et request_join_public_game, migration 0038), la demande reste "pending"
 * — pas d'état "expiré" — jusqu'à ce que l'hôte y réponde à son retour en
 * salon (fin de partie + redémarrage) : rien à faire de spécial ici, juste
 * adapter le message affiché via game_status. */
export default function PendingApproval() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [status, setStatus] = useState<Status>('pending')
  const [gameStatus, setGameStatus] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const redirectedRef = useRef(false)
  // Son + notification navigateur dès que l'hôte valide la demande — pas
  // besoin d'attendre que le demandeur ait l'onglet sous les yeux pour s'en
  // apercevoir (voir aussi Lobby.tsx côté hôte, symétrique).
  const playAccepted = useNotificationSound('/sounds/request-accepted.mp3')

  useEffect(() => {
    if (!gameId) return
    let cancelled = false

    async function poll() {
      const { data, error } = await supabase.rpc('get_my_join_request_status', { p_game_id: gameId })
      if (cancelled) return
      if (error || !data) {
        setStatus('gone')
        return
      }
      if (data.status === 'accepted' && !redirectedRef.current) {
        redirectedRef.current = true
        playAccepted()
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
          try {
            new Notification(`✅ ${t('pending.notifAcceptedTitle')}`, {
              body: t('pending.notifAcceptedBody'),
              icon: '/icons/icon-192.png',
              tag: 'lg-join-accepted',
            })
          } catch {
            /* certains navigateurs refusent silencieusement, rien à faire de plus */
          }
        }
        navigate(`/partie/${data.code}/lobby`, { replace: true })
        return
      }
      setGameStatus(data.game_status ?? null)
      setStatus(data.status ?? 'gone')
    }

    poll()
    const interval = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [gameId, navigate])

  const gameInProgress = gameStatus !== null && gameStatus !== 'lobby'

  async function cancel() {
    if (!gameId) return
    setCancelling(true)
    await supabase.rpc('cancel_join_request', { p_game_id: gameId })
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Card className="w-full max-w-sm">
        {status === 'pending' && (
          <>
            <p className="mb-2 text-3xl">{gameInProgress ? '🌙' : '🕓'}</p>
            <p className="mb-1 font-display text-lg text-moon-200">
              {gameInProgress ? t('pending.inProgressTitle') : t('pending.waitingTitle')}
            </p>
            <p className="mb-5 text-sm text-moon-200/60">
              {gameInProgress ? t('pending.inProgressBody') : t('pending.waitingBody')}
            </p>
            <Button variant="ghost" onClick={cancel} disabled={cancelling} className="w-full">
              {cancelling ? t('pending.cancelling') : t('pending.cancelButton')}
            </Button>
          </>
        )}

        {status === 'rejected' && (
          <>
            <p className="mb-2 text-3xl">🙅</p>
            <p className="mb-1 font-display text-lg text-moon-200">{t('pending.rejectedTitle')}</p>
            <p className="mb-5 text-sm text-moon-200/60">{t('pending.rejectedBody')}</p>
            <Button onClick={() => navigate('/dashboard')} className="w-full">
              {t('common.backHome')}
            </Button>
          </>
        )}

        {status === 'gone' && (
          <>
            <p className="mb-2 text-3xl">❓</p>
            <p className="mb-1 font-display text-lg text-moon-200">{t('pending.goneTitle')}</p>
            <p className="mb-5 text-sm text-moon-200/60">{t('pending.goneBody')}</p>
            <Button onClick={() => navigate('/dashboard')} className="w-full">
              {t('common.backHome')}
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
