import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Label, SuccessText } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'

export default function ForgotPassword() {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
    })

    setLoading(false)

    // On affiche le même message de succès que l'email existe ou non, pour
    // ne jamais révéler si une adresse est inscrite (protection contre
    // l'énumération de comptes). Seule une vraie erreur technique (ex: trop
    // de tentatives, rate limit Supabase) est affichée telle quelle.
    if (resetError && resetError.message.toLowerCase().includes('security purposes')) {
      setError(t('forgotPassword.rateLimited'))
      return
    }

    setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="" className="mx-auto mb-2 h-14 w-14 rounded-full" />
          <h1 className="font-display text-2xl text-moon-200">{t('forgotPassword.title')}</h1>
          <p className="mt-1 text-sm text-moon-200/50">{t('forgotPassword.subtitle')}</p>
        </div>

        {sent ? (
          <>
            <SuccessText>{t('forgotPassword.sent', { email })}</SuccessText>
            <p className="mt-4 rounded-lg border border-night-600/60 bg-night-800/60 px-3 py-2 text-xs text-moon-200/50">
              {t('forgotPassword.spamNote')}
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="forgot-email">{t('login.email')}</Label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
              />
            </div>

            <ErrorText>{error}</ErrorText>

            <Button type="submit" disabled={loading} className="mt-2 w-full">
              {loading ? t('forgotPassword.submitting') : t('forgotPassword.submit')}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-moon-200/50">
          <Link to="/connexion" className="text-moon-300 underline underline-offset-4">
            {t('forgotPassword.backToLogin')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
