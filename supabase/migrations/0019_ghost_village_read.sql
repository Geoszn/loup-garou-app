-- ============================================================================
-- Les fantômes (joueurs éliminés) peuvent désormais suivre le chat du
-- village en lecture seule, pour suivre le déroulement de la partie sans
-- pouvoir y participer. Ils gardent en plus leur propre salon "cimetière"
-- pour discuter librement entre eux, inchangé.
--
-- can_access_channel reste la référence pour le droit d'ÉCRIRE (utilisée par
-- la policy d'insert et send_chat_message) : un fantôme ne peut toujours pas
-- écrire dans "village", seulement le lire. can_read_channel est une
-- nouvelle fonction, un peu plus permissive, utilisée uniquement par la
-- policy de SELECT.
-- ============================================================================
set search_path = public;

create or replace function public.can_read_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status text;
  v_night_step text;
  v_alive boolean;
  v_role text;
begin
  select status, night_step into v_status, v_night_step from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if; -- pas participant de cette partie

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    if v_alive then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote');
    else
      -- fantôme : lecture seule, à tout moment, pour suivre la partie.
      return true;
    end if;
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' or v_night_step <> 'loup_garou' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role = 'loup_garou';
  end if;

  return false;
end;
$$;

grant execute on function public.can_read_channel(uuid, text) to authenticated;

drop policy if exists "chat_select_when_open" on public.chat_messages;
create policy "chat_select_when_open" on public.chat_messages
  for select using (public.can_read_channel(chat_messages.game_id, chat_messages.channel));
