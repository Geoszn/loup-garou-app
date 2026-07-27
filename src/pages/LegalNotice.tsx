import { LegalLayout, LegalSection } from '../components/LegalLayout'
import { useLanguage } from '../i18n/LanguageContext'

export default function LegalNotice() {
  const { t } = useLanguage()
  return (
    <LegalLayout title={t('legalNotice.title')} updatedAt={t('legal.updatedAtDate')}>
      <p>{t('legalNotice.intro')}</p>

      <LegalSection title={t('legalNotice.publisher.title')}>
        <p>{t('legalNotice.publisher.p1')}</p>
        <p>{t('legalNotice.publisher.contact')}</p>
      </LegalSection>

      <LegalSection title={t('legalNotice.director.title')}>
        <p>{t('legalNotice.director.p1')}</p>
      </LegalSection>

      <LegalSection title={t('legalNotice.hosting.title')}>
        <p>
          <strong>{t('legalNotice.hosting.appLabel')}</strong> {t('legalNotice.hosting.appText')}
        </p>
        <p>
          <strong>{t('legalNotice.hosting.dbLabel')}</strong> {t('legalNotice.hosting.dbText')}
        </p>
        <p className="text-xs text-moon-200/40">{t('legalNotice.hosting.note')}</p>
      </LegalSection>

      <LegalSection title={t('legalNotice.ip.title')}>
        <p>{t('legalNotice.ip.p1')}</p>
        <p>{t('legalNotice.ip.p2')}</p>
      </LegalSection>

      <LegalSection title={t('legalNotice.more.title')}>
        <p>{t('legalNotice.more.p1')}</p>
      </LegalSection>

      <LegalSection title={t('legalNotice.contact.title')}>
        <p>{t('legalNotice.contact.p1')}</p>
      </LegalSection>
    </LegalLayout>
  )
}
