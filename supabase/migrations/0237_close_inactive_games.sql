-- Fermeture des salons inactifs depuis plus de 2 h, même quand personne n'a l'appli ouverte dessus.
--
-- Avant : la fermeture (0049) ne se déclenchait que « paresseusement », quand un joueur de la partie
-- lisait get_my_game_view. Un salon abandonné restait donc « actif » indéfiniment (visible dans
-- l'administration, et dans la liste des parties publiques).
-- Maintenant :
--  * close_inactive_games() ferme toutes les parties inactives depuis plus de 2 h (service uniquement) ;
--  * la tâche horaire (api/cron-engagement-notifications.ts) l'appelle ;
--  * la liste d'administration l'appelle aussi avant de s'afficher ;
--  * la liste des parties publiques masque en plus celles inactives depuis plus de 2 h.
-- Rejouable sans risque.

create or replace function public.close_inactive_games()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  with closed as (
    update public.games
       set status = 'ended'
     where status <> 'ended'
       and last_activity_at < now() - interval '2 hours'
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from closed;

  if array_length(v_ids, 1) is not null then
    insert into public.game_log (game_id, message)
    select unnest(v_ids), 'La partie a été fermée automatiquement après 2h d''inactivité.';
  end if;
  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

create or replace function public.admin_list_active_games(p_limit int default 100, p_include_ended boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  -- Ménage avant d'afficher la liste : un salon abandonné ne doit pas apparaître comme actif.
  perform public.close_inactive_games();

  return coalesce((
    select jsonb_agg(row_to_json(g)) from (
      select
        gm.id,
        gm.code,
        gm.status,
        gm.is_public,
        gm.created_at,
        gm.last_activity_at,
        hp.display_name as host_name,
        (select count(*) from public.game_players gp2 where gp2.game_id = gm.id) as player_count,
        (select count(*) from public.game_join_requests jr where jr.game_id = gm.id and jr.status = 'pending') as pending_join_requests
      from public.games gm
      join public.game_players hp on hp.game_id = gm.id and hp.user_id = gm.host_id
      where p_include_ended or gm.status <> 'ended'
      order by gm.created_at desc
      limit p_limit
    ) g
  ), '[]'::jsonb);
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
      and g.last_activity_at > now() - interval '2 hours'
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

revoke execute on function public.close_inactive_games() from public, anon, authenticated;
grant execute on function public.close_inactive_games() to service_role;
revoke execute on function public.admin_list_active_games(int, boolean) from public, anon;
grant execute on function public.admin_list_active_games(int, boolean) to authenticated;
revoke execute on function public.list_public_games() from public, anon;
grant execute on function public.list_public_games() to authenticated;
