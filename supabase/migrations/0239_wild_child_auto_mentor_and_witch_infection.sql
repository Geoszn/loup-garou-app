-- Deux correctifs de jeu.
--
-- 1. Enfant Sauvage : s'il n'a pas choisi de mentor à la fin du chronomètre de son tour, le sort lui en
--    désigne un parmi les joueurs vivants (jamais lui-même), au lieu de sauter l'étape sans mentor.
--      * auto_assign_wild_child_mentor() fait ce tirage ; advance_phase() l'appelle quand l'étape se termine.
--      * le message du journal reste neutre : « Le sort a désigné le mentor de l'Enfant Sauvage en secret. »
--
-- 2. Infection du Loup Alpha et Sorcière :
--      * alpha_infection_pending() dit si l'infection aura lieu cette nuit (majorité de la meute d'accord ET
--        confirmation de l'Alpha), avec la même règle que resolve_night_deaths ;
--      * pendant le tour de la Sorcière, la cible infectée n'est plus présentée comme une victime à guérir
--        (la guérison est sans effet sur une infection) : wolf_infect_target_visible_to_witch la lui montre à part ;
--      * au lever du jour, witch_infected_notice_id lui dit qui a réellement été infecté.
-- Rejouable sans risque. À appliquer APRÈS 0238.

create or replace function public.auto_assign_wild_child_mentor(p_game_id uuid, p_night integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child record;
  v_mentor uuid;
  v_assigned boolean := false;
begin
  for v_child in
    select rs.user_id
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'enfant_sauvage' and rs.wild_child_mentor is null and gp.is_alive
  loop
    select user_id into v_mentor
    from public.game_players
    where game_id = p_game_id and is_alive and user_id <> v_child.user_id
    order by random()
    limit 1;

    if v_mentor is null then
      continue;
    end if;

    update public.game_roles_secret set wild_child_mentor = v_mentor
    where game_id = p_game_id and user_id = v_child.user_id;

    insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
    values (p_game_id, p_night, 'enfant_sauvage', v_child.user_id, v_mentor)
    on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

    v_assigned := true;
  end loop;

  if v_assigned then
    insert into public.game_log (game_id, message) values (p_game_id, '🐾 Le sort a désigné le mentor de l’Enfant Sauvage en secret.');
  end if;
end;
$$;

create or replace function public.alpha_infection_pending(p_game_id uuid, p_night integer)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_used boolean;
  v_alive_wolves int;
  v_agreed int;
  v_needed int;
begin
  if not public.role_alive_exists(p_game_id, 'loup_alpha') then
    return false;
  end if;

  select alpha_infect_used into v_used
  from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha';
  if coalesce(v_used, false) then
    return false;
  end if;

  select count(*) into v_alive_wolves
  from public.game_roles_secret rs
  join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role in ('loup_garou', 'sans_visage', 'grand_mechant_loup') and gp.is_alive;

  select count(*) into v_agreed
  from public.alpha_infect_agreements
  where game_id = p_game_id and night_number = p_night;

  v_needed := case when v_alive_wolves = 0 then 0 else v_alive_wolves / 2 + 1 end;

  return v_agreed >= v_needed and exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night and step = 'loup_alpha_confirm'
      and (extra->>'confirmed')::boolean is true
  );
end;
$$;

create or replace function public.advance_phase(p_game_id uuid, p_forced boolean DEFAULT false)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_game public.games%rowtype;
  v_next_step text;
  v_seconds int;
  v_ended boolean;
  v_random_id uuid;
  v_random_name text;
  v_revival record;
  v_chasseuse_id uuid;
  v_chasseuse_target uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status = 'ended' or v_game.status = 'lobby' then
    return;
  end if;

  if not p_forced and v_game.phase_deadline is not null and now() < v_game.phase_deadline + interval '2 seconds' then
    return;
  end if;

  if v_game.hunter_pending is not null then
    if p_forced or (v_game.phase_deadline is not null and now() >= v_game.phase_deadline) then
      insert into public.game_log (game_id, message)
      select p_game_id, gp.display_name || ' (Chasseur) n’a pas tiré à temps.'
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_game.hunter_pending;

      update public.games set hunter_pending = null, hunter_context = null where id = p_game_id;
      select * into v_game from public.games where id = p_game_id;
    else
      return;
    end if;
  end if;

  if v_game.captain_pending is not null then
    if p_forced or (v_game.phase_deadline is not null and now() >= v_game.phase_deadline) then
      select user_id, display_name into v_random_id, v_random_name
      from public.game_players
      where game_id = p_game_id and is_alive
      order by random()
      limit 1;

      if v_random_id is not null then
        update public.game_players set is_captain = false where game_id = p_game_id and user_id = v_game.captain_pending;
        update public.game_players set is_captain = true where game_id = p_game_id and user_id = v_random_id;

        insert into public.game_log (game_id, message, night_number, kind)
        values (
          p_game_id,
          '🎖️ Personne n’a désigné de successeur à temps : le sort en a décidé — ' || v_random_name || ' devient le nouveau Capitaine !',
          v_game.night_number,
          'captain_random'
        );
      else
        insert into public.game_log (game_id, message, night_number)
        select p_game_id, gp.display_name || ' (ancien Capitaine) n’a pas désigné de successeur à temps : le titre est perdu.', v_game.night_number
        from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_game.captain_pending;
      end if;

      update public.games set captain_pending = null where id = p_game_id;
      select * into v_game from public.games where id = p_game_id;
    else
      return;
    end if;
  end if;

  -- Balance de l'Ange (migration 0152) : même patron de "drain gate" que
  -- hunter_pending/captain_pending ci-dessus — au bout du délai (45s, voir
  -- plus bas où il est posé), repli sur le comportement d'origine d'une
  -- égalité (personne n'est éliminé) plutôt que de bloquer la partie
  -- indéfiniment si le propriétaire ne répond pas.
  if v_game.balance_ange_pending is not null then
    if p_forced or (v_game.phase_deadline is not null and now() >= v_game.phase_deadline) then
      insert into public.game_log (game_id, message)
      values (p_game_id, '🗳️ Égalité des voix : personne n’est éliminé aujourd’hui.');
      update public.games set balance_ange_pending = null, balance_ange_candidates = null where id = p_game_id;
      select * into v_game from public.games where id = p_game_id;
    else
      return;
    end if;
  end if;

  -- Résurrection en attente (Pierre des Ancêtres / Larme de Renaissance,
  -- migration 0172) : même patron de "drain gate" — au bout du délai, repli
  -- sur un REFUS par défaut (jamais une consommation automatique de
  -- l'artefact sans réponse du joueur, contrairement à hunter/captain
  -- ci-dessus qui ont un fallback "actif").
  if v_game.revival_pending is not null then
    if p_forced or (v_game.phase_deadline is not null and now() >= v_game.phase_deadline) then
      update public.games set revival_pending = null, revival_pending_artifact_id = null where id = p_game_id;
      select * into v_game from public.games where id = p_game_id;
    else
      return;
    end if;
  end if;

  if v_game.status = 'role_reveal' then
    if coalesce((v_game.settings->'role_counts'->>'capitaine')::boolean, false)
      and not exists (select 1 from public.game_players where game_id = p_game_id and is_captain)
    then
      select coalesce((v_game.settings->>'vote_seconds')::int, 45) into v_seconds;
      update public.games
      set status = 'captain_election', phase_deadline = now() + make_interval(secs => v_seconds)
      where id = p_game_id;
      insert into public.game_log (game_id, message)
      values (p_game_id, '🎖️ Élisez votre Capitaine avant que la nuit ne tombe !');
      return;
    end if;
    perform public.begin_night(p_game_id, 1);
    return;
  end if;

  if v_game.status = 'captain_election' then
    perform public.resolve_captain_election(p_game_id);
    perform public.begin_night(p_game_id, 1);
    return;
  end if;

  if v_game.status = 'night' then
    if v_game.night_step = 'resolve' then
      if not v_game.night_deaths_resolved then
        perform public.resolve_night_deaths(p_game_id);
      end if;

      v_ended := public.check_and_apply_ange_win(p_game_id);
      if v_ended then
        perform public.clear_revival_pending_if_ended(p_game_id);
        return;
      end if;

      v_ended := public.check_and_apply_chasseuse_win(p_game_id);
      if v_ended then
        perform public.clear_revival_pending_if_ended(p_game_id);
        return;
      end if;

      v_ended := public.check_and_apply_anancy_win(p_game_id);
      if v_ended then
        perform public.clear_revival_pending_if_ended(p_game_id);
        return;
      end if;

      v_ended := public.check_and_apply_win(p_game_id);
      if v_ended then
        perform public.clear_revival_pending_if_ended(p_game_id);
        return;
      end if;

      select * into v_game from public.games where id = p_game_id;

      if not v_game.anancy_swap_resolved then
        perform public.apply_anancy_swap(p_game_id, v_game.night_number);
        update public.games set anancy_swap_resolved = true where id = p_game_id;
      end if;

      if v_game.hunter_pending is not null then
        select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;
      if v_game.captain_pending is not null then
        update public.games set phase_deadline = now() + interval '120 seconds' where id = p_game_id;
        return;
      end if;
      if v_game.revival_pending is not null then
        select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;

      delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves');

      -- Pierre des Ancêtres / Larme de Renaissance (migration 0152/0169) :
      -- révèle les résurrections en attente juste avant de basculer vers le
      -- jour — après la suppression du chat nocturne (rien à cacher, c'est
      -- une annonce publique), avant que le jour ne commence réellement.
      -- Couvre aussi bien une mort de CETTE nuit qu'une mort par vote du
      -- jour précédent : cette bascule est la toute première occasion de
      -- "passer au jour suivant" pour les deux cas, sans distinction de
      -- cause à faire ici. Le message (et un éventuel reset de rôle) diffère
      -- selon l'artefact réellement utilisé pour CE joueur, retrouvé via
      -- game_artifact_uses. Ne contient plus QUE les joueurs ayant
      -- explicitement accepté (voir submit_revival_choice, migration 0172) —
      -- pending_revival n'est désormais posé qu'après un "oui" du joueur.
      for v_revival in
        select gp.user_id, gp.display_name from public.game_players gp
        where gp.game_id = p_game_id and gp.pending_revival = true
      loop
        update public.game_players set is_alive = true, pending_revival = false
        where game_id = p_game_id and user_id = v_revival.user_id;

        if exists (
          select 1 from public.game_artifact_uses gau
          join public.store_artifacts sa on sa.id = gau.artifact_id
          where gau.game_id = p_game_id and gau.user_id = v_revival.user_id and sa.effect_key = 'larme_renaissance'
        ) then
          update public.game_roles_secret set role = 'villageois'
          where game_id = p_game_id and user_id = v_revival.user_id;

          insert into public.game_log (game_id, message, night_number)
          values (p_game_id, '💧 ' || v_revival.display_name || ' revient d’entre les morts grâce à la Larme de Renaissance, mais en a perdu tout souvenir : il ou elle repart simple Villageois(e).', v_game.night_number);
        else
          insert into public.game_log (game_id, message, night_number)
          values (p_game_id, '🌄 ' || v_revival.display_name || ' revient d’entre les morts, grâce à la Pierre des Ancêtres !', v_game.night_number);
        end if;
      end loop;

      -- Chasseuse (migration 0180) : cible attribuée au tout début du
      -- PREMIER jour (night_number vaut encore 1 ici, celui de la nuit qui
      -- vient de s'écouler) au lieu du début de la nuit 2 (0163/0166) —
      -- retour utilisateur explicite. Même logique champ pour champ que
      -- l'ancien bloc de begin_night, simplement déplacée ici.
      if v_game.night_number = 1 then
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
            set chasseuse_target_id = v_chasseuse_target, chasseuse_target_assigned_at_night = v_game.night_number
            where game_id = p_game_id and user_id = v_chasseuse_id;
          end if;
        end if;
      end if;

      select coalesce((settings->>'role_reveal_seconds')::int, 15) into v_seconds from public.games where id = p_game_id;
      update public.games
      set status = 'day_reveal', phase_deadline = now() + make_interval(secs => greatest(v_seconds, 6))
      where id = p_game_id;
      return;
    else
      -- Enfant Sauvage (migration 0239) : sans choix de mentor à la fin du chronomètre, le sort en désigne un.
      if v_game.night_step = 'enfant_sauvage' then
        perform public.auto_assign_wild_child_mentor(p_game_id, v_game.night_number);
      end if;
      v_next_step := public.next_night_step(p_game_id, v_game.night_number, v_game.night_step);
      v_seconds := public.step_duration_seconds(p_game_id, coalesce(v_next_step, 'resolve'));
      update public.games
      set night_step = coalesce(v_next_step, 'resolve'),
          phase_deadline = now() + make_interval(secs => v_seconds)
      where id = p_game_id;
      if v_next_step is null then
        perform public.advance_phase(p_game_id, true);
      end if;
      return;
    end if;
  end if;

  if v_game.status = 'day_reveal' then
    select coalesce((settings->>'discussion_seconds')::int, 180) into v_seconds from public.games where id = p_game_id;
    update public.games
    set status = 'day_discussion', phase_deadline = now() + make_interval(secs => v_seconds)
    where id = p_game_id;
    insert into public.game_log (game_id, message) values (p_game_id, '💬 Le village débat. Qui soupçonnez-vous ?');
    return;
  end if;

  if v_game.status = 'day_discussion' then
    select coalesce((settings->>'vote_seconds')::int, 45) into v_seconds from public.games where id = p_game_id;
    update public.games
    set status = 'day_vote', phase_deadline = now() + make_interval(secs => v_seconds), day_vote_resolved = false
    where id = p_game_id;
    insert into public.game_log (game_id, message) values (p_game_id, '🗳️ Le vote est ouvert !');
    return;
  end if;

  if v_game.status = 'day_vote' then
    if not v_game.day_vote_resolved then
      perform public.resolve_day_vote_deaths(p_game_id);
    end if;

    v_ended := public.check_and_apply_ange_win(p_game_id);
    if v_ended then
      perform public.clear_revival_pending_if_ended(p_game_id);
      return;
    end if;

    v_ended := public.check_and_apply_chasseuse_win(p_game_id);
    if v_ended then
      perform public.clear_revival_pending_if_ended(p_game_id);
      return;
    end if;

    v_ended := public.check_and_apply_win(p_game_id);
    if v_ended then
      perform public.clear_revival_pending_if_ended(p_game_id);
      return;
    end if;

    select * into v_game from public.games where id = p_game_id;
    if v_game.hunter_pending is not null then
      select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
      update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
      return;
    end if;
    if v_game.captain_pending is not null then
      update public.games set phase_deadline = now() + interval '120 seconds' where id = p_game_id;
      return;
    end if;
    if v_game.revival_pending is not null then
      select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
      update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
      return;
    end if;
    -- Balance de l'Ange : posé par resolve_day_vote_deaths juste au-dessus
    -- (dans le même appel) si une égalité éligible vient d'avoir lieu — même
    -- traitement que les deux blocs hunter/captain qui précèdent : on
    -- prolonge le délai et on attend, sans passer à day_vote_recap.
    if v_game.balance_ange_pending is not null then
      update public.games set phase_deadline = now() + interval '45 seconds' where id = p_game_id;
      return;
    end if;

    select coalesce((settings->>'vote_recap_seconds')::int, 90) into v_seconds from public.games where id = p_game_id;
    update public.games
    set status = 'day_vote_recap', phase_deadline = now() + make_interval(secs => v_seconds)
    where id = p_game_id;
    return;
  end if;

  if v_game.status = 'day_vote_recap' then
    perform public.begin_night(p_game_id, v_game.night_number + 1);
    return;
  end if;
end;
$function$;

create or replace function public.game_view_witch_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'witch_saved_me', case when p_game.status = 'day_reveal' then exists (
      select 1 from public.game_log
      where game_id = p_game_id and night_number = p_game.night_number and kind = 'witch_heal'
        and (meta->>'target_user_id')::uuid = p_user
    ) else false end,

    'witch_poisoned_me', case when p_game.status = 'day_reveal' then exists (
      select 1 from public.game_players
      where game_id = p_game_id and user_id = p_user
        and death_cause = 'sorciere' and died_at_night = p_game.night_number
    ) else false end,

    'witch_heal_used', case when p_my_role = 'sorciere' then (
      select heal_potion_used from public.game_roles_secret where game_id = p_game_id and user_id = p_user
    ) else null end,

    'witch_poison_used', case when p_my_role = 'sorciere' then (
      select poison_potion_used from public.game_roles_secret where game_id = p_game_id and user_id = p_user
    ) else null end,

    -- La victime des loups : null quand c'est en réalité une infection (la guérison n'y peut rien) — la
    -- Sorcière est alors prévenue à part, avec le nom de l'infecté.
    'wolf_target_visible_to_witch', case
      when p_my_role = 'sorciere' and p_game.status = 'night' and p_game.night_step = 'sorciere'
        and not public.alpha_infection_pending(p_game_id, p_game.night_number)
      then public.get_wolf_target(p_game_id, p_game.night_number)
      else null
    end,

    'wolf_infect_target_visible_to_witch', case
      when p_my_role = 'sorciere' and p_game.status = 'night' and p_game.night_step = 'sorciere'
        and public.alpha_infection_pending(p_game_id, p_game.night_number)
      then public.get_wolf_target(p_game_id, p_game.night_number)
      else null
    end,

    -- Au lever du jour : la Sorcière apprend qui a réellement été infecté cette nuit.
    'witch_infected_notice_id', case
      when p_my_role = 'sorciere' and p_game.status = 'day_reveal' then (
        select (l.meta->>'victim_id')::uuid
        from public.game_log l
        where l.game_id = p_game_id and l.kind = 'alpha_infect' and l.night_number = p_game.night_number
        order by l.created_at desc limit 1
      )
      else null
    end
  );
$$;

revoke execute on function public.auto_assign_wild_child_mentor(uuid, integer) from public, anon, authenticated;
revoke execute on function public.alpha_infection_pending(uuid, integer) from public, anon, authenticated;
revoke execute on function public.advance_phase(uuid, boolean) from public, anon, authenticated;
grant execute on function public.advance_phase(uuid, boolean) to authenticated;
revoke execute on function public.game_view_witch_fields(uuid, public.games, uuid, text) from public, anon, authenticated;
