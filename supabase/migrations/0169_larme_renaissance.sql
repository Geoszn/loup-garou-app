-- ============================================================================
-- Nouvel artefact du Loup Store : la Larme de Renaissance 💧 (catégorie
-- "rares"), variante moins chère et plus faible de la Pierre des Ancêtres
-- (migration 0152/0153) — demande explicite de l'utilisateur, à partir
-- d'une liste d'articles proposés en conversation.
--
-- Même mécanique de retour différé que la Pierre (pending_revival, résolu
-- au passage au jour suivant dans advance_phase) : la mort est annoncée
-- normalement, le retour ne l'est qu'au prochain passage au jour, jamais
-- secret. MAIS contrairement à la Pierre, le joueur revient en simple
-- Villageois — son rôle d'origine, quel qu'il ait été, est définitivement
-- perdu. Catalogue inséré directement `active = true` (contrairement à
-- Pierre des Ancêtres en 0149, créée inactive en attendant son effet) :
-- demande explicite "codé pour fonctionner immédiatement", donc achetable
-- dès cette migration passée, aucune étape manuelle côté dashboard admin
-- nécessaire.
--
-- Priorité entre les deux artefacts si un joueur possède les deux : la
-- Pierre des Ancêtres (effet complet) est toujours vérifiée EN PREMIER dans
-- kill_player — la Larme ne se déclenche que si la Pierre est absente ou
-- déjà épuisée cette partie. Rien n'empêche techniquement les DEUX de se
-- déclencher au fil d'une même partie sur deux morts séparées (chacune
-- consommée indépendamment, une fois par partie par artefact) : décision
-- assumée, ce n'est jamais la même charge utilisée deux fois.
--
-- 150 (Pierre) -> 90 (Larme) pour refléter l'effet plus faible. Stock/
-- cooldown par défaut de la catégorie "rares" (1 charge, rachat après 10
-- jours), comme tout autre artefact rare existant.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Nouvel effect_key.
-- ----------------------------------------------------------------------------
alter table public.store_artifacts drop constraint if exists store_artifacts_effect_key_check;
alter table public.store_artifacts add constraint store_artifacts_effect_key_check
  check (effect_key in (
    'none', 'parchemin_griot', 'dernier_souffle', 'masque_griot', 'plume_anancy',
    'boussole_village', 'masque_sans_visage', 'balance_ange', 'pierre_ancetres', 'feu_sacre_ancetres',
    'larme_renaissance'
  ));

-- ----------------------------------------------------------------------------
-- 2. admin_upsert_store_artifact : même signature (0153), la liste des
-- effets acceptés s'agrandit simplement de 'larme_renaissance'.
-- ----------------------------------------------------------------------------
create or replace function public.admin_upsert_store_artifact(
  p_id uuid,
  p_key text,
  p_name_fr text,
  p_name_en text,
  p_description_fr text,
  p_description_en text,
  p_price_coins int,
  p_category text,
  p_effect_key text,
  p_max_stock int,
  p_repurchase_cooldown_days int,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
  v_max_stock int;
  v_cooldown int;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  if p_name_fr is null or length(trim(p_name_fr)) = 0 or p_name_en is null or length(trim(p_name_en)) = 0 then
    raise exception 'Nom requis (FR et EN).';
  end if;
  if p_description_fr is null or length(trim(p_description_fr)) = 0 or p_description_en is null or length(trim(p_description_en)) = 0 then
    raise exception 'Description requise (FR et EN).';
  end if;
  if coalesce(p_price_coins, -1) < 0 then
    raise exception 'Le prix ne peut pas être négatif.';
  end if;
  if p_category not in ('outils', 'rares', 'cosmetiques', 'fragments') then
    raise exception 'Catégorie invalide.';
  end if;
  if p_effect_key not in (
    'none', 'parchemin_griot', 'dernier_souffle', 'masque_griot', 'plume_anancy',
    'boussole_village', 'masque_sans_visage', 'balance_ange', 'pierre_ancetres', 'feu_sacre_ancetres',
    'larme_renaissance'
  ) then
    raise exception 'Effet invalide.';
  end if;

  -- Stock/cooldown : uniquement pertinents pour la catégorie "rares" — forcés
  -- à null pour toute autre catégorie, quoi que le client envoie, pour ne
  -- jamais laisser un artefact non-rare devenir rechargeable par erreur.
  if p_category = 'rares' then
    v_max_stock := coalesce(p_max_stock, 1);
    v_cooldown := coalesce(p_repurchase_cooldown_days, 10);
    if v_max_stock <= 0 then
      raise exception 'Le stock maximum doit être supérieur à 0.';
    end if;
    if v_cooldown <= 0 then
      raise exception 'Le délai de rachat doit être supérieur à 0.';
    end if;
  else
    v_max_stock := null;
    v_cooldown := null;
  end if;

  if p_id is null then
    if p_key is null or p_key !~ '^[a-z0-9_]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, underscore uniquement).';
    end if;
    if exists (select 1 from public.store_artifacts where key = p_key) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.store_artifacts (
      key, name_fr, name_en, description_fr, description_en, price_coins, category, effect_key,
      max_stock, repurchase_cooldown_days, active
    )
    values (
      p_key, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en), p_price_coins, p_category, p_effect_key,
      v_max_stock, v_cooldown, coalesce(p_active, true)
    )
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_store_artifact', v_id::text, jsonb_build_object('key', p_key, 'name_fr', p_name_fr));
  else
    -- `key` n'est jamais modifié ici, quoi que le client envoie dans
    -- p_key — voir migration 0148/0149.
    update public.store_artifacts
    set name_fr = trim(p_name_fr),
        name_en = trim(p_name_en),
        description_fr = trim(p_description_fr),
        description_en = trim(p_description_en),
        price_coins = p_price_coins,
        category = p_category,
        effect_key = p_effect_key,
        max_stock = v_max_stock,
        repurchase_cooldown_days = v_cooldown,
        active = coalesce(p_active, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Artefact introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_store_artifact', v_id::text, jsonb_build_object('name_fr', p_name_fr));
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. kill_player : ajoute la branche Larme de Renaissance, uniquement
-- vérifiée si Pierre des Ancêtres n'a pas déjà déclenché la résurrection
-- (absente ou déjà épuisée cette partie) — reste par ailleurs identique à
-- 0153.
-- ----------------------------------------------------------------------------
create or replace function public.kill_player(p_game_id uuid, p_user_id uuid, p_cause text, p_night int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text;
  v_is_lover boolean;
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
  returning display_name, is_lover, is_captain into v_name, v_is_lover, v_was_captain;

  if v_name is null then
    return; -- déjà mort, rien à faire
  end if;

  insert into public.game_log (game_id, message, night_number)
  values (p_game_id, v_name || ' (' || public.role_display_name(v_role) || ') ' || public.death_phrase(p_cause), p_night);

  -- Pierre des Ancêtres (migration 0152/0153) puis, à défaut, Larme de
  -- Renaissance (migration 0169) : ni secret ni instantané — la mort
  -- ci-dessus vient d'être annoncée normalement, le retour ne le sera
  -- qu'au prochain passage au jour (voir advance_phase, boucle sur
  -- pending_revival). Exclu du bûcher/kick de l'hôte ('exclu' n'est de
  -- toute façon jamais une cause passée à kill_player). Une charge de stock
  -- consommée (quantity > 0 requis), en plus de la limite d'une fois par
  -- partie (game_artifact_uses) déjà en place.
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

    if v_pierre_artifact_id is not null then
      update public.game_players set pending_revival = true
      where game_id = p_game_id and user_id = p_user_id;

      update public.player_artifacts set quantity = quantity - 1
      where user_id = p_user_id and artifact_id = v_pierre_artifact_id;

      insert into public.game_artifact_uses (game_id, user_id, artifact_id)
      values (p_game_id, p_user_id, v_pierre_artifact_id);
    else
      -- Larme de Renaissance : variante moins chère/plus faible de la
      -- Pierre ci-dessus — ne se déclenche QUE si la victime ne possède
      -- pas (ou a déjà épuisé) la Pierre, jamais les deux sur une seule
      -- mort. Même retour différé (pending_revival), mais le joueur revient
      -- en simple Villageois — voir advance_phase pour le reset effectif
      -- de game_roles_secret.role, distingué là-bas via game_artifact_uses
      -- (effect_key = 'larme_renaissance').
      select pa.artifact_id into v_larme_artifact_id
      from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user_id and sa.effect_key = 'larme_renaissance' and pa.quantity > 0
        and not exists (
          select 1 from public.game_artifact_uses gau
          where gau.game_id = p_game_id and gau.user_id = p_user_id and gau.artifact_id = pa.artifact_id
        )
      limit 1;

      if v_larme_artifact_id is not null then
        update public.game_players set pending_revival = true
        where game_id = p_game_id and user_id = p_user_id;

        update public.player_artifacts set quantity = quantity - 1
        where user_id = p_user_id and artifact_id = v_larme_artifact_id;

        insert into public.game_artifact_uses (game_id, user_id, artifact_id)
        values (p_game_id, p_user_id, v_larme_artifact_id);
      end if;
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

  if v_is_lover then
    select lover_with into v_lover_id from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;
    if v_lover_id is not null and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = v_lover_id and is_alive
    ) then
      perform public.kill_player(p_game_id, v_lover_id, 'chagrin', p_night);
    end if;
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

-- ----------------------------------------------------------------------------
-- 4. advance_phase : la boucle de résurrection distingue désormais Pierre
-- des Ancêtres (rôle conservé, message inchangé) de Larme de Renaissance
-- (rôle réinitialisé en Villageois, nouveau message dédié). Reste identique
-- à 0163 sinon.
-- ----------------------------------------------------------------------------
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

      -- Pierre des Ancêtres / Larme de Renaissance (migration 0152/0169) :
      -- révèle les résurrections en attente juste avant de basculer vers le
      -- jour — après la suppression du chat nocturne (rien à cacher, c'est
      -- une annonce publique), avant que le jour ne commence réellement.
      -- Couvre aussi bien une mort de CETTE nuit qu'une mort par vote du
      -- jour précédent : cette bascule est la toute première occasion de
      -- "passer au jour suivant" pour les deux cas, sans distinction de
      -- cause à faire ici. Le message (et un éventuel reset de rôle) diffère
      -- selon l'artefact réellement utilisé pour CE joueur, retrouvé via
      -- game_artifact_uses.
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

-- ----------------------------------------------------------------------------
-- 5. Catalogue : insérée directement active — achetable immédiatement, sans
-- étape manuelle côté dashboard admin.
-- ----------------------------------------------------------------------------
insert into public.store_artifacts (
  key, name_fr, name_en, description_fr, description_en, price_coins, category, effect_key,
  max_stock, repurchase_cooldown_days, active
) values (
  'larme_renaissance',
  'Larme de Renaissance',
  'Tear of Rebirth',
  'Permet un retour en jeu au jour qui suit ton élimination — mais tu reviens en simple Villageois(e), ayant tout oublié de ton rôle d''origine. Une fois par partie.',
  'Allows you to come back to life on the day after your elimination — but you return as a plain Villager, having forgotten your original role entirely. Once per game.',
  90,
  'rares',
  'larme_renaissance',
  1,
  10,
  true
)
on conflict (key) do nothing;
