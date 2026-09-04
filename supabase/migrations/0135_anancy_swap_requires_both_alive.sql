-- ============================================================================
-- Corrige begin_night : l'échange d'Anancy est appliqué au tout début de la
-- nuit SUIVANTE (voir migration 0122), donc entre le moment où Anancy
-- choisit ses deux cibles (toutes deux vérifiées vivantes à cet instant,
-- voir submit_anancy) et le moment où l'échange s'applique réellement, l'une
-- d'elles peut mourir (vote du village, autre action de nuit...). Le code
-- appliquait quand même l'échange sans revérifier — le rôle de la cible
-- morte partait alors "dans le vide" (transféré à une ligne de joueur déjà
-- éliminé, sans plus aucun effet en jeu), tandis que l'AUTRE cible, bien
-- vivante, perdait son propre rôle pour hériter de celui du mort. Net
-- effet observé dans une partie réelle : un camp (ici les Loups) perdait un
-- membre "gratuitement", sans mort ni révélation supplémentaire.
--
-- Corrigé : si l'une des deux cibles n'est plus vivante au moment où
-- l'échange devrait s'appliquer, il est purement et simplement annulé —
-- aucun rôle ne change de main, avec un message dans le journal expliquant
-- pourquoi. L'autre partie de la logique (transfert de l'état du rôle,
-- migration 0132 ; mise en sourdine du transfuge, inchangée) reste
-- identique quand les deux cibles sont bien vivantes.
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
  v_target1_alive boolean;
  v_target2_alive boolean;
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
    select is_alive into v_target1_alive from public.game_players where game_id = p_game_id and user_id = v_pending_target1;
    select is_alive into v_target2_alive from public.game_players where game_id = p_game_id and user_id = v_pending_target2;

    if not coalesce(v_target1_alive, false) or not coalesce(v_target2_alive, false) then
      insert into public.game_log (game_id, message, night_number)
      values (p_game_id, '🕸️ Le sort d’Anancy s’est brisé : l’un des joueurs visés n’était plus de ce monde au moment où le destin devait basculer.', p_night_number);
    else
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
