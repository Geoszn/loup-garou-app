-- Avatars personnalisables (pièces en calques : teint, coiffure, tenue,
-- accessoire, fond). Stockés dans profiles.avatar_config ; null = le joueur
-- garde l'ancienne icône. Les pièces se débloquent avec les points de rang,
-- comme les icônes (voir avatar_icon_min_points, migration 0074) : ce tableau
-- doit rester synchronisé avec PART_MIN_POINTS dans src/lib/avatarParts.ts.
set search_path = public;

alter table public.profiles add column if not exists avatar_config jsonb;

create or replace function public.avatar_part_min_points(p_kind text, p_value text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'hair' then case p_value
      when 'none' then 0 when 'fade' then 0 when 'afro' then 0 when 'braids' then 0
      when 'bun' then 100 when 'locs' then 250 when 'gele' then 600 end
    when 'outfit' then case p_value
      when 'tunic' then 0 when 'cloak' then 100 when 'kente' then 250 when 'hood' then 600 end
    when 'acc' then case p_value
      when 'none' then 0 when 'ring' then 0 when 'glasses' then 100 when 'scar' then 250 end
  end;
$$;

create or replace function public.set_my_avatar(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_points int;
  v_skin int;
  v_bg int;
  v_kind text;
  v_value text;
  v_min int;
  v_clean jsonb;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Avatar invalide.';
  end if;

  begin
    v_skin := (p_config ->> 'skin')::int;
    v_bg := (p_config ->> 'bg')::int;
  exception when others then
    raise exception 'Avatar invalide.';
  end;
  if v_skin is null or v_skin not between 0 and 5 or v_bg is null or v_bg not between 0 and 5 then
    raise exception 'Avatar invalide.';
  end if;

  select coalesce(rank_points, 0) into v_points from public.profiles where id = v_user;

  foreach v_kind in array array['hair', 'outfit', 'acc'] loop
    v_value := p_config ->> v_kind;
    v_min := public.avatar_part_min_points(v_kind, v_value);
    if v_min is null then
      raise exception 'Avatar invalide.';
    end if;
    if v_points < v_min then
      raise exception 'Cette pièce se débloque à % points de rang.', v_min;
    end if;
  end loop;

  v_clean := jsonb_build_object(
    'skin', v_skin,
    'bg', v_bg,
    'hair', p_config ->> 'hair',
    'outfit', p_config ->> 'outfit',
    'acc', p_config ->> 'acc'
  );

  update public.profiles set avatar_config = v_clean where id = v_user;
  return v_clean;
end;
$$;

revoke execute on function public.avatar_part_min_points(text, text) from public, anon, authenticated;
revoke execute on function public.set_my_avatar(jsonb) from public, anon;
grant execute on function public.set_my_avatar(jsonb) to authenticated;

-- get_my_game_view : ajoute avatar_config à chaque joueur (lu en direct sur
-- profiles, comme rank_tier). Reste identique par ailleurs.
create or replace function public.get_my_game_view(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_my_role text;
  v_my_alive boolean;
  v_lover_id uuid;
  v_wild_child_mentor uuid;
  v_result jsonb;
begin
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  select * into v_game from public.games where id = p_game_id;

  -- Bug corrigé (migration 0177) : cette fermeture automatique posait
  -- status='ended' directement, sans jamais passer par advance_phase — donc
  -- sans jamais déclencher clear_revival_pending_if_ended (migration 0174)
  -- ni aucun nettoyage des autres décisions en attente. hunter_pending/
  -- captain_pending/balance_ange_pending/revival_pending pouvaient rester
  -- posés sur une partie déjà fermée par inactivité (voir aussi les
  -- garde-fous ajoutés dans submit_revival_choice/submit_balance_ange_vote
  -- pour bloquer la conséquence la plus grave — consommer un artefact sans
  -- aucun effet — à la source, quel que soit le chemin qui a terminé la
  -- partie).
  if v_game.status <> 'ended' and v_game.last_activity_at < now() - interval '2 hours' then
    update public.games
    set status = 'ended',
        hunter_pending = null,
        hunter_context = null,
        captain_pending = null,
        balance_ange_pending = null,
        balance_ange_candidates = null,
        revival_pending = null,
        revival_pending_artifact_id = null
    where id = p_game_id;
    insert into public.game_log (game_id, message)
    values (p_game_id, 'La partie a été fermée automatiquement après 2h d''inactivité.');
    v_game.status := 'ended';
  end if;

  select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  select is_alive into v_my_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select lover_with, wild_child_mentor into v_lover_id, v_wild_child_mentor
  from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  select (
    jsonb_build_object(
      'game', to_jsonb(v_game) - 'thief_extra_roles',

      'players', coalesce((
        select jsonb_agg(
          to_jsonb(gp) || jsonb_build_object(
            'rank_tier', public.rank_tier_for_points(coalesce(pr.rank_points, 0)),
            'avatar_config', pr.avatar_config,
            'has_masque_griot', exists (
              select 1 from public.player_artifacts pa
              join public.store_artifacts sa on sa.id = pa.artifact_id
              where pa.user_id = gp.user_id and sa.effect_key = 'masque_griot'
            ),
            'plume_title_fr', (
              select sa.name_fr from public.player_artifacts pa
              join public.store_artifacts sa on sa.id = pa.artifact_id
              where pa.user_id = gp.user_id and sa.effect_key = 'plume_title' limit 1
            ),
            'plume_title_en', (
              select sa.name_en from public.player_artifacts pa
              join public.store_artifacts sa on sa.id = pa.artifact_id
              where pa.user_id = gp.user_id and sa.effect_key = 'plume_title' limit 1
            )
          )
          order by gp.seat_number
        )
        from public.game_players gp
        left join public.profiles pr on pr.id = gp.user_id
        where gp.game_id = p_game_id
      ), '[]'::jsonb),

      'my_role', v_my_role,
      'my_alive', coalesce(v_my_alive, false),
      'lover_id', v_lover_id,
      'wild_child_mentor', v_wild_child_mentor,

      'village_muted', public._is_village_muted(p_game_id, v_user),

      'daron_previous_target_id', case when v_my_role = 'daron' then (
        select target_id from public.night_actions
        where game_id = p_game_id and night_number = v_game.night_number - 1 and step = 'daron' and actor_id = v_user
        limit 1
      ) else null end,

      'daron_protected_id', case when v_my_role = 'daron' then (
        select target_id from public.night_actions
        where game_id = p_game_id and night_number = v_game.night_number and step = 'daron' and actor_id = v_user
        limit 1
      ) else null end,

      'daron_protection_worked', case when v_my_role = 'daron' and v_game.status = 'day_reveal' then exists (
        select 1 from public.game_log
        where game_id = p_game_id and night_number = v_game.night_number and kind = 'daron_save'
      ) else false end,

      -- Seul changement de cette migration : 'day_reveal' -> 'night' (voir
      -- commentaire de tête). Reste par ailleurs identique à 0167.
      'my_protected_by_daron_this_round', case when v_my_role <> 'daron' and v_game.status = 'night' then exists (
        select 1 from public.night_actions
        where game_id = p_game_id and night_number = v_game.night_number and step = 'daron' and target_id = v_user
      ) else false end,

      'log', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'message', message, 'created_at', created_at) order by created_at desc)
        from (
          select id, message, created_at from public.game_log
          where game_id = p_game_id order by created_at desc limit 60
        ) recent
      ), '[]'::jsonb)
    )
    || public.game_view_witch_fields(p_game_id, v_game, v_user, v_my_role)
    || public.game_view_wolf_pack_fields(p_game_id, v_game, v_user, v_my_role)
    || public.game_view_thief_fields(p_game_id, v_user)
    || public.game_view_wild_child_fields(p_game_id, v_game, v_user)
    || public.game_view_seer_griot_fields(p_game_id, v_user, v_my_role)
    || public.game_view_anancy_fields(p_game_id, v_game, v_user, v_my_role)
    || public.game_view_chasseuse_fields(p_game_id, v_user, v_my_role)
    || public.game_view_vote_fields(p_game_id, v_game, v_user, v_my_role, v_my_alive)
    || public.game_view_lobby_fields(p_game_id, v_game, v_user)
    || public.game_view_progression_fields(p_game_id, v_game, v_user, v_my_role, v_my_alive)
    || public.game_view_artifacts_fields(p_game_id, v_user)
  ) into v_result;

  return v_result;
end;
$function$;
