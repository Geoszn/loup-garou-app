-- Bug UX signalé par un joueur (capture WhatsApp) : en cliquant plusieurs
-- fois sur le même lien d'invitation pendant que sa demande était encore en
-- attente (partie déjà en cours, cf. migration 0038), join_game renvoyait
-- une ERREUR ("Votre demande est déjà en attente de réponse.") — un vrai
-- cul-de-sac pour le joueur : JoinByLink.tsx affiche alors une carte
-- d'erreur sans aucun bouton, alors que la première fois exactement la même
-- situation (demande créée) l'envoyait normalement vers l'écran d'attente
-- (/attente/:gameId), avec un bouton "Suivre la partie" et un bouton
-- "Annuler ma demande" (voir PendingApproval.tsx).
--
-- Correctif : retenter de rejoindre une partie pour laquelle on a déjà une
-- demande en attente doit se comporter EXACTEMENT comme la première fois —
-- renvoyer {status: 'pending', game_id, code} pour que JoinByLink.tsx
-- renvoie vers l'écran d'attente, jamais une exception. Même philosophie
-- d'idempotence que la branche "déjà membre" juste au-dessus dans cette
-- même fonction (migration 0101) : rejoindre une partie où l'on est déjà
-- engagé, d'une façon ou d'une autre, ne doit jamais être une erreur.
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
  v_existing_request public.game_join_requests%rowtype;
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

  select * into v_existing_request from public.game_join_requests where game_id = v_game.id and user_id = v_user;

  if found and v_existing_request.status = 'pending' then
    -- Avant : `raise exception` ici — cul-de-sac pour un joueur qui reclique
    -- le lien pendant qu'il attend encore la réponse de l'hôte. Une demande
    -- déjà en attente n'est pas une erreur : on renvoie le même statut que
    -- si elle venait d'être créée, pour que JoinByLink.tsx renvoie vers
    -- l'écran d'attente comme la première fois.
    return jsonb_build_object('status', 'pending', 'game_id', v_game.id, 'code', v_game.code);
  end if;

  if found then
    update public.game_join_requests
    set status = 'pending',
        display_name = coalesce(nullif(trim(p_display_name), ''), 'Joueur'),
        created_at = now(),
        responded_at = null
    where id = v_existing_request.id;
  else
    insert into public.game_join_requests (game_id, user_id, display_name)
    values (v_game.id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'));
  end if;

  return jsonb_build_object('status', 'pending', 'game_id', v_game.id, 'code', v_game.code);
end;
$$;

grant execute on function public.join_game(text, text) to authenticated;
