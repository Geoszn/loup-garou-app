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
  // Libellé temporaire affiché sur un CopyButton (voir ui.tsx) juste après
  // un clic — remplace le libellé normal pendant ~2s, seul retour visuel
  // qu'un joueur ait qu'une copie presse-papiers a bien fonctionné.
  'common.copied': { fr: '✓ Copié !', en: '✓ Copied!' },
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
  'landing.nav.help': { fr: 'Aide', en: 'Help' },
  'landing.badge.upTo25': { fr: 'Jusqu’à 25 joueurs', en: 'Up to 25 players' },
  'landing.leaderboard.title': { fr: 'Classement mondial', en: 'Global leaderboard' },
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
    fr: 'Partagez un code ou un lien, jusqu’à 25 joueurs peuvent rejoindre la partie.',
    en: 'Share a code or a link — up to 25 players can join the game.',
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
  'signup.continent': { fr: 'Continent', en: 'Continent' },
  'signup.continentPlaceholder': { fr: 'Choisissez votre continent', en: 'Choose your continent' },
  'signup.submit': { fr: 'Créer mon compte', en: 'Create my account' },
  'signup.submitting': { fr: 'Création...', en: 'Creating...' },
  'signup.error.continentRequired': { fr: 'Choisissez votre continent.', en: 'Choose your continent.' },
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
  'dashboard.leaderboard.title': { fr: 'Classement mondial', en: 'Global leaderboard' },
  'dashboard.leaderboard.seeAll': { fr: 'Tout voir →', en: 'See all →' },
  'dashboard.leaderboard.empty': {
    fr: 'Personne n’est encore classé — gagne 3 parties pour apparaître ici en premier !',
    en: 'No one is ranked yet — win 3 games to be the first to appear here!',
  },
  'dashboard.leaderboard.you': { fr: 'Toi', en: 'You' },
  'dashboard.leaderboard.youLabel': { fr: '{{username}} (toi)', en: '{{username}} (you)' },

  // --- Feedback (FeedbackButton.tsx) -----------------------------------------
  'feedback.openButton': { fr: 'Donner mon avis', en: 'Give feedback' },
  'feedback.title': { fr: 'Donner mon avis', en: 'Give feedback' },
  'feedback.subtitle': {
    fr: 'Bug, idée de fonctionnalité, retour sur une partie... écris-nous, on lit tout.',
    en: 'Bug, feature idea, feedback on a game... write to us, we read everything.',
  },
  'feedback.placeholder': { fr: 'Ton message...', en: 'Your message...' },
  'feedback.submit': { fr: 'Envoyer', en: 'Send' },
  'feedback.sending': { fr: 'Envoi...', en: 'Sending...' },
  'feedback.success': { fr: 'Merci ! Ton message a bien été envoyé. 🙏', en: 'Thanks! Your message has been sent. 🙏' },
  'feedback.cooldown': {
    fr: 'Tu as déjà envoyé un message cette semaine. Tu pourras réessayer à partir du {{date}}.',
    en: "You've already sent a message this week. You can try again from {{date}}.",
  },
  'feedback.error.generic': { fr: "Impossible d'envoyer le message.", en: 'Unable to send the message.' },

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
  'common.viewProfile': { fr: 'Voir le profil', en: 'View profile' },
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
  'role.loup_alpha.name': { fr: 'Loup Alpha', en: 'Alpha Wolf' },
  'role.loup_alpha.description': {
    fr: "Nécessite au moins 10 joueurs. Vous votez chaque nuit avec le reste de la meute, mais votre vote compte double — comme celui du Capitaine en journée. Si la majorité des loups est d'accord, vous pouvez choisir d'infecter la victime au lieu de l'éliminer, pour la faire rejoindre les loups (une seule infection par partie, et vous ne décidez jamais seul).",
    en: "Requires at least 10 players. You vote each night with the rest of the pack, but your vote counts double — like the Captain's during the day. If the majority of wolves agree, you can choose to infect the victim instead of eliminating them, making them join the wolves (one infection per game, and you never decide alone).",
  },
  'role.loup_alpha.nightAction': {
    fr: 'Votez avec votre meute (votre voix compte double). Si la majorité des loups est d’accord, vous pouvez infecter la victime au lieu de l’éliminer.',
    en: 'Vote with your pack (your vote counts double). If the majority of wolves agree, you can infect the victim instead of eliminating them.',
  },
  'role.loup_garou.nightAction': {
    fr: 'Choisissez avec votre meute la victime de la nuit.',
    en: "Choose the night's victim together with your pack.",
  },
  'role.voyante.name': { fr: 'Voyante', en: 'Seer' },
  'role.voyante.description': {
    fr: "Chaque nuit, vous pouvez sonder un joueur de votre choix pour découvrir son camp : Loup-Garou ou Villageois. Pas son rôle précis, juste son camp.",
    en: "Each night, you can probe a player of your choice to reveal their side: Werewolf or Villager. Not their exact role, just their side.",
  },
  'role.voyante.nightAction': {
    fr: 'Choisissez un joueur pour découvrir son camp (Loup-Garou ou Villageois).',
    en: "Choose a player to reveal their side (Werewolf or Villager).",
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
    fr: "Dès la première nuit, avant tout le monde, vous volez la carte d'un joueur choisi au hasard, sans savoir laquelle. Vous héritez de son rôle et de son camp — et lui hérite du vôtre.",
    en: "On the very first night, before anyone else, you steal the card of a randomly chosen player without knowing which one. You inherit their role and team — and they inherit yours.",
  },
  'role.voleur.nightAction': {
    fr: 'Confirmez le vol : le serveur tire au sort un autre joueur et échange vos cartes (uniquement la première nuit).',
    en: 'Confirm the theft: the server randomly picks another player and swaps your cards (first night only).',
  },
  'role.enfant_sauvage.name': { fr: 'Enfant Sauvage', en: 'Wild Child' },
  'role.enfant_sauvage.description': {
    fr: "Au début de la partie, vous choisissez secrètement un mentor parmi les autres joueurs. Tant qu'il ou elle est en vie, vous jouez avec les Villageois. Dès qu'il ou elle meurt, peu importe la cause, vous devenez immédiatement un Loup-Garou et rejoignez la meute.",
    en: 'At the start of the game, you secretly choose a mentor among the other players. As long as they are alive, you play with the Villagers. The moment they die, no matter the cause, you immediately become a Werewolf and join the pack.',
  },
  'role.enfant_sauvage.nightAction': {
    fr: 'Choisissez secrètement votre mentor (uniquement la première nuit).',
    en: 'Secretly choose your mentor (first night only).',
  },
  'role.griot.name': { fr: 'Griot', en: 'Griot' },
  'role.griot.description': {
    fr: "Vous êtes le gardien de la mémoire du village. À partir de la deuxième nuit, vous désignez chaque nuit un joueur et apprenez une trace de ce qu'il a fait la nuit précédente — jamais son rôle ni son camp, uniquement une description vague de son action.",
    en: "You are the keeper of the village's memory. Starting from the second night, you designate a player each night and learn a trace of what they did the night before — never their role or team, only a vague description of their action.",
  },
  'role.griot.nightAction': {
    fr: 'Choisissez un joueur : vous apprendrez une trace de son action lors de la nuit précédente (rien avant la deuxième nuit).',
    en: "Choose a player: you'll learn a trace of their action from the previous night (nothing before the second night).",
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
  'lobby.homeScreenHint': {
    fr: 'Le jeu est déjà sur ton écran d’accueil ? Ouvre-le depuis là plutôt que ce lien, pour profiter du son et des notifications.',
    en: 'Already have the game on your home screen? Open it from there instead of this link, for sound and notifications.',
  },
  'lobby.settingsButton': { fr: '⚙️ Réglages', en: '⚙️ Settings' },
  'lobby.customSettingsTitle': { fr: 'Réglages personnalisés', en: 'Customized settings' },
  'lobby.leaveButton': { fr: '🚪 Quitter', en: '🚪 Leave' },
  'lobby.joinRequestsTitleSingular': { fr: 'Demande pour rejoindre', en: 'Request to join' },
  'lobby.joinRequestsTitlePlural': { fr: 'Demandes pour rejoindre', en: 'Requests to join' },
  'lobby.publicBadge': { fr: '🌍 Partie publique', en: '🌍 Public game' },
  'lobby.privateBadge': { fr: '🔒 Partie privée', en: '🔒 Private game' },
  'lobby.noRequestsYet': { fr: "aucune demande pour l'instant.", en: 'no requests yet.' },
  'lobby.copyInviteLink': { fr: "🔗 Copier le lien d'invitation", en: '🔗 Copy invite link' },
  'lobby.playersTitle': { fr: 'Joueurs ({{count}}/25)', en: 'Players ({{count}}/25)' },
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
  'lobby.alphaToggleHint': {
    fr: "Nécessite au moins 10 joueurs. Vote avec le reste de la meute (son vote compte double) ; si la majorité des loups est d'accord, il peut infecter une victime au lieu de l'éliminer (une seule fois par partie).",
    en: "Requires at least 10 players. Votes with the rest of the pack (their vote counts double); if the majority of wolves agree, they can infect a victim instead of eliminating them (once per game).",
  },
  'lobby.alphaConstraintViolated': {
    fr: 'Le Loup Alpha nécessite au moins 10 joueurs.',
    en: 'The Alpha Wolf requires at least 10 players.',
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
  // Depuis la migration 0080, ce réglage ne couvre plus que Voleur/Cupidon/
  // Enfant Sauvage : la Voyante et la Sorcière ont désormais leur propre
  // réglage dédié (voir lobby.duration.voyante / .sorciere ci-dessous).
  'lobby.duration.nightSteps': { fr: '🌙 Autres étapes de nuit', en: '🌙 Other night steps' },
  'lobby.duration.wolfChat': { fr: '🐺 Discussion des loups', en: '🐺 Wolf discussion' },
  'lobby.duration.voyante': { fr: '🔮 Voyante (consultation)', en: '🔮 Seer (card check)' },
  'lobby.duration.sorciere': { fr: '🧪 Sorcière (potions)', en: '🧪 Witch (potions)' },
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
  'voiceChat.details': { fr: 'Détails', en: 'Details' },
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
  'moderation.restartGameTitle': { fr: '🔄 Recommencer la partie', en: '🔄 Restart the game' },
  'moderation.restartGameHint': {
    fr: 'Interrompt la partie en cours pour tout le monde et ramène tout le groupe au salon, prêt à relancer (bug, litige, joueur à recadrer...).',
    en: "Ends the current game for everyone and brings the whole group back to the lobby, ready to relaunch (bug, dispute, player to rein in...).",
  },
  'moderation.restartGameButton': { fr: 'Recommencer la partie', en: 'Restart the game' },
  'moderation.restartConfirmTitle': { fr: 'Recommencer la partie ?', en: 'Restart the game?' },
  'moderation.restartConfirmMessage': {
    fr: 'La partie en cours s’arrête immédiatement pour tous les joueurs, qui reviennent au salon avec les mêmes rôles disponibles. Cette action est irréversible.',
    en: 'The current game stops immediately for all players, who return to the lobby with the same roles available. This action is irreversible.',
  },
  'moderation.restarting': { fr: 'Redémarrage...', en: 'Restarting...' },

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
    fr: '👻 Vous avez été éliminé — vous étiez {{role}}.',
    en: "👻 You've been eliminated — you were {{role}}.",
  },
  'game.eliminatedNoticeNoRole': {
    fr: '👻 Vous avez été éliminé.',
    en: "👻 You've been eliminated.",
  },
  // --- Popup de mort (DeathImpactModal.tsx, migration 0073) ------------------
  // Affichée juste après une élimination en cours de partie : montre
  // uniquement ce qui est DÉJÀ acquis (bonus d'impact), jamais le résultat
  // final (victoire/défaite) qui n'est connu qu'à la fin de la partie — voir
  // my_impact_preview / my_game_result dans types/game.ts.
  'deathImpact.title': { fr: '💀 Vous avez été éliminé(e)', en: '💀 You have been eliminated' },
  'deathImpact.role': { fr: 'Vous étiez {{role}}.', en: 'You were {{role}}.' },
  'deathImpact.noImpact': {
    fr: "Vous n'avez pas eu l'occasion de marquer la partie cette fois. Ce n'est que partie remise !",
    en: "You didn't get the chance to make your mark this time. There's always next game!",
  },
  'deathImpact.impactIntro': { fr: 'Déjà acquis, quel que soit le résultat final :', en: 'Already earned, whatever the final result:' },
  'deathImpact.pendingNote': {
    fr: 'Le résultat de la partie (victoire ou défaite) s’ajoutera à votre total dès qu’elle sera terminée.',
    en: "The game's outcome (win or loss) will be added to your total once it ends.",
  },
  'deathImpact.continue': { fr: 'Continuer', en: 'Continue' },
  'tierUp.eyebrow': { fr: 'Nouveau palier', en: 'New tier' },
  'tierUp.title': { fr: '🎉 Félicitations !', en: '🎉 Congratulations!' },
  'tierUp.subtitle': { fr: 'Vous êtes désormais {{tier}}', en: 'You are now {{tier}}' },
  'tierUp.unlockedIcons': { fr: 'Icônes débloquées', en: 'Icons unlocked' },
  'tierUp.unlockedFrame': {
    fr: 'Un nouveau cadre orne désormais votre avatar en partie, visible par tous les autres joueurs.',
    en: 'A new frame now adorns your avatar in-game, visible to every other player.',
  },
  'tierUp.continue': { fr: 'Continuer', en: 'Continue' },
  'impact.witch_heal': { fr: '🧪 Sauvetage réussi', en: '🧪 Successful save' },
  'impact.witch_poison_wolf': { fr: '☠️ Loup-Garou empoisonné', en: '☠️ Werewolf poisoned' },
  'impact.hunter_shot_wolf': { fr: '🏹 Tir décisif sur un Loup-Garou', en: '🏹 Decisive shot on a Werewolf' },
  'impact.seer_wolf_reveal': { fr: '🔮 Loup-Garou démasqué', en: '🔮 Werewolf unmasked' },
  'impact.seer_wolf_reveal_count': { fr: '🔮 Loups-Garous démasqués ({{count}})', en: '🔮 Werewolves unmasked ({{count}})' },
  'impact.ancien_extra_life': { fr: '👴 Résilience de l’Ancien', en: '👴 Elder’s resilience' },

  'game.yourRole': { fr: 'Votre rôle', en: 'Your role' },
  'role.wolfPack.title': { fr: 'Votre meute', en: 'Your pack' },
  'game.readyHint': {
    fr: 'Mémorisez bien votre rôle. Dès que tout le monde est prêt, la partie démarre immédiatement.',
    en: 'Make sure you remember your role. As soon as everyone is ready, the game starts immediately.',
  },
  'game.readyDone': { fr: 'Vous êtes prêt(e)', en: "You're ready" },
  'game.readyButton': { fr: 'Je suis prêt(e)', en: "I'm ready" },
  'game.seerVisionTitle': { fr: 'Vision de cette nuit', en: "Tonight's vision" },
  'game.seerVisionResult': { fr: '{{target}} est {{role}}.', en: '{{target}} is {{role}}.' },
  'game.logEmpty': { fr: 'Rien à signaler pour le moment.', en: 'Nothing to report yet.' },
  'game.callVoteHeading': { fr: 'Passage au vote', en: 'Move to vote' },
  'game.callVoteProgress': { fr: '{{agreed}}/{{total}} joueurs d’accord pour voter', en: '{{agreed}}/{{total}} players ready to vote' },
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
  'game.loverRevealTitle': { fr: '💘 Coup de foudre', en: '💘 Love at first sight' },
  'game.loverReveal': {
    fr: 'Cupidon a frappé : vous êtes amoureux(se) de {{name}}. Si l’un de vous meurt, l’autre en mourra de chagrin.',
    en: 'Cupid has struck: you are in love with {{name}}. If one of you dies, the other will die of heartbreak.',
  },
  'game.mentorRevealTitle': { fr: '🌱 Modèle choisi', en: '🌱 Chosen as a role model' },
  'game.mentorReveal': {
    fr: '{{name}} vous a choisi(e) comme mentor. Si vous mourez, {{name}} rejoindra les Loups-Garous par vengeance.',
    en: '{{name}} has chosen you as their role model. If you die, {{name}} will join the Werewolves out of revenge.',
  },
  'game.witchSavedMeTitle': { fr: '🧪 Sauvé(e) de justesse', en: '🧪 Saved just in time' },
  'game.witchSavedMe': {
    fr: 'Les Loups-Garous vous avaient choisi(e) comme victime cette nuit, mais la Sorcière vous a sauvé(e) avec sa potion de vie.',
    en: 'The Werewolves had chosen you as their victim tonight, but the Witch saved you with her life potion.',
  },
  'game.witchPoisonedMeTitle': { fr: '☠️ Empoisonné(e)', en: '☠️ Poisoned' },
  'game.witchPoisonedMe': {
    fr: 'La Sorcière vous a éliminé(e) cette nuit avec sa potion de mort.',
    en: 'The Witch eliminated you tonight with her death potion.',
  },
  'game.thiefStoleMyCardTitle': { fr: '🃏 Votre carte a été volée', en: '🃏 Your card was stolen' },
  'game.thiefStoleMyCard': {
    fr: 'Le Voleur vous a choisi(e) au hasard cette nuit et a échangé sa carte contre la vôtre. Votre nouveau rôle : {{role}}.',
    en: 'The Thief randomly picked you tonight and swapped their card for yours. Your new role: {{role}}.',
  },
  // Retour utilisateur (migration 0097) : confirmation pour le Voleur
  // lui-même, symétrique au message ci-dessus adressé à sa victime — avant
  // ça, il n'avait aucun retour après avoir cliqué "Voler une carte".
  'game.thiefIStoleTitle': { fr: '🃏 Votre vol est terminé', en: '🃏 Your theft is complete' },
  'game.thiefIStole': {
    fr: 'Vous avez volé la carte d’un joueur au hasard cette nuit et échangé la vôtre contre la sienne. Votre nouveau rôle : {{role}}.',
    en: 'You stole a random player’s card tonight and swapped yours for theirs. Your new role: {{role}}.',
  },
  // Bannière PUBLIQUE (tout le monde la voit, contrairement à
  // wildChildTurned ci-dessous qui reste personnelle) — retour utilisateur :
  // "il faut que tout le monde puisse être au courant qu'il y a eu un
  // changement" dans le total de loups. Ne nomme jamais qui (voir migration
  // 0100, wild_child_conversion_this_round) — affichée dans NightRecapModal
  // ET VoteRecapModal (le mentor peut mourir de nuit ou lynché de jour).
  'game.wildChildConversionPublicTitle': { fr: '🌑 Une ombre a changé de camp', en: '🌑 A shadow switched sides' },
  'game.wildChildConversionPublic': {
    fr: 'Un villageois a secrètement rejoint les Loups-Garous. Le nombre de loups a changé.',
    en: 'A villager has secretly joined the Werewolves. The wolf count has changed.',
  },
  'game.wildChildTurnedTitle': { fr: '🐺 Rongé(e) par la vengeance', en: '🐺 Consumed by revenge' },
  'game.wildChildTurned': {
    fr: 'Votre mentor est mort cette nuit. Rongé(e) par la vengeance, vous rejoignez désormais les Loups-Garous — personne d’autre que vous ne le sait.',
    en: 'Your role model died tonight. Consumed by revenge, you now join the Werewolves — no one else knows this.',
  },
  'game.alphaInfectedMeTitle': { fr: '🧬 Infecté(e) en secret', en: '🧬 Secretly infected' },
  'game.alphaInfectedMe': {
    fr: 'Le Loup Alpha vous a mordu(e) cette nuit. Vous rejoignez désormais les Loups-Garous — personne d’autre que vous ne le sait.',
    en: 'The Alpha Wolf bit you tonight. You now join the Werewolves — no one else knows this.',
  },
  'game.wolfNightRecapTitle': { fr: '🐺 Vote de la meute cette nuit', en: '🐺 Pack vote this night' },
  'game.wolfNightRecapInfect': { fr: 'a voté pour infecter', en: 'voted to infect' },
  'game.wolfNightRecapAbstain': { fr: 's’est abstenu(e)', en: 'abstained' },
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
  'game.endVillageExplain': {
    fr: 'Tous les Loups-Garous ont été démasqués et éliminés — {{survivors}} villageois ont survécu jusqu’au bout.',
    en: 'All the Werewolves were unmasked and eliminated — {{survivors}} villagers made it to the end.',
  },
  'game.endWolvesExplain': {
    fr: 'Les Loups-Garous ({{wolves}}) sont devenus aussi nombreux, voire plus, que le reste du village ({{others}}) : ils en prennent le contrôle.',
    en: 'The Werewolves ({{wolves}}) became as numerous as, or more numerous than, the rest of the village ({{others}}) : they take control.',
  },
  'game.endLoversExplain': {
    fr: 'Envers et contre tout, {{lover1}} et {{lover2}} sont les deux derniers survivants — leur amour l’emporte sur les deux camps.',
    en: 'Against all odds, {{lover1}} and {{lover2}} are the last two survivors — their love triumphs over both camps.',
  },
  // --- Section personnelle de l'écran de fin (EndScreen, migration 0073) -----
  // Détail du calcul de points pour CE joueur sur cette partie — lu depuis
  // my_game_result (game_results, permanent). "Résultat de la partie" =
  // points_gained - impact_bonus (survie + victoire/série/événement),
  // toujours calculable exactement par soustraction, sans avoir à stocker
  // séparément chaque composante.
  'game.myResultTitle': { fr: 'Tes points cette partie', en: 'Your points this game' },
  'game.myResultOutcome': { fr: 'Résultat de la partie', en: 'Game outcome' },
  'game.myResultOutcomeSurvival': { fr: '(survie {{percent}}% de la partie)', en: '(survived {{percent}}% of the game)' },
  'game.myResultImpactLabel': { fr: 'Bonus d’impact', en: 'Impact bonus' },
  'game.myResultTotal': { fr: 'Total', en: 'Total' },
  'game.myResultNewTotal': { fr: 'Nouveau total', en: 'New total' },
  'game.myResultTierUp': { fr: '🎉 Nouveau palier !', en: '🎉 New tier!' },
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
  'nightStep.voleur': { fr: 'Le Voleur vole une carte...', en: 'The Thief is stealing a card...' },
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
  'action.voleur.title': { fr: 'Volez une carte au hasard', en: 'Steal a random card' },
  'action.voleur.subtitle': {
    fr: "Vous ne savez pas qui, ni ce qu'il ou elle a. Le serveur choisit et échange vos cartes.",
    en: "You don't know who, or what they have. The server picks and swaps your cards.",
  },
  'action.voleur.steal': { fr: 'Voler une carte', en: 'Steal a card' },
  'action.cupidon.title': { fr: 'Désignez les deux amoureux', en: 'Choose the two lovers' },
  'action.cupidon.subtitle': { fr: "Cette action n'a lieu que la première nuit.", en: 'This action only happens on the first night.' },
  'action.cupidon.confirm': { fr: 'Confirmer le couple', en: 'Confirm the couple' },
  'action.enfantSauvage.title': { fr: 'Choisissez votre mentor', en: 'Choose your mentor' },
  'action.enfantSauvage.subtitle': {
    fr: "Si ce joueur meurt, vous deviendrez un Loup-Garou. Cette action n'a lieu que la première nuit.",
    en: 'If this player dies, you will become a Werewolf. This action only happens on the first night.',
  },
  'action.enfantSauvage.confirm': { fr: 'Confirmer mon mentor', en: 'Confirm my mentor' },
  'action.voyante.title': { fr: "Sondez le camp d'un joueur", en: "Probe a player's side" },
  'action.voyante.pastVisions': { fr: 'Vos visions passées', en: 'Your past visions' },
  'action.voyante.confirm': { fr: 'Sonder ce joueur', en: 'Probe this player' },
  'action.griot.title': { fr: 'Choisissez qui observer', en: 'Choose who to watch' },
  'action.griot.subtitle': {
    fr: 'Vous apprendrez une trace de son action lors de la nuit précédente — jamais son rôle.',
    en: "You'll learn a trace of their action from the previous night — never their role.",
  },
  'action.griot.pastReveals': { fr: 'Vos observations passées', en: 'Your past observations' },
  'action.griot.confirm': { fr: 'Observer ce joueur', en: 'Watch this player' },
  'action.griot.nightLabel': { fr: 'Nuit {{night}}', en: 'Night {{night}}' },
  'griot.reveal.observed_card': { fr: "a observé la carte d'un autre joueur.", en: "observed another player's card." },
  'griot.reveal.watched_wolves': {
    fr: 'a observé discrètement les activités des loups.',
    en: "secretly watched the werewolves' activity.",
  },
  'griot.reveal.wolf_vote': {
    fr: 'a participé à la désignation de la victime des loups.',
    en: "took part in designating the werewolves' victim.",
  },
  'griot.reveal.used_power': { fr: "a utilisé l'un de ses pouvoirs.", en: 'used one of their powers.' },
  'griot.reveal.linked_lovers': {
    fr: 'a lié deux personnes par un lien amoureux.',
    en: 'bound two people together with a romantic link.',
  },
  'griot.reveal.swapped_role': {
    fr: 'a échangé sa carte de rôle avec une autre.',
    en: 'swapped their role card with another.',
  },
  'griot.reveal.chose_mentor': {
    fr: 'a choisi secrètement un mentor à observer.',
    en: 'secretly chose a mentor to watch over.',
  },
  'griot.reveal.no_action': {
    fr: "n'a effectué aucune action particulière durant la nuit.",
    en: 'took no particular action during the night.',
  },
  'action.wolf.title': { fr: 'Choisissez votre victime', en: 'Choose your victim' },
  'action.wolf.subtitle': { fr: 'Concertez-vous avec votre meute.', en: 'Coordinate with your pack.' },
  // Refonte en assistant à 3 temps (retour utilisateur : "le choix entre
  // voter et infecter est perturbant, je ne suis pas sûr de mon choix") —
  // avant, le choix de cible et l'accord d'infection étaient deux blocs
  // affichés en même temps, avec un envoi immédiat au clic sur un joueur :
  // rien ne distinguait clairement "je vote pour éliminer" de "je vote pour
  // infecter", et aucune confirmation n'était demandée avant l'envoi. Refait
  // en 3 étapes explicites, façon assistant : 1) intention (éliminer ou
  // infecter), 2) victime, 3) pop-up récapitulatif à confirmer avant envoi —
  // même esprit que la Sorcière (ConfirmDialog déjà utilisé là-bas).
  'action.wolf.chooseIntentTitle': { fr: 'Que voulez-vous faire cette nuit ?', en: 'What do you want to do tonight?' },
  'action.wolf.intentEliminate': { fr: 'Éliminer', en: 'Eliminate' },
  'action.wolf.intentInfect': { fr: 'Infecter', en: 'Infect' },
  'action.wolf.changeIntent': { fr: '‹ changer', en: '‹ change' },
  'action.wolf.chooseTargetEliminateTitle': { fr: 'Qui éliminer ?', en: 'Who to eliminate?' },
  'action.wolf.confirmEliminateTitle': { fr: 'Confirmer l’élimination', en: 'Confirm elimination' },
  'action.wolf.confirmEliminateMessage': {
    fr: 'Vous êtes sur le point de désigner {{name}} pour être éliminé(e) cette nuit, si la majorité de la meute est d’accord.',
    en: 'You’re about to designate {{name}} to be eliminated tonight, if the pack majority agrees.',
  },
  'action.wolf.confirmButton': { fr: 'Confirmer', en: 'Confirm' },
  'action.wolf.confirmChoiceTitle': { fr: 'Éliminer ou infecter ?', en: 'Eliminate or infect?' },
  'action.wolf.confirmChoiceMessage': {
    fr: 'La meute a déjà la majorité pour infecter. Que voulez-vous faire de {{name}} cette nuit ?',
    en: 'The pack already has the majority to infect. What do you want to do to {{name}} tonight?',
  },
  'action.wolf.confirmInfectButton': { fr: 'Infecter {{name}}', en: 'Infect {{name}}' },
  'action.wolf.confirmEliminateButton': { fr: 'Éliminer {{name}}', en: 'Eliminate {{name}}' },
  'action.wolf.voteSummaryEliminate': {
    fr: '🩸 Vote enregistré : vous voulez éliminer {{name}}.',
    en: '🩸 Vote recorded: you want to eliminate {{name}}.',
  },
  // Loup simple ayant voté "Infecter" (migration 0108) : jamais de cible
  // de son côté, seul l'Alpha choisit qui — message dédié plutôt que
  // "abstenu" (techniquement vrai côté serveur — cible nulle — mais
  // trompeur : il n'a pas renoncé à agir, il a voté infecter).
  'action.wolf.voteSummaryInfectWaiting': {
    fr: '🧬 Vote enregistré : vous voulez infecter. Le Loup Alpha choisira qui.',
    en: '🧬 Vote recorded: you want to infect. The Alpha Wolf will choose who.',
  },
  'action.wolf.infectWaitingMessage': {
    fr: 'Ton vote a été enregistré. Rien d’autre à faire — le Loup Alpha choisira une cible une fois la majorité de la meute atteinte.',
    en: 'Your vote has been recorded. Nothing else to do — the Alpha Wolf will choose a target once the pack majority is reached.',
  },
  'action.wolf.editChoice': { fr: 'Modifier mon choix', en: 'Change my choice' },
  'action.wolf.packProgressTitle': { fr: 'Accord de la meute pour infecter', en: 'Pack agreement to infect' },
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
  // Refonte du Loup Alpha (migration 0093) : son vote pèse double dans
  // WolfPanel ci-dessus — affiché uniquement à lui-même.
  'action.wolf.alphaDoubleVoteHint': {
    fr: '👑 Votre vote de Loup Alpha compte double dans le dépouillement de la meute.',
    en: "👑 Your Alpha Wolf vote counts double in the pack's tally.",
  },
  'action.wolf.alphaInfectSectionSubtitle': {
    fr: "Si la majorité de la meute est d'accord, le Loup Alpha pourra infecter la victime pour la faire rejoindre les loups, au lieu de l'éliminer.",
    en: 'If the majority of the pack agrees, the Alpha Wolf will be able to infect the victim to make them join the wolves, instead of eliminating them.',
  },
  'action.wolf.alphaInfectProgress': {
    fr: '{{agreed}} / {{needed}} loups d’accord',
    en: '{{agreed}} / {{needed}} wolves agree',
  },
  'action.wolf.alphaConfirmInfectButton': { fr: "🧬 Confirmer l'infection", en: '🧬 Confirm infection' },
  'action.wolf.alphaConfirmInfectCancel': {
    fr: "🩸 Annuler l'infection, éliminer à la place",
    en: '🩸 Cancel infection, eliminate instead',
  },
  'action.wolf.alphaConfirmInfectHint': {
    fr: "En attente de la majorité de la meute avant de pouvoir infecter.",
    en: 'Waiting for the pack majority before you can infect.',
  },
  // Retour utilisateur : lors d'un test, la majorité a été atteinte mais
  // l'Alpha n'a jamais cliqué sur "Confirmer l'infection" avant la fin de
  // son tour — rien n'attirait l'œil au moment précis où le bouton devenait
  // cliquable, noyé sous le reste du panneau. Bannière bien visible,
  // affichée UNIQUEMENT pendant la fenêtre où une action est vraiment
  // possible (majorité atteinte, pas encore confirmé).
  'action.wolf.alphaConfirmInfectReady': {
    fr: '⚡ Majorité atteinte ! Vous pouvez confirmer l’infection ci-dessous.',
    en: '⚡ Majority reached! You can confirm the infection below.',
  },
  'action.wolf.alphaInfectConfirmedBanner': {
    fr: '🧬 Vous infecterez la victime désignée au lieu de l’éliminer.',
    en: "🧬 You'll infect the chosen victim instead of eliminating them.",
  },
  'action.wolf.alphaInfectUsedHint': {
    fr: 'Infection déjà utilisée cette partie — la meute ne peut plus qu’éliminer.',
    en: 'Infection already used this game — the pack can now only eliminate.',
  },
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
  // Réutilisée par VotePanel ET CaptainVotePanel (ActionPanel.tsx) : la
  // grille reste affichée après un premier vote (submit_vote/
  // submit_captain_vote font un upsert côté serveur) pour laisser le temps
  // de changer d'avis avant la fin du chrono — ce bandeau confirme que le
  // vote est bien enregistré pendant ce délai.
  'action.voteRecorded': {
    fr: 'Vote enregistré — tu peux encore le changer.',
    en: 'Vote recorded — you can still change it.',
  },
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
    fr: "Contrairement aux autres rôles, le Capitaine n'est pas un rôle secret : c'est un titre public, confié en plus du rôle tiré au sort (il garde son vrai rôle, loup-garou y compris). Il est élu par le village à la majorité relative juste avant la première nuit. Son vote compte ensuite pour deux voix lors du vote du village, ce qui peut suffire à faire pencher la balance en cas de partage des voix — mais si le total reste malgré tout à égalité, personne n'est éliminé ce jour-là, exactement comme une égalité sans Capitaine. À sa mort, il désigne son successeur parmi les joueurs encore en vie, dans son dernier souffle. Pendant le débat, il est aussi le seul à pouvoir lancer le vote avant la fin du temps imparti (5 minutes par défaut) — mais seulement si tous les joueurs encore en vie se sont déclarés d'accord.",
    en: "Unlike the other roles, the Captain isn't a secret role: it's a public title, granted on top of the role drawn at random (they keep their real role, werewolf included). They're elected by the village by relative majority just before the first night. Their vote then counts for two votes during the village vote, which can be enough to tip the balance when votes are split — but if the total still ends up tied, nobody is eliminated that day, exactly like any tie without a Captain. Upon their death, they name their successor among the players still alive, with their dying breath. During the discussion, they're also the only one who can call the vote before time runs out (5 minutes by default) — but only if every player still alive has agreed to it.",
  },
  'rules.victory.title': { fr: '🏆 Victoire', en: '🏆 Victory' },
  'rules.victory.text': {
    fr: 'Le Village gagne dès que tous les Loups-Garous sont éliminés. Les Loups-Garous gagnent s\'ils parviennent à égaler ou dépasser le nombre de villageois survivants. Cas particulier : si Cupidon a désigné deux Amoureux, ceux-ci gagnent ensemble s\'ils sont les deux derniers survivants, quel que soit leur camp d\'origine.',
    en: 'The Village wins as soon as all the Werewolves are eliminated. The Werewolves win if they manage to equal or outnumber the surviving villagers. Special case: if Cupid designated two Lovers, they win together if they are the last two survivors, regardless of their original side.',
  },

  // --- Page Aide (Help.tsx) ---------------------------------------------------
  'help.pageTitle': { fr: 'Aide', en: 'Help' },
  'help.subtitle': {
    fr: 'Tout ce qu\'il faut savoir pour jouer et progresser.',
    en: 'Everything you need to know to play and progress.',
  },
  'help.category.rules.subtitle': {
    fr: 'Objectif, déroulement, rôles, capitaine, victoire.',
    en: 'Objective, flow, roles, captain, victory.',
  },
  'help.category.ranking.title': { fr: '🏆 Classements & Progression', en: '🏆 Rankings & Progression' },
  'help.category.ranking.subtitle': {
    fr: 'Comment gagner des points, monter de palier et grimper au classement.',
    en: 'How to earn points, climb tiers, and rise up the leaderboard.',
  },
  'help.ranking.intro': {
    fr: 'Chaque partie terminée fait évoluer tes points de rang : une victoire en rapporte, une défaite en retire. Ces points déterminent ton palier et ta position dans le classement.',
    en: 'Every finished game moves your rank points: a win earns some, a loss costs some. These points determine your tier and your position on the leaderboard.',
  },
  'help.ranking.points.title': { fr: '⚔️ Comment gagner des points', en: '⚔️ How points are earned' },
  'help.ranking.points.text': {
    fr: 'Victoire : jusqu\'à +30 points, selon la part de la partie que tu as survécue (mourir tôt réduit le gain, mais jamais en dessous de 40% même à la nuit 1), plus un bonus si tu enchaînes plusieurs victoires d\'affilée (+10 par victoire consécutive au-delà de la première, jusqu\'à +50 à partir d\'une série de 6). Défaite : -15 points — mais jamais en dessous du palier le plus haut que tu as déjà atteint.',
    en: 'Win: up to +30 points, based on how much of the game you survived (dying early reduces the gain, but never below 40% even on night 1), plus a bonus for consecutive wins (+10 per win in a row beyond the first, up to +50 from a streak of 6). Loss: -15 points — but never below the highest tier you\'ve already reached.',
  },
  'help.ranking.impact.title': { fr: '🎯 Bonus d’impact', en: '🎯 Impact bonus' },
  'help.ranking.impact.text': {
    fr: 'Certains gestes marquants rapportent des points supplémentaires — que tu gagnes ou perdes la partie, dès l’instant où le geste porte ses fruits :',
    en: 'Some standout actions earn extra points — whether you win or lose the game, as soon as the action pays off:',
  },
  'help.ranking.impact.seerNote': { fr: '(jusqu’à 2 fois par partie)', en: '(up to 2 times per game)' },
  'help.ranking.tiers.title': { fr: '🎖️ Les paliers', en: '🎖️ Tiers' },
  'help.ranking.tiers.text': {
    fr: 'Tes points te placent dans un palier, du plus modeste au plus prestigieux :',
    en: 'Your points place you in a tier, from the most modest to the most prestigious:',
  },
  'help.ranking.tiers.fromPoints': { fr: 'à partir de {{points}} pts', en: 'from {{points}} pts' },
  'help.ranking.leaderboard.title': { fr: '🌍 Classement mondial & continental', en: '🌍 Global & continental leaderboard' },
  'help.ranking.leaderboard.text': {
    fr: 'À partir de 3 parties jouées, tu apparais dans le classement mondial — et dans celui de ton continent si tu l\'as renseigné dans Mon compte. Le classement continental ne s\'affiche que s\'il y a au moins 3 joueurs éligibles sur ce continent.',
    en: 'Once you\'ve played 3 games, you appear on the global leaderboard — and on your continent\'s leaderboard if you\'ve set it in My account. The continental leaderboard only shows once at least 3 players on that continent are eligible.',
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
  // Icônes verrouillées tant qu'un palier de rang n'est pas atteint (voir
  // AVATAR_ICON_MIN_POINTS, lib/avatars.ts, et avatar_icon_min_points côté
  // serveur, migration 0074) — grisées avec un cadenas plutôt que masquées :
  // ça donne un objectif visible ("encore X points") plutôt qu'une liste qui
  // s'allonge sans prévenir.
  'account.profile.iconLocked': { fr: 'Se débloque à {{points}} points de rang (palier {{tier}}).', en: 'Unlocks at {{points}} rank points ({{tier}} tier).' },
  'account.profile.iconLockedShort': { fr: '🔒 {{points}} pts', en: '🔒 {{points}} pts' },
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
  'account.continent.title': { fr: 'Continent', en: 'Continent' },
  'account.continent.description': {
    fr: 'Utilisé pour le classement par continent — facultatif.',
    en: 'Used for the continental leaderboard — optional.',
  },
  'account.continent.none': { fr: 'Non renseigné', en: 'Not set' },
  'notifPrompt.title': { fr: 'Reste informé', en: 'Stay in the loop' },
  'notifPrompt.subtitle': {
    fr: 'Active les notifications pour être prévenu quand un ami t’invite à une partie. Modifiable à tout moment dans Mon compte.',
    en: 'Enable notifications to know when a friend invites you to a game. Changeable anytime in My Account.',
  },
  'notifPrompt.later': { fr: 'Plus tard', en: 'Later' },
  'notifPrompt.enable': { fr: 'Activer', en: 'Enable' },
  'dailyStreak.newHeadline': { fr: 'Série de connexion activée !', en: 'Login streak started!' },
  'dailyStreak.newSub': {
    fr: 'Reviens chaque jour pour la faire grandir, même sans gagner.',
    en: 'Come back every day to grow it — winning is not required.',
  },
  'dailyStreak.headline': { fr: 'Content de te revoir !', en: 'Welcome back!' },
  'dailyStreak.sub': { fr: 'Reviens demain pour continuer la série.', en: 'Come back tomorrow to keep it going.' },
  'dailyStreak.milestoneHeadline': { fr: 'Série de {{count}} jours !', en: '{{count}}-day streak!' },
  'dailyStreak.milestoneSub': { fr: 'Ta plus longue série jusqu’ici.', en: 'Your longest streak yet.' },
  'dailyStreak.days': { fr: 'jours', en: 'days' },
  'reward.title': { fr: 'Coffre de fin de partie', en: 'End-of-game chest' },
  'reward.subtitle': { fr: 'Une chance de bonus, à chaque partie.', en: 'A chance at a bonus, every game.' },
  'reward.open': { fr: 'Ouvrir le coffre', en: 'Open the chest' },
  'reward.opening': { fr: 'Ouverture…', en: 'Opening…' },
  'reward.won': { fr: '+{{points}} points bonus !', en: '+{{points}} bonus points!' },
  'reward.empty': { fr: 'Rien cette fois. Retente au prochain match !', en: 'Nothing this time. Try again next match!' },
  'reward.alreadyClaimed': { fr: 'Coffre déjà ouvert pour cette partie.', en: 'Chest already opened for this game.' },
  'friendsOnline.title': { fr: 'Amis en ligne ({{count}})', en: 'Friends online ({{count}})' },
  'friendsOnline.inGame': { fr: 'en partie', en: 'in a game' },
  'friendsOnline.idle': { fr: 'disponible', en: 'available' },
  'quest.title': { fr: 'Quêtes du jour', en: 'Daily quests' },
  'quest.claim': { fr: 'Réclamer (+{{points}})', en: 'Claim (+{{points}})' },
  'account.notifications.title': { fr: 'Notifications', en: 'Notifications' },
  'account.notifications.description': {
    fr: 'Reçois une alerte quand c’est ton tour de jouer ou qu’un ami te lance une invitation.',
    en: 'Get alerted when it’s your turn to play or a friend invites you to a game.',
  },
  'account.notifications.installIntro': {
    fr: 'Sur iPhone/iPad, ajoute d’abord le jeu à ton écran d’accueil :',
    en: 'On iPhone/iPad, add the game to your home screen first:',
  },
  'account.notifications.installStep1': {
    fr: 'Appuie sur le bouton Partager ⬆️ dans Safari',
    en: 'Tap the Share button ⬆️ in Safari',
  },
  'account.notifications.installStep2': {
    fr: 'Choisis « Sur l’écran d’accueil », puis rouvre le jeu depuis cette icône (pas depuis Safari)',
    en: 'Choose “Add to Home Screen”, then reopen the game from that icon (not from Safari)',
  },
  'account.notifications.enable': { fr: 'Activer', en: 'Enable' },
  'account.notifications.disable': { fr: 'Désactiver', en: 'Disable' },
  'account.notifications.testButton': { fr: 'Envoyer un test', en: 'Send a test' },
  'account.notifications.testing': { fr: 'Envoi...', en: 'Sending...' },
  'account.notifications.testSent': { fr: 'Notification de test envoyée ✅', en: 'Test notification sent ✅' },
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
  'account.danger.cancelButton': { fr: 'Annuler ma demande', en: 'Cancel my request' },
  'account.danger.cancelling': { fr: 'Annulation...', en: 'Cancelling...' },

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
    fr: 'Basé sur le rang (points), à partir de 3 parties terminées.',
    en: 'Based on rank (points), from 3 completed games onward.',
  },
  'stats.leaderboard.empty': {
    fr: "Pas encore assez de parties jouées sur l'ensemble des comptes pour établir un classement.",
    en: 'Not enough games played across all accounts yet to establish a leaderboard.',
  },
  'stats.leaderboard.global': { fr: 'Mondial', en: 'Global' },
  'stats.leaderboard.continent': { fr: 'Continent', en: 'Continent' },
  'stats.leaderboard.noContinent': {
    fr: 'Choisissez votre continent dans "Mon compte" pour apparaître dans ce classement.',
    en: 'Choose your continent in "My account" to appear in this leaderboard.',
  },
  'stats.rank.points': { fr: '{{points}} points', en: '{{points}} points' },
  'stats.rank.nextTier': {
    fr: 'Encore {{points}} points avant {{tier}}',
    en: '{{points}} more points until {{tier}}',
  },
  'stats.rank.firstTier': { fr: 'Début', en: 'Start' },
  'stats.rank.maxTier': { fr: 'Max', en: 'Max' },
  'stats.rank.streak': { fr: '{{count}} victoires d’affilée', en: '{{count}}-game win streak' },
  // Titres de volume (voir lib/volumeTitles.ts, migration 0074) : liés au
  // nombre de parties JOUÉES, indépendants des points de rang — un joueur
  // assidu débloque quelque chose même sans forcément gagner.
  'volume.title.recrue': { fr: 'Recrue', en: 'Recruit' },
  'volume.title.habitue': { fr: 'Habitué du village', en: 'Village regular' },
  'volume.title.pilier': { fr: 'Pilier du village', en: 'Village pillar' },
  'volume.title.veteran': { fr: 'Vétéran', en: 'Veteran' },
  'volume.title.legende_assidue': { fr: 'Légende assidue', en: 'Devoted legend' },
  'stats.volume.label': { fr: 'Titre d’assiduité', en: 'Dedication title' },
  'stats.volume.nextTitle': { fr: 'encore {{count}} partie{{s}} avant « {{title}} »', en: '{{count}} more game{{s}} to reach “{{title}}”' },
  'stats.volume.maxTitle': { fr: 'Titre le plus élevé atteint', en: 'Highest title reached' },
  'stats.rank.globalPosition': { fr: '#{{position}} mondial', en: '#{{position}} global' },
  'stats.rank.continentPosition': { fr: '#{{position}} continent', en: '#{{position}} continent' },
  // Noms de paliers volontairement distincts des noms de rôles (role.villageois
  // .name, role.chasseur.name, role.ancien.name) : les ids internes
  // ('villageois', 'chasseur', 'ancien', voir RANK_TIERS) sont restés
  // identiques pour ne rien casser côté serveur, mais avant cette réécriture
  // les LIBELLÉS affichés étaient mot pour mot les mêmes que ceux des rôles
  // jouables — un joueur au palier "Chasseur" pouvait croire que ça parlait
  // du rôle Chasseur qu'il vient de jouer. D'où Apprenti/Apprentice,
  // Éclaireur/Scout, Doyen/Veteran plutôt que Villageois/Villager,
  // Chasseur/Hunter, Ancien/Elder.
  'rank.tier.nouveau_venu': { fr: 'Nouveau Venu', en: 'Newcomer' },
  'rank.tier.villageois': { fr: 'Apprenti', en: 'Apprentice' },
  'rank.tier.chasseur': { fr: 'Éclaireur', en: 'Scout' },
  'rank.tier.ancien': { fr: 'Doyen', en: 'Veteran' },
  'rank.tier.sage': { fr: 'Sage du Village', en: 'Village Sage' },
  'rank.tier.legende': { fr: 'Légende du Village', en: 'Village Legend' },

  // --- Pop-up choix du continent (ContinentPrompt.tsx) ------------------------
  'continentPrompt.title': { fr: 'Choisis ton continent', en: 'Choose your continent' },
  'continentPrompt.subtitle': {
    fr: 'Pour apparaître dans le classement par continent, en plus du classement mondial. Modifiable à tout moment depuis "Mon compte".',
    en: 'To appear in the continental leaderboard, in addition to the global one. Changeable anytime from "My account".',
  },
  'continentPrompt.skip': { fr: 'Plus tard', en: 'Later' },

  // --- Menu compte (AccountMenu.tsx) ------------------------------------------
  'accountMenu.help': { fr: 'Aide', en: 'Help' },
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
  'playerProfile.acceptRequest': { fr: 'Accepter la demande', en: 'Accept request' },
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
  'publicGames.playerCount': { fr: '{{count}}/25 joueurs', en: '{{count}}/25 players' },
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
    fr: 'Email confirmé ! Bienvenue.',
    en: 'Email confirmed! Welcome.',
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
  // Bouton d'action du modérateur, distinct du simple indicateur 🎤/🔇 déjà
  // affiché pour chaque joueur (voir p.audioOn) : avant, les deux étaient un
  // même emoji 🔇 côte à côte, difficile à distinguer entre "statut actuel"
  // et "bouton pour couper" — retour utilisateur. Désormais un vrai bouton
  // texte tant que le micro est actif, remplacé par une étiquette figée une
  // fois coupé (jamais de retour en arrière, voir muteParticipant).
  'voiceChat.muteAction': { fr: 'Couper', en: 'Mute' },
  'voiceChat.mutedTag': { fr: 'Coupé', en: 'Muted' },
  // Avertissement affiché au joueur lui-même dès que son micro est coupé à
  // distance par le modérateur (voir forcedMuteNotice, useVoiceChat.ts) —
  // avant ce correctif, rien ne le lui indiquait : son propre bouton
  // continuait d'afficher "Actif" alors que plus personne ne l'entendait.
  'voiceChat.mutedByModeratorNotice': {
    fr: '🔇 Le modérateur a coupé votre micro. Cliquez sur le bouton micro quand vous voulez reparler.',
    en: '🔇 The moderator muted your microphone. Tap the mic button whenever you want to speak again.',
  },
  'voiceChat.soundOnTitle': { fr: 'Couper le son (ne plus entendre les autres)', en: 'Mute sound (stop hearing others)' },
  'voiceChat.soundOffTitle': { fr: 'Rétablir le son', en: 'Restore sound' },
  'voiceChat.you': { fr: 'Moi', en: 'Me' },
  'voiceChat.selfPillHint': {
    fr: 'Ton propre micro — s’allume en vert quand ta voix est captée, pour vérifier que les autres te reçoivent.',
    en: 'Your own microphone — turns green when your voice is picked up, so you can check others can hear you.',
  },
  'game.extendTimeTitle': { fr: 'Prolonger le débat de 30s', en: 'Extend the debate by 30s' },
  'chat.replyTo': { fr: 'Répondre', en: 'Reply' },
  'chat.replyingTo': { fr: 'Réponse à', en: 'Replying to' },
  'chat.repliedMessageUnavailable': { fr: 'Message d’origine indisponible', en: 'Original message unavailable' },
  'chat.addReaction': { fr: 'Réagir', en: 'React' },
  'lobby.gameStartedNotifTitle': { fr: '🐺 La partie commence !', en: '🐺 The game is starting!' },
  'lobby.gameStartedNotifBody': { fr: 'Rejoignez le salon, la distribution des rôles a commencé.', en: 'Join now, roles are being handed out.' },
  'lobby.inviteMessage': {
    fr: 'Rejoins ma partie de Loup Garou d’Afrique ! 🐺 Code : {{code}} — {{link}}',
    en: 'Join my Loup Garou d’Afrique game! 🐺 Code: {{code}} — {{link}}',
  },

  // --- Journal de partie (game_log) ------------------------------------------
  // Signalement utilisateur : "le game log dans la partie n'est pas traduit en
  // anglais". Les messages sont générés en français côté SQL (game_log.message,
  // historique de ~84 migrations) — les retraduire tous en base demanderait de
  // retoucher ~22 fonctions du moteur de jeu, un risque disproportionné sur une
  // partie en cours avec de vrais joueurs. Solution retenue : une couche de
  // reconnaissance de motifs côté client (voir lib/gameLogTranslate.ts) qui
  // reconnaît les phrases françaises connues et les restitue via ces clés —
  // le français d'origine reste affiché tel quel si aucun motif ne correspond
  // (dégradation sans casse, jamais un message vide ou une erreur).
  'gameLog.nightFalls': { fr: '🌙 La nuit {{n}} tombe sur le village. Tout le monde ferme les yeux...', en: '🌙 Night {{n}} falls on the village. Everyone closes their eyes...' },
  'gameLog.villageWins': { fr: '🌞 Le village a éliminé tous les Loups-Garous. Le village gagne !', en: '🌞 The village has eliminated every Werewolf. The village wins!' },
  'gameLog.wolvesWin': { fr: '🐺 Les Loups-Garous ont dévoré assez de villageois pour prendre le contrôle. Les loups gagnent !', en: '🐺 The Werewolves have devoured enough villagers to take control. The wolves win!' },
  'gameLog.loversWin': { fr: '💘 Il ne reste que les deux amoureux... L’amour triomphe !', en: '💘 Only the two lovers remain... Love triumphs!' },
  'gameLog.playerJoined': { fr: '{{name}} a rejoint la partie.', en: '{{name}} joined the game.' },
  'gameLog.playerKicked': { fr: '{{name}} a été retiré(e) du salon par l’hôte.', en: '{{name}} was removed from the room by the host.' },
  'gameLog.playerLeft': { fr: '{{name}} a quitté le salon.', en: '{{name}} left the room.' },
  'gameLog.gameStoppedByAdmin': { fr: 'La partie a été arrêtée par un administrateur.', en: 'The game was stopped by an administrator.' },
  'gameLog.gameCreated': { fr: 'La partie a été créée. En attente des joueurs...', en: 'The game has been created. Waiting for players...' },
  'gameLog.ancienSurvives': { fr: '{{name}} (Ancien) encaisse l’attaque des Loups-Garous et s’accroche à la vie !', en: '{{name}} (Elder) takes the Werewolves’ attack and clings to life!' },
  'gameLog.ancienLynchedPowersOff': {
    fr: '⚖️ Le village a eu tort de lyncher l’Ancien : ses pouvoirs spéciaux s’éteignent pour le reste de la partie...',
    en: '⚖️ The village was wrong to lynch the Elder: its special powers are extinguished for the rest of the game...',
  },
  'gameLog.wildChildConverted': {
    fr: '🌑 Une ombre a changé de camp cette nuit... un villageois a secrètement rejoint les Loups-Garous.',
    en: '🌑 A shadow switched sides tonight... a villager secretly joined the Werewolves.',
  },
  'gameLog.alphaInfectionSpread': {
    fr: '🧬 Une infection s\'est propagée cette nuit... un villageois a secrètement rejoint les Loups-Garous.',
    en: '🧬 An infection spread tonight... a villager secretly joined the Werewolves.',
  },
  'gameLog.captainDyingSuccession': { fr: '{{name}} était le Capitaine : il ou elle désigne son successeur dans son dernier souffle.', en: '{{name}} was the Captain: with their last breath, they name a successor.' },
  'gameLog.deathLine': { fr: '{{name}} ({{role}}) {{cause}}', en: '{{name}} ({{role}}) {{cause}}' },
  'gameLog.death.loup_garou': { fr: 'a été dévoré par les Loups-Garous cette nuit.', en: 'was devoured by the Werewolves tonight.' },
  'gameLog.death.sorciere': { fr: 'a été empoisonné par la Sorcière cette nuit.', en: 'was poisoned by the Witch tonight.' },
  'gameLog.death.chagrin': { fr: 'est mort de chagrin, son amoureux ayant péri.', en: 'died of grief after their lover perished.' },
  'gameLog.death.chasseur': { fr: 'a été abattu par le Chasseur.', en: 'was shot by the Hunter.' },
  'gameLog.death.vote': { fr: 'a été éliminé par le vote du village.', en: 'was eliminated by the village vote.' },
  'gameLog.death.petite_fille_surprise': { fr: 'a été surprise en train d’espionner les loups... et en a payé le prix.', en: 'was caught spying on the wolves... and paid the price.' },
  'gameLog.death.parti': { fr: 'a quitté la partie.', en: 'left the game.' },
  'gameLog.death.exclu': { fr: 'a été exclu(e) de la partie par l’hôte.', en: 'was removed from the game by the host.' },
  'gameLog.death.default': { fr: 'est mort.', en: 'died.' },
  'gameLog.captainElected': { fr: '🎖️ {{name}} est élu(e) Capitaine du village !', en: '🎖️ {{name}} is elected Captain of the village!' },
  'gameLog.captainElectionNoVotes': {
    fr: '🗳️ Aucun vote exprimé pour l’élection du Capitaine : la partie se jouera sans lui.',
    en: '🗳️ No votes cast for the Captain election: the game will go on without one.',
  },
  'gameLog.witchHealed': { fr: '🧪 La Sorcière a utilisé sa potion de guérison pour sauver la victime des loups.', en: '🧪 The Witch used her healing potion to save the wolves’ victim.' },
  'gameLog.noOneDiedTonight': { fr: '☀️ Le village se réveille : personne n’est mort cette nuit !', en: '☀️ The village wakes up: no one died last night!' },
  'gameLog.restartSameGroup': { fr: '🔄 Une nouvelle partie va commencer avec le même groupe !', en: '🔄 A new game is about to start with the same group!' },
  'gameLog.rolesDistributed': { fr: '🎭 Les rôles ont été distribués en secret. Regardez votre carte...', en: '🎭 Roles have been secretly handed out. Check your card...' },
  'gameLog.captainSuccession': { fr: '🎖️ {{name}} devient le nouveau Capitaine.', en: '🎖️ {{name}} becomes the new Captain.' },
  'gameLog.cupidonArrows': { fr: '💘 Cupidon a décoché ses flèches...', en: '💘 Cupid has loosed his arrows...' },
  'gameLog.wildChildChoseMentor': { fr: '🐾 L’Enfant Sauvage a choisi son mentor en secret.', en: '🐾 The Wild Child has secretly chosen their mentor.' },
  'gameLog.hunterNoShot': { fr: '{{name}} (Chasseur) choisit de ne tirer sur personne.', en: '{{name}} (Hunter) chooses not to shoot anyone.' },
  'gameLog.mayorSuccession': { fr: '🏛️ {{name}} devient le nouveau Maire.', en: '🏛️ {{name}} becomes the new Mayor.' },
  'gameLog.witchChoseSecret': { fr: '🧪 La Sorcière a fait son choix en secret.', en: '🧪 The Witch has secretly made her choice.' },
  'gameLog.thiefChoseSecret': { fr: '🃏 Le Voleur a fait son choix en secret.', en: '🃏 The Thief has secretly made their choice.' },
  'gameLog.seerScried': { fr: '🔮 La Voyante a sondé un joueur en secret.', en: '🔮 The Seer has secretly scried a player.' },
  'gameLog.captainElectionCall': { fr: '🎖️ Élisez votre Capitaine avant que la nuit ne tombe !', en: '🎖️ Elect your Captain before night falls!' },
  'gameLog.hunterTimeout': { fr: '{{name}} (Chasseur) n’a pas tiré à temps.', en: '{{name}} (Hunter) didn’t shoot in time.' },
  'gameLog.captainRandomSuccessor': {
    fr: '🎖️ Personne n’a désigné de successeur à temps : le sort en a décidé — {{name}} devient le nouveau Capitaine !',
    en: '🎖️ No one named a successor in time: fate has decided — {{name}} becomes the new Captain!',
  },
  'gameLog.captainSuccessionTimeout': {
    fr: '{{name}} (ancien Capitaine) n’a pas désigné de successeur à temps : le titre est perdu.',
    en: '{{name}} (former Captain) didn’t name a successor in time: the title is lost.',
  },
  'gameLog.debateOpen': { fr: '💬 Le village débat. Qui soupçonnez-vous ?', en: '💬 The village is debating. Who do you suspect?' },
  'gameLog.voteOpen': { fr: '🗳️ Le vote est ouvert !', en: '🗳️ Voting is open!' },
  'gameLog.voteNoVotes': { fr: '🗳️ Aucun vote exprimé : personne n’est éliminé aujourd’hui.', en: '🗳️ No votes cast: no one is eliminated today.' },
  'gameLog.voteTie': { fr: '🗳️ Égalité des voix : personne n’est éliminé aujourd’hui.', en: '🗳️ Tied vote: no one is eliminated today.' },
  // "de la majorité" (pas "de tout le village") depuis la migration 0086 :
  // le seuil est passé de l'unanimité à la majorité stricte des autres
  // joueurs vivants (demande utilisateur : pas besoin d'attendre tout le
  // monde).
  'gameLog.captainCallsVote': { fr: '🎖️ {{name}} (Capitaine) lance le vote, avec l’accord de la majorité du village !', en: '🎖️ {{name}} (Captain) calls the vote, with the village’s majority agreement!' },
  // Nouveau message (voir submit_host_call_vote, migration 0085) : pendant du
  // précédent pour une partie SANS Capitaine — l'hôte lance le vote une fois
  // que la majorité des autres joueurs vivants sont d'accord.
  'gameLog.hostCallsVote': { fr: '🛠️ {{name}} (Modérateur) lance le vote, avec l’accord de la majorité du village !', en: '🛠️ {{name}} (Moderator) calls the vote, with the village’s majority agreement!' },

  // --- Vote forcé par le modérateur (sans Capitaine) -------------------------
  'game.hostCallVoteButton': { fr: 'Lancer le vote', en: 'Call the vote' },
  'game.hostCallVoteButtonWaiting': { fr: 'En attente du village...', en: 'Waiting for the village...' },
} as const satisfies Record<string, Record<Lang, string>>

export type TranslationKey = keyof typeof translations
