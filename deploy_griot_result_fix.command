#!/bin/bash
# Double-clique sur ce fichier pour déployer le correctif du résultat du
# Griot — pas de migration SQL (client uniquement) :
#   1. Vérifie le code (TypeScript + grants RPC + build).
#   2. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Correctif résultat du Griot — déploiement"
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
    msg="Corrige la disparition instantanée du résultat du Griot après son choix (résultat désormais persistant, comme pour la Voyante)"
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
echo "N'oublie pas : recharge complètement la page/l'appli avant de tester"
echo "(pas juste revenir dans l'onglet) pour être sûr d'avoir le nouveau code."
echo
echo "À tester :"
echo "  - Le Griot observe un joueur : un encart 'Ce que vous avez appris' apparaît"
echo "    et reste affiché, même une fois la phase suivante commencée."
echo
read -p "Appuie sur Entrée pour fermer..."
