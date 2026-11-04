# Loup Garou d'Afrique — notes pour Claude

Jeu de loups-garous en ligne, en français (et anglais). Dépôt : `Geoszn/loup-garou-app`, branche `main` (miroir `staging`).

## Stack

- Client : React 18 + TypeScript + Vite + Tailwind, empaqueté pour mobile avec Capacitor (`ios/`, `android/`).
- Back-end : Supabase (Postgres + RLS, fonctions RPC `security definer`, Realtime, Auth) — migrations dans `supabase/migrations/` (numérotées, jusqu'à 0254).
- Fonctions serveur Vercel dans `api/` (notifications push, salons vocaux Daily.co, crons) ; code partagé dans `server/`.
- Vocal : Daily.co. Notifications : Web Push.
- Tests : `tests/` (Playwright, `npm run test:e2e`).

## Commandes

```
npx tsc -b            # types (régénère vite.config.js depuis le .ts)
npx vite build        # build
npm run check:rpc         # toute fonction appelée par le client est exécutable par authenticated
npm run check:game-view   # champs de MyGameView ↔ get_my_game_view
npm run audit:db          # audit de sécurité de la base réelle (lecture seule, demande SUPABASE_DB_URL)
```

Avant un commit : `git checkout tsconfig.tsbuildinfo` (fichier régénéré par `tsc -b`, ne pas le commiter).

## Règles de travail avec l'utilisateur

- **Répondre en français, de façon concise.** Question exploratoire : une recommandation courte et son compromis, puis attendre. Dire honnêtement ce qui n'a pas pu être testé.
- **Commits** : terminer le message par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Ne jamais pousser sans que l'utilisateur dise « git push »** (ou « commite et push »). Alors : `git push origin main && git push origin main:staging`.
- **Interface : toujours montrer un aperçu avant de valider.** Rendre les VRAIS composants (esbuild + Tailwind, `supabase`/`AuthContext`/`LanguageContext` remplacés par des stubs), en 390 px de large, mobile d'abord. Les stubs doivent reproduire l'interpolation réelle `{{variable}}` de `t()`. Le contenu du `content` Tailwind du harness doit inclure le fichier d'entrée. Nettoyer ensuite le harness et le serveur local. Ne commiter qu'après accord de l'utilisateur.
- **Mobile d'abord** : tuiles compactes, avatars petits, blocs repliables ou paginés ; vérifier à 390 px. Les boutons doivent avoir un LIBELLÉ (les icônes seules ne sont pas retrouvées par les joueurs).
- Ne rien supposer sur la base réelle : écrire ce qui est déduit du code comme tel.

## Migrations SQL (point critique)

- **Les migrations sont appliquées PAR L'UTILISATEUR dans son Terminal Mac. Ne jamais lancer de commande qui exige le mot de passe de la base, ni le demander, ni l'afficher.** Le mot de passe se tape uniquement dans le Terminal, jamais dans le chat.
- Donner la commande exacte à chaque fois, une par bloc de code :

```
cd ~/Downloads/loup-garou-app && read -rs "?Mot de passe DB : " PW; echo; PWE=$(PW="$PW" python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PW"],safe=""))'); SUPABASE_DB_URL="postgres://postgres.cdmxsuzemhdrygobmocp:${PWE}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" node scripts/run-sql-file.mjs supabase/migrations/<fichier>.sql; unset PW PWE
```

  Diagnostics en lecture seule : même commande avec `node scripts/query-sql-file.mjs supabase/diagnostics/<fichier>.sql`. Le résultat est un JSON sans secret que l'utilisateur peut coller dans le chat.
- Si l'utilisateur colle la commande dans la zone de saisie du chat au lieu d'un Terminal, elle ne s'exécute pas (pas de saisie masquée possible) : le lui rappeler.
- Écrire des migrations **rejouables** (l'exécution peut s'arrêter à mi-chemin), avec `revoke`/`grant` explicites. Une fonction redéfinie = copier la DERNIÈRE définition existante dans les migrations, puis la modifier. Valider la syntaxe avec `pglast` (venv temporaire, supprimé ensuite) et lancer `check:rpc` et `check:game-view`.
- Appliquer les migrations AVANT de déployer le client qui en dépend, puis seulement dire à l'utilisateur de faire « git push ».
- Ne jamais coller de SQL dans l'éditeur web de Supabase depuis Safari : les accents français sont corrompus. Passer par `run-sql-file.mjs`.
- Réflexes zsh sur macOS : `sed -i ''`, pas de globs `--include=`, pas de `timeout`.

## Particularités techniques

- `vite.config.js` est suivi et passe avant `vite.config.ts` ; `npx tsc -b` le régénère. Modifier le `.ts`, relancer `tsc -b`, commiter les deux.
- Traductions : `src/i18n/translations.ts` est l'unique source (fr + en côte à côte). Un plugin Vite (`i18nSplit`) produit `virtual:i18n-fr` et `virtual:i18n-en` ; ne jamais importer la valeur `translations` dans le code applicatif, seulement le type `TranslationKey`.
- La barre du bas publie sa hauteur dans `--nav-h`. Les éléments fixes en bas utilisent `bottom: var(--nav-h, 0px)`. Les écrans de jeu utilisent `<AppShell compact />`.
- framer-motion : utiliser `m` (pas `motion`) dans `MotionProvider`.
- Safari ne stretch pas un élément flex `sticky` + `overflow-y` : utiliser des barres latérales `fixed` + `100vh`.

## Architecture temps réel (décisions récentes, à connaître)

- **Chronomètre serveur** : `pg_cron` appelle `server_tick_games()` chaque seconde (0251). Les navigateurs gardent un tick de secours plus rare tant que `server_tick_alive()` répond vrai. Délai de grâce de 2 s dans `advance_phase` (protège les votes de dernière seconde).
- **Version de partie** : table `game_state_version` (0253), incrémentée au COMMIT (déclencheurs « constraint » différés, une mise à jour par partie et par transaction). Le client s'abonne à cette seule table et sonde `get_game_version` avant de relire `get_my_game_view` (appel le plus coûteux, ~200 ms).
- **Présence** : plus de canal Realtime global ; `touch_presence` toutes les 60 s renvoie le nombre de joueurs en ligne et le statut des amis et de la tribu (0252).
- **Interface de chat plein écran (jour et nuit)** : barre d'actions libellée (`ActionBar.tsx`) posée EN BAS DU FLUX au-dessus de la saisie — jamais en recouvrement du fil de messages. Le journal de la partie est un volet (`GameJournal.tsx`), pas un onglet qui remplace le chat.
- Comptes invités (anonymes) : `profiles.is_guest`, garde `guest_guard()` côté PostgREST, quota vocal. Les bots de test (`profiles.is_bot`, 12 comptes `bot1..12@bots.loupgarouafrique.internal`) NE doivent JAMAIS être anonymes ni invités : `purge_stale_guests` les épargne depuis 0254.

## Leçons à ne pas reproduire

- Un `NULL` explicite dans un `INSERT` n'applique pas le `default` d'une colonne `not null` : omettre la colonne. (0250 a cassé toutes les inscriptions par e-mail ; corrigé en 0254.)
- Toute purge ou nettoyage d'« anonymes » doit exclure explicitement les comptes techniques (bots).
- Une barre posée en `absolute` par-dessus une liste de messages en cache les derniers : mettre les barres dans le flux.

## EN ATTENTE — test de performance du soir (ne pas oublier)

L'utilisateur jouera une partie à 8 joueurs ou plus (2 nuits minimum) et préviendra AVANT de la lancer. À ce moment, lui renvoyer les deux commandes Terminal : `supabase/diagnostics/perf_game_before.sql` (avec `run-sql-file.mjs`, juste avant) puis `supabase/diagnostics/perf_game_after.sql` (avec `query-sql-file.mjs`, juste après). Il colle le JSON dans le chat ; on confirme ou infirme l'hypothèse « chaque vote fait relire get_my_game_view à tous les joueurs » (carré du nombre de joueurs) et le goulot du chat (`can_read_channel`). Suites possibles selon les chiffres : état de partie public précalculé + petite partie privée, chat en Broadcast, plan Pro (plan actuel : gratuit, plafond « serveur complet » à 160). Sons : `scripts/compress-sounds.sh` (effets en PCM sous extension .mp3, 6,9 Mo → ~0,4 Mo), à faire valider à l'écoute.

## État et suite (au 2026-11-04)

Tout est poussé (`main` et `staging` identiques). À faire ou à vérifier :

1. « Ajouter un bot » dans un salon (`supabase/diagnostics/bots_check.sql` : bots = 12, `bots_anonymous` = 0, `bots_guest` = 0).
2. Tester une vraie inscription par e-mail ; chercher « Database error saving new user » dans les logs d'authentification Supabase depuis 0250 pour mesurer les échecs.
3. Tester la nouvelle interface de débat sur téléphone (dernier message toujours visible, états du micro, vote, journal).
4. **Montée en charge (objectif : 1000 joueurs simultanés)** — étape 2 : chat et état de partie en Broadcast depuis la base (`realtime.broadcast_changes`, autorisation une seule fois à l'entrée) au lieu de `postgres_changes` (une vérification de droits par abonné et par changement) ; état public de partie précalculé ; test de charge sur un projet Supabase DE TEST (jamais la production) ; alerte CPU ; « serveur complet » au-delà d'un plafond. Limites Realtime officielles : 200 connexions (gratuit), 500 (Pro), 10 000 (Pro sans plafond de dépense / Team).
5. Demander la taille de calcul et le plan Supabase de l'utilisateur (Settings → Compute and Disk) : les mesures suggèrent un CPU partagé sous-dimensionné.
6. Pistes : artefacts restants au système de stock (Boussole du Village, Balance de l'Ange, Feu Sacré, Masque Sans-Visage), captcha pour les connexions invitées.
