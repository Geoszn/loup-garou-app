import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import { useTribeSummary } from '../../hooks/useTribeSummary'
import { TribeShield } from './TribeShield'

/**
 * Carte « Ma tribu » de l'accueil : sa tribu (avec les messages non lus), une
 * invitation reçue, ou une proposition d'en fonder une. Une seule lecture légère
 * (get_my_tribe_summary), montée après les éléments prioritaires de l'accueil.
 */
export function TribeCard() {
  const { t } = useLanguage()
  const { summary, loaded } = useTribeSummary()
  if (!loaded || !summary) return null

  const tribe = summary.tribe
  const invite = summary.invites[0]
  const link = '/tribu'

  if (tribe) {
    return (
      <Link to={link} className="flex items-center gap-3 rounded-2xl border border-sky-400/30 bg-gradient-to-r from-indigo-900/40 to-night-900/60 p-3 transition-colors hover:border-sky-400/50">
        <TribeShield emblem={tribe.emblem} color={tribe.color} className="h-12 w-12 text-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-moon-200">{tribe.name}</p>
          <p className="truncate text-[11px] text-moon-200/50">
            {t('tribe.members.count', { n: tribe.member_count, max: tribe.max })}
            {tribe.unread > 0 && <span className="font-semibold text-amber-300"> · 💬 {t('tribe.card.unread', { n: tribe.unread >= 99 ? '99+' : tribe.unread })}</span>}
          </p>
        </div>
        <span className="text-moon-200/40" aria-hidden="true">›</span>
      </Link>
    )
  }
  if (invite) {
    return (
      <Link to={link} className="flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3">
        <span className="text-2xl" aria-hidden="true">✉️</span>
        <p className="min-w-0 flex-1 text-xs text-moon-200/80">{t('tribe.card.invite', { name: invite.invited_by_name })}</p>
        <span className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white">{t('tribe.card.see')}</span>
      </Link>
    )
  }
  return (
    <Link to={link} className="flex items-center gap-3 rounded-2xl border border-night-600/60 bg-night-900/40 p-3 transition-colors hover:border-moon-400/30">
      <span className="text-2xl" aria-hidden="true">🛡️</span>
      <p className="min-w-0 flex-1 text-xs text-moon-200/70">{t('tribe.card.create')}</p>
      <span className="text-moon-200/40" aria-hidden="true">›</span>
    </Link>
  )
}
