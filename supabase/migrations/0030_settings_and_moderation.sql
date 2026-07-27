-- ============================================================================
-- Deux ajouts demandés :
--
--   1. Réglage des durées de phase par l'hôte, au même endroit que le choix
--      des rôles (salon d'attente, avant que la partie démarre) :
--      update_game_settings passe d'un simple merge sans contrôle à une
--      liste blanche de clés connues, chacune bornée à une plage
--      raisonnable — elle est maintenant appelée depuis un vrai formulaire,
--      pas seulement en interne, donc elle doit se protéger elle-même contre
--      des valeurs absurdes (0s, valeurs négatives, etc.) plutôt que de
--      confier cette responsabilité uniquement au client.
--
--   2. L'hôte devient modérateur de sa partie, à tout moment (salon comme
--      partie en cours) :
--        - kick_player : retire un joueur. Dans le salon, retrait complet
--          (comme s'il n'était jamais venu). En partie, même traitement
--          qu'un abandon volontaire (leave_game) SAUF qu'on marque en plus
--          is_banned = true, qui lui coupe tout accès au chat (y compris le
--          cimetière, pour empêcher un joueur expulsé pour comportement
--          toxique de continuer à sévir côté fantômes).
--        - set_blocked_words : liste de mots interdits dans le chat, gérée
--          par l'hôte, appliquée par send_chat_message quel que soit le
--          salon.
--      leave_game et kick_player partagent maintenant la même logique via
--      un helper interne _remove_player(game_id, user_id, kicked), pour ne
--      pas dupliquer la gestion (transfert d'hôte, suppression de la partie
--      si elle se vide, etc.) entre les deux cas.
-- ============================================================================
set search_path = public;

alter table public.game_players add column if not exists is_banned boolean not null default false;
alter table public.games add column if not exists blocked_words text[] not null default '{}'::text[];

-- ----------------------------------------------------------------------------
-- update_game_settings : reprise avec liste blanche + bornes par champ, au
-- lieu d'un merge aveugle de tout p_settings dans games.settings.
-- ----------------------------------------------------------------------------
create or replace function public.update_game_settings(p_game_id uuid, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_clamped jsonb := '{}'::jsonb;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut modifier les réglages.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  if p_settings ? 'role_counts' then
    v_clamped := v_clamped || jsonb_build_object('role_counts', p_settings->'role_counts');
  end if;
  if p_settings ? 'role_reveal_intro_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'role_reveal_intro_seconds', greatest(15, least(180, (p_settings->>'role_reveal_intro_seconds')::int))
    );
  end if;
  if p_settings ? 'discussion_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'discussion_seconds', greatest(30, least(900, (p_settings->>'discussion_seconds')::int))
    );
  end if;
  if p_settings ? 'vote_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'vote_seconds', greatest(15, least(180, (p_settings->>'vote_seconds')::int))
    );
  end if;
  if p_settings ? 'vote_recap_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'vote_recap_seconds', greatest(10, least(180, (p_settings->>'vote_recap_seconds')::int))
    );
  end if;
  if p_settings ? 'night_step_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'night_step_seconds', greatest(20, least(180, (p_settings->>'night_step_seconds')::int))
    );
  end if;
  if p_settings ? 'wolf_chat_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'wolf_chat_seconds', greatest(30, least(300, (p_settings->>'wolf_chat_seconds')::int))
    );
  end if;

  update public.games set settings = v_game.settings || v_clamped where id = p_game_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- _remove_player : logique commune à un départ volontaire (leave_game) et à
-- une exclusion par l'hôte (kick_player). p_kicked pilote uniquement le
-- message de journal et le marquage is_banned — tout le reste (salon vs
-- partie en cours, transfert d'hôte, suppression de la partie si elle se
-- vide) est identique aux deux cas.
-- ----------------------------------------------------------------------------
create or replace function public._remove_player(p_game_id uuid, p_user_id uuid, p_kicked boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_name text;
  v_was_host boolean;
  v_next_host uuid;
  v_verb text;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then return; end if;

  select display_name, is_host into v_name, v_was_host
  from public.game_players where game_id = p_game_id and user_id = p_user_id;

  if v_name is null then return; end if;

  if v_game.status in ('lobby', 'ended') then
    delete from public.game_players where game_id = p_game_id and user_id = p_user_id;
    delete from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if v_was_host then
      select user_id into v_next_host from public.game_players
      where game_id = p_game_id order by seat_number asc limit 1;
      if v_next_host is not null then
        update public.game_players set is_host = true where game_id = p_game_id and user_id = v_next_host;
        update public.games set host_id = v_next_host where id = p_game_id;
      end if;
    end if;

    if not exists (select 1 from public.game_players where game_id = p_game_id) then
      delete from public.games where id = p_game_id;
      return;
    end if;

    v_verb := case when p_kicked then ' a été retiré(e) du salon par l’hôte.' else ' a quitté le salon.' end;
    insert into public.game_log (game_id, message) values (p_game_id, v_name || v_verb);
  else
    -- Le "or p_kicked" permet de bannir un joueur déjà mort (fantôme) : sans
    -- ça, la clause `is_alive` empêcherait la mise à jour puisqu'il est déjà
    -- à false, et is_banned ne serait jamais posé sur lui.
    update public.game_players
    set is_alive = false,
        death_cause = case when p_kicked then 'exclu' else 'parti' end,
        is_banned = is_banned or p_kicked
    where game_id = p_game_id and user_id = p_user_id and (is_alive or p_kicked);

    if v_was_host then
      select user_id into v_next_host from public.game_players
      where game_id = p_game_id and user_id <> p_user_id order by seat_number asc limit 1;
      if v_next_host is not null then
        update public.game_players set is_host = false where game_id = p_game_id and user_id = p_user_id;
        update public.game_players set is_host = true where game_id = p_game_id and user_id = v_next_host;
        update public.games set host_id = v_next_host where id = p_game_id;
      end if;
    end if;

    v_verb := case when p_kicked then ' a été exclu(e) de la partie par l’hôte.' else ' a quitté la partie en cours de jeu.' end;
    insert into public.game_log (game_id, message) values (p_game_id, v_name || v_verb);
    perform public.check_and_apply_win(p_game_id);
  end if;
end;
$$;

create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._remove_player(p_game_id, auth.uid(), false);
end;
$$;

-- ----------------------------------------------------------------------------
-- kick_player : l'hôte retire un autre joueur. Voir _remove_player pour le
-- comportement exact selon le statut de la partie.
-- ----------------------------------------------------------------------------
create or replace function public.kick_player(p_game_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  select host_id into v_host from public.games where id = p_game_id;
  if v_host is null then raise exception 'Partie introuvable.'; end if;
  if v_host <> auth.uid() then raise exception 'Seul l’hôte peut retirer un joueur.'; end if;
  if p_target_user_id = auth.uid() then raise exception 'Vous ne pouvez pas vous retirer vous-même.'; end if;

  perform public._remove_player(p_game_id, p_target_user_id, true);
end;
$$;

grant execute on function public.kick_player(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- set_blocked_words : l'hôte définit la liste des mots interdits dans le
-- chat de sa partie (normalisée : minuscules, sans espaces superflus, sans
-- doublons ni entrées vides, 50 mots maximum).
-- ----------------------------------------------------------------------------
create or replace function public.set_blocked_words(p_game_id uuid, p_words text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_clean text[];
begin
  select host_id into v_host from public.games where id = p_game_id;
  if v_host is null then raise exception 'Partie introuvable.'; end if;
  if v_host <> auth.uid() then raise exception 'Seul l’hôte peut gérer la liste de mots bloqués.'; end if;

  select coalesce(array_agg(distinct t.w), '{}'::text[]) into v_clean
  from (select lower(trim(word)) as w from unnest(p_words) as word) t
  where char_length(t.w) > 0 and char_length(t.w) <= 40;

  if coalesce(array_length(v_clean, 1), 0) > 50 then
    raise exception 'Trop de mots bloqués (50 maximum).';
  end if;

  update public.games set blocked_words = v_clean where id = p_game_id;
end;
$$;

grant execute on function public.set_blocked_words(uuid, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- can_access_channel / can_read_channel : reprises pour refuser tout accès
-- (lecture ET écriture, tous salons) à un joueur banni.
-- ----------------------------------------------------------------------------
create or replace function public.can_access_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status text;
  v_night_step text;
  v_alive boolean;
  v_banned boolean;
  v_role text;
begin
  select status, night_step into v_status, v_night_step from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if; -- pas participant de cette partie
  if v_banned then return false; end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    return v_alive and v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' or v_night_step <> 'loup_garou' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role = 'loup_garou';
  end if;

  return false;
end;
$$;

grant execute on function public.can_access_channel(uuid, text) to authenticated;

create or replace function public.can_read_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status text;
  v_night_step text;
  v_alive boolean;
  v_banned boolean;
  v_role text;
begin
  select status, night_step into v_status, v_night_step from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if; -- pas participant de cette partie
  if v_banned then return false; end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    if v_alive then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
    else
      -- fantôme : lecture seule, à tout moment, pour suivre la partie.
      return true;
    end if;
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' or v_night_step <> 'loup_garou' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role = 'loup_garou';
  end if;

  return false;
end;
$$;

grant execute on function public.can_read_channel(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- send_chat_message : reprise pour refuser un message contenant un mot de
-- la liste de l'hôte (recherche insensible à la casse, sous-chaîne simple —
-- volontairement basique, quitte à avoir quelques faux positifs, plutôt que
-- de laisser passer des variantes évidentes).
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

  select blocked_words into v_blocked_words from public.games where id = p_game_id;
  if exists (
    select 1 from unnest(coalesce(v_blocked_words, '{}'::text[])) w
    where char_length(w) > 0 and position(lower(w) in lower(v_content)) > 0
  ) then
    raise exception 'Message refusé : il contient un mot bloqué par l’hôte.';
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

-- ----------------------------------------------------------------------------
-- restart_game : reprise pour exclure définitivement les joueurs bannis au
-- lieu de les ressusciter avec tout le monde — l'hôte les a écartés pour une
-- raison, relancer la partie ne doit pas les réintégrer.
-- ----------------------------------------------------------------------------
create or replace function public.restart_game(p_game_id uuid)
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
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut relancer une partie.'; end if;
  if v_game.status <> 'ended' then raise exception 'La partie n’est pas terminée.'; end if;

  delete from public.game_players where game_id = p_game_id and is_banned;

  delete from public.game_roles_secret where game_id = p_game_id;
  delete from public.night_actions where game_id = p_game_id;
  delete from public.votes where game_id = p_game_id;
  delete from public.vote_call_agreements where game_id = p_game_id;
  delete from public.vote_recap_ready where game_id = p_game_id;
  delete from public.chat_messages where game_id = p_game_id;
  delete from public.game_log where game_id = p_game_id;

  update public.game_players
  set is_alive = true, death_cause = null, died_at_night = null, is_lover = false, revealed_role = null,
      is_captain = false, is_ready = false
  where game_id = p_game_id;

  update public.games
  set status = 'lobby',
      night_number = 0,
      night_step = null,
      phase_deadline = null,
      winner_team = null,
      hunter_pending = null,
      hunter_context = null,
      captain_pending = null,
      last_vote_captain_id = null,
      night_deaths_resolved = false,
      day_vote_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🔄 Une nouvelle partie va commencer avec le même groupe !');
end;
$$;
