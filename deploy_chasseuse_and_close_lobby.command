#!/bin/bash
# Double-clique sur ce fichier pour déployer les deux derniers changements
# encore en attente (le renommage n'avait pas encore été déployé) :
#   1. Copie le contenu des deux migrations dans le presse-papiers, l'une
#      après l'autre, et ouvre l'éditeur SQL Supabase à chaque fois — colle
#      (Cmd+V) et clique Run, dans l'ORDRE (0163 puis 0164).
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#
#  1. Renomme le rôle "Le Juge" en "La Chasseuse" — id interne, colonnes,
#     fonctions SQL et emoji (⚖️ → 🎯) tous renommés en cohérence, aucune
#     mécanique ne change.
#
#  2. Nouvelle possibilité pour l'hôte : fermer entièrement le salon
#     d'attente pour tout le monde d'un coup (bouton "🚪 Fermer le salon"
#     dans le panneau de modération, uniquement avant le lancement de la
#     partie) — distinct de simplement le quitter, ce qui ne fait que
#     transférer l'hôte au joueur suivant et laisse le salon continuer.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Renommage La Chasseuse + fermeture de salon"
echo "==========================================="
echo

echo "→ Étape 1/3 : migrations SQL (dans l'ordre)"
echo
echo "— Migration 0163 (renomme Le Juge en La Chasseuse) —"
pbcopy < supabase/migrations/0163_chasseuse_rename.sql
echo "Contenu copié dans le presse-papiers."
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "→ Colle (Cmd+V) puis clique sur Run."
read -p "Appuie sur Entrée une fois cette migration exécutée avec succès..."

echo
echo "— Migration 0164 (fermeture de salon par l'hôte) —"
pbcopy < supabase/migrations/0164_close_lobby.sql
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
    msg="Renomme Le Juge en La Chasseuse et ajoute la fermeture de salon par l'hôte"
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
echo "  - Salon d'attente : la case s'appelle maintenant '🎯 La Chasseuse'."
echo "  - Salon d'attente, en tant qu'hôte : le panneau de modération (⋮)"
echo "    montre maintenant une section '🚪 Fermer le salon' (à la place de"
echo "    'Recommencer la partie', qui n'apparaît que hors du salon)."
echo "  - Fermer le salon → tous les joueurs présents (hôte compris) doivent"
echo "    atterrir sur un écran '🚪 Salon fermé' avec un seul bouton 'Quitter"
echo "    le salon', puis revenir au tableau de bord."
echo

read -p "Appuie sur Entrée pour fermer..."
