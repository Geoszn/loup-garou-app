import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import { Button, Card, ErrorText, Input, Label, PasswordInput } from '../components/ui'

/** Un invité crée son vrai compte : même identifiant, même pseudo, la partie en cours continue. Supabase rattache l'e-mail et le mot de
 * passe au compte temporaire ; l'invité devient un compte complet une fois l'e-mail confirmé (voir handle_guest_upgraded, migration 0250). */
export default function CreateAccountFromGuest() {
  const { t } = useLanguage()
  const { session, isGuest, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (loading) return null
  // Pas invité : rien à convertir (déjà un compte ou pas de session).
  if (!session) return <Navigate to="/inscription" replace />
  if (!isGuest) return <Navigate to="/dashboard" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError(t('guest.convert.passwordTooShort'))
      return
    }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser(
      { email: email.trim(), password },
      { emailRedirectTo: `${window.location.origin}/verifier-email` }
    )
    setBusy(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setSentTo(email.trim())
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        {sentTo ? (
          <div className="text-center">
            <div className="mb-3 text-4xl" aria-hidden="true">
              ✉️
            </div>
            <h1 className="mb-2 font-display text-xl text-moon-200">{t('guest.convert.sentTitle')}</h1>
            <p className="mb-5 text-sm text-moon-200/65">{t('guest.convert.sentBody', { email: sentTo })}</p>
            <Button className="w-full" onClick={() => navigate(-1)}>
              {t('guest.convert.back')}
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h1 className="font-display text-xl text-moon-200">{t('guest.convert.title')}</h1>
              <p className="mt-1 text-xs text-moon-200/55">{t('guest.convert.subtitle', { name: profile?.username ?? '' })}</p>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="convert-email">{t('guest.convert.email')}</Label>
                <Input id="convert-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" required />
              </div>
              <div>
                <Label htmlFor="convert-password">{t('guest.convert.password')}</Label>
                <PasswordInput id="convert-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? t('guest.convert.sending') : t('guest.convert.submit')}
              </Button>
              <ErrorText>{error}</ErrorText>
              <p className="text-center text-[11px] text-moon-200/45">{t('guest.convert.note')}</p>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
