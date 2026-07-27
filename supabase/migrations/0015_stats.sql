-- ============================================================================
-- Statistiques joueur : historique perso + classement.
--
-- Le rôle joué (game_roles_secret.role) n'est plus secret une fois la partie
-- terminée : get_my_game_view expose déjà "final_reveal" (le rôle de TOUT le
-- monde) dès que games.status = 'ended'. Lire game_roles_secret pour des
-- parties terminées n'introduit donc aucune fuite nouvelle — que ce soit pour
-- son propre historique (get_my_stats) ou, sous forme agrégée uniquement
-- (aucun rôle individuel exposé), pour le classement (get_leaderboard).
--
-- Détermination de la victoire d'un joueur donné :
--   - games.winner_team = 'amoureux'  → gagne s'il fait partie du couple
--     (game_players.is_lover), quel que soit son rôle d'origine (l'issue
--     "amoureux" prime sur le camp normal, voir check_and_apply_win).
--   - games.winner_team = 'loups'     → gagne s'il était loup-garou.
--   - games.winner_team = 'village'   → gagne s'il n'était pas loup-garou.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- get_my_stats : résumé + détail par rôle + historique récent pour
-- l'utilisateur courant, toutes parties terminées confondues.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_stats()
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

  with my_games as (
    select
      g.id as game_id,
      g.code,
      g.winner_team,
      g.created_at,
      gp.is_lover,
      rs.role
    from public.game_players gp
    join public.games g on g.id = gp.game_id and g.status = 'ended'
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.user_id = v_user
  ),
  scored as (
    select
      *,
      case
        when winner_team = 'amoureux' then is_lover
        when winner_team = 'loups' then role = 'loup_garou'
        when winner_team = 'village' then coalesce(role <> 'loup_garou', true)
        else false
      end as won
    from my_games
  )
  select jsonb_build_object(
    'games_played', (select count(*) from scored),
    'games_won', (select count(*) filter (where won) from scored),
    'by_role', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', role,
        'played', played,
        'won', won_count
      ) order by played desc)
      from (
        select role, count(*) as played, count(*) filter (where won) as won_count
        from scored
        where role is not null
        group by role
      ) r
    ), '[]'::jsonb),
    'recent_games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_id', game_id,
        'code', code,
        'winner_team', winner_team,
        'role', role,
        'won', won,
        'created_at', created_at
      ) order by created_at desc)
      from (select * from scored order by created_at desc limit 20) recent
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_my_stats() to authenticated;

-- ----------------------------------------------------------------------------
-- get_leaderboard : classement par taux de victoire (agrégats uniquement,
-- aucun rôle ni partie individuelle d'un tiers n'est exposé). On exige un
-- minimum de parties jouées pour éviter qu'un compte à 1 victoire sur 1
-- partie ne trône en tête du classement.
-- ----------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_limit int default 20)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with scores as (
    select
      gp.user_id,
      case
        when g.winner_team = 'amoureux' then gp.is_lover
        when g.winner_team = 'loups' then rs.role = 'loup_garou'
        when g.winner_team = 'village' then coalesce(rs.role <> 'loup_garou', true)
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

grant execute on function public.get_leaderboard(int) to authenticated;
