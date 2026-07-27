-- ============================================================================
-- get_invite_preview : donne juste assez d'infos (code, pseudo de l'hôte,
-- nombre de joueurs, statut) pour construire un aperçu de lien riche
-- (og:title/og:description) quand un lien d'invitation est partagé sur
-- WhatsApp/Telegram/etc. — voir middleware.ts, qui appelle cette fonction en
-- anonyme (le robot d'aperçu de ces applis n'est jamais connecté).
--
-- Volontairement SANS vérification auth.uid() ni appartenance à la partie :
-- le code de la partie est déjà la seule "clé" nécessaire pour rejoindre
-- (voir join_game) ou pour obtenir cet aperçu — l'aperçu ne révèle rien de
-- plus que ce que le lien lui-même sous-entend déjà. Aucune donnée
-- sensible (rôles, votes, chat...) n'est exposée ici.
-- ============================================================================
set search_path = public;

create or replace function public.get_invite_preview(p_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_host_name text;
  v_player_count int;
begin
  select * into v_game from public.games where code = upper(trim(p_code));
  if not found then
    return null;
  end if;

  select display_name into v_host_name
  from public.game_players where game_id = v_game.id and user_id = v_game.host_id;

  select count(*) into v_player_count from public.game_players where game_id = v_game.id;

  return jsonb_build_object(
    'code', v_game.code,
    'host_name', coalesce(v_host_name, 'Joueur'),
    'player_count', v_player_count,
    'status', v_game.status
  );
end;
$$;

-- Accessible sans connexion : le robot d'aperçu d'une appli de messagerie
-- n'a jamais de session Supabase.
grant execute on function public.get_invite_preview(text) to anon, authenticated;
