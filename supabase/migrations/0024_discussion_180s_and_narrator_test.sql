-- ----------------------------------------------------------------------------
-- 0024_discussion_180s_and_narrator_test
--
-- 1) Bug réel trouvé : advance_phase (0021) utilise bien 180s par défaut pour
--    discussion_seconds si la clé est absente des réglages de la partie...
--    mais create_game (dernière version dans 0018_captain.sql, elle-même
--    reprise de 0014_account.sql) écrit TOUJOURS 90 en dur dans
--    games.settings à la création. La clé n'est donc jamais absente, et le
--    filet de sécurité à 180s de advance_phase ne se déclenche jamais — d'où
--    le débat resté à ~90s en pratique malgré l'intention de 3 minutes déjà
--    documentée dans RulesPanel. On corrige la vraie source : create_game.
--
-- 2) Prépare aussi le terrain pour le bouton "Tester le narrateur" côté
--    frontend (api/narrator-voice.ts, gameId devient optionnel) — rien à
--    changer côté SQL pour ça, is_game_participant reste utilisée uniquement
--    quand un gameId est fourni.
-- ----------------------------------------------------------------------------
create or replace function public.create_game(p_display_name text, p_settings jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_game_id uuid;
  v_settings jsonb;
  v_icon text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select avatar_icon into v_icon from public.profiles where id = v_user;

  v_code := public.generate_game_code();
  v_settings := jsonb_build_object(
    'discussion_seconds', coalesce((p_settings->>'discussion_seconds')::int, 180),
    'vote_seconds', coalesce((p_settings->>'vote_seconds')::int, 45),
    'night_step_seconds', coalesce((p_settings->>'night_step_seconds')::int, 40),
    'role_reveal_seconds', coalesce((p_settings->>'role_reveal_seconds')::int, 15),
    'role_counts', p_settings->'role_counts'
  );

  insert into public.games (code, host_id, settings)
  values (v_code, v_user, v_settings)
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 1, true, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game_id, 'La partie a été créée. En attente des joueurs...');

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;
