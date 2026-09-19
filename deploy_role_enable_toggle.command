#!/bin/bash
# Double-clique sur ce fichier pour déployer cette fonctionnalité :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu : les admins peuvent désormais activer/désactiver chaque rôle
# (sauf Loup-Garou et Villageois, structurellement obligatoires) depuis le
# dashboard → Contenu du jeu → Cartes des rôles, via un bouton par carte
# ("🚫 Désactiver" / "✅ Réactiver"). Un rôle désactivé :
#   - disparaît de la liste des cases à cocher que l'hôte voit dans le salon
#     d'attente (réglages → Rôles) ;
#   - ne peut plus être tiré au hasard par le mode automatique ;
#   - est rejeté par start_game même en cas de contournement direct de
#     l'API (garde-fou serveur).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Activer/désactiver des cartes de rôle (admin)"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
echo
pbcopy < supabase/migrations/0161_role_enable_toggle.sql
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
    msg="Ajoute l'activation/désactivation des rôles depuis le dashboard admin"
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
echo "  - Dashboard admin → Contenu du jeu → Cartes des rôles : chaque carte"
echo "    (sauf Loup-Garou) a maintenant un bouton 'Désactiver'/'Réactiver'."
echo "  - Désactive un rôle (ex. Voyante), puis ouvre un salon d'attente :"
echo "    sa case doit avoir disparu de la liste manuelle."
echo "  - Toujours ce rôle désactivé : active le mode automatique et vérifie"
echo "    l'aperçu plusieurs fois — il ne doit plus jamais être proposé."
echo "  - Réactive-le : la case doit réapparaître dans le salon."
echo

read -p "Appuie sur Entrée pour fermer..."
