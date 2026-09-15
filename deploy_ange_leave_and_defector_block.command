#!/bin/bash
# Double-clique sur ce fichier pour déployer les deux correctifs signalés :
#   1. Copie le contenu des deux migrations dans le presse-papiers, l'une
#      après l'autre, et ouvre l'éditeur SQL Supabase à chaque fois — colle
#      (Cmd+V) et clique Run, dans l'ORDRE (0156 puis 0157).
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#
#  1. L'Ange qui quitte volontairement la partie (ou qui est exclu par
#     l'hôte) pendant le premier cycle nuit+jour ne fait plus gagner
#     personne. Avant : check_and_apply_ange_win ne regardait que "mort
#     pendant le premier cycle", sans distinguer une vraie élimination d'un
#     simple départ — un Ange qui quittait la partie durant la nuit 1 se
#     voyait crédité de la victoire solo de l'Ange. Corrigé : exclut
#     explicitement les causes 'parti' (départ volontaire) et 'exclu'
#     (exclusion par l'hôte) de cette condition de victoire.
#
#  2. Un joueur que l'échange d'Anancy fait sortir du camp des Loups ne peut
#     plus du tout interagir avec le jeu (vote du jour + pouvoirs de
#     Voyante/Sorcière/Griot s'il en hérite) pendant le jour qui suit
#     IMMÉDIATEMENT l'échange et la nuit qui suit immédiatement ce jour-là
#     — avant, seul le chat/vocal était bloqué (le vote et les pouvoirs de
#     nuit restaient totalement ouverts), et le blocage lui-même ne
#     démarrait qu'un cycle trop tard, laissant un jour entier sans aucune
#     restriction juste après l'échange. Un vote du jour qui traînerait
#     inutilement jusqu'au bout du délai à cause d'un transfuge muet qui ne
#     peut plus voter est aussi corrigé (il ne compte plus dans les
#     joueurs dont on attend le vote).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Victoire de l'Ange (départ volontaire) + blocage complet du transfuge"
echo "==========================================="
echo

echo "→ Étape 1/3 : migrations SQL (dans l'ordre)"
echo
echo "— Migration 0156 (victoire de l'Ange) —"
pbcopy < supabase/migrations/0156_ange_win_excludes_voluntary_leave.sql
echo "Contenu copié dans le presse-papiers."
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "→ Colle (Cmd+V) puis clique sur Run."
read -p "Appuie sur Entrée une fois cette migration exécutée avec succès..."

echo
echo "— Migration 0157 (blocage complet du transfuge) —"
pbcopy < supabase/migrations/0157_defector_full_interaction_block.sql
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
    msg="Corrige la victoire de l'Ange sur départ volontaire et bloque complètement le transfuge d'Anancy"
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
echo "  - Ange qui quitte volontairement (ou est exclu) pendant la nuit 1 ou"
echo "    le jour 1 : la partie continue normalement pour les autres, plus"
echo "    de 'victoire de l'Ange' automatique."
echo "  - Échange d'Anancy faisant sortir un Loup du camp des Loups :"
echo "    le transfuge doit être bloqué (chat + vote + pouvoir de son"
echo "    nouveau rôle s'il en a un) dès le jour qui suit l'échange, puis"
echo "    pendant la nuit suivante — plus aucune interaction possible durant"
echo "    toute cette fenêtre, immédiatement après l'échange (pas un cycle"
echo "    plus tard comme avant)."
echo "  - Vote du jour avec un transfuge muet en vie : doit basculer dès que"
echo "    tous les AUTRES joueurs vivants ont voté, sans attendre le délai"
echo "    complet."
echo

read -p "Appuie sur Entrée pour fermer..."
