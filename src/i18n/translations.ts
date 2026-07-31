// Dictionnaire de traduction fr/en, chargé entièrement côté client (pas de
// fichiers séparés par langue à charger en asynchrone : l'appli est petite,
// mieux vaut un seul module simple qu'une couche async supplémentaire).
//
// Couverture : toute l'application, salon d'attente et déroulement de partie
// compris (voir LanguageContext.tsx pour le sélecteur de langue). Les noms et
// descriptions de rôles vivent ici aussi (namespace `role.*`, voir lib/roles.ts
// qui n'y stocke plus que des clés de traduction).
export type Lang = 'fr' | 'en'

export const translations = {
  // --- Commun ---------------------------------------------------------------
  'common.loading': { fr: 'Chargement...', en: 'Loading...' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },
  'common.confirm': { fr: 'Confirmer', en: 'Confirm' },
  'common.back': { fr: '← Retour', en: '← Back' },
  'common.close': { fr: 'Fermer', en: 'Close' },
  'common.language': { fr: 'Langue', en: 'Language' },
  'common.playerFallback': { fr: 'Joueur', en: 'Player' },
  'common.online': { fr: 'En ligne', en: 'Online' },
  'common.offline': { fr: 'Hors ligne', en: 'Offline' },

  // --- Citations défilantes (QuoteCarousel.tsx) -------------------------------
  // 10 proverbes africains parmi les plus connus (tradition orale, sans
  // auteur attribué) + 5 conseils maison en rapport avec le jeu. Un seul
  // affiché à la fois, ordre aléatoire, fondu enchaîné. Partagé entre
  // Landing.tsx et Dashboard.tsx.
  'quote.kind.proverb': { fr: 'Citation', en: 'Quote' },
  'quote.kind.tip': { fr: 'Conseil', en: 'Tip' },
  'quote.proverb1': {
    fr: 'Si tu veux marcher vite, marche seul. Si tu veux marcher loin, marche avec les autres.',
    en: 'If you want to go fast, walk alone. If you want to go far, walk together.',
  },
  'quote.proverb2': {
    fr: 'Pour qu’un enfant grandisse, il faut tout un village.',
    en: 'It takes a village to raise a child.',
  },
  'quote.proverb3': {
    fr: 'Même la plus longue nuit finit toujours par voir le jour.',
    en: 'However long the night, the day is sure to come.',
  },
  'quote.proverb4': {
    fr: 'Quand tu ne sais pas où tu vas, n’oublie jamais d’où tu viens.',
    en: "When you don't know where you're going, never forget where you came from.",
  },
  'quote.proverb5': {
    fr: 'Quand un arbre tombe, on l’entend ; quand la forêt pousse, pas un seul bruit.',
    en: 'When a tree falls, everyone hears it; when a forest grows, not a single sound.',
  },
  'quote.proverb6': {
    fr: 'Quand les toiles d’araignée s’unissent, elles peuvent ligoter un lion.',
    en: 'When spiderwebs unite, they can tie up a lion.',
  },
  'quote.proverb7': {
    fr: 'Mieux vaut un ami proche qu’un frère lointain.',
    en: 'A close friend is better than a distant brother.',
  },
  'quote.proverb8': {
    fr: 'Au bout de la patience, il y a le ciel.',
    en: 'At the end of patience, there is heaven.',
  },
  'quote.proverb9': {
    fr: 'C’est la pluie qui tombe goutte à goutte qui remplit la rivière.',
    en: 'It is the rain that falls drop by drop that fills the river.',
  },
  'quote.proverb10': {
    fr: 'Le savoir d’une grand-mère est plus précieux que l’or.',
    en: 'A grandmother’s knowledge is more precious than gold.',
  },
  'quote.tip1': {
    fr: 'Observez plus que vous ne parlez : la vérité se cache souvent dans les silences.',
    en: 'Observe more than you speak: the truth often hides in the silences.',
  },
  'quote.tip2': {
    fr: 'Un vote précipité est un vote regretté — laissez le village s’exprimer avant de trancher.',
    en: 'A hasty vote is a regretted vote — let the village speak before deciding.',
  },
  'quote.tip3': {
    fr: 'Le loup le plus dangereux n’est pas celui qui hurle, mais celui qui se tait.',
    en: 'The most dangerous wolf isn’t the one who howls, but the one who stays quiet.',
  },
  'quote.tip4': {
    fr: 'Faites confiance à vos alliés, mais vérifiez toujours leurs actes.',
    en: 'Trust your allies, but always verify their actions.',
  },
  'quote.tip5': {
    fr: 'La Voyante qui parle trop tôt finit souvent dévorée.',
    en: 'The Seer who speaks too soon often ends up devoured.',
  },

  // --- Page d'accueil (Landing.tsx) -----------------------------------------
  'landing.nav.myAccount': { fr: 'Mon espace', en: 'My account' },
  'landing.nav.login': { fr: 'Connexion', en: 'Log in' },
  'landing.nav.signup': { fr: 'Créer un compte', en: 'Sign up' },
  'landing.badge.upTo20': { fr: 'Jusqu’à 20 joueurs', en: 'Up to 20 players' },
  'landing.hero.title1': { fr: 'Le village dort.', en: 'The village sleeps.' },
  'landing.hero.title2': { fr: 'Les loups veillent.', en: 'The wolves are watching.' },
  'landing.hero.tagline': {
    fr: 'Jouez au Loup Garou d’Afrique entre amis, où que vous soyez. L’application distribue les rôles, gère le jour et la nuit, et fait office de maître du jeu — vous n’avez qu’à discuter et voter.',
    en: 'Play Loup Garou d’Afrique with friends, wherever you are. The app deals out the roles, runs day and night, and acts as game master — all you have to do is talk and vote.',
  },
  'landing.cta.start': { fr: 'Lancer une partie', en: 'Start a game' },
  'landing.cta.joinWithCode': { fr: 'Rejoindre avec un code', en: 'Join with a code' },
  'landing.feature.roles.title': { fr: 'Rôles automatiques', en: 'Automatic roles' },
  'landing.feature.roles.text': {
    fr: 'Chaque partie répartit les rôles aléatoirement selon le nombre de joueurs.',
    en: 'Each game deals out roles at random based on the number of players.',
  },
  'landing.feature.dayNight.title': { fr: 'Jour / nuit géré', en: 'Day / night, handled' },
  'landing.feature.dayNight.text': {
    fr: 'L’appli fait office de meneur de jeu : elle réveille chaque rôle et enchaîne les phases toute seule.',
    en: 'The app acts as game master: it wakes each role in turn and moves through phases on its own.',
  },
  'landing.feature.join.title': { fr: 'Rejoindre en un clic', en: 'Join in one click' },
  'landing.feature.join.text': {
    fr: 'Partagez un code ou un lien, jusqu’à 20 joueurs peuvent rejoindre la partie.',
    en: 'Share a code or a link — up to 20 players can join the game.',
  },
  'landing.footer.privacy': { fr: 'Confidentialité', en: 'Privacy' },
  'landing.footer.terms': { fr: 'CGU', en: 'Terms' },
  'landing.footer.legal': { fr: 'Mentions légales', en: 'Legal notice' },

  // --- Connexion (Login.tsx) -------------------------------------------------
  'login.title': { fr: 'Connexion', en: 'Log in' },
  'login.subtitle': { fr: 'Retrouvez le village.', en: 'Back to the village.' },
  'login.email': { fr: 'Email', en: 'Email' },
  'login.password': { fr: 'Mot de passe', en: 'Password' },
  'login.submit': { fr: 'Se connecter', en: 'Log in' },
  'login.submitting': { fr: 'Connexion...', en: 'Logging in...' },
  'login.error.invalid': { fr: 'Email ou mot de passe incorrect.', en: 'Incorrect email or password.' },
  'login.noAccount': { fr: 'Pas encore de compte ?', en: 'No account yet?' },
  'login.signupLink': { fr: 'S’inscrire', en: 'Sign up' },
  'login.forgotPassword': { fr: 'Mot de passe oublié ?', en: 'Forgot password?' },

  'forgotPassword.title': { fr: 'Mot de passe oublié', en: 'Forgot password' },
  'forgotPassword.subtitle': {
    fr: 'Entrez votre email, on vous envoie un lien pour le réinitialiser.',
    en: "Enter your email, we'll send you a link to reset it.",
  },
  'forgotPassword.submit': { fr: 'Envoyer le lien', en: 'Send link' },
  'forgotPassword.submitting': { fr: 'Envoi...', en: 'Sending...' },
  'forgotPassword.sent': {
    fr: 'Si un compte existe pour {{email}}, un email vient de lui être envoyé avec un lien de réinitialisation.',
    en: 'If an account exists for {{email}}, an email with a reset link was just sent to it.',
  },
  'forgotPassword.spamNote': {
    fr: "Pas reçu l'email ? Vérifiez vos spams, ou réessayez dans une minute.",
    en: "Didn't get the email? Check your spam folder, or try again in a minute.",
  },
  'forgotPassword.rateLimited': {
    fr: 'Vous venez déjà de faire une demande. Réessayez dans une minute.',
    en: 'You already made a request. Try again in a minute.',
  },
  'forgotPassword.backToLogin': { fr: '← Retour à la connexion', en: '← Back to login' },

  'resetPassword.title': { fr: 'Nouveau mot de passe', en: 'New password' },
  'resetPassword.subtitle': {
    fr: 'Choisissez un nouveau mot de passe pour votre compte.',
    en: 'Choose a new password for your account.',
  },
  'resetPassword.new': { fr: 'Nouveau mot de passe', en: 'New password' },
  'resetPassword.confirm': { fr: 'Confirmer le nouveau mot de passe', en: 'Confirm new password' },
  'resetPassword.tooShort': {
    fr: 'Le mot de passe doit contenir au moins 6 caractères.',
    en: 'Password must be at least 6 characters.',
  },
  'resetPassword.mismatch': {
    fr: 'Les mots de passe ne correspondent pas.',
    en: 'Passwords do not match.',
  },
  'resetPassword.updateError': {
    fr: "Impossible de modifier le mot de passe. Redemandez un nouveau lien.",
    en: 'Could not update password. Please request a new link.',
  },
  'resetPassword.submit': { fr: 'Modifier le mot de passe', en: 'Change password' },
  'resetPassword.submitting': { fr: 'Modification...', en: 'Updating...' },
  'resetPassword.successNotice': {
    fr: 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.',
    en: 'Password changed. Log in with your new password.',
  },
  'resetPassword.invalidLink': {
    fr: "Ce lien est invalide ou a expiré. Demandez-en un nouveau.",
    en: 'This link is invalid or has expired. Request a new one.',
  },
  'resetPassword.requestNewLink': { fr: 'Demander un nouveau lien', en: 'Request a new link' },

  // --- Inscription (SignUp.tsx) ----------------------------------------------
  'signup.langLabel': {
    fr: 'Langue préférée — deviendra la langue par défaut de votre compte',
    en: 'Preferred language — will become your account’s default language',
  },
  'signup.title': { fr: 'Créer un compte', en: 'Create an account' },
  'signup.subtitle': { fr: 'Rejoignez le village pour lancer vos parties.', en: 'Join the village to start your games.' },
  'signup.username': { fr: 'Pseudo', en: 'Username' },
  'signup.email': { fr: 'Email', en: 'Email' },
  'signup.password': { fr: 'Mot de passe', en: 'Password' },
  'signup.submit': { fr: 'Créer mon compte', en: 'Create my account' },
  'signup.submitting': { fr: 'Création...', en: 'Creating...' },
  'signup.error.usernameTooShort': {
    fr: 'Choisissez un pseudo d’au moins 2 caractères.',
    en: 'Choose a username of at least 2 characters.',
  },
  'signup.error.passwordTooShort': {
    fr: 'Le mot de passe doit contenir au moins 6 caractères.',
    en: 'Password must be at least 6 characters long.',
  },
  'signup.error.alreadyRegistered': {
    fr: 'Un compte existe déjà avec cet email.',
    en: 'An account already exists with this email.',
  },
  'signup.error.invalidPassword': {
    fr: 'Mot de passe invalide (6 caractères minimum).',
    en: 'Invalid password (6 characters minimum).',
  },
  'signup.terms.prefix': { fr: 'En créant un compte, vous acceptez les', en: 'By creating an account, you agree to the' },
  'signup.terms.cgu': { fr: 'CGU', en: 'Terms of Use' },
  'signup.terms.and': { fr: 'et la', en: 'and the' },
  'signup.terms.privacy': { fr: 'politique de confidentialité', en: 'Privacy Policy' },
  'signup.hasAccount': { fr: 'Déjà un compte ?', en: 'Already have an account?' },
  'signup.loginLink': { fr: 'Se connecter', en: 'Log in' },

  // --- Tableau de bord (Dashboard.tsx) ---------------------------------------
  'dashboard.home': { fr: 'Retour à l’accueil', en: 'Back to home' },
  'dashboard.activeGame': { fr: 'Partie en cours', en: 'Game in progress' },
  'dashboard.resume': { fr: 'Reprendre', en: 'Resume' },
  'dashboard.inviteFrom': { fr: 'vous invite à rejoindre sa partie', en: 'invited you to join their game' },
  'dashboard.inviteDismiss': { fr: 'Ignorer', en: 'Dismiss' },
  'dashboard.inviteJoin': { fr: 'Rejoindre', en: 'Join' },
  'dashboard.inviteJoining': { fr: 'Connexion...', en: 'Joining...' },
  'dashboard.createGame': { fr: 'Créer une partie', en: 'Create a game' },
  'dashboard.joinGame': { fr: 'Rejoindre une partie', en: 'Join a game' },
  'dashboard.testNarrator': { fr: 'Tester le narrateur', en: 'Test the narrator' },

  'dashboard.create.title': { fr: 'Créer une partie', en: 'Create a game' },
  'dashboard.create.private.title': { fr: 'Partie privée', en: 'Private game' },
  'dashboard.create.private.subtitle': {
    fr: 'Accessible uniquement via un code ou une invitation.',
    en: 'Only accessible via a code or an invitation.',
  },
  'dashboard.create.public.title': { fr: 'Partie publique', en: 'Public game' },
  'dashboard.create.public.subtitle': {
    fr: 'Visible en recherche ; vous validez chaque demande.',
    en: 'Visible in search; you approve each request.',
  },
  'dashboard.create.creating': { fr: 'Création...', en: 'Creating...' },

  'dashboard.join.title': { fr: 'Rejoindre une partie', en: 'Join a game' },
  'dashboard.join.searchPublic.title': { fr: 'Rechercher une partie publique', en: 'Search for a public game' },
  'dashboard.join.searchPublic.subtitle': {
    fr: 'Parcourir les parties ouvertes par d’autres joueurs.',
    en: 'Browse games opened by other players.',
  },
  'dashboard.join.enterCode.title': { fr: 'Entrer un code', en: 'Enter a code' },
  'dashboard.join.enterCode.subtitle': {
    fr: 'Pour une partie privée, avec le code partagé par l’hôte.',
    en: 'For a private game, using the code shared by the host.',
  },
  'dashboard.join.codeLabel': { fr: 'Code de la partie', en: 'Game code' },
  'dashboard.join.submit': { fr: 'Rejoindre', en: 'Join' },
  'dashboard.join.submitting': { fr: 'Connexion...', en: 'Joining...' },
  'dashboard.join.error.invalidCode': { fr: 'Entrez un code de partie valide.', en: 'Enter a valid game code.' },

  'dashboard.narrator.title': { fr: 'Test du narrateur', en: 'Narrator test' },
  'dashboard.narrator.testing': {
    fr: 'Lecture d’un extrait de voix en cours... cela peut prendre plusieurs secondes.',
    en: 'Playing a voice sample... this can take a few seconds.',
  },
  'dashboard.narrator.success': { fr: 'La voix a bien été jouée.', en: 'The voice played successfully.' },
  'dashboard.narrator.continue': { fr: 'Continuer', en: 'Continue' },
  'dashboard.narrator.retry': { fr: 'Recommencer', en: 'Try again' },
  'dashboard.narrator.fallbackError': {
    fr: 'Le test du narrateur a échoué.',
    en: 'The narrator test failed.',
  },

  // --- Commun (suite) --------------------------------------------------------
  'common.sending': { fr: 'Envoi...', en: 'Sending...' },
  'common.addFriend': { fr: 'Ajouter en ami', en: 'Add as friend' },
  'common.host': { fr: 'Hôte', en: 'Host' },
  'common.captain': { fr: 'Capitaine', en: 'Captain' },
  'common.backHome': { fr: "Retour à l'accueil", en: 'Back to home' },
  'common.backPlain': { fr: 'Retour', en: 'Back' },
  'common.leave': { fr: 'Quitter', en: 'Leave' },
  'common.gameCodeLabel': { fr: 'Code de la partie', en: 'Game code' },
  'common.hide': { fr: '▲ masquer', en: '▲ hide' },
  'common.show': { fr: '▼ afficher', en: '▼ show' },
  'common.on': { fr: 'activé', en: 'on' },
  'common.off': { fr: 'coupé', en: 'off' },
  'common.abstain': { fr: "S'abstenir", en: 'Abstain' },
  'common.you': { fr: 'vous', en: 'you' },
  'common.save': { fr: 'Enregistrer', en: 'Save' },
  'common.saving': { fr: 'Enregistrement...', en: 'Saving...' },

  // --- Rôles (lib/roles.ts) ---------------------------------------------------
  'role.unknown': { fr: 'Inconnu', en: 'Unknown' },
  'role.team.village': { fr: 'Village', en: 'Village' },
  'role.team.loups': { fr: 'Loups', en: 'Werewolves' },
  'role.villageois.name': { fr: 'Villageois', en: 'Villager' },
  'role.villageois.description': {
    fr: "Vous n'avez pas de pouvoir particulier. Votre seule arme est votre sens de la déduction : observez, discutez et votez pour démasquer les Loups-Garous.",
    en: 'You have no special power. Your only weapon is your sense of deduction: observe, discuss, and vote to unmask the Werewolves.',
  },
  'role.loup_garou.name': { fr: 'Loup-Garou', en: 'Werewolf' },
  'role.loup_garou.description': {
    fr: 'Chaque nuit, vous vous réveillez avec les autres loups pour dévorer un villageois. Le jour, faites profil bas pour ne pas être démasqué.',
    en: "Each night, you wake up with the other wolves to devour a villager. During the day, keep a low profile so you don't get unmasked.",
  },
  'role.loup_garou.nightAction': {
    fr: 'Choisissez avec votre meute la victime de la nuit.',
    en: "Choose the night's victim together with your pack.",
  },
  'role.voyante.name': { fr: 'Voyante', en: 'Seer' },
  'role.voyante.description': {
    fr: "Chaque nuit, vous pouvez sonder l'identité véritable d'un joueur de votre choix.",
    en: 'Each night, you can probe the true identity of a player of your choice.',
  },
  'role.voyante.nightAction': {
    fr: 'Choisissez un joueur dont vous voulez découvrir le rôle.',
    en: "Choose a player whose role you want to discover.",
  },
  'role.sorciere.name': { fr: 'Sorcière', en: 'Witch' },
  'role.sorciere.description': {
    fr: "Vous possédez deux potions à usage unique : une potion de guérison pour sauver la victime des loups, et une potion d'empoisonnement pour éliminer un joueur de votre choix.",
    en: 'You have two single-use potions: a healing potion to save the wolves’ victim, and a poison potion to eliminate a player of your choice.',
  },
  'role.sorciere.nightAction': {
    fr: 'Décidez si vous utilisez vos potions cette nuit.',
    en: 'Decide whether to use your potions tonight.',
  },
  'role.chasseur.name': { fr: 'Chasseur', en: 'Hunter' },
  'role.chasseur.description': {
    fr: 'Si vous êtes éliminé (de nuit ou de jour), vous emportez immédiatement un autre joueur de votre choix avec vous.',
    en: "If you are eliminated (at night or during the day), you immediately take another player of your choice down with you.",
  },
  'role.petite_fille.name': { fr: 'Petite Fille', en: 'Little Girl' },
  'role.petite_fille.description': {
    fr: "Vous n'avez pas d'action à jouer la nuit, mais tant que vous êtes en vie, vous êtes la seule à voir qui écrit quoi dans le chat (anonyme pour tout le monde) du village pendant la nuit.",
    en: "You have no action to take at night, but as long as you're alive, you're the only one who can see who wrote what in the village chat (anonymous to everyone else) during the night.",
  },
  'role.cupidon.name': { fr: 'Cupidon', en: 'Cupid' },
  'role.cupidon.description': {
    fr: 'La première nuit uniquement, vous désignez deux joueurs qui tombent amoureux pour toujours. Si l’un meurt, l’autre meurt de chagrin.',
    en: 'On the first night only, you choose two players who fall in love forever. If one dies, the other dies of grief.',
  },
  'role.cupidon.nightAction': {
    fr: 'Désignez les deux amoureux (uniquement la première nuit).',
    en: 'Choose the two lovers (first night only).',
  },
  'role.ancien.name': { fr: 'Ancien', en: 'Elder' },
  'role.ancien.description': {
    fr: "Vous survivez à la première attaque des Loups-Garous (mais pas à la Sorcière, ni au vote). Si le village vous élimine par erreur, tous les pouvoirs spéciaux du village s'éteignent aussitôt.",
    en: "You survive the Werewolves' first attack (but not the Witch, nor the village vote). If the village eliminates you by mistake, all the village's special powers are extinguished immediately.",
  },
  'role.voleur.name': { fr: 'Voleur', en: 'Thief' },
  'role.voleur.description': {
    fr: "Deux cartes supplémentaires ont été mises de côté (un Loup-Garou et un Villageois). Dès la première nuit, avant tout le monde, vous pouvez échanger votre rôle contre l'une d'elles — ou garder le vôtre.",
    en: 'Two extra cards have been set aside (a Werewolf and a Villager). On the very first night, before anyone else, you may swap your role for one of them — or keep your own.',
  },
  'role.voleur.nightAction': {
    fr: "Gardez votre carte ou échangez-la contre l'une des deux cartes proposées (uniquement la première nuit).",
    en: 'Keep your card or swap it for one of the two offered cards (first night only).',
  },
  'role.capitaine.name': { fr: 'Capitaine', en: 'Captain' },

  // --- Salon d'attente (Lobby.tsx) --------------------------------------------
  'lobby.notFound': {
    fr: "Cette partie n'existe pas ou vous n'y avez pas encore accès.",
    en: "This game doesn't exist, or you don't have access to it yet.",
  },
  'lobby.kickedNotice': { fr: "Vous avez été retiré(e) de ce salon par l'hôte.", en: "You've been removed from this lobby by the host." },
  'lobby.waitingRoom': { fr: "Salon d'attente", en: 'Waiting room' },
  'lobby.gameTitle': { fr: 'Partie {{code}}', en: 'Game {{code}}' },
  'lobby.settingsButton': { fr: '⚙️ Réglages', en: '⚙️ Settings' },
  'lobby.customSettingsTitle': { fr: 'Réglages personnalisés', en: 'Customized settings' },
  'lobby.leaveButton': { fr: '🚪 Quitter', en: '🚪 Leave' },
  'lobby.joinRequestsTitleSingular': { fr: 'Demande pour rejoindre', en: 'Request to join' },
  'lobby.joinRequestsTitlePlural': { fr: 'Demandes pour rejoindre', en: 'Requests to join' },
  'lobby.publicBadge': { fr: '🌍 Partie publique', en: '🌍 Public game' },
  'lobby.privateBadge': { fr: '🔒 Partie privée', en: '🔒 Private game' },
  'lobby.noRequestsYet': { fr: "aucune demande pour l'instant.", en: 'no requests yet.' },
  'lobby.copyInviteLink': { fr: "🔗 Copier le lien d'invitation", en: '🔗 Copy invite link' },
  'lobby.playersTitle': { fr: 'Joueurs ({{count}}/20)', en: 'Players ({{count}}/20)' },
  'lobby.closeInvite': { fr: 'Fermer', en: 'Close' },
  'lobby.inviteFriendsToggle': { fr: '+ Inviter des amis', en: '+ Invite friends' },
  'lobby.invited': { fr: 'Invité ✓', en: 'Invited ✓' },
  'lobby.inviteButton': { fr: 'Inviter', en: 'Invite' },
  'lobby.needMorePlayers': { fr: 'Il faut au moins 4 joueurs', en: 'At least 4 players are needed' },
  'lobby.starting': { fr: 'Lancement...', en: 'Starting...' },
  'lobby.startGame': { fr: '🌙 Lancer la partie', en: '🌙 Start the game' },
  'lobby.waitingForHost': { fr: "En attente que l'hôte lance la partie...", en: 'Waiting for the host to start the game...' },
  'lobby.leaveConfirmTitle': { fr: 'Quitter le salon ?', en: 'Leave the lobby?' },
  'lobby.leaveConfirmMessage': {
    fr: "Vous quitterez ce salon d'attente. Vous pourrez le rejoindre à nouveau avec le code tant que la partie n'a pas commencé.",
    en: "You'll leave this waiting room. You can rejoin it with the code as long as the game hasn't started yet.",
  },
  'lobby.settingsDrawerTitle': { fr: '⚙️ Réglages de la partie', en: '⚙️ Game settings' },
  'lobby.rolesSummary': {
    fr: '{{special}} rôles spéciaux pour {{players}} joueurs',
    en: '{{special}} special roles for {{players}} players',
  },
  'lobby.villagersSuffix': { fr: ' — {{count}} villageois.', en: ' — {{count}} villagers.' },
  'lobby.rolesOverflow': {
    fr: 'Trop de rôles spéciaux pour le nombre de joueurs actuel.',
    en: 'Too many special roles for the current number of players.',
  },
  'lobby.captainToggleHint': {
    fr: 'Élu par le village juste avant la première nuit (garde son vrai rôle) — vote compte double, et tranche les égalités. Ne prend pas de place de rôle spécial.',
    en: "Elected by the village just before the first night (keeps their real role) — their vote counts double and breaks ties. Doesn't take up a special role slot.",
  },
  'lobby.durationsTitle': { fr: '⏱️ Durées des phases', en: '⏱️ Phase durations' },
  'lobby.duration.roleReveal': { fr: '🎭 Distribution des rôles', en: '🎭 Role distribution' },
  'lobby.duration.discussion': { fr: '💬 Débat', en: '💬 Discussion' },
  'lobby.duration.vote': { fr: '🗳️ Vote', en: '🗳️ Vote' },
  'lobby.duration.voteRecap': { fr: '📋 Récap du vote', en: '📋 Vote recap' },
  'lobby.duration.nightSteps': { fr: '🌙 Étapes de nuit', en: '🌙 Night steps' },
  'lobby.duration.wolfChat': { fr: '🐺 Discussion des loups', en: '🐺 Wolf discussion' },
  'lobby.joinRequestNotifTitle': { fr: '🔔 Nouvelle demande', en: '🔔 New request' },
  'lobby.joinRequestNotifBody': {
    fr: 'Un joueur souhaite rejoindre votre partie publique.',
    en: 'A player wants to join your public game.',
  },

  // --- Chat vocal (VoiceChat.tsx, useVoiceChat.ts) ---------------------------
  'voiceChat.connecting': { fr: 'Connexion au vocal...', en: 'Connecting to voice...' },
  'voiceChat.connected': { fr: 'Vocal connecté', en: 'Voice connected' },
  'voiceChat.unavailable': { fr: 'Vocal indisponible', en: 'Voice unavailable' },
  'voiceChat.alone': { fr: 'Vous êtes seul(e) pour le moment.', en: "You're alone for now." },
  'voiceChat.othersOnline': { fr: '{{count}} autre{{s}} en ligne', en: '{{count}} other{{s}} online' },
  'voiceChat.retry': { fr: '🔄 Réessayer', en: '🔄 Retry' },
  'voiceChat.muted': { fr: '🔇 Muet', en: '🔇 Muted' },
  'voiceChat.active': { fr: '🎤 Actif', en: '🎤 Active' },
  'voiceChat.muteParticipantTitle': { fr: 'Couper le micro de {{name}}', en: "Mute {{name}}'s microphone" },
  'voiceChat.errorGeneric': { fr: 'Erreur vocale', en: 'Voice error' },
  'voiceChat.errorConnection': { fr: 'Erreur de connexion vocale', en: 'Voice connection error' },

  // --- Notifications de tour (useTurnNotifications.ts) -----------------------
  'turnNotif.title': { fr: '🌕 Loups-Garous', en: '🌕 Werewolves' },
  'turnNotif.default': { fr: "C'est à vous de jouer.", en: "It's your turn to play." },
  'turnNotif.cupidon': { fr: '💘 Cupidon, désignez les deux amoureux.', en: '💘 Cupid, choose the two lovers.' },
  'turnNotif.voyante': { fr: '🔮 Voyante, sondez un joueur.', en: '🔮 Seer, take a look at a player.' },
  'turnNotif.loup_garou': {
    fr: '🐺 Loups-Garous, choisissez votre victime.',
    en: '🐺 Werewolves, choose your victim.',
  },
  'turnNotif.sorciere': { fr: '🧪 Sorcière, vos potions vous attendent.', en: '🧪 Witch, your potions await.' },
  'turnNotif.vote': { fr: '🗳️ Le vote est ouvert, à vous de voter.', en: '🗳️ Voting is open, cast your vote.' },
  'turnNotif.hunter': { fr: '🏹 Chasseur, tirez votre dernière flèche.', en: '🏹 Hunter, fire your last arrow.' },

  // --- Modération (ModerationPanel.tsx) --------------------------------------
  'moderation.title': { fr: '🛡️ Modération', en: '🛡️ Moderation' },
  'moderation.blockedWordsTitle': { fr: '🚫 Mots bloqués dans le chat', en: '🚫 Blocked words in chat' },
  'moderation.noBlockedWords': { fr: 'Aucun mot bloqué.', en: 'No blocked words.' },
  'moderation.removeWordTitle': { fr: 'Retirer ce mot', en: 'Remove this word' },
  'moderation.addWordPlaceholder': { fr: 'Ajouter un mot...', en: 'Add a word...' },
  'moderation.addWordButton': { fr: 'Ajouter', en: 'Add' },
  'moderation.removePlayerTitle': { fr: '👤 Retirer un joueur', en: '👤 Remove a player' },
  'moderation.noOtherPlayers': { fr: 'Aucun autre joueur.', en: 'No other players.' },
  'moderation.ghostTag': { fr: '(fantôme)', en: '(ghost)' },
  'moderation.removeButton': { fr: 'Retirer', en: 'Remove' },
  'moderation.removing': { fr: 'Retrait...', en: 'Removing...' },
  'moderation.kickConfirmTitle': { fr: 'Retirer ce joueur ?', en: 'Remove this player?' },
  'moderation.kickMessageLobby': {
    fr: '{{name}} sera retiré du salon. Cette action est irréversible.',
    en: '{{name}} will be removed from the lobby. This action is irreversible.',
  },
  'moderation.kickMessageGame': {
    fr: '{{name}} sera retiré de la partie (éliminé, et privé du chat pour le reste de la partie). Cette action est irréversible.',
    en: '{{name}} will be removed from the game (eliminated, and blocked from chat for the rest of the game). This action is irreversible.',
  },

  // --- Onglets partagés (Segmented) -------------------------------------------
  'tabs.discuss': { fr: '💬 Discuter', en: '💬 Discuss' },
  'tabs.village': { fr: '👥 Village', en: '👥 Village' },
  'tabs.graveyard': { fr: '👻 Cimetière', en: '👻 Graveyard' },
  'tabs.wolves': { fr: '🐺 Loups', en: '🐺 Wolves' },

  // --- Déroulement de partie (GameRoom.tsx) -----------------------------------
  'game.notFound': { fr: "Cette partie n'existe pas ou vous n'y avez pas accès.", en: "This game doesn't exist or you don't have access to it." },
  'game.kickedNotice': { fr: "Vous avez été retiré(e) de cette partie par l'hôte.", en: "You've been removed from this game by the host." },
  'game.excludedMessage': { fr: "Vous avez été exclu(e) de cette partie par l'hôte.", en: "You've been excluded from this game by the host." },
  'game.eliminatedNoticeWithRole': {
    fr: '👻 Vous avez été éliminé — vous étiez {{role}}. Vous pouvez suivre le chat du village en direct (sans y participer), et discuter librement avec les autres joueurs éliminés au cimetière.',
    en: "👻 You've been eliminated — you were {{role}}. You can follow the village chat live (without taking part), and chat freely with other eliminated players in the graveyard.",
  },
  'game.eliminatedNoticeNoRole': {
    fr: '👻 Vous avez été éliminé. Vous pouvez suivre le chat du village en direct (sans y participer), et discuter librement avec les autres joueurs éliminés au cimetière.',
    en: "👻 You've been eliminated. You can follow the village chat live (without taking part), and chat freely with other eliminated players in the graveyard.",
  },
  'game.yourRole': { fr: 'Votre rôle', en: 'Your role' },
  'game.readyHint': {
    fr: 'Mémorisez bien votre rôle. Dès que tout le monde est prêt, la partie démarre immédiatement.',
    en: 'Make sure you remember your role. As soon as everyone is ready, the game starts immediately.',
  },
  'game.readyDone': { fr: 'Vous êtes prêt(e)', en: "You're ready" },
  'game.readyButton': { fr: 'Je suis prêt(e)', en: "I'm ready" },
  'game.seerVisionTitle': { fr: 'Vision de cette nuit', en: "Tonight's vision" },
  'game.seerVisionResult': { fr: '{{target}} est {{role}}.', en: '{{target}} is {{role}}.' },
  'game.logEmpty': { fr: 'Rien à signaler pour le moment.', en: 'Nothing to report yet.' },
  'game.callVoteTitle': { fr: '🗳️ Passer au vote ({{agreed}}/{{total}} d’accord)', en: '🗳️ Move to vote ({{agreed}}/{{total}} agreed)' },
  'game.cancelAgreement': { fr: '↩️ Annuler mon accord', en: '↩️ Cancel my agreement' },
  'game.agree': { fr: "✅ Je suis d'accord", en: '✅ I agree' },
  'game.callVoteButton': { fr: '🎖️ Lancer le vote', en: '🎖️ Start the vote' },
  'game.callVoteButtonWaiting': { fr: '🎖️ Lancer le vote (en attente)', en: '🎖️ Start the vote (waiting)' },
  'game.voteInProgress': { fr: 'Vote en cours parmi les autres joueurs...', en: 'Voting in progress among the other players...' },
  'game.waitingOthers': { fr: 'En attente des autres joueurs...', en: 'Waiting for the other players...' },
  'game.waitingEliminatedWithRole': {
    fr: '👻 Vous avez été éliminé. Vous pouvez observer la suite de la partie — vous étiez {{role}}.',
    en: "👻 You've been eliminated. You can watch the rest of the game — you were {{role}}.",
  },
  'game.waitingEliminatedNoRole': {
    fr: '👻 Vous avez été éliminé. Vous pouvez observer la suite de la partie.',
    en: "👻 You've been eliminated. You can watch the rest of the game.",
  },
  'game.dayRevealTitle': { fr: "☀️ Ce qui s'est passé cette nuit", en: '☀️ What happened last night' },
  'game.discussionHint': {
    fr: "💬 Discutez pour démasquer les Loups-Garous — le vote ouvre automatiquement dans la limite de temps, ou plus tôt si le Capitaine le lance avec l'accord de tout le village.",
    en: "💬 Discuss to unmask the Werewolves — the vote opens automatically once time runs out, or sooner if the Captain calls it with the whole village's agreement.",
  },
  'game.logTitle': { fr: '📜 Journal de la partie', en: '📜 Game log' },
  'game.homeLinkTitle': {
    fr: 'Retour à l’accueil (la partie continue sans vous quitter)',
    en: 'Back to home (the game keeps running without you leaving)',
  },
  'game.menuTitle': { fr: 'Réglages de la partie', en: 'Game settings' },
  'game.leaveGameMenuItem': { fr: '🚪 Quitter la partie', en: '🚪 Leave the game' },
  'game.nightChatNote': {
    fr: '🎭 Chat anonyme le temps de la nuit — personne ne sait qui écrit quoi (sauf la Petite Fille, si elle est en vie).',
    en: "🎭 Anonymous chat for the night — no one knows who wrote what (except the Little Girl, if she's alive).",
  },
  'game.leaveConfirmTitle': { fr: 'Quitter la partie ?', en: 'Leave the game?' },
  'game.leaveConfirmMessageEnded': { fr: 'Vous allez retourner à l’accueil.', en: "You'll go back to the home screen." },
  'game.leaveConfirmMessageActive': {
    fr: 'Votre personnage sera éliminé et la partie continuera sans vous. Cette action est irréversible.',
    en: 'Your character will be eliminated and the game will continue without you. This action is irreversible.',
  },
  'game.endVillageWins': { fr: '🌞 Le Village triomphe !', en: '🌞 The Village triumphs!' },
  'game.endWolvesWin': { fr: '🐺 Les Loups-Garous ont gagné !', en: '🐺 The Werewolves have won!' },
  'game.endLoversWin': { fr: '💘 Les Amoureux ont gagné !', en: '💘 The Lovers have won!' },
  'game.playAgain': { fr: '🔄 Rejouer avec ce groupe', en: '🔄 Play again with this group' },
  'game.leaveLobbyButton': { fr: '🚪 Quitter le salon', en: '🚪 Leave the lobby' },
  'game.waitHostRestart': {
    fr: "Vous pouvez aussi attendre que l'hôte relance une partie avec le même groupe.",
    en: 'You can also wait for the host to start a new game with the same group.',
  },
  'game.copyCode': { fr: '📋 Copier le code', en: '📋 Copy code' },
  'game.playersPresentForNext': { fr: '👥 Joueurs présents pour la suite ({{count}})', en: '👥 Players present for next round ({{count}})' },
  'game.othersCanStillJoin': {
    fr: "D'autres joueurs peuvent encore rejoindre en donnant ce code avant que l'hôte ne relance.",
    en: 'Other players can still join with this code before the host restarts.',
  },
  'nightStep.voleur': { fr: 'Le Voleur choisit sa carte...', en: 'The Thief is choosing their card...' },
  'nightStep.cupidon': { fr: 'Cupidon décoche ses flèches...', en: 'Cupid is shooting their arrows...' },
  'nightStep.voyante': { fr: 'La Voyante consulte son destin...', en: 'The Seer is consulting fate...' },
  'nightStep.loup_garou': { fr: 'Les Loups-Garous choisissent leur victime...', en: 'The Werewolves are choosing their victim...' },
  'nightStep.sorciere': { fr: 'La Sorcière prépare ses potions...', en: 'The Witch is preparing her potions...' },
  'nightStep.resolve': { fr: 'Le sort en est jeté...', en: 'The die is cast...' },
  'phase.lobby': { fr: 'Salon', en: 'Lobby' },
  'phase.role_reveal': { fr: 'Distribution des rôles', en: 'Role distribution' },
  'phase.captain_election': { fr: 'Élection du Capitaine', en: 'Captain election' },
  'phase.night': { fr: 'Nuit', en: 'Night' },
  'phase.day_reveal': { fr: 'Réveil du village', en: 'Village wakes up' },
  'phase.day_discussion': { fr: 'Débat', en: 'Discussion' },
  'phase.day_vote': { fr: 'Vote', en: 'Vote' },
  'phase.day_vote_recap': { fr: 'Résultat du vote', en: 'Vote result' },
  'phase.ended': { fr: 'Partie terminée', en: 'Game over' },
  'menu.narrator': { fr: 'Narrateur', en: 'Narrator' },
  'menu.sfx': { fr: 'Effets sonores', en: 'Sound effects' },
  'menu.notifications': { fr: 'Notifs "à vous de jouer"', en: '"Your turn" notifications' },

  // --- Panneaux d'action (ActionPanel.tsx) -------------------------------------
  'action.voleur.title': { fr: 'Deux cartes ont été mises de côté', en: 'Two cards have been set aside' },
  'action.voleur.subtitle': {
    fr: "Gardez votre rôle actuel, ou échangez-le contre l'une d'elles.",
    en: 'Keep your current role, or swap it for one of them.',
  },
  'action.voleur.keepCard': { fr: 'Garder ma carte', en: 'Keep my card' },
  'action.cupidon.title': { fr: 'Désignez les deux amoureux', en: 'Choose the two lovers' },
  'action.cupidon.subtitle': { fr: "Cette action n'a lieu que la première nuit.", en: 'This action only happens on the first night.' },
  'action.cupidon.confirm': { fr: 'Confirmer le couple', en: 'Confirm the couple' },
  'action.voyante.title': { fr: "Sondez l'identité d'un joueur", en: "Probe a player's identity" },
  'action.voyante.pastVisions': { fr: 'Vos visions passées', en: 'Your past visions' },
  'action.voyante.confirm': { fr: 'Sonder ce joueur', en: 'Probe this player' },
  'action.wolf.title': { fr: 'Choisissez votre victime', en: 'Choose your victim' },
  'action.wolf.subtitle': { fr: 'Concertez-vous avec votre meute.', en: 'Coordinate with your pack.' },
  'action.wolf.abstainTally': { fr: 'Abstention ({{n}})', en: 'Abstained ({{n}})' },
  'action.wolf.sendingVote': { fr: 'Envoi du vote...', en: 'Sending vote...' },
  'action.wolf.abstained': { fr: 'Vous vous êtes abstenu(e)', en: "You've abstained" },
  'action.wolf.abstainButton': { fr: "S'abstenir cette nuit", en: 'Abstain tonight' },
  'action.wolf.abstainConfirmTitle': { fr: "S'abstenir cette nuit ?", en: 'Abstain tonight?' },
  'action.wolf.abstainConfirmMessage': {
    fr: "Vous ne désignerez personne. Votre vote ne comptera pas dans le choix de la meute — si tous les Loups-Garous encore en vie s'abstiennent aussi (ou si les voix sont partagées à égalité), personne ne sera dévoré cette nuit. Vous pourrez encore choisir un joueur ensuite, tant que la meute n'a pas fini son tour.",
    en: "You won't designate anyone. Your vote won't count towards the pack's choice — if every Werewolf still alive also abstains (or if the votes are tied), no one will be devoured tonight. You can still pick a player afterwards, as long as the pack hasn't finished its turn.",
  },
  'action.wolf.abstainConfirmLabel': { fr: "Confirmer l'abstention", en: 'Confirm abstention' },
  'action.witch.title': { fr: 'Vos potions', en: 'Your potions' },
  'action.witch.victimKnown': {
    fr: 'Cette nuit, les loups s’apprêtent à dévorer {{name}}.',
    en: 'Tonight, the wolves are about to devour {{name}}.',
  },
  'action.witch.victimUnknown': { fr: "Les loups n'ont pas encore désigné de victime.", en: "The wolves haven't chosen a victim yet." },
  'action.witch.healPotion': { fr: 'Potion de vie', en: 'Life potion' },
  'action.witch.healUsed': { fr: 'Déjà utilisée', en: 'Already used' },
  'action.witch.healNoVictim': { fr: 'Personne à sauver', en: 'No one to save' },
  'action.witch.healSelected': { fr: 'Sélectionnée ✓', en: 'Selected ✓' },
  'action.witch.healAction': { fr: 'Sauver la victime', en: 'Save the victim' },
  'action.witch.poisonPotion': { fr: 'Potion de mort', en: 'Death potion' },
  'action.witch.poisonUsed': { fr: 'Déjà utilisée', en: 'Already used' },
  'action.witch.poisonAction': { fr: 'Empoisonner qui ?', en: 'Poison whom?' },
  'action.witch.choosePoisonTarget': { fr: 'Choisissez qui empoisonner :', en: 'Choose who to poison:' },
  'action.witch.validateTurn': { fr: '🧪 Valider mon tour', en: '🧪 Confirm my turn' },
  'action.witch.doNothing': { fr: 'Ne rien faire cette nuit', en: 'Do nothing tonight' },
  'action.witch.confirmTitle': { fr: 'Confirmer votre tour de Sorcière', en: 'Confirm your Witch turn' },
  'action.witch.confirmSave': { fr: "sauver {{name}} de l'attaque des loups", en: "save {{name}} from the wolves' attack" },
  'action.witch.confirmPoison': {
    fr: 'empoisonner {{name}} (il ou elle mourra cette nuit)',
    en: 'poison {{name}} (they will die tonight)',
  },
  'action.witch.confirmJoin': { fr: ' et ', en: ' and ' },
  'action.witch.confirmPrefix': { fr: 'Vous allez {{parts}}. Une fois confirmé, ce choix est définitif pour cette nuit, et chaque potion utilisée ne pourra plus resservir plus tard dans la partie.', en: 'You are about to {{parts}}. Once confirmed, this choice is final for tonight, and each potion used cannot be used again later in the game.' },
  'action.witch.confirmNone': {
    fr: "Vous n'utiliserez aucune potion cette nuit — vos potions encore disponibles resteront utilisables une prochaine nuit. Une fois confirmé, vous ne pourrez plus revenir en arrière pour cette nuit.",
    en: "You won't use any potion tonight — your remaining potions will still be usable on a future night. Once confirmed, you won't be able to go back for tonight.",
  },
  'action.vote.title': { fr: 'Votez pour éliminer un suspect', en: 'Vote to eliminate a suspect' },
  'action.captainVote.title': { fr: 'Élisez votre Capitaine', en: 'Elect your Captain' },
  'action.captainVote.subtitle': {
    fr: 'Son vote comptera double, et tranchera les égalités.',
    en: 'Their vote will count double, and will break ties.',
  },
  'action.captainSuccession.title': { fr: 'Désignez le nouveau Capitaine', en: 'Choose the new Captain' },
  'action.captainSuccession.subtitle': {
    fr: 'Vous étiez le Capitaine — dans votre dernier souffle, désignez votre successeur.',
    en: 'You were the Captain — with your dying breath, choose your successor.',
  },
  'action.hunter.title': { fr: 'Votre dernière flèche', en: 'Your last arrow' },
  'action.hunter.subtitle': {
    fr: 'Vous êtes éliminé, mais vous emportez quelqu’un avec vous.',
    en: "You're eliminated, but you're taking someone down with you.",
  },
  'action.hunter.noShot': { fr: 'Ne tirer sur personne', en: 'Shoot no one' },

  // --- Chat (ChatPanel.tsx) ---------------------------------------------------
  'chat.village.title': { fr: 'Chat du village', en: 'Village chat' },
  'chat.village.placeholder': { fr: 'Écrire au village...', en: 'Write to the village...' },
  'chat.wolves.title': { fr: 'Chat des loups', en: 'Wolves chat' },
  'chat.wolves.placeholder': { fr: 'Écrire à la meute...', en: 'Write to the pack...' },
  'chat.graveyard.title': { fr: 'Cimetière', en: 'Graveyard' },
  'chat.graveyard.placeholder': { fr: 'Écrire aux fantômes...', en: 'Write to the ghosts...' },
  'chat.readOnly': { fr: '👁️ lecture seule', en: '👁️ read-only' },
  'chat.live': { fr: 'en direct', en: 'live' },
  'chat.empty': { fr: 'Aucun message pour le moment...', en: 'No messages yet...' },
  'chat.anonymous': { fr: '🎭 Anonyme', en: '🎭 Anonymous' },

  // --- Récap du vote (VoteRecapModal.tsx) --------------------------------------
  'voteRecap.title': { fr: '🗳️ Résultat du vote', en: '🗳️ Vote result' },
  'voteRecap.eliminatedWithRole': {
    fr: '🪦 {{name}} a été éliminé — c’était {{role}}.',
    en: '🪦 {{name}} was eliminated — they were {{role}}.',
  },
  'voteRecap.eliminatedNoRole': { fr: '🪦 {{name}} a été éliminé.', en: '🪦 {{name}} was eliminated.' },
  'voteRecap.noVotes': {
    fr: "🤷 Aucun vote exprimé : personne n'est éliminé aujourd'hui.",
    en: '🤷 No votes cast: no one is eliminated today.',
  },
  'voteRecap.tie': {
    fr: "🤝 Égalité des voix : personne n'est éliminé aujourd'hui.",
    en: '🤝 Tied vote: no one is eliminated today.',
  },
  'voteRecap.votesCount': { fr: '{{n}} voix', en: '{{n}} votes' },
  'voteRecap.didNotVote': { fr: "N'ont pas voté : {{names}}", en: 'Did not vote: {{names}}' },
  'voteRecap.waitingOthers': { fr: '✅ En attente des autres ({{ready}}/{{total}})', en: '✅ Waiting for others ({{ready}}/{{total}})' },
  'voteRecap.continue': { fr: 'Continuer', en: 'Continue' },
  'voteRecap.ghostAutoNote': { fr: '👻 La suite démarre automatiquement.', en: '👻 The game continues automatically.' },

  // --- Règles du jeu (RulesPanel.tsx) -----------------------------------------
  'rules.title': { fr: '📖 Règles du jeu', en: '📖 Game rules' },
  'rules.objective.title': { fr: '🎯 Objectif', en: '🎯 Objective' },
  'rules.objective.text': {
    fr: "Le Village doit démasquer et éliminer tous les Loups-Garous par le vote. Les Loups-Garous doivent dévorer les villageois nuit après nuit, jusqu'à être aussi nombreux — voire plus nombreux — qu'eux.",
    en: 'The Village must unmask and eliminate all the Werewolves through voting. The Werewolves must devour the villagers night after night, until they are as numerous — or more numerous — than them.',
  },
  'rules.flow.title': { fr: '🌗 Déroulement', en: '🌗 How it flows' },
  'rules.flow.text': {
    fr: "Chaque partie alterne nuit et jour. Au tout début, chacun a 60 secondes pour mémoriser son rôle et peut se déclarer \"prêt\" — dès que tout le monde l'a fait, la partie démarre sans attendre la fin du délai. La nuit, le village dort pendant que les rôles spéciaux agissent chacun leur tour en secret (Cupidon la première nuit seulement, puis Voyante, Loups-Garous, Sorcière et Petite Fille). Le jour, le village découvre ce qui s'est passé, débat à l'oral ou par écrit, puis vote pour éliminer un suspect. Un récap du vote (qui a voté pour qui, et le résultat) s'affiche ensuite pendant 90 secondes — ou moins si tous les joueurs encore en vie cliquent sur \"Continuer\". L'application fait office de meneur de jeu et enchaîne les phases automatiquement.",
    en: 'Each game alternates night and day. At the very start, everyone has 60 seconds to memorize their role and can declare themselves "ready" — as soon as everyone has, the game starts without waiting out the timer. At night, the village sleeps while special roles act in secret, each in turn (Cupid on the first night only, then the Seer, the Werewolves, the Witch, and the Little Girl). During the day, the village discovers what happened, discusses out loud or in writing, then votes to eliminate a suspect. A vote recap (who voted for whom, and the result) is then shown for 90 seconds — or less if every player still alive clicks "Continue". The app acts as game master and moves through phases automatically.',
  },
  'rules.nightChat.title': { fr: '💬 Chat de la nuit', en: '💬 Night chat' },
  'rules.nightChat.text': {
    fr: "Pour que personne ne s'ennuie en attendant son tour, le chat du village reste ouvert toute la nuit — mais les messages y sont anonymes : impossible de savoir qui a écrit quoi (sauf la Petite Fille, tant qu'elle est en vie). Les Loups-Garous ont en plus, pendant leur tour, un onglet privé et nominatif rien qu'à eux pour se concerter et choisir leur victime.",
    en: "So no one gets bored while waiting for their turn, the village chat stays open all night — but messages are anonymous: there's no way to know who wrote what (except the Little Girl, as long as she's alive). During their turn, the Werewolves also get a private, named tab all to themselves to coordinate and choose their victim.",
  },
  'rules.roles.title': { fr: '🎭 Les rôles', en: '🎭 The roles' },
  'rules.captain.title': { fr: '🎖️ Le Capitaine (optionnel)', en: '🎖️ The Captain (optional)' },
  'rules.captain.text': {
    fr: "Contrairement aux autres rôles, le Capitaine n'est pas un rôle secret : c'est un titre public, confié en plus du rôle tiré au sort (il garde son vrai rôle, loup-garou y compris). Il est élu par le village à la majorité relative juste avant la première nuit. Son vote compte ensuite pour deux voix lors du vote du village, et en cas d'égalité, c'est son choix qui désigne la victime. À sa mort, il désigne son successeur parmi les joueurs encore en vie, dans son dernier souffle. Pendant le débat, il est aussi le seul à pouvoir lancer le vote avant la fin du temps imparti (5 minutes par défaut) — mais seulement si tous les joueurs encore en vie se sont déclarés d'accord.",
    en: "Unlike the other roles, the Captain isn't a secret role: it's a public title, granted on top of the role drawn at random (they keep their real role, werewolf included). They're elected by the village by relative majority just before the first night. Their vote then counts for two votes during the village vote, and in case of a tie, their choice designates the victim. Upon their death, they name their successor among the players still alive, with their dying breath. During the discussion, they're also the only one who can call the vote before time runs out (5 minutes by default) — but only if every player still alive has agreed to it.",
  },
  'rules.victory.title': { fr: '🏆 Victoire', en: '🏆 Victory' },
  'rules.victory.text': {
    fr: 'Le Village gagne dès que tous les Loups-Garous sont éliminés. Les Loups-Garous gagnent s\'ils parviennent à égaler ou dépasser le nombre de villageois survivants. Cas particulier : si Cupidon a désigné deux Amoureux, ceux-ci gagnent ensemble s\'ils sont les deux derniers survivants, quel que soit leur camp d\'origine.',
    en: 'The Village wins as soon as all the Werewolves are eliminated. The Werewolves win if they manage to equal or outnumber the surviving villagers. Special case: if Cupid designated two Lovers, they win together if they are the last two survivors, regardless of their original side.',
  },

  // --- Compte (Account.tsx) ---------------------------------------------------
  'account.title': { fr: 'Mon compte', en: 'My account' },
  'account.profile.title': { fr: 'Profil', en: 'Profile' },
  'account.profile.subtitle': {
    fr: 'Votre pseudo et votre icône sont visibles par les autres joueurs à chaque partie.',
    en: 'Your username and icon are visible to other players in every game.',
  },
  'account.profile.username': { fr: 'Pseudo', en: 'Username' },
  'account.profile.avatarIcon': { fr: 'Icône d’avatar', en: 'Avatar icon' },
  'account.profile.chooseIcon': { fr: "Choisir l'icône {{icon}}", en: 'Choose icon {{icon}}' },
  'account.profile.usernameTooShort': { fr: 'Choisissez un pseudo d’au moins 2 caractères.', en: 'Choose a username of at least 2 characters.' },
  'account.profile.updated': { fr: 'Profil mis à jour.', en: 'Profile updated.' },
  'account.profile.editButton': { fr: 'Modifier mon profil', en: 'Edit my profile' },
  'account.profile.confirmChangeTitle': { fr: 'Changer de pseudo ?', en: 'Change username?' },
  'account.profile.confirmChangeMessage': {
    fr: 'Une fois validé, vous ne pourrez plus changer de pseudo avant 7 jours. Voulez-vous continuer ?',
    en: 'Once confirmed, you won\'t be able to change your username again for 7 days. Do you want to continue?',
  },
  'account.profile.usernameLockedUntil': {
    fr: 'Vous pourrez à nouveau changer de pseudo le {{date}}.',
    en: 'You can change your username again on {{date}}.',
  },
  'account.email.title': { fr: 'Email', en: 'Email' },
  'account.email.locked': { fr: '🔒 Non modifiable', en: '🔒 Not editable' },
  'account.language.title': { fr: 'Langue', en: 'Language' },
  'account.language.subtitle': {
    fr: 'Choisissez la langue de l’application. Elle devient la langue par défaut de votre compte.',
    en: 'Choose the app’s language. It becomes your account’s default language.',
  },
  'account.password.title': { fr: 'Mot de passe', en: 'Password' },
  'account.password.changeButton': { fr: 'Changer mon mot de passe', en: 'Change my password' },
  'account.password.subtitle': { fr: 'Changez votre mot de passe de connexion.', en: 'Change your login password.' },
  'account.password.current': { fr: 'Mot de passe actuel', en: 'Current password' },
  'account.password.new': { fr: 'Nouveau mot de passe', en: 'New password' },
  'account.password.confirm': { fr: 'Confirmer le nouveau mot de passe', en: 'Confirm new password' },
  'account.password.tooShort': {
    fr: 'Le nouveau mot de passe doit contenir au moins 6 caractères.',
    en: 'The new password must be at least 6 characters long.',
  },
  'account.password.mismatch': {
    fr: 'La confirmation ne correspond pas au nouveau mot de passe.',
    en: "The confirmation doesn't match the new password.",
  },
  'account.password.wrongCurrent': { fr: 'Mot de passe actuel incorrect.', en: 'Incorrect current password.' },
  'account.password.invalid': { fr: 'Mot de passe invalide (6 caractères minimum).', en: 'Invalid password (6 characters minimum).' },
  'account.password.updated': { fr: 'Mot de passe modifié.', en: 'Password changed.' },
  'account.password.submitting': { fr: 'Modification...', en: 'Updating...' },
  'account.password.submit': { fr: 'Modifier le mot de passe', en: 'Change password' },
  'account.danger.title': { fr: 'Zone dangereuse', en: 'Danger zone' },
  'account.danger.subtitle': {
    fr: 'Vous pouvez demander la fermeture définitive de votre compte et la suppression des données associées.',
    en: 'You can request the permanent closure of your account and the deletion of associated data.',
  },
  'account.danger.requestedOn': {
    fr: "🕓 Demande de fermeture envoyée le {{date}}. Elle sera traitée par l'éditeur dans un délai raisonnable ; votre compte reste utilisable en attendant.",
    en: "🕓 Closure request sent on {{date}}. It will be processed by the publisher within a reasonable time; your account remains usable in the meantime.",
  },
  'account.danger.requestButton': { fr: 'Demander la fermeture de mon compte', en: 'Request account closure' },
  'account.danger.confirmTitle': { fr: 'Fermer votre compte ?', en: 'Close your account?' },
  'account.danger.confirmMessage': {
    fr: "Cette demande sera transmise à l'éditeur, qui procédera à la suppression définitive de votre compte et des données associées. Vous pouvez continuer à jouer en attendant que la demande soit traitée.",
    en: 'This request will be sent to the publisher, who will permanently delete your account and associated data. You can keep playing while the request is being processed.',
  },
  'account.danger.confirmLabel': { fr: 'Confirmer la demande', en: 'Confirm the request' },

  // --- Amis (Friends.tsx) -----------------------------------------------------
  'friends.title': { fr: 'Amis', en: 'Friends' },
  'friends.code.title': { fr: 'Votre code ami', en: 'Your friend code' },
  'friends.code.subtitle': {
    fr: "Partagez-le pour qu'on puisse vous ajouter — votre pseudo seul ne suffit pas, il n'est pas unique.",
    en: "Share it so others can add you — your username alone isn't enough, it isn't unique.",
  },
  'friends.code.copy': { fr: 'Copier', en: 'Copy' },
  'friends.code.copied': { fr: 'Code copié.', en: 'Code copied.' },
  'friends.add.title': { fr: 'Ajouter un ami', en: 'Add a friend' },
  'friends.add.codeLabel': { fr: 'Code ami', en: 'Friend code' },
  'friends.add.invalidCode': { fr: 'Entrez un code ami valide.', en: 'Enter a valid friend code.' },
  'friends.add.submit': { fr: 'Envoyer une demande', en: 'Send a request' },
  'friends.add.becameFriends': { fr: 'Vous êtes maintenant amis !', en: 'You are now friends!' },
  'friends.add.sent': { fr: 'Demande envoyée.', en: 'Request sent.' },
  'friends.incoming.title': { fr: 'Demandes reçues', en: 'Incoming requests' },
  'friends.incoming.decline': { fr: 'Refuser', en: 'Decline' },
  'friends.incoming.accept': { fr: 'Accepter', en: 'Accept' },
  'friends.outgoing.title': { fr: 'Demandes envoyées', en: 'Outgoing requests' },
  'friends.outgoing.pending': { fr: 'En attente...', en: 'Pending...' },
  'friends.list.title': { fr: 'Mes amis ({{count}})', en: 'My friends ({{count}})' },
  'friends.list.empty': {
    fr: 'Aucun ami pour l’instant — partagez votre code ci-dessus pour commencer.',
    en: 'No friends yet — share your code above to get started.',
  },
  'friends.list.remove': { fr: 'Retirer', en: 'Remove' },

  // --- Statistiques (Stats.tsx) -----------------------------------------------
  'stats.title': { fr: 'Statistiques', en: 'Statistics' },
  'stats.tab.mine': { fr: 'Mes stats', en: 'My stats' },
  'stats.tab.leaderboard': { fr: 'Classement', en: 'Leaderboard' },
  'stats.gamesPlayed': { fr: 'Parties jouées', en: 'Games played' },
  'stats.gamesWon': { fr: 'Victoires', en: 'Wins' },
  'stats.winRate': { fr: 'Taux de victoire', en: 'Win rate' },
  'stats.byRole.title': { fr: 'Par rôle', en: 'By role' },
  'stats.byRole.mostPlayed': { fr: 'Rôle le plus joué : {{emoji}} {{role}}', en: 'Most played role: {{emoji}} {{role}}' },
  'stats.byRole.empty': {
    fr: 'Aucune partie terminée pour l’instant — lancez-en une pour commencer votre historique !',
    en: 'No completed games yet — start one to begin your history!',
  },
  'stats.byRole.winsFraction': { fr: '{{won}}/{{played}} victoire{{s}} ({{pct}}%)', en: '{{won}}/{{played}} win{{s}} ({{pct}}%)' },
  'stats.recent.title': { fr: 'Dernières parties', en: 'Recent games' },
  'stats.recent.empty': { fr: 'Rien à afficher pour le moment.', en: 'Nothing to show yet.' },
  'stats.recent.win': { fr: 'Victoire', en: 'Win' },
  'stats.recent.loss': { fr: 'Défaite', en: 'Loss' },
  'stats.leaderboard.title': { fr: '🏆 Classement', en: '🏆 Leaderboard' },
  'stats.leaderboard.subtitle': {
    fr: 'Basé sur le taux de victoire, à partir de 3 parties terminées.',
    en: 'Based on win rate, from 3 completed games onward.',
  },
  'stats.leaderboard.empty': {
    fr: "Pas encore assez de parties jouées sur l'ensemble des comptes pour établir un classement.",
    en: 'Not enough games played across all accounts yet to establish a leaderboard.',
  },

  // --- Menu compte (AccountMenu.tsx) ------------------------------------------
  'accountMenu.myAccount': { fr: 'Mon compte', en: 'My account' },
  'accountMenu.stats': { fr: 'Statistiques', en: 'Statistics' },
  'accountMenu.friends': { fr: 'Amis', en: 'Friends' },
  'accountMenu.signOut': { fr: '🚪 Déconnexion', en: '🚪 Sign out' },

  // --- Ami rapide (FriendRequestPopover.tsx) ----------------------------------
  'friendPopover.close': { fr: 'Fermer', en: 'Close' },
  'friendPopover.becameFriends': { fr: 'Vous êtes maintenant amis ! 🎉', en: 'You are now friends! 🎉' },
  'friendPopover.sent': { fr: 'Demande envoyée !', en: 'Request sent!' },
  'friendPopover.sending': { fr: 'Envoi...', en: 'Sending...' },
  'friendPopover.addButton': { fr: '➕ Ajouter en ami', en: '➕ Add as friend' },

  // --- Effectifs (RosterSummary.tsx) ------------------------------------------
  'roster.title': { fr: 'Effectifs', en: 'Roster' },
  'roster.aliveSuffix': { fr: 'joueurs en vie', en: 'players alive' },
  'roster.wolves': { fr: '🐺 Loups-Garous', en: '🐺 Werewolves' },
  'roster.village': { fr: '🏘️ Village', en: '🏘️ Village' },
  'roster.specialRoles': { fr: 'Rôles spéciaux', en: 'Special roles' },
  'roster.eliminated': { fr: 'éliminé(e)', en: 'eliminated' },
  'roster.alive': { fr: 'en vie', en: 'alive' },
  'roster.players': { fr: 'Joueurs', en: 'Players' },
  'roster.becameFriends': { fr: 'Amis ! 🎉', en: 'Friends! 🎉' },
  'roster.friendSent': { fr: 'Demande envoyée', en: 'Request sent' },
  'roster.friendFailed': { fr: 'Échec', en: 'Failed' },
  'roster.title.tooltip': { fr: 'Effectifs de la partie', en: 'Game roster' },

  // --- Panneau des demandes (JoinRequestsPanel.tsx) ---------------------------
  'joinRequests.empty': { fr: "Aucune demande en attente pour l'instant.", en: 'No pending requests for now.' },
  'joinRequests.decline': { fr: 'Refuser', en: 'Decline' },
  'joinRequests.accept': { fr: 'Accepter', en: 'Accept' },

  // --- Parties publiques (PublicGamesBrowser.tsx) -----------------------------
  'publicGames.hostApprovalNote': {
    fr: "L'hôte valide chaque demande avant que vous ne rejoigniez.",
    en: 'The host approves each request before you can join.',
  },
  'publicGames.refresh': { fr: '↻ Actualiser', en: '↻ Refresh' },
  'publicGames.refreshing': { fr: 'Actualisation...', en: 'Refreshing...' },
  'publicGames.searching': { fr: 'Recherche...', en: 'Searching...' },
  'publicGames.empty': { fr: 'Aucune partie publique ouverte pour l’instant.', en: 'No public game open right now.' },
  'publicGames.playerCount': { fr: '{{count}}/20 joueurs', en: '{{count}}/20 players' },
  'publicGames.statusLobby': { fr: 'En salon', en: 'In lobby' },
  'publicGames.statusInProgress': { fr: '🌙 En cours', en: '🌙 In progress' },
  'publicGames.inProgressTooltip': {
    fr: "La partie est en cours : votre demande attendra qu'elle se termine.",
    en: 'The game is in progress: your request will wait until it ends.',
  },
  'publicGames.requestSent': { fr: 'Demande envoyée', en: 'Request sent' },
  'publicGames.requesting': { fr: 'Envoi...', en: 'Sending...' },
  'publicGames.requestButton': { fr: 'Demander à rejoindre', en: 'Request to join' },

  // --- Attente d'approbation (PendingApproval.tsx) -----------------------------
  'pending.notifAcceptedTitle': { fr: 'Demande validée', en: 'Request approved' },
  'pending.notifAcceptedBody': {
    fr: "L'hôte a accepté votre demande, vous rejoignez le salon.",
    en: 'The host accepted your request, you are joining the lobby.',
  },
  'pending.inProgressTitle': { fr: 'La partie est en cours', en: 'The game is in progress' },
  'pending.waitingTitle': { fr: 'En attente de validation', en: 'Waiting for approval' },
  'pending.inProgressBody': {
    fr: "Votre demande a été envoyée à l'hôte. La partie a déjà commencé : il ne pourra y répondre qu'à son retour en salon, une fois cette partie terminée. Cette page se met à jour automatiquement.",
    en: "Your request has been sent to the host. The game has already started: they'll only be able to respond once back in the lobby, after this game ends. This page updates automatically.",
  },
  'pending.waitingBody': {
    fr: "Votre demande a été envoyée à l'hôte. Cette page se met à jour automatiquement dès qu'il répond.",
    en: 'Your request has been sent to the host. This page updates automatically as soon as they respond.',
  },
  'pending.cancelling': { fr: 'Annulation...', en: 'Cancelling...' },
  'pending.cancelButton': { fr: 'Annuler ma demande', en: 'Cancel my request' },
  'pending.rejectedTitle': { fr: 'Demande refusée', en: 'Request declined' },
  'pending.rejectedBody': { fr: "L'hôte n'a pas accepté votre demande pour cette partie.", en: 'The host did not accept your request for this game.' },
  'pending.goneTitle': { fr: 'Demande introuvable', en: 'Request not found' },
  'pending.goneBody': {
    fr: "Cette demande n'existe plus — la partie a peut-être été fermée entre-temps.",
    en: 'This request no longer exists — the game may have been closed in the meantime.',
  },

  // --- Rejoindre par lien (JoinByLink.tsx) -------------------------------------
  'joinByLink.cannotJoinTitle': { fr: 'Impossible de rejoindre', en: 'Unable to join' },

  // --- Vérifier email (VerifyEmail.tsx) ----------------------------------------
  'verifyEmail.title': { fr: 'Vérifiez votre email', en: 'Verify your email' },
  'verifyEmail.body': {
    fr: 'Nous avons envoyé un lien de confirmation à {{email}}. Cliquez dessus pour activer votre compte — cette page se mettra à jour automatiquement.',
    en: 'We sent a confirmation link to {{email}}. Click it to activate your account — this page will update automatically.',
  },
  'verifyEmail.emailFallback': { fr: 'votre adresse', en: 'your address' },
  'verifyEmail.spamNote': {
    fr: '📬 Vous ne le voyez pas ? Vérifiez votre dossier Spams / Courrier indésirable — et pensez à marquer le message comme "Non spam" pour que les prochains arrivent directement.',
    en: '📬 Don\'t see it? Check your Spam / Junk folder — and mark the message as "Not spam" so future ones land directly in your inbox.',
  },
  'verifyEmail.resent': { fr: 'Email renvoyé ✓', en: 'Email resent ✓' },
  'verifyEmail.resend': { fr: "Renvoyer l'email", en: 'Resend email' },
  'verifyEmail.confirmedNotice': {
    fr: 'Email confirmé ! Vous pouvez maintenant vous connecter.',
    en: 'Email confirmed! You can now log in.',
  },

  // --- Page introuvable (NotFound.tsx) -----------------------------------------
  'notFound.title': { fr: 'Cette clairière est introuvable', en: 'This clearing cannot be found' },
  'notFound.body': { fr: "La page que vous cherchez n'existe pas, ou plus.", en: 'The page you are looking for does not exist, or no longer does.' },

  // --- Pages légales : chrome partagé (LegalLayout.tsx) -------------------------
  'legal.backHome': { fr: "← Retour à l'accueil", en: '← Back to home' },
  'legal.updatedAt': { fr: 'Dernière mise à jour : {{date}}', en: 'Last updated: {{date}}' },
  'legal.updatedAtDate': { fr: '24 juillet 2026', en: 'July 24, 2026' },

  // --- CGU (Terms.tsx) ----------------------------------------------------------
  'terms.title': { fr: "📜 Conditions générales d'utilisation", en: '📜 Terms of Use' },
  'terms.intro': {
    fr: "Les présentes conditions générales d'utilisation (« CGU ») régissent l'accès et l'utilisation de Loup Garou d'Afrique (« l'application », « le service »). En créant un compte ou en rejoignant une partie, vous reconnaissez les avoir lues et les acceptez sans réserve.",
    en: 'These terms of use ("Terms") govern access to and use of Loup Garou d\'Afrique ("the app", "the service"). By creating an account or joining a game, you acknowledge that you have read them and accept them without reservation.',
  },
  'terms.s1.title': { fr: '1. Éditeur', en: '1. Publisher' },
  'terms.s1.p1': {
    fr: "L'application est développée et éditée, à titre non professionnel et sans but lucratif, par GEOFFROY SAIZONOU (« l'éditeur »), joignable à l'adresse loupgarouafrique@gmail.com. Elle est hébergée par Vercel Inc. (hébergement de l'application) et Supabase, dont l'infrastructure (base de données et authentification) est hébergée en Inde.",
    en: 'The app is developed and published, on a non-professional and non-profit basis, by GEOFFROY SAIZONOU ("the publisher"), reachable at loupgarouafrique@gmail.com. It is hosted by Vercel Inc. (app hosting) and Supabase, whose infrastructure (database and authentication) is hosted in India.',
  },
  'terms.s2.title': { fr: '2. Description du service', en: '2. Description of the service' },
  'terms.s2.p1': {
    fr: 'L\'application permet de jouer en ligne, entre amis, à une adaptation numérique du jeu de société « Les Loups-Garous de Thiercelieux » : création de salons de partie, distribution automatique des rôles, gestion des phases de jour et de nuit, chat texte par salon et chat vocal en direct.',
    en: 'The app lets you play online with friends, a digital adaptation of the board game "Les Loups-Garous de Thiercelieux" (Werewolves of Miller\'s Hollow): creating game lobbies, automatic role distribution, managing day and night phases, per-room text chat, and live voice chat.',
  },
  'terms.s2.p2': {
    fr: "Il s'agit d'une adaptation réalisée par un fan, développée de manière indépendante et sans lien avec les ayants droit du jeu original. Le nom « Loups-Garous de Thiercelieux » et le concept de jeu appartiennent à leurs créateurs et éditeurs respectifs ; en cas de demande de leur part, l'éditeur s'engage à faire évoluer ou retirer l'application. Le code, les textes, l'identité visuelle et les éléments graphiques propres à l'application restent la propriété de l'éditeur.",
    en: 'This is a fan-made adaptation, developed independently and with no affiliation to the rights holders of the original game. The name "Les Loups-Garous de Thiercelieux" and the game concept belong to their respective creators and publishers; should they request it, the publisher commits to changing or removing the app. The code, text, visual identity, and graphic elements specific to the app remain the property of the publisher.',
  },
  'terms.s2.p3': {
    fr: "Le service est actuellement gratuit et proposé « en l'état ». Il est développé sur le temps libre de l'éditeur : aucune disponibilité continue, aucun taux de service (SLA) et aucune garantie de maintien du service dans le temps ne sont assurés.",
    en: 'The service is currently free and provided "as is". It is developed in the publisher\'s free time: no continuous availability, no service level agreement (SLA), and no guarantee that the service will be maintained over time are provided.',
  },
  'terms.s3.title': { fr: '3. Inscription et compte', en: '3. Registration and account' },
  'terms.s3.p1': {
    fr: "La création d'un compte nécessite une adresse email valide et un pseudo. Vous vous engagez à fournir des informations exactes et à conserver la confidentialité de votre mot de passe : vous êtes responsable de toute activité effectuée depuis votre compte. L'inscription est réservée aux personnes d'au moins 15 ans, ou disposant de l'accord d'un parent ou tuteur légal en dessous de cet âge. Un compte est personnel et ne doit pas être partagé.",
    en: 'Creating an account requires a valid email address and a username. You agree to provide accurate information and to keep your password confidential: you are responsible for all activity carried out from your account. Registration is reserved for people aged 15 and over, or with the consent of a parent or legal guardian if under that age. An account is personal and must not be shared.',
  },
  'terms.s4.title': { fr: '4. Règles de bonne conduite', en: '4. Rules of good conduct' },
  'terms.s4.p1': {
    fr: 'Les salons de discussion (texte et vocal) font partie intégrante du jeu, mais doivent rester respectueux. Sont interdits : les propos injurieux, haineux, discriminatoires ou harcelants, l\'usurpation d\'identité, la triche technique (usage d\'outils extérieurs pour contourner les règles du jeu), et plus généralement tout contenu illicite au regard de la loi française.',
    en: 'Chat rooms (text and voice) are an integral part of the game, but must remain respectful. The following are prohibited: abusive, hateful, discriminatory, or harassing remarks, identity theft, technical cheating (using external tools to bypass the rules of the game), and more generally any content unlawful under French law.',
  },
  'terms.s4.p2': {
    fr: "L'hôte d'une partie peut couper à distance le micro d'un participant pendant le chat vocal. L'éditeur se réserve le droit de suspendre ou de résilier un compte en cas de manquement grave ou répété à ces règles, après avoir, dans la mesure du possible, tenté d'en informer l'utilisateur concerné.",
    en: 'The host of a game may remotely mute a participant\'s microphone during voice chat. The publisher reserves the right to suspend or terminate an account in case of a serious or repeated breach of these rules, after attempting, where possible, to inform the user concerned.',
  },
  'terms.s5.title': { fr: '5. Contenus publiés par les utilisateurs', en: '5. Content published by users' },
  'terms.s5.p1': {
    fr: "Vous restez seul responsable des messages que vous publiez dans les salons de discussion. L'éditeur ne les modère pas a priori (les échanges font partie du jeu) mais peut les supprimer ou clôturer une partie en cas de signalement fondé ou de contenu manifestement illicite.",
    en: 'You remain solely responsible for the messages you post in chat rooms. The publisher does not moderate them in advance (the exchanges are part of the game) but may delete them or close a game in the event of a substantiated report or clearly unlawful content.',
  },
  'terms.s6.title': { fr: '6. Disponibilité et évolutions du service', en: '6. Availability and evolution of the service' },
  'terms.s6.p1': {
    fr: "L'application peut faire l'objet d'interruptions (maintenance, mise à jour, incident technique) sans préavis. Les fonctionnalités, réglages par défaut et règles du jeu peuvent évoluer à tout moment pour améliorer l'expérience.",
    en: 'The app may be subject to interruptions (maintenance, updates, technical incidents) without notice. Features, default settings, and game rules may change at any time to improve the experience.',
  },
  'terms.s7.title': { fr: '7. Responsabilité', en: '7. Liability' },
  'terms.s7.p1': {
    fr: "Le service est fourni gratuitement et « en l'état », sans garantie d'absence d'erreur ou d'interruption. Dans la limite de ce que permet la loi, l'éditeur ne saurait être tenu responsable des dommages indirects liés à l'utilisation ou à l'impossibilité d'utiliser l'application, ni des propos échangés entre utilisateurs dans les salons de discussion.",
    en: 'The service is provided free of charge and "as is", with no guarantee of being error-free or uninterrupted. To the extent permitted by law, the publisher cannot be held liable for indirect damages related to the use or inability to use the app, nor for statements exchanged between users in chat rooms.',
  },
  'terms.s8.title': { fr: '8. Suspension et résiliation', en: '8. Suspension and termination' },
  'terms.s8.p1': {
    fr: 'Vous pouvez cesser d\'utiliser l\'application et demander la fermeture de votre compte à tout moment, soit directement depuis la page « Mon compte », soit en écrivant à loupgarouafrique@gmail.com. L\'éditeur peut suspendre ou supprimer un compte en cas de non-respect des présentes CGU, ou fermer le service dans son ensemble moyennant un préavis raisonnable lorsque cela est possible.',
    en: 'You may stop using the app and request the closure of your account at any time, either directly from the "My account" page, or by writing to loupgarouafrique@gmail.com. The publisher may suspend or delete an account in case of non-compliance with these Terms, or close the service entirely with reasonable notice where possible.',
  },
  'terms.s9.title': { fr: '9. Droit applicable', en: '9. Governing law' },
  'terms.s9.p1': {
    fr: 'Les présentes CGU sont soumises au droit français. En cas de litige, une solution amiable sera recherchée en priorité en contactant loupgarouafrique@gmail.com avant toute action judiciaire.',
    en: 'These Terms are governed by French law. In the event of a dispute, an amicable solution will be sought first by contacting loupgarouafrique@gmail.com before any legal action.',
  },
  'terms.s10.title': { fr: '10. Modification des CGU', en: '10. Changes to these Terms' },
  'terms.s10.p1': {
    fr: "Les présentes CGU peuvent être modifiées pour refléter l'évolution du service ou de la réglementation. La date de dernière mise à jour en haut de cette page fait foi ; en cas de modification substantielle, un message sera affiché dans l'application.",
    en: 'These Terms may be amended to reflect changes to the service or applicable regulations. The last-updated date at the top of this page is authoritative; in the event of a substantial change, a notice will be displayed within the app.',
  },
  'terms.contact.title': { fr: 'Contact', en: 'Contact' },
  'terms.contact.p1': {
    fr: 'Pour toute question relative à ces CGU : loupgarouafrique@gmail.com',
    en: 'For any question regarding these Terms: loupgarouafrique@gmail.com',
  },

  // --- Confidentialité (Privacy.tsx) ---------------------------------------------
  'privacy.title': { fr: '🔒 Politique de confidentialité', en: '🔒 Privacy Policy' },
  'privacy.intro': {
    fr: "Cette page explique quelles données personnelles Loup Garou d'Afrique (« l'application ») collecte, pourquoi, combien de temps elles sont conservées, et comment les faire modifier ou supprimer. Elle s'applique à toute personne créant un compte ou participant à une partie.",
    en: "This page explains what personal data Loup Garou d'Afrique (\"the app\") collects, why, how long it's kept, and how to have it modified or deleted. It applies to anyone creating an account or taking part in a game.",
  },
  'privacy.s1.title': { fr: '1. Qui est responsable du traitement de vos données ?', en: '1. Who is responsible for processing your data?' },
  'privacy.s1.p1': {
    fr: "L'application est développée et éditée, à titre non professionnel, par GEOFFROY SAIZONOU (« l'éditeur »). Pour toute question relative à vos données personnelles, vous pouvez le contacter à l'adresse loupgarouafrique@gmail.com.",
    en: 'The app is developed and published, on a non-professional basis, by GEOFFROY SAIZONOU ("the publisher"). For any question regarding your personal data, you can contact them at loupgarouafrique@gmail.com.',
  },
  'privacy.s2.title': { fr: '2. Quelles données sont collectées ?', en: '2. What data is collected?' },
  'privacy.s2.p1': { fr: 'Selon votre usage de l’application, les données suivantes peuvent être collectées :', en: 'Depending on your use of the app, the following data may be collected:' },
  'privacy.s2.account.label': { fr: 'Compte :', en: 'Account:' },
  'privacy.s2.account.text': {
    fr: 'adresse email et mot de passe (géré par notre prestataire d’authentification, jamais stocké en clair), pseudo, icône et couleur d’avatar.',
    en: 'email address and password (managed by our authentication provider, never stored in plain text), username, avatar icon and color.',
  },
  'privacy.s2.social.label': { fr: 'Vie sociale :', en: 'Social features:' },
  'privacy.s2.social.text': {
    fr: 'code ami, liste des relations d’amitié, invitations envoyées ou reçues.',
    en: 'friend code, list of friendships, invitations sent or received.',
  },
  'privacy.s2.games.label': { fr: 'Parties jouées :', en: 'Games played:' },
  'privacy.s2.games.text': {
    fr: 'rôles attribués, votes, actions nocturnes, messages échangés dans les salons de discussion (village, loups, cimetière), et un historique de statistiques (parties jouées, victoires, rôles endossés) rattaché à votre compte.',
    en: 'assigned roles, votes, night actions, messages exchanged in chat rooms (village, wolves, graveyard), and a statistics history (games played, wins, roles played) attached to your account.',
  },
  'privacy.s2.voice.label': { fr: 'Chat vocal :', en: 'Voice chat:' },
  'privacy.s2.voice.text': {
    fr: "si vous activez le micro pendant une partie, votre flux audio transite en direct par notre prestataire de chat vocal (voir section 4) le temps de la connexion. Il n'est ni enregistré ni stocké par l'application.",
    en: 'if you turn on your microphone during a game, your audio stream is relayed live through our voice chat provider (see section 4) for the duration of the connection. It is neither recorded nor stored by the app.',
  },
  'privacy.s2.local.label': { fr: 'Préférences locales :', en: 'Local preferences:' },
  'privacy.s2.local.text': {
    fr: 'quelques réglages (son activé/coupé, narrateur, notifications) sont enregistrés uniquement dans le navigateur (stockage local), sans être transmis à nos serveurs.',
    en: 'a few settings (sound on/off, narrator, notifications) are saved only in the browser (local storage), and are not sent to our servers.',
  },
  'privacy.s2.tech.label': { fr: 'Techniques :', en: 'Technical:' },
  'privacy.s2.tech.text': {
    fr: "aucune donnée de navigation n'est envoyée à un service de mesure d'audience ou de publicité — l'application n'utilise ni cookies publicitaires, ni traceur tiers.",
    en: 'no browsing data is sent to an analytics or advertising service — the app uses neither advertising cookies nor third-party trackers.',
  },
  'privacy.s3.title': { fr: '3. Pourquoi et sur quelle base légale ?', en: '3. Why, and on what legal basis?' },
  'privacy.s3.p1': {
    fr: "Ces données sont traitées pour permettre le fonctionnement du service auquel vous vous inscrivez : créer et rejoindre des parties, faire fonctionner le moteur de jeu, afficher vos statistiques et votre liste d'amis, et sécuriser votre compte. C'est l'exécution du contrat qui vous lie à l'éditeur en utilisant l'application (article 6.1.b du RGPD) qui sert de base légale à l'essentiel de ces traitements ; les notifications navigateur, elles, reposent sur votre consentement explicite et peuvent être désactivées à tout moment.",
    en: 'This data is processed to enable the service you sign up for to function: creating and joining games, running the game engine, displaying your statistics and friends list, and securing your account. The performance of the contract binding you to the publisher by using the app (Article 6.1.b of the GDPR) serves as the legal basis for most of this processing; browser notifications, on the other hand, rely on your explicit consent and can be disabled at any time.',
  },
  'privacy.s4.title': { fr: '4. Qui a accès à vos données ?', en: '4. Who has access to your data?' },
  'privacy.s4.p1': {
    fr: 'Vos données ne sont ni vendues ni louées. Elles sont visibles par les autres joueurs d’une même partie dans la mesure nécessaire au jeu (pseudo, avatar, statut en vie/mort, votes publics, messages des salons auxquels ils ont accès). Elles sont hébergées et traitées par les prestataires techniques suivants, en tant que sous-traitants :',
    en: 'Your data is neither sold nor rented. It is visible to other players in the same game to the extent necessary for the game (username, avatar, alive/dead status, public votes, messages in the rooms they have access to). It is hosted and processed by the following technical providers, acting as data processors:',
  },
  'privacy.s4.supabase': {
    fr: 'Supabase (base de données, authentification, temps réel) — infrastructure hébergée chez AWS, région Inde (Mumbai).',
    en: 'Supabase (database, authentication, realtime) — infrastructure hosted on AWS, India region (Mumbai).',
  },
  'privacy.s4.vercel': {
    fr: "Vercel Inc. — hébergement de l'application elle-même (réseau mondial de serveurs).",
    en: 'Vercel Inc. — hosting of the app itself (global server network).',
  },
  'privacy.s4.daily': {
    fr: "Daily.co, Inc. (États-Unis) — acheminement du chat vocal en direct pendant une partie, sans enregistrement.",
    en: 'Daily.co, Inc. (United States) — routing of live voice chat during a game, without recording.',
  },
  'privacy.s5.title': { fr: '5. Transferts hors Union européenne', en: '5. Transfers outside the European Union' },
  'privacy.s5.p1': {
    fr: "Plusieurs de ces prestataires traitent des données depuis des serveurs situés hors de l'Union européenne : Supabase héberge la base de données et l'authentification en Inde, Daily.co achemine le chat vocal depuis les États-Unis, et Vercel s'appuie sur un réseau mondial de serveurs. Ces transferts s'appuient sur les garanties prévues par ces prestataires (clauses contractuelles types de la Commission européenne ou mécanisme équivalent).",
    en: "Several of these providers process data from servers located outside the European Union: Supabase hosts the database and authentication in India, Daily.co routes voice chat from the United States, and Vercel relies on a global server network. These transfers rely on the safeguards provided by these vendors (European Commission standard contractual clauses or an equivalent mechanism).",
  },
  'privacy.s6.title': { fr: '6. Combien de temps vos données sont-elles conservées ?', en: '6. How long is your data kept?' },
  'privacy.s6.p1': {
    fr: "Les données de votre compte (profil, statistiques, amis) sont conservées tant que votre compte existe. Les données d'une partie (rôles, votes, messages) restent rattachées à cette partie et à votre compte ; il n'existe pas aujourd'hui de purge automatique des anciennes parties. Vous pouvez demander la suppression de votre compte et des données associées à tout moment (voir section 9).",
    en: 'Your account data (profile, statistics, friends) is kept for as long as your account exists. Data from a game (roles, votes, messages) remains attached to that game and to your account; there is currently no automatic purge of old games. You can request the deletion of your account and associated data at any time (see section 9).',
  },
  'privacy.s7.title': { fr: '7. Sécurité', en: '7. Security' },
  'privacy.s7.p1': {
    fr: "L'accès aux données sensibles (rôles secrets, votes, actions nocturnes) est protégé côté serveur par des règles de sécurité au niveau des lignes (Row Level Security) : aucun joueur ne peut techniquement consulter les informations d'un autre en dehors de ce que les règles du jeu autorisent à révéler. Les échanges avec l'application sont chiffrés (HTTPS).",
    en: "Access to sensitive data (secret roles, votes, night actions) is protected server-side by row-level security rules: no player can technically view another player's information beyond what the rules of the game allow to be revealed. Exchanges with the app are encrypted (HTTPS).",
  },
  'privacy.s8.title': { fr: '8. Cookies et stockage local', en: '8. Cookies and local storage' },
  'privacy.s8.p1': {
    fr: "L'application n'utilise pas de cookies de mesure d'audience ni de publicité. Le stockage local du navigateur sert uniquement à retenir vos préférences d'interface (son, notifications) et votre session de connexion ; ces informations restent sur votre appareil et ne sont pas partagées avec des tiers.",
    en: "The app does not use analytics or advertising cookies. The browser's local storage is only used to remember your interface preferences (sound, notifications) and your login session; this information stays on your device and is not shared with third parties.",
  },
  'privacy.s9.title': { fr: '9. Vos droits', en: '9. Your rights' },
  'privacy.s9.p1': {
    fr: "Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition sur vos données personnelles. La modification du pseudo et de l'avatar est possible directement depuis la page « Mon compte ». Vous pouvez également y demander la fermeture de votre compte : la demande est enregistrée immédiatement et traitée par l'éditeur dans un délai raisonnable, qui procède alors à la suppression de votre compte et des données associées. Pour toute autre demande (export de vos données, par exemple), écrivez à loupgarouafrique@gmail.com. Vous pouvez également introduire une réclamation auprès de la CNIL (www.cnil.fr).",
    en: 'In accordance with the GDPR, you have the right to access, rectify, erase, restrict, port, and object to the processing of your personal data. You can change your username and avatar directly from the "My account" page. You can also request the closure of your account there: the request is recorded immediately and processed by the publisher within a reasonable time, after which your account and associated data are deleted. For any other request (such as exporting your data), write to loupgarouafrique@gmail.com. You can also file a complaint with the CNIL (www.cnil.fr), or with your local data protection authority.',
  },
  'privacy.s10.title': { fr: '10. Mineurs', en: '10. Minors' },
  'privacy.s10.p1': {
    fr: "L'application ne s'adresse pas aux personnes de moins de 15 ans sans l'accord d'un parent ou tuteur légal, conformément à l'âge de consentement numérique fixé par la loi française.",
    en: 'The app is not intended for people under 15 without the consent of a parent or legal guardian, in accordance with the digital age of consent set by French law.',
  },
  'privacy.s11.title': { fr: '11. Modifications de cette politique', en: '11. Changes to this policy' },
  'privacy.s11.p1': {
    fr: "Cette politique peut évoluer, notamment si de nouveaux prestataires ou fonctionnalités sont ajoutés. La date de dernière mise à jour en haut de cette page reflète la version en vigueur.",
    en: 'This policy may change, particularly if new providers or features are added. The last-updated date at the top of this page reflects the version in effect.',
  },
  'privacy.contact.title': { fr: 'Contact', en: 'Contact' },
  'privacy.contact.p1': {
    fr: 'Pour toute question sur cette politique ou vos données : loupgarouafrique@gmail.com',
    en: 'For any question about this policy or your data: loupgarouafrique@gmail.com',
  },

  // --- Mentions légales (LegalNotice.tsx) -----------------------------------------
  'legalNotice.title': { fr: '⚖️ Mentions légales', en: '⚖️ Legal Notice' },
  'legalNotice.intro': {
    fr: "Conformément à la loi n°2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), voici les informations d'identification relatives à l'édition et à l'hébergement de Loup Garou d'Afrique (« l'application »).",
    en: "In accordance with French law n°2004-575 of June 21, 2004 on confidence in the digital economy (LCEN), here is the identifying information regarding the publishing and hosting of Loup Garou d'Afrique (\"the app\").",
  },
  'legalNotice.publisher.title': { fr: 'Éditeur', en: 'Publisher' },
  'legalNotice.publisher.p1': {
    fr: "L'application est éditée, à titre non professionnel et sans but lucratif, par GEOFFROY SAIZONOU, personne physique agissant à titre individuel (l'application ne génère aucun revenu et ne fait l'objet d'aucune activité commerciale).",
    en: 'The app is published, on a non-professional and non-profit basis, by GEOFFROY SAIZONOU, an individual acting in a personal capacity (the app generates no revenue and is not the subject of any commercial activity).',
  },
  'legalNotice.publisher.contact': { fr: 'Contact : loupgarouafrique@gmail.com', en: 'Contact: loupgarouafrique@gmail.com' },
  'legalNotice.director.title': { fr: 'Directeur de la publication', en: 'Publication director' },
  'legalNotice.director.p1': {
    fr: 'GEOFFROY SAIZONOU, joignable à l’adresse ci-dessus.',
    en: 'GEOFFROY SAIZONOU, reachable at the address above.',
  },
  'legalNotice.hosting.title': { fr: 'Hébergement', en: 'Hosting' },
  'legalNotice.hosting.appLabel': { fr: 'Application (front-end) :', en: 'App (front-end):' },
  'legalNotice.hosting.appText': {
    fr: 'Vercel Inc. — 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.',
    en: 'Vercel Inc. — 440 N Barranca Ave #4133, Covina, CA 91723, United States.',
  },
  'legalNotice.hosting.dbLabel': { fr: 'Base de données, authentification, temps réel :', en: 'Database, authentication, realtime:' },
  'legalNotice.hosting.dbText': {
    fr: 'Supabase, Inc. — 548 Market St, San Francisco, CA 94104, États-Unis (infrastructure exploitée sur des serveurs AWS situés en Inde, voir la Politique de confidentialité).',
    en: 'Supabase, Inc. — 548 Market St, San Francisco, CA 94104, United States (infrastructure operated on AWS servers located in India, see the Privacy Policy).',
  },
  'legalNotice.hosting.note': {
    fr: "Adresses indiquées à titre informatif d'après les registres publics de ces sociétés ; en cas de doute, se référer directement aux mentions légales publiées par chacun de ces prestataires.",
    en: "Addresses given for informational purposes based on these companies' public records; when in doubt, refer directly to the legal notices published by each of these providers.",
  },
  'legalNotice.ip.title': { fr: 'Propriété intellectuelle', en: 'Intellectual property' },
  'legalNotice.ip.p1': {
    fr: 'Loup Garou d’Afrique est une adaptation numérique, réalisée par un fan, du jeu de société « Les Loups-Garous de Thiercelieux ». Ce nom et le concept de jeu appartiennent à leurs créateurs et éditeurs respectifs, sans lien avec la présente application. Le code source, les textes, l’identité visuelle (logo, illustrations) et les éléments graphiques propres à l’application sont la propriété de l’éditeur, sauf mention contraire.',
    en: 'Loup Garou d\'Afrique is a fan-made digital adaptation of the board game "Les Loups-Garous de Thiercelieux". This name and the game concept belong to their respective creators and publishers, with no affiliation to this app. The source code, text, visual identity (logo, illustrations), and graphic elements specific to the app are the property of the publisher, unless otherwise stated.',
  },
  'legalNotice.ip.p2': {
    fr: 'Les illustrations des cartes de rôles sont l’œuvre d’Oswald Houndekon.',
    en: 'The role card illustrations are the work of Oswald Houndekon.',
  },
  'legalNotice.more.title': { fr: 'Pour aller plus loin', en: 'To learn more' },
  'legalNotice.more.p1': {
    fr: 'Voir également la Politique de confidentialité (traitement des données personnelles) et les Conditions générales d’utilisation (règles d’usage du service).',
    en: 'See also the Privacy Policy (personal data processing) and the Terms of Use (rules for using the service).',
  },
  'legalNotice.contact.title': { fr: 'Contact', en: 'Contact' },
  'legalNotice.contact.p1': {
    fr: 'Pour toute question relative à ces mentions légales : loupgarouafrique@gmail.com',
    en: 'For any question regarding this legal notice: loupgarouafrique@gmail.com',
  },

  // --- Améliorations diverses (voir migration 0041) ---------------------------
  'voiceChat.listenOnly': { fr: '👂 Écoute seule', en: '👂 Listen only' },
  'voiceChat.moderatorBadge': { fr: 'Modérateur', en: 'Moderator' },
  'voiceChat.moderatorHint': {
    fr: 'Vous pouvez couper à distance le micro de n’importe quel joueur ici.',
    en: 'You can remotely mute any player’s mic here.',
  },
  'voiceChat.alreadyMuted': { fr: 'Déjà coupé', en: 'Already muted' },
  'voiceChat.soundOnTitle': { fr: 'Couper le son (ne plus entendre les autres)', en: 'Mute sound (stop hearing others)' },
  'voiceChat.soundOffTitle': { fr: 'Rétablir le son', en: 'Restore sound' },
  'game.extendTimeTitle': { fr: 'Prolonger le débat de 30s', en: 'Extend the debate by 30s' },
  'chat.replyTo': { fr: 'Répondre', en: 'Reply' },
  'chat.replyingTo': { fr: 'Réponse à', en: 'Replying to' },
  'chat.repliedMessageUnavailable': { fr: 'Message d’origine indisponible', en: 'Original message unavailable' },
  'lobby.gameStartedNotifTitle': { fr: '🐺 La partie commence !', en: '🐺 The game is starting!' },
  'lobby.gameStartedNotifBody': { fr: 'Rejoignez le salon, la distribution des rôles a commencé.', en: 'Join now, roles are being handed out.' },
  'lobby.inviteMessage': {
    fr: 'Rejoins ma partie de Loup Garou d’Afrique ! 🐺 Code : {{code}} — {{link}}',
    en: 'Join my Loup Garou d’Afrique game! 🐺 Code: {{code}} — {{link}}',
  },
} as const satisfies Record<string, Record<Lang, string>>

export type TranslationKey = keyof typeof translations
