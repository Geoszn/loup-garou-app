-- Bug signalé par l'utilisateur : quand l'échange d'Anancy fait sortir un
-- joueur du camp des Loups (il redevient villageois ou autre chose), la
-- migration 0123 le rendait bien muet au chat/vocal du village, mais
-- JAMAIS empêché de voter (vote du jour) ni d'utiliser les pouvoirs de son
-- nouveau rôle (Voyante, Sorcière, Griot) pendant cette même fenêtre — il
-- pouvait donc toujours influencer le jeu, juste pas en discutant à voix
-- haute. Ce correctif étend le blocage à TOUTE interaction avec le jeu.
--
-- Deuxième correctif inclus, décidé avec l'utilisateur : la fenêtre de
-- blocage elle-même démarrait un cycle nuit+jour trop tard. L'échange
-- prend effet immédiatement (fin de résolution de la nuit où Anancy a agi,
-- voir migration 0138), mais village_muted_until_night restait fixé à
-- "nuit où Anancy a agi + 1" — donc le transfuge restait totalement libre
-- (chat compris) pendant tout le jour qui suivait IMMÉDIATEMENT l'échange,
-- et n'était bloqué qu'à partir du cycle SUIVANT. Corrigé pour démarrer le
-- blocage dès ce jour immédiat, jusqu'à la fin de la nuit qui le suit :
--   - village_muted_until_night stocke maintenant directement "la nuit où
--     l'échange a eu lieu" (p_night_number, plus de +1) ;
--   - la nouvelle fonction _is_village_muted() calcule le blocage sur DEUX
--     phases (au lieu d'une simple égalité de night_number) : le jour de
--     cette même nuit_number (statuts day_*), PUIS la nuit suivante
--     (night_number + 1, statut 'night') — exactement "le jour qui suit
--     immédiatement et la nuit qui suit immédiatement" l'échange.
--
-- Rôles au pouvoir "actif" que le transfuge pourrait hériter et qui
-- reviennent chaque nuit (donc potentiellement pendant sa nuit bloquée) :
-- Voyante, Sorcière, Griot. Cupidon, Enfant Sauvage et Voleur agissent
-- exclusivement nuit 1 (voir next_night_step, migration 0134) — Anancy
-- étant toujours la dernière étape d'une nuit, leur fenêtre est déjà
-- fermée avant même qu'un échange ne puisse prendre effet ; inutile de les
-- garder. La Petite Fille n'a plus d'étape de nuit du tout depuis la
-- migration 0032 (submit_petite_fille est du code mort). L'élection du
-- Capitaine (submit_captain_vote) n'a jamais lieu après la nuit 1, donc
-- jamais dans la fenêtre d'un transfuge — inutile aussi. Les votes/actions
-- réservés aux Loups (submit_wolf_vote, submit_grand_mechant_loup...) ne
-- sont plus accessibles au transfuge de toute façon, puisqu'il n'a plus un
-- rôle du camp des Loups après l'échange.
--
-- submit_vote exclut aussi désormais les joueurs muets du décompte qui
-- déclenche le passage anticipé à la phase suivante ("tout le monde a
-- voté") — sinon le vote du jour traînait systématiquement jusqu'au bout
-- du délai dès qu'un transfuge muet était en vie, même une fois tous les
-- autres joueurs vivants votés.

-- ----------------------------------------------------------------------------
-- 1. _is_village_muted : point unique de vérité pour "ce joueur est-il
-- actuellement bloqué suite à un échange d'Anancy qui l'a fait sortir du
-- camp des Loups ?" — réutilisé par le chat, get_my_game_view, le vote du
-- jour et les pouvoirs de nuit ci-dessous.
-- ----------------------------------------------------------------------------
create or replace function public._is_village_muted(p_game_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_muted_until int;
  v_night_number int;
  v_status text;
begin
  select village_muted_until_night into v_muted_until
  from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

  if v_muted_until is null then
    return false;
  end if;

  select night_number, status into v_night_number, v_status from public.games where id = p_game_id;

  return (v_night_number = v_muted_until and v_status in ('day_reveal', 'day_discussion', 'day_vote', 'day_vote_recap'))
      or (v_night_number = v_muted_until + 1 and v_status = 'night');
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. apply_anancy_swap : village_muted_until_night stocke désormais
-- directement la nuit où l'échange a eu lieu (plus de +1) — voir
-- l'explication en tête de fichier.
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
-- 3. send_chat_message (deux signatures) : passe par _is_village_muted()
-- au lieu de comparer directement à night_number.
-- ----------------------------------------------------------------------------
create or replace function public.send_chat_message(p_game_id uuid, p_channel text, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_status text;
  v_content text := trim(p_content);
  v_anonymous boolean;
  v_message_id uuid;
  v_blocked_words text[];
begin
  if v_content = '' then
    return;
  end if;
  if char_length(v_content) > 500 then
    v_content := left(v_content, 500);
  end if;

  if not public.can_access_channel(p_game_id, p_channel) then
    raise exception 'Ce salon n''est pas ouvert en ce moment.';
  end if;

  if p_channel = 'village' and public._is_village_muted(p_game_id, v_user) then
    raise exception 'Le destin vous a rendu muet au village jusqu''à la prochaine nuit.';
  end if;

  select blocked_words into v_blocked_words from public.games where id = p_game_id;
  if exists (
    select 1 from unnest(coalesce(v_blocked_words, '{}'::text[])) w
    where char_length(w) > 0 and position(lower(w) in lower(v_content)) > 0
  ) then
    raise exception 'Message refusé : il contient un mot bloqué par l''hôte.';
  end if;

  select status into v_status from public.games where id = p_game_id;
  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;
  v_name := coalesce(v_name, 'Joueur');

  v_anonymous := (p_channel = 'village' and v_status = 'night');

  if v_anonymous then
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous)
    values (p_game_id, p_channel, null, null, v_content, true)
    returning id into v_message_id;

    insert into public.chat_message_identities (message_id, game_id, user_id, display_name)
    values (v_message_id, p_game_id, v_user, v_name);
  else
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous)
    values (p_game_id, p_channel, v_user, v_name, v_content, false);
  end if;
end;
$$;

create or replace function public.send_chat_message(p_game_id uuid, p_channel text, p_content text, p_reply_to uuid DEFAULT NULL::uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_status text;
  v_content text := trim(p_content);
  v_anonymous boolean;
  v_message_id uuid;
  v_blocked_words text[];
  v_reply_to uuid := null;
begin
  if v_content = '' then
    return;
  end if;
  if char_length(v_content) > 500 then
    v_content := left(v_content, 500);
  end if;

  if not public.can_access_channel(p_game_id, p_channel) then
    raise exception 'Ce salon n''est pas ouvert en ce moment.';
  end if;

  if p_channel = 'village' and public._is_village_muted(p_game_id, v_user) then
    raise exception 'Le destin vous a rendu muet au village jusqu''à la prochaine nuit.';
  end if;

  if p_reply_to is not null then
    select id into v_reply_to from public.chat_messages
    where id = p_reply_to and game_id = p_game_id and channel = p_channel;
  end if;

  select blocked_words into v_blocked_words from public.games where id = p_game_id;
  if exists (
    select 1 from unnest(coalesce(v_blocked_words, '{}'::text[])) w
    where char_length(w) > 0 and position(lower(w) in lower(v_content)) > 0
  ) then
    raise exception 'Message refusé : il contient un mot bloqué par l''hôte.';
  end if;

  select status into v_status from public.games where id = p_game_id;
  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;
  v_name := coalesce(v_name, 'Joueur');

  v_anonymous := (p_channel = 'village' and v_status = 'night');

  if v_anonymous then
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous, reply_to_message_id)
    values (p_game_id, p_channel, null, null, v_content, true, v_reply_to)
    returning id into v_message_id;

    insert into public.chat_message_identities (message_id, game_id, user_id, display_name)
    values (v_message_id, p_game_id, v_user, v_name);
  else
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous, reply_to_message_id)
    values (p_game_id, p_channel, v_user, v_name, v_content, false, v_reply_to);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. submit_vote (vote du jour) : bloqué pendant la fenêtre du transfuge.
-- ----------------------------------------------------------------------------
create or replace function public.submit_vote(p_game_id uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive int;
  v_submitted int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'day_vote' then
    raise exception 'Le vote n’est pas ouvert.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Seuls les joueurs vivants peuvent voter.';
  end if;
  if public._is_village_muted(p_game_id, v_user) then
    raise exception 'Le destin vous a rendu muet : vous ne pouvez pas voter aujourd''hui.';
  end if;
  if p_target = v_user then
    raise exception 'Vous ne pouvez pas voter pour vous-même.';
  end if;
  if p_target is not null and not exists (
    select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive
  ) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.votes (game_id, round_number, voter_id, target_id)
  values (p_game_id, v_game.night_number, v_user, p_target)
  on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;

  -- Exclut les joueurs actuellement muets de ce décompte : un transfuge ne
  -- pouvant plus voter (voir plus haut), le compter dans v_alive ferait
  -- traîner le vote jusqu'à l'expiration du délai à chaque fois, même une
  -- fois tous les AUTRES joueurs vivants votés.
  select count(*) into v_alive from public.game_players gp
  where gp.game_id = p_game_id and gp.is_alive and not public._is_village_muted(p_game_id, gp.user_id);
  select count(distinct voter_id) into v_submitted from public.votes where game_id = p_game_id and round_number = v_game.night_number;

  if v_submitted >= v_alive then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 5. submit_voyante / submit_sorciere / submit_griot : bloqués pendant la
-- fenêtre du transfuge s'il en a hérité via l'échange d'Anancy.
-- ----------------------------------------------------------------------------
create or replace function public.submit_voyante(p_game_id uuid, p_target uuid)
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
  if not found or v_game.status <> 'night' or v_game.night_step <> 'voyante' then
    raise exception 'Ce n’est pas le moment pour la Voyante.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'voyante' then
    raise exception 'Vous n’êtes pas la Voyante.';
  end if;
  if public._is_village_muted(p_game_id, v_user) then
    raise exception 'Le destin vous a rendu muet : vous ne pouvez pas agir cette nuit.';
  end if;
  if p_target = v_user then
    raise exception 'Vous ne pouvez pas vous sonder vous-même.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'voyante', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🔮 La Voyante a sondé un joueur en secret.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

create or replace function public.submit_sorciere(p_game_id uuid, p_heal boolean, p_poison_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_heal_used boolean;
  v_poison_used boolean;
  v_wolf_target uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'sorciere' then
    raise exception 'Ce n’est pas le moment pour la Sorcière.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'sorciere' then
    raise exception 'Vous n’êtes pas la Sorcière.';
  end if;
  if public._is_village_muted(p_game_id, v_user) then
    raise exception 'Le destin vous a rendu muet : vous ne pouvez pas agir cette nuit.';
  end if;

  select heal_potion_used, poison_potion_used into v_heal_used, v_poison_used
  from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  if p_heal and v_heal_used then
    raise exception 'Vous avez déjà utilisé votre potion de guérison.';
  end if;
  if p_poison_target is not null and v_poison_used then
    raise exception 'Vous avez déjà utilisé votre potion d’empoisonnement.';
  end if;

  if p_heal then
    v_wolf_target := public.get_wolf_target(p_game_id, v_game.night_number);
    if v_wolf_target is null then
      raise exception 'Il n’y a personne à guérir cette nuit.';
    end if;
  end if;

  if p_poison_target is not null and not exists (
    select 1 from public.game_players where game_id = p_game_id and user_id = p_poison_target and is_alive
  ) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, extra)
  values (
    p_game_id, v_game.night_number, 'sorciere', v_user,
    jsonb_build_object('heal', coalesce(p_heal, false), 'poison_target', p_poison_target)
  )
  on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

  insert into public.game_log (game_id, message) values (p_game_id, '🧪 La Sorcière a fait son choix en secret.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

create or replace function public.submit_griot(p_game_id uuid, p_target uuid)
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
  if not found or v_game.status <> 'night' or v_game.night_step <> 'griot' then
    raise exception 'Ce n''est pas le moment pour le Griot.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'griot' then
    raise exception 'Vous n''êtes pas le Griot.';
  end if;
  if public._is_village_muted(p_game_id, v_user) then
    raise exception 'Le destin vous a rendu muet : vous ne pouvez pas agir cette nuit.';
  end if;
  if p_target = v_user then
    raise exception 'Vous ne pouvez pas vous observer vous-même.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'griot', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🎭 Le Griot a observé les traces d''un joueur en secret.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. get_my_game_view : 'village_muted' passe par _is_village_muted() au
-- lieu de comparer directement à night_number, cohérent avec le chat/vote/
-- actions ci-dessus. Changement minimal : seules les lignes touchant
-- village_muted_until_night changent, le reste (composition via les
-- fonctions game_view_*_fields, champs cosmétiques has_masque_griot/
-- plume_title_*...) reste identique à la version active (migration 0151).
-- ----------------------------------------------------------------------------
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
              where pa.user_id = gp.user_id and sa.effect_key = 'plume_anancy'
              limit 1
            ),
            'plume_title_en', (
              select sa.name_en from public.player_artifacts pa
              join public.store_artifacts sa on sa.id = pa.artifact_id
              where pa.user_id = gp.user_id and sa.effect_key = 'plume_anancy'
              limit 1
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
    || public.game_view_vote_fields(p_game_id, v_game, v_user, v_my_role, v_my_alive)
    || public.game_view_lobby_fields(p_game_id, v_game, v_user)
    || public.game_view_progression_fields(p_game_id, v_game, v_user, v_my_role, v_my_alive)
    || public.game_view_artifacts_fields(p_game_id, v_user)
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.submit_vote(uuid, uuid) to authenticated;
grant execute on function public.submit_voyante(uuid, uuid) to authenticated;
grant execute on function public.submit_sorciere(uuid, boolean, uuid) to authenticated;
grant execute on function public.submit_griot(uuid, uuid) to authenticated;
grant execute on function public.send_chat_message(uuid, text, text) to authenticated;
grant execute on function public.send_chat_message(uuid, text, text, uuid) to authenticated;
grant execute on function public.get_my_game_view(uuid) to authenticated;
