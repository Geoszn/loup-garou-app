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
  | 'enfant_sauvage'
  | 'voyante'
  | 'loup_garou'
  | 'sorciere'
  | 'resolve'
  | null

export interface RoleCounts {
  loup_garou: number
  // Carte avancée (voir migration 0088, refonte 0093) : nécessite >= 10
  // joueurs et au plus 2 loup_garou "simples". Vote avec le reste de la
  // meute pendant l'étape collective classique 'loup_garou' (son vote compte
  // double, comme le Capitaine en journée) — pas d'étape de nuit dédiée.
  loup_alpha: boolean
  voyante: boolean
  sorciere: boolean
  chasseur: boolean
  petite_fille: boolean
  cupidon: boolean
  ancien: boolean
  voleur: boolean
  enfant_sauvage: boolean
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

// Jeu fixe de réactions (voir migration 0066, même liste côté serveur dans
// toggle_chat_reaction) — pas de texte libre, pour rester simple à afficher
// en pastilles groupées et ne pas ouvrir un canal de contenu arbitraire.
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

export interface ChatReaction {
  id: string
  message_id: string
  user_id: string
  display_name: string
  emoji: ReactionEmoji
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
  // Palier de rang ACTUEL du joueur (voir get_my_game_view, migration 0074)
  // — calculé en direct depuis profiles.rank_points à chaque lecture, pas
  // stocké sur la ligne game_players : reflète toujours le rang à l'instant
  // présent, même s'il a changé depuis le début de la partie. Sert au cadre
  // affiché autour de l'avatar (voir PlayerGrid.tsx) — visible par les
  // AUTRES joueurs, pas seulement sur son propre profil. null si le profil a
  // été supprimé entre-temps (cas limite, RLS empêchant normalement ça).
  rank_tier: string | null
}

export interface MyGameView {
  game: GameRow
  players: PublicPlayer[]
  my_role: string | null
  my_alive: boolean
  lover_id: string | null
  // Mentor secrètement choisi par l'Enfant Sauvage (voir migration 0052) —
  // toujours la donnée propre à SA ligne game_roles_secret, même une fois
  // converti en Loup-Garou après la mort de ce mentor. null tant qu'il n'a
  // pas encore choisi, ou pour tout autre rôle.
  wild_child_mentor: string | null
  // Inverse de wild_child_mentor : les Enfants Sauvages qui ME choisissent
  // comme mentor (voir migration 0061). Toujours calculé, mais uniquement
  // affiché à la nuit 1 par NightRecapModal — seul moment où ce choix a
  // lieu (voir next_night_step, 0052_enfant_sauvage.sql).
  mentee_ids: string[]
  // Personnel (calculé côté serveur à partir de auth.uid(), voir migration
  // 0068) : est-ce que MOI j'ai été la cible de la potion de vie / de mort
  // de la Sorcière CETTE nuit — vrai uniquement pendant le récap de nuit
  // correspondant (statut 'day_reveal'), comme lover_id/mentee_ids ci-dessus.
  witch_saved_me: boolean
  witch_poisoned_me: boolean
  // Personnel (calculé côté serveur, voir migration 0069) : est-ce que MOI
  // j'ai perdu mon mentor et rejoint les Loups-Garous CETTE nuit — vrai
  // uniquement pendant le récap de la nuit concernée (statut 'day_reveal'),
  // même principe que witch_saved_me/witch_poisoned_me ci-dessus. Jamais
  // révélé à qui que ce soit d'autre : avant cette migration, kill_player
  // écrivait ce changement en clair dans le journal public, ce qui révélait
  // l'identité de l'Enfant Sauvage à tout le village.
  wild_child_turned_wolf: boolean
  // Public (voir migration 0099), même patron que alpha_infection_occurred
  // plus bas : au moins un Enfant Sauvage a-t-il rejoint les Loups-Garous à
  // un moment de la partie ? Ne révèle ni qui ni quand -- sert juste à
  // corriger totalWolves dans RosterSummary.tsx, qui sinon reste figé sur
  // role_counts (composition initiale).
  wild_child_conversion_occurred: boolean
  // Public (voir migration 0100) : même principe que le champ ci-dessus,
  // mais borné au round actuellement affiché en récap (nuit OU vote de
  // jour) — redevient faux une fois le round passé. Couvre le cas où le
  // mentor meurt lynché de jour (VoteRecapModal), jusqu'ici invisible.
  wild_child_conversion_this_round: boolean
  // Personnel (voir migration 0087) : est-ce que MOI j'ai été la victime du
  // Voleur (échange de carte à l'aveugle) — pas de restriction de phase
  // côté serveur (contrairement à witch_saved_me etc.), le client limite
  // lui-même l'affichage à la nuit 1 (voir NightResultPanel, GameRoom.tsx).
  // thief_stole_my_new_role est mon nouveau rôle après l'échange (toujours
  // 'voleur' en pratique, puisque le Voleur me prend en échange de sa propre
  // carte) — déjà reflété dans my_role aussi, ce champ sert juste au message
  // d'annonce ponctuel.
  thief_stole_my_card: boolean
  thief_stole_my_new_role: string | null
  // Personnel (voir migration 0097) : symétrique aux deux champs ci-dessus,
  // mais pour MOI en tant qu'ACTEUR du vol (le Voleur lui-même) -- retour
  // utilisateur : sans ça, il n'avait aucune confirmation de son action, le
  // panneau disparaissant juste immédiatement après le clic (submit_voleur
  // fait avancer la phase dans la foulée). thief_my_new_role est mon nouveau
  // rôle (celui que la victime avait avant l'échange).
  thief_i_stole: boolean
  thief_my_new_role: string | null
  // Personnel (voir migration 0088) : ai-je été infecté(e) par le Loup Alpha
  // CETTE nuit (même principe que wild_child_turned_wolf plus haut, gated
  // 'day_reveal') ? my_role reflète déjà mon nouveau rôle en temps réel, ce
  // champ ne sert qu'à déclencher l'annonce ponctuelle.
  alpha_infected_me: boolean
  // Public (voir migration 0095) : une infection a-t-elle eu lieu quelque
  // part dans la partie (n'importe quand, pas juste cette nuit) ? Ne révèle
  // ni qui a été infecté ni qui est l'Alpha — déjà annoncé publiquement dans
  // le journal au moment des faits ("un villageois a secrètement rejoint les
  // Loups-Garous"). Un Loup Alpha ne pouvant infecter qu'une seule fois par
  // partie, ce booléen suffit (jamais plus d'une conversion possible). Sert
  // à corriger le total de loups affiché par RosterSummary.tsx, qui sinon
  // reste figé sur la composition initiale (role_counts).
  alpha_infection_occurred: boolean
  // Personnel, uniquement rempli si my_role === 'loup_alpha' : ai-je déjà
  // consommé mon infection (une seule par partie) ? Sert à désactiver le
  // bouton "Infecter" côté client sans attendre un refus serveur.
  alpha_infect_used: boolean | null
  // Refonte 0093 : visible par toute la meute (loup_garou ou loup_alpha)
  // pendant l'étape de nuit 'loup_garou', uniquement si un Loup Alpha est en
  // jeu et n'a pas encore utilisé son infection — conditionne l'affichage
  // même de la section "accord pour infecter" côté client.
  alpha_infect_available: boolean
  // Loups (identifiants user_id) déjà déclarés d'accord pour infecter cette
  // nuit (voir submit_alpha_infect_agreement) — sert à afficher le décompte
  // "X / majorité nécessaire" et le badge ✓ sur chaque loup dans la liste.
  alpha_infect_agreed_ids: string[]
  // Est-ce que le Loup Alpha a déjà confirmé vouloir infecter cette nuit
  // (submit_loup_alpha_confirm_infect) ? Peut redevenir false si un loup
  // retire son accord et fait retomber le total sous la majorité — revérifié
  // par le serveur au moment de resolve_night_deaths de toute façon.
  alpha_infect_confirmed: boolean
  // Coéquipiers loups (loup_garou ET loup_alpha, tous les deux confondus
  // désormais) — visible pour un loup simple ET pour l'Alpha lui-même.
  wolf_teammates: string[]
  // Identifiant du Loup Alpha parmi wolf_teammates ci-dessus (ou soi-même),
  // null si cette partie n'a pas de Loup Alpha. Sert à le distinguer
  // visuellement dans la liste (badge).
  wolf_alpha_id: string | null
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
    // Message d'annonce si le Capitaine a été désigné au hasard faute de
    // successeur choisi à temps pendant CE round (voir migration 0053) —
    // null la plupart du temps.
    captain_random_notice: string | null
  } | null
  final_reveal: { user_id: string; role: string }[] | null
  // Demandes en attente pour une partie publique — uniquement rempli côté
  // hôte, tant que la partie est publique et encore en salon (voir
  // respond_join_request, migration 0033).
  join_requests: JoinRequest[] | null
  // Bonus d'impact déjà acquis (voir migration 0073) — rempli uniquement
  // pour MOI, une fois mort, tant que la partie continue (game.status !==
  // 'ended'). Sert à la popup de mort : jamais le résultat final
  // (victoire/défaite), seulement ce qui est déjà gagné et ne peut plus
  // changer. null tant qu'on est vivant, ou une fois la partie terminée
  // (voir my_game_result ci-dessous, qui prend le relai).
  my_impact_preview: ImpactBonus | null
  // Détail complet de mon résultat pour cette partie (voir migration 0073) —
  // rempli uniquement une fois game.status === 'ended', lu depuis
  // game_results (permanent, jamais recalculé). Alimente la section
  // personnelle de l'écran de fin.
  my_game_result: MyGameResult | null
}

// Un geste de rôle mesurable ayant rapporté des points, quel que soit le
// résultat final de la partie (voir compute_impact_bonus, migration 0073).
// `count` uniquement pour les bonus qui peuvent se répéter (voir Voyante).
export type ImpactKind =
  | 'witch_heal'
  | 'witch_poison_wolf'
  | 'hunter_shot_wolf'
  | 'seer_wolf_reveal'
  | 'ancien_extra_life'

export interface ImpactDetail {
  kind: ImpactKind
  points: number
  count?: number
}

export interface ImpactBonus {
  bonus: number
  details: ImpactDetail[]
}

export interface MyGameResult {
  // Delta de points de classement réellement appliqué pour cette partie
  // (déjà écrêté par rank_floor le cas échéant côté serveur — voir
  // apply_rank_result, migration 0073). Peut être négatif.
  points_gained: number
  // Part de la partie effectivement vécue (0.4 à 1.0) — voir
  // apply_rank_updates_for_game, migration 0073.
  participation_ratio: number
  impact_bonus: number
  impact_details: ImpactDetail[]
  new_rank_points: number
  new_rank_tier: string
  won: boolean
}
