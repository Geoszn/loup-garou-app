#!/bin/bash
# Double-clique sur ce fichier pour déployer les quêtes quotidiennes
# (migration 0112) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + build).
#   3. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Quêtes quotidiennes — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0112_daily_quests.sql
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
echo "→ Build de production..."
npm run build

echo
echo "→ Étape 3/3 : déploiement"
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
    msg="Ajoute des quêtes quotidiennes (3 objectifs aléatoires, récompensés en points de rang)"
  fi
  git add -A
  git commit -m "$msg"
  echo
  echo "→ Envoi vers GitHub (Vercel va redéployer automatiquement)..."
  git push
fi

echo
echo "✅ Terminé. Vercel reconstruit le site — 1 à 2 minutes."
echo
echo "À tester :"
echo "  - Dashboard admin, onglet 'Quêtes' : le catalogue de départ (6 quêtes) apparaît."
echo "  - Modifier le texte/objectif/récompense d'une quête, Désactiver une autre."
echo "  - Tableau de bord joueur : 3 quêtes apparaissent (assignées au premier chargement du jour)."
echo "  - Terminer une partie : la ou les quêtes concernées avancent (rafraîchir le tableau de bord)."
echo "  - Une quête terminée propose 'Réclamer' : le badge de rang augmente après clic."
echo "  - Recharger la page après une partie : pas de double comptage (même progression)."
echo
read -p "Appuie sur Entrée pour fermer..."
