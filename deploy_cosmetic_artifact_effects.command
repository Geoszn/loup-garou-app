#!/bin/bash
# Double-clique sur ce fichier pour déployer les effets de Masque du Griot
# et Plume d'Anancy (migration 0151) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#  - Masque du Griot : un cadre doré en pointillés autour de l'avatar,
#    visible de tous les autres joueurs en partie (PlayerGrid.tsx) — style
#    volontairement différent du cadre de palier de rang, pour ne jamais
#    confondre "a un rang élevé" et "a acheté un artefact".
#  - Plume d'Anancy : un petit titre affiché sous le pseudo, visible de tous
#    en partie — reprend le nom de l'artefact tel qu'édité dans le dashboard
#    admin (jamais recopié en dur côté client).
#  - Ces deux artefacts restent INACTIFS par défaut dans le catalogue (comme
#    depuis leur création) — active-les depuis l'onglet Artefacts quand tu es
#    prêt, l'effet fonctionnera immédiatement pour qui les achète.
#
# Rappel : Pierre des Ancêtres et Griffe de la Meute n'ont toujours AUCUN
# effet câblé — la première attend une décision sur son équilibrage (voir
# discussion pay-to-win), la seconde est un objet de collection pur, sans
# effet prévu.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Effets cosmétiques (Masque du Griot, Plume d'Anancy)"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0151_cosmetic_artifact_effects.sql
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
    msg="Implémente les effets de Masque du Griot (cadre de profil) et Plume d'Anancy (titre de profil)"
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
echo "  - Dashboard admin, onglet Artefacts : active Masque du Griot et/ou"
echo "    Plume d'Anancy, achète-les avec un compte de test depuis le Loup"
echo "    Store."
echo "  - En salon d'attente ou en partie, ce compte doit apparaître dans la"
echo "    grille de joueurs avec un cadre doré en pointillés (Masque du"
echo "    Griot) et/ou un petit titre italique sous son pseudo (Plume"
echo "    d'Anancy) — visible par TOUS les autres joueurs, pas seulement lui."
echo "  - Renommer l'artefact 'Plume d'Anancy' depuis le dashboard admin doit"
echo "    changer le titre affiché en partie sans rien redéployer."
echo

read -p "Appuie sur Entrée pour fermer..."
