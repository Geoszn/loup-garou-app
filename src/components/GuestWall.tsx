import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { Button, Card, Input, Label } from './ui'

// Écrans réservés aux comptes, vus par un invité (compte temporaire, migration 0250). Le serveur refuse de toute façon ces actions à un
// invité (guest_guard) : ces écrans servent à expliquer pourquoi et à proposer de créer un compte.

export type GuestFeature = 'rewards' | 'tribe' | 'friends' | 'profile' | 'stats' | 'account' | 'create'

const WALL_TITLE: Record<GuestFeature, TranslationKey> = {
  rewards: 'guest.wall.rewards',
  tribe: 'guest.wall.tribe',
  friends: 'guest.wall.friends',
  profile: 'guest.wall.profile',
  stats: 'guest.wall.stats',
  account: 'guest.wall.account',
  create: 'guest.wall.create',
}

const PERKS: TranslationKey[] = ['guest.perk.store', 'guest.perk.rank', 'guest.perk.social', 'guest.perk.quests', 'guest.perk.avatar', 'guest.perk.create']

/** Contenu du mur : ce que le compte débloque, et les deux sorties (créer un compte / en utiliser un existant). */
export function GuestWallBody({ feature, hideTitle = false }: { feature: GuestFeature; hideTitle?: boolean }) {
  const { t } = useLanguage()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="text-center">
      <div className="mb-2 text-4xl" aria-hidden="true">
        🔒
      </div>
      {!hideTitle && <h2 className="mb-1 font-display text-xl text-moon-200">{t(WALL_TITLE[feature])}</h2>}
      <p className="mb-4 text-sm text-moon-200/60">{t(feature === 'create' ? 'guest.wall.createBody' : 'guest.wall.body')}</p>
      <ul className="mb-5 flex flex-col gap-1.5 rounded-2xl border border-night-600/60 bg-night-900/50 p-3 text-left text-sm">
        {PERKS.map((k) => (
          <li key={k} className="text-moon-200/80">
            {t(k)}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2.5">
        <Button className="w-full" onClick={() => navigate('/creer-mon-compte')}>
          {t('guest.wall.createAccount')}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={async () => {
            await signOut()
            navigate('/connexion')
          }}
        >
          {t('guest.wall.haveAccount')}
        </Button>
      </div>
      {profile?.username && <p className="mt-3 text-[11px] text-moon-200/40">{t('guest.wall.keepNote', { name: profile.username })}</p>}
    </div>
  )
}

/** Page entière affichée à la place d'un écran réservé aux comptes. */
export function GuestWall({ feature }: { feature: GuestFeature }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <GuestWallBody feature={feature} />
      </Card>
    </div>
  )
}

/** N'affiche `children` qu'à un compte ; un invité voit le mur correspondant (ou `fallback` s'il est fourni). */
export function AccountOnly({ feature, fallback, children }: { feature: GuestFeature; fallback?: ReactNode; children: ReactNode }) {
  const { isGuest } = useAuth()
  if (!isGuest) return <>{children}</>
  return <>{fallback ?? <GuestWall feature={feature} />}</>
}

/** Accueil d'un invité (à la place du tableau de bord) : rejoindre une partie avec un code, ou créer un compte. */
export function GuestHome() {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) {
      setError(t('guest.sheet.invalidCode'))
      return
    }
    // JoinByLink gère déjà tout (partie au salon ou en cours, choix regarder / rejoindre).
    navigate(`/rejoindre/${clean}`)
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <div className="mb-2 text-4xl" aria-hidden="true">
          🎭
        </div>
        <h1 className="mb-1 font-display text-2xl text-moon-200">{t('guest.home.welcome', { name: profile?.username ?? '' })}</h1>
        <p className="mb-5 text-sm text-moon-200/60">{t('guest.home.body')}</p>
        <form onSubmit={submit} className="flex flex-col gap-3 text-left">
          <div>
            <Label htmlFor="guest-code">{t('guest.sheet.code')}</Label>
            <Input
              id="guest-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="AB12CD"
              maxLength={8}
              className="text-center font-display text-lg tracking-[0.3em]"
            />
          </div>
          {error && <p className="text-xs text-blood-400">{error}</p>}
          <Button type="submit" className="w-full">
            {t('guest.home.join')}
          </Button>
        </form>
        <div className="mt-3 flex flex-col gap-2.5">
          <Button variant="ghost" className="w-full" onClick={() => navigate('/jouer')}>
            {t('guest.home.publicGames')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/creer-mon-compte')}>
            {t('guest.wall.createAccount')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** Bandeau « tu joues en invité » affiché en haut de la partie et du salon. */
export function GuestBanner() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-moon-400/30 bg-moon-400/[0.07] p-3">
      <span className="text-xl" aria-hidden="true">
        🎭
      </span>
      <p className="flex-1 text-xs text-moon-200/80">{t('guest.banner.text')}</p>
      <Button className="!px-3 !py-2 text-[11px]" onClick={() => navigate('/creer-mon-compte')}>
        {t('guest.banner.cta')}
      </Button>
    </div>
  )
}

/** Écran de fin d'un invité : à la place de la carte de rang, ce qu'il aurait gagné avec un compte. */
export function GuestEndTeaser({ pointsPreview }: { pointsPreview: number | null }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  return (
    <div className="rounded-3xl border border-dashed border-moon-400/40 bg-night-900/50 p-4 text-left">
      <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-widest text-moon-300">{t('guest.end.title')}</p>
      <div className="flex items-start justify-around gap-2 text-center">
        {pointsPreview !== null && (
          <div className="flex-1">
            <p className={`text-2xl font-bold ${pointsPreview >= 0 ? 'text-emerald-300' : 'text-blood-400'}`}>
              {pointsPreview >= 0 ? '+' : ''}
              {pointsPreview}
            </p>
            <p className="text-[10px] text-moon-200/55">{t('guest.end.points')}</p>
          </div>
        )}
        <div className="flex-1">
          <p className="text-2xl">🎁</p>
          <p className="text-[10px] text-moon-200/55">{t('guest.end.coins')}</p>
        </div>
        <div className="flex-1">
          <p className="text-2xl">🎟️</p>
          <p className="text-[10px] text-moon-200/55">{t('guest.end.xp')}</p>
        </div>
      </div>
      <Button className="mt-4 w-full" onClick={() => navigate('/creer-mon-compte')}>
        {t('guest.end.cta')}
      </Button>
      <p className="mt-2 text-center text-[11px] text-moon-200/45">{t('guest.end.note')}</p>
    </div>
  )
}

const GUEST_VOICE_QUOTA_SECONDS = 1200

/** Temps de vocal restant à un invité (20 minutes par partie) et, une fois épuisé, la proposition de créer un compte. */
export function GuestVoiceCard({ endsAt, over }: { endsAt: number | null; over: boolean }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!endsAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [endsAt])
  if (!endsAt && !over) return null
  const left = endsAt ? Math.max(Math.round((endsAt - now) / 1000), 0) : 0
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div className="rounded-2xl border border-moon-400/30 bg-moon-400/[0.07] p-3">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold text-moon-300">{t('guest.voice.title')}</span>
        {!over && <span className="tabular-nums text-moon-200/70">{t('guest.voice.left', { time: `${mm}:${ss}` })}</span>}
      </div>
      {!over && (
        <div className="h-2 overflow-hidden rounded-full bg-night-800">
          <div className="h-full rounded-full bg-gradient-to-r from-moon-300 to-moon-400 transition-all" style={{ width: `${Math.min(100, (left / GUEST_VOICE_QUOTA_SECONDS) * 100)}%` }} />
        </div>
      )}
      <p className="mt-2 text-[11px] text-moon-200/55">{over ? t('guest.voice.over') : t('guest.voice.note')}</p>
      {over && (
        <button type="button" onClick={() => navigate('/creer-mon-compte')} className="mt-1 text-[11px] font-semibold text-moon-300 underline underline-offset-4">
          {t('guest.voice.createAccount')}
        </button>
      )}
    </div>
  )
}
