-- ===========================================================================
-- SUPABASE PATCH V8: GAMIFIKASI (STREAK KUNJUNGAN HARIAN & BONUS EXP)
-- ===========================================================================
-- Patch ini menambahkan perhitungan streak kunjungan harian (hari berturut-turut)
-- dan bonus EXP otomatis untuk streak 3 hari (+50 EXP) dan 7 hari (+150 EXP).
-- Jalankan sekali di Supabase SQL Editor.
-- ===========================================================================

-- 1. Fungsi menghitung streak kunjungan berturut-turut untuk suatu kartu
create or replace function public.card_streak(p_card_id uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_streak integer := 0;
  v_curr date := (now() at time zone 'utc')::date;
  v_has_today boolean;
  r record;
begin
  -- Periksa apakah ada kunjungan hari ini
  select exists(select 1 from public.card_taps where card_id = p_card_id and visited_on = v_curr) into v_has_today;
  if not v_has_today then
    -- Jika hari ini belum di-tap, cek apakah kemarin ada tap agar streak tidak langsung putus
    v_curr := v_curr - 1;
    select exists(select 1 from public.card_taps where card_id = p_card_id and visited_on = v_curr) into v_has_today;
    if not v_has_today then return 0; end if;
  end if;

  -- Hitung mundur hari-hari berturut-turut
  for r in select distinct visited_on from public.card_taps where card_id = p_card_id and visited_on <= v_curr order by visited_on desc loop
    if r.visited_on = v_curr then
      v_streak := v_streak + 1;
      v_curr := v_curr - 1;
    else
      exit;
    end if;
  end loop;

  return v_streak;
end; $$;

-- 2. Update fungsi card_exp dengan bonus streak bertingkat
create or replace function public.card_exp(p_card_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select count(*) from public.card_taps t where t.card_id = p_card_id), 0)::bigint
         * coalesce((select s.exp_per_unique_daily_visit from public.exp_settings s where s.id = 1), 10)::bigint
         + coalesce((select c.exp_bonus from public.cards c where c.id = p_card_id), 0)::bigint
         + case
             when public.card_streak(p_card_id) >= 7 then 150
             when public.card_streak(p_card_id) >= 3 then 50
             else 0
           end;
$$;

-- 3. Update get_public_card agar menyertakan nilai streak
create or replace function public.get_public_card(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_card    public.cards%rowtype;
  v_prof    public.profiles%rowtype;
  v_per     integer;
  v_exp     bigint;
  v_owner   jsonb := null;
  v_socials jsonb := '[]'::jsonb;
  v_expers  jsonb := '[]'::jsonb;
  v_first   timestamptz;
  v_hide    jsonb;
  v_streak  integer;
begin
  select * into v_card from public.cards
  where card_code = upper(btrim(coalesce(p_code, ''))) and status = 'ACTIVE';
  if not found then return null; end if;

  v_hide := case when jsonb_typeof(v_card.style->'hide') = 'array' then v_card.style->'hide' else '[]'::jsonb end;

  select s.exp_per_level into v_per from public.exp_settings s where s.id = 1;
  v_per := greatest(1, coalesce(v_per, 100));
  v_exp := public.card_exp(v_card.id);
  v_streak := public.card_streak(v_card.id);

  if v_card.owner_id is not null then
    select * into v_prof from public.profiles where id = v_card.owner_id and is_public = true;
    if found then
      v_owner := jsonb_build_object(
        'display_name', v_prof.display_name, 'username', v_prof.username,
        'joined_at', v_prof.created_at);
      if not (v_hide ? 'profile') then
        v_owner := v_owner || jsonb_build_object(
          'avatar_url', v_prof.avatar_url, 'bio', v_prof.bio, 'location', v_prof.location,
          'headline', v_prof.headline, 'company', v_prof.company);
      end if;
      if not (v_hide ? 'contact') then
        v_owner := v_owner || jsonb_build_object(
          'website_url', v_prof.website_url,
          'public_email', v_prof.public_email, 'public_phone', v_prof.public_phone);
        select coalesce(jsonb_agg(jsonb_build_object('platform', so.platform, 'label', so.label, 'url', so.url)
                                  order by so.sort_order, so.created_at), '[]'::jsonb)
          into v_socials
          from public.profile_socials so
         where so.profile_id = v_prof.id and so.is_visible = true;
      end if;
      if not (v_hide ? 'experience') then
        select coalesce(jsonb_agg(jsonb_build_object(
                 'title', e.title, 'org', e.org, 'start_year', e.start_year,
                 'end_year', e.end_year, 'description', e.description)
                 order by e.sort_order, e.start_year desc nulls last, e.created_at), '[]'::jsonb)
          into v_expers
          from public.profile_experiences e where e.profile_id = v_prof.id;
      end if;
    end if;
  end if;

  select min(t.first_seen_at) into v_first from public.card_taps t where t.card_id = v_card.id;

  return jsonb_build_object(
    'code', v_card.card_code, 'number', v_card.collection_number, 'rarity', v_card.rarity,
    'display_name', v_card.display_name, 'title', v_card.title,
    'front_image', v_card.card_front_image_url, 'back_image', v_card.card_back_image_url,
    'created_at', v_card.created_at, 'activated_at', v_card.activated_at, 'first_visit_at', v_first,
    'exp', v_exp, 'level', public.card_level(v_card.id),
    'exp_per_level', v_per, 'exp_into_level', v_exp % v_per,
    'taps', v_card.total_taps,
    'streak', v_streak,
    'style', coalesce(v_card.style, '{}'::jsonb),
    'hide', v_hide,
    'is_owner', (auth.uid() is not null and v_card.owner_id = auth.uid()),
    'owner', v_owner, 'socials', v_socials, 'experiences', v_expers);
end; $$;

-- 4. Izin eksekusi
grant execute on function public.card_streak(uuid) to anon, authenticated, service_role;
grant execute on function public.card_exp(uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_card(text) to anon, authenticated, service_role;
