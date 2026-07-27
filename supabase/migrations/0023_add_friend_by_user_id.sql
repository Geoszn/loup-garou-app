-- ----------------------------------------------------------------------------
-- 0023_add_friend_by_user_id : permet d'envoyer une demande d'ami à partir
-- d'un user_id déjà connu (un profil croisé en partie), sans passer par le
-- code ami — pratique pour un bouton "Ajouter en ami" directement sur
-- l'avatar d'un joueur dans la fenêtre du village / le salon d'attente.
--
-- On garde send_friend_request(text) (par code ami) intact pour l'écran
-- "Amis", et on ajoute ce jumeau qui reprend exactement la même logique
-- (auto-acceptation si l'autre m'avait déjà envoyé une demande, rejet si
-- déjà amis ou demande déjà en attente) à partir d'un uuid cible.
-- ----------------------------------------------------------------------------
create or replace function public.send_friend_request_by_user_id(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_target uuid := p_target_user_id;
  v_existing public.friend_requests%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if v_target is null or not exists (select 1 from public.profiles where id = v_target) then
    raise exception 'Ce compte est introuvable.';
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
    update public.friend_requests set status = 'accepted', responded_at = now()
    where id = v_existing.id;
    return jsonb_build_object('status', 'accepted');
  end if;

  insert into public.friend_requests (requester_id, addressee_id) values (v_user, v_target);
  return jsonb_build_object('status', 'pending');
end;
$$;

grant execute on function public.send_friend_request_by_user_id(uuid) to authenticated;
