#!/bin/bash
# Double-clique sur ce fichier pour déployer les 5 nouveaux effets
# d'artefacts (migration 0152) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# IMPORTANT : cette migration n'insère AUCUN artefact dans le catalogue —
# c'est toi qui les crées depuis l'onglet Artefacts (nom, prix, image,
# catégorie), en choisissant le bon effet dans le menu déroulant désormais
# enrichi de 5 nouvelles options :
#   - Boussole du Village   → effet "boussole_village"
#   - Masque du Sans-Visage → effet "masque_sans_visage"
#   - Balance de l'Ange     → effet "balance_ange"
#   - Pierre des Ancêtres   → effet "pierre_ancetres"
#   - Feu Sacré des Ancêtres→ effet "feu_sacre_ancetres"
#   - Flamme des Esprits    → réutilise l'effet existant "dernier_souffle"
#     (c'est exactement le même mécanisme que Dernier Souffle, juste sous un
#     autre nom/prix/image si tu veux les proposer séparément)

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " 5 nouveaux effets d'artefacts — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0152_new_artifact_effects.sql
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
    msg="Implémente les effets de Boussole du Village, Masque du Sans-Visage, Balance de l'Ange, Pierre des Ancêtres et Feu Sacré des Ancêtres"
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
echo "À tester une fois déployé (crée d'abord chaque artefact depuis l'onglet"
echo "Artefacts avec l'effet correspondant, achète-le avec un compte de test) :"
echo "  - Boussole du Village : après au moins un jour de vote, le panneau"
echo "    'Boussole du Village' doit apparaître en haut de l'écran de jeu"
echo "    (repliable) avec l'historique des votes des jours précédents."
echo "  - Masque du Sans-Visage : la Voyante qui inspecte le propriétaire"
echo "    doit toujours voir 'Villageois', même si son rôle réel est loup."
echo "  - Balance de l'Ange : provoque une égalité de vote (2 joueurs à"
echo "    égalité) avec le propriétaire vivant — un panneau '⚖️ Balance de"
echo "    l'Ange' doit lui proposer de choisir qui éliminer, à la place de"
echo "    l'écran de vote normal."
echo "  - Pierre des Ancêtres : le propriétaire éliminé (nuit ou vote) doit"
echo "    voir sa mort annoncée normalement, puis un message 'revient"
echo "    d'entre les morts' au tout prochain passage au jour — et"
echo "    redevient bien is_alive dans la grille."
echo "  - Feu Sacré des Ancêtres : le propriétaire le plus voté un jour ne"
echo "    doit PAS être éliminé — le récap affiche 'un feu sacré a protégé"
echo "    quelqu'un', et le protégé lui-même voit en plus une notice privée."
echo "  - Flamme des Esprits (effet 'dernier_souffle') : fonctionne à"
echo "    l'identique de Dernier Souffle — un message après élimination."
echo

read -p "Appuie sur Entrée pour fermer..."
