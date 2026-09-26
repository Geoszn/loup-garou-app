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
  | 'daron'
  | 'voleur'
  | 'cupidon'
  | 'enfant_sauvage'
  | 'voyante'
  | 'griot'
  | 'loup_garou'
  | 'grand_mechant_loup'
  | 'sorciere'
  | 'anancy'
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
  // Le Griot (voir migration 0116) : joue toujours juste après la Voyante,
  // jamais la nuit 1 (rien à raconter avant qu'une première nuit se soit
  // écoulée) — voir next_night_step côté serveur.
  griot: boolean
  // Le Sans-Visage (voir migration 0118) : fonctionne exactement comme un
  // Loup-Garou simple (vote de nuit, chat des loups, victoire) — seule
  // différence, gérée entièrement côté serveur : la Voyante le voit
  // toujours comme "villageois".
  sans_visage: boolean
  // Anancy (voir migration 0119) : camp neutre, échange les rôles de deux
  // joueurs chaque nuit (jamais deux fois le même) — gagne seul s'il est
  // vivant à l'aube du cinquième jour.
  anancy: boolean
  // L'Ange (voir migration 0121) : entièrement passif, aucune étape de nuit.
  // Gagne seul, immédiatement, s'il meurt (peu importe la cause) pendant le
  // tout premier cycle nuit 1 + jour 1 — sinon redevient un villageois
  // ordinaire pour le reste de la partie.
  ange: boolean
  // Le Grand Méchant Loup (voir migration 0121) : vote avec la meute comme
  // un loup simple, puis peut dévorer une seconde victime (jamais un
  // coéquipier, invisible pour la Sorcière) tant qu'aucun loup n'est encore
  // mort dans la partie — pouvoir perdu pour de bon dès qu'un loup meurt.
  grand_mechant_loup: boolean
  // Le Daron (voir migration 0158) : protège un joueur différent chaque
  // nuit (auto-protection permise, jamais deux nuits de suite la même
  // personne) contre l'attaque des Loups ET le poison de la Sorcière —
  // sans jamais savoir qui il protège vraiment. Sélectionnable aussi par le
  // mode automatique (migration 0178).
  daron: boolean
  // La Chasseuse (voir migration 0162, rebaptisée en 0163 — anciennement
  // "Le Juge", mêmes mécaniques) : camp neutre. Au tout début du premier
  // jour (migration 0180), une cible vivante lui est désignée
  // automatiquement (aucune action de nuit à jouer) — elle gagne seule si
  // CETTE cible est éliminée par le vote du village. Si elle meurt
  // autrement, elle choisit d'abandonner (devient une simple villageoise)
  // ou de recevoir une nouvelle cible (une seule fois par partie).
  // Sélectionnable aussi par le mode automatique (migration 0178).
  chasseuse: boolean
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
  // Mode automatique (voir migration 0143, Lobby.tsx) : si vrai, start_game
  // ignore role_counts et recalcule toujours la composition via
  // compute_default_role_counts, selon l'effectif présent au moment réel du
  // lancement — jamais figé au moment où l'hôte a coché la case.
  auto_role_counts?: boolean
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
  // Message "Dernier Souffle" (migration 0148, artefact du Loup Store) :
  // envoyé au salon "village" par un joueur déjà éliminé, via send_last_words
  // (jamais via send_chat_message, qui bloque tout envoi d'un mort à ce
  // salon) — permet à ChatPanel.tsx de le distinguer visuellement (habillage
  // "fantôme") d'un message normal.
  is_last_words: boolean
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
  // Balance de l'Ange (artefact du Loup Store, migration 0152) : qui doit
  // départager l'égalité en cours (null la plupart du temps), et la liste
  // des joueurs à égalité parmi lesquels choisir — voir BalanceAngePanel
  // (ActionPanel.tsx).
  balance_ange_pending: string | null
  balance_ange_candidates: string[] | null
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

// Vue en lecture seule d'une partie en cours pour quelqu'un qui n'en est pas
// (encore) membre — sa demande pour la rejoindre reste "en attente" tant que
// la partie tourne (voir get_my_join_request_status / PendingApproval.tsx) et
// il peut en attendant observer la partie sans y participer (voir
// get_spectator_game_view, migration 0140). Volontairement un sous-ensemble
// de MyGameView : jamais de rôle, jamais de vote/action en cours.
export interface SpectatorGameView {
  game: GameRow
  players: PublicPlayer[]
  log: { id: string; message: string; created_at: string }[]
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
  // Effets cosmétiques du Loup Store (artefacts à effect_key = 'masque_griot'
  // / 'plume_anancy', migration 0151) — comme rank_tier ci-dessus, visibles
  // pour TOUS les joueurs de la partie, pas seulement le propriétaire.
  // plume_title_fr/en reprend name_fr/name_en de l'artefact tel qu'édité
  // dans le dashboard admin (jamais recopié en dur côté client) : null si le
  // joueur ne possède aucun artefact à effet 'plume_anancy'.
  has_masque_griot: boolean
  plume_title_fr: string | null
  plume_title_en: string | null
  // Pierre des Ancêtres (artefact du Loup Store, migration 0152) : ce joueur
  // vient d'être éliminé mais reviendra en jeu au tout prochain passage au
  // jour (voir advance_phase) — personnel, mais recalculé pour CHAQUE joueur
  // de la partie comme les champs cosmétiques ci-dessus (pas seulement soi),
  // pour que GhostPanel puisse en informer le joueur concerné.
  pending_revival: boolean
}

export interface MyGameView {
  game: GameRow
  players: PublicPlayer[]
  my_role: string | null
  my_alive: boolean
  // Anancy vient de me faire quitter le camp des Loups (voir migration
  // 0123) : je garde en mémoire mes ex-coéquipiers, donc muet au village —
  // ni écrire (ChatPanel readOnly) ni parler (VoiceChat listenOnly) —
  // jusqu'à ce que la nuit suivante commence. false pour tout le monde
  // d'autre, y compris un loup qui vient de REJOINDRE la meute (aucun
  // secret d'ex-coéquipier à trahir dans ce sens-là).
  village_muted: boolean
  // Personnel au Daron (voir migration 0158) : qui il a protégé la nuit
  // dernière (sert à griser cette cible dans son panneau — impossible de
  // protéger la même personne deux nuits de suite) et cette nuit (son
  // panneau d'action disparaissant dès l'envoi comme pour la Voyante/le
  // Griot, il n'a plus que ce champ pour se souvenir de son choix) — les
  // deux toujours calculés, jamais restreints à 'day_reveal'. Seul
  // daron_protection_worked l'est (même principe que witch_saved_me plus
  // bas) : la protection n'est résolue qu'à la transition nuit → récap.
  daron_previous_target_id: string | null
  daron_protected_id: string | null
  daron_protection_worked: boolean
  // Réservé à la cible protégée elle-même, JAMAIS au Daron (voir migration
  // 0167) : contrairement à daron_protection_worked ci-dessus, vrai dès
  // qu'on est choisi(e) comme cible cette nuit-là, que la protection ait
  // bloqué une attaque ou non — le Daron, lui, a déjà ses propres champs
  // dédiés ci-dessus, pas besoin d'un doublon.
  my_protected_by_daron_this_round: boolean
  lover_id: string | null
  // Mentor secrètement choisi par l'Enfant Sauvage (voir migration 0052) —
  // toujours la donnée propre à SA ligne game_roles_secret, même une fois
  // converti en Loup-Garou après la mort de ce mentor. null tant qu'il n'a
  // pas encore choisi, ou pour tout autre rôle.
  wild_child_mentor: string | null
  // Inverse de wild_child_mentor : est-ce qu'un (ou plusieurs) Enfant
  // Sauvage m'a choisi comme mentor (voir migration 0061, durcie en 0126) ?
  // Volontairement un simple booléen, jamais l'identité de l'Enfant Sauvage
  // — retour utilisateur explicite : le mentor doit savoir QU'IL a été
  // désigné, jamais PAR QUI. Toujours calculé, mais uniquement affiché à la
  // nuit 1 par NightRecapModal — seul moment où ce choix a lieu (voir
  // next_night_step, 0052_enfant_sauvage.sql).
  chosen_as_mentor: boolean
  // Personnel (calculé côté serveur à partir de auth.uid(), voir migration
  // 0068) : est-ce que MOI j'ai été la cible de la potion de vie / de mort
  // de la Sorcière CETTE nuit — vrai uniquement pendant le récap de nuit
  // correspondant (statut 'day_reveal'), comme lover_id/chosen_as_mentor ci-dessus.
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
  // Griot : jamais le rôle ni le camp du joueur observé, uniquement une
  // trace générique de son action DE LA NUIT PRÉCÉDENTE (night_number ici
  // est la nuit où LE GRIOT a choisi sa cible ; l'action décrite par `kind`
  // date de la nuit d'avant — voir compute_griot_phrase côté serveur et
  // GRIOT_REVEAL_KEYS côté client pour la traduction de chaque `kind`).
  griot_reveals: { target_id: string; night_number: number; kind: string }[]
  // Anancy (voir migration 0119) : true si mon rôle a été échangé la nuit
  // qui vient de se résoudre — révélé une fois, sans jamais dire par qui ni
  // vers quel rôle (je le découvre juste en regardant ma propre carte).
  // Toujours false hors du statut 'day_reveal'.
  anancy_swapped_me: boolean
  // Réservé à Anancy lui-même : qui il a déjà échangé (donc devenu
  // intouchable) — jamais leur rôle actuel, juste leur identité, pour
  // griser ces joueurs dans sa propre grille de cibles. null pour tout le
  // monde d'autre.
  anancy_used_target_ids: string[] | null
  // Réservée à la Chasseuse (voir migration 0162/0163) : le nom de sa cible
  // actuelle, ou null tant qu'aucune ne lui a encore été attribuée (avant
  // la deuxième nuit) ou pour tout autre rôle. jamais le camp ni le rôle de
  // cette cible — la Chasseuse ne les connaît jamais, voir
  // game_view_chasseuse_fields.
  my_chasseuse_target_name: string | null
  // Réservé à la Chasseuse : a-t-elle déjà utilisé son unique changement de
  // cible ? Toujours false tant qu'aucune décision "abandonner/continuer"
  // n'a encore eu lieu — sert surtout à informer le panneau d'info
  // persistant (ChasseuseTargetPanel, GameRoom.tsx), la décision elle-même
  // ne peut de toute façon apparaître qu'une fois (voir
  // pending_action_required === 'chasseuse_choice').
  my_chasseuse_used_reassignment: boolean | null
  // Réservé à la Chasseuse (voir migration 0166) : vrai uniquement pendant
  // le récap ('day_reveal') de la nuit où sa cible ACTUELLE vient d'être
  // désignée — sert à déclencher une révélation ponctuelle dans
  // NightRecapModal, une seule fois, même patron que witch_saved_me/
  // alpha_infected_me ci-dessus. Toujours false pour une réattribution
  // volontaire (submit_chasseuse_choice) : le joueur vient de le décider
  // lui-même, son panneau permanent se met déjà à jour immédiatement.
  my_chasseuse_target_assigned_this_round: boolean
  witch_heal_used: boolean
  witch_poison_used: boolean
  pending_action_required:
    | NightStep
    | 'vote'
    | 'hunter'
    | 'captain_vote'
    | 'captain_succession'
    | 'balance_ange'
    | 'chasseuse_choice'
    | 'revival_choice'
    | null
  wolf_target_visible_to_witch: string | null
  wolf_current_votes: { actor_id: string; target_id: string | null }[]
  // Qui a voté pour qui cette nuit (une fois résolue) — réservé aux Loups
  // eux-mêmes (jamais aux villageois), rempli uniquement pendant
  // 'day_reveal' (voir migration 0113). target_name null = soit un vote
  // "infecter" (chose_infect true), soit une abstention (chose_infect
  // false) — les deux partagent target_id null côté serveur.
  wolf_night_recap:
    | { actor_id: string; actor_name: string; is_alpha: boolean; target_id: string | null; target_name: string | null; chose_infect: boolean }[]
    | null
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
    // Feu Sacré des Ancêtres (artefact du Loup Store, migration 0152) : le
    // joueur le plus voté a été protégé cette fois-ci — annoncé de façon
    // anonyme, comme la potion de guérison de la Sorcière (voir
    // feu_sacre_saved_me plus bas pour la notice privée au protégé
    // lui-même).
    protected_by_feu_sacre: boolean
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
  // Artefacts du Loup Store possédés par le joueur courant (migration 0148)
  // — my_owns_parchemin_griot permet à un joueur éliminé (n'importe quel
  // rôle, depuis migration 0182) de lire le chat "wolves" la nuit une fois
  // l'artefact activé (voir can_read_channel côté
  // serveur, aucun changement d'écriture) ; my_owns_dernier_souffle/
  // my_dernier_souffle_used pilotent la proposition d'envoyer un dernier
  // message au village juste après sa propre élimination (voir
  // send_last_words, GhostPanel côté client) — used repart à false à
  // chaque nouvelle partie (propre à game_artifact_uses, par partie).
  my_owns_parchemin_griot: boolean
  // Activation explicite du Parchemin du Griot (migration 0179) : la simple
  // possession (my_owns_parchemin_griot) ne suffit plus à donner accès au
  // chat des Loups — le joueur doit l'activer lui-même depuis le menu
  // "Mes artefacts" (ArtifactsMenu.tsx). Repart à false à chaque nouvelle
  // partie, comme my_dernier_souffle_used (propre à game_artifact_uses).
  my_parchemin_griot_used: boolean
  my_owns_dernier_souffle: boolean
  my_dernier_souffle_used: boolean
  // Boussole du Village (artefact du Loup Store, effect_key =
  // 'boussole_village', migration 0152) : historique complet des votes de
  // TOUS les jours PASSÉS de cette partie (round_number > 0, jamais le round
  // 0 de l'élection du Capitaine ni le round en cours) — null si le joueur
  // ne possède pas cet artefact. Personnel : jamais montré aux autres.
  vote_history: { round_number: number; voter_id: string; target_id: string }[] | null
  // Feu Sacré des Ancêtres (effect_key = 'feu_sacre_ancetres', migration
  // 0152) : vrai uniquement pour le joueur protégé, uniquement le jour où la
  // protection a joué (voir vote_recap.protected_by_feu_sacre pour
  // l'annonce publique anonyme, symétrique à witch_saved_me).
  feu_sacre_saved_me: boolean
  // Pierre des Ancêtres / Larme de Renaissance (migration 0172) : nom de
  // l'artefact dont l'usage est proposé, uniquement quand pending_action_required
  // === 'revival_choice' (donc que c'est bien MOI qui dois répondre) —
  // jamais montré à qui que ce soit d'autre.
  my_revival_artifact_name_fr: string | null
  my_revival_artifact_name_en: string | null
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
  | 'anancy_solo_win'
  | 'gml_second_kill'
  | 'wolf_team_win'
  | 'daron_save'

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
