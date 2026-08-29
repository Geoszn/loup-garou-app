#!/bin/bash
# Double-clique sur ce fichier pour déployer le correctif Alpha
# éliminer/infecter — pas de migration SQL cette fois (uniquement le
# client, réutilise les deux RPC déjà en place) :
#   1. Vérifie le code (TypeScript + grants RPC + build).
#   2. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Correctif Alpha éliminer/infecter — déploiement"
echo "==========================================="
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
  echo "Aucun changement de code à pousser."
else
  echo
  read -p "Message de commit (laisse vide pour un message automatique) : " msg
  if [ -z "$msg" ]; then
    msg="Corrige la confusion Alpha éliminer/infecter : pop-up à double choix explicite une fois la majorité atteinte"
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
echo "À tester avec 1 Alpha + 2 loups simples :"
echo "  - Les 2 loups simples votent 'Infecter' jusqu'à la majorité (barre à 100%)."
echo "  - L'Alpha choisit une cible dans la grille : le nouveau pop-up 'Éliminer ou infecter ?' apparaît,"
echo "    avec les 2 boutons distincts."
echo "  - Cliquer 'Infecter [nom]' : à la résolution, le joueur est INFECTÉ (rejoint les loups), pas tué."
echo "  - Avant que la majorité soit atteinte, le pop-up reste inchangé (un seul bouton 'Confirmer')."
echo
read -p "Appuie sur Entrée pour fermer..."
