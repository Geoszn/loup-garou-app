import { LegalLayout, LegalSection } from '../components/LegalLayout'
import { useLanguage } from '../i18n/LanguageContext'

export default function Terms() {
  const { t } = useLanguage()
  return (
    <LegalLayout title={t('terms.title')} updatedAt={t('legal.updatedAtDate')}>
      <p>{t('terms.intro')}</p>

      <LegalSection title={t('terms.s1.title')}>
        <p>{t('terms.s1.p1')}</p>
      </LegalSection>

      <LegalSection title={t('terms.s2.title')}>
        <p>{t('terms.s2.p1')}</p>
        <p>{t('terms.s2.p2')}</p>
        <p>{t('terms.s2.p3')}</p>
      </LegalSection>

      <LegalSection title={t('terms.s3.title')}>
        <p>{t('terms.s3.p1')}</p>
      </LegalSection>

      <LegalSection title={t('terms.s4.title')}>
        <p>{t('terms.s4.p1')}</p>
        <p>{t('terms.s4.p2')}</p>
      </LegalSection>

      <LegalSection title={t('terms.s5.title')}>
        <p>{t('terms.s5.p1')}</p>
      </LegalSection>

      <LegalSection title={t('terms.s6.title')}>
        <p>{t('terms.s6.p1')}</p>
      </LegalSection>

      <LegalSection title={t('terms.s7.title')}>
        <p>{t('terms.s7.p1')}</p>
      </LegalSection>

      <LegalSection title={t('terms.s8.title')}>
        <p>{t('terms.s8.p1')}</p>
      </LegalSection>

      <LegalSection title={t('terms.s9.title')}>
        <p>{t('terms.s9.p1')}</p>
      </LegalSection>

      <LegalSection title={t('terms.s10.title')}>
        <p>{t('terms.s10.p1')}</p>
      </LegalSection>

      <LegalSection title={t('terms.contact.title')}>
        <p>{t('terms.contact.p1')}</p>
      </LegalSection>
    </LegalLayout>
  )
}
