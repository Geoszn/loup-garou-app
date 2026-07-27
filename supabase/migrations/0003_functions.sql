-- ============================================================================
-- Logique de jeu — toutes les fonctions ci-dessous sont SECURITY DEFINER,
-- exécutées avec les droits du propriétaire (postgres), ce qui leur permet
-- de lire/écrire les tables secrètes (game_roles_secret, night_actions,
-- votes) tout en appliquant elles-mêmes les règles de visibilité et de jeu.
-- Les clients (rôle "authenticated") n'ont accès QUE via ces fonctions.
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- Utilitaires
-- ----------------------------------------------------------------------------
create or replace function public.generate_game_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sans caractères ambigus
  result text;
  v_exists boolean;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    select exists(select 1 from public.games where code = result) into v_exists;
    exit when not v_exists;
  end loop;
  return result;
end;
$$;

create or replace function public.random_avatar_color()
returns text
language sql
as $$
  select (array[
    '#c62e42','#e0a655','#7fd6a4','#8fb8e0','#c58ee0','#e0d155','#e08fc0','#6fb3a0','#e0455a','#a3c9e0'
  ])[floor(random() * 10 + 1)::int];
$$;

create or replace function public.compute_default_role_counts(p_player_count int)
returns jsonb
language plpgsql
as $$
declare
  v_wolves int;
begin
  v_wolves := greatest(1, round(p_player_count * 0.25));
  if v_wolves >= p_player_count then
    v_wolves := greatest(1, p_player_count / 2);
  end if;
  return jsonb_build_object(
    'loup_garou', v_wolves,
    'voyante', p_player_count >= 5,
    'sorciere', p_player_count >= 6,
    'chasseur', p_player_count >= 7,
    'petite_fille', p_player_count >= 8,
    'cupidon', p_player_count >= 9
  );
end;
$$;

-- rôle du joueur courant dans une partie (usage interne uniquement)
create or replace function public.my_role_in_game(p_game_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.game_roles_secret
  where game_id = p_game_id and user_id = auth.uid();
$$;

create or replace function public.role_alive_exists(p_game_id uuid, p_role text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role = p_role and gp.is_alive
  );
$$;

-- ----------------------------------------------------------------------------
-- create_game / join_game / leave_game
-- ----------------------------------------------------------------------------
create or replace function public.create_game(p_display_name text, p_settings jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_game_id uuid;
  v_settings jsonb;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  v_code := public.generate_game_code();
  v_settings := jsonb_build_object(
    'discussion_seconds', coalesce((p_settings->>'discussion_seconds')::int, 90),
    'vote_seconds', coalesce((p_settings->>'vote_seconds')::int, 45),
    'night_step_seconds', coalesce((p_settings->>'night_step_seconds')::int, 40),
    'role_reveal_seconds', coalesce((p_settings->>'role_reveal_seconds')::int, 15),
    'role_counts', p_settings->'role_counts'
  );

  insert into public.games (code, host_id, settings)
  values (v_code, v_user, v_settings)
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color)
  values (v_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 1, true, public.random_avatar_color());

  insert into public.game_log (game_id, message)
  values (v_game_id, 'La partie a été créée. En attente des joueurs...');

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

create or replace function public.join_game(p_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_count int;
  v_existing uuid;
  v_seat int;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_game from public.games where code = upper(trim(p_code));
  if not found then
    raise exception 'Aucune partie ne correspond à ce code.';
  end if;

  select id into v_existing from public.game_players where game_id = v_game.id and user_id = v_user;
  if v_existing is not null then
    return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
  end if;

  if v_game.status <> 'lobby' then
    raise exception 'Cette partie a déjà commencé.';
  end if;

  select count(*) into v_count from public.game_players where game_id = v_game.id;
  if v_count >= 20 then
    raise exception 'Cette partie est complète (20 joueurs maximum).';
  end if;

  v_seat := v_count + 1;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color)
  values (v_game.id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), v_seat, false, public.random_avatar_color());

  insert into public.game_log (game_id, message)
  values (v_game.id, coalesce(nullif(trim(p_display_name), ''), 'Un joueur') || ' a rejoint la partie.');

  return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
end;
$$;

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

  if v_game.status = 'lobby' then
    delete from public.game_players where game_id = p_game_id and user_id = v_user;

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

    insert into public.game_log (game_id, message) values (p_game_id, v_name || ' a quitté la partie.');
  else
    update public.game_players set is_alive = false, death_cause = 'parti'
    where game_id = p_game_id and user_id = v_user and is_alive;
    insert into public.game_log (game_id, message) values (p_game_id, v_name || ' a quitté la partie en cours de jeu.');
    perform public.check_and_apply_win(p_game_id);
  end if;
end;
$$;
