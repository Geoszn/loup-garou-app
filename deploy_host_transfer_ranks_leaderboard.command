#!/bin/bash
# Double-clique sur ce fichier pour déployer les 3 derniers ajustements :
#   1. Copie le contenu des deux migrations dans le presse-papiers, l'une
#      après l'autre, et ouvre l'éditeur SQL Supabase à chaque fois — colle
#      (Cmd+V) et clique Run, dans l'ORDRE (0159 puis 0160).
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#
#  1. Transfert volontaire de l'hôte (salon d'attente uniquement) : dans le
#     panneau de modération, une nouvelle section "Transférer l'hôte" liste
#     les autres joueurs (bots exclus) — un clic + confirmation transfère
#     toutes les fonctions de modérateur à ce joueur, l'ancien hôte les
#     perd immédiatement.
#
#  2. Refonte des paliers de rang — retour "on atteint déjà la limite à
#     4000 points, il n'y a plus de progression après". Chacun des 5
#     paliers nommés (Apprenti, Éclaireur, Doyen, Sage, Légende du Village)
#     est désormais divisé en 3 sous-paliers III < II < I, et la
#     progression totale s'étale jusqu'à 15 000 points (Légende du Village
#     I) au lieu de ~2800 avant. Les avatars déblocables restent sur leurs
#     seuils actuels (100 à 2800 pts), volontairement non réétalés pour
#     l'instant.
#
#  3. Classement par continent : le joueur peut désormais choisir N'IMPORTE
#     QUEL continent à parcourir dans l'onglet Classement (menu déroulant),
#     plus seulement le sien.
#
#  (Inclus au passage : la description du Daron, raccourcie lors du
#  précédent échange, n'avait pas encore été poussée — elle part avec ce
#  commit.)

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Transfert d'hôte + refonte des paliers + classement par continent"
echo "==========================================="
echo

echo "→ Étape 1/3 : migrations SQL (dans l'ordre)"
echo
echo "— Migration 0159 (refonte des paliers de rang) —"
pbcopy < supabase/migrations/0159_rank_tiers_rework.sql
echo "Contenu copié dans le presse-papiers."
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "→ Colle (Cmd+V) puis clique sur Run."
read -p "Appuie sur Entrée une fois cette migration exécutée avec succès..."

echo
echo "— Migration 0160 (transfert d'hôte) —"
pbcopy < supabase/migrations/0160_transfer_host.sql
echo "Contenu copié dans le presse-papiers."
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "→ Colle (Cmd+V) puis clique sur Run."
read -p "Appuie sur Entrée une fois cette migration exécutée avec succès..."

echo
echo "→ Étape 2/3 : vérification du code"
echo
echo "→ Vérification TypeScript..."
npx tsc -b

echo
echo "→ Vérification des grants RPC..."
npm run check:rpc

echo
echo "→ Vérification des champs de get_my_game_view..."
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
    msg="Ajoute le transfert d'hôte, refond les paliers de rang (15000 pts, sous-paliers) et le classement par continent"
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
echo "À tester une fois déployé :"
echo "  - Salon d'attente, en tant qu'hôte : le panneau de modération (⋮)"
echo "    doit montrer une section 'Transférer l'hôte' listant les autres"
echo "    joueurs (jamais les bots) ; transférer doit immédiatement retirer"
echo "    toutes tes fonctions d'hôte et les donner à l'autre joueur."
echo "  - Page Statistiques > Classement > onglet Continent : un menu"
echo "    déroulant doit permettre de choisir N'IMPORTE quel continent,"
echo "    pas seulement le tien."
echo "  - Page Statistiques > Mon compte, ou badge de palier n'importe où :"
echo "    doit maintenant afficher des paliers comme 'Doyen II', 'Sage du"
echo "    Village III', etc., avec des seuils allant jusqu'à 15 000 points"
echo "    pour 'Légende du Village I'."
echo "  - Un joueur déjà à 2800+ points avant cette migration : vérifie que"
echo "    son nouveau palier affiché est cohérent (ex. quelqu'un à 3000 pts"
echo "    devient 'Sage du Village III', pas 'Légende du Village' comme"
echo "    avant)."
echo

read -p "Appuie sur Entrée pour fermer..."
