import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Label, SuccessText } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import { isAdminHost } from '../lib/adminHost'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { t } = useLanguage()
  // Message ponctuel passé via navigate('/connexion', { state: { notice } }),
  // ex. juste après confirmation d'email (voir VerifyEmail.tsx). Capturé une
  // seule fois au montage pour ne pas réapparaître à chaque nouvel essai.
  const [notice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (signInError) {
      if (signInError.message.toLowerCase().includes('email not confirmed')) {
        navigate('/verifier-email')
        return
      }
      setError(t('login.error.invalid'))
      return
    }

    navigate(searchParams.get('redirect') || '/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Bandeau très visible, uniquement sur le domaine dédié
            (admin.loupgarouafrique.com) : le formulaire de connexion en
            lui-même reste le même composant que pour un joueur normal (même
            logique Supabase Auth), mais personne ne doit pouvoir confondre
            cet écran avec la connexion classique — d'où ce gros titre rouge
            au-dessus, bien distinct du thème lune/nuit habituel. */}
        {isAdminHost && (
          <div className="mb-4 rounded-2xl border-2 border-blood-600/70 bg-gradient-to-b from-blood-700/30 to-blood-900/20 px-5 py-4 text-center shadow-[0_0_30px_-8px_rgba(185,28,28,0.6)]">
            <p className="text-3xl">🛡️</p>
            <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide text-blood-300">
              Espace Administrateur
            </h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-blood-400/80">
              Accès réservé — Loup Garou d'Afrique
            </p>
          </div>
        )}

        <Card className={`w-full ${isAdminHost ? 'border-blood-700/40' : ''}`}>
          <div className="mb-6 text-center">
            <img src="/logo.png" alt="" className="mx-auto mb-2 h-14 w-14 rounded-full" />
            <h1 className="font-display text-2xl text-moon-200">{t('login.title')}</h1>
            <p className="mt-1 text-sm text-moon-200/50">{t('login.subtitle')}</p>
          </div>

          {notice && <SuccessText>{notice}</SuccessText>}

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div>
              <Label htmlFor="login-email">{t('login.email')}</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="login-password">{t('login.password')}</Label>
                <Link
                  to="/mot-de-passe-oublie"
                  className="text-xs text-moon-300 underline underline-offset-4"
                >
                  {t('login.forgotPassword')}
                </Link>
              </div>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <ErrorText>{error}</ErrorText>

            <Button type="submit" disabled={loading} className="mt-2 w-full">
              {loading ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-moon-200/50">
            {t('login.noAccount')}{' '}
            <Link to="/inscription" className="text-moon-300 underline underline-offset-4">
              {t('login.signupLink')}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
