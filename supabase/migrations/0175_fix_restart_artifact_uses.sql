-- ============================================================================
-- Corrige deux effets de bord de "Recommencer la partie" (restart_game,
-- inchangée depuis la migration 0125 — signalés par l'utilisateur après un
-- test réel) :
--
--   1. restart_game réutilise le MÊME games.id pour la nouvelle manche
--      (jamais une nouvelle partie créée), mais n'effaçait jamais
--      game_artifact_uses (suivi "un artefact à stock utilisé une fois par
--      PARTIE" — Pierre des Ancêtres, Larme de Renaissance, Feu Sacré des
--      Ancêtres, Dernier Souffle...). Résultat : un joueur ayant utilisé un
--      tel artefact lors d'une manche ne pouvait plus jamais se le voir
--      proposer dans les manches suivantes du MÊME salon, même avec du
--      stock restant — kill_player le considérait comme "déjà utilisé cette
--      partie" pour toujours. Corrigé : game_artifact_uses est maintenant
--      vidée pour ce game_id à chaque restart, comme toutes les autres
--      tables "une fois par partie" déjà présentes dans cette fonction.
--      Complète aussi le nettoyage pour les colonnes ajoutées sur `games`
--      par des migrations postérieures à 0125 et jamais reportées ici :
--      balance_ange_pending/candidates (0152), revival_pending/
--      revival_pending_artifact_id (0172), plus game_players.pending_revival
--      (0152) — aucune décision en attente ne doit survivre au redémarrage.
--
--   2. Débogage séparé (voir aussi le commit Lobby.tsx associé) : la
--      composition de rôles de la manche précédente était en réalité déjà
--      conservée dans games.settings (restart_game n'y touche jamais), mais
--      l'écran de salon (Lobby.tsx) repartait quand même de DEFAULT_COUNTS à
--      chaque montage au lieu de la relire — corrigé côté client uniquement,
--      aucun changement SQL nécessaire pour ce point.
-- ============================================================================
set search_path = public;

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
  if v_game.host_id <> v_user then raise exception 'Seul l''hôte peut relancer une partie.'; end if;
  if v_game.status = 'lobby' then raise exception 'La partie n''a pas encore commencé.'; end if;

  delete from public.game_players where game_id = p_game_id and is_banned;

  delete from public.game_roles_secret where game_id = p_game_id;
  delete from public.night_actions where game_id = p_game_id;
  delete from public.votes where game_id = p_game_id;
  delete from public.vote_call_agreements where game_id = p_game_id;
  delete from public.vote_recap_ready where game_id = p_game_id;
  delete from public.day_reveal_ready where game_id = p_game_id;
  delete from public.chat_messages where game_id = p_game_id;
  delete from public.game_log where game_id = p_game_id;
  delete from public.alpha_infect_agreements where game_id = p_game_id;
  delete from public.anancy_swapped_players where game_id = p_game_id;
  delete from public.quest_game_sync where game_id = p_game_id;
  delete from public.reward_drops where game_id = p_game_id;
  -- Retour utilisateur (migration 0175) : ce restart réutilise le MÊME
  -- game_id (jamais une nouvelle partie créée), donc tout suivi "une fois
  -- par partie" scellé sur ce game_id doit être effacé explicitement ici
  -- pour redevenir utilisable dans la manche suivante avec le même groupe —
  -- game_artifact_uses (Pierre des Ancêtres/Larme de Renaissance/Feu Sacré
  -- des Ancêtres/Dernier Souffle...) n'avait jamais été ajoutée à cette
  -- liste depuis sa création (migration 0150, bien après le dernier
  -- passage sur restart_game en 0125) : un joueur ayant utilisé un artefact
  -- à stock lors d'une manche précédente ne pouvait plus jamais se le voir
  -- proposer dans ce même salon, même avec du stock restant.
  delete from public.game_artifact_uses where game_id = p_game_id;

  update public.game_players
  set is_alive = true, death_cause = null, died_at_night = null, is_lover = false, revealed_role = null,
      is_captain = false, is_ready = false, pending_revival = false
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
      day_vote_resolved = false,
      -- Ajoutés par des migrations postérieures à 0125 (balance_ange en
      -- 0152, revival_pending en 0172) et jamais reportés ici depuis —
      -- une décision en attente ne doit évidemment pas survivre au
      -- redémarrage d'une toute nouvelle manche.
      balance_ange_pending = null,
      balance_ange_candidates = null,
      revival_pending = null,
      revival_pending_artifact_id = null
  where id = p_game_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🔄 Une nouvelle partie va commencer avec le même groupe !');
end;
$$;