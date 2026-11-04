-- 0261 — Saison 2 « Noël au Village » : du 1er décembre 2026 (00:00 UTC) au 29 janvier 2027 inclus (60 jours).
--
-- Cette migration pose la saison, son pass premium à 600 Loup Coins et les paliers en COINS des deux pistes :
--   * piste gratuite : 40 coins à chaque palier impair (15 paliers, 600 coins) ;
--   * piste premium : des coins bonus aux paliers impairs de 3 à 29 (14 paliers, 900 coins au total = 150 % du prix du pass).
-- Seuil d'XP : 160 × numéro de palier (30 paliers, 4 800 XP pour tout débloquer).
-- Les PIÈCES D'AVATAR (paliers pairs et grand lot du palier 30) ne sont pas encore là : elles s'ajoutent par des migrations
-- suivantes, au fur et à mesure que les pièces sont dessinées. Tant qu'un palier pair n'existe pas, la piste l'affiche vide.
-- La saison est activée (is_enabled) mais n'est « en cours » qu'à partir du 1er décembre : aucun effet avant.
-- À appliquer APRÈS 0260. Rejouable sans risque (on conflict do nothing).
set search_path = public;

insert into public.seasons (slug, name_fr, name_en, theme_color, starts_at, ends_at, xp_per_game_played, xp_per_game_won, xp_per_quest_claim, is_enabled, pass_price_coins)
values ('noel-au-village', 'Noël au Village', 'Christmas Village', 'emerald', '2026-12-01 00:00:00+00', '2027-01-30 00:00:00+00', 10, 15, 20, true, 600)
on conflict (slug) do nothing;

do $$
declare
  v_season uuid;
  v_n int;
  v_coins int;
begin
  select id into v_season from public.seasons where slug = 'noel-au-village';

  -- Piste gratuite : 40 coins aux paliers impairs.
  for v_n in 1..29 by 2 loop
    insert into public.season_tiers (season_id, tier_number, xp_required, reward_type, reward_coins, label_fr, label_en, track)
    values (v_season, v_n, 160 * v_n, 'coins', 40, '40 Loup Coins', '40 Loup Coins', 'free')
    on conflict (season_id, tier_number, track) do nothing;
  end loop;

  -- Piste premium : coins bonus (900 au total pour un pass à 600).
  for v_n, v_coins in
    select * from (values (3, 60), (5, 60), (7, 60), (9, 72), (11, 72), (13, 72), (15, 96), (17, 108), (19, 60), (21, 60), (23, 48), (25, 48), (27, 48), (29, 36)) as t(n, c)
  loop
    insert into public.season_tiers (season_id, tier_number, xp_required, reward_type, reward_coins, label_fr, label_en, track)
    values (v_season, v_n, 160 * v_n, 'coins', v_coins, v_coins || ' Loup Coins', v_coins || ' Loup Coins', 'premium')
    on conflict (season_id, tier_number, track) do nothing;
  end loop;
end;
$$;
