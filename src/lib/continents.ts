// Remplace countries.ts (74 pays) : le classement se fait désormais par
// continent (voir migration 0057), beaucoup plus simple à choisir (6 options
// au lieu de 74) et suffisant pour regrouper assez de joueurs pour que le
// classement ait un sens. Codes stockés tels quels dans profiles.continent.
export interface ContinentOption {
  code: string
  fr: string
  en: string
  emoji: string
}

export const CONTINENTS: ContinentOption[] = [
  { code: 'afrique', fr: 'Afrique', en: 'Africa', emoji: '🌍' },
  { code: 'europe', fr: 'Europe', en: 'Europe', emoji: '🌍' },
  { code: 'amerique_nord', fr: 'Amérique du Nord', en: 'North America', emoji: '🌎' },
  { code: 'amerique_sud', fr: 'Amérique du Sud', en: 'South America', emoji: '🌎' },
  { code: 'asie', fr: 'Asie', en: 'Asia', emoji: '🌏' },
  { code: 'oceanie', fr: 'Océanie', en: 'Oceania', emoji: '🌏' },
]

export function continentEmoji(code: string | null | undefined): string {
  return CONTINENTS.find((c) => c.code === code)?.emoji ?? '🌐'
}

export function continentName(code: string | null | undefined, lang: 'fr' | 'en'): string | null {
  if (!code) return null
  const found = CONTINENTS.find((c) => c.code === code)
  return found ? found[lang] : code
}
