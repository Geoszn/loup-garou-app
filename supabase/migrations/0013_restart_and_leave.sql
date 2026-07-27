-- ============================================================================
-- restart_game : relance une nouvelle partie avec le même groupe une fois
-- la précédente terminée (même code, mêmes joueurs restants).
--
-- Amélioration de leave_game : quitter une partie terminée retire vraiment
-- le joueur du salon (comme quitter le lobby), pour ne pas être réintégré
-- automatiquement si l'hôte relance une partie. Quitter une partie en cours
-- reste un "abandon" doux (le joueur meurt, mais sa ligne reste en base pour
-- ne pas perturber la résolution de la nuit/du jour en cours).
-- ============================================================================
set search_path = public;

create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_name text;
  v_was_host boolean;
  v_next_host uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then return; end if;

  select display_name, is_host into v_name, v_was_host
  from public.game_players where game_id = p_game_id and user_id = v_user;

  if v_name is null then return; end if;

  if v_game.status in ('lobby', 'ended') then
    delete from public.game_players where game_id = p_game_id and user_id = v_user;
    delete from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

    if v_was_host then
      select user_id into v_next_host from public.game_players
      where game_id = p_game_id order by seat_number asc limit 1;
      if v_next_host is not null then
        update public.game_players set is_host = true where game_id = p_game_id and user_id = v_next_host;
        update public.games set host_id = v_next_host where id = p_game_id;
      end if;
    end if;

    if not exists (select 1 from public.game_players where game_id = p_game_id) then
      delete from public.games where id = p_game_id;
      return;
    end if;

    insert into public.game_log (game_id, message) values (p_game_id, v_name || ' a quitté le salon.');
  else
    update public.game_players set is_alive = false, death_cause = 'parti'
    where game_id = p_game_id and user_id = v_user and is_alive;

    if v_was_host then
      select user_id into v_next_host from public.game_players
      where game_id = p_game_id and user_id <> v_user order by seat_number asc limit 1;
      if v_next_host is not null then
        update public.game_players set is_host = false where game_id = p_game_id and user_id = v_user;
        update public.game_players set is_host = true where game_id = p_game_id and user_id = v_next_host;
        update public.games set host_id = v_next_host where id = p_game_id;
      end if;
    end if;

    insert into public.game_log (game_id, message) values (p_game_id, v_name || ' a quitté la partie en cours de jeu.');
    perform public.check_and_apply_win(p_game_id);
  end if;
end;
$$;

create or replace function public.restart_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut relancer une partie.'; end if;
  if v_game.status <> 'ended' then raise exception 'La partie n’est pas terminée.'; end if;

  delete from public.game_roles_secret where game_id = p_game_id;
  delete from public.night_actions where game_id = p_game_id;
  delete from public.votes where game_id = p_game_id;
  delete from public.chat_messages where game_id = p_game_id;
  delete from public.game_log where game_id = p_game_id;

  update public.game_players
  set is_alive = true, death_cause = null, died_at_night = null, is_lover = false, revealed_role = null
  where game_id = p_game_id;

  update public.games
  set status = 'lobby',
      night_number = 0,
      night_step = null,
      phase_deadline = null,
      winner_team = null,
      hunter_pending = null,
      hunter_context = null,
      night_deaths_resolved = false,
      day_vote_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🔄 Une nouvelle partie va commencer avec le même groupe !');
end;
$$;

grant execute on function public.restart_game(uuid) to authenticated;
