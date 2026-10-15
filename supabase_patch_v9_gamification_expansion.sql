-- ===========================================================================
-- SUPABASE PATCH V9: EKSPANSI GAMIFIKASI & INTERAKSI LENGKAP
-- ===========================================================================
-- 1. Multi-Visitor & Repeat Tap: Setiap pengunjung/HP berbeda mendapat EXP unik.
-- 2. Engagement EXP: Simpan Kontak (+15 EXP), Klik Medsos (+5 EXP), Tukar Kontak (+25 EXP).
-- 3. Profile Mastery Bonus: Profil lengkap mendapat bonus hingga +100 EXP.
-- 4. Event Mode Booster: Mode Acara mengalikan EXP (2x multiplier).
-- 5. Buku Tamu / Leads: Kontak pengunjung tersimpan untuk pemilik kartu.
-- ===========================================================================

-- 1. Tabel card_actions untuk mencatat interaksi pengunjung
create table if not exists public.card_actions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  action_type text not null, -- 'vcard_download', 'social_click', 'lead_exchange'
  visitor_hash text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_card_actions_card_created on public.card_actions(card_id, created_at desc);
create index if not exists idx_card_actions_type on public.card_actions(action_type);

-- RLS untuk card_actions
alter table public.card_actions enable row level security;

-- Pengunjung anonim dan member dapat mencatat aksi
create policy card_actions_insert_all on public.card_actions
  for insert with check (true);

-- Pemilik kartu dan admin dapat melihat data aksi / kontak buku tamu
create policy card_actions_select_owner on public.card_actions
  for select using (
    auth.uid() is not null and (
      exists(select 1 from public.cards c where c.id = card_actions.card_id and c.owner_id = auth.uid())
      or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'ADMIN')
    )
  );

-- 2. Fungsi mencatat interaksi pengunjung (record_card_action)
create or replace function public.record_card_action(
  p_card_code text,
  p_action_type text,
  p_visitor_hash text default null,
  p_meta jsonb default '{}'::jsonb
) returns table(out_card_id uuid, out_exp bigint, out_level bigint, out_action_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_card public.cards%rowtype;
  v_action_id uuid;
  v_hash text;
begin
  select * into v_card from public.cards
  where card_code = upper(btrim(coalesce(p_card_code, ''))) and status = 'ACTIVE';
  if not found then raise exception 'Card not found or inactive'; end if;

  v_hash := coalesce(p_visitor_hash, md5(coalesce(auth.uid()::text, '') || clock_timestamp()::text || random()::text));

  insert into public.card_actions (card_id, action_type, visitor_hash, meta)
  values (v_card.id, p_action_type, v_hash, coalesce(p_meta, '{}'::jsonb))
  returning id into v_action_id;

  return query select v_card.id, public.card_exp(v_card.id), public.card_level(v_card.id), v_action_id;
end; $$;

grant execute on function public.record_card_action(text, text, text, jsonb) to anon, authenticated, service_role;

-- 3. Kalkulasi EXP Menyeluruh (card_exp)
create or replace function public.card_exp(p_card_id uuid)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  v_card public.cards%rowtype;
  v_base_tap_exp bigint := 0;
  v_action_exp bigint := 0;
  v_profile_exp bigint := 0;
  v_streak_exp bigint := 0;
  v_streak int := 0;
  v_multiplier numeric := 1.0;
  v_prof public.profiles%rowtype;
  v_social_count int := 0;
  v_exp_count int := 0;
begin
  select * into v_card from public.cards where id = p_card_id;
  if not found then return 0; end if;

  -- Periksa apakah Mode Acara (Event Mode) aktif di style kartu
  if coalesce((v_card.style->>'event_mode')::boolean, false) = true then
    v_multiplier := 2.0;
  end if;

  -- 1. Tap EXP (10 EXP per kunjungan unik harian dari setiap pengunjung/HP berbeda)
  select coalesce(count(*), 0) * 10 into v_base_tap_exp
    from public.card_taps where card_id = p_card_id;

  -- 2. Engagement EXP dari Aksi Pengunjung
  -- Simpan Kontak: +15 EXP
  -- Tukar Kontak (Lead Exchange): +25 EXP
  -- Klik Medsos/Tautan: +5 EXP
  select coalesce(sum(
    case
      when action_type = 'vcard_download' then 15
      when action_type = 'lead_exchange' then 25
      when action_type = 'social_click' then 5
      else 5
    end
  ), 0) into v_action_exp
  from public.card_actions where card_id = p_card_id;

  -- 3. Daily Streak Bonus
  v_streak := public.card_streak(p_card_id);
  if v_streak >= 7 then
    v_streak_exp := 150;
  elsif v_streak >= 3 then
    v_streak_exp := 50;
  end if;

  -- 4. Profile Mastery Bonus (hingga +100 EXP jika profil lengkap)
  if v_card.owner_id is not null then
    select * into v_prof from public.profiles where id = v_card.owner_id;
    if found then
      if v_prof.avatar_url is not null and btrim(v_prof.avatar_url) != '' then
        v_profile_exp := v_profile_exp + 25;
      end if;
      if (v_prof.headline is not null and btrim(v_prof.headline) != '') or (v_prof.bio is not null and btrim(v_prof.bio) != '') then
        v_profile_exp := v_profile_exp + 25;
      end if;
      select count(*) into v_social_count from public.profile_socials where profile_id = v_prof.id and is_visible = true;
      if v_social_count >= 2 then
        v_profile_exp := v_profile_exp + 25;
      end if;
      select count(*) into v_exp_count from public.profile_experiences where profile_id = v_prof.id;
      if v_exp_count >= 1 then
        v_profile_exp := v_profile_exp + 25;
      end if;
    end if;
  end if;

  -- Hasil akhir dengan pengali Event Mode (2x untuk Tap & Action EXP)
  return round((v_base_tap_exp + v_action_exp) * v_multiplier)::bigint
         + v_streak_exp
         + v_profile_exp
         + coalesce(v_card.exp_bonus, 0)::bigint;
end; $$;

grant execute on function public.card_exp(uuid) to anon, authenticated, service_role;

-- 4. Update get_public_card agar menyertakan status event_mode dan actions summary
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
  v_action_stats jsonb;
begin
  select * into v_card from public.cards
  where card_code = upper(btrim(coalesce(p_code, ''))) and status = 'ACTIVE';
  if not found then return null; end if;

  v_hide := case when jsonb_typeof(v_card.style->'hide') = 'array' then v_card.style->'hide' else '[]'::jsonb end;

  select s.exp_per_level into v_per from public.exp_settings s where s.id = 1;
  v_per := greatest(1, coalesce(v_per, 100));
  v_exp := public.card_exp(v_card.id);
  v_streak := public.card_streak(v_card.id);

  -- Hitung ringkasan aksi interaksi
  select jsonb_build_object(
    'vcards', count(*) filter (where action_type = 'vcard_download'),
    'leads', count(*) filter (where action_type = 'lead_exchange'),
    'clicks', count(*) filter (where action_type = 'social_click')
  ) into v_action_stats from public.card_actions where card_id = v_card.id;

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
    'actions', coalesce(v_action_stats, '{"vcards":0,"leads":0,"clicks":0}'::jsonb),
    'style', coalesce(v_card.style, '{}'::jsonb),
    'event_mode', coalesce((v_card.style->>'event_mode')::boolean, false),
    'hide', v_hide,
    'is_owner', (auth.uid() is not null and v_card.owner_id = auth.uid()),
    'owner', v_owner, 'socials', v_socials, 'experiences', v_expers);
end; $$;

grant execute on function public.get_public_card(text) to anon, authenticated, service_role;

-- 5. Fungsi melihat daftar leads/buku tamu untuk pemilik kartu
create or replace function public.get_card_leads(p_card_id uuid)
returns table(id uuid, action_type text, visitor_hash text, meta jsonb, created_at timestamptz)
language sql security definer set search_path = public as $$
  select a.id, a.action_type, a.visitor_hash, a.meta, a.created_at
  from public.card_actions a
  join public.cards c on c.id = a.card_id
  where a.card_id = p_card_id
    and (c.owner_id = auth.uid() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'ADMIN'))
    and a.action_type = 'lead_exchange'
  order by a.created_at desc;
$$;

grant execute on function public.get_card_leads(uuid) to authenticated;
