-- ============================================================================
-- Onglet "Utilisateurs" du dashboard admin : pagination (10/page), filtres
-- séparés nom/email/date de création, et fiche détaillée par compte.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- admin_list_users : remplace la version de 0048 (un seul p_search texte
-- libre) par trois filtres indépendants, combinables, plus une pagination
-- réelle — la réponse inclut désormais `total` (nombre de comptes
-- correspondant aux filtres, hors limit/offset) pour que le dashboard
-- puisse afficher "page X / Y" plutôt qu'une liste sans fin.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_username text default null,
  p_email text default null,
  p_created_from date default null,
  p_created_to date default null,
  p_limit int default 10,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_total int;
  v_users jsonb;
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  select count(*) into v_total
  from public.profiles p
  join auth.users au on au.id = p.id
  where (p_username is null or p.username ilike '%' || p_username || '%')
    and (p_email is null or au.email ilike '%' || p_email || '%')
    and (p_created_from is null or p.created_at >= p_created_from::timestamptz)
    and (p_created_to is null or p.created_at < (p_created_to + 1)::timestamptz);

  select coalesce(jsonb_agg(row_to_json(u)), '[]'::jsonb) into v_users
  from (
    select
      p.id,
      p.username,
      au.email,
      p.created_at,
      p.is_admin,
      p.is_banned,
      p.banned_reason,
      p.lang,
      (select count(*) from public.game_players gp where gp.user_id = p.id) as games_count
    from public.profiles p
    join auth.users au on au.id = p.id
    where (p_username is null or p.username ilike '%' || p_username || '%')
      and (p_email is null or au.email ilike '%' || p_email || '%')
      and (p_created_from is null or p.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or p.created_at < (p_created_to + 1)::timestamptz)
    order by p.created_at desc
    limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ) u;

  return jsonb_build_object('users', v_users, 'total', v_total);
end;
$$;

grant execute on function public.admin_list_users(text, text, date, date, int, int) to authenticated;

-- L'ancienne signature (p_search text, p_limit int, p_offset int) de 0048
-- devient une surcharge morte (aucun appelant, voir 0046 pour ce genre de
-- piège) : on la retire explicitement au lieu de la laisser traîner sans
-- droit d'exécution.
drop function if exists public.admin_list_users(text, int, int);

-- ----------------------------------------------------------------------------
-- admin_get_user_detail : fiche complète d'un compte — profil + les mêmes
-- statistiques que get_my_stats (migration 0015), mais pour un utilisateur
-- choisi par l'admin plutôt que pour auth.uid(). Logique de victoire
-- dupliquée intentionnellement (même règle que get_my_stats/get_leaderboard)
-- plutôt que factorisée : ce sont trois fonctions de forme différente
-- (scalaire courant / classement agrégé / fiche admin), le coût de
-- duplication est faible face à la complexité d'un helper générique.
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_profile jsonb;
  v_stats jsonb;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'email', au.email,
    'created_at', p.created_at,
    'is_admin', p.is_admin,
    'is_banned', p.is_banned,
    'banned_reason', p.banned_reason,
    'banned_at', p.banned_at,
    'lang', p.lang,
    'avatar_icon', p.avatar_icon,
    'friend_code', p.friend_code,
    'last_sign_in_at', au.last_sign_in_at
  ) into v_profile
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.id = p_user_id;

  if v_profile is null then
    raise exception 'Compte introuvable.';
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
    where gp.user_id = p_user_id
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
  ) into v_stats;

  return v_profile || jsonb_build_object('stats', v_stats);
end;
$$;

grant execute on function public.admin_get_user_detail(uuid) to authenticated;
