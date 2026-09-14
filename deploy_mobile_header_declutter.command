#!/bin/bash
# Double-clique sur ce fichier pour déployer le nettoyage de l'en-tête mobile
# du tableau de bord :
#   1. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build). Pas de migration SQL cette fois — ce
#      changement est purement front-end.
#   2. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#  - Sur mobile, l'en-tête du tableau de bord ne garde que le badge de rang
#    (points + série de victoires). Les badges Loup Coins et série de
#    connexion, auparavant collés à côté du menu compte, ont déménagé en
#    haut de ce menu (deux lignes surlignées, au-dessus d'Aide/Mon compte/
#    Statistiques/Amis) — Loup Coins reste cliquable vers le Loup Store.
#  - Le logo et le pseudo ne sont plus tronqués aussi agressivement, faute
#    de devoir se partager la place avec quatre badges séparés.
#  - LoupCoinsBadge.tsx et LoginStreakBadge.tsx sont supprimés (plus aucun
#    appelant) — leurs commentaires-pointeurs dans DailyLoginBanner.tsx et
#    LoupStore.tsx ont été mis à jour en conséquence.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

echo "==========================================="
echo " En-tête mobile : Loup Coins + série de connexion dans le menu compte"
echo "==========================================="
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
echo "→ Préparation du commit"
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
    msg="Déplace Loup Coins et série de connexion du header mobile vers le menu compte"
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
echo "À tester une fois déployé, sur mobile (ou fenêtre réduite) :"
echo "  - Dashboard : l'en-tête ne montre plus que le badge de rang à côté"
echo "    du menu compte — logo et pseudo tiennent mieux qu'avant."
echo "  - Ouvrir le menu compte (avatar + pseudo) : les deux premières"
echo "    lignes sont Loup Coins (cliquable → Loup Store) et Série de"
echo "    connexion (affichée seulement si ≥ 2 jours, comme avant)."
echo "  - Avec un pseudo long ou de gros nombres (beaucoup de Loup Coins,"
echo "    longue série), rien ne doit être coupé ni se chevaucher dans le"
echo "    menu déroulant."
echo

read -p "Appuie sur Entrée pour fermer..."
