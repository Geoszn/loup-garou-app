-- ============================================================================
-- get_player_public_profile : fiche joueur affichée dans une pop-up quand on
-- clique sur un autre joueur du salon d'attente (voir Lobby.tsx +
-- src/components/PlayerProfileModal.tsx). Réutilise exactement les mêmes
-- colonnes déjà considérées publiques pour le classement
-- (get_public_leaderboard, migration 0057) — rien de nouveau n'est exposé,
-- juste pour UN joueur précis plutôt que le top N, et sans le seuil de 3
-- parties minimum (une fiche perso doit rester consultable même pour un
-- joueur tout juste inscrit).
--
-- friend_status donne aussi à l'appelant où en est la relation avec ce
-- joueur (self/friends/pending_sent/pending_received/none), pour que la
-- pop-up propose le bon bouton (Ajouter en ami / Accepter / rien) plutôt que
-- de risquer une erreur "demande déjà envoyée" en tentant d'en renvoyer une.
-- request_id n'est renseigné que pour pending_received (seul cas où le
-- client en a besoin, pour appeler respond_friend_request).
-- ============================================================================
set search_path = public;

create or replace function public.get_player_public_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user uuid := auth.uid();
  v_profile record;
  v_request public.friend_requests%rowtype;
  v_friend_status text;
  v_request_id uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_user_id is null then
    raise exception 'Requête invalide.';
  end if;

  select id, username, avatar_icon, continent, rank_points, current_streak, best_streak, rank_wins, rank_games_played
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Ce compte est introuvable.';
  end if;

  if p_user_id = v_user then
    v_friend_status := 'self';
  else
    select * into v_request from public.friend_requests
    where least(requester_id, addressee_id) = least(v_user, p_user_id)
      and greatest(requester_id, addressee_id) = greatest(v_user, p_user_id);

    if not found then
      v_friend_status := 'none';
    elsif v_request.status = 'accepted' then
      v_friend_status := 'friends';
    elsif v_request.requester_id = v_user then
      v_friend_status := 'pending_sent';
    else
      v_friend_status := 'pending_received';
      v_request_id := v_request.id;
    end if;
  end if;

  return jsonb_build_object(
    'user_id', v_profile.id,
    'username', v_profile.username,
    'avatar_icon', v_profile.avatar_icon,
    'continent', v_profile.continent,
    'rank_points', v_profile.rank_points,
    'tier', public.rank_tier_for_points(v_profile.rank_points),
    'current_streak', v_profile.current_streak,
    'best_streak', v_profile.best_streak,
    'rank_wins', v_profile.rank_wins,
    'rank_games_played', v_profile.rank_games_played,
    'friend_status', v_friend_status,
    'request_id', v_request_id
  );
end;
$$;

grant execute on function public.get_player_public_profile(uuid) to authenticated;
