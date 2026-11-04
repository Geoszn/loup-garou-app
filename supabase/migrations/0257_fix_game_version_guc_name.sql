-- 0257 — Correctif de 0253 : la création de partie échouait avec « invalid configuration parameter name "lg.gsv.<uuid>" ».
--
-- Cause : bump_game_state_version mémorise « déjà mis à jour dans cette transaction » dans un paramètre de session dont le nom
-- contient l'identifiant de la partie. PostgreSQL exige que chaque partie d'un nom de paramètre personnalisé soit un identifiant
-- valide, donc qu'elle ne commence pas par un chiffre : toute partie dont l'identifiant commence par un chiffre (environ 10 sur
-- 16) faisait échouer la transaction (create_game, et toute action qui modifie la partie).
-- Correctif : préfixe « g » devant l'identifiant. Rejouable sans risque.
set search_path = public;

create or replace function public.bump_game_state_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game uuid;
  v_key text;
begin
  if TG_TABLE_NAME = 'games' then
    v_game := NEW.id;
  elsif TG_OP = 'DELETE' then
    v_game := OLD.game_id;
  else
    v_game := NEW.game_id;
  end if;
  if v_game is null then
    return null;
  end if;

  -- Une seule mise à jour par partie et par transaction.
  v_key := 'lg.gsv.g' || replace(v_game::text, '-', '');
  if current_setting(v_key, true) = '1' then
    return null;
  end if;
  perform set_config(v_key, '1', true);

  -- « select ... from games » : si la partie vient d'être supprimée (cascade), rien n'est inséré.
  insert into public.game_state_version as v (game_id)
  select g.id from public.games g where g.id = v_game
  on conflict (game_id) do update set version = v.version + 1, updated_at = now();

  return null;
end;
$$;

revoke all on function public.bump_game_state_version() from public, anon, authenticated;
