-- Bug signalé juste après le déploiement de la migration 0154 (capture
-- WhatsApp) : "duplicate key value violates unique constraint
-- game_join_requests_game_id_user_id_key" au lieu de l'écran d'attente.
--
-- Cause racine : join_game (et sa jumelle request_join_public_game, même
-- patron depuis la migration 0033/0038) lisaient d'abord la demande
-- existante ("select ... into v_existing_request"), puis décidaient
-- d'insérer ou de mettre à jour selon ce qu'elles avaient trouvé. Si deux
-- appels s'exécutent presque en même temps pour le même (game_id, user_id)
-- — double appel réseau, deux onglets, l'effet React qui se redéclenche
-- avant la fin du premier appel (session/profile dont la référence change
-- juste après le chargement, cf. AuthContext.tsx) — les deux peuvent lire
-- "aucune ligne" avant qu'aucun des deux n'ait eu le temps d'insérer : le
-- second INSERT échoue alors sur la contrainte unique. La migration 0154
-- rendait déjà le cas "demande déjà en attente" non bloquant, mais ne
-- touchait pas à cette course entre le SELECT et l'INSERT qui existait déjà
-- avant elle.
--
-- Correctif : un unique "insert ... on conflict (game_id, user_id) do
-- update" atomique remplace le couple select-puis-branchement dans les deux
-- fonctions — Postgres garantit qu'un seul des deux appels concurrents fait
-- l'insert, l'autre fait la mise à jour, aucun des deux ne peut plus jamais
-- lever cette violation de contrainte. Une demande déjà "pending" garde sa
-- date de création d'origine ; une demande refusée/acceptée d'une partie
-- précédente est réinitialisée en attente (created_at/responded_at
-- rafraîchis), exactement comme avant.

create or replace function public.join_game(p_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_existing uuid;
  v_player_count int;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_game from public.games where code = upper(trim(p_code));
  if not found then
    raise exception 'Aucune partie ne correspond à ce code.';
  end if;

  select id into v_existing from public.game_players where game_id = v_game.id and user_id = v_user;
  if v_existing is not null then
    -- Reconnexion à une partie où l'on est déjà engagé : toujours autorisée,
    -- même interrupteur coupé ou compte suspendu depuis (on ne coupe pas
    -- une partie en cours sous le pied de quelqu'un).
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    -- Nettoyage d'une éventuelle demande restée "pending" d'avant (ex :
    -- demandée pendant que la partie était en cours, puis la partie a été
    -- relancée / le joueur a été ajouté entretemps par un autre chemin) —
    -- sinon elle ressurgit indéfiniment côté hôte et fait planter
    -- respond_join_request sur la contrainte unique.
    update public.game_join_requests
    set status = 'accepted', responded_at = now()
    where game_id = v_game.id and user_id = v_user and status = 'pending';
    return jsonb_build_object('status', 'joined', 'game_id', v_game.id, 'code', v_game.code);
  end if;

  if exists (select 1 from public.profiles where id = v_user and is_banned) then
    raise exception 'Votre compte a été suspendu.';
  end if;

  if not (select new_games_enabled from public.app_settings where id = 1) then
    raise exception 'Impossible de rejoindre une nouvelle partie pour le moment.';
  end if;

  if v_game.status in ('lobby', 'ended') then
    perform public._add_player_to_game(v_game.id, v_user, p_display_name);
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    update public.game_join_requests
    set status = 'accepted', responded_at = now()
    where game_id = v_game.id and user_id = v_user and status = 'pending';
    return jsonb_build_object('status', 'joined', 'game_id', v_game.id, 'code', v_game.code);
  end if;

  select count(*) into v_player_count from public.game_players where game_id = v_game.id;
  if v_player_count >= 25 then
    raise exception 'Cette partie est complète (25 joueurs maximum).';
  end if;

  -- Upsert atomique : voir l'explication en tête de fichier.
  insert into public.game_join_requests (game_id, user_id, display_name, status)
  values (v_game.id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 'pending')
  on conflict (game_id, user_id) do update
  set display_name = excluded.display_name,
      status = 'pending',
      created_at = case when game_join_requests.status = 'pending' then game_join_requests.created_at else now() end,
      responded_at = case when game_join_requests.status = 'pending' then game_join_requests.responded_at else null end;

  return jsonb_build_object('status', 'pending', 'game_id', v_game.id, 'code', v_game.code);
end;
$$;

create or replace function public.request_join_public_game(p_game_id uuid, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_count int;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if exists (select 1 from public.profiles where id = v_user and is_banned) then
    raise exception 'Votre compte a été suspendu.';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found or not v_game.is_public or v_game.status = 'ended' then
    raise exception 'Cette partie n’accepte plus de nouvelles demandes.';
  end if;

  if exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous participez déjà à cette partie.';
  end if;

  if not (select new_games_enabled from public.app_settings where id = 1) then
    raise exception 'Impossible de rejoindre une nouvelle partie pour le moment.';
  end if;

  select count(*) into v_count from public.game_players where game_id = p_game_id;
  if v_game.status = 'lobby' and v_count >= 25 then
    raise exception 'Cette partie est complète (25 joueurs maximum).';
  end if;

  -- Même upsert atomique que join_game ci-dessus, même motif.
  insert into public.game_join_requests (game_id, user_id, display_name, status)
  values (p_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 'pending')
  on conflict (game_id, user_id) do update
  set display_name = excluded.display_name,
      status = 'pending',
      created_at = case when game_join_requests.status = 'pending' then game_join_requests.created_at else now() end,
      responded_at = case when game_join_requests.status = 'pending' then game_join_requests.responded_at else null end;

  return jsonb_build_object('status', 'pending');
end;
$$;

grant execute on function public.join_game(text, text) to authenticated;
grant execute on function public.request_join_public_game(uuid, text) to authenticated;
