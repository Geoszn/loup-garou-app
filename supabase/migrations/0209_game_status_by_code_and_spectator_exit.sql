-- Nouveau choix "rejoindre ou regarder" quand la partie visée est déjà en
-- cours (voir JoinByLink.tsx, PublicGamesBrowser.tsx,
-- GameInProgressChoice.tsx) : la table `games` n'est lisible que par ses
-- participants (games_select_participants, migration 0008) — un inconnu
-- qui clique un lien d'invitation ne peut donc PAS savoir si la partie est
-- encore au salon ou déjà en cours avant d'appeler join_game (qui, lui,
-- crée déjà la demande). Cette fonction expose UNIQUEMENT le statut (aucun
-- autre champ) pour n'importe quel code existant, sans exiger d'en être
-- participant — nécessaire pour décider d'afficher le choix AVANT de créer
-- quoi que ce soit.
--
-- (Sortir du mode spectateur en un clic, SpectateGame.tsx, n'a besoin
-- d'aucun ajout : cancel_join_request, migration 0033, fait déjà
-- exactement ça.)
set search_path = public;

create or replace function public.get_game_status_by_code(p_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from public.games where code = upper(p_code);
$$;

revoke execute on function public.get_game_status_by_code(text) from public, anon;
grant execute on function public.get_game_status_by_code(text) to authenticated;
