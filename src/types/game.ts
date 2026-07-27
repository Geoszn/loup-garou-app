export type GameStatus =
  | 'lobby'
  | 'role_reveal'
  | 'captain_election'
  | 'night'
  | 'day_reveal'
  | 'day_discussion'
  | 'day_vote'
  | 'day_vote_recap'
  | 'ended'

export type NightStep =
  | 'voleur'
  | 'cupidon'
  | 'voyante'
  | 'loup_garou'
  | 'sorciere'
  | 'resolve'
  | null

export interface RoleCounts {
  loup_garou: number
  voyante: boolean
  sorciere: boolean
  chasseur: boolean
  petite_fille: boolean
  cupidon: boolean
  ancien: boolean
  voleur: boolean
  capitaine: boolean
}

export interface GameSettings {
  discussion_seconds: number
  vote_seconds: number
  vote_recap_seconds: number
  night_step_seconds: number
  wolf_chat_seconds: number
  role_reveal_seconds: number
  role_reveal_intro_seconds: number
  role_counts?: RoleCounts | null
}

export type ChatChannel = 'village' | 'wolves' | 'graveyard'

export interface ChatMessage {
  id: string
  game_id: string
  channel: ChatChannel
  // null pour un message anonyme du salon "village" envoyé la nuit — voir
  // is_anonymous et chat_message_identities (migration 0026).
  user_id: string | null
  display_name: string | null
  content: string
  is_anonymous: boolean
  created_at: string
  // Message auquel celui-ci répond, le cas échéant (voir migration 0041).
  // null la plupart du temps. La bulle citée elle-même n'est jamais
  // renvoyée à part : le client la retrouve dans les messages déjà chargés
  // (voir ChatPanel.tsx) — plus simple qu'une jointure serveur, et suffisant
  // puisqu'on ne répond en pratique qu'à un message déjà visible à l'écran.
  reply_to_message_id: string | null
}

export interface GameRow {
  id: string
  code: string
  host_id: string
  status: GameStatus
  night_number: number
  night_step: NightStep
  phase_deadline: string | null
  settings: GameSettings
  winner_team: string | null
  hunter_pending: string | null
  // Liste de mots interdits dans le chat, gérée par l'hôte (voir
  // set_blocked_words, migration 0030).
  blocked_words: string[]
  // Partie découvrable depuis le tableau de bord (voir list_public_games,
  // migration 0033). false par défaut : accessible uniquement par
  // invitation, lien ou code, comme avant.
  is_public: boolean
  created_at: string
}

// Une partie publique listée sur le tableau de bord, avant qu'on en soit
// membre (voir list_public_games).
export interface PublicGameListing {
  game_id: string
  code: string
  // 'lobby' (rejoignable dès validation de l'hôte) ou tout statut en cours
  // (la demande attendra le retour au salon — voir list_public_games,
  // migration 0038). Jamais 'ended' : ces parties ne sont plus listées.
  status: GameStatus
  host_name: string
  host_avatar_icon: string | null
  player_count: number
  created_at: string
  already_requested: boolean
}

export interface JoinRequest {
  id: string
  user_id: string
  display_name: string
  created_at: string
}

export interface PublicPlayer {
  id: string
  game_id: string
  user_id: string
  display_name: string
  seat_number: number
  is_host: boolean
  is_alive: boolean
  death_cause: string | null
  died_at_night: number | null
  is_lover: boolean
  is_captain: boolean
  is_ready: boolean
  // Exclu par l'hôte (kick_player) : perd tout accès au chat, y compris le
  // cimetière — voir migration 0030.
  is_banned: boolean
  revealed_role: string | null
  avatar_color: string
  avatar_icon: string | null
  joined_at: string
}

export interface MyGameView {
  game: GameRow
  players: PublicPlayer[]
  my_role: string | null
  my_alive: boolean
  lover_id: string | null
  wolf_teammates: string[]
  seer_reveals: { target_id: string; role: string; night_number: number }[]
  witch_heal_used: boolean
  witch_poison_used: boolean
  pending_action_required: NightStep | 'vote' | 'hunter' | 'captain_vote' | 'captain_succession' | null
  wolf_target_visible_to_witch: string | null
  wolf_current_votes: { actor_id: string; target_id: string | null }[]
  log: { id: string; message: string; created_at: string }[]
  my_vote_target: string | null
  my_captain_vote_target: string | null
  vote_call_agreed_ids: string[]
  // Joueurs vivants déjà prêts à continuer pendant le récap de nuit (statut
  // 'day_reveal') — voir day_reveal_ready / submit_day_reveal_ready,
  // migration 0041. Toujours '[]' hors de ce statut précis.
  day_reveal_ready_ids: string[]
  // Titres de la nuit qui vient de s'écouler (morts, sauvetage de la
  // Sorcière, "personne n'est mort"...) — uniquement les entrées du journal
  // taguées night_number = nuit courante (voir migration 0043), pas tout le
  // journal. Toujours '[]' hors du statut 'day_reveal'.
  night_recap: { id: string; message: string }[]
  // Détail du vote du jour (qui a voté pour qui) + joueurs déjà prêts à
  // continuer — uniquement rempli pendant le statut 'day_vote_recap'.
  // captain_voter_id : qui avait le vote double PENDANT ce vote précis (pas
  // forcément le Capitaine actuel si son titre a changé de mains depuis).
  vote_recap: {
    votes: { voter_id: string; target_id: string | null }[]
    ready_ids: string[]
    captain_voter_id: string | null
  } | null
  final_reveal: { user_id: string; role: string }[] | null
  thief_extra_roles: string[] | null
  // Demandes en attente pour une partie publique — uniquement rempli côté
  // hôte, tant que la partie est publique et encore en salon (voir
  // respond_join_request, migration 0033).
  join_requests: JoinRequest[] | null
}
