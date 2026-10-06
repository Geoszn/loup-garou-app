-- 0214 — tick_game : sortir tout de suite quand il n'y a rien à faire.
--
-- Chaque joueur connecté appelle tick_game toutes les 4 s (voir useGame.ts) ; la
-- grande majorité de ces appels ne fait rien, l'échéance de phase n'étant pas
-- atteinte. Mais advance_phase (0180) commence par `select ... for update` sur
-- la ligne de la partie AVANT de tester l'échéance : chaque tick « à vide »
-- posait donc un verrou de ligne (écriture WAL, attente derrière un éventuel
-- autre verrou) et déroulait une fonction de plusieurs centaines de lignes.
-- Mesuré en production : 124 000 appels à 38 ms de moyenne, soit plus d'une
-- heure de temps base (pg_stat_statements).
--
-- Ici on lit d'abord statut et échéance SANS verrou, et on ne prend le verrou
-- consultatif puis advance_phase que si une échéance est réellement atteinte.
-- Les deux sorties anticipées reprennent à l'identique celles d'advance_phase
-- pour un appel non forcé (partie absente / au salon / terminée, ou échéance
-- pas encore dépassée de 2 s) : le comportement est inchangé, seul le coût
-- d'un tick à vide tombe à une lecture indexée.
set search_path = public;

create or replace function public.tick_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_deadline timestamptz;
begin
  select status, phase_deadline into v_status, v_deadline
  from public.games where id = p_game_id;

  if v_status is null or v_status in ('lobby', 'ended') then
    return;
  end if;

  if v_deadline is not null and now() < v_deadline + interval '2 seconds' then
    return;
  end if;

  if pg_try_advisory_xact_lock(hashtextextended(p_game_id::text, 2)) then
    perform public.advance_phase(p_game_id, false);
  end if;
end;
$$;
