import { useLanguage } from '../i18n/LanguageContext'
import { TribeHub } from '../components/tribe/TribePanel'

/** Page « Tribu » : entrée de la barre du bas, à la place de l'ancienne page Amis
 * (les amis y sont devenus un onglet secondaire). Voir TribeHub. */
export default function Tribe() {
  const { t } = useLanguage()
  return (
    <div className="relative z-10 min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-2xl text-moon-200">🛡️ {t('nav.tribe')}</h1>
        <TribeHub />
      </div>
    </div>
  )
}
