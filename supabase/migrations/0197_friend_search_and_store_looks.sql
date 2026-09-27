-- ============================================================================
-- 1. Recherche de joueurs pour la page Amis : par pseudo (recherche partielle,
-- public) ou par adresse email (correspondance EXACTE uniquement — jamais de
-- recherche partielle sur l'email, qui est une donnée privée, pour ne pas
-- permettre de deviner l'email de quelqu'un caractère par caractère).
-- Renvoie uniquement des informations déjà publiques ailleurs (get_my_social,
-- get_player_public_profile) — jamais l'email lui-même dans la réponse.
-- ============================================================================
set search_path = public;

create or replace function public.search_people(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user uuid := auth.uid();
  v_query text := trim(coalesce(p_query, ''));
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if length(v_query) < 2 then
    return '[]'::jsonb;
  end if;

  if v_query like '%@%' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.id, 'username', p.username,
        'avatar_icon', p.avatar_icon, 'avatar_config', p.avatar_config
      ))
      from public.profiles p
      join auth.users u on u.id = p.id
      where lower(u.email) = lower(v_query) and p.id <> v_user
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', x.id, 'username', x.username,
      'avatar_icon', x.avatar_icon, 'avatar_config', x.avatar_config
    ))
    from (
      select p.id, p.username, p.avatar_icon, p.avatar_config
      from public.profiles p
      where p.username ilike '%' || v_query || '%' and p.id <> v_user
      order by p.username
      limit 15
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.search_people(text) from public, anon;
grant execute on function public.search_people(text) to authenticated;

-- ============================================================================
-- 2. Le Chasseur / Le Guerrier au Loup Store : ces looks n'étaient jusqu'ici
-- accessibles que via l'onglet "Looks" de l'éditeur d'avatar (sans coût) —
-- ils rejoignent la boutique, comme "Le Griot" (déjà vendu sous le nom
-- "Pack Griot" depuis la migration 0195, avec les mêmes pièces). Configs
-- reprises à l'identique de l'ancienne liste LOOKS côté client
-- (AvatarStudio.tsx) pour que le rendu ne change pas, seul l'accès change.
-- ============================================================================
insert into public.store_skins (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order) values
  ('look-chasseur', 'packs', 'rare', 'Le Chasseur', 'The Hunter', 'Gilet de traqueur et chapeau de brousse, prêt pour la nuit.', 'A tracker''s vest and bush hat, ready for the night.', 260, '{"hair":"fade","outfit":"hunter","head":"hat","face":"square"}', 9),
  ('look-guerrier', 'packs', 'epique', 'Le Guerrier', 'The Warrior', 'Crête de guerre, armure sombre et peinture rituelle.', 'War mohawk, dark armour and ritual paint.', 380, '{"hair":"mohawk","outfit":"armor","acc":"facepaint","face":"square"}', 10)
on conflict (slug) do nothing;
