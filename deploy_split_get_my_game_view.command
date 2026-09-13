#!/bin/bash
# Double-clique sur ce fichier pour déployer la consolidation de
# get_my_game_view (migration 0142) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Refactor interne pur (voir le commentaire en tête de la migration) : aucun
# champ ni comportement ne change, get_my_game_view est juste découpée en
# plusieurs fonctions par domaine pour ne plus jamais avoir à réécrire les
# ~46 champs à la fois. Recommandé : teste cette migration sur un projet
# Supabase non-production avant de cliquer ici, si tu en as un — sinon, à
# défaut, rejoue une partie de test complète juste après ce déploiement (voir
# la liste en bas de cette fenêtre une fois terminé).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Consolidation de get_my_game_view — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0142_split_get_my_game_view.sql
echo "Le contenu de la migration a été copié dans le presse-papiers."
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "→ Dans l'éditeur SQL qui vient de s'ouvrir : colle (Cmd+V) puis clique sur Run."
read -p "Appuie sur Entrée une fois la migration exécutée avec succès..."

echo
echo "→ Étape 2/3 : vérification du code"
echo
echo "→ Vérification TypeScript..."
npx tsc -b

echo
echo "→ Vérification des grants RPC..."
npm run check:rpc

echo
echo "→ Vérification des champs de get_my_game_view (nouveau garde-fou, voir scripts/check-game-view-fields.mjs)..."
npm run check:game-view

echo
echo "→ Build de production..."
npm run build

echo
echo "→ Étape 3/3 : préparation du commit"
echo
echo "→ Fichiers modifiés :"
git status --short

CHANGES=$(git status --porcelain)
if [ -z "$CHANGES" ]; then
  echo
  echo "Aucun changement de code à pousser."
else
  echo
  read -p "Message de commit (laisse vide pour un message automatique) : " msg
  if [ -z "$msg" ]; then
    msg="Consolide get_my_game_view en fonctions par domaine, avec un garde-fou CI contre les champs perdus"
  fi
  git add -A
  git commit -m "$msg"
  echo
  echo "✅ Commit créé localement. Dernière étape, à faire toi-même (copie/colle) :"
  echo
  echo "     git push"
  echo
  echo "   (Vercel redéploiera automatiquement une fois envoyé sur GitHub.)"
fi

echo
echo "À tester une fois déployé (ce refactor touche TOUS les champs de la"
echo "partie, donc mieux vaut vérifier large plutôt qu'un seul rôle) :"
echo "  - Une partie complète se lance et se termine normalement (salon → nuit →"
echo "    jour → vote → fin), avec le journal, le minuteur et le classement OK."
echo "  - Un tour de Sorcière (soin + poison) fonctionne et son historique est correct."
echo "  - Un tour de Loups (dont un Loup Alpha si activé) : cibles, vote à 2 voix,"
echo "    et accord d'infection s'affichent bien."
echo "  - Voyante et Griot voient bien leurs révélations passées après un 2e tour."
echo "  - Un Voleur échangé nuit 1 reçoit sa notice, ainsi que sa victime."
echo "  - Élection du Capitaine + succession à sa mort fonctionnent."
echo "  - L'écran de fin affiche bien le bonus d'impact et le résultat de rang."
echo "  - Salon public : la liste des demandes pour rejoindre s'affiche à l'hôte."
echo
read -p "Appuie sur Entrée pour fermer..."
