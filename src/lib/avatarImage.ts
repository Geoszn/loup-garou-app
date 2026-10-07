import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvatarArt } from '../components/AvatarArt'
import type { AvatarConfig, AvatarMood } from './avatarParts'

// Un avatar dessiné en SVG « en ligne » pèse ~130 éléments DOM. Dans une partie
// longue, le chat en affiche des dizaines (un par groupe de messages), la
// grille de joueurs et la liste des effectifs autant : plusieurs milliers
// d'éléments que le navigateur doit restyler à chaque changement de phase (et
// que la règle `.game-theme-root *` faisait même animer). Ici chaque combinaison
// (config + humeur) est dessinée UNE fois, transformée en image (URL de blob) et
// réutilisée partout : un avatar = un seul <img>, décodé une seule fois par le
// navigateur. Au-delà de MAX combinaisons, ou sans support des blobs, on
// retombe sur le SVG en ligne.
const cache = new Map<string, string>()
const MAX = 400

export function avatarImageUrl(config: AvatarConfig, mood: AvatarMood): string | null {
  const key = `${config.skin}|${config.hair}|${config.outfit}|${config.acc}|${config.acc2 ?? 'none'}|${config.head}|${config.face}|${config.bg}|${mood}`
  const hit = cache.get(key)
  if (hit) return hit
  if (cache.size >= MAX) return null
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Blob === 'undefined') return null
  try {
    const markup = renderToStaticMarkup(createElement(AvatarArt, { config, mood }))
    const svg = markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    cache.set(key, url)
    return url
  } catch {
    return null
  }
}
