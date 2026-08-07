-- ============================================================================
-- BUG : "Mes stats" (parties jouées / victoires / par rôle / historique)
-- recalcule tout en LIVE à chaque appel de get_my_stats, à partir de l'état
-- ACTUEL de la table games (games g ... where g.status = 'ended'). Or
-- restart_game (0041_debate_extend_reply_ghost_listen_night_recap.sql)
-- réutilise LA MÊME ligne games (même id, même code) pour rejouer une
-- nouvelle manche avec le même groupe : status repasse à 'lobby' puis
-- retraverse night/day_vote/etc. Tant qu'une nouvelle manche n'est pas
-- terminée, cette ligne n'est PLUS 'ended' — la manche précédente, pourtant
-- bien jouée et gagnée/perdue, redevient invisible pour get_my_stats, qui
-- ne voit que l'état courant de la ligne. Un groupe qui rejoue plusieurs
-- fois de suite sans quitter le salon peut donc voir son compteur de
-- parties jouées stagner, voire reculer, alors qu'il vient d'enchaîner
-- plusieurs manches.
--
-- rank_points/rank_games_played (profiles, 0055_ranking_system.sql) n'ont
-- PAS ce problème : ce sont des colonnes cumulatives, jamais recalculées
-- depuis l'état courant d'une partie, donc jamais affectées par un restart.
--
-- Correctif : même principe pour "Mes stats" — un historique permanent,
-- écrit une seule fois au moment où check_and_apply_win détecte une
-- victoire (avant qu'un restart ne puisse jamais y toucher), jamais
-- recalculé depuis l'état courant de games/game_players.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- game_results : un enregistrement permanent par (partie réellement
-- terminée, joueur), écrit une seule fois. Pas de RLS/grant table direct,
-- comme le reste du schéma — accès exclusivement via les fonctions
-- SECURITY DEFINER ci-dessous (get_my_stats en lecture, apply_rank_updates_
-- for_game en écriture).
-- ----------------------------------------------------------------------------
create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  role text,
  is_lover boolean not null default false,
  -- Nullable : une partie fermée administrativement après 2h d'inactivité
  -- (voir get_my_game_view, close automatique) passe aussi par status =
  -- 'ended' mais SANS jamais désigner de camp gagnant — winner_team y reste
  -- alors null, et `won` false pour tout le monde (aucune branche du case
  -- ci-dessous ne correspond à null, la partie compte comme jouée mais pas
  -- gagnée, comme avant ce correctif).
  winner_team text,
  won boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists game_results_user_id_idx on public.game_results (user_id, created_at desc);
create index if not exists game_results_game_id_idx on public.game_results (game_id);

-- ----------------------------------------------------------------------------
-- Rattrapage : pour ne PAS remettre tout le monde à zéro, on enregistre
-- l'historique de toutes les parties ACTUELLEMENT 'ended' (donc pas encore
-- écrasées par un restart) — un seul passage, sans effet si déjà fait
-- (colonne game_id indexée mais pas de contrainte unique, donc on protège
-- via un NOT EXISTS explicite pour que ce bloc reste sûr à rejouer).
-- ----------------------------------------------------------------------------
insert into public.game_results (game_id, user_id, code, role, is_lover, winner_team, won, created_at)
select
  g.id,
  gp.user_id,
  g.code,
  rs.role,
  coalesce(gp.is_lover, false),
  g.winner_team,
  case
    when g.winner_team = 'amoureux' then coalesce(gp.is_lover, false)
    when g.winner_team = 'loups' then coalesce(rs.role = 'loup_garou', false)
    when g.winner_team = 'village' then coalesce(rs.role <> 'loup_garou', true)
    else false
  end,
  g.created_at
from public.games g
join public.game_players gp on gp.game_id = g.id
left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
where g.status = 'ended'
  and not exists (select 1 from public.game_results gr where gr.game_id = g.id and gr.user_id = gp.user_id);

-- ----------------------------------------------------------------------------
-- check_and_apply_win : reprise de 0055_ranking_system.sql, ajoute un garde-
-- fou explicite contre un double déclenchement (v_game.status déjà 'ended')
-- — jusqu'ici sans conséquence visible, mais désormais chaque déclenchement
-- écrit aussi dans game_results, donc un double appel dupliquerait
-- l'historique ET les points de rang. Aucun chemin d'appel actuel ne
-- re-déclenche sur une partie déjà 'ended' (advance_phase s'arrête dès que
-- le statut passe à 'ended', _remove_player exclut ce statut) mais autant
-- se protéger explicitement plutôt que de compter sur cet invariant.
-- ----------------------------------------------------------------------------
create or replace function public.check_and_apply_win(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive int;
  v_wolves int;
  v_winner text;
  v_lover1 uuid;
  v_lover2 uuid;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null or v_status = 'ended' then
    return false;
  end if;

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
-- apply_rank_updates_for_game : reprise de 0055_ranking_system.sql, ajoute
-- l'écriture dans game_results (une ligne par joueur, permanente).
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
  v_code text;
begin
  select code into v_code from public.games where id = p_game_id;

  for r in
    select gp.user_id, gp.is_lover, rs.role
    from public.game_players gp
    left join public.game_roles_secret rs
      on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    v_won := case
      when p_winner = 'amoureux' then coalesce(r.is_lover, false)
      when p_winner = 'loups' then coalesce(r.role = 'loup_garou', false)
      when p_winner = 'village' then coalesce(r.role <> 'loup_garou', true)
      else false
    end;
    perform public.apply_rank_result(r.user_id, v_won);

    insert into public.game_results (game_id, user_id, code, role, is_lover, winner_team, won)
    values (p_game_id, r.user_id, v_code, r.role, coalesce(r.is_lover, false), p_winner, v_won);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_my_stats : reprise de 0057_continent_leaderboard.sql, seule
-- différence — games_played/games_won/by_role/recent_games viennent
-- maintenant de game_results (historique permanent) au lieu d'un
-- recalcul en direct depuis games/game_players, qu'un restart_game pouvait
-- rendre incomplet ou incohérent.
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
    'continent', p.continent,
    'global_position', (
      select count(*) + 1 from public.profiles o
      where o.rank_games_played >= 3 and o.rank_points > p.rank_points
    ),
    'continent_position', case
      when p.continent is null then null
      when (
        select count(*) from public.profiles o
        where o.rank_games_played >= 3 and o.continent = p.continent
      ) < 3 then null
      else (
        select count(*) + 1 from public.profiles o
        where o.rank_games_played >= 3 and o.continent = p.continent and o.rank_points > p.rank_points
      )
    end
  ) into v_rank
  from public.profiles p
  where p.id = v_user;

  select jsonb_build_object(
    'games_played', (select count(*) from public.game_results where user_id = v_user),
    'games_won', (select count(*) from public.game_results where user_id = v_user and won),
    'rank', v_rank,
    'by_role', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', role,
        'played', played,
        'won', won_count
      ) order by played desc)
      from (
        select role, count(*) as played, count(*) filter (where won) as won_count
        from public.game_results
        where user_id = v_user and role is not null
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
      from (
        select * from public.game_results where user_id = v_user order by created_at desc limit 20
      ) recent
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_my_stats() to authenticated;
