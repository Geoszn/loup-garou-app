-- ============================================================================
-- Trois correctifs trouvés lors d'un audit fonctionnel complet des
-- artefacts du Loup Store (demandé par l'utilisateur : "tous fonctionnent ?").
--
--   1. send_last_words (Dernier Souffle / Flamme des Esprits, effect_key
--      partagé possible entre plusieurs objets de catalogue depuis la
--      migration 0152) : la recherche de l'artefact possédé n'excluait pas
--      ceux déjà utilisés cette partie ni ne prenait le premier disponible
--      (ni "not exists", ni "limit 1") — un joueur possédant deux objets
--      partageant cet effet pouvait se voir refuser l'usage ("Déjà
--      utilisé") alors qu'il lui restait une charge fraîche sur un AUTRE
--      objet, simplement parce que la requête avait arbitrairement
--      remonté le mauvais des deux.
--
--   2. admin_auto_play_bots : aucune gestion de balance_ange_pending
--      n'existait (contrairement à hunter_pending/captain_pending/
--      revival_pending/chasseuse_pending_choice, tous gérés). Si le
--      propriétaire de la Balance de l'Ange était un bot, une partie de
--      test solo restait bloquée indéfiniment en attente de sa décision —
--      même le délai de secours de 45s dans advance_phase ne se
--      déclenchait jamais, puisque cette boucle n'appelle advance_phase
--      qu'après avoir effectivement fait agir un bot.
--
--   3. Le plus sérieux : la fermeture automatique d'une partie après 2h
--      d'inactivité (get_my_game_view) pose status='ended' directement,
--      sans jamais passer par advance_phase — donc sans jamais déclencher
--      clear_revival_pending_if_ended (migration 0174, censée justement
--      empêcher qu'un artefact de résurrection soit "consommé" sans effet
--      une fois la partie terminée). Par ce chemin précis, hunter_pending/
--      captain_pending/balance_ange_pending/revival_pending pouvaient
--      rester posés sur une partie déjà fermée — et submit_revival_choice/
--      submit_balance_ange_vote ne vérifiaient jamais le statut de la
--      partie, donc un "oui" pouvait toujours consommer réellement
--      l'artefact (quantity, game_artifact_uses) pour absolument aucun
--      effet. Corrigé à deux niveaux, en profondeur : la fermeture pour
--      inactivité nettoie désormais tous les pendings comme le font déjà
--      restart_game/clear_revival_pending_if_ended, ET les deux fonctions
--      de soumission rejettent maintenant explicitement toute décision sur
--      une partie déjà 'ended' — donc protégé même si un futur chemin
--      encore inconnu venait à terminer une partie sans passer par
--      advance_phase.
-- ============================================================================
set search_path = public;



create or replace function public.send_last_words(p_game_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_content text := trim(p_content);
  v_alive boolean;
  v_name text;
  v_artifact_id uuid;
begin
  if v_content = '' then
    return;
  end if;
  if char_length(v_content) > 500 then
    v_content := left(v_content, 500);
  end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  if v_alive is null then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;
  if v_alive then
    raise exception 'Réservé aux joueurs éliminés.';
  end if;

  -- Bug corrigé (migration 0177) : sans le filtre "pas déjà utilisé" ni
  -- limit 1, cette recherche pouvait renvoyer N'IMPORTE LEQUEL des
  -- artefacts possédés partageant cet effect_key (le design autorise
  -- explicitement plusieurs objets de catalogue à réutiliser le même
  -- effet, ex. Flamme des Esprits, voir migration 0152) — y compris un
  -- DÉJÀ utilisé cette partie, alors qu'une charge fraîche restait
  -- disponible sur un autre artefact du même joueur. Filtre désormais
  -- directement sur "non utilisé", même patron que kill_player pour
  -- Pierre des Ancêtres/Larme de Renaissance.
  select sa.id into v_artifact_id
    from public.store_artifacts sa
    join public.player_artifacts pa on pa.artifact_id = sa.id and pa.user_id = v_user
    where sa.effect_key = 'dernier_souffle'
      and not exists (
        select 1 from public.game_artifact_uses gau
        where gau.game_id = p_game_id and gau.user_id = v_user and gau.artifact_id = sa.id
      )
    limit 1;

  if v_artifact_id is null then
    raise exception 'Vous ne possédez pas cet artefact, ou vous l''avez déjà utilisé cette partie.';
  end if;

  insert into public.game_artifact_uses (game_id, user_id, artifact_id) values (p_game_id, v_user, v_artifact_id);

  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;
  v_name := coalesce(v_name, 'Joueur');

  insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous, is_last_words)
  values (p_game_id, 'village', v_user, v_name, v_content, false, true);
end;
$$;

create or replace function public.submit_balance_ange_vote(p_game_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_artifact_id uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status = 'ended' or v_game.balance_ange_pending is distinct from v_user then
    raise exception 'Ce n''est pas à vous de départager ce vote.';
  end if;

  if p_target_id is null or not (p_target_id = any(coalesce(v_game.balance_ange_candidates, '{}'::uuid[]))) then
    raise exception 'Cible invalide : doit faire partie des joueurs à égalité.';
  end if;
  if p_target_id = v_user then
    raise exception 'Vous ne pouvez pas vous désigner vous-même.';
  end if;

  select pa.artifact_id into v_artifact_id
  from public.player_artifacts pa
  join public.store_artifacts sa on sa.id = pa.artifact_id
  where pa.user_id = v_user and sa.effect_key = 'balance_ange'
    and not exists (
      select 1 from public.game_artifact_uses gau
      where gau.game_id = p_game_id and gau.user_id = v_user and gau.artifact_id = pa.artifact_id
    )
  limit 1;

  if v_artifact_id is null then
    raise exception 'Vous ne possédez pas cet artefact (ou déjà utilisé).';
  end if;

  insert into public.game_artifact_uses (game_id, user_id, artifact_id) values (p_game_id, v_user, v_artifact_id);

  update public.games set balance_ange_pending = null, balance_ange_candidates = null where id = p_game_id;

  perform public.kill_player(p_game_id, p_target_id, 'vote', v_game.night_number);

  insert into public.game_log (game_id, message)
  values (p_game_id, '⚖️ La Balance de l’Ange a départagé le vote.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

create or replace function public.submit_revival_choice(p_game_id uuid, p_use boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_artifact_id uuid;
begin
  -- Garde-fou ajouté en migration 0177 : la fermeture automatique après 2h
  -- d'inactivité (get_my_game_view) posait directement status='ended' sans
  -- jamais passer par advance_phase, donc sans jamais déclencher le
  -- nettoyage de revival_pending (clear_revival_pending_if_ended, migration
  -- 0174) ni les autres pendings — un "oui" pouvait donc encore consommer
  -- l'artefact pour rien sur une partie déjà terminée par ce chemin précis.
  -- status <> 'ended' bloque la consommation à la source, quel que soit le
  -- chemin par lequel la partie a fini.
  select revival_pending_artifact_id into v_artifact_id
  from public.games where id = p_game_id and revival_pending = v_user and status <> 'ended';

  if v_artifact_id is null then
    raise exception 'Aucune décision de résurrection en attente.';
  end if;

  if p_use then
    update public.game_players set pending_revival = true
    where game_id = p_game_id and user_id = v_user;

    update public.player_artifacts set quantity = quantity - 1
    where user_id = v_user and artifact_id = v_artifact_id;

    insert into public.game_artifact_uses (game_id, user_id, artifact_id)
    values (p_game_id, v_user, v_artifact_id);
  end if;

  update public.games set revival_pending = null, revival_pending_artifact_id = null
  where id = p_game_id;

  perform public.advance_phase(p_game_id, true);
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
  v_balance_artifact_id uuid;
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
