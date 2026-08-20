import { ROLES, type RoleId } from './roles'
import type { TranslationKey } from '../i18n/translations'

// ============================================================================
// Traduction du journal de partie (game_log.message, night_recap[].message).
//
// Signalement utilisateur : "le game log dans la partie n'est pas traduit en
// anglais". Ces messages sont générés en français directement par les
// fonctions SQL du moteur de jeu (~22 fonctions au dernier compte,
// accumulées sur 84 migrations) — un joueur anglophone les voyait tels quels
// quelle que soit sa langue.
//
// Retraduire proprement côté serveur (colonnes message_key/message_params
// structurées) demanderait de retoucher chacune de ces fonctions sur une
// partie en cours avec de vrais joueurs — risque disproportionné pour ce
// correctif. Solution retenue à la place : reconnaissance de motifs côté
// client. Chaque phrase française connue (fixe, ou avec un nom de joueur
// interpolé) est reconnue par un motif ci-dessous et restituée via une clé
// i18n (voir translations.ts, namespace `gameLog.*`). Un message qui ne
// correspond à AUCUN motif connu (texte admin personnalisé, futur message
// pas encore couvert ici...) reste affiché tel quel en français plutôt que
// de disparaître ou d'afficher une erreur — dégradation sans casse.
//
// IMPORTANT pour la maintenance : toute nouvelle phrase de game_log ajoutée
// côté SQL (nouvelle fonction, nouveau insert into game_log) doit avoir son
// pendant ici pour être traduite en anglais — sinon elle restera affichée en
// français aux joueurs anglophones sans erreur visible (juste un motif
// manquant, silencieux).
// ============================================================================

type Vars = Record<string, string>
type Match = { key: TranslationKey; vars?: Vars }

// role_display_name() côté SQL (voir supabase/migrations, fonction
// role_display_name) → RoleId, pour réutiliser les traductions déjà
// existantes de role.<id>.name plutôt que d'en dupliquer une copie ici.
const ROLE_NAME_FR_TO_ID: Record<string, RoleId> = {
  Villageois: 'villageois',
  'Loup-Garou': 'loup_garou',
  Voyante: 'voyante',
  Sorcière: 'sorciere',
  Chasseur: 'chasseur',
  'Petite Fille': 'petite_fille',
  Cupidon: 'cupidon',
  Ancien: 'ancien',
  Voleur: 'voleur',
  'Enfant Sauvage': 'enfant_sauvage',
}

// death_phrase() côté SQL → clé de traduction. Utilisé par la ligne de mort
// générique (voir tryDeathLine ci-dessous) : name + ' (' + role + ') ' + cause.
const DEATH_CAUSE_FR_TO_KEY: [string, TranslationKey][] = [
  ['a été dévoré par les Loups-Garous cette nuit.', 'gameLog.death.loup_garou'],
  ['a été empoisonné par la Sorcière cette nuit.', 'gameLog.death.sorciere'],
  ['est mort de chagrin, son amoureux ayant péri.', 'gameLog.death.chagrin'],
  ['a été abattu par le Chasseur.', 'gameLog.death.chasseur'],
  ['a été éliminé par le vote du village.', 'gameLog.death.vote'],
  ['a été surprise en train d’espionner les loups... et en a payé le prix.', 'gameLog.death.petite_fille_surprise'],
  ['a quitté la partie.', 'gameLog.death.parti'],
  ['a été exclu(e) de la partie par l’hôte.', 'gameLog.death.exclu'],
  ['est mort.', 'gameLog.death.default'],
]

// Messages fixes, sans variable — la grande majorité des templates.
const EXACT_MATCHES: Record<string, TranslationKey> = {
  '🌞 Le village a éliminé tous les Loups-Garous. Le village gagne !': 'gameLog.villageWins',
  '🐺 Les Loups-Garous ont dévoré assez de villageois pour prendre le contrôle. Les loups gagnent !': 'gameLog.wolvesWin',
  '💘 Il ne reste que les deux amoureux... L’amour triomphe !': 'gameLog.loversWin',
  'La partie a été arrêtée par un administrateur.': 'gameLog.gameStoppedByAdmin',
  'La partie a été créée. En attente des joueurs...': 'gameLog.gameCreated',
  '⚖️ Le village a eu tort de lyncher l’Ancien : ses pouvoirs spéciaux s’éteignent pour le reste de la partie...':
    'gameLog.ancienLynchedPowersOff',
  '🌑 Une ombre a changé de camp cette nuit... un villageois a secrètement rejoint les Loups-Garous.': 'gameLog.wildChildConverted',
  '🗳️ Aucun vote exprimé pour l’élection du Capitaine : la partie se jouera sans lui.': 'gameLog.captainElectionNoVotes',
  '🧪 La Sorcière a utilisé sa potion de guérison pour sauver la victime des loups.': 'gameLog.witchHealed',
  '☀️ Le village se réveille : personne n’est mort cette nuit !': 'gameLog.noOneDiedTonight',
  '🔄 Une nouvelle partie va commencer avec le même groupe !': 'gameLog.restartSameGroup',
  '🎭 Les rôles ont été distribués en secret. Regardez votre carte...': 'gameLog.rolesDistributed',
  '💘 Cupidon a décoché ses flèches...': 'gameLog.cupidonArrows',
  '🐾 L’Enfant Sauvage a choisi son mentor en secret.': 'gameLog.wildChildChoseMentor',
  '🧪 La Sorcière a fait son choix en secret.': 'gameLog.witchChoseSecret',
  '🃏 Le Voleur a fait son choix en secret.': 'gameLog.thiefChoseSecret',
  '🔮 La Voyante a sondé un joueur en secret.': 'gameLog.seerScried',
  '🎖️ Élisez votre Capitaine avant que la nuit ne tombe !': 'gameLog.captainElectionCall',
  '💬 Le village débat. Qui soupçonnez-vous ?': 'gameLog.debateOpen',
  '🗳️ Le vote est ouvert !': 'gameLog.voteOpen',
  '🗳️ Aucun vote exprimé : personne n’est éliminé aujourd’hui.': 'gameLog.voteNoVotes',
  '🗳️ Égalité des voix : personne n’est éliminé aujourd’hui.': 'gameLog.voteTie',
}

// Motifs avec un nom de joueur (préfixe et/ou suffixe fixes). Testés dans
// l'ordre : les suffixes les plus spécifiques d'abord, pour ne jamais
// capturer un fragment de rôle générique ("(Chasseur)"...) à la place d'un
// message dédié plus précis.
const NAME_SUFFIX_RULES: { suffix: string; key: TranslationKey; prefix?: string }[] = [
  { suffix: ' a rejoint la partie.', key: 'gameLog.playerJoined' },
  { suffix: ' a été retiré(e) du salon par l’hôte.', key: 'gameLog.playerKicked' },
  { suffix: ' a quitté le salon.', key: 'gameLog.playerLeft' },
  { suffix: ' (Ancien) encaisse l’attaque des Loups-Garous et s’accroche à la vie !', key: 'gameLog.ancienSurvives' },
  { suffix: ' était le Capitaine : il ou elle désigne son successeur dans son dernier souffle.', key: 'gameLog.captainDyingSuccession' },
  { suffix: ' (Chasseur) choisit de ne tirer sur personne.', key: 'gameLog.hunterNoShot' },
  { suffix: ' (Chasseur) n’a pas tiré à temps.', key: 'gameLog.hunterTimeout' },
  { suffix: ' (ancien Capitaine) n’a pas désigné de successeur à temps : le titre est perdu.', key: 'gameLog.captainSuccessionTimeout' },
  { prefix: '🎖️ ', suffix: ' devient le nouveau Capitaine.', key: 'gameLog.captainSuccession' },
  { prefix: '🏛️ ', suffix: ' devient le nouveau Maire.', key: 'gameLog.mayorSuccession' },
  { prefix: '🎖️ ', suffix: ' est élu(e) Capitaine du village !', key: 'gameLog.captainElected' },
  { prefix: '🎖️ ', suffix: ' (Capitaine) lance le vote, avec l’accord de la majorité du village !', key: 'gameLog.captainCallsVote' },
  { prefix: '🛠️ ', suffix: ' (Modérateur) lance le vote, avec l’accord de la majorité du village !', key: 'gameLog.hostCallsVote' },
  {
    prefix: '🎖️ Personne n’a désigné de successeur à temps : le sort en a décidé — ',
    suffix: ' devient le nouveau Capitaine !',
    key: 'gameLog.captainRandomSuccessor',
  },
]

// "Un joueur a rejoint la partie." (nom vide, voir _add_player_to_game côté
// SQL) : n'a pas de sens à traduire mot à mot, on retombe sur le libellé
// générique déjà traduit ailleurs (common.playerFallback = "Player").
const EMPTY_NAME_FALLBACK_FR = 'Un joueur'

function tryNameSuffix(message: string): Match | null {
  for (const rule of NAME_SUFFIX_RULES) {
    if (rule.prefix && !message.startsWith(rule.prefix)) continue
    if (!message.endsWith(rule.suffix)) continue
    const start = rule.prefix ? rule.prefix.length : 0
    const name = message.slice(start, message.length - rule.suffix.length)
    if (!name) continue
    return { key: rule.key, vars: { name: name === EMPTY_NAME_FALLBACK_FR ? '{{fallback}}' : name } }
  }
  return null
}

interface DeathLineMatch {
  name: string
  roleId: RoleId | null
  roleFr: string
  causeKey: TranslationKey
}

// Ligne de mort générique composée par kill_player() :
// "{{name}} ({{role_display_name}}) {{death_phrase}}" — couvre toutes les
// combinaisons rôle × cause de mort sans avoir à toutes les lister une par
// une (elles le sont déjà, séparément, dans ROLE_NAME_FR_TO_ID et
// DEATH_CAUSE_FR_TO_KEY).
function tryDeathLine(message: string): DeathLineMatch | null {
  for (const [causeFr, causeKey] of DEATH_CAUSE_FR_TO_KEY) {
    const suffix = ' ' + causeFr
    if (!message.endsWith(suffix)) continue
    const rest = message.slice(0, message.length - suffix.length)
    const roleMatch = /^(.*) \(([^()]+)\)$/.exec(rest)
    if (!roleMatch) continue
    const [, name, roleFr] = roleMatch
    if (!name) continue
    return { name, roleId: ROLE_NAME_FR_TO_ID[roleFr] ?? null, roleFr, causeKey }
  }
  return null
}

/** Traduit un message du journal de partie si sa langue est l'anglais et
 * qu'un motif français connu correspond ; renvoie le message d'origine
 * inchangé sinon (français demandé, ou aucun motif reconnu). */
export function translateGameLogMessage(
  message: string,
  lang: 'fr' | 'en',
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  if (lang !== 'en') return message

  const exactKey = EXACT_MATCHES[message]
  if (exactKey) return t(exactKey)

  const nameMatch = tryNameSuffix(message)
  if (nameMatch) {
    const rawName = nameMatch.vars?.name
    const name = rawName === '{{fallback}}' ? t('common.playerFallback') : (rawName ?? '')
    return t(nameMatch.key, { name })
  }

  const deathMatch = tryDeathLine(message)
  if (deathMatch) {
    const roleLabel = deathMatch.roleId ? t(ROLES[deathMatch.roleId].nameKey) : deathMatch.roleFr
    const causeLabel = t(deathMatch.causeKey)
    return t('gameLog.deathLine', { name: deathMatch.name, role: roleLabel, cause: causeLabel })
  }

  const nightMatch = /^🌙 La nuit (\d+) tombe sur le village\. Tout le monde ferme les yeux\.\.\.$/.exec(message)
  if (nightMatch) return t('gameLog.nightFalls', { n: nightMatch[1] })

  // Aucun motif reconnu : message affiché tel quel (voir commentaire en tête
  // de fichier — dégradation sans casse plutôt qu'un texte manquant).
  return message
}
