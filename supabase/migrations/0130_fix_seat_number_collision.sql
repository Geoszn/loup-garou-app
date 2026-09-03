-- ============================================================================
-- Corrige _add_player_to_game : le numéro de siège attribué à un nouvel
-- arrivant était `count(*) + 1` (nombre de lignes actuellement dans
-- game_players), pas `max(seat_number) + 1`. Si un joueur quitte le salon
-- avant le lancement de la partie (sa ligne est supprimée), le compteur
-- baisse — le prochain arrivant peut alors se voir attribuer un
-- seat_number déjà utilisé par un joueur toujours présent, les deux
-- pouvant rester simultanément vivants en cours de partie.
--
-- Repéré en enquêtant sur un signalement "un joueur n'apparaît pas dans la
-- liste des votes" (partie URPVNC) : deux paires de joueurs partageaient
-- effectivement le même siège (7 et 8), les deux membres de la paire seat=7
-- étant vivants en même temps pendant plusieurs manches. La revue du code
-- client (PlayerGrid.tsx, ActionPanel.tsx) n'a montré aucun endroit où
-- seat_number sert de clé React ou de position d'affichage — chaque joueur
-- y est rendu par sa propre ligne (id unique), donc ce doublon ne semble
-- pas expliquer la disparition observée. Corrigé quand même : c'est une
-- incohérence de données réelle (deux joueurs "au même siège"), qui peut
-- perturber n'importe quel futur usage de seat_number (dashboard admin,
-- tri, affichage en cercle...) même si l'origine exacte du signalement
-- reste incertaine.
-- ============================================================================
set search_path = public;

create or replace function public._add_player_to_game(p_game_id uuid, p_user_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_seat int;
  v_icon text;
begin
  if exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_user_id) then
    return;
  end if;

  select count(*) into v_count from public.game_players where game_id = p_game_id;
  if v_count >= 25 then
    raise exception 'Cette partie est complète (25 joueurs maximum).';
  end if;

  -- max(seat_number) + 1 plutôt que count(*) + 1 : monotone même si un
  -- joueur a quitté le salon entretemps (sa ligne supprimée fait baisser le
  -- compte de lignes, mais jamais le plus grand siège déjà distribué) —
  -- voir commentaire d'en-tête de cette migration.
  select coalesce(max(seat_number), 0) + 1 into v_seat from public.game_players where game_id = p_game_id;
  select avatar_icon into v_icon from public.profiles where id = p_user_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (p_game_id, p_user_id, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), v_seat, false, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (p_game_id, coalesce(nullif(trim(p_display_name), ''), 'Un joueur') || ' a rejoint la partie.');
end;
$$;
