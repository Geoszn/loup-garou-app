import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoBack } from '../hooks/useGoBack'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { ROLES, ROLE_ORDER, roleTeamLabel } from '../lib/roles'
import { RANK_TIERS, tierForPoints, tierLabel } from '../lib/ranks'
import { TRIBE_CREATE_MIN_POINTS } from '../lib/tribe'
import { Button, Card } from '../components/ui'
import { RankTierBadge } from '../components/RankTierBadge'
import { LoupCoinIcon } from '../components/LoupCoinIcon'
import { FeedbackButton } from '../components/FeedbackButton'
import { TutorialFlow } from '../components/TutorialFlow'

type Screen = 'landing' | 'rules'

/** Page d'aide dédiée, publique (accessible sans compte). Écran d'accueil à
 * deux entrées (Tutoriel interactif / Règles du jeu) plutôt qu'un mur
 * d'accordéons ouvert d'entrée — retour utilisateur : "peu explicative,
 * beaucoup n'aiment pas lire". Les règles complètes (RulesContent +
 * RankingContent, inchangées) vivent derrière le second bouton, toujours
 * accessibles pour qui veut vraiment tout lire en détail.
 *
 * Accessible via le menu compte (AccountMenu.tsx, joueurs connectés) et via
 * un lien dans l'en-tête de Landing.tsx (visiteurs non connectés) — d'où le
 * bouton retour qui doit choisir la bonne destination selon la session. */
export default function Help() {
  const { t } = useLanguage()
  const { session } = useAuth()
  const navigate = useNavigate()
  const goBack = useGoBack(session ? '/profil' : '/')
  const [screen, setScreen] = useState<Screen>('landing')
  // Quelle catégorie s'ouvre en arrivant sur l'écran Règles — le lien rapide
  // "Classement & Loup Coins" de l'accueil y renvoie directement déplié,
  // plutôt que de forcer un second clic une fois sur place.
  const [rulesFocus, setRulesFocus] = useState<'rules' | 'ranking' | 'tribes'>('rules')
  const [tutorialOpen, setTutorialOpen] = useState(false)

  function openRules(focus: 'rules' | 'ranking' | 'tribes') {
    setRulesFocus(focus)
    setScreen('rules')
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={screen === 'rules' ? () => setScreen('landing') : goBack}
            className="px-3.5 py-2 text-xs"
          >
            {t('common.back')}
          </Button>
          <h1 className="font-display text-2xl text-moon-200">{t('help.pageTitle')}</h1>
        </header>

        {screen === 'landing' ? (
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

            <button
              type="button"
              onClick={() => openRules('rules')}
              className="relative overflow-hidden rounded-2xl border border-night-600/70 bg-gradient-to-br from-night-700/70 to-night-900/85 p-5 text-left shadow-card transition-colors hover:border-sky-400/40"
            >
              <span className="pointer-events-none absolute -right-6 -top-10 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl" aria-hidden="true" />
              <span className="relative mb-2.5 block text-3xl">📖</span>
              <p className="relative font-display text-lg text-moon-200">{t('help.landing.rules.title')}</p>
              <p className="relative mb-3 mt-1 max-w-[88%] text-xs text-moon-200/60">{t('help.landing.rules.desc')}</p>
              <span className="relative text-xs font-extrabold uppercase tracking-wide text-sky-300">{t('help.landing.rules.cta')}</span>
            </button>

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
        ) : (
          <>
            <HelpCategory
              emoji="📖"
              title={t('rules.title')}
              subtitle={t('help.category.rules.subtitle')}
              defaultOpen={rulesFocus === 'rules'}
            >
              <RulesContent />
            </HelpCategory>

            <HelpCategory
              emoji="🏆"
              title={t('help.category.ranking.title')}
              subtitle={t('help.category.ranking.subtitle')}
              defaultOpen={rulesFocus === 'ranking'}
            >
              <RankingContent />
            </HelpCategory>

            <HelpCategory
              emoji="🛡️"
              title={t('help.category.tribes.title')}
              subtitle={t('help.category.tribes.subtitle')}
              defaultOpen={rulesFocus === 'tribes'}
            >
              <TribesContent />
            </HelpCategory>
          </>
        )}
      </div>

      {tutorialOpen && (
        <TutorialFlow
          onClose={() => setTutorialOpen(false)}
          onPlay={() => navigate(session ? '/jouer' : '/inscription')}
        />
      )}
    </div>
  )
}

function HelpCategory({
  emoji,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  emoji: string
  title: string
  subtitle: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card className="!p-0 border-night-700/60 bg-night-900/40 text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <span className="flex flex-col">
            <span className="font-display text-sm text-moon-200 sm:text-base">{title}</span>
            <span className="text-xs text-moon-200/50">{subtitle}</span>
          </span>
        </span>
        <span className="shrink-0 text-xs text-moon-200/40">{open ? t('common.hide') : t('common.show')}</span>
      </button>

      {open && <div className="flex flex-col gap-5 border-t border-night-700/60 px-4 pb-5 pt-4 text-sm text-moon-200/70">{children}</div>}
    </Card>
  )
}

/** Contenu repris à l'identique de l'ancien RulesPanel.tsx — mêmes clés de
 * traduction, rien de réécrit, juste déplacé ici. */
function RulesContent() {
  const { t } = useLanguage()
  return (
    <>
      <div>
        <h3 className="mb-1.5 font-display text-sm text-moon-300">{t('rules.objective.title')}</h3>
        <p>{t('rules.objective.text')}</p>
      </div>

      <div>
        <h3 className="mb-1.5 font-display text-sm text-moon-300">{t('rules.flow.title')}</h3>
        <p>{t('rules.flow.text')}</p>
      </div>

      <div>
        <h3 className="mb-1.5 font-display text-sm text-moon-300">{t('rules.nightChat.title')}</h3>
        <p>{t('rules.nightChat.text')}</p>
      </div>

      <div>
        <h3 className="mb-2 font-display text-sm text-moon-300">{t('rules.roles.title')}</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ROLE_ORDER.map((id) => {
            const role = ROLES[id]
            return (
              <div key={id} className="rounded-xl border border-night-600/60 bg-night-900/50 p-3">
                <p className="mb-1 flex items-center gap-2 font-display text-sm text-moon-200">
                  <span>{role.emoji}</span> {t(role.nameKey)}
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      role.team === 'loups'
                        ? 'bg-blood-700/30 text-blood-400'
                        : role.team === 'neutre'
                          ? 'bg-moon-400/20 text-moon-300'
                          : 'bg-night-700/60 text-moon-200/60'
                    }`}
                  >
                    {roleTeamLabel(role.team, t)}
                  </span>
                </p>
                <p className="text-xs text-moon-200/60">{t(role.descriptionKey)}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 font-display text-sm text-moon-300">{t('rules.captain.title')}</h3>
        <p>{t('rules.captain.text')}</p>
      </div>

      <div>
        <h3 className="mb-1.5 font-display text-sm text-moon-300">{t('rules.victory.title')}</h3>
        <p>{t('rules.victory.text')}</p>
      </div>

      <div>
        <h3 className="mb-1.5 font-display text-sm text-moon-300">👻 {t('rules.ghost.title')}</h3>
        <p>{t('rules.ghost.text')}</p>
      </div>
    </>
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
