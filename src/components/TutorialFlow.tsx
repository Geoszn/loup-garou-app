import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { ROLES, roleTeamLabel, type RoleId } from '../lib/roles'

const TOTAL = 8
// Phase de lune affichée en en-tête de chaque étape — clin d'œil au thème du
// jeu plutôt qu'une numérotation neutre, voir aperçu validé avant codage.
const MOON_PHASES = ['🌑', '🌒', '🌓', '🌔', '🌔', '🌕', '🌕', '🌕']

// Rôles montrés à l'étape 3 : un échantillon volontairement court (5 sur les
// 18 du jeu réel) — assez pour donner une idée du principe ("chacun a un
// pouvoir secret"), les règles complètes couvrent le reste. Données reprises
// de ROLES (lib/roles.ts) plutôt que redupliquées ici : mêmes emoji/couleurs/
// traductions que partout ailleurs dans l'app.
const ROLE_SHOWCASE: RoleId[] = ['loup_garou', 'voyante', 'sorciere', 'chasseur', 'sans_visage']

// Noms fictifs pour les mini-simulations (nuit, capitaine) — jamais de vrais
// pseudos de joueurs. Sonorité ouest-africaine, cohérente avec le thème
// "Loup Garou d'Afrique" du jeu.
const NIGHT_NAMES = ['Koffi', 'Amara', 'Séka']
const NIGHT_EMOJIS = ['🧑‍🌾', '👩‍🍳', '🧙']

/** Verrous par étape : true = pas besoin d'interagir pour avancer. Seules
 * l'accueil (0) et la fin (7) laissent passer sans action — les 6 autres
 * exigent une interaction avant que « Suivant » (ou glisser vers la gauche)
 * ne fonctionne. Retour utilisateur : un tutoriel qui ne propose que
 * Suivant/Retour "c'est ennuyeux" — chaque étape doit se mériter. */
const INITIAL_UNLOCKED = [true, false, false, false, false, false, false, true]

export function TutorialFlow({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const { t } = useLanguage()
  const [step, setStep] = useState(0)
  const [unlocked, setUnlocked] = useState(INITIAL_UNLOCKED)
  const [shaking, setShaking] = useState(false)
  const wellRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ el: HTMLElement | null; startX: number; dx: number }>({ el: null, startX: 0, dx: 0 })

  function unlockStep(i: number) {
    setUnlocked((u) => (u[i] ? u : u.map((v, idx) => (idx === i ? true : v))))
  }

  function shake() {
    setShaking(true)
    setTimeout(() => setShaking(false), 350)
  }

  function go(dir: 1 | -1) {
    if (dir === 1 && !unlocked[step]) {
      shake()
      return
    }
    const next = step + dir
    if (next < 0 || next >= TOTAL) return
    setStep(next)
  }

  // ---------- Glisser pour naviguer (au doigt/souris) ----------
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    // Jamais intercepté depuis un contrôle interactif de l'étape (bouton,
    // carte à retourner...) — seul le fond/texte de la carte déclenche le
    // glissement, comme pour la fermeture au glissement de Modal (ui.tsx).
    if (target.closest('button, [data-no-drag]')) return
    const el = e.currentTarget
    dragState.current = { el, startX: e.clientX, dx: 0 }
    el.setPointerCapture(e.pointerId)
    el.style.transition = 'none'
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragState.current
    if (!d.el) return
    d.dx = e.clientX - d.startX
    d.el.style.transform = `translateX(${d.dx}px) rotate(${d.dx / 24}deg)`
  }
  function onPointerUp() {
    const d = dragState.current
    if (!d.el) return
    const el = d.el
    el.style.transition = 'transform .25s ease'
    if (d.dx < -70) {
      if (!unlocked[step]) {
        el.style.transform = ''
        shake()
      } else {
        el.style.transform = 'translateX(-420px) rotate(-18deg)'
        setTimeout(() => go(1), 180)
      }
    } else if (d.dx > 70) {
      el.style.transform = 'translateX(420px) rotate(18deg)'
      setTimeout(() => go(-1), 180)
    } else {
      el.style.transform = ''
    }
    dragState.current = { el: null, startX: 0, dx: 0 }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-night-950 px-4 py-4 text-moon-200 sm:px-6" role="dialog" aria-modal="true">
      <div className="texture-noise" />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="mb-1.5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-night-600/70 bg-night-800/60 text-sm text-moon-200 transition-colors hover:border-moon-400/40"
          >
            ✕
          </button>
          <div className="flex flex-1 gap-1">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-night-600/50">
                <div
                  className="h-full bg-gradient-to-r from-blood-500 to-moon-400 transition-[width] duration-300"
                  style={{ width: i <= step ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
        </div>
        <p className="mb-3 text-center text-[10.5px] text-moon-200/30">{t('tuto.swipeHint')}</p>

        <div ref={wellRef} className="relative flex-1">
          <div
            className={`absolute inset-0 flex cursor-grab flex-col active:cursor-grabbing ${shaking ? 'animate-tuto-shake' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {step === 0 && <StepWelcome onUnlock={() => unlockStep(0)} />}
            {step === 1 && <StepCycle onUnlock={() => unlockStep(1)} />}
            {step === 2 && <StepRoles onUnlock={() => unlockStep(2)} />}
            {step === 3 && <StepNight onUnlock={() => unlockStep(3)} />}
            {step === 4 && <StepCaptain onUnlock={() => unlockStep(4)} />}
            {step === 5 && <StepQuiz onUnlock={() => unlockStep(5)} />}
            {step === 6 && <StepChest onUnlock={() => unlockStep(6)} />}
            {step === 7 && <StepFinish />}
          </div>
        </div>

        <div className="mt-3 flex gap-2.5">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => go(-1)}
            className="w-20 shrink-0 rounded-2xl border border-night-600/70 bg-transparent py-3.5 text-sm font-bold text-moon-200/60 transition-opacity disabled:opacity-30"
          >
            ‹ {t('tuto.back')}
          </button>
          <button
            type="button"
            onClick={() => (step === TOTAL - 1 ? onPlay() : go(1))}
            className={`flex-1 rounded-2xl bg-blood-600 py-3.5 text-sm font-extrabold text-[#fdf6e3] shadow-blood-btn transition-opacity ${
              step < TOTAL - 1 && !unlocked[step] ? 'opacity-40' : 'opacity-100'
            }`}
          >
            {step === TOTAL - 1 ? t('tuto.play') : t('tuto.next')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Eyebrow({ phase, n, label }: { phase: string; n: number; label: string }) {
  return (
    <p className="mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-moon-400">
      {phase} {n} / {TOTAL} — {label}
    </p>
  )
}

function Hint({ children, done }: { children: string; done?: boolean }) {
  if (done) return null
  return (
    <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] font-bold text-moon-300">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-moon-400" /> {children}
    </p>
  )
}

const stage = 'relative mb-3.5 flex min-h-[210px] flex-1 items-center justify-center overflow-hidden rounded-[22px] border border-night-600/60 bg-gradient-to-br from-night-700/50 to-night-950/60 p-4'

// ---------------- Step 1 : accueil, cartes à retourner ----------------
function StepWelcome({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLanguage()
  const [village, setVillage] = useState(false)
  const [loups, setLoups] = useState(false)

  useEffect(() => {
    if (village && loups) onUnlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [village, loups])

  return (
    <>
      <Eyebrow phase="🌑" n={1} label={t('tuto.step1.eyebrow')} />
      <h2 className="mb-3 font-display text-2xl leading-tight text-balance text-moon-200">{t('tuto.step1.title')}</h2>
      <div className={stage}>
        <div className="flex w-full gap-3" data-no-drag>
          <FlipCard
            flipped={village}
            onClick={() => setVillage(true)}
            emoji="🏘️"
            name={t('tuto.step1.village')}
            back={t('tuto.step1.villageBack')}
            backClass="border-emerald-400/35 bg-emerald-400/10"
          />
          <FlipCard
            flipped={loups}
            onClick={() => setLoups(true)}
            emoji="🐺"
            name={t('tuto.step1.loups')}
            back={t('tuto.step1.loupsBack')}
            backClass="border-blood-500/40 bg-blood-600/15"
          />
        </div>
      </div>
      <p className="text-[13.5px] leading-relaxed text-moon-200/75">{t('tuto.step1.body')}</p>
    </>
  )
}

function FlipCard({
  flipped,
  onClick,
  emoji,
  name,
  back,
  backClass,
}: {
  flipped: boolean
  onClick: () => void
  emoji: string
  name: string
  back: string
  backClass: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ perspective: '800px' }}
      className="relative h-36 flex-1"
    >
      {flipped && <span className="absolute right-1.5 top-1.5 z-10 text-xs text-moon-200">✓</span>}
      <div
        className="relative h-full w-full transition-transform duration-500"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}
      >
        <div
          className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-night-600/60 bg-night-800/60"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <span className="text-3xl">{emoji}</span>
          <span className="mt-1.5 font-display text-sm text-moon-200">{name}</span>
        </div>
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-2xl border p-2.5 text-center text-[11.5px] leading-snug text-moon-200/90 ${backClass}`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {back}
        </div>
      </div>
    </button>
  )
}

// ---------------- Step 2 : cycle jour/nuit ----------------
function StepCycle({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLanguage()
  const [picked, setPicked] = useState<'day' | 'night' | null>(null)
  const [seen, setSeen] = useState<{ day: boolean; night: boolean }>({ day: false, night: false })

  function pick(which: 'day' | 'night') {
    setPicked(which)
    const next = { ...seen, [which]: true }
    setSeen(next)
    if (next.day && next.night) onUnlock()
  }

  return (
    <>
      <Eyebrow phase="🌒" n={2} label={t('tuto.step2.eyebrow')} />
      <h2 className="mb-3 font-display text-2xl leading-tight text-balance text-moon-200">{t('tuto.step2.title')}</h2>
      <div className={stage}>
        <div className="flex w-full flex-col items-center gap-3.5" data-no-drag>
          <div className="flex w-full gap-2.5">
            <button
              type="button"
              onClick={() => pick('day')}
              className={`flex-1 rounded-2xl border px-3 py-3 text-center transition-colors ${
                picked === 'day' ? 'border-moon-400 bg-moon-400/10' : 'border-night-600/70 bg-night-800/50'
              }`}
            >
              <span className="block text-xl">☀️</span>
              <span className="mt-1 block text-[11px] font-bold text-moon-200">{t('tuto.step2.day')}</span>
            </button>
            <button
              type="button"
              onClick={() => pick('night')}
              className={`flex-1 rounded-2xl border px-3 py-3 text-center transition-colors ${
                picked === 'night' ? 'border-sky-400 bg-sky-400/10' : 'border-night-600/70 bg-night-800/50'
              }`}
            >
              <span className="block text-xl">🌙</span>
              <span className="mt-1 block text-[11px] font-bold text-moon-200">{t('tuto.step2.night')}</span>
            </button>
          </div>
          <p className="min-h-[3rem] text-center text-[12.5px] leading-relaxed text-moon-200/65">
            {picked === 'day' ? t('tuto.step2.dayText') : picked === 'night' ? t('tuto.step2.nightText') : t('tuto.step2.placeholder')}
          </p>
        </div>
      </div>
      <Hint done={seen.day && seen.night}>{t('tuto.step2.hint')}</Hint>
    </>
  )
}

// ---------------- Step 3 : rôles à retourner ----------------
function StepRoles({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLanguage()
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [seen, setSeen] = useState<Set<number>>(new Set([0]))
  const role = ROLES[ROLE_SHOWCASE[idx]]

  function nav(dir: 1 | -1) {
    setIdx((i) => (i + dir + ROLE_SHOWCASE.length) % ROLE_SHOWCASE.length)
    setFlipped(false)
  }
  function flip() {
    setFlipped((v) => !v)
    setSeen((s) => {
      const next = new Set(s)
      next.add(idx)
      if (next.size >= 3) onUnlock()
      return next
    })
  }

  return (
    <>
      <Eyebrow phase="🌓" n={3} label={t('tuto.step3.eyebrow')} />
      <h2 className="mb-3 font-display text-2xl leading-tight text-balance text-moon-200">{t('tuto.step3.title')}</h2>
      <div className={stage}>
        <button type="button" onClick={flip} className="flex w-full flex-col items-center" data-no-drag style={{ perspective: '800px' }}>
          <div
            className="relative h-36 w-full max-w-[220px] transition-transform duration-500"
            style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}
          >
            <div
              className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-night-600/60 bg-night-800/60 p-2.5"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <span className="text-4xl">{role.emoji}</span>
              <span className="mt-1.5 font-display text-base text-moon-200">{t(role.nameKey)}</span>
              <span
                className="mt-1 rounded-full px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide"
                style={{ background: `${role.color}30`, color: role.color }}
              >
                {roleTeamLabel(role.team, t)}
              </span>
            </div>
            <div
              className="absolute inset-0 flex items-center justify-center rounded-2xl border border-night-600/60 bg-night-800/70 p-3 text-center text-[11.5px] leading-snug text-moon-200/90"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              {t(role.descriptionKey)}
            </div>
          </div>
          <p className="mt-2 text-[10px] text-moon-200/35">{t('tuto.step3.tapHint')}</p>
        </button>
      </div>
      <div className="mb-1 flex items-center justify-center gap-3.5" data-no-drag>
        <button type="button" onClick={() => nav(-1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-night-600/70 bg-night-800/60 text-moon-200">
          ‹
        </button>
        <div className="flex gap-1.5">
          {ROLE_SHOWCASE.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-3.5 bg-moon-400' : seen.has(i) ? 'w-1.5 bg-moon-400/50' : 'w-1.5 bg-moon-200/20'}`}
            />
          ))}
        </div>
        <button type="button" onClick={() => nav(1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-night-600/70 bg-night-800/60 text-moon-200">
          ›
        </button>
      </div>
      <Hint done={seen.size >= 3}>{t('tuto.step3.hint')}</Hint>
    </>
  )
}

// ---------------- Step 4 : nuit, élimination simulée ----------------
function StepNight({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLanguage()
  const [picked, setPicked] = useState<number | null>(null)

  function pick(i: number) {
    setPicked(i)
    onUnlock()
  }

  return (
    <>
      <Eyebrow phase="🌔" n={4} label={t('tuto.step4.eyebrow')} />
      <h2 className="mb-3 font-display text-2xl leading-tight text-balance text-moon-200">{t('tuto.step4.title')}</h2>
      <div className={stage}>
        <div className="flex w-full flex-col items-center gap-3" data-no-drag>
          <div className="flex w-full justify-center gap-2.5">
            {NIGHT_NAMES.map((name, i) => (
              <button
                key={name}
                type="button"
                onClick={() => pick(i)}
                className={`relative w-[84px] rounded-2xl border px-1.5 py-2.5 text-center transition-colors ${
                  picked === i ? 'border-blood-500 bg-blood-600/15' : 'border-night-600/70 bg-night-800/50'
                }`}
              >
                <span className="block text-2xl">{NIGHT_EMOJIS[i]}</span>
                <span className="mt-1 block truncate text-[10.5px] text-moon-200/80">{name}</span>
                {picked === i && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-night-950/60 text-xl text-blood-400">✕</span>
                )}
              </button>
            ))}
          </div>
          <p className="min-h-[2.5rem] text-center text-[12px] font-semibold text-blood-400">
            {picked !== null ? t('tuto.step4.result', { name: NIGHT_NAMES[picked] }) : ''}
          </p>
        </div>
      </div>
      <Hint done={picked !== null}>{t('tuto.step4.hint')}</Hint>
    </>
  )
}

// ---------------- Step 5 : capitaine, vote décisif ----------------
function StepCaptain({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLanguage()
  const [picked, setPicked] = useState<number | null>(null)

  function pick(i: number) {
    setPicked(i)
    onUnlock()
  }

  return (
    <>
      <Eyebrow phase="🌔" n={5} label={t('tuto.step5.eyebrow')} />
      <h2 className="mb-3 font-display text-2xl leading-tight text-balance text-moon-200">{t('tuto.step5.title')}</h2>
      <div className={stage}>
        <div className="flex w-full flex-col items-center gap-3" data-no-drag>
          <p className="text-center text-[11.5px] text-moon-200/50">{t('tuto.step5.intro')}</p>
          <div className="flex w-full justify-center gap-5">
            {[0, 1].map((i) => (
              <div key={i} className="w-24 text-center">
                <button type="button" onClick={() => pick(i)} className="text-3xl transition-transform active:scale-90">
                  {NIGHT_EMOJIS[i]}
                </button>
                <p className="my-1.5 text-[11px] text-moon-200/70">
                  {NIGHT_NAMES[i]} — {picked === null ? 2 : picked === i ? 3 : 2}
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-night-600/50">
                  <div
                    className="h-full bg-gradient-to-r from-blood-500 to-moon-400 transition-[width] duration-500"
                    style={{ width: picked === null ? '40%' : picked === i ? '60%' : '40%' }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="min-h-[2.5rem] text-center text-[12px] font-semibold text-moon-300">
            {picked !== null ? t('tuto.step5.result', { name: NIGHT_NAMES[picked] }) : ''}
          </p>
        </div>
      </div>
      <Hint done={picked !== null}>{t('tuto.step5.hint')}</Hint>
    </>
  )
}

// ---------------- Step 6 : quiz ----------------
function StepQuiz({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLanguage()
  const [answered, setAnswered] = useState<number | null>(null)
  const correctIdx = 1

  function answer(i: number) {
    if (answered !== null) return
    setAnswered(i)
    onUnlock()
  }

  const opts = [t('tuto.step6.opt1'), t('tuto.step6.opt2'), t('tuto.step6.opt3')]

  return (
    <>
      <Eyebrow phase="🌕" n={6} label={t('tuto.step6.eyebrow')} />
      <h2 className="mb-3 font-display text-2xl leading-tight text-balance text-moon-200">{t('tuto.step6.title')}</h2>
      <div className="flex flex-col gap-2" data-no-drag>
        {opts.map((label, i) => {
          const isCorrect = i === correctIdx
          const show = answered !== null && (i === answered || isCorrect)
          return (
            <button
              key={label}
              type="button"
              onClick={() => answer(i)}
              disabled={answered !== null}
              className={`rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                show ? (isCorrect ? 'border-emerald-400 bg-emerald-400/10' : 'border-blood-500 bg-blood-600/10') : 'border-night-600/70 bg-night-800/50 text-moon-200'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <p className={`mt-2 min-h-[1.2rem] text-[12.5px] font-bold ${answered !== null && answered === correctIdx ? 'text-emerald-400' : 'text-blood-400'}`}>
        {answered !== null ? (answered === correctIdx ? t('tuto.step6.correct') : t('tuto.step6.wrong')) : ''}
      </p>
    </>
  )
}

// ---------------- Step 7 : coffre de Loup Coins ----------------
function StepChest({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLanguage()
  const [opened, setOpened] = useState(false)

  function open() {
    setOpened(true)
    onUnlock()
  }

  return (
    <>
      <Eyebrow phase="🌕" n={7} label={t('tuto.step7.eyebrow')} />
      <h2 className="mb-3 font-display text-2xl leading-tight text-balance text-moon-200">{t('tuto.step7.title')}</h2>
      <div className={stage}>
        <div className="flex flex-col items-center gap-2" data-no-drag>
          <button
            type="button"
            onClick={open}
            className={`text-6xl transition-transform active:scale-90 ${opened ? 'animate-tuto-pop' : ''}`}
            style={{ filter: 'drop-shadow(0 0 18px rgba(224,168,74,0.3))' }}
          >
            {opened ? '📬' : '🎁'}
          </button>
          <p className={`font-display text-xl text-moon-300 transition-opacity duration-300 ${opened ? 'opacity-100' : 'opacity-0'}`}>
            {t('tuto.step7.reward')}
          </p>
        </div>
      </div>
      <Hint done={opened}>{t('tuto.step7.hint')}</Hint>
    </>
  )
}

// ---------------- Step 8 : fin ----------------
function StepFinish() {
  const { t } = useLanguage()
  const [howled, setHowled] = useState(false)

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <button
        type="button"
        onClick={() => setHowled(true)}
        data-no-drag
        className={`mb-3 flex h-20 w-20 items-center justify-center rounded-full border border-moon-400/40 bg-[radial-gradient(circle,rgba(224,168,74,0.25),transparent_70%)] text-4xl transition-transform active:scale-90 ${
          howled ? 'animate-tuto-howl' : ''
        }`}
      >
        🐾
      </button>
      <h2 className="mb-2 font-display text-2xl leading-tight text-balance text-moon-200">{t('tuto.step8.title')}</h2>
      <p className="mb-1 max-w-xs text-[13.5px] leading-relaxed text-moon-200/75">{t('tuto.step8.body')}</p>
      <Hint done={howled}>{t('tuto.step8.hint')}</Hint>
      {howled && <p className="mt-1 text-[12.5px] font-bold text-moon-300">{t('tuto.step8.howled')}</p>}
    </div>
  )
}
