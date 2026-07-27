import { LinkButton } from '../components/ui'
import { useLanguage } from '../i18n/LanguageContext'

export default function NotFound() {
  const { t } = useLanguage()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-5xl">🌫️</div>
      <h1 className="font-display text-2xl text-moon-200">{t('notFound.title')}</h1>
      <p className="text-moon-200/60">{t('notFound.body')}</p>
      <LinkButton to="/" variant="ghost">
        {t('common.backHome')}
      </LinkButton>
    </div>
  )
}
