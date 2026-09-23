-- ============================================================================
-- Demande utilisateur : "améliore le dashboard admin afin que j'ai plus
-- d'utilité [...] pour pouvoir mieux sonder mon jeu et faire différents
-- diagnostics" — suite directe d'une investigation manuelle (bug de vote
-- rapporté en cours de partie) qui a nécessité plusieurs requêtes SQL
-- écrites à la main faute d'outil déjà en place dans le dashboard.
--
-- Deux changements, tous deux dans l'onglet "Salons" (🎲) déjà existant :
--
--   1. admin_list_active_games : nouveau paramètre p_include_ended (false
--      par défaut, comportement inchangé pour tout appelant existant) —
--      une fois vrai, inclut aussi les parties terminées. Jusqu'ici,
--      impossible d'inspecter une partie une fois finie : elle disparaît
--      purement et simplement de la liste.
--
--   2. admin_get_game_detail : trois nouvelles sections dans la fiche
--      détail, qui reprennent exactement ce qui a servi lors de
--      l'investigation manuelle —
--        - 'log' : journal complet de la partie (jusqu'ici totalement
--          absent de cette fiche, alors qu'il existe déjà côté joueur).
--        - 'votes' : historique complet des votes de jour, tous rounds,
--          avec les noms résolus (voter_name/target_name) plutôt que de
--          simples uuid.
--        - 'artifact_uses' : qui a utilisé quel artefact, à quel round.
--      Pas de recalcul de "qui aurait dû gagner le vote" ici : le vote du
--      Capitaine compte double au moment de la résolution, mais on ne
--      conserve nulle part QUI était Capitaine à CHAQUE round passé (seul
--      le dernier est connu, via games.last_vote_captain_id) — un
--      recalcul ferait courir le risque d'afficher un résultat
--      historiquement faux. Les votes bruts, round par round, suffisent
--      à l'usage diagnostic visé ici.
--
-- admin_list_active_games : ajouter un paramètre change l'ARITÉ de la
-- fonction (int) -> (int, boolean), donc `create or replace` seul créerait
-- une surcharge distincte SANS le grant execute de l'ancienne signature
-- (même piège déjà rencontré et corrigé en migration 0173) — drop explicite
-- de l'ancienne signature avant de recréer, puis re-grant.
-- ============================================================================
set search_path = public;

drop function if exists public.admin_list_active_games(int);

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

grant execute on function public.admin_list_active_games(int, boolean) to authenticated;

create or replace function public.admin_get_game_detail(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin uuid := auth.uid();
  v_game public.games%rowtype;
  v_pending_ids uuid[];
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Partie introuvable.';
  end if;

  v_pending_ids := case
    when v_game.status = 'night' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
      where gp.game_id = p_game_id and gp.is_alive
        and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.night_step = 'loup_garou'))
        and not exists (
          select 1 from public.night_actions na
          where na.game_id = p_game_id and na.night_number = v_game.night_number
            and na.step = v_game.night_step and na.actor_id = gp.user_id
        )
    ), array[]::uuid[])
    when v_game.status = 'day_vote' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      where gp.game_id = p_game_id and gp.is_alive
        and not exists (
          select 1 from public.votes v
          where v.game_id = p_game_id and v.round_number = v_game.night_number and v.voter_id = gp.user_id
        )
    ), array[]::uuid[])
    when v_game.status = 'captain_election' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      where gp.game_id = p_game_id and gp.is_alive
        and not exists (
          select 1 from public.votes v
          where v.game_id = p_game_id and v.round_number = 0 and v.voter_id = gp.user_id
        )
    ), array[]::uuid[])
    when v_game.status = 'day_reveal' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      where gp.game_id = p_game_id and gp.is_alive
        and not exists (
          select 1 from public.day_reveal_ready r
          where r.game_id = p_game_id and r.round_number = v_game.night_number and r.user_id = gp.user_id
        )
    ), array[]::uuid[])
    when v_game.status = 'day_vote_recap' then coalesce((
      select array_agg(gp.user_id)
      from public.game_players gp
      where gp.game_id = p_game_id and gp.is_alive
        and not exists (
          select 1 from public.vote_recap_ready r
          where r.game_id = p_game_id and r.round_number = v_game.night_number and r.user_id = gp.user_id
        )
    ), array[]::uuid[])
    else array[]::uuid[]
  end;

  return jsonb_build_object(
    'game', jsonb_build_object(
      'id', v_game.id,
      'code', v_game.code,
      'status', v_game.status,
      'is_public', v_game.is_public,
      'night_number', v_game.night_number,
      'night_step', v_game.night_step,
      'phase_deadline', v_game.phase_deadline,
      'created_at', v_game.created_at,
      'last_activity_at', v_game.last_activity_at,
      'hunter_pending', v_game.hunter_pending,
      'captain_pending', v_game.captain_pending
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', gp.user_id,
        'display_name', gp.display_name,
        'is_alive', gp.is_alive,
        'is_host', gp.is_host,
        'is_captain', gp.is_captain,
        'seat_number', gp.seat_number,
        'pending', gp.user_id = any(v_pending_ids),
        'role', rs.role,
        'death_cause', gp.death_cause,
        'died_at_night', gp.died_at_night
      ) order by gp.seat_number)
      from public.game_players gp
      left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
      where gp.game_id = p_game_id
    ), '[]'::jsonb),

    'log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'message', message, 'night_number', night_number, 'kind', kind, 'created_at', created_at
      ) order by created_at desc)
      from (
        select id, message, night_number, kind, created_at from public.game_log
        where game_id = p_game_id order by created_at desc limit 500
      ) recent
    ), '[]'::jsonb),

    'votes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'round_number', v.round_number,
        'voter_id', v.voter_id,
        'voter_name', gpv.display_name,
        'target_id', v.target_id,
        'target_name', gpt.display_name
      ) order by v.round_number, gpv.display_name)
      from public.votes v
      left join public.game_players gpv on gpv.game_id = p_game_id and gpv.user_id = v.voter_id
      left join public.game_players gpt on gpt.game_id = p_game_id and gpt.user_id = v.target_id
      where v.game_id = p_game_id
    ), '[]'::jsonb),

    'artifact_uses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', gau.user_id,
        'user_name', gp.display_name,
        'effect_key', sa.effect_key,
        'artifact_name', sa.name_fr,
        'round_number', gau.round_number,
        'used_at', gau.used_at
      ) order by gau.used_at)
      from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      left join public.game_players gp on gp.game_id = p_game_id and gp.user_id = gau.user_id
      where gau.game_id = p_game_id
    ), '[]'::jsonb)
  );
end;
$function$;
