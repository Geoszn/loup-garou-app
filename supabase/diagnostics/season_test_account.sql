-- Diagnostic LECTURE SEULE du compte de test de la saison 2 (test de bout en bout). Ne modifie rien.
--   node scripts/query-sql-file.mjs supabase/diagnostics/season_test_account.sql
-- Donne : le profil (solde de coins), l'état de la saison « noel-au-village », et ce que ce compte possède déjà dans la saison
-- (XP, pass, paliers réclamés, pièces). Sert avant le test (état de départ) et après (vérifier achat et réclamations).
-- Le résultat est un JSON sans secret (aucun mot de passe, l'e-mail n'est pas renvoyé).
with u as (select id from auth.users where lower(email) = 'geoffroyszn@gmail.com'),
s as (select * from public.seasons where slug = 'noel-au-village')
select jsonb_build_object(
  'now', now(),
  'account_found', exists (select 1 from u),
  'profile', (select jsonb_build_object('username', p.username, 'loup_coins', p.loup_coins, 'is_admin', p.is_admin, 'is_guest', p.is_guest, 'is_bot', p.is_bot)
              from public.profiles p join u on u.id = p.id),
  'season', (select jsonb_build_object('starts_at', starts_at, 'ends_at', ends_at, 'is_enabled', is_enabled, 'pass_price_coins', pass_price_coins,
                                       'is_running_now', now() between starts_at and ends_at) from s),
  'tiers', (select jsonb_build_object('total', count(*), 'free', count(*) filter (where st.track = 'free'), 'premium', count(*) filter (where st.track = 'premium'),
                                      'skin_rewards', count(*) filter (where st.reward_type = 'skin'))
            from public.season_tiers st join s on s.id = st.season_id),
  'my_xp', (select coalesce(sp.xp, 0) from public.season_progress sp join u on u.id = sp.user_id join s on s.id = sp.season_id),
  'has_pass', exists (select 1 from public.season_passes ps join u on u.id = ps.user_id join s on s.id = ps.season_id),
  'my_claims', (select count(*) from public.season_tier_claims c join u on u.id = c.user_id join public.season_tiers st on st.id = c.tier_id join s on s.id = st.season_id),
  'my_season_pieces', (select coalesce(jsonb_agg(sk.name_fr order by sk.sort_order), '[]'::jsonb)
                       from public.player_skins pk join u on u.id = pk.user_id join public.store_skins sk on sk.id = pk.skin_id join s on s.id = sk.season_id),
  'other_players_with_season_xp', (select count(*) from public.season_progress sp join s on s.id = sp.season_id where sp.user_id not in (select id from u)),
  'other_players_with_pass', (select count(*) from public.season_passes ps join s on s.id = ps.season_id where ps.user_id not in (select id from u)),
  'xp_boosts', (select coalesce(jsonb_agg(jsonb_build_object('label', b.label_fr, 'multiplier', b.multiplier, 'starts_at', b.starts_at, 'ends_at', b.ends_at)), '[]'::jsonb)
                from public.season_xp_boosts b join s on s.id = b.season_id)
) as season_test_account;
