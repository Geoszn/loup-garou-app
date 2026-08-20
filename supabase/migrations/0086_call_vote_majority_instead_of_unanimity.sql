-- ============================================================================
-- Demande utilisateur : "Si la majorité des voix sont d'accord, le
-- modérateur peut passer la partie. Donc pas besoin d'attendre la totalité
-- des accords." Appliqué aux deux variantes du mécanisme d'appel au vote
-- (submit_captain_call_vote et submit_host_call_vote, migrations 0066/0085) :
-- toutes deux partagent la même table vote_call_agreements et la même
-- logique "tous les autres doivent être d'accord" — les changer ensemble
-- garde les deux chemins cohérents entre eux plutôt que d'avoir une règle
-- différente selon qu'il y a un Capitaine ou non.
--
-- Seuil retenu : majorité stricte des AUTRES joueurs vivants (plus de la
-- moitié), pas la totalité — ex. 4 autres joueurs : 3 suffisent (2 ne
-- suffit pas, c'est une égalité). 0 autre joueur (cas limite, salon à 2) :
-- seuil à 0, rien à attendre.
-- ============================================================================
set search_path = public;

create or replace function public.submit_captain_call_vote(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive_count int;
  v_agreed_count int;
  v_needed int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'day_discussion' then
    raise exception 'Le débat n’est pas en cours.';
  end if;
  if not exists (
    select 1 from public.game_players
    where game_id = p_game_id and user_id = v_user and is_alive and is_captain
  ) then
    raise exception 'Seul le Capitaine peut lancer le vote.';
  end if;

  select count(*) into v_alive_count
  from public.game_players
  where game_id = p_game_id and is_alive and not is_captain;
  select count(*) into v_agreed_count
  from public.vote_call_agreements
  where game_id = p_game_id and day_number = v_game.night_number;

  v_needed := case when v_alive_count = 0 then 0 else v_alive_count / 2 + 1 end;
  if v_agreed_count < v_needed then
    raise exception 'La majorité du village doit être d’accord avant de lancer le vote.';
  end if;

  insert into public.game_log (game_id, message)
  select p_game_id, '🎖️ ' || gp.display_name || ' (Capitaine) lance le vote, avec l’accord de la majorité du village !'
  from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_user;

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_captain_call_vote(uuid) to authenticated;

create or replace function public.submit_host_call_vote(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive_count int;
  v_agreed_count int;
  v_needed int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'day_discussion' then
    raise exception 'Le débat n’est pas en cours.';
  end if;
  if coalesce((v_game.settings->'role_counts'->>'capitaine')::boolean, false) then
    raise exception 'Cette partie a un Capitaine : c’est à lui de lancer le vote.';
  end if;
  if v_game.host_id <> v_user then
    raise exception 'Seul le modérateur peut lancer le vote.';
  end if;

  select count(*) into v_alive_count
  from public.game_players
  where game_id = p_game_id and is_alive and user_id <> v_game.host_id;
  select count(*) into v_agreed_count
  from public.vote_call_agreements
  where game_id = p_game_id and day_number = v_game.night_number;

  v_needed := case when v_alive_count = 0 then 0 else v_alive_count / 2 + 1 end;
  if v_agreed_count < v_needed then
    raise exception 'La majorité du village doit être d’accord avant de lancer le vote.';
  end if;

  insert into public.game_log (game_id, message)
  select p_game_id, '🛠️ ' || gp.display_name || ' (Modérateur) lance le vote, avec l’accord de la majorité du village !'
  from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_user;

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_host_call_vote(uuid) to authenticated;
