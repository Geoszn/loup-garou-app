import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { submitFeedback } from '../lib/feedback'
import { Button, ErrorText, Modal, SuccessText } from './ui'
import { useLanguage } from '../i18n/LanguageContext'

const MAX_CHARS = 2000
// Délai avant fermeture automatique de la pop-up après un envoi réussi —
// assez long pour que le message de confirmation soit bien lu, cohérent
// avec REDIRECT_DELAY_MS utilisé ailleurs dans l'app (Account.tsx).
const CLOSE_DELAY_MS = 1200

/** Bouton "Donner mon avis" + pop-up d'envoi de message à l'éditeur (voir
 * migration 0056_feedback.sql + api/feedback.ts). Volontairement générique
 * (pas de catégorie bug/suggestion à choisir) pour rester rapide à remplir —
 * un joueur pressé doit pouvoir écrire 2 phrases et repartir. Limité à un
 * message par semaine, vérifié ici pour l'affichage ET côté serveur pour
 * l'appliquer réellement (voir submit_feedback). */
export function FeedbackButton() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setMessage('')
    setError(null)
    setSuccess(false)
    setStatusLoading(true)
    supabase.rpc('get_my_feedback_status').then(({ data, error: rpcError }) => {
      if (!rpcError) setNextAllowedAt((data as { next_allowed_at: string | null })?.next_allowed_at ?? null)
      setStatusLoading(false)
    })
  }, [open])

  const onCooldown = !!nextAllowedAt
  const nextAllowedLabel = nextAllowedAt
    ? new Date(nextAllowedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const result = await submitFeedback(message.trim())
      setSuccess(true)
      setNextAllowedAt(result.next_allowed_at)
      setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('feedback.error.generic'))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="underline underline-offset-4 transition-colors hover:text-moon-200/70"
      >
        {t('feedback.openButton')}
      </button>

      <Modal open={open} onClose={() => !sending && setOpen(false)} title={`💬 ${t('feedback.title')}`}>
        {success ? (
          <SuccessText>{t('feedback.success')}</SuccessText>
        ) : statusLoading ? (
          <p className="text-sm text-moon-200/50">{t('common.loading')}</p>
        ) : onCooldown ? (
          <p className="text-sm text-moon-200/60">{t('feedback.cooldown', { date: nextAllowedLabel ?? '' })}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <p className="text-sm text-moon-200/50">{t('feedback.subtitle')}</p>
            <div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                placeholder={t('feedback.placeholder')}
                rows={5}
                maxLength={MAX_CHARS}
                autoFocus
                className="w-full resize-none rounded-xl border border-night-500 bg-night-800/80 px-4 py-3 text-sm text-moon-200 placeholder:text-moon-200/30 outline-none transition focus:border-moon-400/60 focus:ring-2 focus:ring-moon-400/20"
              />
              <p className="mt-1 text-right text-[11px] text-moon-200/30">{message.length}/{MAX_CHARS}</p>
            </div>

            <ErrorText>{error}</ErrorText>

            <Button type="submit" disabled={sending || !message.trim()} className="w-full">
              {sending ? t('feedback.sending') : t('feedback.submit')}
            </Button>
          </form>
        )}
      </Modal>
    </>
  )
}
