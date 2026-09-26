import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from './Avatar'
import { useMyAvatarConfig } from './AvatarEditor'
import { LoupCoinIcon } from './LoupCoinIcon'
import type { AvatarConfig } from '../lib/avatarParts'

/** Clé de l'annonce des avatars (voir migration 0194) : ne jamais la
 * réutiliser pour une autre annonce. */
export const AVATARS_ANNOUNCEMENT_KEY = 'avatars-2026-09'

interface Compensation {
  amount: number
  quests_count: number
}

type Slide = 'avatars' | 'compensation'

const SHOWCASE: AvatarConfig[] = [
  { skin: 4, hair: 'afro', outfit: 'cloak', acc: 'glasses', head: 'none', face: 'round', bg: 3 },
  { skin: 3, hair: 'braids', outfit: 'royal', acc: 'ring', head: 'crown', face: 'oval', bg: 4 },
  { skin: 2, hair: 'fade', outfit: 'hunter', acc: 'none', head: 'hat', face: 'square', bg: 1 },
  { skin: 5, hair: 'gele', outfit: 'boubou', acc: 'hoops', head: 'none', face: 'heart', bg: 2 },
]

/**
 * Popup d'annonces du tableau de bord : une carte par annonce en attente,
 * affichées l'une après l'autre. Aujourd'hui : l'arrivée des avatars (une
 * seule fois, et pas pour un joueur qui a déjà créé le sien) puis la
 * compensation de quêtes (migration 0188) pour ceux qui en ont une.
 */
export function AnnouncementsModal() {
  const { user, refreshProfile } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const myAvatar = useMyAvatarConfig()
  const [seen, setSeen] = useState<string[] | null>(null)
  const [comp, setComp] = useState<Compensation | null | undefined>(undefined)
  const [slides, setSlides] = useState<Slide[] | null>(null)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.rpc('get_my_seen_announcements').then(({ data }) => setSeen(Array.isArray(data) ? (data as string[]) : []))
    supabase.rpc('get_my_quest_compensation').then(({ data }) => setComp(data ? (data as Compensation) : null))
  }, [user])

  // Composé une seule fois, quand tout est chargé : évite qu'une carte
  // apparaisse ou disparaisse pendant que le joueur lit.
  useEffect(() => {
    if (slides || seen === null || comp === undefined || !myAvatar.loaded) return
    const list: Slide[] = []
    const avatarSeen = seen.includes(AVATARS_ANNOUNCEMENT_KEY)
    if (!avatarSeen && !myAvatar.config) list.push('avatars')
    // Un joueur qui a déjà créé son avatar connaît la nouveauté.
    if (!avatarSeen && myAvatar.config) void supabase.rpc('mark_announcement_seen', { p_key: AVATARS_ANNOUNCEMENT_KEY })
    if (comp) list.push('compensation')
    setSlides(list)
  }, [slides, seen, comp, myAvatar.loaded, myAvatar.config])

  if (!slides || slides.length === 0) return null
  const current = slides[index]
  const total = slides.length
  const isLast = index === total - 1

  function markAvatarsSeen() {
    void supabase.rpc('mark_announcement_seen', { p_key: AVATARS_ANNOUNCEMENT_KEY })
  }

  function advance() {
    if (isLast) setSlides([])
    else setIndex((i) => i + 1)
  }

  function avatarsNext() {
    markAvatarsSeen()
    advance()
  }

  function avatarsCreate() {
    markAvatarsSeen()
    setSlides([])
    navigate('/compte?avatar=1')
  }

  async function claim() {
    setBusy(true)
    const { error } = await supabase.rpc('claim_quest_compensation')
    setBusy(false)
    if (!error) {
      refreshProfile()
      advance()
    }
  }

  async function dismiss() {
    setBusy(true)
    await supabase.rpc('dismiss_quest_compensation')
    setBusy(false)
    advance()
  }

  const primaryButton =
    'inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-blood-500 to-blood-700 px-4 py-3 text-sm font-semibold text-[#fdf6e3] shadow-blood-btn transition-all active:scale-[0.97] disabled:opacity-50'
  const linkButton = 'rounded-xl px-4 py-1.5 text-sm text-moon-200/60 transition hover:text-moon-100 disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-full w-full max-w-sm animate-modal-in flex-col items-center gap-4 overflow-y-auto rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 px-6 pb-5 pt-6 text-center shadow-card"
      >
        {total > 1 && (
          <div className="flex w-full items-center justify-between text-[11px] text-moon-200/50">
            <span className="font-semibold uppercase tracking-[0.18em]">{t('announce.counter', { n: index + 1, total })}</span>
            {!isLast && (
              <button type="button" onClick={current === 'avatars' ? avatarsNext : advance} className="transition hover:text-moon-100">
                {t('announce.skip')}
              </button>
            )}
          </div>
        )}

        {current === 'avatars' && (
          <>
            {total === 1 && (
              <span className="rounded-full border border-moon-400/40 bg-moon-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-moon-300">
                {t('announce.avatars.badge')}
              </span>
            )}
            <div className={`relative ${total === 1 ? 'h-28 w-56' : 'h-24 w-48'}`}>
              {(total === 1 ? SHOWCASE : SHOWCASE.slice(0, 3)).map((config, i) => {
                const sizes = total === 1 ? ['h-20 w-20', 'h-24 w-24', 'h-20 w-20', 'h-16 w-16'] : ['h-16 w-16', 'h-20 w-20', 'h-16 w-16']
                const pos =
                  total === 1
                    ? ['left-0 top-6', 'left-[3.6rem] top-1', 'left-[8.2rem] top-6', 'left-[5.4rem] top-[3.2rem]']
                    : ['left-0 top-5', 'left-[3.2rem] top-0', 'left-[7.2rem] top-5']
                return (
                  <Avatar
                    key={i}
                    config={config}
                    className={`absolute ring-2 ring-night-900 ${sizes[i]} ${pos[i]}`}
                  />
                )
              })}
            </div>
            <h2 className="font-display text-xl text-moon-200">{t('announce.avatars.title')}</h2>
            <p className="text-sm leading-relaxed text-moon-200/80">{t('announce.avatars.body')}</p>
            {total === 1 && (
              <ul className="flex w-full flex-col gap-1.5 text-left text-xs text-moon-200/70">
                <li className="flex items-center gap-2 rounded-xl border border-night-600/60 bg-night-900/50 px-3 py-2">
                  <span aria-hidden="true">🎭</span>
                  {t('announce.avatars.bullet1')}
                </li>
                <li className="flex items-center gap-2 rounded-xl border border-night-600/60 bg-night-900/50 px-3 py-2">
                  <span aria-hidden="true">😴</span>
                  {t('announce.avatars.bullet2')}
                </li>
              </ul>
            )}
          </>
        )}

        {current === 'compensation' && (
          <>
            <LoupCoinIcon className={total > 1 ? 'h-14 w-14' : 'hidden'} />
            <h2 className="font-display text-xl text-moon-200">{t('questComp.title')}</h2>
            <p className="text-sm text-moon-200/80">{t('questComp.body')}</p>
            <div className="flex items-center gap-2 text-2xl font-semibold text-amber-300">
              <LoupCoinIcon className="h-7 w-7" />
              <span>+{comp?.amount ?? 0}</span>
            </div>
          </>
        )}

        {total > 1 && (
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {slides.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-moon-400' : 'w-1.5 bg-night-500'}`} />
            ))}
          </div>
        )}

        <div className="flex w-full flex-col gap-2">
          {current === 'avatars' && (
            <>
              {total === 1 ? (
                <>
                  <button type="button" onClick={avatarsCreate} className={primaryButton}>
                    {t('announce.avatars.cta')}
                  </button>
                  <button type="button" onClick={avatarsNext} className={linkButton}>
                    {t('announce.avatars.later')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={avatarsNext} className={primaryButton}>
                    {t('announce.next')}
                  </button>
                  <button type="button" onClick={avatarsCreate} className={linkButton}>
                    {t('announce.avatars.createNow')}
                  </button>
                </>
              )}
            </>
          )}
          {current === 'compensation' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={claim}
                className="inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-night-900 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {t('questComp.claim')}
              </button>
              <button type="button" disabled={busy} onClick={dismiss} className={linkButton}>
                {t('questComp.dismiss')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
