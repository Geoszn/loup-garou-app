-- Notifications push personnalisées et espacées (série, quêtes, amis, palier,
-- retour). Règles communes : au plus une notification par joueur toutes les
-- 20 heures, jamais entre 22h et 9h (heure locale du joueur), jamais pendant
-- qu'il est en partie, et uniquement si un type est activé dans ses réglages.
-- Le choix du message est fait ici (pick_engagement_notifications) ; l'envoi
-- lui-même est fait par api/cron-engagement-notifications.ts.
set search_path = public;

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default true,
  streak boolean not null default true,
  quests boolean not null default true,
  games boolean not null default true,
  progress boolean not null default true,
  comeback boolean not null default true,
  tz_offset_min int not null default 0 check (tz_offset_min between -840 and 840),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  sent_at timestamptz not null default now()
);
create index if not exists notification_log_user_sent_idx on public.notification_log (user_id, sent_at desc);

alter table public.notification_prefs enable row level security;
alter table public.notification_log enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
revoke all on public.notification_log from anon, authenticated;

create or replace function public.get_my_notification_prefs()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('enabled', enabled, 'streak', streak, 'quests', quests,
                               'games', games, 'progress', progress, 'comeback', comeback)
     from public.notification_prefs where user_id = auth.uid()),
    jsonb_build_object('enabled', true, 'streak', true, 'quests', true,
                       'games', true, 'progress', true, 'comeback', true));
$$;

create or replace function public.save_my_notification_prefs(
  p_enabled boolean, p_streak boolean, p_quests boolean,
  p_games boolean, p_progress boolean, p_comeback boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  insert into public.notification_prefs (user_id, enabled, streak, quests, games, progress, comeback)
  values (auth.uid(), coalesce(p_enabled, true), coalesce(p_streak, true), coalesce(p_quests, true),
          coalesce(p_games, true), coalesce(p_progress, true), coalesce(p_comeback, true))
  on conflict (user_id) do update
    set enabled = excluded.enabled, streak = excluded.streak, quests = excluded.quests,
        games = excluded.games, progress = excluded.progress, comeback = excluded.comeback,
        updated_at = now();
end;
$$;

create or replace function public.set_my_timezone(p_offset_min int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  if p_offset_min is null or p_offset_min not between -840 and 840 then
    return;
  end if;
  insert into public.notification_prefs (user_id, tz_offset_min)
  values (auth.uid(), p_offset_min)
  on conflict (user_id) do update set tz_offset_min = excluded.tz_offset_min;
end;
$$;

create or replace function public.notif_role_label(p_role text, p_lang text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_role
    when 'villageois' then case when p_lang = 'en' then 'Villager' else 'Villageois' end
    when 'loup_garou' then case when p_lang = 'en' then 'Werewolf' else 'Loup-Garou' end
    when 'loup_alpha' then case when p_lang = 'en' then 'Alpha Wolf' else 'Loup Alpha' end
    when 'voyante' then case when p_lang = 'en' then 'Seer' else 'Voyante' end
    when 'sorciere' then case when p_lang = 'en' then 'Witch' else 'Sorcière' end
    when 'chasseur' then case when p_lang = 'en' then 'Hunter' else 'Chasseur' end
    when 'petite_fille' then case when p_lang = 'en' then 'Little Girl' else 'Petite Fille' end
    when 'cupidon' then case when p_lang = 'en' then 'Cupid' else 'Cupidon' end
    when 'ancien' then case when p_lang = 'en' then 'Elder' else 'Ancien' end
    when 'voleur' then case when p_lang = 'en' then 'Thief' else 'Voleur' end
    when 'enfant_sauvage' then case when p_lang = 'en' then 'Wild Child' else 'Enfant Sauvage' end
    when 'griot' then 'Griot'
    when 'sans_visage' then case when p_lang = 'en' then 'Faceless' else 'Sans-Visage' end
    when 'anancy' then 'Anancy'
    when 'chasseuse' then case when p_lang = 'en' then 'Huntress' else 'Chasseuse' end
    when 'capitaine' then case when p_lang = 'en' then 'Captain' else 'Capitaine' end
    when 'ange' then case when p_lang = 'en' then 'Angel' else 'Ange' end
    when 'grand_mechant_loup' then case when p_lang = 'en' then 'Big Bad Wolf' else 'Grand Méchant Loup' end
    when 'daron' then case when p_lang = 'en' then 'Guardian' else 'Daron' end
    else null
  end;
$$;

create or replace function public.notif_tier_label(p_tier text, p_lang text)
returns text
language sql
immutable
set search_path = public
as $$
  select case split_part(p_tier, '_', 1)
           when 'villageois' then case when p_lang = 'en' then 'Villager' else 'Villageois' end
           when 'chasseur' then case when p_lang = 'en' then 'Hunter' else 'Chasseur' end
           when 'ancien' then case when p_lang = 'en' then 'Elder' else 'Ancien' end
           when 'sage' then case when p_lang = 'en' then 'Sage' else 'Sage' end
           when 'legende' then case when p_lang = 'en' then 'Legend' else 'Légende' end
           else 'Nouveau venu'
         end
         || case split_part(p_tier, '_', 2) when '1' then ' I' when '2' then ' II' when '3' then ' III' else '' end;
$$;

-- Choisit, pour chaque joueur éligible, AU PLUS UN message, l'enregistre dans
-- notification_log (garantit la limite d'un par jour même si l'envoi est
-- relancé) et le renvoie pour envoi. Réservée à la clé service_role.
create or replace function public.pick_engagement_notifications()
returns table (user_id uuid, kind text, title text, body text, url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_now timestamptz := now();
  v_utc_today date := (now() at time zone 'utc')::date;
  v_quest_today date := public.quest_today();
  v_local_hour int;
  v_en boolean;
  v_kind text;
  v_title text;
  v_body text;
  v_url text;
  v_n int;
  v_coins int;
  v_label text;
  v_friend text;
  v_code text;
  v_role text;
  v_role_label text;
  v_next int;
  v_thresholds int[] := array[100,200,350,550,800,1100,1500,2000,2700,3600,4800,6400,8500,11000,15000];
  v_days int;
begin
  for r in
    select p.id, p.username, coalesce(p.lang, 'fr') as lang, p.rank_points, p.login_streak, p.last_login_date,
           coalesce(np.streak, true) as f_streak, coalesce(np.quests, true) as f_quests,
           coalesce(np.games, true) as f_games, coalesce(np.progress, true) as f_progress,
           coalesce(np.comeback, true) as f_comeback,
           coalesce(np.tz_offset_min, 0) as tz
    from public.profiles p
    left join public.notification_prefs np on np.user_id = p.id
    where not coalesce(p.is_bot, false)
      and coalesce(np.enabled, true)
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
      and not exists (select 1 from public.notification_log l
                      where l.user_id = p.id and l.sent_at > v_now - interval '20 hours')
      and not exists (select 1 from public.game_players gp join public.games g on g.id = gp.game_id
                      where gp.user_id = p.id and g.status <> 'ended' and g.status <> 'lobby'
                        and g.last_activity_at > v_now - interval '30 minutes')
  loop
    v_local_hour := extract(hour from (v_now + make_interval(mins => r.tz)) at time zone 'utc')::int;
    if v_local_hour < 9 or v_local_hour >= 22 then
      continue;
    end if;

    v_en := r.lang = 'en';
    v_kind := null;

    -- 1. Récompense de quête terminée et non récupérée
    if r.f_quests then
      select count(*), coalesce(sum(qt.reward_coins), 0), min(case when v_en then qt.label_en else qt.label_fr end)
        into v_n, v_coins, v_label
        from public.quest_progress qp
        join public.quest_templates qt on qt.id = qp.template_id
        where qp.user_id = r.id and qp.quest_date in (v_quest_today, v_quest_today - 1)
          and qp.claimed_at is null and qp.progress >= qt.target and qt.reward_coins > 0;
      if v_n > 0 then
        v_kind := 'quest_claim';
        v_url := '/dashboard';
        if v_en then
          v_title := v_coins || ' Loup Coins are waiting for you';
          v_body := case when v_n = 1 then 'Your quest "' || v_label || '" is complete. Claim it.'
                         else 'Your ' || v_n || ' quests are complete. Claim them.' end;
        else
          v_title := v_coins || ' Loup Coins t''attendent';
          v_body := case when v_n = 1 then 'Ta quête « ' || v_label || ' » est terminée. Récupère-la.'
                         else 'Tes ' || v_n || ' quêtes sont terminées. Récupère-les.' end;
        end if;
      end if;
    end if;

    -- 2. Un ami vient de créer une partie
    if v_kind is null and r.f_games then
      select fp.username, g.code into v_friend, v_code
        from public.games g
        join public.profiles fp on fp.id = g.host_id
        where g.status = 'lobby' and g.created_at > v_now - interval '45 minutes'
          and g.host_id <> r.id
          and exists (select 1 from public.friend_requests f
                      where f.status = 'accepted'
                        and ((f.requester_id = r.id and f.addressee_id = g.host_id)
                          or (f.addressee_id = r.id and f.requester_id = g.host_id)))
          and not exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = r.id)
        order by g.created_at desc limit 1;
      if v_code is not null then
        v_kind := 'friend_game';
        v_url := '/rejoindre/' || v_code;
        if v_en then
          v_title := v_friend || ' is starting a game';
          v_body := 'Join ' || v_friend || ' before it begins.';
        else
          v_title := v_friend || ' lance une partie';
          v_body := 'Rejoins ' || v_friend || ' avant le début de la partie.';
        end if;
      end if;
    end if;

    -- 3. Série de connexion en danger (fin de journée, pas encore connecté)
    if v_kind is null and r.f_streak and r.login_streak >= 2
       and r.last_login_date = v_utc_today - 1 and v_local_hour >= 17 then
      v_kind := 'streak_risk';
      v_url := '/dashboard';
      if v_en then
        v_title := 'Your ' || r.login_streak || '-day streak ends tonight';
        v_body := 'One quick visit keeps it alive, ' || r.username || '.';
      else
        v_title := 'Ta série de ' || r.login_streak || ' jours s''arrête ce soir';
        v_body := 'Une visite rapide suffit pour la garder, ' || r.username || '.';
      end if;
    end if;

    -- 4. Une quête à un cran de la fin
    if v_kind is null and r.f_quests and v_local_hour >= 17 then
      select case when v_en then qt.label_en else qt.label_fr end into v_label
        from public.quest_progress qp
        join public.quest_templates qt on qt.id = qp.template_id
        where qp.user_id = r.id and qp.quest_date = v_quest_today and qp.claimed_at is null
          and qt.target >= 2 and qp.progress = qt.target - 1
        limit 1;
      if v_label is not null then
        v_kind := 'quest_almost';
        v_url := '/dashboard';
        if v_en then
          v_title := 'Just one step left';
          v_body := 'You are one step away from completing "' || v_label || '".';
        else
          v_title := 'Plus qu''une étape';
          v_body := 'Il te manque une étape pour terminer « ' || v_label || ' ».';
        end if;
      end if;
    end if;

    -- 5. Palier de rang proche (au plus une fois tous les 5 jours)
    if v_kind is null and r.f_progress
       and not exists (select 1 from public.notification_log l
                       where l.user_id = r.id and l.kind = 'tier_close' and l.sent_at > v_now - interval '5 days') then
      select min(t) into v_next from unnest(v_thresholds) t where t > r.rank_points;
      if v_next is not null and v_next - r.rank_points <= 15 then
        v_kind := 'tier_close';
        v_url := '/dashboard';
        v_label := public.notif_tier_label(public.rank_tier_for_points(v_next), r.lang);
        if v_en then
          v_title := (v_next - r.rank_points) || ' points to ' || v_label;
          v_body := 'One or two wins and you move up a rank.';
        else
          v_title := (v_next - r.rank_points) || ' points avant ' || v_label;
          v_body := 'Une ou deux victoires et tu passes au rang suivant.';
        end if;
      end if;
    end if;

    -- 6. Partie publique qui cherche des joueurs (joueur récemment actif,
    --    au plus une fois tous les 3 jours), personnalisée par rôle favori
    if v_kind is null and r.f_games and r.last_login_date >= v_utc_today - 14
       and not exists (select 1 from public.notification_log l
                       where l.user_id = r.id and l.kind = 'public_game' and l.sent_at > v_now - interval '3 days') then
      select g.code into v_code
        from public.games g
        where g.is_public and g.status = 'lobby' and g.created_at > v_now - interval '30 minutes'
          and (select count(*) from public.game_players gp where gp.game_id = g.id) >= 2
          and not exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = r.id)
        order by g.created_at desc limit 1;
      if v_code is not null then
        select gr.role into v_role
          from public.game_results gr
          where gr.user_id = r.id and gr.created_at > v_now - interval '60 days' and gr.role is not null
          group by gr.role order by count(*) desc, gr.role limit 1;
        v_role_label := public.notif_role_label(v_role, r.lang);
        v_kind := 'public_game';
        v_url := '/rejoindre/' || v_code;
        if v_en then
          v_title := case when v_role_label is not null then v_role_label || ', night is falling' else 'A public game is filling up' end;
          v_body := 'A public game is looking for players.';
        else
          v_title := case when v_role_label is not null then v_role_label || ', la nuit va tomber' else 'Une partie publique se prépare' end;
          v_body := 'Une partie publique cherche des joueurs.';
        end if;
      end if;
    end if;

    -- 7. Retour après absence : un message à 3 jours, un seul autre à 10 jours
    if v_kind is null and r.f_comeback and r.last_login_date is not null then
      v_days := v_utc_today - r.last_login_date;
      select count(*) into v_n from public.notification_log l
        where l.user_id = r.id and l.kind = 'comeback' and l.sent_at >= r.last_login_date::timestamptz;
      if (v_days between 3 and 9 and v_n = 0) or (v_days >= 10 and v_n < 2) then
        v_kind := 'comeback';
        v_url := '/dashboard';
        if v_en then
          v_title := 'The village grew without you';
          v_body := 'It has been ' || v_days || ' days. Your friends are waiting.';
        else
          v_title := 'Le village s''est agrandi sans toi';
          v_body := 'Ça fait ' || v_days || ' jours. Tes amis t''attendent.';
        end if;
      end if;
    end if;

    if v_kind is not null then
      insert into public.notification_log (user_id, kind, title, body) values (r.id, v_kind, v_title, v_body);
      user_id := r.id; kind := v_kind; title := v_title; body := v_body; url := v_url;
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.notif_role_label(text, text) from public, anon, authenticated;
revoke execute on function public.notif_tier_label(text, text) from public, anon, authenticated;
revoke execute on function public.pick_engagement_notifications() from public, anon, authenticated;
grant execute on function public.pick_engagement_notifications() to service_role;

revoke execute on function public.get_my_notification_prefs() from public, anon;
revoke execute on function public.save_my_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke execute on function public.set_my_timezone(int) from public, anon;
grant execute on function public.get_my_notification_prefs() to authenticated;
grant execute on function public.save_my_notification_prefs(boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.set_my_timezone(int) to authenticated;
