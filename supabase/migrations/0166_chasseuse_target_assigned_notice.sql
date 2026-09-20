-- ============================================================================
-- Notification pour la Chasseuse quand sa cible lui est attribuée (retour
-- utilisateur) : jusqu'ici, la désignation automatique de cible (nuit 2,
-- voir begin_night) était totalement silencieuse — seul l'encart permanent
-- "Votre cible" (GameRoom.tsx, ChasseuseTargetPanel) la révélait, sans
-- garantie que le joueur le remarque au bon moment. Ajoute une révélation
-- ponctuelle dans le récap de nuit (NightRecapModal), même patron que les
-- autres révélations personnelles qui s'y trouvent déjà (potion de la
-- Sorcière, infection du Loup Alpha, échange d'Anancy...).
--
-- Nouvelle colonne chasseuse_target_assigned_at_night : retient à quelle
-- nuit la cible ACTUELLE a été fixée, pour ne montrer la révélation que la
-- toute première fois (comparaison avec night_number côté lecture) — même
-- rôle que wild_child_turned_at_night/infected_at_night déjà présents sur
-- cette même table pour des besoins similaires.
--
-- Volontairement réservé à l'attribution AUTOMATIQUE (begin_night) : un
-- changement de cible via submit_chasseuse_choice (abandonner/continuer)
-- est déjà une action volontaire du joueur, qui voit son panneau permanent
-- se mettre à jour immédiatement — pas besoin d'une révélation en plus au
-- prochain récap de nuit pour quelque chose qu'il vient de déclencher
-- lui-même.
-- ============================================================================
set search_path = public;

alter table public.game_roles_secret
  add column if not exists chasseuse_target_assigned_at_night int;

-- ----------------------------------------------------------------------------
-- begin_night : retient la nuit d'attribution en plus de la cible
-- elle-même. Reste identique à 0163 sinon.
-- ----------------------------------------------------------------------------
create or replace function public.begin_night(p_game_id uuid, p_night_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_first_step text;
  v_seconds int;
  v_chasseuse_id uuid;
  v_chasseuse_target uuid;
begin
  delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves');

  v_first_step := public.next_night_step(p_game_id, p_night_number, null);
  v_seconds := public.step_duration_seconds(p_game_id, coalesce(v_first_step, 'resolve'));

  update public.games
  set status = 'night',
      night_number = p_night_number,
      night_step = coalesce(v_first_step, 'resolve'),
      phase_deadline = now() + make_interval(secs => v_seconds),
      night_deaths_resolved = false,
      anancy_swap_resolved = false
  where id = p_game_id;

  if p_night_number >= 2 then
    select rs.user_id into v_chasseuse_id
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'chasseuse' and rs.chasseuse_target_id is null and gp.is_alive
    limit 1;

    if v_chasseuse_id is not null then
      select user_id into v_chasseuse_target
      from public.game_players
      where game_id = p_game_id and is_alive and user_id <> v_chasseuse_id
      order by random() limit 1;

      if v_chasseuse_target is not null then
        update public.game_roles_secret
        set chasseuse_target_id = v_chasseuse_target, chasseuse_target_assigned_at_night = p_night_number
        where game_id = p_game_id and user_id = v_chasseuse_id;
      end if;
    end if;
  end if;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🌙 La nuit ' || p_night_number || ' tombe sur le village. Tout le monde ferme les yeux...');
end;
$function$;

-- ----------------------------------------------------------------------------
-- apply_anancy_swap : la nouvelle colonne suit le rôle lors d'un échange,
-- comme les 3 autres colonnes chasseuse_* déjà présentes. Reste identique à
-- 0163 sinon.
-- ----------------------------------------------------------------------------
create or replace function public.apply_anancy_swap(p_game_id uuid, p_night_number int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_target1 uuid;
  v_pending_target2 uuid;
  v_role1 text;
  v_role2 text;
  v_state1 public.game_roles_secret%rowtype;
  v_state2 public.game_roles_secret%rowtype;
  v_target1_alive boolean;
  v_target2_alive boolean;
  v_wolf_roles text[] := array['loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'];
begin
  select target_id, nullif(extra->>'target2', '')::uuid
  into v_pending_target1, v_pending_target2
  from public.night_actions
  where game_id = p_game_id and night_number = p_night_number and step = 'anancy' and target_id is not null
  limit 1;

  if v_pending_target1 is null or v_pending_target2 is null then
    return;
  end if;

  select is_alive into v_target1_alive from public.game_players where game_id = p_game_id and user_id = v_pending_target1;
  select is_alive into v_target2_alive from public.game_players where game_id = p_game_id and user_id = v_pending_target2;

  if not coalesce(v_target1_alive, false) or not coalesce(v_target2_alive, false) then
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '🕸️ Le sort d’Anancy s’est brisé : l’un des joueurs visés n’était plus de ce monde au moment où le destin devait basculer.', p_night_number);
    return;
  end if;

  select * into v_state1 from public.game_roles_secret where game_id = p_game_id and user_id = v_pending_target1;
  select * into v_state2 from public.game_roles_secret where game_id = p_game_id and user_id = v_pending_target2;
  v_role1 := v_state1.role;
  v_role2 := v_state2.role;

  update public.game_roles_secret
  set role = v_state2.role,
      heal_potion_used = v_state2.heal_potion_used,
      poison_potion_used = v_state2.poison_potion_used,
      ancien_extra_life_used = v_state2.ancien_extra_life_used,
      wild_child_mentor = v_state2.wild_child_mentor,
      wild_child_turned_at_night = v_state2.wild_child_turned_at_night,
      alpha_infect_used = v_state2.alpha_infect_used,
      chasseuse_target_id = v_state2.chasseuse_target_id,
      chasseuse_used_reassignment = v_state2.chasseuse_used_reassignment,
      chasseuse_pending_choice = v_state2.chasseuse_pending_choice,
      chasseuse_target_assigned_at_night = v_state2.chasseuse_target_assigned_at_night
  where game_id = p_game_id and user_id = v_pending_target1;

  update public.game_roles_secret
  set role = v_state1.role,
      heal_potion_used = v_state1.heal_potion_used,
      poison_potion_used = v_state1.poison_potion_used,
      ancien_extra_life_used = v_state1.ancien_extra_life_used,
      wild_child_mentor = v_state1.wild_child_mentor,
      wild_child_turned_at_night = v_state1.wild_child_turned_at_night,
      alpha_infect_used = v_state1.alpha_infect_used,
      chasseuse_target_id = v_state1.chasseuse_target_id,
      chasseuse_used_reassignment = v_state1.chasseuse_used_reassignment,
      chasseuse_pending_choice = v_state1.chasseuse_pending_choice,
      chasseuse_target_assigned_at_night = v_state1.chasseuse_target_assigned_at_night
  where game_id = p_game_id and user_id = v_pending_target2;

  -- Démarre désormais dès le jour qui suit immédiatement l'échange (voir
  -- migration 0157) plutôt que le cycle suivant.
  if v_role1 = any(v_wolf_roles) and not (v_role2 = any(v_wolf_roles)) then
    update public.game_roles_secret set village_muted_until_night = p_night_number
    where game_id = p_game_id and user_id = v_pending_target1;
  elsif v_role2 = any(v_wolf_roles) and not (v_role1 = any(v_wolf_roles)) then
    update public.game_roles_secret set village_muted_until_night = p_night_number
    where game_id = p_game_id and user_id = v_pending_target2;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- game_view_chasseuse_fields : ajoute my_chasseuse_target_assigned_this_round
-- — vrai seulement pendant le récap ('day_reveal') de la nuit où la cible
-- actuelle vient d'être fixée. Signature inchangée (p_game_id suffit déjà à
-- retrouver le statut/la nuit courante via une sous-requête sur games,
-- pas besoin d'ajouter un paramètre). Reste identique à 0163 sinon.
-- ----------------------------------------------------------------------------
create or replace function public.game_view_chasseuse_fields(
  p_game_id uuid, p_user uuid, p_my_role text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_chasseuse_target_name', case when p_my_role = 'chasseuse' then (
      select gp.display_name
      from public.game_roles_secret rs
      join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.chasseuse_target_id
      where rs.game_id = p_game_id and rs.user_id = p_user
    ) else null end,

    'my_chasseuse_used_reassignment', case when p_my_role = 'chasseuse' then (
      select chasseuse_used_reassignment from public.game_roles_secret
      where game_id = p_game_id and user_id = p_user
    ) else null end,

    'my_chasseuse_target_assigned_this_round', case when p_my_role = 'chasseuse' then coalesce((
      select rs.chasseuse_target_assigned_at_night = g.night_number and g.status = 'day_reveal'
      from public.game_roles_secret rs
      join public.games g on g.id = p_game_id
      where rs.game_id = p_game_id and rs.user_id = p_user
    ), false) else false end
  );
$$;
