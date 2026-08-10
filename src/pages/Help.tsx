import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { ROLES, ROLE_ORDER, roleTeamLabel } from '../lib/roles'
import { RANK_TIERS } from '../lib/ranks'
import { Button, Card } from '../components/ui'
import { RankTierBadge } from '../components/RankTierBadge'

/** Page d'aide dédiée, publique (accessible sans compte) : regroupe ce qui
 * vivait avant en un seul bloc "Règles du jeu" toujours déplié au milieu de
 * Landing.tsx et Dashboard.tsx (voir RulesPanel.tsx, retiré). Deux
 * catégories repliées par défaut (sauf les règles, dépliées d'entrée — c'est
 * la raison n°1 pour laquelle on vient sur cette page) plutôt qu'un mur de
 * texte unique, pour que le classement — jusqu'ici jamais expliqué nulle
 * part — ait enfin sa place sans alourdir encore la page d'accueil.
 *
 * Accessible via le menu compte (AccountMenu.tsx, joueurs connectés) et via
 * un lien dans l'en-tête de Landing.tsx (visiteurs non connectés) — d'où le
 * bouton retour qui doit choisir la bonne destination selon la session. */
export default function Help() {
  const { t } = useLanguage()
  const { session } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate(session ? '/dashboard' : '/')}
            className="px-3.5 py-2 text-xs"
          >
            {t('common.back')}
          </Button>
          <h1 className="font-display text-2xl text-moon-200">{t('help.pageTitle')}</h1>
        </header>

        <p className="text-sm text-moon-200/60">{t('help.subtitle')}</p>

        <HelpCategory
          emoji="📖"
          title={t('rules.title')}
          subtitle={t('help.category.rules.subtitle')}
          defaultOpen
        >
          <RulesContent />
        </HelpCategory>

        <HelpCategory
          emoji="🏆"
          title={t('help.category.ranking.title')}
          subtitle={t('help.category.ranking.subtitle')}
        >
          <RankingContent />
        </HelpCategory>
      </div>
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
                      role.team === 'loups' ? 'bg-blood-700/30 text-blood-400' : 'bg-night-700/60 text-moon-200/60'
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
