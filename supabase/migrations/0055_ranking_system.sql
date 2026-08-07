-- ============================================================================
-- Système de progression : rang par points, série de victoires, classement
-- mondial/national affiché publiquement.
--
-- Contrairement à get_leaderboard (0015_stats.sql, taux de victoire recalculé
-- à la volée à chaque appel), le rang a besoin d'un état persistant : la
-- "série en cours" et le "plancher" (palier le plus haut jamais atteint, sous
-- lequel on ne redescend plus) ne se déduisent pas d'un simple agrégat, ils
-- dépendent de l'ORDRE chronologique des parties. On ajoute donc des colonnes
-- sur profiles, mises à jour à chaque fin de partie plutôt que recalculées.
--
-- Barème (volontairement simple) :
--   - Victoire : +30 points, + un bonus de série (+10 par victoire
--     consécutive au-delà de la première, plafonné à +50 à partir d'une
--     série de 6).
--   - Défaite : -15 points, série remise à zéro. Ne fait JAMAIS descendre
--     sous le palier le plus haut déjà atteint (rank_floor) — perdre une
--     partie ne fait donc jamais rétrograder plus bas que le dernier rang
--     obtenu, seulement fluctuer à l'intérieur de celui-ci. Choisi
--     volontairement moins punitif que la victoire n'est généreuse : dans ce
--     jeu, l'issue dépend beaucoup du rôle tiré au hasard, pas seulement du
--     niveau du joueur (on peut jouer un Loup-Garou parfait et perdre parce
--     que le village devine juste dès le premier tour) — un système trop
--     dur aurait pu décourager plutôt que motiver, surtout entre amis qui
--     jouent ensemble pour le plaisir et pas dans un vrai matchmaking
--     compétitif.
--   - Seuil minimum de 3 parties jouées avant d'apparaître dans le
--     classement public, même logique que get_leaderboard.
--
-- Paliers (rank_tier_for_points) : nouveau_venu / villageois / chasseur /
-- ancien / sage / legende. Les libellés et émojis affichés vivent côté
-- client (src/lib/ranks.ts, à garder synchronisé avec les seuils ci-dessous)
-- — la fonction SQL ne renvoie qu'un slug stable.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- Colonnes de progression sur profiles
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists rank_points int not null default 0;
alter table public.profiles add column if not exists rank_floor int not null default 0;
alter table public.profiles add column if not exists current_streak int not null default 0;
alter table public.profiles add column if not exists best_streak int not null default 0;
alter table public.profiles add column if not exists rank_games_played int not null default 0;
alter table public.profiles add column if not exists rank_wins int not null default 0;
alter table public.profiles add column if not exists country text;

-- Code pays ISO 3166-1 alpha-2 (ex: 'CI', 'SN', 'FR') choisi par le joueur
-- lui-même dans ses réglages (update_my_country ci-dessous) — pas de
-- géolocalisation automatique par IP, pour rester simple et respectueux de
-- la vie privée. Nullable : le classement national ne montre alors rien tant
-- que le joueur n'a pas choisi son pays.
alter table public.profiles drop constraint if exists profiles_country_check;
alter table public.profiles add constraint profiles_country_check
  check (country is null or length(country) = 2);

-- ----------------------------------------------------------------------------
-- rank_tier_for_points : seuils de palier, en un seul endroit pour rester
-- cohérent entre get_my_stats et get_public_leaderboard.
-- ----------------------------------------------------------------------------
create or replace function public.rank_tier_for_points(p_points int)
returns text
language sql
immutable
as $$
  select case
    when p_points >= 1500 then 'legende'
    when p_points >= 900 then 'sage'
    when p_points >= 500 then 'ancien'
    when p_points >= 250 then 'chasseur'
    when p_points >= 100 then 'villageois'
    else 'nouveau_venu'
  end
$$;

-- ----------------------------------------------------------------------------
-- apply_rank_result : applique le résultat d'UNE partie pour UN joueur.
-- Fonction interne uniquement (appelée depuis apply_rank_updates_for_game,
-- elle-même appelée depuis check_and_apply_win) — pas de grant, comme les
-- autres helpers internes depuis le durcissement 0045.
-- ----------------------------------------------------------------------------
create or replace function public.apply_rank_result(p_user_id uuid, p_won boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points int;
  v_floor int;
  v_streak int;
  v_new_points int;
  v_new_streak int;
  v_new_floor int;
  v_bonus int;
  v_tier_floor int;
begin
  select rank_points, rank_floor, current_streak
    into v_points, v_floor, v_streak
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return;
  end if;

  if p_won then
    v_new_streak := v_streak + 1;
    v_bonus := least((v_new_streak - 1) * 10, 50);
    v_new_points := v_points + 30 + v_bonus;
  else
    v_new_streak := 0;
    v_new_points := greatest(v_points - 15, v_floor);
  end if;

  v_tier_floor := case
    when v_new_points >= 1500 then 1500
    when v_new_points >= 900 then 900
    when v_new_points >= 500 then 500
    when v_new_points >= 250 then 250
    when v_new_points >= 100 then 100
    else 0
  end;
  v_new_floor := greatest(v_floor, v_tier_floor);

  update public.profiles
  set rank_points = v_new_points,
      rank_floor = v_new_floor,
      current_streak = v_new_streak,
      best_streak = greatest(best_streak, v_new_streak),
      rank_games_played = rank_games_played + 1,
      rank_wins = rank_wins + (case when p_won then 1 else 0 end)
  where id = p_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- apply_rank_updates_for_game : détermine victoire/défaite par joueur pour
-- UNE partie qui vient de se terminer, même logique de détermination que
-- get_my_stats/get_leaderboard (0015_stats.sql). Fonction interne, pas de
-- grant.
-- ----------------------------------------------------------------------------
create or replace function public.apply_rank_updates_for_game(p_game_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_won boolean;
begin
  for r in
    select gp.user_id, gp.is_lover, rs.role
    from public.game_players gp
    left join public.game_roles_secret rs
      on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    v_won := case
      when p_winner = 'amoureux' then coalesce(r.is_lover, false)
      when p_winner = 'loups' then r.role = 'loup_garou'
      when p_winner = 'village' then coalesce(r.role <> 'loup_garou', true)
      else false
    end;
    perform public.apply_rank_result(r.user_id, v_won);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- check_and_apply_win : reprise identique à 0029_audit_fixes.sql, seul ajout
-- l'appel à apply_rank_updates_for_game juste après qu'une victoire soit
-- actée (donc jamais pour une partie clôturée administrativement — voir
-- restart_game/close_inactive_games/admin force-end, qui ne passent pas par
-- ici et ne touchent donc jamais au rang).
-- ----------------------------------------------------------------------------
create or replace function public.check_and_apply_win(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alive int;
  v_wolves int;
  v_winner text;
  v_lover1 uuid;
  v_lover2 uuid;
begin
  select count(*) into v_alive from public.game_players where game_id = p_game_id and is_alive;

  select count(*) into v_wolves
  from public.game_roles_secret rs
  join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role = 'loup_garou' and gp.is_alive;

  if v_alive = 2 then
    select user_id into v_lover1 from public.game_players where game_id = p_game_id and is_alive and is_lover limit 1;
    if v_lover1 is not null then
      select lover_with into v_lover2 from public.game_roles_secret where game_id = p_game_id and user_id = v_lover1;
      if v_lover2 is not null and exists (
        select 1 from public.game_players where game_id = p_game_id and user_id = v_lover2 and is_alive
      ) then
        v_winner := 'amoureux';
      end if;
    end if;
  end if;

  if v_winner is null then
    if v_wolves = 0 then
      v_winner := 'village';
    elsif v_wolves >= (v_alive - v_wolves) then
      v_winner := 'loups';
    end if;
  end if;

  if v_winner is not null then
    update public.games set status = 'ended', winner_team = v_winner, phase_deadline = null,
      hunter_pending = null, hunter_context = null, captain_pending = null
    where id = p_game_id;

    insert into public.game_log (game_id, message)
    values (p_game_id, case v_winner
      when 'village' then '🌞 Le village a éliminé tous les Loups-Garous. Le village gagne !'
      when 'loups' then '🐺 Les Loups-Garous ont dévoré assez de villageois pour prendre le contrôle. Les loups gagnent !'
      when 'amoureux' then '💘 Il ne reste que les deux amoureux... L’amour triomphe !'
    end);

    perform public.apply_rank_updates_for_game(p_game_id, v_winner);

    return true;
  end if;

  return false;
end;
$$;

-- ----------------------------------------------------------------------------
-- update_my_country : choix du pays affiché dans le classement national.
-- ----------------------------------------------------------------------------
create or replace function public.update_my_country(p_country text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_country text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  v_country := nullif(upper(trim(p_country)), '');
  if v_country is not null and length(v_country) <> 2 then
    raise exception 'Code pays invalide.';
  end if;

  update public.profiles
  set country = v_country
  where id = v_user;

  return jsonb_build_object('country', v_country);
end;
$$;

grant execute on function public.update_my_country(text) to authenticated;

-- ----------------------------------------------------------------------------
-- get_public_leaderboard : top classement, mondial ou national, exposé
-- SANS authentification (grant à anon) puisqu'il doit s'afficher directement
-- sur la page d'accueil publique. N'expose que pseudo/avatar/pays/rang —
-- jamais d'email ni d'identifiant interne exploitable.
-- ----------------------------------------------------------------------------
create or replace function public.get_public_leaderboard(p_scope text default 'global', p_country text default null, p_limit int default 10)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with ranked as (
    select
      p.id as user_id,
      p.username,
      p.avatar_icon,
      p.country,
      p.rank_points,
      public.rank_tier_for_points(p.rank_points) as tier,
      p.current_streak,
      p.best_streak,
      p.rank_wins,
      p.rank_games_played
    from public.profiles p
    where p.rank_games_played >= 3
      and (p_scope <> 'country' or (p_country is not null and p.country = upper(p_country)))
    order by p.rank_points desc, p.best_streak desc
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
  )
  select coalesce(jsonb_agg(row_to_json(ranked)), '[]'::jsonb) from ranked;
$$;

grant execute on function public.get_public_leaderboard(text, text, int) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- get_my_stats : reprise pour inclure le rang courant (points, palier,
-- série, pays, position mondiale/nationale). Reste identique à 0015_stats.sql
-- pour tout le reste (games_played/games_won/by_role/recent_games).
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
  v_rank jsonb;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select jsonb_build_object(
    'rank_points', p.rank_points,
    'rank_tier', public.rank_tier_for_points(p.rank_points),
    'current_streak', p.current_streak,
    'best_streak', p.best_streak,
    'country', p.country,
    'global_position', (
      select count(*) + 1 from public.profiles o
      where o.rank_games_played >= 3 and o.rank_points > p.rank_points
    ),
    'country_position', case when p.country is null then null else (
      select count(*) + 1 from public.profiles o
      where o.rank_games_played >= 3 and o.country = p.country and o.rank_points > p.rank_points
    ) end
  ) into v_rank
  from public.profiles p
  where p.id = v_user;

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
    'rank', v_rank,
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
