-- Avatars personnalisés partout : ajoute avatar_config (profiles) aux listes
-- déjà exposées avec avatar_icon — classement public, amis / demandes /
-- invitations, fiche joueur, parties publiques. Aucun changement de signature
-- ni de droits (create or replace conserve les grants existants).
set search_path = public;

create or replace function public.get_public_leaderboard(p_scope text default 'global', p_continent text default null, p_limit int default 10)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with eligible as (
    select
      p.id as user_id,
      p.username,
      p.avatar_icon,
      p.avatar_config,
      p.continent,
      p.rank_points,
      public.rank_tier_for_points(p.rank_points) as tier,
      p.current_streak,
      p.best_streak,
      p.rank_wins,
      p.rank_games_played
    from public.profiles p
    where p.rank_games_played >= 3
      and (p_scope <> 'continent' or (p_continent is not null and p.continent = p_continent))
  ),
  ranked as (
    select * from eligible
    order by rank_points desc, best_streak desc
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
  )
  select case
    when p_scope = 'continent' and (select count(*) from eligible) < 3 then '[]'::jsonb
    else coalesce((select jsonb_agg(row_to_json(ranked)) from ranked), '[]'::jsonb)
  end;
$$;

create or replace function public.get_my_social()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select jsonb_build_object(
    'friend_code', (select friend_code from public.profiles where id = v_user),

    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.id, 'username', p.username, 'avatar_icon', p.avatar_icon, 'avatar_config', p.avatar_config) order by p.username)
      from public.friend_requests fr
      join public.profiles p on p.id = (case when fr.requester_id = v_user then fr.addressee_id else fr.requester_id end)
      where fr.status = 'accepted' and v_user in (fr.requester_id, fr.addressee_id)
    ), '[]'::jsonb),

    'incoming_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id', fr.id, 'user_id', p.id, 'username', p.username, 'avatar_icon', p.avatar_icon, 'avatar_config', p.avatar_config, 'created_at', fr.created_at
      ) order by fr.created_at desc)
      from public.friend_requests fr
      join public.profiles p on p.id = fr.requester_id
      where fr.status = 'pending' and fr.addressee_id = v_user
    ), '[]'::jsonb),

    'outgoing_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id', fr.id, 'user_id', p.id, 'username', p.username, 'avatar_icon', p.avatar_icon, 'avatar_config', p.avatar_config, 'created_at', fr.created_at
      ) order by fr.created_at desc)
      from public.friend_requests fr
      join public.profiles p on p.id = fr.addressee_id
      where fr.status = 'pending' and fr.requester_id = v_user
    ), '[]'::jsonb),

    'game_invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'invite_id', gi.id, 'game_id', gi.game_id, 'code', g.code,
        'from_username', p.username, 'from_avatar_icon', p.avatar_icon, 'from_avatar_config', p.avatar_config, 'created_at', gi.created_at
      ) order by gi.created_at desc)
      from public.game_invites gi
      join public.games g on g.id = gi.game_id and g.status = 'lobby'
      join public.profiles p on p.id = gi.from_user_id
      where gi.to_user_id = v_user
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_player_public_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user uuid := auth.uid();
  v_profile record;
  v_request public.friend_requests%rowtype;
  v_friend_status text;
  v_request_id uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_user_id is null then
    raise exception 'Requête invalide.';
  end if;

  select id, username, avatar_icon, avatar_config, continent, rank_points, current_streak, best_streak, rank_wins, rank_games_played
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Ce compte est introuvable.';
  end if;

  if p_user_id = v_user then
    v_friend_status := 'self';
  else
    select * into v_request from public.friend_requests
    where least(requester_id, addressee_id) = least(v_user, p_user_id)
      and greatest(requester_id, addressee_id) = greatest(v_user, p_user_id);

    if not found then
      v_friend_status := 'none';
    elsif v_request.status = 'accepted' then
      v_friend_status := 'friends';
    elsif v_request.requester_id = v_user then
      v_friend_status := 'pending_sent';
    else
      v_friend_status := 'pending_received';
      v_request_id := v_request.id;
    end if;
  end if;

  return jsonb_build_object(
    'user_id', v_profile.id,
    'username', v_profile.username,
    'avatar_icon', v_profile.avatar_icon,
    'avatar_config', v_profile.avatar_config,
    'continent', v_profile.continent,
    'rank_points', v_profile.rank_points,
    'tier', public.rank_tier_for_points(v_profile.rank_points),
    'current_streak', v_profile.current_streak,
    'best_streak', v_profile.best_streak,
    'rank_wins', v_profile.rank_wins,
    'rank_games_played', v_profile.rank_games_played,
    'friend_status', v_friend_status,
    'request_id', v_request_id
  );
end;
$$;

create or replace function public.list_public_games()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with candidates as (
    select
      g.id as game_id,
      g.code,
      g.status,
      g.created_at,
      hp.display_name as host_name,
      hp.avatar_icon as host_avatar_icon,
      (select pr.avatar_config from public.profiles pr where pr.id = g.host_id) as host_avatar_config,
      (select count(*) from public.game_players gp2 where gp2.game_id = g.id) as player_count
    from public.games g
    join public.game_players hp on hp.game_id = g.id and hp.user_id = g.host_id
    where g.is_public and g.status <> 'ended'
      and not exists (
        select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = auth.uid()
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'game_id', c.game_id,
    'code', c.code,
    'status', c.status,
    'host_name', c.host_name,
    'host_avatar_icon', c.host_avatar_icon,
    'host_avatar_config', c.host_avatar_config,
    'player_count', c.player_count,
    'created_at', c.created_at,
    'already_requested', exists (
      select 1 from public.game_join_requests r
      where r.game_id = c.game_id and r.user_id = auth.uid() and r.status = 'pending'
    )
  ) order by (c.status = 'lobby') desc, c.created_at desc), '[]'::jsonb)
  from candidates c
  where c.status <> 'lobby' or c.player_count < 20;
$$;
