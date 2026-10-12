import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Label, PasswordInput } from '../components/ui'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { CONTINENTS } from '../lib/continents'
import { useLanguage } from '../i18n/LanguageContext'
import { safeRedirect } from '../lib/safeRedirect'

export default function SignUp() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Ex. venu d'un lien d'invitation (JoinByLink.tsx) sans compte : ce
  // paramètre traverse toute la chaîne inscription → vérification d'email
  // pour ramener le joueur directement sur la partie qu'il voulait
  // rejoindre, au lieu de le laisser sur le tableau de bord général une
  // fois son compte confirmé.
  const redirect = safeRedirect(searchParams.get('redirect'))
  const { t, lang } = useLanguage()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [continent, setContinent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (username.trim().length < 2) {
      setError(t('signup.error.usernameTooShort'))
      return
    }
    if (password.length < 6) {
      setError(t('signup.error.passwordTooShort'))
      return
    }
    if (!continent) {
      setError(t('signup.error.continentRequired'))
      return
    }

    setLoading(true)
    const verifyEmailPath = redirect ? `/verifier-email?redirect=${encodeURIComponent(redirect)}` : '/verifier-email'
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim(), lang, continent },
        // Le lien de confirmation reçu par email peut s'ouvrir dans un tout
        // autre onglet/navigateur que celui-ci — c'est donc bien CETTE URL
        // (avec `redirect` déjà dedans) qui doit savoir où renvoyer le
        // joueur une fois confirmé, pas seulement le navigate() ci-dessous.
        emailRedirectTo: `${window.location.origin}${verifyEmailPath}`,
      },
    })
    setLoading(false)

    if (signUpError) {
      setError(traduireErreur(signUpError.message, t))
      return
    }

    navigate(verifyEmailPath)
  }

  return (
    <div className="flex min-h-[100dvh] items-start justify-center px-4 py-4 sm:items-center sm:py-10">
      <Card className="relative w-full max-w-md !p-5 sm:!p-6">
        <Link
          to="/"
          aria-label={t('common.close')}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-moon-200/50 transition-colors hover:bg-night-600/60 hover:text-moon-200"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <div className="mb-4 flex items-center gap-3 pr-9">
          <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0">
            <h1 className="font-display text-xl leading-tight text-moon-200">{t('signup.title')}</h1>
            <p className="text-[13px] leading-snug text-moon-200/50">{t('signup.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="signup-username">{t('signup.username')}</Label>
            <Input
              className="!py-2.5"
              id="signup-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="LeChasseur42"
              maxLength={24}
              required
            />
          </div>
          <div>
            <Label htmlFor="signup-email">{t('signup.email')}</Label>
            <Input
              className="!py-2.5"
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
            />
          </div>
          <div>
            <Label htmlFor="signup-password">{t('signup.password')}</Label>
            <PasswordInput
              className="!py-2.5"
              id="signup-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <div>
              <Label htmlFor="signup-continent">{t('signup.continent')}</Label>
              <select
                id="signup-continent"
                value={continent}
                onChange={(e) => setContinent(e.target.value)}
                required
                className="h-[46px] w-full rounded-xl border border-night-500 bg-night-800/80 px-3 text-moon-200 outline-none transition focus:border-moon-400/60 focus:ring-2 focus:ring-moon-400/20"
              >
                <option value="" disabled>
                  {t('signup.continentPlaceholder')}
                </option>
                {CONTINENTS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.emoji} {lang === 'fr' ? c.fr : c.en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('signup.lang')}</Label>
              <LanguageSwitcher fill />
            </div>
          </div>
          <p className="-mt-1 text-[11px] leading-snug text-moon-200/40">{t('signup.langHint')}</p>

          <ErrorText>{error}</ErrorText>

          <Button type="submit" disabled={loading} className="mt-1 w-full">
            {loading ? t('signup.submitting') : t('signup.submit')}
          </Button>
        </form>

        <p className="mt-3 text-center text-[11px] leading-snug text-moon-200/40">
          {t('signup.terms.prefix')}{' '}
          <Link to="/cgu" className="underline underline-offset-4 hover:text-moon-200/70">
            {t('signup.terms.cgu')}
          </Link>{' '}
          {t('signup.terms.and')}{' '}
          <Link to="/confidentialite" className="underline underline-offset-4 hover:text-moon-200/70">
            {t('signup.terms.privacy')}
          </Link>
          .
        </p>

        <p className="mt-3 text-center text-sm text-moon-200/50">
          {t('signup.hasAccount')}{' '}
          <Link
            to={redirect ? `/connexion?redirect=${encodeURIComponent(redirect)}` : '/connexion'}
            className="text-moon-300 underline underline-offset-4"
          >
            {t('signup.loginLink')}
          </Link>
        </p>
      </Card>
    </div>
  )
}

function traduireErreur(message: string, t: ReturnType<typeof useLanguage>['t']): string {
  if (message.toLowerCase().includes('already registered')) return t('signup.error.alreadyRegistered')
  if (message.toLowerCase().includes('password')) return t('signup.error.invalidPassword')
  return message // message brut de Supabase en dernier recours (cas non prévus)
}
