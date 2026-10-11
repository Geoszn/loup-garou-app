-- Cupidon choisit « à l'aveugle » : il ne sait plus qui il a rendu amoureux.
--
-- Avant : Cupidon voyait la liste des joueurs et désignait deux noms (submit_cupidon).
-- Maintenant : il voit autant de cartes IDENTIQUES et anonymes que de joueurs éligibles (les joueurs vivants
-- sauf lui) et en touche deux. Le serveur tire au sort, à cet instant, quel joueur se cache derrière chaque
-- carte — personne, Cupidon compris, ne peut relier une carte à un joueur. Seuls les deux amoureux sont prévenus
-- (lover_with, déjà lu par get_my_game_view et le récapitulatif du lever du jour).
--
--  * submit_cupidon_blind(game, slot1, slot2) : les positions des deux cartes (0 à N-1) ;
--  * l'ancienne submit_cupidon(game, joueur1, joueur2) n'est plus appelable par les joueurs (sinon on pourrait
--    contourner l'aveugle en l'appelant directement) ; elle reste en base pour un usage interne éventuel ;
--  * règle conservée : Cupidon ne peut pas se choisir lui-même (il n'est donc pas parmi les cartes).
-- Rejouable sans risque.

create or replace function public.submit_cupidon_blind(p_game_id uuid, p_slot1 integer, p_slot2 integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_pool uuid[];
  v_lover1 uuid;
  v_lover2 uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'cupidon' then
    raise exception 'Ce n’est pas le moment pour Cupidon.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'cupidon' then
    raise exception 'Vous n’êtes pas Cupidon.';
  end if;

  -- Les cartes : un tirage aléatoire frais de tous les joueurs vivants sauf Cupidon.
  select coalesce(array_agg(user_id order by random()), '{}'::uuid[]) into v_pool
  from public.game_players
  where game_id = p_game_id and is_alive and user_id <> v_user;

  if p_slot1 is null or p_slot2 is null or p_slot1 = p_slot2
     or p_slot1 < 0 or p_slot2 < 0
     or p_slot1 >= coalesce(array_length(v_pool, 1), 0) or p_slot2 >= coalesce(array_length(v_pool, 1), 0) then
    raise exception 'Choisissez deux cartes différentes.';
  end if;

  v_lover1 := v_pool[p_slot1 + 1];
  v_lover2 := v_pool[p_slot2 + 1];

  update public.game_roles_secret set lover_with = null where game_id = p_game_id;
  update public.game_roles_secret set lover_with = v_lover2 where game_id = p_game_id and user_id = v_lover1;
  update public.game_roles_secret set lover_with = v_lover1 where game_id = p_game_id and user_id = v_lover2;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
  values (p_game_id, v_game.night_number, 'cupidon', v_user, v_lover1, jsonb_build_object('lover2', v_lover2, 'blind', true))
  on conflict (game_id, night_number, step, actor_id)
  do update set target_id = excluded.target_id, extra = excluded.extra;

  insert into public.game_log (game_id, message)
  values (p_game_id, '💘 Cupidon a décoché ses flèches...');

  perform public.advance_phase(p_game_id, true);
end;
$$;

revoke execute on function public.submit_cupidon_blind(uuid, integer, integer) from public, anon;
grant execute on function public.submit_cupidon_blind(uuid, integer, integer) to authenticated;
revoke execute on function public.submit_cupidon(uuid, uuid, uuid) from public, anon, authenticated;
