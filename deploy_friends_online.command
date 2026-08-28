#!/bin/bash
# Double-clique sur ce fichier pour déployer "Amis en ligne" — pas de
# migration SQL cette fois (réutilise get_my_social déjà existant, juste un
# nouveau canal de présence Realtime côté client) :
#   1. Vérifie le code (TypeScript + grants RPC + build).
#   2. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Amis en ligne — déploiement"
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
    msg="Ajoute un indicateur d'amis en ligne sur le tableau de bord (présence globale)"
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
echo "À tester avec 2 comptes amis :"
echo "  - Les deux connectés sur le tableau de bord : chacun voit l'autre 'disponible'."
echo "  - L'un entre dans une partie : l'autre le voit passer 'en partie' avec le code, copiable."
echo "  - Fermer l'onglet d'un des deux : il disparaît de la liste de l'autre en quelques secondes."
echo
read -p "Appuie sur Entrée pour fermer..."
