-- ----------------------------------------------------------------------------
-- get_my_active_game : renvoie la partie en cours (non terminée) à laquelle
-- l'utilisateur participe encore, s'il y en a une — pour le petit rappel
-- "Partie en cours" du tableau de bord (voir Dashboard.tsx). Utile quand un
-- joueur revient à l'accueil via le bouton 🏠 pendant une partie (navigation
-- simple, ne quitte pas la partie — voir PhaseBanner.tsx) : sans ça, il
-- devait retrouver le code de tête ou dans ses messages pour y revenir.
-- Ignore les parties où le joueur a été exclu (is_banned) : il n'y a plus
-- accès de toute façon. S'il participe à plusieurs parties actives en même
-- temps (rare), on ne renvoie que la plus récente.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_active_game()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object('code', g.code, 'status', g.status)
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  where gp.user_id = auth.uid()
    and not gp.is_banned
    and g.status <> 'ended'
  order by g.created_at desc
  limit 1
$$;

grant execute on function public.get_my_active_game() to authenticated;
