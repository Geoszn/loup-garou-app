-- ============================================================================
-- Signalement utilisateur : "les données du dashboard admin ne sont pas
-- correctes. Certains nouveaux qui ont déjà joué ont leurs statistiques à
-- zéro." + demande d'enrichir la fiche joueur (clic sur un profil) avec plus
-- d'informations sur le compte.
--
-- Cause du bug (confirmée en base) : admin_list_users (games_count) et
-- admin_get_user_detail (games_played/games_won/by_role/recent_games)
-- recalculaient les statistiques à partir de public.game_players +
-- public.games — or ces deux tables sont un état MUTABLE, pas un historique :
-- une salle rejouée plusieurs fois (voir "🔄 Une nouvelle partie va commencer
-- avec le même groupe !", même game.id réutilisé à chaque manche, cf. plus
-- tôt ce soir) garde une seule ligne game_players par joueur, sans cesse
-- réécrite, et games.status ne vaut 'ended' qu'un court instant avant de
-- repasser à 'lobby'/'night' pour la manche suivante. Un admin consultant la
-- fiche d'un joueur PENDANT que sa salle est repartie pour une nouvelle
-- manche voyait donc 0 partie, même avec plusieurs victoires réelles la même
-- soirée. Vérifié en base : plusieurs comptes récents avec
-- rank_games_played = 5 (et autant de lignes dans game_results) tombaient à
-- 0 avec l'ancien calcul.
--
-- Correctif : ces deux fonctions s'appuient désormais sur public.game_results
-- (voir 0062_game_results_history.sql), qui est un historique APPEND-ONLY —
-- une ligne insérée à la fin de chaque manche, jamais réécrite ni supprimée,
-- déjà la source de vérité pour profiles.rank_games_played/rank_wins. Plus
-- aucune dépendance à l'état courant (mutable) de la salle.
--
-- admin_get_user_detail : profil enrichi avec les colonnes déjà en base mais
-- pas encore exposées à l'admin (classement, série, continent, dernier rôle,
-- email confirmé, nombre d'amis) — demande explicite "plus d'informations
-- sur le compte".
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- admin_list_users : games_count basé sur game_results (historique) au lieu
-- de game_players (état courant de la salle, écrasé à chaque manche rejouée).
-- Reprise intégrale de la version actuelle, signature inchangée.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_username text default null,
  p_email text default null,
  p_created_from date default null,
  p_created_to date default null,
  p_limit int default 10,
  p_offset int default 0,
  p_banned_only boolean default false,
  p_admin_only boolean default false
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
    raise exception 'Acces refuse.';
  end if;

  select count(*) into v_total
  from public.profiles p
  join auth.users au on au.id = p.id
  where (p_username is null or p.username ilike '%' || p_username || '%')
    and (p_email is null or au.email ilike '%' || p_email || '%')
    and (p_created_from is null or p.created_at >= p_created_from::timestamptz)
    and (p_created_to is null or p.created_at < (p_created_to + 1)::timestamptz)
    and (not p_banned_only or p.is_banned)
    and (not p_admin_only or p.is_admin);

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
      -- BUG corrigé (voir commentaire en tête de cette migration) :
      -- game_results (historique append-only) au lieu de game_players (état
      -- courant de la salle, réécrit à chaque manche rejouée dans le même
      -- salon — pouvait retomber à 0/1 alors que le joueur a déjà enchaîné
      -- plusieurs parties ce soir-là).
      (select count(*) from public.game_results gr where gr.user_id = p.id) as games_count
    from public.profiles p
    join auth.users au on au.id = p.id
    where (p_username is null or p.username ilike '%' || p_username || '%')
      and (p_email is null or au.email ilike '%' || p_email || '%')
      and (p_created_from is null or p.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or p.created_at < (p_created_to + 1)::timestamptz)
      and (not p_banned_only or p.is_banned)
      and (not p_admin_only or p.is_admin)
    order by p.created_at desc
    limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ) u;

  return jsonb_build_object('users', v_users, 'total', v_total);
end;
$$;

grant execute on function public.admin_list_users(text, text, date, date, int, int, boolean, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_get_user_detail : mêmes soucis + enrichissement demandé du profil.
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
  v_friends_count int;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  select count(*) into v_friends_count
  from public.friend_requests fr
  where fr.status = 'accepted' and (fr.requester_id = p_user_id or fr.addressee_id = p_user_id);

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
    'last_sign_in_at', au.last_sign_in_at,
    -- Enrichissement demandé ("plus d'informations sur le compte") : déjà en
    -- base (profiles/auth.users), simplement pas encore exposé à l'admin.
    'email_confirmed_at', au.email_confirmed_at,
    'rank_points', p.rank_points,
    'rank_floor', p.rank_floor,
    'current_streak', p.current_streak,
    'best_streak', p.best_streak,
    'continent', p.continent,
    'last_role', p.last_role,
    'role_streak', p.role_streak,
    'username_changed_at', p.username_changed_at,
    'friends_count', v_friends_count
  ) into v_profile
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.id = p_user_id;

  if v_profile is null then
    raise exception 'Compte introuvable.';
  end if;

  -- BUG corrigé (voir commentaire en tête de cette migration) : calcul basé
  -- sur game_results (historique append-only, une ligne par manche réellement
  -- jouée et déjà résolue) au lieu de reconstruire à partir de game_players +
  -- games + game_roles_secret, un état mutable écrasé à chaque manche
  -- rejouée dans le même salon — pouvait afficher 0 partie pour un joueur
  -- ayant déjà enchaîné plusieurs victoires la même soirée.
  select jsonb_build_object(
    'games_played', (select count(*) from public.game_results gr where gr.user_id = p_user_id),
    'games_won', (select count(*) from public.game_results gr where gr.user_id = p_user_id and gr.won),
    'by_role', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', role,
        'played', played,
        'won', won_count
      ) order by played desc)
      from (
        select gr.role, count(*) as played, count(*) filter (where gr.won) as won_count
        from public.game_results gr
        where gr.user_id = p_user_id and gr.role is not null
        group by gr.role
      ) r
    ), '[]'::jsonb),
    'recent_games', coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_id', game_id,
        'code', code,
        'winner_team', winner_team,
        'role', role,
        'won', won,
        'points_gained', points_gained,
        'created_at', created_at
      ) order by created_at desc)
      from (
        select gr.game_id, gr.code, gr.winner_team, gr.role, gr.won, gr.points_gained, gr.created_at
        from public.game_results gr
        where gr.user_id = p_user_id
        order by gr.created_at desc
        limit 20
      ) recent
    ), '[]'::jsonb)
  ) into v_stats;

  return v_profile || jsonb_build_object('stats', v_stats);
end;
$$;

grant execute on function public.admin_get_user_detail(uuid) to authenticated;
