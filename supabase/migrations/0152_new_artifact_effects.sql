-- ============================================================================
-- Implémente les effets de 5 nouveaux artefacts du Loup Store (le 6e,
-- Flamme des Esprits, réutilise simplement effect_key = 'dernier_souffle' —
-- rien à coder). Aucun catalogue n'est inséré ici : l'admin crée lui-même
-- ces artefacts (nom, prix, image, catégorie) depuis le dashboard une fois
-- cette migration passée, en choisissant l'effet voulu dans le menu
-- déroulant désormais enrichi.
--
--   - Boussole du Village (effect_key = 'boussole_village') : historique
--     complet des votes de TOUS les jours passés de la partie, réservé au
--     propriétaire (jamais montré aux autres).
--   - Masque du Sans-Visage (effect_key = 'masque_sans_visage') : la Voyante
--     voit toujours "Villageois" en inspectant le propriétaire, quel que
--     soit son rôle réel — exactement la même protection déjà intégrée au
--     rôle Sans-Visage (migration 0098/0118), étendue ici à un artefact.
--   - Balance de l'Ange (effect_key = 'balance_ange') : en cas d'égalité au
--     vote du village, un vote décisif PERSONNEL pour le propriétaire (pas
--     une règle qui change pour tout le monde) — nouveau pending-action,
--     même patron que hunter_pending/captain_pending (games.balance_ange_pending,
--     ActionPanel côté client).
--   - Pierre des Ancêtres (effect_key = 'pierre_ancetres') : le propriétaire
--     revient en jeu au tout premier passage au jour qui suit son
--     élimination (quelle qu'en soit la cause, sauf exclusion par l'hôte) —
--     mort annoncée normalement, puis retour annoncé publiquement, jamais
--     secret. Une fois par partie.
--   - Feu Sacré des Ancêtres (effect_key = 'feu_sacre_ancetres') : bloque une
--     élimination par vote une fois par partie, annoncée anonymement (même
--     principe que la potion de guérison de la Sorcière) — personne ne
--     meurt ce jour-là à la place.
--
-- Chaque effet est une addition ISOLÉE à une fonction existante : chaque
-- fonction ci-dessous a été comparée diff par diff à sa version précédente
-- pour confirmer qu'aucun autre comportement n'a bougé (voir le processus de
-- vérification habituel de ce projet, sans base de données live disponible
-- ici pour rejouer une vraie partie).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Colonnes.
-- ----------------------------------------------------------------------------
alter table public.games add column if not exists balance_ange_pending uuid references public.profiles (id);
alter table public.games add column if not exists balance_ange_candidates uuid[];

alter table public.game_players add column if not exists pending_revival boolean not null default false;

-- round_number : seulement utile pour un effet qui doit savoir "utilisé
-- CETTE journée précise" (Feu Sacré des Ancêtres, pour sa notice privée) —
-- null pour les autres usages (Dernier Souffle, Balance de l'Ange, Pierre
-- des Ancêtres), qui n'ont besoin que du "déjà utilisé une fois cette
-- partie" déjà garanti par la clé primaire (game_id, user_id, artifact_id).
alter table public.game_artifact_uses add column if not exists round_number int;

alter table public.store_artifacts drop constraint if exists store_artifacts_effect_key_check;
alter table public.store_artifacts add constraint store_artifacts_effect_key_check
  check (effect_key in (
    'none', 'parchemin_griot', 'dernier_souffle', 'masque_griot', 'plume_anancy',
    'boussole_village', 'masque_sans_visage', 'balance_ange', 'pierre_ancetres', 'feu_sacre_ancetres'
  ));

-- ----------------------------------------------------------------------------
-- 2. admin_upsert_store_artifact : même signature (0151), la liste des
-- effets acceptés s'agrandit simplement.
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
    'boussole_village', 'masque_sans_visage', 'balance_ange', 'pierre_ancetres', 'feu_sacre_ancetres'
  ) then
    raise exception 'Effet invalide.';
  end if;

  if p_id is null then
    if p_key is null or p_key !~ '^[a-z0-9_]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, underscore uniquement).';
    end if;
    if exists (select 1 from public.store_artifacts where key = p_key) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.store_artifacts (key, name_fr, name_en, description_fr, description_en, price_coins, category, effect_key, active)
    values (p_key, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en), p_price_coins, p_category, p_effect_key, coalesce(p_active, true))
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_store_artifact', v_id::text, jsonb_build_object('key', p_key, 'name_fr', p_name_fr));
  else
    -- `key` n'est jamais modifié ici, quoi que le client envoie dans
    -- p_key — voir migration 0148/0149. `effect_key`, en revanche, reste
    -- librement modifiable : c'est justement le champ que ce menu déroulant
    -- sert à changer.
    update public.store_artifacts
    set name_fr = trim(p_name_fr),
        name_en = trim(p_name_en),
        description_fr = trim(p_description_fr),
        description_en = trim(p_description_en),
        price_coins = p_price_coins,
        category = p_category,
        effect_key = p_effect_key,
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

grant execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Masque du Sans-Visage : game_view_seer_griot_fields — une seule
-- expression CASE modifiée (le reste de la fonction est identique à 0142).
-- ----------------------------------------------------------------------------
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
          when rs.role in ('loup_garou', 'loup_alpha', 'grand_mechant_loup') then 'loup_garou'
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

-- ----------------------------------------------------------------------------
-- 4. Boussole du Village + Feu Sacré des Ancêtres (notice privée) :
-- game_view_artifacts_fields — deux champs ajoutés, signature inchangée
-- (0148).
-- ----------------------------------------------------------------------------
create or replace function public.game_view_artifacts_fields(p_game_id uuid, p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_owns_parchemin_griot', exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'parchemin_griot'
    ),

    'my_owns_dernier_souffle', exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'dernier_souffle'
    ),

    'my_dernier_souffle_used', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'dernier_souffle'
    ),

    'vote_history', case when exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'boussole_village'
    ) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'round_number', v.round_number, 'voter_id', v.voter_id, 'target_id', v.target_id
      ) order by v.round_number, v.voter_id)
      from public.votes v
      where v.game_id = p_game_id and v.round_number > 0
        and v.round_number < (select night_number from public.games where id = p_game_id)
        and v.target_id is not null
    ), '[]'::jsonb) else null end,

    'feu_sacre_saved_me', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'feu_sacre_ancetres'
        and gau.round_number = (select night_number from public.games where id = p_game_id)
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- 5. Balance de l'Ange (pending_action_required) + Feu Sacré des Ancêtres
-- (notice publique anonyme dans vote_recap) : game_view_vote_fields.
-- ----------------------------------------------------------------------------
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

    'pending_action_required', case
      when p_game.hunter_pending = p_user then 'hunter'
      when p_game.captain_pending = p_user then 'captain_succession'
      when p_game.balance_ange_pending = p_user then 'balance_ange'
      when p_game.status = 'captain_election' and p_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = 0 and voter_id = p_user
        )
      then 'captain_vote'
      when p_game.status = 'night' and p_my_alive
        and (p_my_role = p_game.night_step or (p_my_role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and p_game.night_step = 'loup_garou'))
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

    'final_reveal', case when p_game.status = 'ended' then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', rs.user_id, 'role', rs.role))
      from public.game_roles_secret rs where rs.game_id = p_game_id
    ), '[]'::jsonb) else null end
  );
$$;

-- ----------------------------------------------------------------------------
-- 6. Pierre des Ancêtres : kill_player — un bloc ajouté juste après
-- l'enregistrement normal de la mort, le reste de la fonction est identique
-- à 0077.
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

  -- Pierre des Ancêtres (migration 0152) : ni secret ni instantané — la mort
  -- ci-dessus vient d'être annoncée normalement, le retour ne le sera
  -- qu'au prochain passage au jour (voir advance_phase, boucle sur
  -- pending_revival). Exclu du bûcher/kick de l'hôte ('exclu' n'est de
  -- toute façon jamais une cause passée à kill_player). Une seule fois par
  -- partie (game_artifact_uses).
  if p_cause <> 'exclu' then
    select pa.artifact_id into v_pierre_artifact_id
    from public.player_artifacts pa
    join public.store_artifacts sa on sa.id = pa.artifact_id
    where pa.user_id = p_user_id and sa.effect_key = 'pierre_ancetres'
      and not exists (
        select 1 from public.game_artifact_uses gau
        where gau.game_id = p_game_id and gau.user_id = p_user_id and gau.artifact_id = pa.artifact_id
      )
    limit 1;

    if v_pierre_artifact_id is not null then
      update public.game_players set pending_revival = true
      where game_id = p_game_id and user_id = p_user_id;

      insert into public.game_artifact_uses (game_id, user_id, artifact_id)
      values (p_game_id, p_user_id, v_pierre_artifact_id);
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
-- 7. Balance de l'Ange (déclenchement) + Feu Sacré des Ancêtres (blocage) :
-- resolve_day_vote_deaths.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_day_vote_deaths(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round int;
  v_top record;
  v_tie_count int;
  v_captain_id uuid;
  v_tied_ids uuid[];
  v_balance_owner uuid;
  v_feu_sacre_artifact_id uuid;
begin
  select night_number into v_round from public.games where id = p_game_id;

  select gp.user_id into v_captain_id
  from public.game_players gp
  where gp.game_id = p_game_id and gp.is_alive and gp.is_captain
  limit 1;

  -- Capturé maintenant, pendant que c'est encore fiable : une fois
  -- kill_player appelée plus bas, une succession du Capitaine peut avoir
  -- lieu avant que le récap du vote ne soit affiché au client. Toujours
  -- utile pour l'affichage du récap (qui a voté en tant que Capitaine),
  -- même si son vote ne départage plus les égalités.
  update public.games set last_vote_captain_id = v_captain_id where id = p_game_id;

  select v.target_id, sum(case when v.voter_id = v_captain_id then 2 else 1 end) as votes
  into v_top
  from public.votes v
  where v.game_id = p_game_id and v.round_number = v_round and v.target_id is not null
  group by v.target_id
  order by votes desc
  limit 1;

  if v_top.target_id is null then
    insert into public.game_log (game_id, message)
    values (p_game_id, '🗳️ Aucun vote exprimé : personne n’est éliminé aujourd’hui.');
  else
    select count(*) into v_tie_count
    from (
      select v.target_id, sum(case when v.voter_id = v_captain_id then 2 else 1 end) as c
      from public.votes v
      where v.game_id = p_game_id and v.round_number = v_round and v.target_id is not null
      group by v.target_id
      having sum(case when v.voter_id = v_captain_id then 2 else 1 end) = v_top.votes
    ) t;

    if v_tie_count > 1 then
      -- Balance de l'Ange (migration 0152) : avant de conclure "personne
      -- n'est éliminé", cherche un joueur vivant qui possède cet artefact
      -- et ne l'a pas encore utilisé cette partie — il obtient alors un
      -- vote décisif personnel pour départager l'égalité (pending-action,
      -- voir advance_phase/submit_balance_ange_vote), au lieu de la
      -- résolution automatique habituelle.
      select array_agg(t.target_id) into v_tied_ids
      from (
        select v.target_id, sum(case when v.voter_id = v_captain_id then 2 else 1 end) as c
        from public.votes v
        where v.game_id = p_game_id and v.round_number = v_round and v.target_id is not null
        group by v.target_id
        having sum(case when v.voter_id = v_captain_id then 2 else 1 end) = v_top.votes
      ) t;

      select pa.user_id into v_balance_owner
      from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      join public.game_players gp on gp.user_id = pa.user_id and gp.game_id = p_game_id and gp.is_alive
      where sa.effect_key = 'balance_ange'
        and not exists (
          select 1 from public.game_artifact_uses gau
          where gau.game_id = p_game_id and gau.user_id = pa.user_id and gau.artifact_id = pa.artifact_id
        )
      order by gp.seat_number
      limit 1;

      if v_balance_owner is not null then
        update public.games
        set balance_ange_pending = v_balance_owner, balance_ange_candidates = v_tied_ids
        where id = p_game_id;
        insert into public.game_log (game_id, message)
        values (p_game_id, '⚖️ Égalité des voix : la Balance de l’Ange va départager le vote...');
      else
        insert into public.game_log (game_id, message)
        values (p_game_id, '🗳️ Égalité des voix : personne n’est éliminé aujourd’hui.');
      end if;
    else
      -- Feu Sacré des Ancêtres (migration 0152) : bloque cette élimination
      -- précise une fois par partie, annoncé de façon anonyme (même
      -- principe que la potion de guérison de la Sorcière, resolve_night_deaths)
      -- — personne ne meurt à la place.
      select pa.artifact_id into v_feu_sacre_artifact_id
      from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = v_top.target_id and sa.effect_key = 'feu_sacre_ancetres'
        and not exists (
          select 1 from public.game_artifact_uses gau
          where gau.game_id = p_game_id and gau.user_id = v_top.target_id and gau.artifact_id = pa.artifact_id
        )
      limit 1;

      if v_feu_sacre_artifact_id is not null then
        insert into public.game_artifact_uses (game_id, user_id, artifact_id, round_number)
        values (p_game_id, v_top.target_id, v_feu_sacre_artifact_id, v_round);

        insert into public.game_log (game_id, message)
        values (p_game_id, '🔥 Un feu sacré a protégé quelqu''un du bûcher aujourd''hui.');
      else
        perform public.kill_player(p_game_id, v_top.target_id, 'vote', v_round);
      end if;
    end if;
  end if;

  update public.games set day_vote_resolved = true where id = p_game_id;
end;
$$;

grant execute on function public.resolve_day_vote_deaths(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. submit_balance_ange_vote : nouvelle fonction, même patron que
-- submit_captain_succession (0018) / submit_hunter_shot (0005).
-- ----------------------------------------------------------------------------
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
  if not found or v_game.balance_ange_pending is distinct from v_user then
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

grant execute on function public.submit_balance_ange_vote(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. advance_phase : ajoute le "drain gate" balance_ange_pending (même
-- patron que hunter_pending/captain_pending, avec repli sur "personne
-- n'est éliminé" au bout du délai) et la boucle de résurrection Pierre des
-- Ancêtres juste avant le passage au jour. Reste identique à 0138 partout
-- ailleurs.
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

grant execute on function public.advance_phase(uuid, boolean) to authenticated;
