#!/bin/bash
# Double-clique sur ce fichier pour déployer le nouveau rôle "Le Juge" :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu : nouveau rôle neutre indépendant, "Le Juge" (⚖️). À partir de la
# deuxième nuit, une cible vivante lui est attribuée automatiquement, en
# secret — jamais son camp ni son rôle. Il gagne seul si cette cible est
# condamnée par le vote du village. Si elle meurt autrement, il choisit
# d'abandonner (devient un simple Villageois) ou de recevoir une nouvelle
# cible (une seule fois par partie) ; une deuxième cible perdue de la même
# façon le convertit automatiquement en Villageois. Disponible uniquement en
# configuration manuelle pour l'instant (comme le Daron), avec bouton
# activer/désactiver dans le dashboard admin comme les autres rôles.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Nouveau rôle : Le Juge"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
echo
pbcopy < supabase/migrations/0162_juge_role.sql
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
    msg="Ajoute Le Juge, nouveau rôle neutre indépendant"
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
echo "  - Dashboard admin → Contenu du jeu → Cartes des rôles : 'Le Juge'"
echo "    apparaît, avec son bouton activer/désactiver."
echo "  - Salon d'attente (configuration manuelle) : nouvelle case '⚖️ Le"
echo "    Juge' dans le groupe 'Rôles maison'."
echo "  - Une partie manuelle avec le Juge activé : sa carte de rôle s'affiche"
echo "    normalement à la révélation ; à partir de la DEUXIÈME nuit, un"
echo "    encart 'Votre cible' apparaît avec un nom."
echo "  - Faire éliminer cette cible par le VOTE du village → le Juge doit"
echo "    gagner immédiatement, écran de fin '⚖️ Le Juge l'emporte !'."
echo "  - Faire mourir la cible AUTREMENT (loups, poison...) → le Juge doit"
echo "    voir un panneau 'Abandonner / Continuer' apparaître, même hors du"
echo "    statut où c'est arrivé (nuit suivante, jour...)."
echo "  - 'Continuer' doit donner une nouvelle cible ; répéter l'échec une"
echo "    deuxième fois doit convertir automatiquement en Villageois, sans"
echo "    aucune annonce publique dans le journal de partie."
echo

read -p "Appuie sur Entrée pour fermer..."
