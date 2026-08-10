-- ============================================================================
-- Retour utilisateur : la carte "Demandes d'accès en attente" de la Vue
-- d'ensemble admin n'était pas cliquable, et pour cause — ces demandes
-- (game_join_requests, voir migration 0038) sont gérées individuellement par
-- l'HÔTE de chaque partie une fois revenu en salon (JoinRequestsPanel,
-- Lobby.tsx), il n'existait aucun écran admin pour seulement les CONSULTER,
-- toutes parties confondues.
--
-- Ce correctif ne donne pas à l'admin le pouvoir d'approuver/refuser à la
-- place de l'hôte (ça reste sa décision), mais lui permet de voir en un
-- coup d'œil QUELLE partie a des demandes en attente — utile par exemple
-- pour du support ("je n'arrive pas à rejoindre", "l'hôte n'a pas ouvert
-- l'appli depuis 3 jours"...).
--
-- admin_list_active_games (reprise intégrale de 0049_auto_close_inactive_games.sql)
-- ajoute pending_join_requests par partie. Côté client : StatsTab renvoie
-- maintenant vers l'onglet Parties (comme les autres cartes cliquables),
-- GamesTab affiche le compteur par partie s'il est non nul.
-- ============================================================================
set search_path = public;

create or replace function public.admin_list_active_games(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(g)) from (
      select
        gm.id,
        gm.code,
        gm.status,
        gm.is_public,
        gm.created_at,
        gm.last_activity_at,
        hp.display_name as host_name,
        (select count(*) from public.game_players gp2 where gp2.game_id = gm.id) as player_count,
        (select count(*) from public.game_join_requests jr where jr.game_id = gm.id and jr.status = 'pending') as pending_join_requests
      from public.games gm
      join public.game_players hp on hp.game_id = gm.id and hp.user_id = gm.host_id
      where gm.status <> 'ended'
      order by gm.created_at desc
      limit p_limit
    ) g
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_active_games(int) to authenticated;
