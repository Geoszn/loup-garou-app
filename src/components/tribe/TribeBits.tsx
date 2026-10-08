import { useLanguage } from '../../i18n/LanguageContext'
import type { TribeRole } from '../../lib/tribe'

/** Badge de rôle : seuls le chef et les sous-chefs en portent un. */
export function RoleBadge({ role }: { role: TribeRole }) {
  const { t } = useLanguage()
  if (role === 'membre') return null
  return (
    <span className={`rounded-full px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide ${role === 'chef' ? 'bg-amber-400/20 text-amber-300' : 'bg-sky-400/15 text-sky-300'}`}>
      {role === 'chef' ? `👑 ${t('tribe.role.chef')}` : `⭐ ${t('tribe.role.sous_chef')}`}
    </span>
  )
}

export function OnlineDot({ online }: { online: boolean }) {
  return <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-night-500'}`} />
}
