import { LegalLayout, LegalSection } from '../components/LegalLayout'
import { useLanguage } from '../i18n/LanguageContext'

export default function Privacy() {
  const { t } = useLanguage()
  return (
    <LegalLayout title={t('privacy.title')} updatedAt={t('legal.updatedAtDate')}>
      <p>{t('privacy.intro')}</p>

      <LegalSection title={t('privacy.s1.title')}>
        <p>{t('privacy.s1.p1')}</p>
      </LegalSection>

      <LegalSection title={t('privacy.s2.title')}>
        <p>{t('privacy.s2.p1')}</p>
        <p>
          <strong>{t('privacy.s2.account.label')}</strong> {t('privacy.s2.account.text')}
        </p>
        <p>
          <strong>{t('privacy.s2.social.label')}</strong> {t('privacy.s2.social.text')}
        </p>
        <p>
          <strong>{t('privacy.s2.games.label')}</strong> {t('privacy.s2.games.text')}
        </p>
        <p>
          <strong>{t('privacy.s2.voice.label')}</strong> {t('privacy.s2.voice.text')}
        </p>
        <p>
          <strong>{t('privacy.s2.local.label')}</strong> {t('privacy.s2.local.text')}
        </p>
        <p>
          <strong>{t('privacy.s2.tech.label')}</strong> {t('privacy.s2.tech.text')}
        </p>
      </LegalSection>

      <LegalSection title={t('privacy.s3.title')}>
        <p>{t('privacy.s3.p1')}</p>
      </LegalSection>

      <LegalSection title={t('privacy.s4.title')}>
        <p>{t('privacy.s4.p1')}</p>
        <p>
          <strong>Supabase</strong> {t('privacy.s4.supabase')}
        </p>
        <p>
          <strong>Vercel Inc.</strong> {t('privacy.s4.vercel')}
        </p>
        <p>
          <strong>Daily.co, Inc.</strong> {t('privacy.s4.daily')}
        </p>
      </LegalSection>

      <LegalSection title={t('privacy.s5.title')}>
        <p>{t('privacy.s5.p1')}</p>
      </LegalSection>

      <LegalSection title={t('privacy.s6.title')}>
        <p>{t('privacy.s6.p1')}</p>
      </LegalSection>

      <LegalSection title={t('privacy.s7.title')}>
        <p>{t('privacy.s7.p1')}</p>
      </LegalSection>

      <LegalSection title={t('privacy.s8.title')}>
        <p>{t('privacy.s8.p1')}</p>
      </LegalSection>

      <LegalSection title={t('privacy.s9.title')}>
        <p>{t('privacy.s9.p1')}</p>
      </LegalSection>

      <LegalSection title={t('privacy.s10.title')}>
        <p>{t('privacy.s10.p1')}</p>
      </LegalSection>

      <LegalSection title={t('privacy.s11.title')}>
        <p>{t('privacy.s11.p1')}</p>
      </LegalSection>

      <LegalSection title={t('privacy.contact.title')}>
        <p>{t('privacy.contact.p1')}</p>
      </LegalSection>
    </LegalLayout>
  )
}
