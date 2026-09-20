-- ============================================================================
-- CORRECTIF URGENT : la migration 0163 (renommage Juge → Chasseuse) a
-- renommé les colonnes de game_roles_secret et 3 fonctions dédiées, mais a
-- OUBLIÉ de recréer game_view_vote_fields — qui référençait encore la
-- colonne juge_pending_choice (renommée en chasseuse_pending_choice) et le
-- rôle 'juge' (renommé en 'chasseuse').
--
-- Conséquence : depuis le déploiement de 0163, CET APPEL SQL échoue à
-- chaque fois ("column juge_pending_choice does not exist"), et comme
-- get_my_game_view concatène cette fonction pour construire sa réponse,
-- CHAQUE appel à get_my_game_view échoue — pour absolument tous les
-- joueurs, dans toutes les parties, pas seulement celles utilisant la
-- Chasseuse. Côté client, useGame.ts ne vide jamais son état de chargement
-- sur une erreur RPC, d'où l'écran figé sur "chargement" signalé par
-- l'utilisateur, aussi bien en rejoignant une partie qu'en en poursuivant
-- une déjà en cours.
--
-- Correctif : recrée game_view_vote_fields à l'identique de sa dernière
-- version (0162), en remplaçant uniquement juge_pending_choice →
-- chasseuse_pending_choice, role = 'juge' → role = 'chasseuse', et
-- 'juge_choice' → 'chasseuse_choice' (déjà le nom attendu côté client,
-- voir ActionPanel.tsx/GameRoom.tsx depuis 0163).
-- ============================================================================
set search_path = public;

create or replace function public.game_view_vote_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text, p_my_alive boolean
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = p_game.night_number and voter_id = p_user
    ),

    'my_captain_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = 0 and voter_id = p_user
    ),

    'vote_call_agreed_ids', case when p_game.status = 'day_discussion' then coalesce((
      select jsonb_agg(user_id) from public.vote_call_agreements
      where game_id = p_game_id and day_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'day_reveal_ready_ids', case when p_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(user_id) from public.day_reveal_ready
      where game_id = p_game_id and round_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'night_recap', case when p_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message) order by created_at asc)
      from public.game_log
      where game_id = p_game_id and night_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'vote_recap', case when p_game.status = 'day_vote_recap' then jsonb_build_object(
      'votes', coalesce((
        select jsonb_agg(jsonb_build_object('voter_id', voter_id, 'target_id', target_id))
        from public.votes where game_id = p_game_id and round_number = p_game.night_number
      ), '[]'::jsonb),
      'ready_ids', coalesce((
        select jsonb_agg(user_id) from public.vote_recap_ready
        where game_id = p_game_id and round_number = p_game.night_number
      ), '[]'::jsonb),
      'captain_voter_id', p_game.last_vote_captain_id,
      'captain_random_notice', (
        select message from public.game_log
        where game_id = p_game_id and night_number = p_game.night_number and kind = 'captain_random'
        order by created_at desc limit 1
      ),
      'protected_by_feu_sacre', exists (
        select 1 from public.game_artifact_uses gau
        join public.store_artifacts sa on sa.id = gau.artifact_id
        where gau.game_id = p_game_id and sa.effect_key = 'feu_sacre_ancetres' and gau.round_number = p_game.night_number
      )
    ) else null end,

    -- 'chasseuse_choice' (migration 0162, colonnes/rôle renommés en 0163,
    -- corrigés ici) ajouté en tête, même priorité que hunter/
    -- captain_succession/balance_ange — tous vérifiés avant le reste.
    'pending_action_required', case
      when p_game.hunter_pending = p_user then 'hunter'
      when p_game.captain_pending = p_user then 'captain_succession'
      when p_game.balance_ange_pending = p_user then 'balance_ange'
      when exists (
        select 1 from public.game_roles_secret
        where game_id = p_game_id and user_id = p_user and role = 'chasseuse' and chasseuse_pending_choice
      ) then 'chasseuse_choice'
      when p_game.status = 'captain_election' and p_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = 0 and voter_id = p_user
        )
      then 'captain_vote'
      when p_game.status = 'night' and p_my_alive
        and (p_my_role = p_game.night_step or (p_my_role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and p_game.night_step = 'loup_garou'))
        and not exists (
          select 1 from public.night_actions
          where game_id = p_game_id and night_number = p_game.night_number
            and step = p_game.night_step and actor_id = p_user
        )
      then p_game.night_step
      when p_game.status = 'day_vote' and p_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = p_game.night_number and voter_id = p_user
        )
      then 'vote'
      else null
    end,

    'final_reveal', case when p_game.status = 'ended' then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', rs.user_id, 'role', rs.role))
      from public.game_roles_secret rs where rs.game_id = p_game_id
    ), '[]'::jsonb) else null end
  );
$$;
