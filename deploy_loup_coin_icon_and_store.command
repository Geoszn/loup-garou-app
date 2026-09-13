#!/bin/bash
# Double-clique sur ce fichier pour déployer le symbole Loup Coin + le Loup
# Store (migration 0147) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#  - Nouveau symbole dédié aux Loup Coins (pièce dorée + empreinte de patte,
#    LoupCoinIcon.tsx) à la place de l'emoji 🪙 générique, partout dans
#    l'appli (badge du tableau de bord, quêtes, Statistiques, dashboard admin).
#  - Le badge Loup Coins du tableau de bord et la carte Loup Coins des
#    Statistiques sont désormais cliquables : ils ouvrent une nouvelle page
#    "Loup Store" (/loup-store) qui affiche le solde, le total gagné et
#    l'historique complet des transactions (nouvelle table
#    loup_coins_transactions, alimentée par claim_quest_reward).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Symbole Loup Coin + Loup Store — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0147_loup_coins_history.sql
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
    msg="Ajoute un symbole dédié aux Loup Coins et la page Loup Store (solde, total gagné, historique)"
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
echo "  - Le badge Loup Coins du tableau de bord (à côté du badge de rang)"
echo "    affiche la pièce dorée avec l'empreinte de patte, plus l'emoji, et"
echo "    ouvre la page Loup Store en cliquant dessus."
echo "  - Page Statistiques : la carte Loup Coins ouvre aussi le Loup Store."
echo "  - Loup Store : solde correct, total gagné correct, et l'historique"
echo "    liste bien chaque quête déjà réclamée avec sa date."
echo "  - Réclamer une nouvelle quête : elle doit apparaître immédiatement en"
echo "    haut de l'historique au rechargement de la page, et le solde/total"
echo "    gagné doivent augmenter du bon montant."
echo

read -p "Appuie sur Entrée pour fermer..."
