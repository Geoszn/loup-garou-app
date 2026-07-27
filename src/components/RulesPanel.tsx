import { useState } from 'react'
import { Card } from './ui'
import { ROLES, ROLE_ORDER, roleTeamLabel } from '../lib/roles'
import { useLanguage } from '../i18n/LanguageContext'

/** Petit panneau replié par défaut ("📖 Règles du jeu ▾") qu'on dépose sur
 * les pages d'accueil / création / rejoindre une partie, pour rappeler les
 * règles à un joueur qui les redécouvre sans imposer un mur de texte à tout
 * le monde. Repris du même patron que les autres sections repliables de
 * l'appli (réglages du salon, journal de la partie).
 *
 * `onToggle` (optionnel) prévient le parent à chaque ouverture/fermeture —
 * utilisé par exemple sur la page d'accueil pour faire disparaître en fondu
 * le texte d'ambiance sous ce panneau pendant que les règles sont dépliées. */
export function RulesPanel({ onToggle }: { onToggle?: (open: boolean) => void } = {}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  function toggle() {
    setOpen((v) => {
      onToggle?.(!v)
      return !v
    })
  }

  return (
    <Card className="!p-0 border-night-700/60 bg-night-900/40 text-left">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-moon-200">{t('rules.title')}</span>
        <span className="text-xs text-moon-200/40">{open ? t('common.hide') : t('common.show')}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-5 border-t border-night-700/60 px-4 pb-5 pt-4 text-sm text-moon-200/70">
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
        </div>
      )}
    </Card>
  )
}
