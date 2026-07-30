import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, ErrorText, Input, Label } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'
import { FullScreenLoader } from '../components/FullScreenLoader'

export default function ResetPassword() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Le lien reçu par email contient un jeton de récupération que le client
  // Supabase lit automatiquement dans l'URL au chargement de la page, ouvre
  // une session temporaire et émet l'événement PASSWORD_RECOVERY. On attend
  // cet événement (ou une session déjà présente) avant d'afficher le
  // formulaire ; si rien n'arrive après quelques secondes, le lien est
  // invalide, déjà utilisé ou expiré (durée de vie ~1h côté Supabase).
  useEffect(() => {
    let settled = false

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        settled = true
        setStatus('ready')
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!settled && data.session) {
        settled = true
        setStatus('ready')
      }
    })

    const timeout = setTimeout(() => {
      if (!settled) setStatus('invalid')
    }, 4000)

    return () => {
      listener.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError(t('resetPassword.tooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('resetPassword.mismatch'))
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(t('resetPassword.updateError'))
      return
    }

    // Comme après une confirmation d'email, on déconnecte la session
    // éphémère issue du lien puis on renvoie vers la connexion : plus sûr
    // que d'enchaîner automatiquement sur le tableau de bord.
    await supabase.auth.signOut()
    navigate('/connexion', { state: { notice: t('resetPassword.successNotice') } })
  }

  if (status === 'checking') return <FullScreenLoader />

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="" className="mx-auto mb-2 h-14 w-14 rounded-full" />
          <h1 className="font-display text-2xl text-moon-200">{t('resetPassword.title')}</h1>
          <p className="mt-1 text-sm text-moon-200/50">{t('resetPassword.subtitle')}</p>
        </div>

        {status === 'invalid' ? (
          <>
            <ErrorText>{t('resetPassword.invalidLink')}</ErrorText>
            <p className="mt-6 text-center text-sm text-moon-200/50">
              <Link to="/mot-de-passe-oublie" className="text-moon-300 underline underline-offset-4">
                {t('resetPassword.requestNewLink')}
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="reset-password">{t('resetPassword.new')}</Label>
              <Input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <Label htmlFor="reset-confirm">{t('resetPassword.confirm')}</Label>
              <Input
                id="reset-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <ErrorText>{error}</ErrorText>

            <Button type="submit" disabled={loading} className="mt-2 w-full">
              {loading ? t('resetPassword.submitting') : t('resetPassword.submit')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
