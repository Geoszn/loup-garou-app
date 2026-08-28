-- ============================================================================
-- Série de connexion quotidienne : distincte de current_streak/best_streak
-- (qui comptent les VICTOIRES d'affilée, voir migration d'origine des rangs)
-- — ici on récompense le simple fait d'ouvrir l'app un jour donné, gagné ou
-- perdu, pour créer une habitude indépendante du résultat des parties.
--
-- "Jour" = date calendaire en UTC (current_date), pas le fuseau du joueur :
-- plus simple, cohérent avec le reste du serveur, et l'écart n'est jamais
-- pire qu'un décalage d'un jour dans les fuseaux extrêmes — sans intérêt
-- pratique de complexifier pour ça.
-- ============================================================================
set search_path = public;

alter table public.profiles add column if not exists login_streak int not null default 0;
alter table public.profiles add column if not exists login_streak_best int not null default 0;
alter table public.profiles add column if not exists last_login_date date;

-- ----------------------------------------------------------------------------
-- claim_daily_login : appelée une fois par session côté client (montage du
-- tableau de bord). Idempotente pour le reste de la journée : un second
-- appel le même jour ne fait qu'aucune modification et renvoie
-- is_new_day = false, pour que le client sache s'il doit afficher le
-- bandeau ou rester silencieux.
-- ----------------------------------------------------------------------------
create or replace function public.claim_daily_login()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_last date;
  v_streak int;
  v_best int;
  v_today date := current_date;
  v_is_new boolean;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select last_login_date, login_streak, login_streak_best
    into v_last, v_streak, v_best
    from public.profiles
    where id = v_user
    for update;

  if not found then
    raise exception 'Profil introuvable.';
  end if;

  if v_last = v_today then
    v_is_new := false;
  else
    v_is_new := true;
    if v_last = v_today - 1 then
      v_streak := v_streak + 1;
    else
      v_streak := 1;
    end if;
    v_best := greatest(v_best, v_streak);

    update public.profiles
      set login_streak = v_streak, login_streak_best = v_best, last_login_date = v_today
      where id = v_user;
  end if;

  return jsonb_build_object('streak', v_streak, 'best', v_best, 'is_new_day', v_is_new);
end;
$$;

grant execute on function public.claim_daily_login() to authenticated;
