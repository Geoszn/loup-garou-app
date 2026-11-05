import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, Card } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import { safeRedirect } from '../lib/safeRedirect'
import { TutorialFlow } from '../components/TutorialFlow'

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

  // Sans session (Supabase n'en ouvre pas tant que l'adresse n'est pas confirmée), l'adresse vient de l'inscription ou
  // de la connexion (état de navigation, ou mémoire de l'onglet si la page est rechargée).
  const location = useLocation()
  const email =
    (location.state as { email?: string } | null)?.email ?? readPendingEmail() ?? session?.user.email ?? null
  const [tutorialOpen, setTutorialOpen] = useState(false)

  async function resend() {
    if (!email) return
    setChecking(true)
    const verifyEmailPath = redirect ? `/verifier-email?redirect=${encodeURIComponent(redirect)}` : '/verifier-email'
    await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}${verifyEmailPath}` },
    })
    setChecking(false)
    setResent(true)
    setTimeout(() => setResent(false), 4000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="flex w-full max-w-md flex-col gap-4 text-center">
        <div className="text-4xl animate-breathe" aria-hidden="true">📩</div>
        <div>
          <h1 className="font-display text-2xl text-moon-200">{t('verifyEmail.title')}</h1>
          <p className="mt-2 text-sm text-moon-200/60">{t('verifyEmail.sentTo')}</p>
          <p className="mt-0.5 break-all text-base font-semibold text-moon-200">{email ?? t('verifyEmail.emailFallback')}</p>
        </div>

        <ol className="flex flex-col gap-2 rounded-xl border border-night-600/60 bg-night-900/50 p-3 text-left text-sm text-moon-200/80">
          {(['verifyEmail.step1', 'verifyEmail.step2', 'verifyEmail.step3'] as const).map((k, n) => (
            <li key={k} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-moon-400/15 text-[11px] font-bold text-moon-300">{n + 1}</span>
              {t(k)}
            </li>
          ))}
        </ol>
        <p className="text-xs text-moon-200/50">{t('verifyEmail.spamNote')}</p>

        <Button onClick={resend} disabled={checking || !email} variant="ghost" className="w-full">
          {resent ? t('verifyEmail.resent') : t('verifyEmail.resend')}
        </Button>

        {/* En attendant le mail : le tutoriel interactif (il ne demande pas de compte). */}
        <Button onClick={() => setTutorialOpen(true)} className="w-full">
          🎬 {t('verifyEmail.tutorial')}
        </Button>

        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-moon-200/50">
          <Link to="/connexion" className="underline underline-offset-4 hover:text-moon-200">{t('verifyEmail.alreadyConfirmed')}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/inscription" className="underline underline-offset-4 hover:text-moon-200">{t('verifyEmail.wrongAddress')}</Link>
        </p>
      </Card>

      {tutorialOpen && <TutorialFlow onClose={() => setTutorialOpen(false)} onPlay={() => setTutorialOpen(false)} playLabel={t('verifyEmail.tutorialDone')} />}
    </div>
  )
}

const PENDING_EMAIL_KEY = 'lg-pending-email'

/** Mémorise, pour cet onglet, l'adresse en attente de confirmation (inscription, ou connexion refusée faute de confirmation). */
export function rememberPendingEmail(email: string) {
  try {
    sessionStorage.setItem(PENDING_EMAIL_KEY, email)
  } catch {
    // navigation privée : l'état de navigation suffit
  }
}

function readPendingEmail(): string | null {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY)
  } catch {
    return null
  }
}
