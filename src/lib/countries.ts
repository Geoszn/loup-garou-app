// Liste volontairement centrée sur l'Afrique (thème du jeu) + les
// destinations de diaspora/francophonie les plus courantes, plutôt qu'une
// liste ISO exhaustive des ~195 pays — largement suffisante pour le
// classement national, et beaucoup plus rapide à relire/maintenir. Codes au
// format ISO 3166-1 alpha-2, stockés tels quels dans profiles.country (voir
// migration 0055).
export interface CountryOption {
  code: string
  fr: string
  en: string
}

export const COUNTRIES: CountryOption[] = [
  { code: 'DZ', fr: 'Algérie', en: 'Algeria' },
  { code: 'AO', fr: 'Angola', en: 'Angola' },
  { code: 'BJ', fr: 'Bénin', en: 'Benin' },
  { code: 'BW', fr: 'Botswana', en: 'Botswana' },
  { code: 'BF', fr: 'Burkina Faso', en: 'Burkina Faso' },
  { code: 'BI', fr: 'Burundi', en: 'Burundi' },
  { code: 'CV', fr: 'Cap-Vert', en: 'Cabo Verde' },
  { code: 'CM', fr: 'Cameroun', en: 'Cameroon' },
  { code: 'CF', fr: 'Centrafrique', en: 'Central African Republic' },
  { code: 'TD', fr: 'Tchad', en: 'Chad' },
  { code: 'KM', fr: 'Comores', en: 'Comoros' },
  { code: 'CG', fr: 'Congo-Brazzaville', en: 'Congo' },
  { code: 'CD', fr: 'RD Congo', en: 'DR Congo' },
  { code: 'DJ', fr: 'Djibouti', en: 'Djibouti' },
  { code: 'EG', fr: 'Égypte', en: 'Egypt' },
  { code: 'GQ', fr: 'Guinée équatoriale', en: 'Equatorial Guinea' },
  { code: 'ER', fr: 'Érythrée', en: 'Eritrea' },
  { code: 'SZ', fr: 'Eswatini', en: 'Eswatini' },
  { code: 'ET', fr: 'Éthiopie', en: 'Ethiopia' },
  { code: 'GA', fr: 'Gabon', en: 'Gabon' },
  { code: 'GM', fr: 'Gambie', en: 'Gambia' },
  { code: 'GH', fr: 'Ghana', en: 'Ghana' },
  { code: 'GN', fr: 'Guinée', en: 'Guinea' },
  { code: 'GW', fr: 'Guinée-Bissau', en: 'Guinea-Bissau' },
  { code: 'CI', fr: "Côte d'Ivoire", en: 'Ivory Coast' },
  { code: 'KE', fr: 'Kenya', en: 'Kenya' },
  { code: 'LS', fr: 'Lesotho', en: 'Lesotho' },
  { code: 'LR', fr: 'Liberia', en: 'Liberia' },
  { code: 'LY', fr: 'Libye', en: 'Libya' },
  { code: 'MG', fr: 'Madagascar', en: 'Madagascar' },
  { code: 'MW', fr: 'Malawi', en: 'Malawi' },
  { code: 'ML', fr: 'Mali', en: 'Mali' },
  { code: 'MR', fr: 'Mauritanie', en: 'Mauritania' },
  { code: 'MU', fr: 'Maurice', en: 'Mauritius' },
  { code: 'MA', fr: 'Maroc', en: 'Morocco' },
  { code: 'MZ', fr: 'Mozambique', en: 'Mozambique' },
  { code: 'NA', fr: 'Namibie', en: 'Namibia' },
  { code: 'NE', fr: 'Niger', en: 'Niger' },
  { code: 'NG', fr: 'Nigeria', en: 'Nigeria' },
  { code: 'RW', fr: 'Rwanda', en: 'Rwanda' },
  { code: 'ST', fr: 'Sao Tomé-et-Principe', en: 'Sao Tome and Principe' },
  { code: 'SN', fr: 'Sénégal', en: 'Senegal' },
  { code: 'SC', fr: 'Seychelles', en: 'Seychelles' },
  { code: 'SL', fr: 'Sierra Leone', en: 'Sierra Leone' },
  { code: 'SO', fr: 'Somalie', en: 'Somalia' },
  { code: 'ZA', fr: 'Afrique du Sud', en: 'South Africa' },
  { code: 'SS', fr: 'Soudan du Sud', en: 'South Sudan' },
  { code: 'SD', fr: 'Soudan', en: 'Sudan' },
  { code: 'TZ', fr: 'Tanzanie', en: 'Tanzania' },
  { code: 'TG', fr: 'Togo', en: 'Togo' },
  { code: 'TN', fr: 'Tunisie', en: 'Tunisia' },
  { code: 'UG', fr: 'Ouganda', en: 'Uganda' },
  { code: 'ZM', fr: 'Zambie', en: 'Zambia' },
  { code: 'ZW', fr: 'Zimbabwe', en: 'Zimbabwe' },
  { code: 'FR', fr: 'France', en: 'France' },
  { code: 'BE', fr: 'Belgique', en: 'Belgium' },
  { code: 'CH', fr: 'Suisse', en: 'Switzerland' },
  { code: 'CA', fr: 'Canada', en: 'Canada' },
  { code: 'US', fr: 'États-Unis', en: 'United States' },
  { code: 'GB', fr: 'Royaume-Uni', en: 'United Kingdom' },
  { code: 'DE', fr: 'Allemagne', en: 'Germany' },
  { code: 'ES', fr: 'Espagne', en: 'Spain' },
  { code: 'IT', fr: 'Italie', en: 'Italy' },
  { code: 'PT', fr: 'Portugal', en: 'Portugal' },
  { code: 'NL', fr: 'Pays-Bas', en: 'Netherlands' },
  { code: 'BR', fr: 'Brésil', en: 'Brazil' },
  { code: 'HT', fr: 'Haïti', en: 'Haiti' },
  { code: 'LB', fr: 'Liban', en: 'Lebanon' },
  { code: 'AE', fr: 'Émirats arabes unis', en: 'United Arab Emirates' },
  { code: 'SA', fr: 'Arabie saoudite', en: 'Saudi Arabia' },
  { code: 'IN', fr: 'Inde', en: 'India' },
  { code: 'CN', fr: 'Chine', en: 'China' },
  { code: 'JP', fr: 'Japon', en: 'Japan' },
  { code: 'AU', fr: 'Australie', en: 'Australia' },
]

/** Émoji drapeau dérivé algorithmiquement du code ISO (paire de "regional
 * indicator symbols") — évite de stocker/maintenir 74 emoji à la main. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return '🏳️'
  const base = 0x1f1e6
  const chars = code
    .toUpperCase()
    .split('')
    .map((c) => base + (c.charCodeAt(0) - 65))
  return String.fromCodePoint(...chars)
}

export function countryName(code: string | null | undefined, lang: 'fr' | 'en'): string | null {
  if (!code) return null
  const found = COUNTRIES.find((c) => c.code === code)
  return found ? found[lang] : code
}
