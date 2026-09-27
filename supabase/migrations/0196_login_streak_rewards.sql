-- ============================================================================
-- Récompense de série de connexion : tous les 7 jours consécutifs (7, 14, 21…),
-- le joueur gagne 50 Loup Coins, versés automatiquement à la première ouverture
-- de la journée. Redéfinit claim_daily_login (migration 0110) en ajoutant le
-- versement ; le reste de la logique est inchangé. Le crédit n'a lieu que sur
-- un nouveau jour, donc jamais deux fois pour la même série.
-- ============================================================================
set search_path = public;

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
  v_reward int := 0;
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

    if v_streak % 7 = 0 then
      v_reward := 50;
      update public.profiles set loup_coins = loup_coins + v_reward where id = v_user;
      insert into public.loup_coins_transactions (user_id, amount, reason, label)
      values (v_user, v_reward, 'streak_reward', 'Série de ' || v_streak || ' connexions');
    end if;
  end if;

  return jsonb_build_object(
    'streak', v_streak, 'best', v_best, 'is_new_day', v_is_new, 'reward_coins', v_reward
  );
end;
$$;

revoke execute on function public.claim_daily_login() from public, anon;
grant execute on function public.claim_daily_login() to authenticated;
