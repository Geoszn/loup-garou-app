-- ============================================================================
-- Ajoute le rôle de chaque joueur à la fiche détaillée d'une partie côté
-- dashboard admin (admin_get_game_detail, voir migration 0109). Demande
-- utilisateur : "je verrais les participants ainsi que le rôle de chacun"
-- en cliquant sur une partie en cours. Réservé à l'admin (déjà gardé par
-- is_admin_user en tête de fonction) — même logique que le reste de cette
-- fiche, qui révèle déjà d'autres informations normalement privées
-- (hunter_pending/captain_pending) pour le support/la modération.
-- ============================================================================
set search_path = public;

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
        'role', rs.role
      ) order by gp.seat_number)
      from public.game_players gp
      left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
      where gp.game_id = p_game_id
    ), '[]'::jsonb)
  );
end;
$function$;
