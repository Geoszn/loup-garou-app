-- Découvert en auditant le Loup Alpha (migration 0088) : get_leaderboard
-- calculait "won" pour le camp des loups avec role = 'loup_garou'
-- uniquement — un Loup Alpha (ou un villageois infecté, devenu 'loup_garou'
-- de toute façon donc déjà correct pour lui) aurait été compté comme perdant
-- sur le classement public malgré une victoire loup.
set search_path = public;

create or replace function public.get_leaderboard(p_limit integer DEFAULT 20)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  with scores as (
    select
      gp.user_id,
      case
        when g.winner_team = 'amoureux' then gp.is_lover
        when g.winner_team = 'loups' then rs.role in ('loup_garou', 'loup_alpha')
        when g.winner_team = 'village' then coalesce(rs.role not in ('loup_garou', 'loup_alpha'), true)
        else false
      end as won
    from public.game_players gp
    join public.games g on g.id = gp.game_id and g.status = 'ended'
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
  ),
  agg as (
    select
      user_id,
      count(*) as games_played,
      count(*) filter (where won) as games_won
    from scores
    group by user_id
    having count(*) >= 3
  ),
  ranked as (
    select
      p.id as user_id,
      p.username,
      p.avatar_icon,
      a.games_played,
      a.games_won,
      round(100.0 * a.games_won / a.games_played, 1) as win_rate
    from agg a
    join public.profiles p on p.id = a.user_id
    order by win_rate desc, a.games_played desc
    limit greatest(p_limit, 0)
  )
  select coalesce(jsonb_agg(row_to_json(ranked)), '[]'::jsonb) from ranked;
$$;
