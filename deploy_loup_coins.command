#!/bin/bash
# Double-clique sur ce fichier pour déployer les Loup Coins (migration
# 0146) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#  - Nouvelle monnaie "Loup Coins" (profiles.loup_coins), gagnée
#    exclusivement en réclamant les quêtes quotidiennes — les points de rang
#    ne viennent plus des quêtes, seulement des victoires/de l'impact en
#    partie comme avant. Le total accumulé est affiché en badge sur le
#    tableau de bord et dans une carte dédiée sur la page Statistiques.
#  - Système de quêtes enrichi côté admin (onglet "Quêtes") :
#      • Poids/rareté par quête (tirage pondéré, plus une quête à poids
#        élevé a de chances d'être tirée chaque jour, sans jamais l'être à
#        coup sûr).
#      • Trois nouvelles conditions : jouer un rôle précis, gagner avec un
#        rôle précis, atteindre une série de victoires d'affilée.
#      • La récompense se règle désormais en Loup Coins (au lieu de points
#        de rang).
#
# ⚠️ Migration de renommage de colonne (reward_points -> reward_coins) et de
# signature RPC (admin_upsert_quest_template) : à exécuter en une seule fois
# via l'éditeur SQL, pas en plusieurs morceaux.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Loup Coins — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0146_loup_coins.sql
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
    msg="Ajoute la monnaie Loup Coins (gagnée via les quêtes quotidiennes) et enrichit le système de quêtes côté admin (poids, nouvelles conditions)"
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
echo "  - Onglet admin 'Quêtes' : créer une quête avec la condition 'Jouer un"
echo "    rôle précis' ou 'Gagner avec un rôle précis' (le sélecteur de rôle"
echo "    doit apparaître), régler un poids > 1, et une récompense en 🪙."
echo "  - Jouer une partie complète, la terminer : les quêtes concernées"
echo "    doivent avancer, et réclamer une quête terminée doit créditer les"
echo "    Loup Coins (badge 🪙 du tableau de bord ET carte dédiée sur la page"
echo "    Statistiques doivent se mettre à jour), PAS les points de rang."
echo "  - Vérifier qu'une quête à poids élevé revient plus souvent dans le"
echo "    tirage du jour qu'une quête à poids 1 (sur plusieurs comptes de"
echo "    test, ou en resemant via un nouveau jour)."
echo

read -p "Appuie sur Entrée pour fermer..."
