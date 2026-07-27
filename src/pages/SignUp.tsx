import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Label } from '../components/ui'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useLanguage } from '../i18n/LanguageContext'

export default function SignUp() {
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim(), lang },
        emailRedirectTo: `${window.location.origin}/verifier-email`,
      },
    })
    setLoading(false)

    if (signUpError) {
      setError(traduireErreur(signUpError.message, t))
      return
    }

    navigate('/verifier-email')
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-end gap-2">
          <span className="text-right text-xs text-moon-200/50">{t('signup.langLabel')}</span>
          <LanguageSwitcher />
        </div>
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="" className="mx-auto mb-2 h-14 w-14 rounded-full" />
          <h1 className="font-display text-2xl text-moon-200">{t('signup.title')}</h1>
          <p className="mt-1 text-sm text-moon-200/50">{t('signup.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="signup-username">{t('signup.username')}</Label>
            <Input
              id="signup-username"
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
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
            />
          </div>
          <div>
            <Label htmlFor="signup-password">{t('signup.password')}</Label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <ErrorText>{error}</ErrorText>

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? t('signup.submitting') : t('signup.submit')}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-moon-200/40">
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

        <p className="mt-4 text-center text-sm text-moon-200/50">
          {t('signup.hasAccount')}{' '}
          <Link to="/connexion" className="text-moon-300 underline underline-offset-4">
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
