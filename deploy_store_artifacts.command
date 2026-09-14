#!/bin/bash
# Double-clique sur ce fichier pour déployer le Loup Store, phase 2 —
# système d'achat d'artefacts (migration 0148) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#  - Nouvel onglet "Artefacts" dans le dashboard admin : catalogue
#    d'artefacts spéciaux (nom/description FR+EN, prix en Loup Coins,
#    actif/inactif), achetables depuis le Loup Store (nouvelle section
#    "Boutique" sur /loup-store).
#  - Deux artefacts pour commencer, achat permanent (une fois pour toutes
#    les parties futures) :
#      • Parchemin du Griot : un Loup éliminé garde accès en LECTURE au chat
#        de son ex-meute pendant les nuits suivantes.
#      • Dernier Souffle : un joueur éliminé peut envoyer UN message au
#        village entier, visible de tous, juste après son élimination (une
#        fois par partie).
#  - Corrige au passage un bug pré-existant découvert en touchant à
#    can_read_channel : un Grand Méchant Loup vivant pouvait écrire dans le
#    chat des loups mais pas le relire après un rechargement de page (liste
#    de rôles incomplète, oubliée depuis la migration 0121).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Loup Store — achat d'artefacts — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0148_store_artifacts.sql
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
    msg="Ajoute le système d'achat d'artefacts du Loup Store (Parchemin du Griot, Dernier Souffle) et l'onglet admin de gestion"
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
echo "  - Dashboard admin, onglet 'Artefacts' : les deux artefacts (Parchemin"
echo "    du Griot, Dernier Souffle) apparaissent, avec leur identifiant"
echo "    technique affiché (parchemin_griot / dernier_souffle) et non"
echo "    modifiable en édition."
echo "  - Loup Store (/loup-store) : la section 'Boutique' liste les deux"
echo "    artefacts actifs avec leur prix ; achat possible si le solde"
echo "    suffit, bouton 'Possédé' après achat, solde débité du bon montant"
echo "    (visible aussi dans l'historique juste en dessous)."
echo "  - En partie : un Loup possédant le Parchemin du Griot, une fois"
echo "    éliminé, doit voir apparaître un panneau de lecture du chat des"
echo "    Loups la nuit suivante — un fantôme SANS l'artefact ne doit rien"
echo "    voir de plus qu'avant (village + cimetière)."
echo "  - Un joueur possédant Dernier Souffle, une fois éliminé, doit voir un"
echo "    petit formulaire 'Dernier Souffle' ; envoyer un message doit"
echo "    l'afficher immédiatement dans le chat village (visible des"
echo "    vivants), habillé différemment (bordure/fond ambré, mention"
echo "    'Dernier souffle') — le formulaire ne doit plus jamais réapparaître"
echo "    ensuite pour cette partie."
echo

read -p "Appuie sur Entrée pour fermer..."
