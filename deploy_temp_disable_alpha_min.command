#!/bin/bash
# Double-clique sur ce fichier pour déployer la désactivation TEMPORAIRE de
# la contrainte "10 joueurs minimum pour le Loup Alpha" (migration 0114) —
# uniquement du SQL, rien à vérifier/build côté client :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Prévient qu'il faudra remettre la contrainte plus tard.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " ⚠️  TEMPORAIRE : désactivation du minimum de 10 joueurs (Alpha)"
echo "==========================================="
echo

pbcopy < supabase/migrations/0114_temp_disable_alpha_min_players.sql
echo "Le contenu de la migration a été copié dans le presse-papiers."
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "→ Dans l'éditeur SQL qui vient de s'ouvrir : colle (Cmd+V) puis clique sur Run."
read -p "Appuie sur Entrée une fois la migration exécutée avec succès..."

echo
echo "✅ Terminé — pas de build/déploiement Vercel nécessaire (SQL uniquement)."
echo
echo "Tu peux maintenant démarrer une partie avec le Loup Alpha activé, quel"
echo "que soit le nombre de joueurs (le message d'avertissement dans les"
echo "réglages du salon restera affiché — c'est juste un texte, il ne bloque"
echo "plus rien côté serveur)."
echo
echo "⚠️  PENSE À ME DEMANDER DE RESTAURER LA CONTRAINTE une fois tes tests"
echo "terminés — ce n'est pas la règle définitive du jeu."
echo
read -p "Appuie sur Entrée pour fermer..."
