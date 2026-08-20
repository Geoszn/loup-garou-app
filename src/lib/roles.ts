import type { TranslationKey } from '../i18n/translations'

export type RoleId =
  | 'villageois'
  | 'loup_garou'
  | 'loup_alpha'
  | 'voyante'
  | 'sorciere'
  | 'chasseur'
  | 'petite_fille'
  | 'cupidon'
  | 'ancien'
  | 'voleur'
  | 'enfant_sauvage'

// Les noms/descriptions ne sont plus stockés en dur ici : ce sont des clés du
// dictionnaire i18n (voir src/i18n/translations.ts, namespace `role.*`), pour
// que role.name / role.description suivent la langue choisie par le joueur.
// Un composant lit ces clés via `t()` (voir roleLabel/roleName/roleDescription
// ci-dessous), jamais directement.
export interface RoleInfo {
  id: RoleId
  team: 'village' | 'loups'
  emoji: string
  color: string
  nameKey: TranslationKey
  descriptionKey: TranslationKey
  nightActionKey?: TranslationKey
}

export const ROLES: Record<RoleId, RoleInfo> = {
  villageois: {
    id: 'villageois',
    team: 'village',
    emoji: '🧑‍🌾',
    color: '#8fb8e0',
    nameKey: 'role.villageois.name',
    descriptionKey: 'role.villageois.description',
  },
  loup_garou: {
    id: 'loup_garou',
    team: 'loups',
    emoji: '🐺',
    color: '#e0455a',
    nameKey: 'role.loup_garou.name',
    descriptionKey: 'role.loup_garou.description',
    nightActionKey: 'role.loup_garou.nightAction',
  },
  loup_alpha: {
    id: 'loup_alpha',
    team: 'loups',
    emoji: '👑',
    color: '#a4283f',
    nameKey: 'role.loup_alpha.name',
    descriptionKey: 'role.loup_alpha.description',
    nightActionKey: 'role.loup_alpha.nightAction',
  },
  voyante: {
    id: 'voyante',
    team: 'village',
    emoji: '🔮',
    color: '#c58ee0',
    nameKey: 'role.voyante.name',
    descriptionKey: 'role.voyante.description',
    nightActionKey: 'role.voyante.nightAction',
  },
  sorciere: {
    id: 'sorciere',
    team: 'village',
    emoji: '🧪',
    color: '#7fd6a4',
    nameKey: 'role.sorciere.name',
    descriptionKey: 'role.sorciere.description',
    nightActionKey: 'role.sorciere.nightAction',
  },
  chasseur: {
    id: 'chasseur',
    team: 'village',
    emoji: '🏹',
    color: '#e0a655',
    nameKey: 'role.chasseur.name',
    descriptionKey: 'role.chasseur.description',
  },
  petite_fille: {
    id: 'petite_fille',
    team: 'village',
    emoji: '🎀',
    color: '#e0d155',
    nameKey: 'role.petite_fille.name',
    descriptionKey: 'role.petite_fille.description',
  },
  cupidon: {
    id: 'cupidon',
    team: 'village',
    emoji: '💘',
    color: '#e08fc0',
    nameKey: 'role.cupidon.name',
    descriptionKey: 'role.cupidon.description',
    nightActionKey: 'role.cupidon.nightAction',
  },
  ancien: {
    id: 'ancien',
    team: 'village',
    emoji: '🧓',
    color: '#c9a86a',
    nameKey: 'role.ancien.name',
    descriptionKey: 'role.ancien.description',
  },
  voleur: {
    id: 'voleur',
    team: 'village',
    emoji: '🃏',
    color: '#8a7ec9',
    nameKey: 'role.voleur.name',
    descriptionKey: 'role.voleur.description',
    nightActionKey: 'role.voleur.nightAction',
  },
  enfant_sauvage: {
    id: 'enfant_sauvage',
    // Camp affiché comme "village" : c'est son camp tant que le mentor est
    // vivant, et le camp qui apparaît dans les réglages/le récap (le
    // basculement vers les loups, s'il a lieu, est une conséquence du jeu,
    // pas un choix de configuration — exactement comme pour le Voleur qui
    // peut lui aussi finir loup).
    team: 'village',
    emoji: '🐾',
    color: '#b0895a',
    nameKey: 'role.enfant_sauvage.name',
    descriptionKey: 'role.enfant_sauvage.description',
    nightActionKey: 'role.enfant_sauvage.nightAction',
  },
}

export const ROLE_ORDER: RoleId[] = [
  'loup_garou',
  'loup_alpha',
  'voyante',
  'sorciere',
  'chasseur',
  'petite_fille',
  'cupidon',
  'ancien',
  'voleur',
  'enfant_sauvage',
  'villageois',
]

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string

/** Nom localisé d'un rôle à partir de son id (ou "Inconnu"/"Unknown" si
 * l'id est vide ou ne correspond à aucun rôle connu) — remplace l'ancien
 * `role.name` en dur. Utilisé partout où on n'a qu'un id de rôle sous la
 * main (journal de partie, récap de vote, statistiques...). */
export function roleLabel(id: string | null | undefined, t: Translate): string {
  if (!id) return t('role.unknown')
  const role = ROLES[id as RoleId]
  return role ? t(role.nameKey) : id
}

export function roleName(id: RoleId, t: Translate): string {
  return t(ROLES[id].nameKey)
}

export function roleDescription(id: RoleId, t: Translate): string {
  return t(ROLES[id].descriptionKey)
}

export function roleNightAction(id: RoleId, t: Translate): string | undefined {
  const key = ROLES[id].nightActionKey
  return key ? t(key) : undefined
}

export function roleTeamLabel(team: 'village' | 'loups', t: Translate): string {
  return team === 'loups' ? t('role.team.loups') : t('role.team.village')
}

/** true si l'id de rôle donné appartient au camp des Loups (Loup-Garou
 * classique OU Loup Alpha, voir migration 0088) — remplace les comparaisons
 * `=== 'loup_garou'` disséminées dans le client, qui ignoraient le Loup
 * Alpha (coéquipiers, chat des loups, impossibilité de se cibler entre
 * loups, décompte de fin de partie...). Un villageois infecté devient
 * réellement 'loup_garou' côté serveur, donc déjà couvert sans changement
 * ici. */
export function isWolfTeam(roleId: string | null | undefined): boolean {
  if (!roleId) return false
  const role = ROLES[roleId as RoleId]
  return role?.team === 'loups'
}
