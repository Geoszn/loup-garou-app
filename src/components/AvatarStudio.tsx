import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { tierForPoints, tierLabel } from '../lib/ranks'
import { Avatar } from './Avatar'
import { ConfirmDialog, ErrorText, Input } from './ui'
import {
  ACCESSORIES,
  AVATAR_BGS,
  DEFAULT_AVATAR_CONFIG,
  HAIRS,
  HEADWEAR,
  OUTFITS,
  PART_MIN_POINTS,
  SKIN_TONES,
  type AvatarConfig,
  type AvatarMood,
} from '../lib/avatarParts'

type Tab = 'looks' | 'skin' | 'hair' | 'outfit' | 'head' | 'acc' | 'bg'
type PartKind = 'hair' | 'outfit' | 'head' | 'acc'

const TABS: { id: Tab; icon: string; label: TranslationKey }[] = [
  { id: 'looks', icon: '✨', label: 'avatar.tab.looks' },
  { id: 'skin', icon: '🎨', label: 'avatar.tab.skin' },
  { id: 'hair', icon: '💇', label: 'avatar.tab.hair' },
  { id: 'outfit', icon: '👕', label: 'avatar.tab.outfit' },
  { id: 'head', icon: '🎩', label: 'avatar.tab.head' },
  { id: 'acc', icon: '👓', label: 'avatar.tab.acc' },
  { id: 'bg', icon: '🖼️', label: 'avatar.tab.bg' },
]

const OPTIONS: Record<PartKind, readonly string[]> = { hair: HAIRS, outfit: OUTFITS, head: HEADWEAR, acc: ACCESSORIES }

const PART_LABEL: Record<PartKind, (value: string) => TranslationKey> = {
  hair: (v) => `avatar.hair.${v}` as TranslationKey,
  outfit: (v) => `avatar.outfit.${v}` as TranslationKey,
  head: (v) => `avatar.head.${v}` as TranslationKey,
  acc: (v) => `avatar.acc.${v}` as TranslationKey,
}

const MOODS: { id: AvatarMood; label: TranslationKey }[] = [
  { id: 'smile', label: 'avatar.mood.smile' },
  { id: 'sleep', label: 'avatar.mood.sleep' },
  { id: 'shock', label: 'avatar.mood.shock' },
  { id: 'talk', label: 'avatar.mood.talk' },
  { id: 'dead', label: 'avatar.mood.dead' },
]

const LOOKS: { label: TranslationKey; config: AvatarConfig }[] = [
  { label: 'avatar.look.sage', config: { skin: 4, hair: 'afro', outfit: 'cloak', acc: 'glasses', head: 'none', bg: 3 } },
  { label: 'avatar.look.queen', config: { skin: 3, hair: 'braids', outfit: 'royal', acc: 'ring', head: 'crown', bg: 4 } },
  { label: 'avatar.look.hunter', config: { skin: 2, hair: 'fade', outfit: 'hunter', acc: 'none', head: 'hat', bg: 1 } },
  { label: 'avatar.look.griot', config: { skin: 5, hair: 'gele', outfit: 'boubou', acc: 'hoops', head: 'none', bg: 2 } },
  { label: 'avatar.look.warrior', config: { skin: 3, hair: 'mohawk', outfit: 'armor', acc: 'facepaint', head: 'none', bg: 0 } },
  { label: 'avatar.look.wolf', config: { skin: 4, hair: 'locs', outfit: 'furcape', acc: 'scar', head: 'none', bg: 5 } },
]

const sameConfig = (a: AvatarConfig, b: AvatarConfig) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Éditeur d'avatar plein écran : aperçu fixe en haut, catégories en onglets,
 * vignettes qui montrent le rendu de chaque pièce sur l'avatar du joueur,
 * looks prêts à l'emploi, aléatoire / annuler / rétablir, aperçu des
 * expressions. Le parent gère l'enregistrement (`onSave` renvoie un message
 * d'erreur ou null) et le pseudo.
 */
export function AvatarStudio({
  open,
  onClose,
  initial,
  username,
  onUsernameChange,
  usernameLocked,
  usernameLockedNote,
  onSave,
  saving,
  error,
  success,
}: {
  open: boolean
  onClose: () => void
  initial: AvatarConfig | null
  username: string
  onUsernameChange: (value: string) => void
  usernameLocked: boolean
  usernameLockedNote: string | null
  onSave: (config: AvatarConfig) => void
  saving: boolean
  error: string | null
  success: string | null
}) {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const points = profile?.rank_points ?? 0
  const start = initial ?? DEFAULT_AVATAR_CONFIG

  const [config, setConfig] = useState<AvatarConfig>(start)
  const [past, setPast] = useState<AvatarConfig[]>([])
  const [future, setFuture] = useState<AvatarConfig[]>([])
  const [tab, setTab] = useState<Tab>('hair')
  const [mood, setMood] = useState<AvatarMood>('smile')
  const [lockedNote, setLockedNote] = useState<{ label: string; min: number } | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [pulse, setPulse] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setConfig(initial ?? DEFAULT_AVATAR_CONFIG)
    setPast([])
    setFuture([])
    setTab('hair')
    setMood('smile')
    setLockedNote(null)
    setEditingName(false)
    setConfirmDiscard(false)
    // Réinitialisé seulement à l'ouverture : les rechargements du profil en
    // arrière-plan ne doivent pas écraser ce que le joueur est en train de faire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [tab])

  const dirty = useMemo(() => !sameConfig(config, start), [config, start])
  const usernameDirty = username.trim().toLowerCase() !== (profile?.username ?? '').toLowerCase()

  function apply(next: AvatarConfig) {
    if (sameConfig(next, config)) return
    setPast((p) => [...p, config])
    setFuture([])
    setConfig(next)
    setPulse(true)
    setTimeout(() => setPulse(false), 180)
  }

  function undo() {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast(past.slice(0, -1))
    setFuture([config, ...future])
    setConfig(previous)
  }

  function redo() {
    const next = future[0]
    if (!next) return
    setFuture(future.slice(1))
    setPast([...past, config])
    setConfig(next)
  }

  function randomize() {
    const pickUnlocked = (kind: PartKind) => {
      const ok = OPTIONS[kind].filter((v) => points >= (PART_MIN_POINTS[kind] as Record<string, number>)[v])
      return ok[Math.floor(Math.random() * ok.length)]
    }
    apply({
      skin: Math.floor(Math.random() * SKIN_TONES.length),
      bg: Math.floor(Math.random() * AVATAR_BGS.length),
      hair: pickUnlocked('hair') as AvatarConfig['hair'],
      outfit: pickUnlocked('outfit') as AvatarConfig['outfit'],
      acc: pickUnlocked('acc') as AvatarConfig['acc'],
      head: pickUnlocked('head') as AvatarConfig['head'],
    })
  }

  function choosePart(kind: PartKind, value: string) {
    const min = (PART_MIN_POINTS[kind] as Record<string, number>)[value] ?? 0
    if (points < min) {
      setLockedNote({ label: t(PART_LABEL[kind](value)), min })
      return
    }
    setLockedNote(null)
    apply({ ...config, [kind]: value })
  }

  function requestClose() {
    if (dirty || usernameDirty) setConfirmDiscard(true)
    else onClose()
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!open) return null

  const zoom = tab === 'hair' || tab === 'head' || tab === 'acc' || tab === 'skin' ? 1.9 : 1

  const thumb = (cfg: AvatarConfig, active: boolean, scale: number) => (
    <span
      className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 transition-colors ${
        active ? 'border-moon-400 shadow-[0_0_0_2px_rgba(224,168,74,0.45)]' : 'border-night-600/60'
      }`}
    >
      <span className="block h-full w-full" style={{ transform: `scale(${scale})`, transformOrigin: '50% 38%' }}>
        <Avatar config={cfg} className="h-full w-full !rounded-none" />
      </span>
    </span>
  )

  let grid: ReactNode
  if (tab === 'looks') {
    grid = LOOKS.map((look) => (
      <button
        key={look.label}
        type="button"
        onClick={() => {
          setLockedNote(null)
          const blocked = (['hair', 'outfit', 'acc', 'head'] as const).some(
            (k) => points < (PART_MIN_POINTS[k] as Record<string, number>)[look.config[k]],
          )
          if (blocked) {
            const min = Math.max(
              ...(['hair', 'outfit', 'acc', 'head'] as const).map((k) => (PART_MIN_POINTS[k] as Record<string, number>)[look.config[k]]),
            )
            setLockedNote({ label: t(look.label), min })
            return
          }
          apply(look.config)
        }}
        className={`col-span-2 flex items-center gap-3 rounded-xl border p-2 text-left text-sm transition-colors ${
          sameConfig(look.config, config) ? 'border-moon-400 bg-moon-400/10' : 'border-night-600/60 bg-night-900/50 hover:border-moon-400/50'
        }`}
      >
        <Avatar config={look.config} className="h-14 w-14" />
        <span className="text-moon-200">{t(look.label)}</span>
      </button>
    ))
  } else if (tab === 'skin' || tab === 'bg') {
    const colors = tab === 'skin' ? SKIN_TONES : AVATAR_BGS
    const key = tab === 'skin' ? 'skin' : 'bg'
    grid = colors.map((color, i) => (
      <button
        key={color}
        type="button"
        aria-pressed={config[key] === i}
        aria-label={`${t(tab === 'skin' ? 'avatar.tab.skin' : 'avatar.tab.bg')} ${i + 1}`}
        onClick={() => {
          setLockedNote(null)
          apply({ ...config, [key]: i })
        }}
        className={`aspect-square w-full rounded-full border-2 transition-shadow ${
          config[key] === i ? 'border-moon-400 shadow-[0_0_0_3px_rgba(224,168,74,0.45)]' : 'border-night-600'
        }`}
        style={{ backgroundColor: color }}
      />
    ))
  } else {
    const kind = tab as PartKind
    grid = OPTIONS[kind].map((value) => {
      const min = (PART_MIN_POINTS[kind] as Record<string, number>)[value]
      const locked = points < min
      const active = config[kind] === value
      return (
        <button
          key={value}
          type="button"
          aria-pressed={active}
          onClick={() => choosePart(kind, value)}
          className={`flex flex-col items-center gap-1 text-[11px] ${locked ? 'opacity-60' : ''}`}
        >
          <span className="relative block w-full">
            {thumb({ ...config, [kind]: value } as AvatarConfig, active, zoom)}
            {locked && (
              <span className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/55 text-[11px] text-moon-200">
                <span className="text-base leading-none">🔒</span>
                {min} pts
              </span>
            )}
          </span>
          <span className={`max-w-full truncate ${active ? 'font-semibold text-moon-200' : 'text-moon-200/70'}`}>
            {t(PART_LABEL[kind](value))}
          </span>
        </button>
      )
    })
  }

  const iconButton = 'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-night-500 bg-gradient-to-b from-night-700/70 to-night-800/50 text-sm text-moon-200 transition-colors hover:border-night-500/80 disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-night-950 text-moon-200" role="dialog" aria-modal="true" aria-label={t('avatar.title')}>
      <div className="texture-noise" />
      <header className="relative flex items-center justify-between gap-2 border-b border-night-700/60 px-4 py-3" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}>
        <button
          type="button"
          onClick={requestClose}
          aria-label={t('common.close')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-night-600 bg-night-800/60 text-sm text-moon-200/70 hover:text-moon-200"
        >
          ✕
        </button>
        <div className="text-center">
          <p className="font-display text-base text-moon-200">{t('avatar.title')}</p>
          <p className="h-3 text-[10px] text-moon-300">{dirty || usernameDirty ? t('avatar.dirty') : ' '}</p>
        </div>
        <button
          type="button"
          onClick={() => onSave(config)}
          disabled={saving || !!success}
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-blood-500 to-blood-700 px-3.5 py-2 text-xs font-semibold text-[#fdf6e3] shadow-blood-btn transition-all active:scale-[0.97] disabled:opacity-40"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </header>

      <section className="relative flex flex-col items-center gap-2.5 px-4 pb-3 pt-4">
        <Avatar
          config={config}
          mood={mood}
          className={`h-32 w-32 ring-2 ring-moon-400/60 ring-offset-4 ring-offset-night-950 shadow-[0_0_40px_-6px_rgba(217,154,63,0.35)] transition-transform duration-200 ${pulse ? 'scale-105' : ''}`}
        />
        {editingName ? (
          <div className="w-full max-w-xs">
            <Input value={username} onChange={(e) => onUsernameChange(e.target.value)} maxLength={24} disabled={usernameLocked} autoFocus />
            {usernameLocked && usernameLockedNote && <p className="mt-1 text-xs text-moon-200/50">🔒 {usernameLockedNote}</p>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            aria-label={t('avatar.editName')}
            className="flex items-center gap-1.5 text-sm text-moon-200/90"
          >
            {username} <span className="text-xs text-moon-200/40">✎</span>
          </button>
        )}
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={randomize} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-night-500 bg-gradient-to-b from-night-700/70 to-night-800/50 px-3 text-xs font-semibold text-moon-200 active:scale-[0.97]">
            🎲 {t('avatar.random')}
          </button>
          <button type="button" onClick={undo} disabled={!past.length} title={t('avatar.undo')} aria-label={t('avatar.undo')} className={iconButton}>
            ↶
          </button>
          <button type="button" onClick={redo} disabled={!future.length} title={t('avatar.redo')} aria-label={t('avatar.redo')} className={iconButton}>
            ↷
          </button>
          <button
            type="button"
            onClick={() => apply(start)}
            disabled={!dirty}
            title={t('avatar.reset')}
            aria-label={t('avatar.reset')}
            className={iconButton}
          >
            ⟲
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-moon-200/50">
          <span>{t('avatar.preview')} :</span>
          {MOODS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mood === m.id}
              onClick={() => setMood(m.id)}
              className={`rounded-full border px-2.5 py-1 transition-colors ${
                mood === m.id ? 'border-moon-400 bg-moon-400/15 text-moon-200' : 'border-night-600 bg-night-800/60'
              }`}
            >
              {t(m.label)}
            </button>
          ))}
        </div>
      </section>

      <nav className="relative flex gap-1 overflow-x-auto border-y border-night-700/60 bg-night-900/60 px-2 py-2 [scrollbar-width:none]">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => {
              setTab(item.id)
              setLockedNote(null)
            }}
            className={`flex min-w-[54px] flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition-colors ${
              tab === item.id ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/60'
            }`}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {t(item.label)}
          </button>
        ))}
      </nav>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {lockedNote && (
          <div className="mb-3 rounded-xl border border-moon-400/30 bg-moon-400/5 px-3 py-2 text-xs text-moon-200/80">
            🔒{' '}
            {t('avatar.lockedMsg', {
              points: lockedNote.min,
              tier: tierLabel(tierForPoints(lockedNote.min).id, t),
              missing: Math.max(lockedNote.min - points, 0),
            })}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-night-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-moon-300 to-moon-400"
                style={{ width: `${Math.min(Math.round((points / lockedNote.min) * 100), 100)}%` }}
              />
            </div>
          </div>
        )}
        <div className={`grid gap-2.5 ${tab === 'skin' || tab === 'bg' ? 'grid-cols-6' : 'grid-cols-4'}`}>{grid}</div>
      </div>

      <div className="relative border-t border-night-700/60 bg-night-900/95 px-4 pt-3 shadow-[0_-8px_24px_-4px_rgba(0,0,0,0.5)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
        <ErrorText>{error}</ErrorText>
        {success && <p className="mb-2 text-center text-sm text-emerald-400">{success}</p>}
        <button
          type="button"
          onClick={() => onSave(config)}
          disabled={saving || !!success}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-blood-500 to-blood-700 px-3.5 py-3.5 text-sm font-semibold text-[#fdf6e3] shadow-blood-btn transition-all active:scale-[0.97] disabled:opacity-40"
        >
          {saving ? t('common.saving') : t('avatar.saveFull')}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title={t('avatar.discardTitle')}
        message={t('avatar.discardMessage')}
        confirmLabel={t('avatar.discardConfirm')}
        cancelLabel={t('avatar.discardCancel')}
        onConfirm={() => {
          setConfirmDiscard(false)
          onClose()
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
