import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import { Button, ErrorText, Input, Label } from './ui'

// Entrée « Jouer en invité » (compte temporaire, migration 0250) : un pseudo suffit, ni e-mail ni mot de passe.

/** Champ pseudo + bouton, partagés par la feuille de l'accueil et par l'écran du lien d'invitation. `onDone` est appelé une fois la
 * session d'invité ouverte (ou déjà ouverte). */
export function GuestNicknameForm({ cta, onDone }: { cta: string; onDone?: () => void }) {
  const { t, lang } = useLanguage()
  const { signInAsGuest } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const message = await signInAsGuest(name, lang)
    setBusy(false)
    if (message) {
      setError(message)
      return
    }
    onDone?.()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 text-left">
      <div>
        <Label htmlFor="guest-nickname">{t('guest.sheet.nickname')}</Label>
        <Input id="guest-nickname" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Kofi" autoComplete="nickname" />
      </div>
      <Button type="submit" disabled={busy} className="w-full">
        {cta}
      </Button>
      <ErrorText>{error}</ErrorText>
    </form>
  )
}

/** Feuille de l'accueil : code de la partie + pseudo, puis direction l'écran « rejoindre » qui gère le reste. */
export function GuestJoinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useLanguage()
  const { signInAsGuest } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) {
      setError(t('guest.sheet.invalidCode'))
      return
    }
    setBusy(true)
    setError(null)
    const message = await signInAsGuest(name, lang)
    setBusy(false)
    if (message) {
      setError(message)
      return
    }
    navigate(`/rejoindre/${clean}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-overlay-in items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm animate-sheet-up rounded-t-3xl border border-night-600/70 bg-gradient-to-b from-night-700 to-night-900 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <h3 className="mb-1 font-display text-lg text-moon-200">{t('guest.sheet.title')}</h3>
        <p className="mb-4 text-xs text-moon-200/55">{t('guest.sheet.subtitle')}</p>
        <form onSubmit={submit} className="flex flex-col gap-3 text-left">
          <div>
            <Label htmlFor="guest-sheet-code">{t('guest.sheet.code')}</Label>
            <Input
              id="guest-sheet-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="AB12CD"
              maxLength={8}
              autoFocus
              className="text-center font-display text-lg tracking-[0.3em]"
            />
          </div>
          <div>
            <Label htmlFor="guest-sheet-name">{t('guest.sheet.nickname')}</Label>
            <Input id="guest-sheet-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Kofi" autoComplete="nickname" />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {t('guest.sheet.enter')}
          </Button>
          <ErrorText>{error}</ErrorText>
          <p className="text-center text-[11px] text-moon-200/45">{t('guest.sheet.limits')}</p>
        </form>
      </div>
    </div>
  )
}
