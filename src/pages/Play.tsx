import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { notifyJoinRequest } from '../lib/pushSubscription'
import { Button, ErrorText, Input, Label, Modal } from '../components/ui'
import { PublicGamesList } from '../components/PublicGamesBrowser'
import { HowToPlayButton } from '../components/HowToPlayButton'
import { useLanguage } from '../i18n/LanguageContext'

type JoinStep = 'closed' | 'choose' | 'public' | 'code'

const card =
  'flex w-full flex-col gap-3 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 p-5 text-left shadow-card transition-colors hover:border-moon-400/50 active:scale-[0.99] disabled:opacity-60'

/** Page « Jouer » : les deux façons de lancer une partie — créer ou rejoindre —
 * avec, pour chacune, ce qui se passe ensuite. */
export default function Play() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const displayName = profile?.username ?? t('common.playerFallback')

  const [newGamesEnabled, setNewGamesEnabled] = useState(true)
  useEffect(() => {
    supabase.rpc('get_app_status').then(({ data, error }) => {
      if (!error && data) setNewGamesEnabled(!!(data as { new_games_enabled: boolean }).new_games_enabled)
    })
  }, [])

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function handleCreate(isPublic: boolean) {
    setCreateError(null)
    setCreating(true)
    const { data, error } = await supabase.rpc('create_game', { p_display_name: displayName, p_settings: null, p_is_public: isPublic })
    setCreating(false)
    if (error) {
      setCreateError(error.message)
      return
    }
    navigate(`/partie/${data.code}/lobby`)
  }

  const [joinStep, setJoinStep] = useState<JoinStep>('closed')
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  function closeJoin() {
    setJoinStep('closed')
    setJoinError(null)
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    setJoinError(null)
    if (code.trim().length < 4) {
      setJoinError(t('dashboard.join.error.invalidCode'))
      return
    }
    setJoining(true)
    const { data, error } = await supabase.rpc('join_game', { p_code: code.trim().toUpperCase(), p_display_name: displayName })
    setJoining(false)
    if (error) {
      setJoinError(error.message)
      return
    }
    if (data.status === 'pending') {
      void notifyJoinRequest(data.game_id)
      navigate(`/attente/${data.game_id}`, { state: { code: data.code } })
      return
    }
    navigate(`/partie/${data.code}/lobby`)
  }

  return (
    <div className="min-h-screen px-4 pt-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-moon-200">{t('play.title')}</h1>
            <p className="mt-0.5 text-sm text-moon-200/60">{t('play.subtitle')}</p>
          </div>
          <HowToPlayButton className="shrink-0" />
        </header>

        {!newGamesEnabled && (
          <div className="rounded-xl border border-blood-700/40 bg-blood-700/10 px-4 py-2.5 text-sm text-moon-200/90">{t('play.paused')}</div>
        )}

        <button type="button" className={card} onClick={() => setCreateOpen(true)}>
          <span className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-moon-400/30 bg-moon-400/10 text-moon-300">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </span>
            <span className="font-display text-xl text-moon-200">{t('dashboard.createGame')}</span>
          </span>
          <span className="text-sm leading-relaxed text-moon-200/75">{t('play.create.text')}</span>
          <ul className="flex flex-col gap-1 text-xs text-moon-200/55">
            {(['play.create.p1', 'play.create.p2', 'play.create.p3'] as const).map((k) => (
              <li key={k} className="flex gap-2">
                <span className="text-moon-300">•</span>
                {t(k)}
              </li>
            ))}
          </ul>
        </button>

        <button type="button" className={card} onClick={() => setJoinStep('choose')}>
          <span className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-moon-400/30 bg-moon-400/10 text-moon-300">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H4" />
              </svg>
            </span>
            <span className="font-display text-xl text-moon-200">{t('dashboard.joinGame')}</span>
          </span>
          <span className="text-sm leading-relaxed text-moon-200/75">{t('play.join.text')}</span>
          <ul className="flex flex-col gap-1 text-xs text-moon-200/55">
            {(['play.join.p1', 'play.join.p2', 'play.join.p3'] as const).map((k) => (
              <li key={k} className="flex gap-2">
                <span className="text-moon-300">•</span>
                {t(k)}
              </li>
            ))}
          </ul>
        </button>

        <div className="flex flex-col gap-3 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 p-4 shadow-card">
          <p className="font-display text-base text-moon-200">{t('play.brief.title')}</p>
          {(
            [
              ['🌙', 'play.brief.night'],
              ['☀️', 'play.brief.day'],
              ['🏆', 'play.brief.win'],
            ] as const
          ).map(([icon, key]) => (
            <p key={key} className="flex gap-3 text-sm text-moon-200/70">
              <span aria-hidden="true">{icon}</span>
              {t(key)}
            </p>
          ))}
        </div>
      </div>

      <Modal open={createOpen} onClose={() => !creating && setCreateOpen(false)} title={`🌕 ${t('dashboard.create.title')}`}>
        <div className="flex flex-col gap-3">
          <ChoiceButton emoji="🔒" title={t('dashboard.create.private.title')} subtitle={t('dashboard.create.private.subtitle')} disabled={creating} onClick={() => handleCreate(false)} />
          <ChoiceButton emoji="🌍" title={t('dashboard.create.public.title')} subtitle={t('dashboard.create.public.subtitle')} disabled={creating} onClick={() => handleCreate(true)} />
        </div>
        {creating && <p className="mt-3 text-center text-xs text-moon-200/40">{t('dashboard.create.creating')}</p>}
        <ErrorText>{createError}</ErrorText>
      </Modal>

      <Modal open={joinStep !== 'closed'} onClose={closeJoin} title={`🔑 ${t('dashboard.join.title')}`}>
        {joinStep === 'choose' && (
          <div className="flex flex-col gap-3">
            <ChoiceButton emoji="🔍" title={t('dashboard.join.searchPublic.title')} subtitle={t('dashboard.join.searchPublic.subtitle')} onClick={() => setJoinStep('public')} />
            <ChoiceButton emoji="🔢" title={t('dashboard.join.enterCode.title')} subtitle={t('dashboard.join.enterCode.subtitle')} onClick={() => setJoinStep('code')} />
          </div>
        )}
        {joinStep === 'public' && (
          <div className="flex flex-col gap-3">
            <BackButton onClick={() => setJoinStep('choose')} />
            <PublicGamesList displayName={displayName} />
          </div>
        )}
        {joinStep === 'code' && (
          <div className="flex flex-col gap-3">
            <BackButton onClick={() => setJoinStep('choose')} />
            <form onSubmit={handleJoin} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="join-code">{t('dashboard.join.codeLabel')}</Label>
                <Input
                  id="join-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="AB12CD"
                  maxLength={8}
                  autoFocus
                  className="tracking-[0.3em] text-center font-display text-lg"
                />
              </div>
              <Button type="submit" disabled={joining} className="w-full">
                {joining ? t('dashboard.join.submitting') : t('dashboard.join.submit')}
              </Button>
              <ErrorText>{joinError}</ErrorText>
            </form>
          </div>
        )}
      </Modal>
    </div>
  )
}

function ChoiceButton({ emoji, title, subtitle, disabled, onClick }: { emoji: ReactNode; title: string; subtitle: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-night-600/60 bg-night-900/50 p-4 text-left transition-colors hover:border-moon-400/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="shrink-0 text-2xl">{emoji}</span>
      <span>
        <span className="block text-sm font-semibold text-moon-200">{title}</span>
        <span className="block text-xs text-moon-200/50">{subtitle}</span>
      </span>
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useLanguage()
  return (
    <button type="button" onClick={onClick} className="self-start text-xs text-moon-200/50 underline underline-offset-4 transition-colors hover:text-moon-200">
      ← {t('common.back')}
    </button>
  )
}
