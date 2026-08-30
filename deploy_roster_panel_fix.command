#!/bin/bash
# Double-clique sur ce fichier pour déployer le correctif du panneau
# "Effectifs" (📊) — pas de migration SQL (client uniquement) :
#   1. Vérifie le code (TypeScript + grants RPC + build).
#   2. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Correctif panneau Effectifs — déploiement"
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
    msg="Recadre le panneau Effectifs dans une pop-up centrée et lui ajoute le Griot et Anancy (comptage des loups corrigé pour le Sans-Visage)"
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
echo "  - Ouvrir le panneau 📊 (Effectifs) pendant une partie : il s'ouvre maintenant"
echo "    au centre de l'écran, plus jamais coupé sur le côté."
echo "  - Si le Griot et/ou Anancy sont activés dans la partie : ils apparaissent"
echo "    désormais dans 'Rôles spéciaux' avec leur statut vivant/éliminé."
echo "  - Si le Sans-Visage est activé : il est bien compté dans le total"
echo "    'Loups-Garous' (avant : absent du compte, total sous-évalué)."
echo "  - Si Anancy est activé : le total 'Village' est correct (avant : Anancy"
echo "    était compté à tort comme un villageois)."
echo
read -p "Appuie sur Entrée pour fermer..."
