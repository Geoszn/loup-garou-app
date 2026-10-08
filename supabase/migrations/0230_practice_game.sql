-- Partie d'entraînement pour les nouveaux joueurs : une partie seul contre 7 bots, sans
-- aucune récompense, avec des conseils affichés par l'appli à chaque étape.
--
--  * games.is_practice marque ces parties ; elles ne sont jamais publiques ni listées
--    dans « Le village veille » ;
--  * start_practice_game() crée la partie (8 joueurs : toi + 7 bots du pool de 0127, 2
--    loups, 1 voyante, le reste villageois), la démarre et te donne la Voyante, le rôle le
--    plus instructif ; elle supprime tes anciens entraînements ;
--  * practice_auto_play(partie) fait jouer les bots à ta place... pour eux : même moteur que
--    le mode test des admins (admin_auto_play_bots), désormais isolé dans
--    _auto_play_bots_core. Contrairement au mode admin, les écrans de récap ne sont PAS
--    sautés : tu as le temps de lire ;
--  * apply_rank_updates_for_game et sync_daily_quests_for_game ignorent ces parties :
--    ni points de rang, ni résultat, ni quête, ni Loup Coins, ni saison, ni série ;
--  * quand l'entraînement se termine, le drapeau « onboarding-practice-done » est posé
--    (étape cochée de la carte « Bien démarrer »).
-- Rejouable sans risque. À appliquer APRÈS 0229.
set search_path = public;

alter table public.games add column if not exists is_practice boolean not null default false;

-- Moteur des bots (repris de admin_auto_play_bots, 0186), sans le contrôle admin.
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

-- apply_rank_updates_for_game (0212) : les parties d'entraînement n'en produisent aucun.
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

-- sync_daily_quests_for_game (0187) : idem pour les quêtes.
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
      or (qt.condition_key = 'won_as_wolf' and coalesce(v_won, false) and v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'))
      or (qt.condition_key = 'won_as_village' and coalesce(v_won, false) and v_role is not null and v_role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'ange'))
      or (qt.condition_key = 'played_as_role' and v_role = qt.condition_role)
      or (qt.condition_key = 'won_as_role' and coalesce(v_won, false) and v_role = qt.condition_role)
      or (qt.condition_key = 'win_streak_reached')
    );

  return public.get_my_quests();
end;
$$;

-- get_live_games (0213) : les parties d'entraînement ne sont pas listées.
create or replace function public.get_live_games()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select
      g.id,
      g.code,
      g.status,
      g.night_number,
      g.is_public,
      g.created_at,
      g.host_id,
      (select count(*) from public.game_players gp where gp.game_id = g.id) as player_count,
      exists (
        select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = auth.uid()
      ) as is_mine
    from public.games g
    where g.status <> 'ended'
      and not g.is_practice
      and g.created_at > now() - interval '12 hours'
  )
  select coalesce(jsonb_agg(
    case
      when l.is_public or l.is_mine then jsonb_build_object(
        'key', l.id,
        'game_id', l.id,
        'code', l.code,
        'is_public', l.is_public,
        'is_mine', l.is_mine,
        'status', l.status,
        'night_number', l.night_number,
        'player_count', l.player_count,
        'created_at', l.created_at,
        'continent', pr.continent,
        'host_name', hp.display_name,
        'host_avatar_icon', hp.avatar_icon,
        'host_avatar_config', pr.avatar_config,
        'already_requested', exists (
          select 1 from public.game_join_requests r
          where r.game_id = l.id and r.user_id = auth.uid() and r.status = 'pending'
        )
      )
      else jsonb_build_object(
        'key', left(md5(l.id::text), 12),
        'is_public', false,
        'is_mine', false,
        'status', l.status,
        'night_number', l.night_number,
        'player_count', l.player_count,
        'continent', pr.continent
      )
    end
    order by (l.is_public and l.status = 'lobby') desc, l.player_count desc, l.created_at desc
  ), '[]'::jsonb)
  from live l
  left join public.profiles pr on pr.id = l.host_id
  left join public.game_players hp on hp.game_id = l.id and hp.user_id = l.host_id;
$$;

-- Le mode test des admins : même comportement qu'avant, via le moteur partagé.
create or replace function public.admin_auto_play_bots(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;
  return public._auto_play_bots_core(p_game_id, true);
end;
$$;

-- Les bots d'une partie d'entraînement jouent leur étape (appelée toutes les quelques
-- secondes par l'appli tant que la partie est en cours). Réservée à l'hôte de la partie.
create or replace function public.practice_auto_play(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if not exists (select 1 from public.games where id = p_game_id and is_practice and host_id = auth.uid() and status <> 'ended') then
    return jsonb_build_object('acted', 0);
  end if;
  return public._auto_play_bots_core(p_game_id, false);
end;
$$;

-- Est-ce une partie d'entraînement dont je suis l'hôte ?
create or replace function public.is_practice_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.games where id = p_game_id and is_practice and host_id = auth.uid());
$$;

create or replace function public.start_practice_game()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_game_id uuid;
  v_name text;
  v_icon text;
  v_my_role text;
  v_bot record;
  v_i int := 0;
  v_names text[] := array['Kofi', 'Amara', 'Moussa', 'Zeïna', 'Tidiane', 'Nadia', 'Ibrahim'];
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if exists (select 1 from public.profiles where id = v_user and is_banned) then
    raise exception 'Votre compte a été suspendu.';
  end if;
  if (select count(*) from public.profiles where is_bot) < 7 then
    raise exception 'L''entraînement n''est pas disponible pour le moment.';
  end if;

  -- Un seul entraînement à la fois : les anciens disparaissent.
  delete from public.games where host_id = v_user and is_practice;

  select username, avatar_icon into v_name, v_icon from public.profiles where id = v_user;
  v_code := public.generate_game_code();

  insert into public.games (code, host_id, settings, is_public, is_practice)
  values (
    v_code, v_user,
    jsonb_build_object(
      'discussion_seconds', 120,
      'vote_seconds', 40,
      'vote_recap_seconds', 20,
      'night_step_seconds', 45,
      'wolf_chat_seconds', 60,
      'voyante_seconds', 60,
      'sorciere_seconds', 45,
      'role_reveal_seconds', 30,
      'role_reveal_intro_seconds', 45,
      'role_counts', jsonb_build_object('loup_garou', 2, 'voyante', true, 'sorciere', false, 'chasseur', false, 'petite_fille', false, 'cupidon', false)
    ),
    false, true
  )
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game_id, v_user, coalesce(nullif(trim(v_name), ''), 'Joueur'), 1, true, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game_id, 'Partie d''entraînement : tu joues seul contre des bots, rien n''est comptabilisé.');

  for v_bot in select id from public.profiles where is_bot order by random() limit 7 loop
    v_i := v_i + 1;
    perform public._add_player_to_game(v_game_id, v_bot.id, '🤖 ' || v_names[v_i]);
  end loop;

  perform public.start_game(v_game_id);

  -- Le joueur reçoit la Voyante (échange avec celui qui l'a tirée).
  select role into v_my_role from public.game_roles_secret where game_id = v_game_id and user_id = v_user;
  if v_my_role is distinct from 'voyante' then
    update public.game_roles_secret set role = v_my_role where game_id = v_game_id and role = 'voyante' and user_id <> v_user;
    update public.game_roles_secret set role = 'voyante' where game_id = v_game_id and user_id = v_user;
  end if;

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

-- Fin d'un entraînement : l'étape de la carte « Bien démarrer » se coche.
create or replace function public.practice_game_finished()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.is_practice and new.status = 'ended' then
      insert into public.announcement_views (user_id, announcement_key)
      values (new.host_id, 'onboarding-practice-done')
      on conflict do nothing;
    end if;
  exception when others then
    raise warning 'practice_game_finished: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function public.practice_game_finished() from public, anon, authenticated;

drop trigger if exists practice_game_finished on public.games;
create trigger practice_game_finished
  after update of status on public.games
  for each row
  when (old.status is distinct from new.status and new.status = 'ended')
  execute function public.practice_game_finished();

revoke execute on function public._auto_play_bots_core(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.apply_rank_updates_for_game(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_auto_play_bots(uuid) from public, anon;
grant execute on function public.admin_auto_play_bots(uuid) to authenticated;
revoke execute on function public.practice_auto_play(uuid) from public, anon;
grant execute on function public.practice_auto_play(uuid) to authenticated;
revoke execute on function public.is_practice_game(uuid) from public, anon;
grant execute on function public.is_practice_game(uuid) to authenticated;
revoke execute on function public.start_practice_game() from public, anon;
grant execute on function public.start_practice_game() to authenticated;
revoke execute on function public.sync_daily_quests_for_game(uuid) from public, anon;
grant execute on function public.sync_daily_quests_for_game(uuid) to authenticated;
revoke execute on function public.get_live_games() from public, anon;
grant execute on function public.get_live_games() to authenticated;
