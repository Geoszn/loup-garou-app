#!/bin/bash
# Double-clique sur ce fichier pour déployer la refonte du panneau de
# réglages du salon — pas de migration SQL (client uniquement) :
#   1. Vérifie le code (TypeScript + grants RPC + build).
#   2. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " Refonte du panneau de réglages — déploiement"
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
    msg="Refonte du panneau de réglages du salon : onglets Rôles/Durées/Modération, rôles groupés en cartes, préréglages de durée"
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
echo "N'oublie pas : recharge complètement la page/l'appli avant de tester."
echo
echo "À tester (en tant qu'hôte d'un salon) :"
echo "  - Ouvrir ⚙️ Réglages : 3 onglets (Rôles/Durées/Modération) au lieu"
echo "    d'une seule liste."
echo "  - Onglet Rôles : Loup-Garou reste un compteur mis en avant, les autres"
echo "    rôles sont des cartes groupées (Loups / Village / Rôles maison /"
echo "    Autre) — cliquer une carte l'active/désactive, cliquer le ⓘ affiche"
echo "    sa description sans toucher à son état."
echo "  - La barre Loups/Village en haut du panneau doit bouger en direct"
echo "    quand on active/désactive des rôles."
echo "  - Onglet Durées : 3 préréglages (Rapide/Normal/Long) + un bouton"
echo "    'Réglages avancés' replié par défaut qui révèle les 8 curseurs fins."
echo "  - Onglet Modération : le panneau existant (kick/ban/mute), inchangé."
echo "  - Lancer une partie avec des réglages personnalisés doit toujours"
echo "    appliquer exactement ce qui a été choisi (aucun changement côté"
echo "    serveur, uniquement l'affichage)."
echo
read -p "Appuie sur Entrée pour fermer..."
