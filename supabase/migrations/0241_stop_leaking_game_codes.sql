-- Fuite des codes de partie : correctifs côté serveur.
--
-- Constat (retour utilisateur, 2026-10-11) : des joueurs que l'hôte n'avait pas invités ont rejoint son salon
-- sans demande. Cause : le code de la partie circulait là où il ne devait pas —
--   * la présence temps réel globale diffusait le code de la partie de chaque joueur à tous les joueurs connectés
--     (corrigé dans l'application : PresenceContext) ;
--   * get_live_games renvoyait le code de TOUTES les parties publiques à tout le monde ;
--   * list_public_games renvoyait aussi le code de chaque partie publique.
-- Or rejoindre un salon avec son code est direct (join_game) : tout code qui fuit contourne la demande
-- validée par l'hôte. Désormais :
--   * get_live_games : le code n'est renvoyé que pour mes propres parties ;
--   * list_public_games : plus de code du tout (la demande passe par l'identifiant de la partie).
-- Rejouable sans risque.

create or replace function public.get_live_games()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select
      g.id,
      g.code,
      g.status,
      g.night_number,
      g.is_public,
      g.created_at,
      g.host_id,
      (select count(*) from public.game_players gp where gp.game_id = g.id) as player_count,
      exists (
        select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = auth.uid()
      ) as is_mine
    from public.games g
    where g.status <> 'ended'
      and not g.is_practice
      and g.created_at > now() - interval '12 hours'
  )
  select coalesce(jsonb_agg(
    case
      when l.is_public or l.is_mine then jsonb_build_object(
        'key', l.id,
        'game_id', l.id,
        -- Le code n'est renvoyé QUE pour mes propres parties : celui d'une partie publique que je ne fais pas
        -- partie permettrait de la rejoindre sans passer par la demande validée par l'hôte.
        'code', case when l.is_mine then l.code else null end,
        'is_public', l.is_public,
        'is_mine', l.is_mine,
        'status', l.status,
        'night_number', l.night_number,
        'player_count', l.player_count,
        'created_at', l.created_at,
        'continent', pr.continent,
        'host_name', hp.display_name,
        'host_avatar_icon', hp.avatar_icon,
        'host_avatar_config', pr.avatar_config,
        'already_requested', exists (
          select 1 from public.game_join_requests r
          where r.game_id = l.id and r.user_id = auth.uid() and r.status = 'pending'
        )
      )
      else jsonb_build_object(
        'key', left(md5(l.id::text), 12),
        'is_public', false,
        'is_mine', false,
        'status', l.status,
        'night_number', l.night_number,
        'player_count', l.player_count,
        'continent', pr.continent
      )
    end
    order by (l.is_public and l.status = 'lobby') desc, l.player_count desc, l.created_at desc
  ), '[]'::jsonb)
  from live l
  left join public.profiles pr on pr.id = l.host_id
  left join public.game_players hp on hp.game_id = l.id and hp.user_id = l.host_id;
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

revoke execute on function public.get_live_games() from public, anon;
grant execute on function public.get_live_games() to authenticated;
revoke execute on function public.list_public_games() from public, anon;
grant execute on function public.list_public_games() to authenticated;
