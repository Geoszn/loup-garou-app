-- ============================================================================
-- Ajoute target_user_id à la réponse de send_friend_request (0016), pour
-- que le client puisse déclencher une notification push vers le
-- destinataire (voir api/notify-friend-request.ts) — jusqu'ici il ne
-- connaissait que le CODE ami saisi, pas l'id du compte résolu côté
-- serveur. send_friend_request_by_user_id (0023) n'a pas ce problème : le
-- client lui donne déjà l'id directement.
--
-- Comportement inchangé à part ce champ en plus dans le jsonb retourné —
-- create or replace sans changer la signature ni le type de retour.
-- ============================================================================
set search_path = public;

create or replace function public.send_friend_request(p_friend_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_existing public.friend_requests%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select id into v_target from public.profiles where friend_code = upper(trim(p_friend_code));
  if v_target is null then
    raise exception 'Aucun compte ne correspond à ce code ami.';
  end if;
  if v_target = v_user then
    raise exception 'Vous ne pouvez pas vous ajouter vous-même.';
  end if;

  select * into v_existing from public.friend_requests
  where least(requester_id, addressee_id) = least(v_user, v_target)
    and greatest(requester_id, addressee_id) = greatest(v_user, v_target);

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'Vous êtes déjà amis.';
    end if;
    if v_existing.requester_id = v_user then
      raise exception 'Demande déjà envoyée, en attente de réponse.';
    end if;
    -- l'autre m'avait déjà envoyé une demande : on l'accepte.
    update public.friend_requests set status = 'accepted', responded_at = now()
    where id = v_existing.id;
    return jsonb_build_object('status', 'accepted', 'target_user_id', v_target);
  end if;

  insert into public.friend_requests (requester_id, addressee_id) values (v_user, v_target);
  return jsonb_build_object('status', 'pending', 'target_user_id', v_target);
end;
$$;

grant execute on function public.send_friend_request(text) to authenticated;
