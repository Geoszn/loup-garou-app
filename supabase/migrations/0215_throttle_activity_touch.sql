-- 0215 — Un message de chat ne doit plus faire relire toute la partie à tous les joueurs.
--
-- touch_game_activity (0049) met à jour games.last_activity_at à CHAQUE message
-- de chat, ligne du journal et arrivée de joueur. Chacune de ces mises à jour est
-- un évènement Realtime « games » (UPDATE) auquel TOUS les joueurs de la partie
-- sont abonnés (voir useGame.ts) : ils rappellent tous get_my_game_view, l'appel
-- le plus coûteux de l'appli (mesuré le 2026-10-06 : 102 000 appels à ~200 ms,
-- soit plus de 5 h de temps base). Un seul message dans une partie de 12 joueurs
-- = 12 relectures complètes, alors que la vue ne contient même pas le chat.
--
-- last_activity_at ne sert qu'à fermer une partie après 2 h d'inactivité : une
-- précision d'une minute suffit largement. Pour le chat, le journal et les
-- arrivées de joueurs, on ne met donc à jour que si la dernière marque a plus
-- d'une minute. Les lignes de journal et de joueurs déclenchent déjà leur
-- PROPRE évènement Realtime (abonnements game_log / game_players), et le chat
-- n'a besoin d'aucune relecture : rien n'est perdu côté affichage.
--
-- Les votes et les actions de nuit gardent l'ancien déclencheur immédiat : ces
-- tables ne sont pas dans la publication Realtime, et la mise à jour de games
-- est aujourd'hui le seul signal qui avertit les autres joueurs (ex. les loups
-- qui voient le vote de leurs coéquipiers). Comportement inchangé pour eux.
set search_path = public;

create or replace function public.touch_game_activity_throttled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.games
  set last_activity_at = now()
  where id = coalesce(new.game_id, old.game_id)
    and last_activity_at < now() - interval '1 minute';
  return new;
end;
$$;

drop trigger if exists trg_touch_activity_chat_messages on public.chat_messages;
create trigger trg_touch_activity_chat_messages
  after insert on public.chat_messages
  for each row execute function public.touch_game_activity_throttled();

drop trigger if exists trg_touch_activity_game_log on public.game_log;
create trigger trg_touch_activity_game_log
  after insert on public.game_log
  for each row execute function public.touch_game_activity_throttled();

drop trigger if exists trg_touch_activity_game_players on public.game_players;
create trigger trg_touch_activity_game_players
  after insert on public.game_players
  for each row execute function public.touch_game_activity_throttled();

-- Fonction de déclencheur interne (voir 0184) : jamais appelable depuis un client.
revoke execute on function public.touch_game_activity_throttled() from public, anon, authenticated;
