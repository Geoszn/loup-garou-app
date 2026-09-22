-- ============================================================================
-- Demande utilisateur : "permet a toutes les nouvelles cartes ajouter au jeu
-- de pouvoir etre choisir automaquement" — jusqu'ici, compute_default_role_
-- counts (mode automatique) ne proposait jamais Daron ni Chasseuse, les deux
-- seuls rôles du jeu absents de cette fonction. Ce n'était pas un choix
-- définitif : les migrations 0158 et 0162 disaient toutes les deux
-- explicitement "pour l'instant" / "disponible uniquement en configuration
-- manuelle pour l'instant", en attendant justement ce travail.
--
-- Seuils/probabilités choisis pour rester cohérents avec le reste de la
-- fonction (aucun précédent n'existait pour ces deux rôles) :
--   - Daron (village, protège un joueur différent chaque nuit contre les
--     Loups ET la Sorcière) : rôle protecteur récurrent, comparable en
--     impact à l'Ancien -> mêmes ordres de grandeur (>=7 joueurs, 35%).
--   - Chasseuse (camp neutre, cible auto-assignée dès la nuit 2, aucune
--     action à choisir) : même famille que Anancy, seul autre rôle neutre
--     déjà auto-sélectionnable -> mêmes ordres de grandeur (>=8 joueurs,
--     20%).
--
-- Les deux respectent déjà le garde-fou role_config.is_enabled (même
-- patron `not ('<role>' = any(v_disabled))` que tous les autres rôles), et
-- sont intégrés à la boucle de réduction qui garantit au moins un
-- villageois — en tête de liste des rôles sacrifiés en premier (nouveaux,
-- donc les plus "optionnels" du lot), pour ne jamais déplacer un rôle déjà
-- établi.
-- ============================================================================
set search_path = public;

create or replace function public.compute_default_role_counts(p_player_count integer)
returns jsonb
language plpgsql
as $$
declare
  v_disabled text[];
  v_wolves int;
  -- null | 'loup_alpha' | 'sans_visage' | 'grand_mechant_loup'
  v_wolf_variant text;
  v_wolf_variant_choices text[];
  v_voyante boolean;
  v_sorciere boolean;
  v_petite_fille boolean;
  v_ancien boolean;
  v_voleur boolean;
  v_enfant_sauvage boolean;
  v_chasseur boolean;
  v_cupidon boolean;
  v_griot boolean;
  v_anancy boolean;
  v_ange boolean;
  v_daron boolean;
  v_chasseuse boolean;
  v_special_total int;
begin
  select coalesce(array_agg(role), array[]::text[]) into v_disabled
  from public.role_config where not is_enabled;

  v_wolves := greatest(1, round(p_player_count * 0.25));
  if v_wolves >= p_player_count then
    v_wolves := greatest(1, p_player_count / 2);
  end if;

  -- Variante de meute : même seuil que celui déjà imposé au Loup Alpha
  -- ailleurs dans le moteur (start_game exige ≥10 joueurs pour lui) —
  -- appliqué identiquement aux trois variantes. Une seule à la fois, et
  -- uniquement parmi celles non désactivées.
  v_wolf_variant := null;
  if p_player_count >= 10 and random() < 0.35 then
    select array_agg(v) into v_wolf_variant_choices
    from unnest(array['loup_alpha', 'sans_visage', 'grand_mechant_loup']) v
    where not (v = any(v_disabled));

    if coalesce(array_length(v_wolf_variant_choices, 1), 0) > 0 then
      v_wolf_variant := v_wolf_variant_choices[1 + floor(random() * array_length(v_wolf_variant_choices, 1))::int];
      v_wolves := greatest(v_wolves - 1, 1);
    end if;
  end if;

  v_voyante := p_player_count >= 5 and random() < 0.9 and not ('voyante' = any(v_disabled));
  v_sorciere := p_player_count >= 6 and random() < 0.85 and not ('sorciere' = any(v_disabled));
  v_petite_fille := p_player_count >= 8 and random() < 0.55 and not ('petite_fille' = any(v_disabled));
  v_ancien := p_player_count >= 10 and random() < 0.45 and not ('ancien' = any(v_disabled));
  v_voleur := p_player_count >= 11 and random() < 0.45 and not ('voleur' = any(v_disabled));
  v_enfant_sauvage := p_player_count >= 9 and random() < 0.45 and not ('enfant_sauvage' = any(v_disabled));
  v_chasseur := p_player_count >= 6 and random() < 0.3 and not ('chasseur' = any(v_disabled));
  v_cupidon := p_player_count >= 6 and random() < 0.3 and not ('cupidon' = any(v_disabled));
  v_griot := p_player_count >= 9 and random() < 0.25 and not ('griot' = any(v_disabled));
  v_anancy := p_player_count >= 8 and random() < 0.2 and not ('anancy' = any(v_disabled));
  v_ange := p_player_count >= 6 and random() < 0.25 and not ('ange' = any(v_disabled));
  v_daron := p_player_count >= 7 and random() < 0.35 and not ('daron' = any(v_disabled));
  v_chasseuse := p_player_count >= 8 and random() < 0.2 and not ('chasseuse' = any(v_disabled));

  loop
    v_special_total := v_wolves + (case when v_wolf_variant is not null then 1 else 0 end)
      + v_voyante::int + v_sorciere::int + v_petite_fille::int + v_ancien::int + v_voleur::int
      + v_enfant_sauvage::int + v_chasseur::int + v_cupidon::int + v_griot::int + v_anancy::int + v_ange::int
      + v_daron::int + v_chasseuse::int;

    exit when v_special_total <= p_player_count - 1;

    if v_chasseuse then v_chasseuse := false;
    elsif v_daron then v_daron := false;
    elsif v_ange then v_ange := false;
    elsif v_anancy then v_anancy := false;
    elsif v_griot then v_griot := false;
    elsif v_cupidon then v_cupidon := false;
    elsif v_chasseur then v_chasseur := false;
    elsif v_enfant_sauvage then v_enfant_sauvage := false;
    elsif v_voleur then v_voleur := false;
    elsif v_ancien then v_ancien := false;
    elsif v_petite_fille then v_petite_fille := false;
    elsif v_wolf_variant is not null then
      v_wolf_variant := null;
      v_wolves := v_wolves + 1;
    else
      exit; -- rien de plus à couper (ne devrait jamais arriver en pratique)
    end if;
  end loop;

  return jsonb_build_object(
    'loup_garou', v_wolves,
    'loup_alpha', v_wolf_variant = 'loup_alpha',
    'voyante', v_voyante,
    'sorciere', v_sorciere,
    'chasseur', v_chasseur,
    'petite_fille', v_petite_fille,
    'cupidon', v_cupidon,
    'ancien', v_ancien,
    'voleur', v_voleur,
    'enfant_sauvage', v_enfant_sauvage,
    'griot', v_griot,
    'sans_visage', v_wolf_variant = 'sans_visage',
    'anancy', v_anancy,
    'ange', v_ange,
    'grand_mechant_loup', v_wolf_variant = 'grand_mechant_loup',
    'daron', v_daron,
    'chasseuse', v_chasseuse,
    'capitaine', true
  );
end;
$$;
