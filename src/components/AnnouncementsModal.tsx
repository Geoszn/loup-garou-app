import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { cachedRpc } from '../lib/rpcCache'
import { homeSection } from '../lib/homeBootstrap'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from './Avatar'
import { useMyAvatarConfig } from './AvatarEditor'
import { LoupCoinIcon } from './LoupCoinIcon'
import { Hut } from './tribe/HutArt'
import type { AvatarConfig } from '../lib/avatarParts'
import type { MySeason } from '../types/season'

/** Clé de l'annonce des avatars (voir migration 0194) : ne jamais la
 * réutiliser pour une autre annonce. */
export const AVATARS_ANNOUNCEMENT_KEY = 'avatars-2026-09'

/** Clé de l'annonce de lancement d'une saison — une par saison (son slug),
 * jamais réutilisée d'une saison à l'autre : chaque nouvelle saison doit
 * pouvoir re-déclencher sa propre annonce, contrairement à AVATARS_ANNOUNCEMENT_KEY
 * ci-dessus qui ne concerne qu'un seul évènement figé. */
/** Annonce de l'arrivée des tribus (octobre 2026) : ne jamais la réutiliser. */
export const TRIBES_ANNOUNCEMENT_KEY = 'tribes-launch-2026-10'

/** Annonce de la collection boutique Octobre Rose (migration 0218). */
export const STORE_ANNOUNCEMENT_KEY = 'store-pink-october-2026'

// Les cinq looks de la vitrine de l'annonce « nouveautés boutique » : de vrais
// avatars qui portent des pièces de la collection, sur le fond Nuit Étoilée.
const showcaseLook = (o: Partial<AvatarConfig>): AvatarConfig => ({ skin: 3, hair: 'braids', outfit: 'tunic', acc: 'none', head: 'none', face: 'oval', bg: 6, ...o })
const STORE_LOOKS = {
  gala: showcaseLook({ skin: 2, hair: 'ponytail_pop', outfit: 'gala_gown', acc: 'lipstick_pink' }),
  cowboy: showcaseLook({ skin: 3, hair: 'braids_pink', outfit: 'varsity', head: 'cowboy_pink' }),
  biker: showcaseLook({ skin: 4, hair: 'beard_full', outfit: 'tracksuit_neon', acc: 'gold_chain', head: 'bandana_biker' }),
  ken: showcaseLook({ skin: 0, hair: 'pompadour_ken', outfit: 'hawaiian', acc: 'toothpick' }),
  afro: showcaseLook({ skin: 5, hair: 'afro_pink', outfit: 'varsity', acc: 'cigarette' }),
}
const STORE_SPARKLES: [number, number, number][] = [[8, 14, 10], [88, 10, 14], [20, 72, 8], [92, 62, 10], [50, 6, 8], [74, 84, 8], [6, 44, 7], [60, 92, 6]]

function seasonAnnouncementKey(slug: string): string {
  return `season-launch-${slug}`
}

interface Compensation {
  amount: number
  quests_count: number
}

type Slide = 'avatars' | 'compensation' | 'season' | 'store' | 'tribes'

const SHOWCASE: AvatarConfig[] = [
  { skin: 4, hair: 'afro', outfit: 'cloak', acc: 'glasses', head: 'none', face: 'round', bg: 3 },
  { skin: 3, hair: 'braids', outfit: 'royal', acc: 'ring', head: 'crown', face: 'oval', bg: 4 },
  { skin: 2, hair: 'fade', outfit: 'hunter', acc: 'none', head: 'hat', face: 'square', bg: 1 },
  { skin: 5, hair: 'gele', outfit: 'boubou', acc: 'hoops', head: 'none', face: 'heart', bg: 2 },
]

const BANNER_STARS = Array.from({ length: 26 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53) % 70, s: 1 + (i % 3) * 0.7 }))
const TRIBE_BAND = '#3b82c4'

/** Une case de l'île de l'annonce : taille et place en pixels dans la bannière. */
function BannerHut({ level, x, y, w, pips = 0, online = true }: { level: number; x: number; y: number; w: number; pips?: number; online?: boolean }) {
  return (
    <div className="absolute -translate-x-1/2" style={{ left: `${x}%`, top: y, width: w }}>
      <Hut level={level} band={TRIBE_BAND} online={online} role="membre" pips={pips} />
    </div>
  )
}

/** Bannière de l'annonce des tribus : l'île flottante sous les étoiles, avec des cases de plusieurs rangs. */
function TribesBanner() {
  return (
    <div className="relative h-52 w-full overflow-hidden" style={{ background: 'linear-gradient(#0a0922, #181240 55%, #3a2560)' }} aria-hidden="true">
      {BANNER_STARS.map((s, i) => (
        <span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: 0.7 }} />
      ))}
      <div className="absolute right-[26px] top-4 h-[34px] w-[34px] rounded-full" style={{ background: 'radial-gradient(circle at 38% 36%, #fffbe6, #f3e3a8 60%, #d8c27a)', boxShadow: '0 0 24px 6px rgba(255,238,170,.3)' }} />
      <div className="absolute left-1/2 top-[104px] h-[74px] w-[300px] -translate-x-1/2">
        <div className="absolute rounded-[50%]" style={{ inset: '14px 0 -14px', background: 'linear-gradient(#6a4a30,#2a1b14)', border: '2px solid #1c110c' }} />
        <div className="absolute inset-0 rounded-[50%]" style={{ background: 'radial-gradient(circle at 50% 40%, #5a8a4a, #2f5232 75%)', border: '2.5px solid #7fb86a' }} />
      </div>
      <BannerHut level={3} x={26} y={56} w={62} pips={2} />
      <BannerHut level={6} x={50} y={38} w={84} pips={3} />
      <BannerHut level={4} x={74} y={56} w={62} pips={1} />
      <BannerHut level={1} x={38} y={86} w={50} online={false} />
      <BannerHut level={2} x={62} y={86} w={50} />
    </div>
  )
}

/**
 * Popup d'annonces du tableau de bord : une carte par annonce en attente,
 * affichées l'une après l'autre. Aujourd'hui : l'arrivée des avatars (une
 * seule fois, et pas pour un joueur qui a déjà créé le sien) puis la
 * compensation de quêtes (migration 0188) pour ceux qui en ont une.
 */
export function AnnouncementsModal() {
  const { user, refreshProfile } = useAuth()
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const myAvatar = useMyAvatarConfig()
  const [seen, setSeen] = useState<string[] | null>(null)
  const [comp, setComp] = useState<Compensation | null | undefined>(undefined)
  const [season, setSeason] = useState<MySeason | null | undefined>(undefined)
  // Date de fin de vente de la collection boutique, ou null si elle n'est pas
  // (ou plus) en vente ; undefined = pas encore vérifié.
  const [store, setStore] = useState<{ ends: string; from: number } | null | undefined>(undefined)
  const [slides, setSlides] = useState<Slide[] | null>(null)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.rpc('get_my_seen_announcements').then(({ data }) => setSeen(Array.isArray(data) ? (data as string[]) : []))
    supabase.rpc('get_my_quest_compensation').then(({ data }) => setComp(data ? (data as Compensation) : null))
    homeSection<MySeason>('season', async () => (await cachedRpc<MySeason>('get_my_season')).data).then((data) => setSeason(data ?? null))
  }, [user])

  // La collection boutique n'est annoncée que si elle est réellement en vente
  // (au moins un skin des catégories « accessoires » / « fonds », créées avec
  // elle) et seulement à ceux qui n'ont pas encore vu l'annonce.
  useEffect(() => {
    if (!user || seen === null) return
    if (seen.includes(STORE_ANNOUNCEMENT_KEY)) {
      setStore(null)
      return
    }
    let active = true
    supabase.rpc('list_store_skins').then(({ data, error }) => {
      if (!active) return
      const list = !error && Array.isArray(data) ? (data as { category: string; owned: boolean; ends_at: string | null; price_coins: number }[]) : []
      const fresh = list.filter((s) => (s.category === 'accessoires' || s.category === 'fonds') && !s.owned && s.ends_at && new Date(s.ends_at).getTime() > Date.now())
      setStore(fresh.length > 0 ? { ends: fresh.map((s) => s.ends_at as string).sort()[0], from: Math.min(...list.filter((s) => s.ends_at && !s.owned).map((s) => s.price_coins)) } : null)
    })
    return () => {
      active = false
    }
  }, [user, seen])

  // Composé une seule fois, quand tout est chargé : évite qu'une carte
  // apparaisse ou disparaisse pendant que le joueur lit.
  useEffect(() => {
    if (slides || seen === null || comp === undefined || season === undefined || store === undefined || !myAvatar.loaded) return
    const list: Slide[] = []
    const avatarSeen = seen.includes(AVATARS_ANNOUNCEMENT_KEY)
    if (!avatarSeen && !myAvatar.config) list.push('avatars')
    // Un joueur qui a déjà créé son avatar connaît la nouveauté.
    if (!avatarSeen && myAvatar.config) void supabase.rpc('mark_announcement_seen', { p_key: AVATARS_ANNOUNCEMENT_KEY })
    // Annonce de lancement de saison : seulement tant qu'elle est vraiment
    // EN COURS (season.is_active) — jamais rejouée si le joueur ouvre
    // l'appli après coup, une fois la saison déjà bien avancée ou terminée.
    // Les tribus : une seule fois, pour tout le monde.
    if (!seen.includes(TRIBES_ANNOUNCEMENT_KEY)) list.push('tribes')
    if (season && season.is_active && !seen.includes(seasonAnnouncementKey(season.slug))) list.push('season')
    if (store) list.push('store')
    if (comp) list.push('compensation')
    setSlides(list)
  }, [slides, seen, comp, season, store, myAvatar.loaded, myAvatar.config])

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

  function markSeasonSeen() {
    if (season) void supabase.rpc('mark_announcement_seen', { p_key: seasonAnnouncementKey(season.slug) })
  }

  function seasonNext() {
    markSeasonSeen()
    advance()
  }

  function seasonDiscover() {
    markSeasonSeen()
    setSlides([])
    navigate('/recompenses?tab=season')
  }

  function markTribesSeen() {
    void supabase.rpc('mark_announcement_seen', { p_key: TRIBES_ANNOUNCEMENT_KEY })
  }

  function tribesNext() {
    markTribesSeen()
    advance()
  }

  function tribesDiscover() {
    markTribesSeen()
    setSlides([])
    navigate('/tribu')
  }

  function markStoreSeen() {
    void supabase.rpc('mark_announcement_seen', { p_key: STORE_ANNOUNCEMENT_KEY })
  }

  function storeNext() {
    markStoreSeen()
    advance()
  }

  function storeDiscover() {
    markStoreSeen()
    setSlides([])
    navigate('/recompenses?tab=store&section=skins')
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
        className="flex max-h-full w-full max-w-sm animate-modal-in flex-col items-center gap-4 overflow-y-auto overflow-x-hidden rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 px-6 pb-5 pt-6 text-center shadow-card"
      >
        {total > 1 && (
          <div className="flex w-full items-center justify-between text-[11px] text-moon-200/50">
            <span className="font-semibold uppercase tracking-[0.18em]">{t('announce.counter', { n: index + 1, total })}</span>
            {!isLast && (
              <button type="button" onClick={current === 'avatars' ? avatarsNext : current === 'tribes' ? tribesNext : advance} className="transition hover:text-moon-100">
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

        {current === 'tribes' && (
          <>
            <div className={`-mx-6 w-[calc(100%+3rem)] shrink-0 self-stretch ${total > 1 ? '' : '-mt-6'}`}>
              <TribesBanner />
            </div>
            <span className="rounded-full border border-moon-400/40 bg-moon-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-moon-300">
              {t('announce.tribes.badge')}
            </span>
            <h2 className="font-display text-xl leading-tight text-moon-200">{t('announce.tribes.title')}</h2>
            <p className="text-sm leading-relaxed text-moon-200/80">{t('announce.tribes.body')}</p>
            <ul className="flex w-full flex-col gap-1.5 text-left text-xs text-moon-200/70">
              {([['🏝️', 'announce.tribes.b1'], ['💬', 'announce.tribes.b2'], ['⭐', 'announce.tribes.b3']] as const).map(([icon, key]) => (
                <li key={key} className="flex items-center gap-2 rounded-xl border border-night-600/60 bg-night-900/50 px-3 py-2">
                  <span aria-hidden="true">{icon}</span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </>
        )}

        {current === 'season' && season && (
          <>
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">
              {t('announce.season.badge')}
            </span>
            <span className="text-4xl" aria-hidden="true">🍂</span>
            <h2 className="font-display text-xl text-moon-200">{t('announce.season.title', { name: lang === 'en' ? season.name_en : season.name_fr })}</h2>
            <p className="text-sm leading-relaxed text-moon-200/80">{t('announce.season.body')}</p>
          </>
        )}

        {current === 'store' && store && (
          <>
            <div
              className={`relative -mx-6 h-52 shrink-0 self-stretch overflow-hidden ${total > 1 ? '' : '-mt-6'}`}
              style={{ background: 'linear-gradient(180deg,#2a0f45 0%,#7a2a78 62%,#e0558f 100%)' }}
            >
              {STORE_SPARKLES.map(([x, y, size], i) => (
                <span key={i} aria-hidden="true" className="pointer-events-none absolute text-pink-100" style={{ left: `${x}%`, top: `${y}%`, fontSize: size, opacity: 0.85 }}>
                  ✦
                </span>
              ))}
              <span className="absolute left-1/2 top-2.5 z-20 -translate-x-1/2 rounded-full bg-pink-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow">
                {t('announce.store.badge')}
              </span>
              <Avatar config={STORE_LOOKS.ken} className="absolute left-3 top-[96px] h-[72px] w-[72px] -rotate-6 shadow-lg ring-2 ring-night-900" />
              <Avatar config={STORE_LOOKS.afro} className="absolute right-3 top-[96px] h-[72px] w-[72px] rotate-6 shadow-lg ring-2 ring-night-900" />
              <Avatar config={STORE_LOOKS.cowboy} className="absolute left-10 top-[34px] h-[84px] w-[84px] -rotate-3 shadow-lg ring-2 ring-night-900" />
              <Avatar config={STORE_LOOKS.biker} className="absolute right-10 top-[34px] h-[84px] w-[84px] rotate-3 shadow-lg ring-2 ring-night-900" />
              <Avatar config={STORE_LOOKS.gala} className="absolute left-1/2 top-[52px] z-10 h-[124px] w-[124px] -translate-x-1/2 shadow-xl ring-4 ring-pink-300/80" />
            </div>
            <h2 className="font-display text-xl leading-tight text-moon-200">{t('announce.store.title')}</h2>
            <p className="text-sm leading-relaxed text-moon-200/80">
              {t('announce.store.body', { date: new Date(store.ends).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' }) })}
            </p>
            <p className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
              {t('announce.store.from', { n: store.from })} <LoupCoinIcon className="h-3.5 w-3.5" /> · {t('announce.store.tryFirst')}
            </p>
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
          {current === 'tribes' && (
            <>
              <button type="button" onClick={tribesDiscover} className={primaryButton}>
                {t('announce.tribes.cta')}
              </button>
              <button type="button" onClick={tribesNext} className={linkButton}>
                {t('announce.tribes.later')}
              </button>
            </>
          )}
          {current === 'season' && (
            <>
              <button type="button" onClick={seasonDiscover} className={primaryButton}>
                {t('announce.season.cta')}
              </button>
              <button type="button" onClick={seasonNext} className={linkButton}>
                {t('announce.season.later')}
              </button>
            </>
          )}
          {current === 'store' && (
            <>
              <button type="button" onClick={storeDiscover} className={primaryButton}>
                {t('announce.store.cta')}
              </button>
              <button type="button" onClick={storeNext} className={linkButton}>
                {t('announce.store.later')}
              </button>
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
