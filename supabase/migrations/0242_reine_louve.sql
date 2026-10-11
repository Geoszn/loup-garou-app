-- Nouveau rôle : la REINE LOUVE (camp des Loups) — « Le Manteau de la Meute ».
--
-- Chaque nuit, AVANT la Voyante, elle peut couvrir un loup vivant (elle-même comprise, une seule fois) : si la Voyante
-- le sonde cette nuit-là, elle le voit comme un simple villageois. Le sort ne dure que cette nuit.
--  * chaque loup n'est couvert qu'une fois par partie (historique = les actions 'reine_louve' déjà enregistrées) ;
--    la protection est consommée dès le choix, même si la Voyante ne sonde personne ;
--  * ne peut pas couvrir un Sans-Visage (déjà invisible pour la Voyante) ;
--  * elle peut passer son tour (aucune cible) ;
--  * elle seule apprend, au lever du jour, que son manteau a trompé la Voyante (queen_shield_worked) ;
--  * compatible avec le Sans-Visage et le masque du même nom ; fonctionne comme un loup pour tout le reste
--    (vote de la meute, chat, infection, victoire, classements, bots de test).
-- Mode automatique : proposée seulement avec au moins 3 loups (voir compute_default_role_counts).
-- Rejouable sans risque. À appliquer APRÈS 0241.

alter table public.games drop constraint if exists games_night_step_check;
alter table public.games add constraint games_night_step_check
  check (night_step = any (array[
    'daron','voleur','cupidon','enfant_sauvage','reine_louve','voyante','griot',
    'loup_garou','grand_mechant_loup','sorciere','petite_fille','resolve','anancy'
  ]));

alter table public.role_config drop constraint if exists role_config_role_check;
alter table public.role_config add constraint role_config_role_check check (role in (
  'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve', 'voyante', 'sorciere',
  'chasseur', 'petite_fille', 'cupidon', 'ancien', 'voleur', 'enfant_sauvage',
  'griot', 'anancy', 'ange', 'daron', 'chasseuse'
));
insert into public.role_config (role) values ('reine_louve') on conflict (role) do nothing;

-- Loups que la Reine peut encore couvrir : vivants, jamais couverts de la partie, hors Sans-Visage.
create or replace function public.reine_louve_eligible_ids(p_game_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(rs.user_id), '{}'::uuid[])
  from public.game_roles_secret rs
  join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id
    and gp.is_alive
    and rs.role in ('loup_garou', 'loup_alpha', 'grand_mechant_loup', 'reine_louve')
    and not exists (
      select 1 from public.night_actions na
      where na.game_id = p_game_id and na.step = 'reine_louve' and na.target_id = rs.user_id
    )
$$;

create or replace function public.submit_reine_louve(p_game_id uuid, p_target uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'reine_louve' then
    raise exception 'Ce n’est pas le moment pour la Reine Louve.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'reine_louve' then
    raise exception 'Vous n’êtes pas la Reine Louve.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes morte.';
  end if;

  if p_target is not null and not (p_target = any(public.reine_louve_eligible_ids(p_game_id))) then
    raise exception 'Ce loup ne peut pas être couvert (déjà protégé plus tôt dans la partie, ou hors de la meute).';
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'reine_louve', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  perform public.advance_phase(p_game_id, true);
end;
$$;

create or replace function public.can_access_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_banned boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if;
  if v_banned then return false; end if;

  if p_channel = 'lobby' then
    return v_status in ('lobby', 'ended');
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    return v_alive and v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve');
  end if;

  if p_channel = 'amoureux' then
    if not v_alive or v_status not in ('day_reveal', 'day_discussion', 'day_vote') then
      return false;
    end if;
    return exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = auth.uid() and lover_with is not null
    );
  end if;

  return false;
end;
$$;

create or replace function public.can_read_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then
    -- Pas participant de la partie : peut-être un spectateur avec une
    -- demande de rejoindre en attente (voir get_spectator_game_view) —
    -- mêmes salons qu'un fantôme, en lecture seule uniquement.
    if p_channel in ('village', 'graveyard') and exists (
      select 1 from public.game_join_requests
      where game_id = p_game_id and user_id = auth.uid() and status = 'pending'
    ) then
      return true;
    end if;
    return false;
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    if v_alive then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
    else
      return true;
    end if;
  end if;

  if p_channel = 'wolves' then
    if v_status <> 'night' then
      return false;
    end if;
    if v_alive then
      select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
      return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve');
    end if;
    return exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = auth.uid() and sa.effect_key = 'parchemin_griot'
    );
  end if;

  if p_channel = 'amoureux' then
    if not v_alive or v_status not in ('day_reveal', 'day_discussion', 'day_vote') then
      return false;
    end if;
    return exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = auth.uid() and lover_with is not null
    );
  end if;

  return false;
end;
$$;

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
  where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and gp.is_alive;

  if v_alive = 2 then
    select gp.user_id into v_lover1
    from public.game_players gp
    join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id and gp.is_alive and rs.lover_with is not null limit 1;
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
    perform public.sync_daily_quests_for_all_players(p_game_id);

    return true;
  end if;

  return false;
end;
$$;

create or replace function public.infect_player(p_game_id uuid, p_user_id uuid, p_night integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_role text;
begin
  select role into v_old_role from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;
  if v_old_role is null or v_old_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') then
    return; -- déjà loup ou introuvable, rien à faire
  end if;

  update public.game_roles_secret
  set role = 'loup_garou', infected_at_night = p_night
  where game_id = p_game_id and user_id = p_user_id;

  update public.game_roles_secret set alpha_infect_used = true
  where game_id = p_game_id and role = 'loup_alpha';

  insert into public.game_log (game_id, message, night_number, kind, meta)
  values (
    p_game_id,
    '🧬 Une infection s''est propagée cette nuit... un villageois a secrètement rejoint les Loups-Garous.',
    p_night,
    'alpha_infect',
    jsonb_build_object('victim_id', p_user_id)
  );
end;
$$;

create or replace function public.kill_player(p_game_id uuid, p_user_id uuid, p_cause text, p_night int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text;
  v_was_captain boolean;
  v_lover_id uuid;
  v_ancien_used boolean;
  v_wild_child_id uuid;
  v_any_wild_child_converted boolean := false;
  v_pierre_artifact_id uuid;
  v_larme_artifact_id uuid;
begin
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

  if p_cause = 'loup_garou' and v_role = 'ancien' then
    select ancien_extra_life_used into v_ancien_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if not coalesce(v_ancien_used, false) and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = p_user_id and is_alive
    ) then
      update public.game_roles_secret set ancien_extra_life_used = true
      where game_id = p_game_id and user_id = p_user_id;

      insert into public.game_log (game_id, message, night_number)
      select p_game_id, gp.display_name || ' (Ancien) encaisse l’attaque des Loups-Garous et s’accroche à la vie !', p_night
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = p_user_id;

      return;
    end if;
  end if;

  update public.game_players
  set is_alive = false, death_cause = p_cause, died_at_night = p_night, revealed_role = v_role
  where game_id = p_game_id and user_id = p_user_id and is_alive = true
  returning display_name, is_captain into v_name, v_was_captain;

  if v_name is null then
    return; -- déjà mort, rien à faire
  end if;

  insert into public.game_log (game_id, message, night_number)
  values (p_game_id, v_name || ' (' || public.role_display_name(v_role) || ') ' || public.death_phrase(p_cause), p_night);

  -- Pierre des Ancêtres (migration 0152/0153) / Larme de Renaissance
  -- (migration 0169) : retour utilisateur (migration 0172) — jusqu'ici,
  -- posséder l'un de ces deux artefacts déclenchait la résurrection
  -- automatiquement, sans qu'on demande au joueur s'il la voulait. Se
  -- contente désormais de repérer l'artefact éligible (Pierre en priorité,
  -- Larme sinon, jamais les deux) et de poser une VRAIE question
  -- (games.revival_pending / revival_pending_artifact_id) — la
  -- consommation réelle (pending_revival, quantity, game_artifact_uses)
  -- n'a lieu que dans submit_revival_choice, uniquement si le joueur
  -- répond oui. Exclu du bûcher/kick de l'hôte ('exclu' n'est de toute
  -- façon jamais une cause passée à kill_player).
  if p_cause <> 'exclu' then
    select pa.artifact_id into v_pierre_artifact_id
    from public.player_artifacts pa
    join public.store_artifacts sa on sa.id = pa.artifact_id
    where pa.user_id = p_user_id and sa.effect_key = 'pierre_ancetres' and pa.quantity > 0
      and not exists (
        select 1 from public.game_artifact_uses gau
        where gau.game_id = p_game_id and gau.user_id = p_user_id and gau.artifact_id = pa.artifact_id
      )
    limit 1;

    -- Larme de Renaissance réservée au camp village (retour utilisateur,
    -- migration 0176) : contrairement à la Pierre ci-dessus (qui conserve
    -- le rôle d'origine), la Larme renvoie TOUJOURS en simple Villageois —
    -- un Loup ressuscité ainsi se retrouverait à connaître les autres Loups
    -- tout en étant officiellement villageois, libre de les trahir sans
    -- aucune incohérence de camp. v_role est déjà celui d'AVANT la mort
    -- (lu en tout début de fonction), donc ce test capture bien "était-il
    -- loup au moment de mourir", peu importe qui l'a tué.
    if v_pierre_artifact_id is null and v_role <> all(array['loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve']) then
      select pa.artifact_id into v_larme_artifact_id
      from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user_id and sa.effect_key = 'larme_renaissance' and pa.quantity > 0
        and not exists (
          select 1 from public.game_artifact_uses gau
          where gau.game_id = p_game_id and gau.user_id = p_user_id and gau.artifact_id = pa.artifact_id
        )
      limit 1;
    end if;

    if coalesce(v_pierre_artifact_id, v_larme_artifact_id) is not null then
      update public.games
      set revival_pending = p_user_id,
          revival_pending_artifact_id = coalesce(v_pierre_artifact_id, v_larme_artifact_id)
      where id = p_game_id and revival_pending is null;
    end if;
  end if;

  if v_role = 'ancien' and p_cause = 'vote' then
    update public.games set village_powers_disabled = true where id = p_game_id;
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '⚖️ Le village a eu tort de lyncher l’Ancien : ses pouvoirs spéciaux s’éteignent pour le reste de la partie...', p_night);
  end if;

  -- Un Enfant Sauvage vivant avait choisi cette victime comme mentor : il
  -- rejoint immédiatement et définitivement les Loups-Garous. Une boucle
  -- plutôt qu'un simple `if` : rien n'empêche plusieurs Enfants Sauvages
  -- d'avoir choisi le même mentor. Toujours aucun message nommant le joueur
  -- ni révélant son ancien rôle (wild_child_turned_at_night reste la seule
  -- trace privée, voir get_my_game_view) — seul le fait qu'UNE conversion a
  -- eu lieu cette nuit est maintenant annoncé publiquement, une fois, après
  -- la boucle.
  for v_wild_child_id in
    select rs.user_id
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'enfant_sauvage'
      and rs.wild_child_mentor = p_user_id and gp.is_alive
  loop
    update public.game_roles_secret
    set role = 'loup_garou', wild_child_turned_at_night = p_night
    where game_id = p_game_id and user_id = v_wild_child_id;
    v_any_wild_child_converted := true;
  end loop;

  if v_any_wild_child_converted then
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '🌑 Une ombre a changé de camp cette nuit... un villageois a secrètement rejoint les Loups-Garous.', p_night);
  end if;

  select lover_with into v_lover_id from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;
  if v_lover_id is not null and exists (
    select 1 from public.game_players where game_id = p_game_id and user_id = v_lover_id and is_alive
  ) then
    perform public.kill_player(p_game_id, v_lover_id, 'chagrin', p_night);
  end if;

  if v_role = 'chasseur' then
    update public.games
    set hunter_pending = p_user_id,
        hunter_context = case when status = 'day_vote' then 'day' else 'night' end
    where id = p_game_id and hunter_pending is null and not village_powers_disabled;
  end if;

  if v_was_captain then
    update public.games set captain_pending = p_user_id where id = p_game_id and captain_pending is null;
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, v_name || ' était le Capitaine : il ou elle désigne son successeur dans son dernier souffle.', p_night);
  end if;
end;
$$;

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
  v_wolf_roles text[] := array['loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve'];
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

create or replace function public.apply_rank_updates_for_game(p_game_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; v_won boolean; v_forfeit boolean; v_code text; v_total_rounds int; v_ratio numeric;
  v_impact jsonb; v_impact_bonus int; v_impact_details jsonb; v_result jsonb;
begin
  -- Partie d'entraînement : ni points, ni résultat, ni statistique.
  if exists (select 1 from public.games where id = p_game_id and is_practice) then
    return;
  end if;

  select code, greatest(night_number, 1) into v_code, v_total_rounds from public.games where id = p_game_id;

  for r in
    select gp.user_id, (rs.lover_with is not null) as is_lover, gp.died_at_night, gp.death_cause, rs.role
    from public.game_players gp
    left join public.game_roles_secret rs
      on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    -- 'parti' = a quitté la partie, 'exclu' = retiré par l'hôte (cause posée
    -- par kill_player seulement si le joueur était vivant à ce moment-là).
    v_forfeit := coalesce(r.death_cause in ('parti', 'exclu'), false);

    v_won := case
      when v_forfeit then false
      when r.is_lover then (p_winner = 'amoureux')
      when r.role = 'cupidon' and p_winner = 'amoureux' then true
      when p_winner = 'loups' then coalesce(r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve'), false)
      when p_winner = 'village' then coalesce(r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve', 'anancy', 'chasseuse'), true)
      when p_winner = 'anancy' then coalesce(r.role = 'anancy', false)
      when p_winner = 'ange' then coalesce(r.role = 'ange', false)
      when p_winner = 'chasseuse' then coalesce(r.role = 'chasseuse', false)
      else false
    end;

    v_ratio := case
      when r.died_at_night is null then 1.0
      else least(greatest(r.died_at_night::numeric / v_total_rounds, 0.4), 0.9)
    end;

    if v_forfeit then
      v_impact_bonus := 0;
      v_impact_details := '[]'::jsonb;
    else
      v_impact := public.compute_impact_bonus(p_game_id, r.user_id, r.role);
      v_impact_bonus := coalesce((v_impact->>'bonus')::int, 0);
      v_impact_details := coalesce(v_impact->'details', '[]'::jsonb);
    end if;

    if p_winner = 'anancy' and v_won then
      v_impact_bonus := v_impact_bonus + 50;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'anancy_solo_win', 'points', 50);
    end if;

    if p_winner = 'loups' and v_won then
      v_impact_bonus := v_impact_bonus + 15;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'wolf_team_win', 'points', 15);
    end if;

    if p_winner = 'amoureux' and v_won and r.is_lover then
      v_impact_bonus := v_impact_bonus + 70;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'lovers_win', 'points', 70);
    end if;

    if p_winner = 'amoureux' and v_won and r.role = 'cupidon' then
      v_impact_bonus := v_impact_bonus + 30;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'cupidon_lovers_win', 'points', 30);
    end if;

    v_result := public.apply_rank_result(r.user_id, v_won, v_ratio, v_impact_bonus, v_forfeit);

    insert into public.game_results (
      game_id, user_id, code, role, is_lover, winner_team, won,
      points_gained, participation_ratio, impact_bonus, impact_details, new_rank_points, new_rank_tier,
      season_xp_gained
    )
    values (
      p_game_id, r.user_id, v_code, r.role, coalesce(r.is_lover, false), p_winner, v_won,
      (v_result->>'gain')::int, v_ratio, v_impact_bonus, v_impact_details,
      (v_result->>'new_points')::int, v_result->>'new_tier',
      coalesce((v_result->>'season_xp_gained')::int, 0)
    );
  end loop;
end;
$$;

create or replace function public.get_leaderboard(p_limit integer DEFAULT 20)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  with scores as (
    select
      gp.user_id,
      case
        when g.winner_team = 'amoureux' then (rs.lover_with is not null)
        when g.winner_team = 'loups' then rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve')
        when g.winner_team = 'village' then coalesce(rs.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve', 'anancy', 'chasseuse'), true)
        when g.winner_team = 'anancy' then coalesce(rs.role = 'anancy', false)
        when g.winner_team = 'ange' then coalesce(rs.role = 'ange', false)
        when g.winner_team = 'chasseuse' then coalesce(rs.role = 'chasseuse', false)
        else false
      end as won
    from public.game_players gp
    join public.games g on g.id = gp.game_id and g.status = 'ended'
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
  ),
  agg as (
    select
      user_id,
      count(*) as games_played,
      count(*) filter (where won) as games_won
    from scores
    group by user_id
    having count(*) >= 3
  ),
  ranked as (
    select
      p.id as user_id,
      p.username,
      p.avatar_icon,
      a.games_played,
      a.games_won,
      round(100.0 * a.games_won / a.games_played, 1) as win_rate
    from agg a
    join public.profiles p on p.id = a.user_id
    where not p.is_bot
    order by win_rate desc, a.games_played desc
    limit greatest(p_limit, 0)
  )
  select coalesce(jsonb_agg(row_to_json(ranked)), '[]'::jsonb) from ranked;
$$;

create or replace function public.ghost_bet_market(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_total int;
  v_n int;
  v_bots int;
  v_w int;
  v_x numeric;
  v_pw numeric;
  v_pv numeric;
  v_pl numeric;
  v_po constant numeric := 0.12;
  v_psurv numeric;
  v_open boolean := true;
  v_reason text := null;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('open', false, 'reason', 'game');
  end if;

  select count(*), count(*) filter (where is_alive) into v_total, v_n
  from public.game_players where game_id = p_game_id;
  select count(*) into v_bots
  from public.game_players gp join public.profiles p on p.id = gp.user_id
  where gp.game_id = p_game_id and p.is_bot;

  select count(*) into v_w
  from public.game_roles_secret r
  join public.game_players gp on gp.game_id = r.game_id and gp.user_id = r.user_id
  where r.game_id = p_game_id and gp.is_alive
    and r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve');

  v_x := v_w::numeric / greatest(v_n - v_w, 1);
  v_pw := case when v_x <= 0 then 0.04
               else power(v_x, 1.8) / (power(v_x, 1.8) + power(1.0 / 3.0, 1.8)) end;
  v_pw := least(0.96, greatest(0.04, v_pw));
  v_pl := (1 - v_po) * v_pw;
  v_pv := (1 - v_po) * (1 - v_pw);
  v_psurv := least(0.9, (2.5 + 0.12 * v_n) / greatest(v_n, 1));

  if v_game.status not in ('night', 'day_reveal', 'day_discussion', 'day_vote') then
    v_open := false; v_reason := 'status';
  elsif v_bots > 0 then
    v_open := false; v_reason := 'bots';
  elsif v_total - v_bots < 6 then
    v_open := false; v_reason := 'too_few';
  elsif v_n <= 3 or v_w = 0 or v_w * 2 >= v_n or greatest(v_pv, v_pl) > 0.8 then
    v_open := false; v_reason := 'decided';
  end if;

  return jsonb_build_object(
    'open', v_open,
    'reason', v_reason,
    'alive', v_n,
    'odds', jsonb_build_object(
      'village', round(greatest(1.1, least(8, 0.9 / v_pv))::numeric, 1),
      'loups', round(greatest(1.1, least(8, 0.9 / v_pl))::numeric, 1),
      'autre', round(greatest(1.1, least(8, 0.9 / v_po))::numeric, 1)
    ),
    'survivor_odds', round(greatest(1.2, least(12, 0.9 / v_psurv))::numeric, 1)
  );
end;
$$;

create or replace function public.compute_impact_bonus(p_game_id uuid, p_user_id uuid, p_role text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_bonus int := 0;
  v_details jsonb := '[]'::jsonb;
  v_heal_used boolean;
  v_poison_used boolean;
  v_poison_killed_wolf boolean;
  v_ancien_used boolean;
  v_hunter_killed_wolf boolean;
  v_seer_hits int;
  v_devoured int;
  v_total_rounds int;
  v_died_at int;
  v_survived int;
  v_alpha_infected boolean;
  v_gml_second_kill boolean;
  v_daron_saves int;
begin
  if p_role = 'sorciere' then
    select heal_potion_used, poison_potion_used into v_heal_used, v_poison_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if coalesce(v_heal_used, false) then
      v_bonus := v_bonus + 10;
      v_details := v_details || jsonb_build_object('kind', 'witch_heal', 'points', 10);
    end if;

    if coalesce(v_poison_used, false) then
      select exists (
        select 1 from public.game_players gp
        join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
        where gp.game_id = p_game_id and gp.death_cause = 'sorciere' and rs.role = 'loup_garou'
      ) into v_poison_killed_wolf;

      if v_poison_killed_wolf then
        v_bonus := v_bonus + 15;
        v_details := v_details || jsonb_build_object('kind', 'witch_poison_wolf', 'points', 15);
      end if;
    end if;
  end if;

  if p_role = 'daron' then
    select count(*) into v_daron_saves
    from public.game_log
    where game_id = p_game_id and kind = 'daron_save';

    if coalesce(v_daron_saves, 0) > 0 then
      v_bonus := v_bonus + v_daron_saves * 10;
      v_details := v_details || jsonb_build_object('kind', 'daron_save', 'points', v_daron_saves * 10, 'count', v_daron_saves);
    end if;
  end if;

  if p_role = 'chasseur' then
    select exists (
      select 1 from public.game_players gp
      join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
      where gp.game_id = p_game_id and gp.death_cause = 'chasseur' and rs.role = 'loup_garou'
    ) into v_hunter_killed_wolf;

    if v_hunter_killed_wolf then
      v_bonus := v_bonus + 15;
      v_details := v_details || jsonb_build_object('kind', 'hunter_shot_wolf', 'points', 15);
    end if;
  end if;

  if p_role = 'voyante' then
    select count(*) into v_seer_hits
    from public.night_actions na
    join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
    where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = p_user_id and rs.role = 'loup_garou';

    v_seer_hits := least(coalesce(v_seer_hits, 0), 2);
    if v_seer_hits > 0 then
      v_bonus := v_bonus + v_seer_hits * 5;
      v_details := v_details || jsonb_build_object('kind', 'seer_wolf_reveal', 'points', v_seer_hits * 5, 'count', v_seer_hits);
    end if;
  end if;

  if p_role = 'ancien' then
    select ancien_extra_life_used into v_ancien_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if coalesce(v_ancien_used, false) then
      v_bonus := v_bonus + 10;
      v_details := v_details || jsonb_build_object('kind', 'ancien_extra_life', 'points', 10);
    end if;
  end if;

  if p_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') then
    select count(*) into v_devoured
    from public.game_players where game_id = p_game_id and death_cause = 'loup_garou';

    if coalesce(v_devoured, 0) > 0 then
      v_bonus := v_bonus + v_devoured * 5;
      v_details := v_details || jsonb_build_object('kind', 'wolf_villagers_devoured', 'points', v_devoured * 5, 'count', v_devoured);
    end if;

    select greatest(night_number, 1) into v_total_rounds from public.games where id = p_game_id;
    select died_at_night into v_died_at from public.game_players where game_id = p_game_id and user_id = p_user_id;
    v_survived := coalesce(v_died_at, v_total_rounds);

    if v_survived > 0 then
      v_bonus := v_bonus + v_survived * 3;
      v_details := v_details || jsonb_build_object('kind', 'wolf_nights_survived', 'points', v_survived * 3, 'count', v_survived);
    end if;

    if p_role = 'loup_alpha' then
      select alpha_infect_used into v_alpha_infected
      from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

      if coalesce(v_alpha_infected, false) then
        v_bonus := v_bonus + 20;
        v_details := v_details || jsonb_build_object('kind', 'alpha_infected_villager', 'points', 20);
      end if;
    end if;

    if p_role = 'grand_mechant_loup' then
      select exists (
        select 1 from public.night_actions
        where game_id = p_game_id and step = 'grand_mechant_loup' and actor_id = p_user_id and target_id is not null
      ) into v_gml_second_kill;

      if coalesce(v_gml_second_kill, false) then
        v_bonus := v_bonus + 15;
        v_details := v_details || jsonb_build_object('kind', 'gml_second_kill', 'points', 15);
      end if;
    end if;
  end if;

  return jsonb_build_object('bonus', v_bonus, 'details', v_details);
end;
$$;

create or replace function public.game_view_vote_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text, p_my_alive boolean
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = p_game.night_number and voter_id = p_user
    ),

    'my_captain_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = 0 and voter_id = p_user
    ),

    'vote_call_agreed_ids', case when p_game.status = 'day_discussion' then coalesce((
      select jsonb_agg(user_id) from public.vote_call_agreements
      where game_id = p_game_id and day_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'day_reveal_ready_ids', case when p_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(user_id) from public.day_reveal_ready
      where game_id = p_game_id and round_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'night_recap', case when p_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message) order by created_at asc)
      from public.game_log
      where game_id = p_game_id and night_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'vote_recap', case when p_game.status = 'day_vote_recap' then jsonb_build_object(
      'votes', coalesce((
        select jsonb_agg(jsonb_build_object('voter_id', voter_id, 'target_id', target_id))
        from public.votes where game_id = p_game_id and round_number = p_game.night_number
      ), '[]'::jsonb),
      'ready_ids', coalesce((
        select jsonb_agg(user_id) from public.vote_recap_ready
        where game_id = p_game_id and round_number = p_game.night_number
      ), '[]'::jsonb),
      'captain_voter_id', p_game.last_vote_captain_id,
      'captain_random_notice', (
        select message from public.game_log
        where game_id = p_game_id and night_number = p_game.night_number and kind = 'captain_random'
        order by created_at desc limit 1
      ),
      'protected_by_feu_sacre', exists (
        select 1 from public.game_artifact_uses gau
        join public.store_artifacts sa on sa.id = gau.artifact_id
        where gau.game_id = p_game_id and sa.effect_key = 'feu_sacre_ancetres' and gau.round_number = p_game.night_number
      )
    ) else null end,

    -- 'chasseuse_choice' (migration 0162, colonnes/rôle renommés en 0163,
    -- corrigés ici) ajouté en tête, même priorité que hunter/
    -- captain_succession/balance_ange — tous vérifiés avant le reste.
    -- 'revival_choice' (migration 0172) ajouté juste après balance_ange,
    -- même famille de décision post-mort urgente que hunter/
    -- captain_succession (voir kill_player : posé APRÈS que la victime soit
    -- déjà marquée is_alive = false, donc affiché hors de toute condition
    -- `alive` côté client, comme ces deux-là).
    'pending_action_required', case
      when p_game.hunter_pending = p_user then 'hunter'
      when p_game.captain_pending = p_user then 'captain_succession'
      when p_game.balance_ange_pending = p_user then 'balance_ange'
      when p_game.revival_pending = p_user then 'revival_choice'
      when exists (
        select 1 from public.game_roles_secret
        where game_id = p_game_id and user_id = p_user and role = 'chasseuse' and chasseuse_pending_choice
      ) then 'chasseuse_choice'
      when p_game.status = 'captain_election' and p_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = 0 and voter_id = p_user
        )
      then 'captain_vote'
      when p_game.status = 'night' and p_my_alive
        and (p_my_role = p_game.night_step or (p_my_role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and p_game.night_step = 'loup_garou'))
        and not exists (
          select 1 from public.night_actions
          where game_id = p_game_id and night_number = p_game.night_number
            and step = p_game.night_step and actor_id = p_user
        )
      then p_game.night_step
      when p_game.status = 'day_vote' and p_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = p_game.night_number and voter_id = p_user
        )
      then 'vote'
      else null
    end,

    -- Nom de l'artefact en attente de décision (migration 0172) — jamais
    -- révélé à qui que ce soit d'autre, seulement quand c'est SOI qui doit
    -- répondre (même garde que pending_action_required ci-dessus).
    'my_revival_artifact_name_fr', case when p_game.revival_pending = p_user then (
      select name_fr from public.store_artifacts where id = p_game.revival_pending_artifact_id
    ) else null end,

    'my_revival_artifact_name_en', case when p_game.revival_pending = p_user then (
      select name_en from public.store_artifacts where id = p_game.revival_pending_artifact_id
    ) else null end,

    'final_reveal', case when p_game.status = 'ended' then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', rs.user_id, 'role', rs.role))
      from public.game_roles_secret rs where rs.game_id = p_game_id
    ), '[]'::jsonb) else null end
  );
$$;

create or replace function public.resolve_night_deaths(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_night int;
  v_final_victim uuid;
  v_wolf_mode text := 'eliminate';
  v_heal boolean;
  v_poison_target uuid;
  v_deaths_before int;
  v_deaths_after int;
  v_infected boolean := false;
  v_alpha_used boolean;
  v_alive_wolves int;
  v_agreed int;
  v_needed int;
  v_alpha_confirmed boolean;
  v_gml_victim uuid;
  v_daron_target uuid;
  v_daron_saved boolean := false;
begin
  select night_number into v_night from public.games where id = p_game_id;

  v_final_victim := public.get_wolf_target(p_game_id, v_night);

  if public.role_alive_exists(p_game_id, 'loup_alpha') then
    select alpha_infect_used into v_alpha_used
    from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha';

    if not coalesce(v_alpha_used, false) then
      select count(*) into v_alive_wolves
      from public.game_roles_secret rs
      join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and gp.is_alive;

      select count(*) into v_agreed
      from public.alpha_infect_agreements
      where game_id = p_game_id and night_number = v_night;

      v_needed := case when v_alive_wolves = 0 then 0 else v_alive_wolves / 2 + 1 end;

      select exists (
        select 1 from public.night_actions
        where game_id = p_game_id and night_number = v_night and step = 'loup_alpha_confirm'
          and (extra->>'confirmed')::boolean is true
      ) into v_alpha_confirmed;

      if v_agreed >= v_needed and v_alpha_confirmed then
        v_wolf_mode := 'infect';
      end if;
    end if;
  end if;

  select target_id into v_daron_target
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'daron'
  limit 1;

  select (extra->>'heal')::boolean, nullif(extra->>'poison_target','')::uuid
  into v_heal, v_poison_target
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'sorciere'
  limit 1;

  select count(*) into v_deaths_before from public.game_players where game_id = p_game_id and died_at_night = v_night;

  -- Protection du Daron contre l'attaque des Loups (mise à mort OU
  -- infection — les deux passent par v_final_victim).
  if v_daron_target is not null and v_daron_target = v_final_victim then
    v_daron_saved := true;
    v_final_victim := null;
  end if;

  if v_wolf_mode = 'eliminate' and v_heal is true and v_final_victim is not null then
    insert into public.game_log (game_id, message, night_number, kind, meta)
    values (
      p_game_id,
      '🧪 La Sorcière a utilisé sa potion de guérison pour sauver la victime des loups.',
      v_night,
      'witch_heal',
      jsonb_build_object('target_user_id', v_final_victim)
    );
    update public.game_roles_secret set heal_potion_used = true
    where game_id = p_game_id and role = 'sorciere';
    v_final_victim := null;
  end if;

  if v_final_victim is not null then
    if v_wolf_mode = 'infect' then
      perform public.infect_player(p_game_id, v_final_victim, v_night);
      v_infected := true;
    else
      perform public.kill_player(p_game_id, v_final_victim, 'loup_garou', v_night);
    end if;
  end if;

  -- Protection du Daron contre le poison de la Sorcière — indépendante de
  -- la protection contre les loups ci-dessus (une seule cible protégée par
  -- nuit peut couvrir l'une OU l'autre attaque, selon celle qui la vise).
  if v_poison_target is not null then
    if v_daron_target is not null and v_daron_target = v_poison_target then
      v_daron_saved := true;
    else
      perform public.kill_player(p_game_id, v_poison_target, 'sorciere', v_night);
    end if;
    update public.game_roles_secret set poison_potion_used = true
    where game_id = p_game_id and role = 'sorciere';
  end if;

  -- Seconde victime du Grand Méchant Loup : frappe garantie, jamais soumise
  -- à la potion de guérison de la Sorcière ni à la protection du Daron —
  -- déjà résolue ci-dessus, sans le moindre effet sur cette cible.
  select target_id into v_gml_victim
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'grand_mechant_loup'
  limit 1;

  if v_gml_victim is not null then
    perform public.kill_player(p_game_id, v_gml_victim, 'loup_garou', v_night);
  end if;

  if v_daron_saved then
    insert into public.game_log (game_id, message, night_number, kind)
    values (p_game_id, '🛡️ La protection du Daron a permis à un joueur de survivre cette nuit.', v_night, 'daron_save');
  end if;

  select count(*) into v_deaths_after from public.game_players where game_id = p_game_id and died_at_night = v_night;

  if v_deaths_after = v_deaths_before and not v_infected then
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '☀️ Le village se réveille : personne n’est mort cette nuit !', v_night);
  end if;

  update public.games set night_deaths_resolved = true where id = p_game_id;
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
  where rs.game_id = p_game_id and rs.role in ('loup_garou', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and gp.is_alive;

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

create or replace function public.submit_alpha_infect_agreement(p_game_id uuid, p_agree boolean DEFAULT true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_role text;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_garou' then
    raise exception 'Ce n''est pas le moment pour cette décision.';
  end if;
  if not public.role_alive_exists(p_game_id, 'loup_alpha') then
    raise exception 'Cette partie n''a pas de Loup Alpha.';
  end if;

  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  if v_role not in ('loup_garou', 'sans_visage', 'grand_mechant_loup', 'reine_louve') then
    raise exception 'Seuls les loups simples participent à cette décision.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  if p_agree then
    insert into public.alpha_infect_agreements (game_id, night_number, user_id)
    values (p_game_id, v_game.night_number, v_user)
    on conflict (game_id, night_number, user_id) do nothing;
  else
    delete from public.alpha_infect_agreements
    where game_id = p_game_id and night_number = v_game.night_number and user_id = v_user;
  end if;
end;
$$;

create or replace function public.submit_loup_alpha_confirm_infect(p_game_id uuid, p_confirm boolean DEFAULT true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive_wolves int;
  v_agreed int;
  v_needed int;
  v_used boolean;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_garou' then
    raise exception 'Ce n''est pas le moment pour cette décision.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'loup_alpha' then
    raise exception 'Vous n''êtes pas le Loup Alpha.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  select alpha_infect_used into v_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  if coalesce(v_used, false) then
    raise exception 'Vous avez déjà utilisé votre infection.';
  end if;

  if p_confirm then
    select count(*) into v_alive_wolves
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role in ('loup_garou', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and gp.is_alive;

    select count(*) into v_agreed
    from public.alpha_infect_agreements
    where game_id = p_game_id and night_number = v_game.night_number;

    v_needed := case when v_alive_wolves = 0 then 0 else v_alive_wolves / 2 + 1 end;
    if v_agreed < v_needed then
      raise exception 'La majorité des loups doit être d''accord avant que vous puissiez infecter.';
    end if;
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, extra)
  values (p_game_id, v_game.night_number, 'loup_alpha_confirm', v_user, jsonb_build_object('confirmed', p_confirm))
  on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;
end;
$$;

create or replace function public.submit_wolf_vote(p_game_id uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_target_role text;
  v_alive_wolves int;
  v_submitted int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_garou' then
    raise exception 'Ce n’est pas le moment pour les Loups-Garous.';
  end if;
  if public.my_role_in_game(p_game_id) not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') then
    raise exception 'Vous n’êtes pas un Loup.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  if p_target is not null then
    select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = p_target;
    if v_target_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') then
      raise exception 'Vous ne pouvez pas dévorer un autre Loup.';
    end if;
    if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
      raise exception 'Joueur invalide.';
    end if;
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'loup_garou', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  select count(*) into v_alive_wolves
  from public.game_roles_secret rs join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and gp.is_alive;

  select count(distinct actor_id) into v_submitted
  from public.night_actions
  where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_garou';

  if v_submitted >= v_alive_wolves then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$$;

create or replace function public.submit_grand_mechant_loup(p_game_id uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_target_role text;
  v_pack_target uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'grand_mechant_loup' then
    raise exception 'Ce n''est pas le moment pour cette décision.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'grand_mechant_loup' then
    raise exception 'Vous n''êtes pas le Grand Méchant Loup.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  if p_target is not null then
    if p_target = v_user then
      raise exception 'Vous ne pouvez pas vous choisir vous-même.';
    end if;
    select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = p_target;
    if v_target_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') then
      raise exception 'Vous ne pouvez pas dévorer un autre Loup.';
    end if;
    if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
      raise exception 'Joueur invalide.';
    end if;

    v_pack_target := public.get_wolf_target(p_game_id, v_game.night_number);
    if v_pack_target is not null and p_target = v_pack_target then
      raise exception 'Choisissez une victime différente de celle de la meute.';
    end if;
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'grand_mechant_loup', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  perform public.advance_phase(p_game_id, true);
end;
$$;

create or replace function public.sync_daily_quests_for_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := public.quest_today();
  v_game_status text;
  v_won boolean;
  v_alive boolean;
  v_role text;
  v_streak int;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select status into v_game_status from public.games where id = p_game_id;
  if v_game_status is distinct from 'ended' then
    raise exception 'Cette partie n''est pas encore terminée.';
  end if;

  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous n''avez pas participé à cette partie.';
  end if;

  -- Partie d'entraînement : elle ne fait avancer aucune quête.
  if exists (select 1 from public.games where id = p_game_id and is_practice) then
    return public.get_my_quests();
  end if;

  perform public.ensure_daily_quests(v_user, v_today);

  if exists (select 1 from public.quest_game_sync where user_id = v_user and game_id = p_game_id) then
    return public.get_my_quests();
  end if;
  insert into public.quest_game_sync (user_id, game_id) values (v_user, p_game_id);

  select won into v_won from public.game_results
    where game_id = p_game_id and user_id = v_user
    order by created_at desc limit 1;
  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  select current_streak into v_streak from public.profiles where id = v_user;

  update public.quest_progress qp
  set progress = case
      when qt.condition_key = 'win_streak_reached' then greatest(qp.progress, least(coalesce(v_streak, 0), qt.target))
      else least(qp.progress + 1, qt.target)
    end
  from public.quest_templates qt
  where qp.template_id = qt.id
    and qp.user_id = v_user and qp.quest_date = v_today and qp.claimed_at is null and qp.progress < qt.target
    and (
      qt.condition_key = 'games_played'
      or (qt.condition_key = 'games_won' and coalesce(v_won, false))
      or (qt.condition_key = 'survived' and coalesce(v_alive, false))
      or (qt.condition_key = 'won_as_wolf' and coalesce(v_won, false) and v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve'))
      or (qt.condition_key = 'won_as_village' and coalesce(v_won, false) and v_role is not null and v_role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve', 'anancy', 'ange'))
      or (qt.condition_key = 'played_as_role' and v_role = qt.condition_role)
      or (qt.condition_key = 'won_as_role' and coalesce(v_won, false) and v_role = qt.condition_role)
      or (qt.condition_key = 'win_streak_reached')
    );

  return public.get_my_quests();
end;
$$;

create or replace function public.sync_daily_quests_for_all_players(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today date := public.quest_today();
begin
  for r in
    select gp.user_id, gp.is_alive, rs.role, gr.won, p.current_streak
    from public.game_players gp
    join public.profiles p on p.id = gp.user_id and not p.is_bot
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    -- UNE seule ligne de résultat par joueur : la dernière manche. Une partie
    -- relancée dans le même salon garde une ligne game_results PAR manche ; sans
    -- ce filtre, la boucle traitait une manche au hasard (souvent une ancienne)
    -- et créditait ou non les quêtes de victoire d'après la mauvaise.
    left join lateral (
      select won from public.game_results
      where game_id = gp.game_id and user_id = gp.user_id
      order by created_at desc limit 1
    ) gr on true
    where gp.game_id = p_game_id
  loop
    perform public.ensure_daily_quests(r.user_id, v_today);

    if exists (select 1 from public.quest_game_sync where user_id = r.user_id and game_id = p_game_id) then
      continue;
    end if;
    insert into public.quest_game_sync (user_id, game_id) values (r.user_id, p_game_id);

    update public.quest_progress qp
    set progress = case
        when qt.condition_key = 'win_streak_reached' then greatest(qp.progress, least(coalesce(r.current_streak, 0), qt.target))
        else least(qp.progress + 1, qt.target)
      end
    from public.quest_templates qt
    where qp.template_id = qt.id
      and qp.user_id = r.user_id and qp.quest_date = v_today and qp.claimed_at is null and qp.progress < qt.target
      and (
        qt.condition_key = 'games_played'
        or (qt.condition_key = 'games_won' and coalesce(r.won, false))
        or (qt.condition_key = 'survived' and coalesce(r.is_alive, false))
        or (qt.condition_key = 'won_as_wolf' and coalesce(r.won, false) and r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve'))
        or (qt.condition_key = 'won_as_village' and coalesce(r.won, false) and r.role is not null and r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve', 'anancy', 'ange', 'chasseuse'))
        or (qt.condition_key = 'played_as_role' and r.role = qt.condition_role)
        or (qt.condition_key = 'won_as_role' and coalesce(r.won, false) and r.role = qt.condition_role)
        or (qt.condition_key = 'win_streak_reached')
      );
  end loop;
end;
$$;

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
        and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and v_game.night_step = 'loup_garou'))
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

create or replace function public._auto_play_bots_core(p_game_id uuid, p_skip_recaps boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_bot record;
  v_target uuid;
  v_target2 uuid;
  v_target_arr uuid[];
  v_my_role text;
  v_target_role text;
  v_wolf_target uuid;
  v_acted int;
  v_total_acted int := 0;
  v_iterations int := 0;
  v_ready_updated int;
  v_has_captain boolean;
  v_actor_id uuid;
  v_actor_is_bot boolean;
  v_alive_count int;
  v_agreed_count int;
  v_needed int;
  v_chasseuse_bot_id uuid;
  v_chasseuse_used boolean;
  v_chasseuse_new_target uuid;
  v_balance_artifact_id uuid;
begin
  loop
    v_iterations := v_iterations + 1;
    exit when v_iterations > 200; -- filet de sécurité, ne devrait jamais être atteint

    select * into v_game from public.games where id = p_game_id for update;
    if not found then raise exception 'Partie introuvable.'; end if;

    v_acted := 0;

    -- Chasseur en attente de tirer.
    if v_game.hunter_pending is not null then
      if not exists (select 1 from public.profiles where id = v_game.hunter_pending and is_bot) then
        exit; -- un vrai joueur doit tirer
      end if;

      select user_id into v_target from public.game_players
      where game_id = p_game_id and is_alive and user_id <> v_game.hunter_pending
      order by random() limit 1;

      if v_target is not null then
        perform public.kill_player(p_game_id, v_target, 'chasseur', v_game.night_number);
      else
        insert into public.game_log (game_id, message)
        select p_game_id, gp.display_name || ' (Chasseur) choisit de ne tirer sur personne.'
        from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_game.hunter_pending;
      end if;

      update public.games set hunter_pending = null, hunter_context = null where id = p_game_id;
      perform public.advance_phase(p_game_id, true);
      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- Capitaine mourant devant désigner un successeur.
    if v_game.captain_pending is not null then
      if not exists (select 1 from public.profiles where id = v_game.captain_pending and is_bot) then
        exit;
      end if;

      select user_id into v_target from public.game_players
      where game_id = p_game_id and is_alive and user_id <> v_game.captain_pending
      order by random() limit 1;

      if v_target is not null then
        update public.game_players set is_captain = false where game_id = p_game_id and user_id = v_game.captain_pending;
        update public.game_players set is_captain = true where game_id = p_game_id and user_id = v_target;
        insert into public.game_log (game_id, message)
        select p_game_id, '🎖️ ' || gp.display_name || ' devient le nouveau Capitaine.'
        from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_target;
      end if;

      update public.games set captain_pending = null where id = p_game_id;
      perform public.advance_phase(p_game_id, true);
      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- Résurrection en attente (Pierre des Ancêtres / Larme de Renaissance,
    -- migration 0172) : un bot accepte toujours (aucune interface pour lui
    -- poser la question, et aucune raison pour lui de refuser un artefact
    -- qu'il a "payé"). Écrit directement les tables plutôt que d'appeler
    -- submit_revival_choice, qui est gardée par auth.uid() = revival_pending
    -- — inutilisable ici puisque c'est l'admin, pas le bot, qui exécute
    -- cette fonction (même raison que hunter_pending/captain_pending
    -- ci-dessus, qui écrivent aussi directement plutôt que d'appeler leurs
    -- RPC respectives).
    if v_game.revival_pending is not null then
      if not exists (select 1 from public.profiles where id = v_game.revival_pending and is_bot) then
        exit;
      end if;

      update public.game_players set pending_revival = true
      where game_id = p_game_id and user_id = v_game.revival_pending;

      update public.player_artifacts set quantity = quantity - 1
      where user_id = v_game.revival_pending and artifact_id = v_game.revival_pending_artifact_id;

      insert into public.game_artifact_uses (game_id, user_id, artifact_id)
      values (p_game_id, v_game.revival_pending, v_game.revival_pending_artifact_id);

      update public.games set revival_pending = null, revival_pending_artifact_id = null where id = p_game_id;
      perform public.advance_phase(p_game_id, true);
      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- Balance de l'Ange en attente de départager un vote à égalité
    -- (migration 0152) : jusqu'ici totalement absente de cette fonction
    -- (bug corrigé, voir migration 0177) — si le propriétaire est un bot,
    -- la partie restait bloquée indéfiniment, même le délai de secours
    -- d'advance_phase ne se déclenchant jamais puisque cette boucle
    -- n'appelle plus advance_phase tant qu'elle ne trouve rien à faire. Un
    -- bot choisit une cible au hasard parmi les candidats à égalité (jamais
    -- lui-même, même règle que submit_balance_ange_vote). Écrit directement
    -- plutôt que d'appeler cette RPC, gardée par auth.uid() =
    -- balance_ange_pending — inutilisable ici (même raison que
    -- revival_pending ci-dessus).
    if v_game.balance_ange_pending is not null then
      if not exists (select 1 from public.profiles where id = v_game.balance_ange_pending and is_bot) then
        exit;
      end if;

      select t into v_target
      from unnest(v_game.balance_ange_candidates) as t
      where t <> v_game.balance_ange_pending
      order by random() limit 1;

      select pa.artifact_id into v_balance_artifact_id
      from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = v_game.balance_ange_pending and sa.effect_key = 'balance_ange'
        and not exists (
          select 1 from public.game_artifact_uses gau
          where gau.game_id = p_game_id and gau.user_id = v_game.balance_ange_pending and gau.artifact_id = pa.artifact_id
        )
      limit 1;

      if v_balance_artifact_id is not null then
        insert into public.game_artifact_uses (game_id, user_id, artifact_id)
        values (p_game_id, v_game.balance_ange_pending, v_balance_artifact_id);
      end if;

      update public.games set balance_ange_pending = null, balance_ange_candidates = null where id = p_game_id;

      if v_target is not null then
        perform public.kill_player(p_game_id, v_target, 'vote', v_game.night_number);
        insert into public.game_log (game_id, message)
        values (p_game_id, '⚖️ La Balance de l’Ange a départagé le vote.');
      end if;

      perform public.advance_phase(p_game_id, true);
      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- La Chasseuse en attente de sa décision abandonner/continuer (migration
    -- 0162) : un bot choisit toujours "continuer" (aucune interface
    -- possible pour lui poser la question) — même validation que
    -- submit_chasseuse_choice, reproduite ici à l'identique. Un état PAR JOUEUR
    -- sur game_roles_secret (pas un champ global sur games comme les deux
    -- pendings ci-dessus), d'où la jointure au lieu d'une simple colonne.
    select rs.user_id, rs.chasseuse_used_reassignment into v_chasseuse_bot_id, v_chasseuse_used
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    join public.profiles p on p.id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'chasseuse' and rs.chasseuse_pending_choice and gp.is_alive and p.is_bot
    limit 1;

    if v_chasseuse_bot_id is not null then
      if v_chasseuse_used then
        update public.game_roles_secret
        set role = 'villageois', chasseuse_target_id = null, chasseuse_pending_choice = false
        where game_id = p_game_id and user_id = v_chasseuse_bot_id;
      else
        select user_id into v_chasseuse_new_target
        from public.game_players
        where game_id = p_game_id and is_alive and user_id <> v_chasseuse_bot_id
        order by random() limit 1;

        update public.game_roles_secret
        set chasseuse_target_id = v_chasseuse_new_target, chasseuse_used_reassignment = true, chasseuse_pending_choice = false
        where game_id = p_game_id and user_id = v_chasseuse_bot_id;
      end if;

      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- Distribution des rôles : marque tous les bots "prêts" — jamais un
    -- vrai joueur, qui doit toujours cliquer lui-même.
    if v_game.status = 'role_reveal' then
      update public.game_players gp
      set is_ready = true
      from public.profiles p
      where gp.game_id = p_game_id and gp.user_id = p.id and p.is_bot and not gp.is_ready;
      get diagnostics v_ready_updated = row_count;

      if exists (
        select 1 from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and not p.is_bot and not gp.is_ready
      ) then
        exit; -- un vrai joueur n'a pas encore cliqué "prêt"
      end if;

      if not exists (select 1 from public.game_players where game_id = p_game_id and not is_ready) then
        perform public.advance_phase(p_game_id, true);
        v_total_acted := v_total_acted + greatest(v_ready_updated, 1);
        continue;
      end if;

      exit; -- rien à faire de plus ici
    end if;

    -- Élection du Capitaine.
    if v_game.status = 'captain_election' then
      if exists (
        select 1 from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and not p.is_bot
          and not exists (select 1 from public.votes where game_id = p_game_id and round_number = 0 and voter_id = gp.user_id)
      ) then
        exit; -- un vrai joueur vivant n'a pas encore voté
      end if;

      for v_bot in
        select gp.user_id from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and p.is_bot
          and not exists (select 1 from public.votes where game_id = p_game_id and round_number = 0 and voter_id = gp.user_id)
      loop
        select user_id into v_target from public.game_players
        where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
        order by random() limit 1;

        insert into public.votes (game_id, round_number, voter_id, target_id)
        values (p_game_id, 0, v_bot.user_id, v_target)
        on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;
        v_acted := v_acted + 1;
      end loop;

      if v_acted > 0 then
        perform public.advance_phase(p_game_id, true);
        v_total_acted := v_total_acted + v_acted;
        continue;
      end if;
      exit;
    end if;

    -- Débat : les bots n'ont pas d'action de jeu à proprement parler ici,
    -- mais peuvent se déclarer "d'accord" pour lancer le vote (voir
    -- commentaire d'en-tête) — c'est le seul moyen d'écourter cette phase
    -- avant l'expiration de son minuteur (300s par défaut, la plus longue
    -- de toute la partie).
    if v_game.status = 'day_discussion' then
      v_has_captain := coalesce((v_game.settings->'role_counts'->>'capitaine')::boolean, false);

      if v_has_captain then
        select user_id into v_actor_id from public.game_players
        where game_id = p_game_id and is_alive and is_captain limit 1;
      else
        v_actor_id := v_game.host_id;
      end if;

      if v_actor_id is null then
        exit; -- pas d'acteur identifiable (ex. succession de Capitaine pas encore résolue) : rien à faire ici
      end if;

      for v_bot in
        select gp.user_id from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and p.is_bot and gp.user_id <> v_actor_id
          and not exists (
            select 1 from public.vote_call_agreements
            where game_id = p_game_id and day_number = v_game.night_number and user_id = gp.user_id
          )
      loop
        insert into public.vote_call_agreements (game_id, day_number, user_id)
        values (p_game_id, v_game.night_number, v_bot.user_id)
        on conflict (game_id, day_number, user_id) do nothing;
        v_acted := v_acted + 1;
      end loop;

      if v_acted > 0 then
        v_total_acted := v_total_acted + v_acted;
      end if;

      -- Même formule que submit_captain_call_vote / submit_host_call_vote
      -- (migration 0086) : majorité des AUTRES joueurs vivants (l'acteur
      -- exclu des deux côtés du calcul).
      select count(*) into v_alive_count
      from public.game_players
      where game_id = p_game_id and is_alive and user_id <> v_actor_id;
      select count(*) into v_agreed_count
      from public.vote_call_agreements
      where game_id = p_game_id and day_number = v_game.night_number;
      v_needed := case when v_alive_count = 0 then 0 else v_alive_count / 2 + 1 end;

      if v_agreed_count < v_needed then
        exit; -- majorité pas encore atteinte (ou un humain doit encore répondre)
      end if;

      select is_bot into v_actor_is_bot from public.profiles where id = v_actor_id;
      if not coalesce(v_actor_is_bot, false) then
        exit; -- l'acteur (Capitaine ou hôte) est un vrai joueur : à lui de cliquer "Lancer le vote"
      end if;

      -- L'acteur est un bot (Capitaine élu au hasard parmi les bots) : lance
      -- le vote lui-même, même message de journal que submit_captain_call_vote.
      insert into public.game_log (game_id, message)
      select p_game_id, '🎖️ ' || gp.display_name || ' (Capitaine) lance le vote, avec l’accord de la majorité du village !'
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_actor_id;

      perform public.advance_phase(p_game_id, true);
      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- Vote du village.
    if v_game.status = 'day_vote' then
      if exists (
        select 1 from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and not p.is_bot
          and not exists (select 1 from public.votes where game_id = p_game_id and round_number = v_game.night_number and voter_id = gp.user_id)
      ) then
        exit;
      end if;

      for v_bot in
        select gp.user_id from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and p.is_bot
          and not exists (select 1 from public.votes where game_id = p_game_id and round_number = v_game.night_number and voter_id = gp.user_id)
      loop
        select user_id into v_target from public.game_players
        where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
        order by random() limit 1;

        -- Entraînement : les villageois font confiance au joueur et votent comme lui (la partie
        -- reste courte et son choix compte vraiment).
        if v_game.is_practice then
          v_target2 := null;
          select v.target_id into v_target2
          from public.votes v
          join public.profiles hp on hp.id = v.voter_id
          where v.game_id = p_game_id and v.round_number = v_game.night_number and not hp.is_bot
          limit 1;
          if v_target2 is not null and v_target2 <> v_bot.user_id then
            v_target := v_target2;
          end if;
        end if;

        insert into public.votes (game_id, round_number, voter_id, target_id)
        values (p_game_id, v_game.night_number, v_bot.user_id, v_target)
        on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;
        v_acted := v_acted + 1;
      end loop;

      if v_acted > 0 then
        perform public.advance_phase(p_game_id, true);
        v_total_acted := v_total_acted + v_acted;
        continue;
      end if;
      exit;
    end if;

    -- Nuit : une seule étape active à la fois.
    if v_game.status = 'night' then
      if v_game.night_step = 'resolve' then
        -- advance_phase se recharge déjà lui-même jusqu'à 'day_reveal'
        -- quand la dernière étape de nuit se termine (v_next_step is null) —
        -- ce cas ne devrait jamais être observé ici, filet de sécurité.
        exit;
      end if;

      if exists (
        select 1 from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and not p.is_bot
          and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and v_game.night_step = 'loup_garou'))
          and not exists (
            select 1 from public.night_actions
            where game_id = p_game_id and night_number = v_game.night_number
              and step = v_game.night_step and actor_id = gp.user_id
          )
      ) then
        exit; -- un vrai joueur vivant doit encore agir cette étape
      end if;

      for v_bot in
        select gp.user_id, rs.role
        from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and p.is_bot
          and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and v_game.night_step = 'loup_garou'))
          and not exists (
            select 1 from public.night_actions
            where game_id = p_game_id and night_number = v_game.night_number
              and step = v_game.night_step and actor_id = gp.user_id
          )
      loop
        if v_game.night_step = 'voleur' then
          select user_id into v_target from public.game_players
          where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
          order by random() limit 1;

          if v_target is not null then
            select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_bot.user_id;
            select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = v_target;

            update public.game_roles_secret set role = v_target_role where game_id = p_game_id and user_id = v_bot.user_id;
            update public.game_roles_secret set role = v_my_role where game_id = p_game_id and user_id = v_target;

            insert into public.game_log (game_id, message, night_number, kind, meta)
            values (
              p_game_id, '🃏 Le Voleur a fait son choix en secret.', v_game.night_number, 'thief_swap',
              jsonb_build_object('victim_id', v_target, 'new_role', v_my_role, 'actor_id', v_bot.user_id, 'actor_new_role', v_target_role)
            );
          else
            insert into public.game_log (game_id, message, night_number)
            values (p_game_id, '🃏 Le Voleur a fait son choix en secret.', v_game.night_number);
          end if;

          insert into public.night_actions (game_id, night_number, step, actor_id, extra)
          values (p_game_id, v_game.night_number, 'voleur', v_bot.user_id, jsonb_build_object('target_id', v_target))
          on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

        elsif v_game.night_step = 'cupidon' then
          select array_agg(user_id) into v_target_arr from (
            select user_id from public.game_players
            where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
            order by random() limit 2
          ) t;

          if coalesce(array_length(v_target_arr, 1), 0) = 2 then
            update public.game_roles_secret set lover_with = null where game_id = p_game_id;

            update public.game_roles_secret set lover_with = v_target_arr[2] where game_id = p_game_id and user_id = v_target_arr[1];
            update public.game_roles_secret set lover_with = v_target_arr[1] where game_id = p_game_id and user_id = v_target_arr[2];

            insert into public.game_log (game_id, message) values (p_game_id, '💘 Cupidon a décoché ses flèches...');

            insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
            values (p_game_id, v_game.night_number, 'cupidon', v_bot.user_id, v_target_arr[1], jsonb_build_object('lover2', v_target_arr[2]))
            on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id, extra = excluded.extra;
          end if;

        elsif v_game.night_step = 'enfant_sauvage' then
          select user_id into v_target from public.game_players
          where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
          order by random() limit 1;

          if v_target is not null then
            update public.game_roles_secret set wild_child_mentor = v_target
            where game_id = p_game_id and user_id = v_bot.user_id;

            insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
            values (p_game_id, v_game.night_number, 'enfant_sauvage', v_bot.user_id, v_target)
            on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

            insert into public.game_log (game_id, message) values (p_game_id, '🐾 L''Enfant Sauvage a choisi son mentor en secret.');
          end if;

        elsif v_game.night_step in ('voyante', 'griot') then
          select user_id into v_target from public.game_players
          where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
          order by random() limit 1;

          if v_target is not null then
            insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
            values (p_game_id, v_game.night_number, v_game.night_step, v_bot.user_id, v_target)
            on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

            if v_game.night_step = 'voyante' then
              insert into public.game_log (game_id, message) values (p_game_id, '🔮 La Voyante a sondé un joueur en secret.');
            end if;
          end if;

        elsif v_game.night_step = 'loup_garou' then
          select gp.user_id into v_target
          from public.game_players gp
          join public.game_roles_secret rs2 on rs2.game_id = gp.game_id and rs2.user_id = gp.user_id
          where gp.game_id = p_game_id and gp.is_alive
            and rs2.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve')
            -- Entraînement : le joueur survit à la première nuit pour pouvoir jouer le débat.
            and not (v_game.is_practice and v_game.night_number <= 1 and exists (select 1 from public.profiles hp where hp.id = gp.user_id and not hp.is_bot))
          order by random() limit 1;

          insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
          values (p_game_id, v_game.night_number, 'loup_garou', v_bot.user_id, v_target)
          on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

        elsif v_game.night_step = 'grand_mechant_loup' then
          v_target := null;
          if random() < 0.6 then
            v_wolf_target := public.get_wolf_target(p_game_id, v_game.night_number);
            select gp.user_id into v_target
            from public.game_players gp
            join public.game_roles_secret rs2 on rs2.game_id = gp.game_id and rs2.user_id = gp.user_id
            where gp.game_id = p_game_id and gp.is_alive
              and rs2.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve')
              and (v_wolf_target is null or gp.user_id <> v_wolf_target)
            order by random() limit 1;
          end if;

          insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
          values (p_game_id, v_game.night_number, 'grand_mechant_loup', v_bot.user_id, v_target)
          on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

        elsif v_game.night_step = 'sorciere' then
          insert into public.night_actions (game_id, night_number, step, actor_id, extra)
          values (p_game_id, v_game.night_number, 'sorciere', v_bot.user_id, jsonb_build_object('heal', false, 'poison_target', null))
          on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

          insert into public.game_log (game_id, message) values (p_game_id, '🧪 La Sorcière a fait son choix en secret.');

        elsif v_game.night_step = 'anancy' then
          v_target := null;
          v_target2 := null;
          if random() < 0.5 then
            select array_agg(user_id) into v_target_arr from (
              select gp.user_id from public.game_players gp
              where gp.game_id = p_game_id and gp.is_alive and gp.user_id <> v_bot.user_id
                and not exists (
                  select 1 from public.anancy_swapped_players asp
                  where asp.game_id = p_game_id and asp.user_id = gp.user_id
                )
              order by random() limit 2
            ) t;

            if coalesce(array_length(v_target_arr, 1), 0) = 2 then
              v_target := v_target_arr[1];
              v_target2 := v_target_arr[2];
              insert into public.anancy_swapped_players (game_id, user_id, swapped_at_night)
              values (p_game_id, v_target, v_game.night_number + 1), (p_game_id, v_target2, v_game.night_number + 1);
            end if;
          end if;

          insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
          values (p_game_id, v_game.night_number, 'anancy', v_bot.user_id, v_target, jsonb_build_object('target2', v_target2))
          on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id, extra = excluded.extra;
        end if;

        v_acted := v_acted + 1;
      end loop;

      if v_acted > 0 then
        perform public.advance_phase(p_game_id, true);
        v_total_acted := v_total_acted + v_acted;
        continue;
      end if;
      exit;
    end if;

    -- Écrans de récap (day_reveal, day_vote_recap) : rien à "jouer", mais
    -- on les traverse directement en mode rapide plutôt que d'attendre leur
    -- minuteur — c'est précisément ce qui rendait le test solo lent
    -- (retour utilisateur). Le journal (game_log) reste consultable après
    -- coup pour revoir ce qui s'est passé.
    if p_skip_recaps and v_game.status in ('day_reveal', 'day_vote_recap') then
      perform public.advance_phase(p_game_id, true);
      continue;
    end if;

    -- status non géré ici (lobby, ended...) : rien de plus à faire.
    exit;
  end loop;

  return jsonb_build_object('acted', v_total_acted);
end;
$$;

create or replace function public.next_night_step(p_game_id uuid, p_night_number integer, p_current text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sequence text[];
  v_found_current boolean := (p_current is null);
  v_step text;
  v_powers_disabled boolean;
  v_wolf_death_occurred boolean;
begin
  select village_powers_disabled into v_powers_disabled from public.games where id = p_game_id;

  if p_night_number <= 1 then
    v_sequence := array['daron','voleur','cupidon','enfant_sauvage','reine_louve','voyante','loup_garou','grand_mechant_loup','sorciere','anancy'];
  else
    v_sequence := array['daron','reine_louve','voyante','griot','loup_garou','grand_mechant_loup','sorciere','anancy'];
  end if;

  foreach v_step in array v_sequence loop
    if not v_found_current then
      if v_step = p_current then
        v_found_current := true;
      end if;
      continue;
    end if;

    if v_step in ('voyante','sorciere','griot','daron','reine_louve') and coalesce(v_powers_disabled, false) then
      continue;
    end if;

    if v_step = 'sorciere' and not exists (
      select 1
      from public.game_roles_secret rs
      join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
      where rs.game_id = p_game_id and rs.role = 'sorciere' and gp.is_alive
        and (not coalesce(rs.heal_potion_used, false) or not coalesce(rs.poison_potion_used, false))
    ) then
      continue;
    end if;

    -- Le pouvoir de seconde victime du Grand Méchant Loup disparaît pour de
    -- bon dès qu'un loup (n'importe lequel, lui compris) est mort — vérifié
    -- ici plutôt que stocké, puisque l'état déjà présent (game_players +
    -- game_roles_secret) suffit à répondre à la question à tout moment.
    if v_step = 'grand_mechant_loup' then
      select exists (
        select 1
        from public.game_roles_secret rs
        join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
        where rs.game_id = p_game_id
          and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve')
          and not gp.is_alive
      ) into v_wolf_death_occurred;

      if v_wolf_death_occurred then
        continue;
      end if;
    end if;

    -- 'loup_garou' est le vote commun à TOUT le camp des Loups (voir
    -- submit_wolf_vote) — présent tant qu'AU MOINS UN des 4 rôles du camp
    -- est vivant, pas seulement le loup "de base" (voir commentaire
    -- d'en-tête de cette migration).
    if v_step = 'loup_garou' then
      if exists (
        select 1
        from public.game_roles_secret rs
        join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
        where rs.game_id = p_game_id
          and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve')
          and gp.is_alive
      ) then
        return 'loup_garou';
      end if;
      continue;
    end if;

    -- Reine Louve (migration 0242) : elle agit AVANT la Voyante, tant qu'elle est vivante et qu'il reste un loup
    -- qu'elle n'a pas encore couvert. Étape ignorée si aucune Voyante n'existe dans cette partie (la composition des
    -- rôles est publique : rien n'est révélé) ; si la Voyante est seulement morte, l'étape continue de jouer pour ne
    -- rien laisser deviner.
    if v_step = 'reine_louve' then
      if public.role_alive_exists(p_game_id, 'reine_louve')
         and exists (select 1 from public.game_roles_secret where game_id = p_game_id and role = 'voyante')
         and coalesce(array_length(public.reine_louve_eligible_ids(p_game_id), 1), 0) > 0 then
        return 'reine_louve';
      end if;
      continue;
    end if;

    if public.role_alive_exists(p_game_id, v_step) then
      return v_step;
    end if;
  end loop;

  return null;
end;
$function$;

create or replace function public.game_view_seer_griot_fields(
  p_game_id uuid, p_user uuid, p_my_role text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'seer_reveals', case when p_my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'role', case
          when exists (
            select 1 from public.player_artifacts pa
            join public.store_artifacts sa on sa.id = pa.artifact_id
            where pa.user_id = na.target_id and sa.effect_key = 'masque_sans_visage'
          ) then 'villageois'
          -- Manteau de la Meute (Reine Louve, migration 0242) : un loup couvert CETTE nuit-là apparaît comme villageois.
          when exists (
            select 1 from public.night_actions q
            where q.game_id = na.game_id and q.step = 'reine_louve'
              and q.night_number = na.night_number and q.target_id = na.target_id
          ) then 'villageois'
          when rs.role in ('loup_garou', 'loup_alpha', 'grand_mechant_loup', 'reine_louve') then 'loup_garou'
          else 'villageois'
        end,
        'night_number', na.night_number
      ) order by na.night_number)
      from public.night_actions na
      join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
      where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = p_user
    ), '[]'::jsonb) else null end,

    'griot_reveals', case when p_my_role = 'griot' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'night_number', na.night_number,
        'kind', public.compute_griot_phrase(p_game_id, na.target_id, na.night_number - 1)
      ) order by na.night_number)
      from public.night_actions na
      where na.game_id = p_game_id and na.step = 'griot' and na.actor_id = p_user
    ), '[]'::jsonb) else null end
  );
$$;

create or replace function public.game_view_wolf_pack_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'alpha_infected_me', case when p_game.status = 'day_reveal' then exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = p_user and infected_at_night = p_game.night_number
    ) else false end,

    'alpha_infection_occurred', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and role = 'loup_alpha' and alpha_infect_used = true
    ),

    'alpha_infect_used', case when p_my_role = 'loup_alpha' then (
      select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and user_id = p_user
    ) else null end,

    'alpha_infect_available', p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve')
      and p_game.status = 'night' and p_game.night_step = 'loup_garou'
      and public.role_alive_exists(p_game_id, 'loup_alpha')
      and not coalesce((
        select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha'
      ), false),

    'alpha_infect_agreed_ids', case
      when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and p_game.status = 'night' and p_game.night_step = 'loup_garou'
      then coalesce((
        select jsonb_agg(user_id) from public.alpha_infect_agreements
        where game_id = p_game_id and night_number = p_game.night_number
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,

    'alpha_infect_confirmed', case
      when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and p_game.status = 'night' and p_game.night_step = 'loup_garou'
      then exists (
        select 1 from public.night_actions
        where game_id = p_game_id and night_number = p_game.night_number and step = 'loup_alpha_confirm'
          and (extra->>'confirmed')::boolean is true
      )
      else false
    end,

    -- Reine Louve (migration 0242) : loups encore couvrables pendant son tour, historique des loups déjà couverts,
    -- et, au lever du jour, si son manteau a trompé la Voyante cette nuit (jamais visible par un autre joueur).
    'queen_eligible_ids', case
      when p_my_role = 'reine_louve' and p_game.status = 'night' and p_game.night_step = 'reine_louve'
      then to_jsonb(public.reine_louve_eligible_ids(p_game_id))
      else null
    end,

    'queen_protected_ids', case when p_my_role = 'reine_louve' then coalesce((
      select jsonb_agg(na.target_id)
      from public.night_actions na
      where na.game_id = p_game_id and na.step = 'reine_louve' and na.target_id is not null
    ), '[]'::jsonb) else null end,

    'queen_shield_worked', case
      when p_my_role = 'reine_louve' and p_game.status = 'day_reveal' then exists (
        select 1
        from public.night_actions q
        join public.night_actions v on v.game_id = q.game_id and v.night_number = q.night_number
          and v.step = 'voyante' and v.target_id = q.target_id
        where q.game_id = p_game_id and q.step = 'reine_louve' and q.actor_id = p_user
          and q.night_number = p_game.night_number and q.target_id is not null
      )
      else false
    end,

    'wolf_teammates', case when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and rs.user_id <> p_user
    ), '[]'::jsonb) else null end,

    'wolf_alpha_id', case when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') then (
      select rs.user_id from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'loup_alpha'
      limit 1
    ) else null end,

    'wolf_current_votes', case when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and p_game.status = 'night' and p_game.night_step = 'loup_garou' then coalesce((
      select jsonb_agg(jsonb_build_object('actor_id', actor_id, 'target_id', target_id))
      from public.night_actions
      where game_id = p_game_id and night_number = p_game.night_number and step = 'loup_garou'
    ), '[]'::jsonb) else null end,

    'wolf_night_recap', case
      when p_my_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve') and p_game.status = 'day_reveal' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'actor_id', na.actor_id,
          'actor_name', gp.display_name,
          'is_alpha', rs.role = 'loup_alpha',
          'target_id', na.target_id,
          'target_name', tgp.display_name,
          'chose_infect', exists (
            select 1 from public.alpha_infect_agreements aia
            where aia.game_id = p_game_id and aia.night_number = p_game.night_number and aia.user_id = na.actor_id
          )
        ) order by (rs.role = 'loup_alpha') desc, gp.display_name)
        from public.night_actions na
        join public.game_players gp on gp.game_id = na.game_id and gp.user_id = na.actor_id
        join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.actor_id
        left join public.game_players tgp on tgp.game_id = na.game_id and tgp.user_id = na.target_id
        where na.game_id = p_game_id and na.night_number = p_game.night_number and na.step = 'loup_garou'
      ), '[]'::jsonb)
      else null
    end
  );
$$;

create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_players uuid[];
  v_count int;
  v_role_counts jsonb;
  v_roles text[] := array[]::text[];
  v_shuffled text[];
  v_special_total int;
  v_seconds int;
  v_last_roles text[];
  v_last_streaks int[];
  v_attempt int;
  v_ok boolean;
  v_has_alpha boolean;
  v_has_sans_visage boolean;
  v_has_gml boolean;
  v_has_queen boolean;
  v_disabled_roles text[];
  v_bad_role text;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l''hôte peut démarrer la partie.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  select array_agg(user_id order by seat_number) into v_players
  from public.game_players where game_id = p_game_id;

  v_count := coalesce(array_length(v_players, 1), 0);
  if v_count < 4 then raise exception 'Il faut au moins 4 joueurs pour commencer.'; end if;
  if v_count > 25 then raise exception 'Une partie ne peut pas dépasser 25 joueurs.'; end if;

  -- Mode auto (voir Lobby.tsx) : recalcule TOUJOURS selon l'effectif présent
  -- à cet instant précis, même si un role_counts manuel traîne encore en
  -- mémoire d'un réglage antérieur à l'activation du mode auto — c'est ce
  -- qui garantit que la composition annoncée par preview_auto_role_counts
  -- juste avant de cliquer "Lancer" est bien celle réellement distribuée.
  if coalesce((v_game.settings->>'auto_role_counts')::boolean, false) then
    v_role_counts := public.compute_default_role_counts(v_count);
  else
    v_role_counts := v_game.settings -> 'role_counts';
    if v_role_counts is null or v_role_counts = 'null'::jsonb then
      v_role_counts := public.compute_default_role_counts(v_count);
    end if;
  end if;

  select coalesce(array_agg(role), array[]::text[]) into v_disabled_roles
  from public.role_config where not is_enabled;

  foreach v_bad_role in array v_disabled_roles loop
    if coalesce((v_role_counts->>v_bad_role)::boolean, false) then
      raise exception 'Le rôle % a été désactivé par un administrateur.', v_bad_role;
    end if;
  end loop;

  v_has_alpha := coalesce((v_role_counts->>'loup_alpha')::boolean, false);
  v_has_sans_visage := coalesce((v_role_counts->>'sans_visage')::boolean, false);
  v_has_gml := coalesce((v_role_counts->>'grand_mechant_loup')::boolean, false);
  v_has_queen := coalesce((v_role_counts->>'reine_louve')::boolean, false);

  v_special_total := (v_role_counts->>'loup_garou')::int
    + coalesce((v_role_counts->>'loup_alpha')::boolean::int, 0)
    + (v_role_counts->>'voyante')::boolean::int
    + (v_role_counts->>'sorciere')::boolean::int
    + (v_role_counts->>'chasseur')::boolean::int
    + (v_role_counts->>'petite_fille')::boolean::int
    + (v_role_counts->>'cupidon')::boolean::int
    + coalesce((v_role_counts->>'ancien')::boolean::int, 0)
    + coalesce((v_role_counts->>'voleur')::boolean::int, 0)
    + coalesce((v_role_counts->>'enfant_sauvage')::boolean::int, 0)
    + coalesce((v_role_counts->>'griot')::boolean::int, 0)
    + coalesce((v_role_counts->>'sans_visage')::boolean::int, 0)
    + coalesce((v_role_counts->>'anancy')::boolean::int, 0)
    + coalesce((v_role_counts->>'ange')::boolean::int, 0)
    + coalesce((v_role_counts->>'grand_mechant_loup')::boolean::int, 0)
    + coalesce((v_role_counts->>'daron')::boolean::int, 0)
    + coalesce((v_role_counts->>'chasseuse')::boolean::int, 0)
    + coalesce((v_role_counts->>'reine_louve')::boolean::int, 0);

  if (v_role_counts->>'loup_garou')::int < 1 and not v_has_alpha and not v_has_sans_visage and not v_has_gml and not v_has_queen then
    raise exception 'Il faut au moins un Loup-Garou.';
  end if;
  if v_special_total > v_count then
    raise exception 'La configuration des rôles dépasse le nombre de joueurs.';
  end if;

  for i in 1..(v_role_counts->>'loup_garou')::int loop
    v_roles := v_roles || 'loup_garou'::text;
  end loop;
  if v_has_alpha then v_roles := v_roles || 'loup_alpha'::text; end if;
  if v_has_sans_visage then v_roles := v_roles || 'sans_visage'::text; end if;
  if v_has_gml then v_roles := v_roles || 'grand_mechant_loup'::text; end if;
  if v_has_queen then v_roles := v_roles || 'reine_louve'::text; end if;
  if (v_role_counts->>'voyante')::boolean then v_roles := v_roles || 'voyante'::text; end if;
  if (v_role_counts->>'sorciere')::boolean then v_roles := v_roles || 'sorciere'::text; end if;
  if (v_role_counts->>'chasseur')::boolean then v_roles := v_roles || 'chasseur'::text; end if;
  if (v_role_counts->>'petite_fille')::boolean then v_roles := v_roles || 'petite_fille'::text; end if;
  if (v_role_counts->>'cupidon')::boolean then v_roles := v_roles || 'cupidon'::text; end if;
  if coalesce((v_role_counts->>'ancien')::boolean, false) then v_roles := v_roles || 'ancien'::text; end if;
  if coalesce((v_role_counts->>'enfant_sauvage')::boolean, false) then v_roles := v_roles || 'enfant_sauvage'::text; end if;
  if coalesce((v_role_counts->>'voleur')::boolean, false) then
    v_roles := v_roles || 'voleur'::text;
  end if;
  if coalesce((v_role_counts->>'griot')::boolean, false) then
    v_roles := v_roles || 'griot'::text;
  end if;
  if coalesce((v_role_counts->>'anancy')::boolean, false) then
    v_roles := v_roles || 'anancy'::text;
  end if;
  if coalesce((v_role_counts->>'ange')::boolean, false) then
    v_roles := v_roles || 'ange'::text;
  end if;
  if coalesce((v_role_counts->>'daron')::boolean, false) then
    v_roles := v_roles || 'daron'::text;
  end if;
  if coalesce((v_role_counts->>'chasseuse')::boolean, false) then
    v_roles := v_roles || 'chasseuse'::text;
  end if;

  while coalesce(array_length(v_roles, 1), 0) < v_count loop
    v_roles := v_roles || 'villageois'::text;
  end loop;

  select array_agg(coalesce(p.last_role, '') order by t.ord), array_agg(coalesce(p.role_streak, 0) order by t.ord)
  into v_last_roles, v_last_streaks
  from unnest(v_players) with ordinality as t(user_id, ord)
  join public.profiles p on p.id = t.user_id;

  for v_attempt in 1..200 loop
    select array_agg(r order by random()) into v_shuffled from unnest(v_roles) r;

    v_ok := true;
    for i in 1..v_count loop
      if v_shuffled[i] = v_last_roles[i] and v_last_streaks[i] >= 2 then
        v_ok := false;
        exit;
      end if;
    end loop;

    exit when v_ok;
  end loop;

  for i in 1..v_count loop
    insert into public.game_roles_secret (game_id, user_id, role)
    values (p_game_id, v_players[i], v_shuffled[i]);

    update public.profiles
    set role_streak = case when last_role = v_shuffled[i] then role_streak + 1 else 1 end,
        last_role = v_shuffled[i]
    where id = v_players[i];
  end loop;

  select coalesce((v_game.settings->>'role_reveal_intro_seconds')::int, 60) into v_seconds;

  update public.game_players set is_ready = false where game_id = p_game_id;

  update public.games
  set status = 'role_reveal',
      night_number = 0,
      night_step = null,
      phase_deadline = now() + make_interval(secs => v_seconds),
      settings = jsonb_set(settings, '{role_counts}', v_role_counts),
      thief_extra_roles = null,
      village_powers_disabled = false,
      captain_pending = null
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🎭 Les rôles ont été distribués en secret. Regardez votre carte...');
end;
$$;

create or replace function public.compute_default_role_counts(p_player_count integer)
returns jsonb
language plpgsql
as $$
declare
  v_disabled text[];
  v_wolves int;
  -- null | 'loup_alpha' | 'sans_visage' | 'grand_mechant_loup' | 'reine_louve'
  v_wolf_variant text;
  v_wolf_variant_choices text[];
  v_voyante boolean;
  v_sorciere boolean;
  v_petite_fille boolean;
  v_ancien boolean;
  v_voleur boolean;
  v_enfant_sauvage boolean;
  v_chasseur boolean;
  v_cupidon boolean;
  v_griot boolean;
  v_anancy boolean;
  v_ange boolean;
  v_daron boolean;
  v_chasseuse boolean;
  v_special_total int;
begin
  select coalesce(array_agg(role), array[]::text[]) into v_disabled
  from public.role_config where not is_enabled;

  v_wolves := greatest(1, round(p_player_count * 0.25));
  if v_wolves >= p_player_count then
    v_wolves := greatest(1, p_player_count / 2);
  end if;

  -- Variante de meute : même seuil que celui déjà imposé au Loup Alpha
  -- ailleurs dans le moteur (start_game exige ≥10 joueurs pour lui) —
  -- appliqué identiquement aux trois variantes. Une seule à la fois, et
  -- uniquement parmi celles non désactivées.
  v_wolf_variant := null;
  if p_player_count >= 10 and random() < 0.35 then
    select array_agg(v) into v_wolf_variant_choices
    from unnest(array['loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve']) v
    -- La Reine Louve ne protège chaque loup qu'une fois : elle n'a de sens qu'avec au moins 3 loups.
    where not (v = any(v_disabled)) and (v <> 'reine_louve' or v_wolves >= 3);

    if coalesce(array_length(v_wolf_variant_choices, 1), 0) > 0 then
      v_wolf_variant := v_wolf_variant_choices[1 + floor(random() * array_length(v_wolf_variant_choices, 1))::int];
      v_wolves := greatest(v_wolves - 1, 1);
    end if;
  end if;

  v_voyante := p_player_count >= 5 and random() < 0.9 and not ('voyante' = any(v_disabled));
  v_sorciere := p_player_count >= 6 and random() < 0.85 and not ('sorciere' = any(v_disabled));
  v_petite_fille := p_player_count >= 8 and random() < 0.55 and not ('petite_fille' = any(v_disabled));
  v_ancien := p_player_count >= 10 and random() < 0.45 and not ('ancien' = any(v_disabled));
  v_voleur := p_player_count >= 11 and random() < 0.45 and not ('voleur' = any(v_disabled));
  v_enfant_sauvage := p_player_count >= 9 and random() < 0.45 and not ('enfant_sauvage' = any(v_disabled));
  v_chasseur := p_player_count >= 6 and random() < 0.3 and not ('chasseur' = any(v_disabled));
  v_cupidon := p_player_count >= 6 and random() < 0.3 and not ('cupidon' = any(v_disabled));
  v_griot := p_player_count >= 9 and random() < 0.25 and not ('griot' = any(v_disabled));
  v_anancy := p_player_count >= 8 and random() < 0.2 and not ('anancy' = any(v_disabled));
  v_ange := p_player_count >= 6 and random() < 0.25 and not ('ange' = any(v_disabled));
  v_daron := p_player_count >= 7 and random() < 0.35 and not ('daron' = any(v_disabled));
  v_chasseuse := p_player_count >= 8 and random() < 0.2 and not ('chasseuse' = any(v_disabled));

  loop
    v_special_total := v_wolves + (case when v_wolf_variant is not null then 1 else 0 end)
      + v_voyante::int + v_sorciere::int + v_petite_fille::int + v_ancien::int + v_voleur::int
      + v_enfant_sauvage::int + v_chasseur::int + v_cupidon::int + v_griot::int + v_anancy::int + v_ange::int
      + v_daron::int + v_chasseuse::int;

    exit when v_special_total <= p_player_count - 1;

    if v_chasseuse then v_chasseuse := false;
    elsif v_daron then v_daron := false;
    elsif v_ange then v_ange := false;
    elsif v_anancy then v_anancy := false;
    elsif v_griot then v_griot := false;
    elsif v_cupidon then v_cupidon := false;
    elsif v_chasseur then v_chasseur := false;
    elsif v_enfant_sauvage then v_enfant_sauvage := false;
    elsif v_voleur then v_voleur := false;
    elsif v_ancien then v_ancien := false;
    elsif v_petite_fille then v_petite_fille := false;
    elsif v_wolf_variant is not null then
      v_wolf_variant := null;
      v_wolves := v_wolves + 1;
    else
      exit; -- rien de plus à couper (ne devrait jamais arriver en pratique)
    end if;
  end loop;

  return jsonb_build_object(
    'loup_garou', v_wolves,
    'loup_alpha', v_wolf_variant = 'loup_alpha',
    'voyante', v_voyante,
    'sorciere', v_sorciere,
    'chasseur', v_chasseur,
    'petite_fille', v_petite_fille,
    'cupidon', v_cupidon,
    'ancien', v_ancien,
    'voleur', v_voleur,
    'enfant_sauvage', v_enfant_sauvage,
    'griot', v_griot,
    'sans_visage', v_wolf_variant = 'sans_visage',
    'anancy', v_anancy,
    'ange', v_ange,
    'grand_mechant_loup', v_wolf_variant = 'grand_mechant_loup',
    'reine_louve', v_wolf_variant = 'reine_louve',
    'daron', v_daron,
    'chasseuse', v_chasseuse,
    'capitaine', true
  );
end;
$$;

create or replace function public.step_duration_seconds(p_game_id uuid, p_step text)
returns integer
language sql
stable security definer
set search_path = public
as $$
  select case p_step
    when 'loup_garou' then coalesce((settings->>'wolf_chat_seconds')::int, 180)
    when 'reine_louve' then coalesce((settings->>'reine_louve_seconds')::int, 30)
    when 'voyante' then coalesce((settings->>'voyante_seconds')::int, (settings->>'night_step_seconds')::int, 70)
    when 'sorciere' then coalesce((settings->>'sorciere_seconds')::int, (settings->>'night_step_seconds')::int, 70)
    else coalesce((settings->>'night_step_seconds')::int, 70)
  end
  from public.games where id = p_game_id;
$$;

create or replace function public.compute_griot_phrase(p_game_id uuid, p_target_id uuid, p_night_number integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_night_number < 1 then
    return 'no_action';
  end if;

  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = p_target_id;
  if v_role is null then
    return 'no_action';
  end if;

  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'voyante' and actor_id = p_target_id
  ) then
    return 'observed_card';
  end if;

  -- Petite Fille : aucune action soumise, seul son rôle ACTUEL en témoigne
  -- (voir le commentaire d'en-tête de cette migration).
  if v_role = 'petite_fille' then
    return 'watched_wolves';
  end if;

  -- Seconde victime du Grand Méchant Loup : vérifiée avant le vote de
  -- meute partagé ci-dessous, pour rester cohérente avec l'ordre déjà en
  -- place côté migration 0121 (son pouvoir personnel prime sur le simple
  -- vote collectif dans la phrase révélée).
  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'grand_mechant_loup' and actor_id = p_target_id
      and target_id is not null
  ) then
    return 'used_power';
  end if;

  -- Reine Louve (migration 0242) : couvrir un loup compte comme un pouvoir utilisé.
  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'reine_louve' and actor_id = p_target_id
      and target_id is not null
  ) then
    return 'used_power';
  end if;

  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'loup_garou' and actor_id = p_target_id
  ) then
    return 'wolf_vote';
  end if;

  if exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'sorciere' and actor_id = p_target_id
      and ((extra->>'heal')::boolean is true or nullif(extra->>'poison_target', '') is not null)
  ) then
    return 'used_power';
  end if;

  if p_night_number = 1 and exists (
    select 1 from public.night_actions where game_id = p_game_id and night_number = 1 and step = 'cupidon' and actor_id = p_target_id
  ) then
    return 'linked_lovers';
  end if;

  if p_night_number = 1 and exists (
    select 1 from public.night_actions where game_id = p_game_id and night_number = 1 and step = 'voleur' and actor_id = p_target_id
  ) then
    return 'swapped_role';
  end if;

  if p_night_number = 1 and exists (
    select 1 from public.night_actions where game_id = p_game_id and night_number = 1 and step = 'enfant_sauvage' and actor_id = p_target_id
  ) then
    return 'chose_mentor';
  end if;

  return 'no_action';
end;
$$;

create or replace function public.role_display_name(p_role text)
returns text
language sql
immutable
as $$
  select case p_role
    when 'villageois' then 'Villageois'
    when 'loup_garou' then 'Loup-Garou'
    when 'loup_alpha' then 'Loup Alpha'
    when 'voyante' then 'Voyante'
    when 'sorciere' then 'Sorcière'
    when 'chasseur' then 'Chasseur'
    when 'petite_fille' then 'Petite Fille'
    when 'cupidon' then 'Cupidon'
    when 'ancien' then 'Ancien'
    when 'voleur' then 'Voleur'
    when 'enfant_sauvage' then 'Enfant Sauvage'
    when 'griot' then 'Griot'
    when 'sans_visage' then 'Sans-Visage'
    when 'anancy' then 'Anancy'
    when 'ange' then 'Ange'
    when 'grand_mechant_loup' then 'Grand Méchant Loup'
    when 'reine_louve' then 'Reine Louve'
    when 'chasseuse' then 'La Chasseuse'
    when 'daron' then 'Daron'
    else coalesce(p_role, 'Inconnu')
  end;
$$;

create or replace function public.notif_role_label(p_role text, p_lang text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_role
    when 'villageois' then case when p_lang = 'en' then 'Villager' else 'Villageois' end
    when 'loup_garou' then case when p_lang = 'en' then 'Werewolf' else 'Loup-Garou' end
    when 'loup_alpha' then case when p_lang = 'en' then 'Alpha Wolf' else 'Loup Alpha' end
    when 'voyante' then case when p_lang = 'en' then 'Seer' else 'Voyante' end
    when 'sorciere' then case when p_lang = 'en' then 'Witch' else 'Sorcière' end
    when 'chasseur' then case when p_lang = 'en' then 'Hunter' else 'Chasseur' end
    when 'petite_fille' then case when p_lang = 'en' then 'Little Girl' else 'Petite Fille' end
    when 'cupidon' then case when p_lang = 'en' then 'Cupid' else 'Cupidon' end
    when 'ancien' then case when p_lang = 'en' then 'Elder' else 'Ancien' end
    when 'voleur' then case when p_lang = 'en' then 'Thief' else 'Voleur' end
    when 'enfant_sauvage' then case when p_lang = 'en' then 'Wild Child' else 'Enfant Sauvage' end
    when 'griot' then 'Griot'
    when 'sans_visage' then case when p_lang = 'en' then 'Faceless' else 'Sans-Visage' end
    when 'anancy' then 'Anancy'
    when 'chasseuse' then case when p_lang = 'en' then 'Huntress' else 'Chasseuse' end
    when 'capitaine' then case when p_lang = 'en' then 'Captain' else 'Capitaine' end
    when 'ange' then case when p_lang = 'en' then 'Angel' else 'Ange' end
    when 'grand_mechant_loup' then case when p_lang = 'en' then 'Big Bad Wolf' else 'Grand Méchant Loup' end
    when 'reine_louve' then case when p_lang = 'en' then 'Wolf Queen' else 'Reine Louve' end
    when 'daron' then case when p_lang = 'en' then 'Guardian' else 'Daron' end
    else null
  end;
$$;

revoke execute on function public.reine_louve_eligible_ids(uuid) from public, anon, authenticated;
revoke execute on function public.submit_reine_louve(uuid, uuid) from public, anon;
grant execute on function public.submit_reine_louve(uuid, uuid) to authenticated;
