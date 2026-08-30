-- ============================================================================
-- 1. Corrige une contrainte oubliée dans la migration 0116 : la colonne
-- games.night_step a une contrainte CHECK listant explicitement les valeurs
-- autorisées (jamais vérifiée avant d'écrire cette migration — erreur de ma
-- part) qui n'incluait pas 'griot'. Résultat en production : dès que
-- next_night_step tentait de passer à l'étape du Griot, l'UPDATE échouait
-- ("new row for relation games violates check constraint
-- games_night_step_check"), bloquant toute la nuit (y compris la Voyante,
-- déjà passée mais dont le tour suivant ne pouvait plus avancer).
--
-- 2. Corrige un vrai comportement manquant, sans rapport avec le Griot :
-- resolve_captain_election, quand AUCUN vote n'est exprimé pour l'élection
-- du Capitaine, faisait continuer la partie sans capitaine du tout. Le
-- reste du jeu tire déjà au sort un joueur vivant dans une situation
-- équivalente (succession du Capitaine à sa mort, voir advance_phase) — même
-- principe appliqué ici : sans vote, un capitaine est désormais désigné au
-- hasard plutôt que de laisser le rôle vacant.
-- ============================================================================
set search_path = public;

alter table public.games drop constraint if exists games_night_step_check;
alter table public.games add constraint games_night_step_check
  check (night_step = any (array['voleur','cupidon','enfant_sauvage','voyante','griot','loup_garou','sorciere','petite_fille','resolve']));

create or replace function public.resolve_captain_election(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top record;
  v_random_id uuid;
  v_random_name text;
begin
  select target_id, count(*) as votes into v_top
  from public.votes
  where game_id = p_game_id and round_number = 0 and target_id is not null
  group by target_id
  order by count(*) desc, random()
  limit 1;

  if v_top.target_id is not null then
    update public.game_players set is_captain = true where game_id = p_game_id and user_id = v_top.target_id;

    insert into public.game_log (game_id, message)
    select p_game_id, '🎖️ ' || gp.display_name || ' est élu(e) Capitaine du village !'
    from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_top.target_id;
  else
    select user_id, display_name into v_random_id, v_random_name
    from public.game_players
    where game_id = p_game_id and is_alive
    order by random()
    limit 1;

    if v_random_id is not null then
      update public.game_players set is_captain = true where game_id = p_game_id and user_id = v_random_id;

      insert into public.game_log (game_id, message)
      values (p_game_id, '🗳️ Aucun vote exprimé pour l''élection du Capitaine : le sort en a décidé — ' || v_random_name || ' devient Capitaine !');
    else
      -- Filet de sécurité (ne devrait jamais arriver en pratique, comme le
      -- cas équivalent dans advance_phase) : aucun joueur vivant du tout.
      insert into public.game_log (game_id, message)
      values (p_game_id, '🗳️ Aucun vote exprimé pour l''élection du Capitaine : la partie se jouera sans lui.');
    end if;
  end if;
end;
$$;
