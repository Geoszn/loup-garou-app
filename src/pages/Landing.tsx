import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LinkButton } from '../components/ui'
import { RulesPanel } from '../components/RulesPanel'
import { useLanguage } from '../i18n/LanguageContext'

export default function Landing() {
  const { session } = useAuth()
  const { t } = useLanguage()

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-moon-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-0 h-96 w-96 rounded-full bg-blood-600/10 blur-3xl" />

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-10 sm:py-6">
        <div className="flex items-center gap-2 font-display text-base tracking-wide text-moon-300 sm:text-lg">
          <img src="/logo.png" alt="" className="animate-breathe h-8 w-8 rounded-full sm:h-9 sm:w-9" />
          {/* "d'Afrique" repasse à la ligne sur mobile (le titre entier
              prenait trop de place à côté du logo) mais reste sur la même
              ligne dès sm: où il y a assez de largeur. */}
          <span>
            Loup Garou<br className="sm:hidden" /> d'Afrique
          </span>
        </div>
        <nav className="flex items-center gap-2 sm:gap-3">
          {session ? (
            <LinkButton to="/dashboard" variant="ghost">
              {t('landing.nav.myAccount')}
            </LinkButton>
          ) : (
            <>
              <LinkButton to="/connexion" variant="ghost">
                {t('landing.nav.login')}
              </LinkButton>
              <LinkButton to="/inscription">{t('landing.nav.signup')}</LinkButton>
            </>
          )}
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-16 text-center sm:pt-24">
        <span className="mb-4 rounded-full border border-night-600 bg-night-800/60 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-moon-200/60">
          {t('landing.badge.upTo25')}
        </span>
        <h1 className="font-display text-4xl leading-tight text-moon-200 sm:text-6xl">
          {t('landing.hero.title1')} <span className="text-blood-500">{t('landing.hero.title2')}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-balance text-lg text-moon-200/70">{t('landing.hero.tagline')}</p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <LinkButton to={session ? '/dashboard' : '/inscription'} className="px-8 py-4 text-base">
            {t('landing.cta.start')}
          </LinkButton>
          <LinkButton to={session ? '/dashboard' : '/connexion'} variant="ghost" className="px-8 py-4 text-base">
            {t('landing.cta.joinWithCode')}
          </LinkButton>
        </div>

        <div className="mt-20 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard emoji="🎭" title={t('landing.feature.roles.title')} text={t('landing.feature.roles.text')} />
          <FeatureCard emoji="🌙" title={t('landing.feature.dayNight.title')} text={t('landing.feature.dayNight.text')} />
          <FeatureCard emoji="🔗" title={t('landing.feature.join.title')} text={t('landing.feature.join.text')} />
        </div>

        <div className="mt-6 w-full">
          <RulesPanel />
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pb-8 text-xs text-moon-200/40">
        <Link to="/confidentialite" className="underline underline-offset-4 hover:text-moon-200/70">
          {t('landing.footer.privacy')}
        </Link>
        <Link to="/cgu" className="underline underline-offset-4 hover:text-moon-200/70">
          {t('landing.footer.terms')}
        </Link>
        <Link to="/mentions-legales" className="underline underline-offset-4 hover:text-moon-200/70">
          {t('landing.footer.legal')}
        </Link>
      </footer>
    </div>
  )
}

function FeatureCard({ emoji, title, text }: { emoji: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-night-600/70 bg-night-800/50 p-6 text-left backdrop-blur-sm">
      <div className="mb-3 text-2xl">{emoji}</div>
      <h3 className="mb-1.5 font-display text-lg text-moon-300">{title}</h3>
      <p className="text-sm text-moon-200/60">{text}</p>
    </div>
  )
}
