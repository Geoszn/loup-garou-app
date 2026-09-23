import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { isAdminHost } from '../lib/adminHost'

// Domaine principal : le domaine vercel.app et le domaine sans "www"
// redirigent tous deux ici. À garder synchronisé avec index.html,
// public/robots.txt et public/sitemap.xml si le domaine change un jour.
export const SITE_URL = 'https://www.loupgarouafrique.com'
const SITE_NAME = "Loup Garou d'Afrique"

interface PageSeo {
  title: { fr: string; en: string }
  description: { fr: string; en: string }
}

// Liste BLANCHE des pages à indexer — toute autre route (espaces joueur,
// connexion/inscription, liens d'invitation, dashboard admin, 404...) reçoit
// automatiquement "noindex". Une liste blanche plutôt que noire : une future
// page privée ajoutée sans y penser reste exclue de l'index par défaut.
const INDEXABLE_PAGES: Record<string, PageSeo> = {
  '/': {
    title: {
      fr: `${SITE_NAME} – Jouez au Loup-Garou en ligne entre amis`,
      en: `${SITE_NAME} – Play Werewolf online with friends`,
    },
    description: {
      fr: "Jouez au Loup Garou d'Afrique en ligne, entre amis, jusqu'à 25 joueurs. L'application arbitre la partie : rôles, votes, nuits et chat de groupe.",
      en: 'Play the African Werewolf game online with friends, up to 25 players. The app moderates the game for you: roles, votes, nights and group chat.',
    },
  },
  '/aide': {
    title: {
      fr: `Règles et rôles du jeu – ${SITE_NAME}`,
      en: `Rules and roles – ${SITE_NAME}`,
    },
    description: {
      fr: "Découvrez les règles du Loup Garou d'Afrique, le déroulement d'une partie (nuit, jour, vote) et tous les rôles : Voyante, Sorcière, Chasseur, Cupidon...",
      en: 'Learn the rules of the African Werewolf game, how a round plays out (night, day, vote) and every role: Seer, Witch, Hunter, Cupid...',
    },
  },
  '/cgu': {
    title: {
      fr: `Conditions générales d'utilisation – ${SITE_NAME}`,
      en: `Terms of use – ${SITE_NAME}`,
    },
    description: {
      fr: "Conditions générales d'utilisation du jeu Loup Garou d'Afrique.",
      en: 'Terms of use of the African Werewolf game.',
    },
  },
  '/confidentialite': {
    title: {
      fr: `Politique de confidentialité – ${SITE_NAME}`,
      en: `Privacy policy – ${SITE_NAME}`,
    },
    description: {
      fr: "Comment Loup Garou d'Afrique collecte, utilise et protège vos données personnelles.",
      en: 'How the African Werewolf game collects, uses and protects your personal data.',
    },
  },
  '/mentions-legales': {
    title: {
      fr: `Mentions légales – ${SITE_NAME}`,
      en: `Legal notice – ${SITE_NAME}`,
    },
    description: {
      fr: "Mentions légales et informations sur l'éditeur du jeu Loup Garou d'Afrique.",
      en: 'Legal notice and publisher information for the African Werewolf game.',
    },
  },
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!href) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/** Met à jour titre, description, canonical et directive robots à chaque
 * changement de page — l'appli étant une SPA, index.html ne peut fournir
 * qu'un seul jeu de balises pour toutes les URL (avant ce composant, /aide
 * s'appelait "Loup Garou d'Afrique" comme l'accueil, sans canonical, sans
 * consigne noindex pour les espaces privés). Google exécute le JavaScript et
 * lit ces balises après rendu. Ne rend rien à l'écran. */
export function SeoManager() {
  const { pathname } = useLocation()
  const { lang } = useLanguage()

  useEffect(() => {
    // "/AIDE/" et "/aide" désignent la même page : une seule URL canonique.
    const key = (pathname.replace(/\/+$/, '') || '/').toLowerCase()
    const page = isAdminHost ? undefined : INDEXABLE_PAGES[key]

    document.title = page ? page.title[lang] : SITE_NAME
    setMeta('name', 'description', (page ?? INDEXABLE_PAGES['/']).description[lang])
    setMeta('name', 'robots', page ? 'index, follow, max-image-preview:large' : 'noindex, nofollow')
    setCanonical(page ? `${SITE_URL}${key === '/' ? '/' : key}` : null)

    const shareTitle = page ? page.title[lang] : INDEXABLE_PAGES['/'].title[lang]
    const shareDescription = (page ?? INDEXABLE_PAGES['/']).description[lang]
    setMeta('property', 'og:title', shareTitle)
    setMeta('property', 'og:description', shareDescription)
    setMeta('property', 'og:url', `${SITE_URL}${page && key !== '/' ? key : '/'}`)
    setMeta('name', 'twitter:title', shareTitle)
    setMeta('name', 'twitter:description', shareDescription)
  }, [pathname, lang])

  return null
}
