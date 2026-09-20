-- ============================================================================
-- Renomme "Le Juge" en "La Chasseuse" (retour utilisateur) — nom d'affichage
-- ET identifiant interne changés partout (id de rôle, colonnes, fonctions,
-- clé de traduction), mais AUCUNE mécanique ne change : même désignation
-- automatique de cible à partir de la deuxième nuit, même victoire sur
-- élimination par le vote du village, même choix abandonner/continuer en
-- cas de mort autrement que par le vote. Emoji changé de ⚖️ à 🎯 (les
-- balances de la justice ne collaient plus au nouveau thème — 🏹 déjà pris
-- par le rôle "Chasseur" existant, jamais demandé mais nécessaire pour
-- éviter un doublon visuel).
--
-- Au moins une vraie partie a déjà été jouée (et gagnée) avec ce rôle avant
-- ce renommage — cette migration met donc AUSSI à jour toutes les données
-- historiques qui portent encore la valeur 'juge' (games.winner_team,
-- game_results.winner_team/role, game_roles_secret.role,
-- game_players.revealed_role, role_config.role).
--
-- ⚠️ Idempotente à dessein : l'éditeur SQL de Supabase n'exécute PAS un
-- script collé comme une seule transaction atomique — chaque instruction se
-- valide au fur et à mesure, seule celle qui échoue (et la suite du script)
-- n'est pas appliquée. Une première tentative de cette migration a échoué en
-- cours de route (contrainte resserrée avant la mise à jour des données),
-- laissant la base dans un état partiellement migré (colonnes déjà
-- renommées, contrainte déjà supprimée mais pas encore recréée...). Chaque
-- étape ci-dessous est donc écrite pour être sûre à rejouer intégralement,
-- quel que soit ce qui a déjà été appliqué ou non par une tentative
-- précédente : contraintes retirées avant toute mise à jour de données (pas
-- l'inverse), renommages de colonnes/fonctions protégés par une vérification
-- d'existence, contraintes resserrées seulement à la toute fin.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 0. Retire les deux contraintes CHECK concernées AVANT toute mise à jour de
-- données — dans n'importe quel ordre, ces `drop ... if exists` sont sans
-- risque, que la contrainte ait déjà été retirée par une tentative
-- précédente ou non.
-- ----------------------------------------------------------------------------
alter table public.games drop constraint if exists games_winner_team_check;
alter table public.role_config drop constraint if exists role_config_role_check;

-- ----------------------------------------------------------------------------
-- 1. Données historiques : les deux tables ci-dessus sont maintenant sans
-- contrainte, donc cette étape ne peut plus échouer quel que soit l'état de
-- départ. Sans effet (0 ligne) si déjà appliquée par une tentative précédente.
-- ----------------------------------------------------------------------------
update public.games set winner_team = 'chasseuse' where winner_team = 'juge';
update public.game_results set winner_team = 'chasseuse' where winner_team = 'juge';
update public.game_results set role = 'chasseuse' where role = 'juge';
update public.game_roles_secret set role = 'chasseuse' where role = 'juge';
update public.game_players set revealed_role = 'chasseuse' where revealed_role = 'juge';
update public.role_config set role = 'chasseuse' where role = 'juge';

-- ----------------------------------------------------------------------------
-- 2. Renomme les 3 colonnes de game_roles_secret — protégé par une
-- vérification d'existence (information_schema) : sans effet si une
-- tentative précédente les a déjà renommées.
-- ----------------------------------------------------------------------------
do $do$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'game_roles_secret' and column_name = 'juge_target_id'
  ) then
    alter table public.game_roles_secret rename column juge_target_id to chasseuse_target_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'game_roles_secret' and column_name = 'juge_used_reassignment'
  ) then
    alter table public.game_roles_secret rename column juge_used_reassignment to chasseuse_used_reassignment;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'game_roles_secret' and column_name = 'juge_pending_choice'
  ) then
    alter table public.game_roles_secret rename column juge_pending_choice to chasseuse_pending_choice;
  end if;
end $do$;

-- ----------------------------------------------------------------------------
-- 3. Recrée les deux contraintes, resserrées à leur liste finale — les
-- données sont maintenant garanties valides (étape 1), donc ceci ne peut
-- plus échouer.
-- ----------------------------------------------------------------------------
alter table public.games add constraint games_winner_team_check
  check (winner_team = any (array['village', 'loups', 'amoureux', 'anancy', 'ange', 'chasseuse']));

alter table public.role_config add constraint role_config_role_check check (role in (
  'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'voyante', 'sorciere',
  'chasseur', 'petite_fille', 'cupidon', 'ancien', 'voleur', 'enfant_sauvage',
  'griot', 'anancy', 'ange', 'daron', 'chasseuse'
));

-- ----------------------------------------------------------------------------
-- 4. Renomme les 3 fonctions dédiées — protégé par une vérification
-- d'existence (pg_proc) : sans effet si déjà renommées. Les grants existants
-- suivent automatiquement le renommage en PostgreSQL — pas besoin de les
-- répéter, mais on les réaffirme explicitement plus bas pour
-- submit_chasseuse_choice, par cohérence avec le reste des migrations de ce
-- projet.
-- ----------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_proc where proname = 'check_and_apply_juge_win') then
    alter function public.check_and_apply_juge_win(uuid) rename to check_and_apply_chasseuse_win;
  end if;

  if exists (select 1 from pg_proc where proname = 'submit_juge_choice') then
    alter function public.submit_juge_choice(uuid, boolean) rename to submit_chasseuse_choice;
  end if;

  if exists (select 1 from pg_proc where proname = 'game_view_juge_fields') then
    alter function public.game_view_juge_fields(uuid, uuid, text) rename to game_view_chasseuse_fields;
  end if;
end $do$;

-- ----------------------------------------------------------------------------
-- 5. Corps des fonctions : identiques à leur dernière version (migration
-- 0162), uniquement le renommage juge→chasseuse (id de rôle, colonnes,
-- noms de fonctions/variables) et l'emoji ⚖️→🎯 — vérifié par diff
-- automatisé contre 0162 avant ce déploiement, aucune autre différence.
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
        update public.game_roles_secret set chasseuse_target_id = v_chasseuse_target
        where game_id = p_game_id and user_id = v_chasseuse_id;
      end if;
    end if;
  end if;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🌙 La nuit ' || p_night_number || ' tombe sur le village. Tout le monde ferme les yeux...');
end;
$function$;

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
      if v_ended then return; end if;

      v_ended := public.check_and_apply_chasseuse_win(p_game_id);
      if v_ended then return; end if;

      v_ended := public.check_and_apply_anancy_win(p_game_id);
      if v_ended then return; end if;

      v_ended := public.check_and_apply_win(p_game_id);
      if v_ended then return; end if;

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

      delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves');

      -- Pierre des Ancêtres (migration 0152) : révèle les résurrections en
      -- attente juste avant de basculer vers le jour — après la suppression
      -- du chat nocturne (rien à cacher, c'est une annonce publique), avant
      -- que le jour ne commence réellement. Couvre aussi bien une mort de
      -- CETTE nuit qu'une mort par vote du jour précédent : cette bascule
      -- est la toute première occasion de "passer au jour suivant" pour les
      -- deux cas, sans distinction de cause à faire ici.
      for v_revival in
        select gp.user_id, gp.display_name from public.game_players gp
        where gp.game_id = p_game_id and gp.pending_revival = true
      loop
        update public.game_players set is_alive = true, pending_revival = false
        where game_id = p_game_id and user_id = v_revival.user_id;

        insert into public.game_log (game_id, message, night_number)
        values (p_game_id, '🌄 ' || v_revival.display_name || ' revient d’entre les morts, grâce à la Pierre des Ancêtres !', v_game.night_number);
      end loop;

      select coalesce((settings->>'role_reveal_seconds')::int, 15) into v_seconds from public.games where id = p_game_id;
      update public.games
      set status = 'day_reveal', phase_deadline = now() + make_interval(secs => greatest(v_seconds, 6))
      where id = p_game_id;
      return;
    else
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
    if v_ended then return; end if;

    v_ended := public.check_and_apply_chasseuse_win(p_game_id);
    if v_ended then return; end if;

    v_ended := public.check_and_apply_win(p_game_id);
    if v_ended then return; end if;

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
      chasseuse_pending_choice = v_state2.chasseuse_pending_choice
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
      chasseuse_pending_choice = v_state1.chasseuse_pending_choice
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

  if v_has_alpha then
    if v_count < 10 then
      raise exception 'Le Loup Alpha nécessite au moins 10 joueurs.';
    end if;
  end if;

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
    + coalesce((v_role_counts->>'chasseuse')::boolean::int, 0);

  if (v_role_counts->>'loup_garou')::int < 1 and not v_has_alpha and not v_has_sans_visage and not v_has_gml then
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

create or replace function public.apply_rank_updates_for_game(p_game_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; v_won boolean; v_code text; v_total_rounds int; v_ratio numeric;
  v_impact jsonb; v_impact_bonus int; v_impact_details jsonb; v_result jsonb;
begin
  select code, greatest(night_number, 1) into v_code, v_total_rounds from public.games where id = p_game_id;

  for r in
    select gp.user_id, gp.is_lover, gp.died_at_night, rs.role
    from public.game_players gp
    left join public.game_roles_secret rs
      on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    v_won := case
      when p_winner = 'amoureux' then coalesce(r.is_lover, false)
      when p_winner = 'loups' then coalesce(r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'), false)
      when p_winner = 'village' then coalesce(r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'chasseuse'), true)
      when p_winner = 'anancy' then coalesce(r.role = 'anancy', false)
      when p_winner = 'ange' then coalesce(r.role = 'ange', false)
      when p_winner = 'chasseuse' then coalesce(r.role = 'chasseuse', false)
      else false
    end;

    v_ratio := case
      when r.died_at_night is null then 1.0
      else least(greatest(r.died_at_night::numeric / v_total_rounds, 0.4), 0.9)
    end;

    v_impact := public.compute_impact_bonus(p_game_id, r.user_id, r.role);
    v_impact_bonus := coalesce((v_impact->>'bonus')::int, 0);
    v_impact_details := coalesce(v_impact->'details', '[]'::jsonb);

    if p_winner = 'anancy' and v_won then
      v_impact_bonus := v_impact_bonus + 50;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'anancy_solo_win', 'points', 50);
    end if;

    if p_winner = 'loups' and v_won then
      v_impact_bonus := v_impact_bonus + 15;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'wolf_team_win', 'points', 15);
    end if;

    v_result := public.apply_rank_result(r.user_id, v_won, v_ratio, v_impact_bonus);

    insert into public.game_results (
      game_id, user_id, code, role, is_lover, winner_team, won,
      points_gained, participation_ratio, impact_bonus, impact_details, new_rank_points, new_rank_tier
    )
    values (
      p_game_id, r.user_id, v_code, r.role, coalesce(r.is_lover, false), p_winner, v_won,
      (v_result->>'gain')::int, v_ratio, v_impact_bonus, v_impact_details,
      (v_result->>'new_points')::int, v_result->>'new_tier'
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
        when g.winner_team = 'amoureux' then gp.is_lover
        when g.winner_team = 'loups' then rs.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
        when g.winner_team = 'village' then coalesce(rs.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'chasseuse'), true)
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
    when 'chasseuse' then 'La Chasseuse'
    else coalesce(p_role, 'Inconnu')
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
  v_today date := current_date;
begin
  for r in
    select gp.user_id, gp.is_alive, rs.role, gr.won, p.current_streak
    from public.game_players gp
    join public.profiles p on p.id = gp.user_id and not p.is_bot
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    left join public.game_results gr on gr.game_id = gp.game_id and gr.user_id = gp.user_id
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
        or (qt.condition_key = 'won_as_wolf' and coalesce(r.won, false) and r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'))
        or (qt.condition_key = 'won_as_village' and coalesce(r.won, false) and r.role is not null and r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'ange', 'chasseuse'))
        or (qt.condition_key = 'played_as_role' and r.role = qt.condition_role)
        or (qt.condition_key = 'won_as_role' and coalesce(r.won, false) and r.role = qt.condition_role)
        or (qt.condition_key = 'win_streak_reached')
      );
  end loop;
end;
$$;

create or replace function public.admin_auto_play_bots(p_game_id uuid)
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
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;

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
          and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.night_step = 'loup_garou'))
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
          and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.night_step = 'loup_garou'))
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
            update public.game_players set is_lover = false where game_id = p_game_id;
            update public.game_roles_secret set lover_with = null where game_id = p_game_id;

            update public.game_players set is_lover = true where game_id = p_game_id and user_id = any(v_target_arr);
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
            and rs2.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
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
              and rs2.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
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
    if v_game.status in ('day_reveal', 'day_vote_recap') then
      perform public.advance_phase(p_game_id, true);
      continue;
    end if;

    -- status non géré ici (lobby, ended...) : rien de plus à faire.
    exit;
  end loop;

  return jsonb_build_object('acted', v_total_acted);
end;
$$;

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

  if v_game.status <> 'ended' and v_game.last_activity_at < now() - interval '2 hours' then
    update public.games set status = 'ended' where id = p_game_id;
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

create or replace function public.check_and_apply_chasseuse_win(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_chasseuse_id uuid;
  v_target_id uuid;
  v_pending boolean;
  v_used boolean;
  v_target_alive boolean;
  v_target_cause text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null or v_status = 'ended' then
    return false;
  end if;

  select rs.user_id, rs.chasseuse_target_id, rs.chasseuse_pending_choice, rs.chasseuse_used_reassignment
    into v_chasseuse_id, v_target_id, v_pending, v_used
  from public.game_roles_secret rs
  join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role = 'chasseuse' and gp.is_alive
  limit 1;

  if v_chasseuse_id is null or v_target_id is null then
    return false;
  end if;

  -- Déjà en attente de sa décision : rien à refaire tant qu'il n'a pas
  -- répondu (voir submit_chasseuse_choice) — évite de reposer chasseuse_pending_choice
  -- à chaque advance_phase suivant tant que la cible reste morte.
  if v_pending then
    return false;
  end if;

  select is_alive, death_cause into v_target_alive, v_target_cause
  from public.game_players where game_id = p_game_id and user_id = v_target_id;

  if coalesce(v_target_alive, true) then
    return false; -- cible toujours vivante, rien à faire
  end if;

  if v_target_cause = 'vote' then
    update public.games set status = 'ended', winner_team = 'chasseuse', phase_deadline = null,
      hunter_pending = null, hunter_context = null, captain_pending = null
    where id = p_game_id;

    insert into public.game_log (game_id, message)
    select p_game_id, '🎯 ' || gp.display_name || ' était La Chasseuse : sa cible a été condamnée par le vote du village. La Chasseuse l’emporte !'
    from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_chasseuse_id;

    perform public.apply_rank_updates_for_game(p_game_id, 'chasseuse');
    perform public.sync_daily_quests_for_all_players(p_game_id);

    return true;
  end if;

  -- Cible morte, mais pas par le vote : deuxième échec (changement déjà
  -- utilisé) → conversion silencieuse en Villageois. Premier échec → pose
  -- chasseuse_pending_choice, le joueur choisit lui-même (voir submit_chasseuse_choice).
  -- Jamais annoncé publiquement dans les deux cas (voir le commentaire en
  -- tête de fichier).
  if v_used then
    update public.game_roles_secret
    set role = 'villageois', chasseuse_target_id = null, chasseuse_pending_choice = false
    where game_id = p_game_id and user_id = v_chasseuse_id;
  else
    update public.game_roles_secret set chasseuse_pending_choice = true
    where game_id = p_game_id and user_id = v_chasseuse_id;
  end if;

  return false;
end;
$$;

create or replace function public.submit_chasseuse_choice(p_game_id uuid, p_continue boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_pending boolean;
  v_used boolean;
  v_new_target uuid;
begin
  select role, chasseuse_pending_choice, chasseuse_used_reassignment
    into v_role, v_pending, v_used
  from public.game_roles_secret
  where game_id = p_game_id and user_id = v_user;

  if v_role is distinct from 'chasseuse' or not coalesce(v_pending, false) then
    raise exception 'Aucune décision en attente.';
  end if;

  if p_continue then
    if v_used then
      raise exception 'Vous avez déjà utilisé votre changement de cible.';
    end if;

    select user_id into v_new_target
    from public.game_players
    where game_id = p_game_id and is_alive and user_id <> v_user
    order by random() limit 1;

    update public.game_roles_secret
    set chasseuse_target_id = v_new_target, chasseuse_used_reassignment = true, chasseuse_pending_choice = false
    where game_id = p_game_id and user_id = v_user;
  else
    update public.game_roles_secret
    set role = 'villageois', chasseuse_target_id = null, chasseuse_pending_choice = false
    where game_id = p_game_id and user_id = v_user;
  end if;
end;
$$;

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
    ) else null end
  );
$$;

grant execute on function public.submit_chasseuse_choice(uuid, boolean) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.get_my_game_view(uuid) to authenticated;


