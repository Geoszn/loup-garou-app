#!/bin/bash
# Double-clique sur ce fichier pour déployer le filtre par catégorie de la
# boutique + le menu déroulant "Effet" côté admin (migration 0150) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle (voir note
#      en bas de ce script : Claude Code refuse d'écrire un script qui
#      pousserait tout seul, quel que soit le contexte).
#
# Contenu :
#  - Boutique du Loup Store : la liste par catégories empilées (qui prenait
#    trop de place à l'écran) est remplacée par des chips de filtre ("Tout" +
#    une par catégorie réellement en vente) au-dessus d'une seule grille.
#  - Dashboard admin, formulaire d'artefact : nouveau menu déroulant "Effet",
#    distinct de l'identifiant technique — 3 effets prédéfinis pour
#    commencer (Aucun effet / Parchemin du Griot / Dernier Souffle),
#    d'autres arriveront avec leur propre migration au fur et à mesure.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Filtre boutique + menu Effet — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0150_artifact_effects.sql
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
    msg="Ajoute un filtre par catégorie à la boutique du Loup Store et un menu déroulant Effet côté admin"
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
echo "  - Loup Store (/loup-store), section Boutique : des chips 'Tout' /"
echo "    'Outils' / 'Rares' / 'Cosmétiques' / 'Fragments' apparaissent"
echo "    au-dessus d'une seule grille — cliquer sur une chip filtre la"
echo "    grille sans jamais empiler plusieurs sections à la suite."
echo "  - Dashboard admin, onglet Artefacts : modifier un artefact affiche"
echo "    bien son effet actuel dans le menu déroulant, et la liste affiche"
echo "    une ligne 'Effet : ...' sous chaque artefact."
echo "  - Parchemin du Griot et Dernier Souffle fonctionnent toujours"
echo "    exactement comme avant (le moteur vérifie maintenant effect_key"
echo "    au lieu de key, mais le comportement observable ne change pas)."
echo

read -p "Appuie sur Entrée pour fermer..."
