# Effets sonores

Le code est déjà branché et n'attend que ces 8 fichiers, avec ces noms exacts, dans ce dossier :

- `night-falls.mp3` — la nuit tombe (transition vers la phase Nuit) — `src/hooks/useSoundEffects.ts`
- `dawn.mp3` — le village se réveille (fin de la nuit) — `src/hooks/useSoundEffects.ts`
- `vote-open.mp3` — un vote s'ouvre (vote du village ou élection du Capitaine) — `src/hooks/useSoundEffects.ts`
- `death.mp3` — un joueur vient de mourir — `src/hooks/useSoundEffects.ts`
- `victory.mp3` — la partie se termine — `src/hooks/useSoundEffects.ts`
- `click.mp3` — clic sur n'importe quel bouton, partout dans l'appli — `src/hooks/useUiClickSound.ts`
- `join-request.mp3` — une nouvelle demande pour rejoindre une partie publique arrive (côté hôte) — `src/hooks/useNotificationSound.ts`, utilisé dans `src/pages/Lobby.tsx`
- `request-accepted.mp3` — l'hôte vient de valider votre demande pour rejoindre une partie publique (côté demandeur) — `src/hooks/useNotificationSound.ts`, utilisé dans `src/pages/PendingApproval.tsx`

Tant qu'un fichier n'existe pas, son moment reste simplement silencieux (aucune erreur) — tu peux les ajouter un par un.

## D'où viennent-ils

Je n'ai pas d'accès direct à Internet pour télécharger des fichiers binaires depuis cet environnement, donc voici une sélection prête à l'emploi sur [Mixkit](https://mixkit.co/free-sound-effects/), sous la [licence Mixkit Sound Effects Free](https://mixkit.co/license/#sfxFree) : gratuite, utilisable commercialement, **aucune attribution requise**, jeux vidéo explicitement autorisés.

| Fichier à créer | Son sur Mixkit | Page |
| --- | --- | --- |
| `night-falls.mp3` | "Lone wolf howling" (0:06) | https://mixkit.co/free-sound-effects/wolf/ |
| `dawn.mp3` | "Short rooster crowing" (0:02) | https://mixkit.co/free-sound-effects/bird/ |
| `vote-open.mp3` | "Notification bell" (0:05) | https://mixkit.co/free-sound-effects/bell/ |
| `death.mp3` | "Hard horror hit drum" (0:04) | https://mixkit.co/free-sound-effects/horror/ |
| `victory.mp3` | "Medieval show fanfare announcement" (0:08) | https://mixkit.co/free-sound-effects/win/ |
| `click.mp3` | "Select click" (0:01) | https://mixkit.co/free-sound-effects/click/ |
| `join-request.mp3` | "Positive notification" (0:02) | https://mixkit.co/free-sound-effects/notification/ |
| `request-accepted.mp3` | "Achievement bell" (0:02) | https://mixkit.co/free-sound-effects/bell/ |

Étapes pour chacun : ouvre la page, trouve le son par son nom (ils sont listés dans l'ordre où Mixkit les affichait au moment de cette recherche, mais l'ordre peut changer — utilise le nom), clique sur "Download Free SFX" (pas besoin de compte), renomme le fichier téléchargé exactement comme indiqué dans la colonne de gauche, et dépose-le ici.

Le son de clic (`click.mp3`) est joué très bas (volume réduit) et très court par nature — préfère un son de type "clic" discret plutôt qu'un son long, sinon ça devient vite fatigant à l'usage vu la fréquence des clics.

Si un son ne te convient pas, n'importe quel autre son de la même page (ou d'ailleurs sur Mixkit/Pixabay, en vérifiant la licence) fonctionnera tant que le nom de fichier final correspond.

## Pour aller plus loin

Une fois ces 5 sons en place, si tu veux des effets plus travaillés/uniques (ambiance spécifique, voix, sons plus "African-thème"), Suno AI ou un autre générateur peut les remplacer un par un — même noms de fichiers, aucun changement de code nécessaire.
