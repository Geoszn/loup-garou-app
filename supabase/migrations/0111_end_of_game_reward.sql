-- ============================================================================
-- Coffre de fin de partie : petit bonus de points ALÉATOIRE (variable
-- reward), indépendant du résultat de la partie (gagné ou perdu, tout le
-- monde peut ouvrir) — contrairement à points_gained (game_results,
-- migration 0073) qui est un calcul 100% déterministe. Volontairement
-- rattaché aux points de rang déjà existants plutôt qu'à un nouveau système
-- cosmétique séparé : les icônes d'avatar (AVATAR_ICON_MIN_POINTS,
-- avatar_icon_min_points) sont strictement gagnées par palier de points
-- (voir TierUpModal.tsx, "célèbre un changement de palier... jamais un
-- simple bravo abstrait") — leur faire correspondre un déblocage par chance
-- casserait cette promesse implicite ("ce que j'ai débloqué, je l'ai
-- mérité"). Un bonus de points reste cohérent avec les deux systèmes : il
-- peut au mieux accélérer légèrement l'accès à un palier déjà en vue,
-- jamais le contourner.
--
-- reward_drops : une ligne par (joueur, partie) — la contrainte unique sert
-- de garde-fou contre un double clic ou un double appel réseau, ET permet à
-- claim_end_of_game_reward d'être idempotente (rejouer la même requête
-- renvoie le montant déjà tiré, jamais un second tirage).
-- ============================================================================
set search_path = public;

create table if not exists public.reward_drops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  points_awarded int not null,
  created_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create index if not exists reward_drops_user_idx on public.reward_drops (user_id);

-- ----------------------------------------------------------------------------
-- claim_end_of_game_reward : ré-vérifie tout côté serveur (jamais confiance
-- dans p_game_id seul) — la partie doit être terminée ET l'appelant doit
-- réellement y avoir participé (game_players), sinon impossible d'ouvrir un
-- coffre pour une partie à laquelle on n'a pas joué.
--
-- Tirage pondéré : 45% rien (le "rien" fait partie du mécanisme — sans lui
-- ce n'est plus une récompense variable, juste un bonus systématique), puis
-- des montants croissants de plus en plus rares. Le maximum (25 pts) reste
-- sous le gain moyen d'une victoire (jusqu'à +30, voir apply_rank_result)
-- pour que ça reste un vrai bonus et jamais un raccourci qui rendrait le
-- score d'une partie accessoire.
-- ----------------------------------------------------------------------------
create or replace function public.claim_end_of_game_reward(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game_status text;
  v_points int;
  v_roll double precision;
  v_new_rank_points int;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select status into v_game_status from public.games where id = p_game_id;
  if v_game_status is distinct from 'ended' then
    raise exception 'Cette partie n''est pas encore terminée.';
  end if;

  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous n''avez pas participé à cette partie.';
  end if;

  select points_awarded into v_points from public.reward_drops
    where user_id = v_user and game_id = p_game_id;

  if found then
    select rank_points into v_new_rank_points from public.profiles where id = v_user;
    return jsonb_build_object('points_awarded', v_points, 'already_claimed', true, 'new_rank_points', v_new_rank_points);
  end if;

  v_roll := random();
  v_points := case
    when v_roll < 0.45 then 0
    when v_roll < 0.75 then 3
    when v_roll < 0.90 then 6
    when v_roll < 0.97 then 12
    else 25
  end;

  insert into public.reward_drops (user_id, game_id, points_awarded) values (v_user, p_game_id, v_points);

  update public.profiles set rank_points = rank_points + v_points
    where id = v_user
    returning rank_points into v_new_rank_points;

  return jsonb_build_object('points_awarded', v_points, 'already_claimed', false, 'new_rank_points', v_new_rank_points);
end;
$$;

grant execute on function public.claim_end_of_game_reward(uuid) to authenticated;
