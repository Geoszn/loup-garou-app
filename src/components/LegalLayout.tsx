import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from './ui'
import { useLanguage } from '../i18n/LanguageContext'

/** Mise en page partagée par les pages légales (confidentialité, CGU,
 * mentions légales) : même carte, même lien retour, même bloc "dernière mise
 * à jour" — pour ne pas dupliquer ce chrome dans chaque page et garder les
 * trois documents visuellement cohérents entre eux et avec le reste de
 * l'appli. Ces trois pages sont chargées à la demande (voir App.tsx,
 * React.lazy) : leur texte est volumineux (droit + RGPD, en fr et en) et
 * rarement consulté, inutile de l'inclure dans le bundle principal. */
export function LegalLayout({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  const { t } = useLanguage()
  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-block text-sm text-moon-200/60 underline underline-offset-4 hover:text-moon-200"
          >
            {t('legal.backHome')}
          </Link>
        </div>
        <Card>
          <h1 className="font-display text-2xl text-moon-200 sm:text-3xl">{title}</h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-moon-200/40">{t('legal.updatedAt', { date: updatedAt })}</p>
          <div className="mt-6 flex flex-col gap-6 text-sm leading-relaxed text-moon-200/80">{children}</div>
        </Card>
      </div>
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-base text-moon-300">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

/** Repère visuel pour les quelques informations que je ne peux pas deviner à
 * ta place (région d'hébergement Supabase, éventuelle raison sociale...) —
 * à remplacer avant une mise en production officielle. */
export function ToFill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-blood-700/20 px-1.5 py-0.5 font-semibold text-blood-400">[{children}]</span>
  )
}
