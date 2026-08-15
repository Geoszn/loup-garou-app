-- ============================================================================
-- Demande utilisateur : "Quand il n'y a aucun capitaine dans le jeu donne la
-- possibilité au modérateur de faire passer le jeu au vote quand tous les
-- autres joueurs sont d'accord."
--
-- Le mécanisme existe déjà pour le Capitaine (submit_captain_call_vote,
-- vote_call_agreements, voir CallVotePanel côté client) mais CallVotePanel
-- se masque entièrement dès que le rôle Capitaine est désactivé pour la
-- partie (view.game.settings.role_counts?.capitaine) — dans ce cas, plus
-- personne ne peut jamais écourter le débat, il faut toujours attendre la
-- fin du chrono.
--
-- submit_host_call_vote : même mécanique (tous les AUTRES joueurs vivants
-- doivent s'être déclarés d'accord via submit_vote_call_agreement, déjà en
-- place et inchangée), mais l'acteur est l'hôte du salon (games.host_id) au
-- lieu du Capitaine, et seulement quand le rôle Capitaine est désactivé pour
-- cette partie — pour ne jamais ouvrir deux chemins concurrents de lancement
-- du vote dans une même partie.
-- ============================================================================
set search_path = public;

create or replace function public.submit_host_call_vote(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive_count int;
  v_agreed_count int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'day_discussion' then
    raise exception 'Le débat n’est pas en cours.';
  end if;
  if coalesce((v_game.settings->'role_counts'->>'capitaine')::boolean, false) then
    raise exception 'Cette partie a un Capitaine : c’est à lui de lancer le vote.';
  end if;
  if v_game.host_id <> v_user then
    raise exception 'Seul le modérateur peut lancer le vote.';
  end if;

  select count(*) into v_alive_count
  from public.game_players
  where game_id = p_game_id and is_alive and user_id <> v_game.host_id;
  select count(*) into v_agreed_count
  from public.vote_call_agreements
  where game_id = p_game_id and day_number = v_game.night_number;

  if v_agreed_count < v_alive_count then
    raise exception 'Tout le village doit être d’accord avant de lancer le vote.';
  end if;

  insert into public.game_log (game_id, message)
  select p_game_id, '🛠️ ' || gp.display_name || ' (Modérateur) lance le vote, avec l’accord de tout le village !'
  from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_user;

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_host_call_vote(uuid) to authenticated;
