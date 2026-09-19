-- ============================================================================
-- Transfert volontaire de l'hôte (modérateur) du salon — demande
-- utilisateur : "si un modérateur est fatigué de modérer le jeu, il peut
-- choisir un joueur du salon pour que ce joueur devienne modérateur à son
-- tour ; l'ancien modérateur perd alors toutes ses fonctions."
--
-- Jusqu'ici, l'hôte ne changeait JAMAIS volontairement — seulement de façon
-- automatique quand l'ancien hôte quittait ou était exclu (voir
-- _remove_player, migration 0060). Cette migration ajoute le chemin
-- volontaire, réservé au salon d'attente (statut 'lobby') comme demandé —
-- une fois la partie lancée, transférer l'hôte n'a plus le même sens
-- (modération en cours de partie, cf. ModerationPanel réutilisé tel quel
-- dans GameRoom.tsx) et n'est donc pas proposé par l'interface pour cette
-- première version.
-- ============================================================================
create or replace function public.transfer_host(p_game_id uuid, p_new_host_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_new_host_name text;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Partie introuvable.';
  end if;
  if v_game.host_id <> v_user then
    raise exception 'Seul l''hôte peut transférer son rôle.';
  end if;
  if v_game.status <> 'lobby' then
    raise exception 'Le transfert d''hôte n''est possible que dans le salon d''attente.';
  end if;
  if p_new_host_id = v_user then
    raise exception 'Vous êtes déjà l''hôte.';
  end if;

  select display_name into v_new_host_name
  from public.game_players
  where game_id = p_game_id and user_id = p_new_host_id and not is_banned;
  if v_new_host_name is null then
    raise exception 'Ce joueur ne fait pas partie du salon.';
  end if;

  -- Un bot n'a pas de session réelle pour agir comme hôte — le transfert
  -- verrouillerait le salon (plus personne pour lancer la partie, modifier
  -- les réglages...) sans qu'aucun humain ne puisse s'en rendre compte
  -- avant d'être bloqué. Même heuristique que côté client (Lobby.tsx) :
  -- aucune colonne dédiée "is_bot", les bots sont identifiés par ce préfixe
  -- depuis leur introduction (migration 0127).
  if v_new_host_name like '🤖 %' then
    raise exception 'Impossible de transférer l''hôte à un bot.';
  end if;

  update public.game_players set is_host = false where game_id = p_game_id and user_id = v_user;
  update public.game_players set is_host = true where game_id = p_game_id and user_id = p_new_host_id;
  update public.games set host_id = p_new_host_id where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, v_new_host_name || ' est devenu(e) l''hôte du salon.');
end;
$$;

grant execute on function public.transfer_host(uuid, uuid) to authenticated;
