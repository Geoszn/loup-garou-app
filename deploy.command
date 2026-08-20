#!/bin/bash
# Double-clique sur ce fichier dans le Finder pour vérifier et déployer
# les dernières mises à jour de Loup Garou d'Afrique.
#
# Ce script : vérifie le code (TypeScript + grants RPC), construit le
# projet, puis commit + push vers GitHub. Vercel redéploie automatiquement
# dès que GitHub reçoit le push (rien d'autre à faire côté Vercel).
#
# Important : les migrations SQL (dossier supabase/migrations) ne sont PAS
# appliquées automatiquement par ce script — elles doivent toujours être
# collées et exécutées à la main dans l'éditeur SQL de Supabase, comme
# aujourd'hui, avant ou après le push (l'ordre ne change rien tant que le
# code déployé reste compatible avec la base actuelle).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus). Rien n'\''a été poussé."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "======================================"
echo " Loup Garou d'Afrique — Déploiement"
echo "======================================"
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
echo "→ Fichiers modifiés :"
git status --short

CHANGES=$(git status --porcelain)
if [ -z "$CHANGES" ]; then
  echo
  echo "Aucun changement à déployer."
  read -p "Appuie sur Entrée pour fermer..."
  exit 0
fi

echo
read -p "Message de commit (laisse vide pour un message automatique) : " msg
if [ -z "$msg" ]; then
  msg="Mise à jour du $(date '+%Y-%m-%d %H:%M')"
fi

git add -A
git commit -m "$msg"

echo
echo "→ Envoi vers GitHub (Vercel va redéployer automatiquement)..."
git push

echo
echo "✅ Déployé. Vercel reconstruit le site — ça prend en général 1 à 2 minutes."
echo "N'oublie pas d'appliquer les migrations SQL en attente dans Supabase si besoin."
echo
read -p "Appuie sur Entrée pour fermer..."
