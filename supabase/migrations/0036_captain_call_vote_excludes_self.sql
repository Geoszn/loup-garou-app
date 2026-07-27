-- ----------------------------------------------------------------------------
-- submit_captain_call_vote : le Capitaine n'a plus besoin de se déclarer
-- lui-même "d'accord" avant de pouvoir lancer le vote (voir GameRoom.tsx,
-- CallVotePanel — son bouton "Je suis d'accord" ne lui est plus montré du
-- tout). Le quota requis ne compte donc plus que les AUTRES joueurs encore
-- en vie, pas le Capitaine lui-même. Reprise intégrale de 0021, avec juste
-- ce filtre `and not is_captain` en plus sur le calcul de v_alive_count.
-- ----------------------------------------------------------------------------
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

  if v_agreed_count < v_alive_count then
    raise exception 'Tout le village doit être d’accord avant de lancer le vote.';
  end if;

  insert into public.game_log (game_id, message)
  select p_game_id, '🎖️ ' || gp.display_name || ' (Capitaine) lance le vote, avec l’accord de tout le village !'
  from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_user;

  perform public.advance_phase(p_game_id, true);
end;
$$;
