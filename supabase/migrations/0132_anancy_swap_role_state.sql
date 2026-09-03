-- ============================================================================
-- Corrige l'échange de rôles d'Anancy (begin_night) : il n'échangeait que la
-- colonne `role`, jamais l'état qui va AVEC ce rôle (potions déjà bues par
-- la Sorcière, vie supplémentaire déjà consommée par l'Ancien, mentor déjà
-- choisi par l'Enfant Sauvage, pouvoir d'infection déjà utilisé par le Loup
-- Alpha...). Résultat signalé par un joueur : en récupérant la carte
-- Sorcière via Anancy, il repartait avec DEUX potions fraîches même si
-- l'ancienne Sorcière en avait déjà consommé une — l'état restait accroché
-- à l'ancienne joueuse (qui n'en avait plus l'usage) au lieu de suivre le
-- rôle vers son nouveau porteur.
--
-- Distinction volontaire, comme avant : `lover_with` (Cupidon touche des
-- PERSONNES, pas un rôle) et `infected_at_night` (trace le fait que CE
-- joueur précis a été infecté cette nuit-là, un événement qui lui est
-- arrivé, pas un pouvoir qu'il détient) restent attachés au joueur, jamais
-- échangés — exactement comme `village_muted_until_night` géré séparément
-- juste après. Seuls les compteurs "j'ai déjà utilisé mon pouvoir de ce
-- rôle" suivent désormais le rôle échangé.
-- ============================================================================
set search_path = public;

create or replace function public.begin_night(p_game_id uuid, p_night_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_first_step text;
  v_seconds int;
  v_pending_target1 uuid;
  v_pending_target2 uuid;
  v_role1 text;
  v_role2 text;
  v_state1 public.game_roles_secret%rowtype;
  v_state2 public.game_roles_secret%rowtype;
  v_wolf_roles text[] := array['loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'];
begin
  -- Applique l'échange de rôles d'Anancy DE LA NUIT PRÉCÉDENTE, maintenant
  -- seulement (voir migration 0122).
  select target_id, nullif(extra->>'target2', '')::uuid
  into v_pending_target1, v_pending_target2
  from public.night_actions
  where game_id = p_game_id and night_number = p_night_number - 1 and step = 'anancy' and target_id is not null
  limit 1;

  if v_pending_target1 is not null and v_pending_target2 is not null then
    select * into v_state1 from public.game_roles_secret where game_id = p_game_id and user_id = v_pending_target1;
    select * into v_state2 from public.game_roles_secret where game_id = p_game_id and user_id = v_pending_target2;
    v_role1 := v_state1.role;
    v_role2 := v_state2.role;

    -- Chaque joueur récupère le rôle ET l'état d'utilisation de pouvoir de
    -- l'AUTRE (potions, vie de l'Ancien, mentor de l'Enfant Sauvage,
    -- infection de l'Alpha) — c'est le rôle échangé qui garde en mémoire ce
    -- qui a déjà été fait avec lui, pas le joueur qui le quitte.
    update public.game_roles_secret
    set role = v_state2.role,
        heal_potion_used = v_state2.heal_potion_used,
        poison_potion_used = v_state2.poison_potion_used,
        ancien_extra_life_used = v_state2.ancien_extra_life_used,
        wild_child_mentor = v_state2.wild_child_mentor,
        wild_child_turned_at_night = v_state2.wild_child_turned_at_night,
        alpha_infect_used = v_state2.alpha_infect_used
    where game_id = p_game_id and user_id = v_pending_target1;

    update public.game_roles_secret
    set role = v_state1.role,
        heal_potion_used = v_state1.heal_potion_used,
        poison_potion_used = v_state1.poison_potion_used,
        ancien_extra_life_used = v_state1.ancien_extra_life_used,
        wild_child_mentor = v_state1.wild_child_mentor,
        wild_child_turned_at_night = v_state1.wild_child_turned_at_night,
        alpha_infect_used = v_state1.alpha_infect_used
    where game_id = p_game_id and user_id = v_pending_target2;

    -- Celui qui QUITTE le camp des Loups (loup avant, plus loup après) est
    -- rendu muet au village — jamais celui qui le rejoint, qui n'a aucun
    -- secret d'ex-coéquipier à trahir.
    if v_role1 = any(v_wolf_roles) and not (v_role2 = any(v_wolf_roles)) then
      update public.game_roles_secret set village_muted_until_night = p_night_number
      where game_id = p_game_id and user_id = v_pending_target1;
    elsif v_role2 = any(v_wolf_roles) and not (v_role1 = any(v_wolf_roles)) then
      update public.game_roles_secret set village_muted_until_night = p_night_number
      where game_id = p_game_id and user_id = v_pending_target2;
    end if;
  end if;

  delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves');

  v_first_step := public.next_night_step(p_game_id, p_night_number, null);
  v_seconds := public.step_duration_seconds(p_game_id, coalesce(v_first_step, 'resolve'));

  update public.games
  set status = 'night',
      night_number = p_night_number,
      night_step = coalesce(v_first_step, 'resolve'),
      phase_deadline = now() + make_interval(secs => v_seconds),
      night_deaths_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🌙 La nuit ' || p_night_number || ' tombe sur le village. Tout le monde ferme les yeux...');
end;
$function$;
