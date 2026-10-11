import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGoBack } from '../hooks/useGoBack'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { ROLES, ROLE_ORDER, roleTeamLabel, type RoleId } from '../lib/roles'
import { RANK_TIERS, tierForPoints, tierLabel } from '../lib/ranks'
import { TRIBE_CREATE_MIN_POINTS } from '../lib/tribe'
import { Button, Card, Modal, Segmented } from '../components/ui'
import { RoleCard, roleCardImageCandidates } from '../components/RoleCard'
import { RankTierBadge } from '../components/RankTierBadge'
import { LoupCoinIcon } from '../components/LoupCoinIcon'
import { FeedbackButton } from '../components/FeedbackButton'
import { TutorialFlow } from '../components/TutorialFlow'

type Screen = 'landing' | 'rules' | 'roles'
type RulesTab = 'bases' | 'ranking' | 'tribes'
type Camp = 'village' | 'loups' | 'neutre'

const CAMPS: Camp[] = ['village', 'loups', 'neutre']

/** Pastilles/anneaux de couleur par camp — mêmes teintes que partout ailleurs
 * dans l'appli (loups = sang, neutre = lune dorée, village = nuit bleutée). */
const CAMP_STYLE: Record<Camp, { chip: string; ring: string; text: string; tab: string }> = {
  village: {
    chip: 'bg-sky-400/15 text-sky-300',
    ring: 'border-sky-400/35',
    text: 'text-sky-300',
    tab: 'bg-sky-500/80 text-[#fdf6e3]',
  },
  loups: {
    chip: 'bg-blood-700/30 text-blood-400',
    ring: 'border-blood-500/45',
    text: 'text-blood-400',
    tab: 'bg-blood-600 text-[#fdf6e3]',
  },
  neutre: {
    chip: 'bg-moon-400/20 text-moon-300',
    ring: 'border-moon-400/45',
    text: 'text-moon-300',
    tab: 'bg-moon-500/85 text-night-950',
  },
}

const ROLES_BY_CAMP: Record<Camp, RoleId[]> = {
  village: ROLE_ORDER.filter((id) => ROLES[id].team === 'village'),
  loups: ROLE_ORDER.filter((id) => ROLES[id].team === 'loups'),
  neutre: ROLE_ORDER.filter((id) => ROLES[id].team === 'neutre'),
}

/** Page d'aide dédiée, publique (accessible sans compte). Trois écrans :
 * l'accueil (Tutoriel interactif / Règles de base / Les rôles), les règles
 * (Bases, Classement, Tribus en onglets) et la galerie des rôles — une
 * grille de cartes par camp qui ouvre une fiche complète (carte, objectif,
 * fonctionnement, forces, faiblesses) plutôt qu'une longue liste linéaire.
 * Retours utilisateur : "peu explicative, beaucoup n'aiment pas lire", puis
 * "pas une longue page linéaire de rôles".
 *
 * Lien profond : /aide?role=<id> ouvre directement la fiche d'un rôle (utilisé
 * par la pop-up d'annonce de la Reine Louve, par exemple).
 *
 * Accessible via le menu compte (AccountMenu.tsx, joueurs connectés) et via
 * un lien dans l'en-tête de Landing.tsx (visiteurs non connectés) — d'où le
 * bouton retour qui doit choisir la bonne destination selon la session. */
export default function Help() {
  const { t } = useLanguage()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const goBack = useGoBack(session ? '/profil' : '/')

  const linkedRole = useMemo<RoleId | null>(() => {
    const id = params.get('role')
    return id && id in ROLES ? (id as RoleId) : null
  }, [params])

  const [screen, setScreen] = useState<Screen>(linkedRole ? 'roles' : 'landing')
  // Quel onglet s'ouvre en arrivant sur l'écran Règles — les liens rapides
  // "Classement & Loup Coins" / "Les tribus" de l'accueil y renvoient
  // directement, plutôt que de forcer un second clic une fois sur place.
  const [rulesTab, setRulesTab] = useState<RulesTab>('bases')
  const [camp, setCamp] = useState<Camp>(linkedRole ? ROLES[linkedRole].team : 'village')
  const [sheetRole, setSheetRole] = useState<RoleId | null>(linkedRole)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  // Un second lien profond sans quitter la page (ex. nouvelle annonce) rouvre
  // la bonne fiche au lieu d'être ignoré.
  useEffect(() => {
    if (!linkedRole) return
    setScreen('roles')
    setCamp(ROLES[linkedRole].team)
    setSheetRole(linkedRole)
  }, [linkedRole])

  function openRules(tab: RulesTab) {
    setRulesTab(tab)
    setScreen('rules')
  }

  function openRoles(next?: Camp) {
    if (next) setCamp(next)
    setScreen('roles')
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={screen !== 'landing' ? () => setScreen('landing') : goBack}
            className="px-3.5 py-2 text-xs"
          >
            {t('common.back')}
          </Button>
          <h1 className="font-display text-2xl text-moon-200">{t('help.pageTitle')}</h1>
        </header>

        {screen === 'landing' && (
          <>
            <p className="text-sm text-moon-200/60">{t('help.landing.subtitle')}</p>

            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className="relative overflow-hidden rounded-2xl border border-moon-400/40 bg-gradient-to-br from-night-700/70 to-night-900/85 p-5 text-left shadow-card transition-colors hover:border-moon-400/60"
            >
              <span className="pointer-events-none absolute -right-6 -top-10 h-40 w-40 rounded-full bg-moon-400/25 blur-3xl" aria-hidden="true" />
              <span className="absolute right-4 top-4 rounded-full border border-moon-400/30 bg-moon-400/15 px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-moon-300">
                {t('help.landing.tuto.badge')}
              </span>
              <span className="relative mb-2.5 block text-3xl">🎬</span>
              <p className="relative font-display text-lg text-moon-200">{t('help.landing.tuto.title')}</p>
              <p className="relative mb-3 mt-1 max-w-[88%] text-xs text-moon-200/60">{t('help.landing.tuto.desc')}</p>
              <span className="relative text-xs font-extrabold uppercase tracking-wide text-moon-300">{t('help.landing.tuto.cta')}</span>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openRules('bases')}
                className="relative flex flex-col overflow-hidden rounded-2xl border border-night-600/70 bg-gradient-to-br from-night-700/70 to-night-900/85 p-4 text-left shadow-card transition-colors hover:border-sky-400/40"
              >
                <span className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-sky-400/15 blur-3xl" aria-hidden="true" />
                <span className="relative mb-2 block text-2xl">📖</span>
                <p className="relative font-display text-base text-moon-200">{t('help.landing.rules.title')}</p>
                <p className="relative mb-3 mt-1 text-xs text-moon-200/60">{t('help.landing.rules.desc')}</p>
                <span className="relative mt-auto text-xs font-extrabold uppercase tracking-wide text-sky-300">{t('help.landing.rules.cta')}</span>
              </button>

              <button
                type="button"
                onClick={() => openRoles()}
                className="relative flex flex-col overflow-hidden rounded-2xl border border-night-600/70 bg-gradient-to-br from-night-700/70 to-night-900/85 p-4 text-left shadow-card transition-colors hover:border-blood-500/50"
              >
                <span className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-blood-500/20 blur-3xl" aria-hidden="true" />
                <span className="relative mb-2 flex h-8 items-center gap-0.5 text-2xl" aria-hidden="true">
                  <span>🐺</span>
                  <span>🔮</span>
                  <span>🕸️</span>
                </span>
                <p className="relative font-display text-base text-moon-200">{t('help.landing.roles.title')}</p>
                <p className="relative mb-3 mt-1 text-xs text-moon-200/60">{t('help.landing.roles.desc')}</p>
                <span className="relative mt-auto text-xs font-extrabold uppercase tracking-wide text-blood-400">{t('help.landing.roles.cta')}</span>
              </button>
            </div>

            <div className="mt-1 flex flex-col divide-y divide-night-700/60 border-t border-night-700/60">
              <button
                type="button"
                onClick={() => openRules('ranking')}
                className="flex items-center justify-between gap-3 py-3.5 text-left text-sm text-moon-200/75 transition-colors hover:text-moon-200"
              >
                <span className="flex items-center gap-2">🏆 {t('help.landing.rankingLink')}</span>
                <span className="text-moon-200/30">›</span>
              </button>
              <button
                type="button"
                onClick={() => openRules('tribes')}
                className="flex items-center justify-between gap-3 py-3.5 text-left text-sm text-moon-200/75 transition-colors hover:text-moon-200"
              >
                <span className="flex items-center gap-2">🛡️ {t('help.landing.tribesLink')}</span>
                <span className="text-moon-200/30">›</span>
              </button>
              <div className="flex items-center justify-between gap-3 py-3.5 text-sm text-moon-200/75">
                <span className="flex items-center gap-2">
                  💬 <FeedbackButton />
                </span>
              </div>
            </div>
          </>
        )}

        {screen === 'rules' && (
          <>
            <Segmented<RulesTab>
              tabs={[
                { id: 'bases', label: t('help.tab.bases') },
                { id: 'ranking', label: t('help.tab.ranking') },
                { id: 'tribes', label: t('help.tab.tribes') },
              ]}
              active={rulesTab}
              onChange={setRulesTab}
            />
            {rulesTab === 'bases' && <BasesContent onOpenRoles={openRoles} />}
            {rulesTab === 'ranking' && (
              <Card className="flex flex-col gap-5 border-night-700/60 bg-night-900/40 text-left text-sm text-moon-200/70">
                <RankingContent />
              </Card>
            )}
            {rulesTab === 'tribes' && (
              <Card className="flex flex-col gap-5 border-night-700/60 bg-night-900/40 text-left text-sm text-moon-200/70">
                <TribesContent />
              </Card>
            )}
          </>
        )}

        {screen === 'roles' && <RolesGallery camp={camp} onCamp={setCamp} onOpen={setSheetRole} />}
      </div>

      <RoleSheet roleId={sheetRole} list={ROLES_BY_CAMP[camp]} onChange={setSheetRole} />

      {tutorialOpen && (
        <TutorialFlow
          onClose={() => setTutorialOpen(false)}
          onPlay={() => navigate(session ? '/jouer' : '/inscription')}
        />
      )}
    </div>
  )
}

/** Règles de base regroupées : les trois camps d'un coup d'œil (touchables,
 * ils ouvrent la galerie du camp), puis des lignes repliables — une seule
 * ouverte à la fois — plutôt qu'un long mur de texte. Mêmes clés de
 * traduction que l'ancien RulesPanel/RulesContent, rien de réécrit. */
function BasesContent({ onOpenRoles }: { onOpenRoles: (camp?: Camp) => void }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState<string>('objective')

  const rows: { id: string; title: string; text: string }[] = [
    { id: 'objective', title: t('rules.objective.title'), text: t('rules.objective.text') },
    { id: 'flow', title: t('rules.flow.title'), text: t('rules.flow.text') },
    { id: 'nightChat', title: t('rules.nightChat.title'), text: t('rules.nightChat.text') },
    { id: 'captain', title: t('rules.captain.title'), text: t('rules.captain.text') },
    { id: 'victory', title: t('rules.victory.title'), text: t('rules.victory.text') },
    { id: 'ghost', title: `👻 ${t('rules.ghost.title')}`, text: t('rules.ghost.text') },
  ]

  return (
    <>
      <section>
        <h2 className="mb-2 font-display text-sm text-moon-300">{t('help.bases.camps.title')}</h2>
        <div className="grid grid-cols-3 gap-2">
          {CAMPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onOpenRoles(c)}
              className={`flex flex-col gap-1 rounded-xl border bg-night-900/50 p-3 text-left transition-colors hover:bg-night-800/60 ${CAMP_STYLE[c].ring}`}
            >
              <span className={`font-display text-sm ${CAMP_STYLE[c].text}`}>{t(`help.roles.camp.${c}`)}</span>
              <span className="text-[11px] leading-snug text-moon-200/60">{t(`help.roles.goal.${c}`)}</span>
              <span className="mt-auto pt-1 text-[10px] font-bold uppercase tracking-wider text-moon-200/40">
                {ROLES_BY_CAMP[c].length} ›
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-moon-200/40">{t('help.bases.camps.hint')}</p>
      </section>

      <Card className="!p-0 border-night-700/60 bg-night-900/40 text-left">
        <div className="divide-y divide-night-700/60">
          {rows.map((r) => {
            const isOpen = open === r.id
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? '' : r.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="font-display text-sm text-moon-200">{r.title}</span>
                  <span className={`shrink-0 text-xs text-moon-200/40 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </button>
                {isOpen && <p className="px-4 pb-4 text-sm leading-relaxed text-moon-200/70">{r.text}</p>}
              </div>
            )
          })}
        </div>
      </Card>

      <button
        type="button"
        onClick={() => onOpenRoles()}
        className="flex items-center justify-between gap-3 rounded-2xl border border-blood-500/40 bg-gradient-to-br from-night-700/70 to-night-900/85 p-4 text-left shadow-card transition-colors hover:border-blood-500/60"
      >
        <span>
          <span className="block font-display text-base text-moon-200">{t('help.bases.rolesCta.title')}</span>
          <span className="text-xs text-moon-200/60">{t('help.bases.rolesCta.desc', { n: ROLE_ORDER.length })}</span>
        </span>
        <span className="text-xl text-blood-400">›</span>
      </button>
    </>
  )
}

/** Galerie des rôles : un onglet par camp (11 / 5 / 3 cartes) et une grille de
 * vignettes au lieu d'une liste unique de 19 blocs de texte. */
function RolesGallery({
  camp,
  onCamp,
  onOpen,
}: {
  camp: Camp
  onCamp: (c: Camp) => void
  onOpen: (id: RoleId) => void
}) {
  const { t } = useLanguage()
  return (
    <>
      <div>
        <h2 className="font-display text-xl text-moon-200">{t('help.roles.title')}</h2>
        <p className="mt-0.5 text-xs text-moon-200/55">{t('help.roles.subtitle')}</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-night-600/60 bg-night-900/40 p-1">
        {CAMPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onCamp(c)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              camp === c ? CAMP_STYLE[c].tab : 'text-moon-200/60 hover:text-moon-200'
            }`}
          >
            {t(`help.roles.camp.${c}`)}
            <span className={`text-[10px] ${camp === c ? 'opacity-80' : 'text-moon-200/35'}`}>{ROLES_BY_CAMP[c].length}</span>
          </button>
        ))}
      </div>

      <p className={`-mt-2 text-xs ${CAMP_STYLE[camp].text}`}>{t(`help.roles.goal.${camp}`)}</p>

      <div className="grid grid-cols-3 gap-2.5">
        {ROLES_BY_CAMP[camp].map((id) => (
          <RoleThumb key={id} roleId={id} onOpen={() => onOpen(id)} />
        ))}
      </div>
    </>
  )
}

function RoleThumb({ roleId, onOpen }: { roleId: RoleId; onOpen: () => void }) {
  const { t } = useLanguage()
  const role = ROLES[roleId]
  const candidates = useMemo(() => roleCardImageCandidates(roleId), [roleId])
  const [idx, setIdx] = useState(0)
  const image = candidates[idx]

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-night-900 text-left shadow-card transition-transform active:scale-[0.97] ${CAMP_STYLE[role.team].ring}`}
    >
      <span className="relative block aspect-[4/5] w-full overflow-hidden bg-gradient-to-br from-night-700 via-night-900 to-night-950">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            onError={() => setIdx((i) => i + 1)}
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <>
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
              style={{ background: `radial-gradient(circle, ${role.color}55, transparent 70%)` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-4xl">{role.emoji}</span>
          </>
        )}
      </span>
      <span className="flex min-h-[2.5rem] items-center justify-center px-1.5 py-1.5 text-center font-display text-[12px] leading-tight text-moon-200">
        {t(role.nameKey)}
      </span>
    </button>
  )
}

/** Fiche complète d'un rôle : la vraie carte (même rendu que dans la partie),
 * le camp et l'objectif, puis fonctionnement / forces / faiblesses. Les
 * flèches parcourent les rôles du camp affiché, en boucle. */
function RoleSheet({
  roleId,
  list,
  onChange,
}: {
  roleId: RoleId | null
  list: RoleId[]
  onChange: (id: RoleId | null) => void
}) {
  const { t } = useLanguage()
  if (!roleId) return null
  const role = ROLES[roleId]
  const camp = role.team
  const pos = list.indexOf(roleId)
  const step = (d: number) => {
    if (pos < 0 || list.length < 2) return
    onChange(list[(pos + d + list.length) % list.length])
  }

  const goalKey = `roleGuide.${roleId}.goal` as TranslationKey
  const goal = camp === 'neutre' ? t(goalKey) : t(`help.roles.goal.${camp}`)
  const bullets = (key: string) =>
    t(key as TranslationKey)
      .split('|')
      .map((x) => x.trim())
      .filter(Boolean)

  return (
    <Modal open onClose={() => onChange(null)} title={roleTeamLabel(camp, t)}>
      <div className="flex flex-col gap-4">
        <div className="relative">
          <RoleCard key={roleId} roleId={roleId} />
          {list.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={t('help.roles.sheet.prev')}
                className="absolute -left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-night-600/70 bg-night-800/90 text-lg text-moon-200 shadow-card transition-colors hover:bg-night-700"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={t('help.roles.sheet.next')}
                className="absolute -right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-night-600/70 bg-night-800/90 text-lg text-moon-200 shadow-card transition-colors hover:bg-night-700"
              >
                ›
              </button>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CAMP_STYLE[camp].chip}`}>
            {roleTeamLabel(camp, t)}
          </span>
          {pos >= 0 && (
            <span className="text-[10px] font-semibold tabular-nums text-moon-200/35">
              {pos + 1} / {list.length}
            </span>
          )}
        </div>

        <section className={`rounded-xl border bg-night-900/50 p-3 ${CAMP_STYLE[camp].ring}`}>
          <h3 className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${CAMP_STYLE[camp].text}`}>
            🎯 {t('help.roles.sheet.goal')}
          </h3>
          <p className="text-sm text-moon-200/80">{goal}</p>
        </section>

        <section>
          <h3 className="mb-1 font-display text-sm text-moon-300">{t('help.roles.sheet.how')}</h3>
          <p className="text-sm leading-relaxed text-moon-200/70">{t(`roleGuide.${roleId}.how` as TranslationKey)}</p>
        </section>

        <div className="grid gap-2.5">
          <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3">
            <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              ＋ {t('help.roles.sheet.strengths')}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {bullets(`roleGuide.${roleId}.strengths`).map((b) => (
                <li key={b} className="flex gap-2 text-[13px] leading-snug text-moon-200/75">
                  <span className="mt-px text-emerald-400">✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-blood-500/30 bg-blood-500/[0.07] p-3">
            <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-blood-400">
              － {t('help.roles.sheet.weaknesses')}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {bullets(`roleGuide.${roleId}.weaknesses`).map((b) => (
                <li key={b} className="flex gap-2 text-[13px] leading-snug text-moon-200/75">
                  <span className="mt-px text-blood-400">✕</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </Modal>
  )
}

/** Les tribus : mêmes chiffres que le serveur (30 membres, 200 messages, niveaux, rang pour fonder). */
function TribesContent() {
  const { t } = useLanguage()
  const sections: { title: TranslationKey; text: ReactNode }[] = [
    { title: 'help.tribes.what.title', text: t('help.tribes.what.text') },
    {
      title: 'help.tribes.join.title',
      text: (
        <>
          <p>{t('help.tribes.join.text')}</p>
          <p className="mt-2">{t('help.tribes.found.text', { rank: tierLabel(tierForPoints(TRIBE_CREATE_MIN_POINTS).id, t), pts: TRIBE_CREATE_MIN_POINTS })}</p>
        </>
      ),
    },
    { title: 'help.tribes.village.title', text: t('help.tribes.village.text') },
    { title: 'help.tribes.level.title', text: t('help.tribes.level.text') },
    { title: 'help.tribes.chat.title', text: t('help.tribes.chat.text') },
    { title: 'help.tribes.moderation.title', text: t('help.tribes.moderation.text') },
  ]
  return (
    <>
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="mb-1.5 font-display text-sm text-moon-300">{t(s.title)}</h3>
          {typeof s.text === 'string' ? <p>{s.text}</p> : s.text}
        </div>
      ))}
    </>
  )
}

/** Bonus d'impact (voir compute_impact_bonus, migration 0073) — mêmes clés
 * de traduction que DeathImpactModal.tsx/EndScreen (GameRoom.tsx), pour ne
 * jamais avoir deux libellés différents pour le même geste. `note` seulement
 * pour la Voyante, seul bonus plafonné à plusieurs occurrences par partie. */
const IMPACT_BONUSES: { key: TranslationKey; points: number; note?: TranslationKey }[] = [
  { key: 'impact.witch_heal', points: 10 },
  { key: 'impact.witch_poison_wolf', points: 15 },
  { key: 'impact.hunter_shot_wolf', points: 15 },
  { key: 'impact.seer_wolf_reveal', points: 5, note: 'help.ranking.impact.seerNote' },
  { key: 'impact.ancien_extra_life', points: 10 },
  { key: 'impact.wolf_team_win', points: 15 },
  { key: 'impact.daron_save', points: 10 },
]

/** Nouveau contenu : le système de rang (0055_ranking_system.sql) n'était
 * expliqué nulle part côté joueur jusqu'ici, seulement affiché (badge,
 * points, position). Les paliers sont générés depuis RANK_TIERS (déjà la
 * source de vérité pour l'affichage ailleurs dans l'appli) plutôt que
 * recopiés en dur ici, pour ne jamais désynchroniser les seuils. */
function RankingContent() {
  const { t } = useLanguage()
  return (
    <>
      <div>
        <p>{t('help.ranking.intro')}</p>
      </div>

      <div>
        <h3 className="mb-1.5 font-display text-sm text-moon-300">{t('help.ranking.points.title')}</h3>
        <p>{t('help.ranking.points.text')}</p>
      </div>

      <div>
        <h3 className="mb-2 font-display text-sm text-moon-300">{t('help.ranking.impact.title')}</h3>
        <p className="mb-2">{t('help.ranking.impact.text')}</p>
        <div className="flex flex-col gap-1.5">
          {IMPACT_BONUSES.map((b) => (
            <div
              key={b.key}
              className="flex items-center justify-between rounded-xl border border-night-600/60 bg-night-900/50 px-3 py-2"
            >
              <span className="text-moon-200">
                {t(b.key)} {b.note && <span className="text-xs text-moon-200/50">{t(b.note)}</span>}
              </span>
              <span className="text-xs font-semibold text-emerald-400">+{b.points}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 font-display text-sm text-moon-300">
          <LoupCoinIcon className="h-4 w-4" /> {t('help.ranking.loupCoins.title')}
        </h3>
        <p>{t('help.ranking.loupCoins.text')}</p>
      </div>

      <div>
        <h3 className="mb-2 font-display text-sm text-moon-300">{t('help.ranking.tiers.title')}</h3>
        <p className="mb-2">{t('help.ranking.tiers.text')}</p>
        <div className="flex flex-col gap-1.5">
          {RANK_TIERS.map((tier) => (
            <div
              key={tier.id}
              className="flex items-center justify-between rounded-xl border border-night-600/60 bg-night-900/50 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-moon-200">
                <RankTierBadge tier={tier.id} size={20} /> {t(tier.nameKey)}
              </span>
              <span className="text-xs text-moon-200/50">
                {t('help.ranking.tiers.fromPoints', { points: tier.minPoints })}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 font-display text-sm text-moon-300">{t('help.ranking.leaderboard.title')}</h3>
        <p>{t('help.ranking.leaderboard.text')}</p>
      </div>
    </>
  )
}
