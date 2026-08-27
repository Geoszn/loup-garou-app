# Loup Garou d'Afrique

Application web (mobile + desktop) pour jouer au Loup Garou à distance. L'application fait office de meneur de jeu : elle distribue les rôles, gère automatiquement le passage jour/nuit, réveille chaque rôle au bon moment et déclare le vainqueur.

- **Frontend** : React + TypeScript + Vite + Tailwind CSS
- **Backend** : [Supabase](https://supabase.com) (Postgres + Auth avec validation par email + Realtime)
- **Comptes** : inscription par email, obligatoire, avec validation du lien reçu par mail
- **Parties** : jusqu'à 25 joueurs, créées avec un code à 6 caractères + lien d'invitation

Aucun serveur à gérer soi-même : toute la logique de jeu (répartition des rôles, résolution des nuits, votes, victoire) tourne dans des fonctions Postgres sécurisées côté Supabase, donc impossible pour un joueur de tricher en lisant le code source du site.

---

## 1. Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com) → **New project** (le plan gratuit suffit largement).
2. Une fois le projet créé, ouvrez **SQL Editor** dans le menu de gauche.
3. Exécutez **tous les fichiers du dossier `supabase/migrations/`, dans l'ordre numérique** (`0001_...sql`, `0002_...sql`, etc. — le nom de fichier suffit à les trier, pas besoin de liste à jour ici : il y en a désormais plus de 50, une liste figée dans ce README serait obsolète dès la migration suivante).

   Copiez-collez le **contenu** de chaque fichier (pas son nom) dans l'éditeur SQL et cliquez sur **Run**, un fichier après l'autre.

   *(Beaucoup plus fiable : la CLI Supabase, qui applique automatiquement tout ce qui manque, dans le bon ordre, sans risque de sauter ou de rejouer un fichier par erreur — voir [section 9](#9-outils-pour-les-développeurs).)*

4. Allez dans **Authentication → Providers → Email** et vérifiez que **Confirm email** est activé (c'est le comportement par défaut). C'est ce qui oblige chaque joueur à valider son adresse avant de pouvoir jouer.
5. Toujours dans **Authentication → URL Configuration** :
   - **Site URL** : mettez l'URL de votre site une fois déployé (ex. `https://votre-app.vercel.app`). En attendant, `http://localhost:5173` fonctionne pour tester en local.
   - **Redirect URLs** : ajoutez la même URL (et `http://localhost:5173/**` pour le développement local).
6. Dans **Project Settings → API**, notez :
   - **Project URL**
   - **anon public key**

---

## 2. Configurer le frontend

```bash
cd loup-garou-app
cp .env.example .env
```

Éditez `.env` et collez vos valeurs Supabase :

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Puis installez les dépendances et lancez le serveur de développement :

```bash
npm install
npm run dev
```

Ouvrez `http://localhost:5173`. Créez un compte avec un vrai email pour recevoir le lien de confirmation.

**Pour tester une partie à plusieurs joueurs en local** : ouvrez plusieurs fenêtres de navigation privée (ou plusieurs navigateurs), inscrivez un compte différent dans chacune, et rejoignez la même partie avec le code affiché dans le salon d'attente.

---

## 3. Déployer en production

Le plus simple est [Vercel](https://vercel.com) (gratuit) :

1. Poussez le dossier `loup-garou-app` sur un dépôt GitHub.
2. Sur Vercel : **New Project** → importez le dépôt.
3. Framework preset : **Vite**. Build command : `npm run build`. Output directory : `dist`.
4. Dans les **Environment Variables** du projet Vercel, ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
5. Déployez. Une fois l'URL obtenue, retournez dans Supabase → **Authentication → URL Configuration** et mettez à jour **Site URL** / **Redirect URLs** avec cette URL de production.

Netlify fonctionne aussi de façon quasi identique (build command `npm run build`, publish directory `dist`).

---

## 4. Configurer le chat vocal (Daily.co)

Le vocal du village et du cimetière passe par [Daily.co](https://daily.co), qui offre 10 000 minutes/mois gratuites — largement suffisant pour jouer entre amis.

1. Créez un compte gratuit sur [dashboard.daily.co/signup](https://dashboard.daily.co/signup).
2. Dans le tableau de bord Daily → **Developers**, copiez votre **API key**.
3. Ajoutez-la comme variable d'environnement sur Vercel (depuis le dossier `loup-garou-app`) :
   ```bash
   npx vercel env add DAILY_API_KEY production
   ```
   Collez la clé quand demandé.
4. Redéployez pour que la clé soit prise en compte :
   ```bash
   npx vercel --prod
   ```

⚠️ Cette clé ne doit **jamais** être mise dans `.env` ni dans `VITE_...` — elle reste strictement côté serveur (dans `api/daily-room.ts`, une fonction Vercel), sinon n'importe qui pourrait créer des salons vocaux avec votre compte.

En local (`npm run dev`), le vocal ne fonctionnera pas car il n'y a pas de fonction serverless qui tourne — c'est normal, testez le vocal uniquement sur le site déployé.

---

## 5. Voix du narrateur (ElevenLabs)

Par défaut, le narrateur utilise la synthèse vocale gratuite du navigateur (robotique mais fonctionnelle). Pour une voix bien plus réaliste et dramatique, l'app passe par [ElevenLabs](https://elevenlabs.io), dont l'offre gratuite (~10 000 caractères/mois, largement suffisant pour animer plusieurs parties) suffit pour ce narrateur.

1. Créez un compte gratuit sur [elevenlabs.io/app/sign-up](https://elevenlabs.io/app/sign-up).
2. Dans **Settings → API Keys**, créez une clé API et copiez-la.
3. *(Optionnel)* Dans la [bibliothèque de voix](https://elevenlabs.io/app/voice-library), choisissez une voix qui vous plaît pour le ton "meneur de jeu" et copiez son **Voice ID** (sinon une voix par défaut est utilisée).
4. Ajoutez la clé comme variable d'environnement sur Vercel (depuis le dossier `loup-garou-app`) :
   ```bash
   npx vercel env add ELEVENLABS_API_KEY production
   # optionnel, si vous avez choisi une voix différente :
   npx vercel env add ELEVENLABS_VOICE_ID production
   ```
5. Redéployez :
   ```bash
   npx vercel --prod
   ```

⚠️ Comme pour Daily.co, cette clé ne doit **jamais** être mise dans `.env` ni dans `VITE_...` — elle reste strictement côté serveur (`api/narrator-voice.ts`).

Si la clé n'est pas configurée, ou si le quota gratuit mensuel est épuisé, l'app bascule **automatiquement et silencieusement** sur la voix du navigateur : la narration ne casse jamais, elle est juste moins belle.

---

## 5bis. Effets sonores

En plus du narrateur, l'app peut jouer un court effet sonore à 5 moments clés de la partie (la nuit tombe, le village se réveille, un vote s'ouvre, un joueur meurt, la partie se termine — `src/hooks/useSoundEffects.ts`) ainsi qu'un petit clic sur n'importe quel bouton de l'appli (`src/hooks/useUiClickSound.ts`, actif partout, pas seulement en partie). Bouton 🎶/🔇 dans le bandeau de phase, à côté de celui du narrateur — il coupe les deux en même temps (même réglage partagé).

Le code est déjà branché mais n'inclut aucun fichier audio par défaut : voir **`public/sounds/README.md`** pour la liste exacte des 8 fichiers attendus, avec une sélection de sons libres de droit (licence Mixkit, gratuite et sans attribution) prête à télécharger. Tant qu'un fichier manque, son moment reste simplement silencieux.

---

## 5ter. Notifications push (web)

Notifications navigateur (Web Push API), activables depuis **Mon compte → Notifications**, sans passer par l'App Store ni le Play Store — ça fonctionne dès que le site est déployé (ou même en local pour la partie abonnement, voir plus bas).

⚠️ Ceci ne couvre que le **web** (site déployé + PWA installée). Dans la coquille native Capacitor (`ios/`, `android/`), la WebView ne supporte pas la Push API standard de façon fiable — la notification native (via Firebase Cloud Messaging) est une brique à part, pas encore implémentée (voir `src/hooks/usePushNotifications.ts`).

1. Générez une paire de clés VAPID (une fois, à garder précieusement) :
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Clé **publique** → variable `VITE_VAPID_PUBLIC_KEY` dans `.env` (local) **et** dans les Environment Variables du projet Vercel. Sans danger à exposer côté client.
3. Clé **privée** → variable `VAPID_PRIVATE_KEY` sur Vercel **uniquement**, jamais dans `.env` ni `VITE_...` (comme `DAILY_API_KEY` et `ELEVENLABS_API_KEY`, voir sections 4 et 5) :
   ```bash
   npx vercel env add VAPID_PRIVATE_KEY production
   npx vercel env add VAPID_PUBLIC_KEY production
   ```
4. Ajoutez aussi `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → `service_role`) sur Vercel — c'est ce qui permet à `api/send-push.ts` de lire la table `push_subscriptions` (aucune policy RLS cliente dessus, par conception) :
   ```bash
   npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
   ```
5. Redéployez : `npx vercel --prod`.

**Tester** : "Mon compte" → "Notifications" → "Activer" (le navigateur demande la permission), puis "Envoyer un test" — un bandeau système doit apparaître en quelques secondes. Le bouton de test appelle `api/send-push.ts`, qui n'existe qu'en production (fonction serverless Vercel) : en local (`npm run dev`), l'abonnement fonctionne mais le test échouera, comme pour le vocal (section 4) et le narrateur (section 5).

Ce qui existe pour l'instant : notification de **test**, envoyée par le joueur à lui-même. Notifier un *autre* joueur (ex. "c'est ton tour", "un ami a lancé une partie") demande un appelant serveur de confiance différent — c'est la prochaine étape, pas encore construite.

---

## 6. Comment fonctionne le moteur de jeu

Toute la logique sensible (qui est loup-garou, qui vote quoi la nuit) vit dans des fonctions Postgres `SECURITY DEFINER` : le client ne peut jamais lire directement le rôle d'un autre joueur vivant, seulement via `get_my_game_view`, qui calcule côté serveur ce que chaque joueur a le droit de voir.

- **`create_game` / `join_game` / `leave_game`** — gestion du salon d'attente (max 25 joueurs).
- **`start_game`** — répartit aléatoirement les rôles selon la configuration de l'hôte (ou une répartition par défaut selon le nombre de joueurs).
- **`advance_phase` / `tick_game`** — le "meneur de jeu" automatique. Chaque client connecté appelle `tick_game` toutes les ~1,5s ; la fonction ne fait quelque chose que si le minuteur de la phase en cours est écoulé, donc plusieurs appels simultanés ne posent aucun problème.
- **`submit_cupidon`, `submit_voyante`, `submit_wolf_vote`, `submit_sorciere`, `submit_petite_fille`, `submit_vote`, `submit_hunter_shot`** — actions des joueurs. Dès que toutes les actions requises pour une étape sont reçues, la phase avance immédiatement sans attendre la fin du minuteur.

Rôles inclus : Villageois, Loup-Garou, Voyante, Sorcière, Chasseur, Petite Fille, Cupidon, Ancien, Voleur. L'hôte peut activer/désactiver les rôles spéciaux et ajuster le nombre de loups depuis le salon d'attente. Ancien et Voleur restent désactivés par défaut dans les petites parties (10+ et 11+ joueurs respectivement) car ils ajoutent une vraie complexité de règles ; Chasseur et Cupidon sont désactivés par défaut dans tous les cas (à activer volontairement) ; le Capitaine (optionnel, voir plus bas) est en revanche activé par défaut (voir `compute_default_role_counts`, migration 0034).

Le **Capitaine** est différent des autres rôles : ce n'est pas une identité secrète tirée au sort, mais un titre public confié en plus du rôle tiré (qui reste inchangé). Il est élu par le village à la majorité relative juste après la distribution des rôles, via une phase dédiée (`captain_election`, votes stockés avec `round_number = 0`). Son vote compte double lors du vote du village, et tranche les égalités (`resolve_day_vote_deaths`). À sa mort, il désigne son successeur parmi les joueurs en vie (`submit_captain_succession`), un blocage bloquant la partie du même principe que le tir du Chasseur. Désactivé par défaut, à activer depuis les réglages du salon.

### Chat texte et vocal, gérés automatiquement par la partie

Quatre salons existent, et l'accès à chacun est vérifié en base de données (pas seulement caché côté interface) selon l'état réel de la partie :

- **Salon d'attente** (vocal uniquement) : ouvert à tous les joueurs déjà présents dans le salon, tant que la partie n'a pas été lancée (statut `lobby`) — pour discuter en attendant les retardataires.
- **Village** (texte + vocal) : ouvert aux joueurs vivants uniquement pendant les phases de jour (réveil, débat, vote).
- **Loups** (texte uniquement, pas de vocal) : ouvert aux Loups-Garous vivants uniquement pendant leur tour de nuit, avec 120 secondes pour se concerter et voter leur victime.
- **Cimetière** (texte + vocal) : ouvert en permanence aux joueurs éliminés, pour qu'ils puissent continuer à discuter entre eux sans jamais pouvoir influencer la partie en cours.

Dès qu'une phase change, le salon correspondant se ferme automatiquement (la fonction `can_access_channel` réévalue les droits à chaque message).

### Choix de conception à connaître

- **Égalité au vote** = personne n'est éliminé ce jour-là.
- **Petite Fille** : 20% de chances d'être repérée si elle espionne les loups ; dans ce cas elle devient la victime de la nuit à la place de la cible des loups.
- **Amoureux** : s'il ne reste que les deux amoureux en vie, ils gagnent ensemble, quel que soit leur camp d'origine.
- **Minimum technique** pour démarrer une partie : 4 joueurs (la règle officielle recommande 8 joueurs minimum pour une bonne expérience).

---

## 7. Vérifications avant de jouer pour de vrai

- [ ] Les 14 fichiers SQL ont été exécutés sans erreur, dans l'ordre.
- [ ] "Confirm email" est actif et un email de test arrive bien à l'inscription.
- [ ] `Site URL` / `Redirect URLs` pointent vers la bonne adresse (locale puis production).
- [ ] Deux comptes différents, dans deux fenêtres différentes, peuvent créer/rejoindre la même partie et voir la liste des joueurs se mettre à jour en direct.
- [ ] Un joueur ne voit jamais le rôle d'un autre joueur vivant qui n'est pas son coéquipier loup-garou (à tester en ouvrant les deux comptes côte à côte).
- [ ] `DAILY_API_KEY` est configurée sur Vercel et le site a été redéployé après.
- [ ] Le chat du village apparaît bien pendant le débat et disparaît une fois la nuit tombée.
- [ ] Le vocal du village se connecte (autoriser le micro dans le navigateur au premier essai).
- [ ] En tuant un joueur de test, son compte bascule bien dans le salon "Cimetière" (texte + vocal) et ne voit plus les salons du village.
- [ ] `ELEVENLABS_API_KEY` est configurée sur Vercel et le site a été redéployé après (sinon le narrateur utilise simplement la voix du navigateur).
- [ ] Le narrateur s'entend bien pendant une partie (cliquer n'importe où dans la partie une première fois, sur Safari notamment, pour "débloquer" le son).
- [ ] `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` sont configurées sur Vercel et le site a été redéployé après (voir section 5ter) ; "Mon compte → Notifications → Activer" puis "Envoyer un test" affiche bien un bandeau système.

---

## 8. Tests automatisés (E2E, Playwright)

Le dossier `tests/e2e/` contient une suite de tests [Playwright](https://playwright.dev) : page d'accueil, formulaires d'inscription/connexion, panneau "Mon compte", et une partie complète à 4 joueurs jouée automatiquement de la création jusqu'à la victoire d'un camp. Ils tournent contre un vrai projet Supabase (utilisez de préférence un projet de test, pas votre production).

**Installation (une fois) :**

```bash
npm install
npx playwright install --with-deps chromium
```

**Configuration :** copiez `.env.test.example` en `.env.test` et remplissez :
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — les mêmes valeurs que votre `.env`.
- `SUPABASE_SERVICE_ROLE_KEY` — trouvable dans Project Settings → API → `service_role`. Sert uniquement, en local, à créer/confirmer automatiquement les 4 comptes de test (contourne la confirmation par email). Ne jamais commiter cette clé.
- `TEST_USER_PASSWORD` — le mot de passe utilisé pour ces comptes de test.

**Lancer les tests :**

```bash
npm run test:e2e
```

Par défaut, Playwright démarre `npm run dev` tout seul et attend qu'il soit prêt. Pour cibler un site déjà déployé (ex. une preview Vercel), définissez `PLAYWRIGHT_BASE_URL` dans `.env.test` à la place.

`npm run test:e2e:ui` ouvre l'interface interactive de Playwright (pratique pour rejouer un test qui a échoué étape par étape). Un rapport HTML est aussi généré après chaque run (`playwright-report/index.html`).

Le test de partie complète (`game-flow.spec.ts`) est le plus long et le plus fragile aux changements d'interface : il ouvre 4 navigateurs en parallèle, raccourcit les minuteurs de la partie via `update_game_settings`, puis boucle en prenant l'action la plus neutre disponible sur chaque écran jusqu'à la fin de partie. Si un futur changement d'ActionPanel.tsx renomme un bouton ou un titre de panneau, c'est ce fichier qu'il faudra ajuster en premier.

⚠️ Ces tests ne couvrent pour l'instant que les parcours "historiques" (accueil, inscription/connexion, compte, amis, stats, une partie complète). Les fonctionnalités ajoutées plus récemment — réponse à un message, modération vocale, récap de nuit, dashboard admin, interrupteur "nouvelles parties" — n'ont pas encore de test dédié.

---

## 9. Outils pour les développeurs

Ajoutés après deux régressions arrivées directement en production (une fonction reconstruite à partir d'un vieux modèle qui a fait disparaître un champ, puis deux fonctions RPC devenues inaccessibles après un durcissement des droits) : l'objectif est qu'un problème de ce genre soit détecté ici, avant un déploiement, plutôt que signalé par un joueur.

### Vérifier les droits RPC avant de déployer une migration

```bash
npm run check:rpc
```

Relit toutes les migrations SQL pour reconstituer quelles fonctions existent et à qui elles sont accordées (`grant execute ... to authenticated/anon`), croise ça avec tous les appels `supabase.rpc(...)` trouvés dans `src/` et `api/`, et échoue (code de sortie 1) si une fonction que le client appelle réellement n'est accordée à personne — exactement le scénario qui a cassé le chat et la création de partie publique après la migration 0045. À lancer après avoir écrit une migration, avant de la coller dans l'éditeur SQL Supabase.

### CLI Supabase (`supabase link` + `supabase db push`)

Plus fiable que le copier-coller manuel dans l'éditeur SQL (source des deux régressions ci-dessus : rien n'empêche de coller le mauvais fichier, dans le mauvais ordre, ou d'oublier un fichier). `supabase/config.toml` est déjà en place dans ce projet.

```bash
npm install -g supabase        # une fois
supabase login                 # une fois
supabase link --project-ref <ref-de-votre-projet>   # trouvable dans Project Settings → General
supabase db push                # applique tout ce qui manque, dans l'ordre
```

Idéalement sur un **projet de staging séparé** d'abord (voir plus bas), avant le projet de production.

### Intégration continue (GitHub Actions)

`.github/workflows/ci.yml` fait tourner, à chaque push et pull request :
- `tsc -b` (typage)
- `npm run check:rpc` (voir ci-dessus)
- `npm run lint`
- les tests Playwright (`npm run test:e2e`), mais seulement si les secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` et `TEST_USER_PASSWORD` sont configurés dans Settings → Secrets and variables → Actions du dépôt GitHub (mêmes valeurs que `.env.test`, sur un **projet Supabase de test**, jamais celui de production). Sans ces secrets, ce job échoue sans bloquer le reste de la CI (`continue-on-error: true`) — à retirer une fois les secrets ajoutés.

Ne se déclenche que si ce dossier est poussé sur GitHub (`git remote add origin ...` puis `git push`) — un dépôt git local a été initialisé dans ce projet, mais aucun remote n'est configuré pour l'instant.

### Environnement de staging (recommandé, pas encore en place)

Le point le plus structurant qui manque encore : un second projet Supabase + un déploiement Vercel preview, pour tester une migration ou une fonctionnalité avant qu'elle touche de vrais joueurs. Concrètement :
1. Un deuxième projet sur [supabase.com](https://supabase.com), avec les mêmes migrations.
2. Un projet Vercel (ou juste les déploiements "Preview" automatiques d'une pull request) pointant vers ce projet Supabase de staging via ses propres variables d'environnement.
3. Tester dessus avant de pousser en production — les deux régressions mentionnées plus haut auraient été visibles ici avant d'atteindre un vrai joueur.
