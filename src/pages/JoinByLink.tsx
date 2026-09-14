import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { notifyJoinRequest } from '../lib/pushSubscription'
import { Card, ErrorText, LinkButton } from '../components/ui'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { useLanguage } from '../i18n/LanguageContext'

export default function JoinByLink() {
  const { code } = useParams()
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [error, setError] = useState<string | null>(null)
  // Le profil (pseudo réel) est chargé séparément de la session, sur un
  // aller-retour réseau qui lui est propre (voir AuthContext.tsx :
  // `loading` retombe à false dès que la session est prête, sans attendre
  // `loadProfile`). En arrivant "à froid" sur ce lien — donc sans être
  // jamais passé par le tableau de bord au préalable, où le profil a le
  // temps de charger — rejoindre la partie trop tôt utilisait le nom
  // générique "Joueur" au lieu du vrai pseudo, ce qui donnait l'impression
  // qu'un tout nouveau compte venait de rejoindre le salon plutôt que la
  // personne déjà connectée. On attend donc que le profil soit chargé,
  // avec une limite de 8s pour ne pas bloquer indéfiniment en cas de souci
  // réseau (on rejoint alors avec "Joueur" en dernier recours, comme avant).
  const [profileTimedOut, setProfileTimedOut] = useState(false)

  useEffect(() => {
    if (loading || profile) return
    const timeout = setTimeout(() => setProfileTimedOut(true), 8000)
    return () => clearTimeout(timeout)
  }, [loading, profile])

  useEffect(() => {
    if (loading) return
    // Avant : redirection automatique et silencieuse vers /connexion, sans
    // aucun contexte — un nouvel arrivant depuis un lien d'invitation
    // (WhatsApp, etc.) se retrouvait sur un formulaire de connexion sans
    // comprendre pourquoi, ni savoir qu'il pouvait simplement créer un
    // compte. Le rendu ci-dessous (voir plus bas) affiche maintenant un
    // choix explicite à la place — ce useEffect ne s'occupe donc plus que
    // du cas "déjà connecté".
    if (!session) return
    if (!session.user.email_confirmed_at) {
      navigate(`/verifier-email?redirect=${encodeURIComponent(`/rejoindre/${code}`)}`)
      return
    }
    if (!code) return
    if (!profile && !profileTimedOut) return

    let cancelled = false
    ;(async () => {
      const { data, error: rpcError } = await supabase.rpc('join_game', {
        p_code: code.toUpperCase(),
        p_display_name: profile?.username ?? t('common.playerFallback'),
      })
      if (cancelled) return
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      // La partie peut déjà être en cours (voir join_game, migration 0038) :
      // la demande reste alors en attente jusqu'au retour en salon.
      if (data.status === 'pending') {
        void notifyJoinRequest(data.game_id)
        navigate(`/attente/${data.game_id}`, { replace: true, state: { code: data.code } })
        return
      }
      navigate(`/partie/${data.code}/lobby`, { replace: true })
    })()

    return () => {
      cancelled = true
    }
  }, [loading, session, code, profile, profileTimedOut, navigate])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <div className="mb-3 text-3xl">🌫️</div>
          <h1 className="mb-2 font-display text-xl text-moon-200">{t('joinByLink.cannotJoinTitle')}</h1>
          <ErrorText>{error}</ErrorText>
        </Card>
      </div>
    )
  }

  // Pas encore connecté : un choix explicite (créer un compte / se
  // connecter) plutôt qu'une redirection automatique vers /connexion sans
  // contexte (voir le commentaire du useEffect ci-dessus). Le paramètre
  // `redirect` traverse toute la chaîne inscription → vérification d'email
  // → connexion pour ramener le joueur directement ici une fois prêt,
  // au lieu de le laisser sur le tableau de bord général sans le code.
  if (!loading && !session) {
    const redirect = `/rejoindre/${code}`
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <div className="mb-3 text-3xl">🐺</div>
          <h1 className="mb-2 font-display text-xl text-moon-200">{t('joinByLink.authTitle')}</h1>
          <p className="mb-6 text-sm text-moon-200/60">{t('joinByLink.authBody')}</p>
          <div className="flex flex-col gap-2.5">
            <LinkButton to={`/inscription?redirect=${encodeURIComponent(redirect)}`} className="w-full">
              {t('joinByLink.authSignup')}
            </LinkButton>
            <LinkButton to={`/connexion?redirect=${encodeURIComponent(redirect)}`} variant="ghost" className="w-full">
              {t('joinByLink.authLogin')}
            </LinkButton>
          </div>
        </Card>
      </div>
    )
  }

  return <FullScreenLoader />
}
