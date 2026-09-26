import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, Card } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import { safeRedirect } from '../lib/safeRedirect'

export default function VerifyEmail() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Présent quand l'inscription est partie d'un lien d'invitation
  // (JoinByLink.tsx → SignUp.tsx) : ramène directement vers la partie visée
  // une fois l'email confirmé, au lieu du tableau de bord général. Lu
  // depuis l'URL (et non un state de navigation) car le lien de
  // confirmation reçu par email peut très bien s'ouvrir dans un tout autre
  // onglet/navigateur que celui qui a rempli le formulaire d'inscription.
  const redirect = safeRedirect(searchParams.get('redirect'))
  const { t } = useLanguage()
  const [resent, setResent] = useState(false)
  const [checking, setChecking] = useState(false)

  // Dès que l'email est confirmé, on file directement vers le tableau de
  // bord (ou la partie visée, voir `redirect`) plutôt que de repasser par la
  // connexion : c'est justement cliquer sur le lien reçu par mail qui vient
  // de créer une session confirmée dans cet onglet (Supabase la détecte
  // dans l'URL au chargement de la page) — la faire sauter pour forcer une
  // reconnexion manuelle n'ajoutait aucune sécurité réelle, juste une étape
  // en plus pour un ami pressé de rejoindre une partie. (Avant : on
  // déconnectait cette session et on renvoyait vers /connexion.)
  function goToDashboardConfirmed() {
    navigate(redirect || '/dashboard', { state: { notice: t('verifyEmail.confirmedNotice'), tone: 'success' } })
  }

  useEffect(() => {
    if (!loading && session?.user.email_confirmed_at) {
      goToDashboardConfirmed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session])

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user.email_confirmed_at) {
        goToDashboardConfirmed()
      }
    }, 4000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resend() {
    if (!session?.user.email) return
    setChecking(true)
    const verifyEmailPath = redirect ? `/verifier-email?redirect=${encodeURIComponent(redirect)}` : '/verifier-email'
    await supabase.auth.resend({
      type: 'signup',
      email: session.user.email,
      options: { emailRedirectTo: `${window.location.origin}${verifyEmailPath}` },
    })
    setChecking(false)
    setResent(true)
    setTimeout(() => setResent(false), 4000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md text-center">
        <div className="mb-4 text-4xl animate-breathe">📩</div>
        <h1 className="font-display text-2xl text-moon-200">{t('verifyEmail.title')}</h1>
        <p className="mt-3 text-sm text-moon-200/60">
          {t('verifyEmail.body', { email: session?.user.email ?? t('verifyEmail.emailFallback') })}
        </p>

        <p className="mt-4 rounded-lg border border-night-600/60 bg-night-800/60 px-3 py-2 text-xs text-moon-200/50">
          {t('verifyEmail.spamNote')}
        </p>

        <Button onClick={resend} disabled={checking} variant="ghost" className="mt-6 w-full">
          {resent ? t('verifyEmail.resent') : t('verifyEmail.resend')}
        </Button>
      </Card>
    </div>
  )
}
