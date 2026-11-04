-- 0258 — get_app_status() annonce aussi « serveur complet » (voir 0256), pour que l'accueil et la page Jouer affichent une
-- bannière AVANT que le joueur tente de créer ou rejoindre une partie. Aucune requête de plus côté client : cette fonction est déjà
-- lue au chargement de l'accueil (get_home_bootstrap, 0217) et par la page Jouer.
-- Retour en arrière : redéfinir la fonction de 0048 (un seul champ).
-- À appliquer APRÈS 0256. Rejouable sans risque.
set search_path = public;

create or replace function public.get_app_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'new_games_enabled', s.new_games_enabled,
    'server_full', coalesce((select sc.is_full from public.server_capacity sc where sc.id = 1), false)
  )
  from public.app_settings s
  where s.id = 1;
$$;

revoke execute on function public.get_app_status() from public;
grant execute on function public.get_app_status() to anon, authenticated;
