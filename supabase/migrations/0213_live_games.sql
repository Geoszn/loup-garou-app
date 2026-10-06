-- 0213 — « Le village veille » : parties en cours affichées sur l'accueil.
--
-- Pour donner le sentiment que le jeu est animé, l'accueil montre TOUTES les
-- parties encore actives, publiques ET privées. get_live_games les liste :
--  * partie publique (ou dont l'appelant est joueur) : mêmes informations que
--    list_public_games (id, code, hôte, avatar, nombre de joueurs...) — c'est
--    ce qui permet de la rejoindre ou de la regarder ;
--  * partie privée dont l'appelant n'est PAS joueur : strictement anonymisée —
--    ni id, ni code, ni nom d'hôte, ni avatar. Seulement statut, nombre de
--    joueurs et continent de l'hôte, sous une clé opaque (hash tronqué) qui ne
--    permet de retrouver ni de rejoindre la partie.
-- Les salons trop vieux (> 12 h) sont ignorés : un salon oublié ne doit pas
-- faire croire à de l'activité.
set search_path = public;

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
      and g.created_at > now() - interval '12 hours'
  )
  select coalesce(jsonb_agg(
    case
      when l.is_public or l.is_mine then jsonb_build_object(
        'key', l.id,
        'game_id', l.id,
        'code', l.code,
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

revoke execute on function public.get_live_games() from public, anon;
grant execute on function public.get_live_games() to authenticated;
