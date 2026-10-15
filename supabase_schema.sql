-- ============================================================================
-- CARDORA — Supabase schema v4 (lengkap, idempoten)
--
-- * Aman dijalankan pada project BARU maupun project yang sebelumnya sudah
--   pernah menjalankan schema Cardora (v2/v3): tabel/kolom yang kurang
--   ditambahkan, function & policy lama diganti.
-- * Tidak memerlukan SMTP: pengguna baru otomatis terkonfirmasi (trigger),
--   dan semua akun lama yang belum terkonfirmasi ikut dikonfirmasi.
-- * Customer mendaftar dari website. Admin TIDAK bisa mendaftar dari website;
--   admin dibuat dengan public.set_user_role() dari SQL Editor (lihat bawah).
--
-- Jalankan seluruh file ini sekali di Supabase → SQL Editor.
-- Jika ada error, seluruh perubahan dibatalkan (BEGIN/COMMIT) — perbaiki
-- error lalu jalankan ulang.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. ENUM
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.card_rarity as enum ('COMMON','RARE','EPIC','LEGENDARY','SECRET');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('PENDING','CONFIRMED','IN_PRODUCTION','SHIPPED','COMPLETED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.card_status as enum ('DRAFT','ACTIVE','SUSPENDED','LOST','RETIRED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_role as enum ('MEMBER','ADMIN');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. TABEL
-- ---------------------------------------------------------------------------

-- 2.1 profiles — satu baris per akun auth.users
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Member',
  username     text unique,
  avatar_url   text,
  bio          text,
  location     text,
  website_url  text,
  role         public.app_role not null default 'MEMBER',
  is_public    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-zA-Z0-9_.-]{3,30}$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 60),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 500)
);
alter table public.profiles
  add column if not exists avatar_url  text,
  add column if not exists bio         text,
  add column if not exists location    text,
  add column if not exists website_url text,
  add column if not exists role        public.app_role not null default 'MEMBER',
  add column if not exists is_public   boolean not null default true,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now();
do $$ begin
  alter table public.profiles add constraint profiles_website_http
    check (website_url is null or website_url ~* '^https?://') not valid;
exception when duplicate_object then null; end $$;

-- 2.2 profile_socials — tautan sosial (Instagram, dll.)
create table if not exists public.profile_socials (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform   text not null,
  label      text,
  url        text not null,
  sort_order smallint not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profile_socials_platform_length check (char_length(platform) between 1 and 40),
  constraint profile_socials_url_length check (char_length(url) between 1 and 2048),
  unique (profile_id, platform, url)
);
alter table public.profile_socials
  add column if not exists label      text,
  add column if not exists sort_order smallint not null default 0,
  add column if not exists is_visible boolean not null default true,
  add column if not exists created_at timestamptz not null default now();
do $$ begin
  alter table public.profile_socials add constraint profile_socials_url_http
    check (url ~* '^https?://') not valid;
exception when duplicate_object then null; end $$;
create index if not exists profile_socials_profile_idx on public.profile_socials(profile_id);

-- 2.3 cards — satu baris per kartu fisik/digital (halaman publik /c/KODE)
create table if not exists public.cards (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid references public.profiles(id) on delete set null,
  card_code            text not null unique,
  collection_number    integer not null,
  rarity               public.card_rarity not null default 'COMMON',
  status               public.card_status not null default 'DRAFT',
  display_name         text,
  title                text,
  card_front_image_url text,
  card_back_image_url  text,
  issued_at            timestamptz,
  activated_at         timestamptz,
  total_taps           bigint not null default 0,
  exp_bonus            integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint cards_code_format check (card_code ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'),
  constraint cards_collection_number_positive check (collection_number > 0),
  constraint cards_total_taps_nonnegative check (total_taps >= 0),
  constraint cards_exp_bonus_nonnegative check (exp_bonus >= 0),
  constraint cards_display_name_length check (display_name is null or char_length(display_name) <= 80)
);
alter table public.cards
  add column if not exists owner_id             uuid references public.profiles(id) on delete set null,
  add column if not exists display_name         text,
  add column if not exists title                text,
  add column if not exists card_front_image_url text,
  add column if not exists card_back_image_url  text,
  add column if not exists issued_at            timestamptz,
  add column if not exists activated_at         timestamptz,
  add column if not exists total_taps           bigint  not null default 0,
  add column if not exists exp_bonus            integer not null default 0,
  add column if not exists updated_at           timestamptz not null default now();
create index if not exists cards_owner_id_idx on public.cards(owner_id);
create index if not exists cards_status_idx   on public.cards(status);
create index if not exists cards_rarity_idx   on public.cards(rarity);

-- 2.4 card_ownership_history — riwayat pemilik kartu
create table if not exists public.card_ownership_history (
  id                uuid primary key default gen_random_uuid(),
  card_id           uuid not null references public.cards(id) on delete cascade,
  previous_owner_id uuid references public.profiles(id) on delete set null,
  new_owner_id      uuid references public.profiles(id) on delete set null,
  changed_by        uuid references public.profiles(id) on delete set null,
  note              text,
  changed_at        timestamptz not null default now()
);
create index if not exists card_ownership_card_idx
  on public.card_ownership_history(card_id, changed_at desc);

-- 2.5 card_taps — kunjungan unik (satu per kartu per pengunjung per hari)
create table if not exists public.card_taps (
  id                bigint generated always as identity primary key,
  card_id           uuid not null references public.cards(id) on delete cascade,
  visitor_hash      text not null,
  visited_on        date not null default ((now() at time zone 'utc')::date),
  tap_count         integer not null default 1,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  user_agent_family text,
  referrer_domain   text,
  constraint card_taps_visitor_hash_length check (char_length(visitor_hash) between 32 and 128),
  constraint card_taps_count_positive check (tap_count > 0),
  unique (card_id, visitor_hash, visited_on)
);
create index if not exists card_taps_card_day_idx on public.card_taps(card_id, visited_on desc);
create index if not exists card_taps_day_idx      on public.card_taps(visited_on desc);

-- 2.6 orders — pesanan kartu
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique,
  member_id         uuid references public.profiles(id) on delete set null,
  customer_name     text not null,
  email             text not null,
  phone             text,
  shipping_address  text,
  card_type         text not null default 'STANDARD',
  quantity          integer not null default 1,
  rarity            public.card_rarity,
  unit_price        numeric(12,2),
  total_price       numeric(12,2),
  currency          char(3) not null default 'IDR',
  status            public.order_status not null default 'PENDING',
  customer_note     text,
  admin_note        text,
  payment_reference text,
  paid_at           timestamptz,
  shipped_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint orders_customer_name_length check (char_length(customer_name) between 1 and 120),
  constraint orders_email_length check (char_length(email) between 3 and 254),
  constraint orders_quantity_range check (quantity between 1 and 100),
  constraint orders_prices_nonnegative check (
    (unit_price is null or unit_price >= 0) and (total_price is null or total_price >= 0)),
  constraint orders_note_length check (customer_note is null or char_length(customer_note) <= 2000)
);
alter table public.orders
  add column if not exists phone             text,
  add column if not exists shipping_address  text,
  add column if not exists rarity            public.card_rarity,
  add column if not exists unit_price        numeric(12,2),
  add column if not exists total_price       numeric(12,2),
  add column if not exists currency          char(3) not null default 'IDR',
  add column if not exists customer_note     text,
  add column if not exists admin_note        text,
  add column if not exists payment_reference text,
  add column if not exists paid_at           timestamptz,
  add column if not exists shipped_at        timestamptz,
  add column if not exists completed_at      timestamptz,
  add column if not exists updated_at        timestamptz not null default now();
do $$ begin
  alter table public.orders add constraint orders_contact_length
    check ((phone is null or char_length(phone) <= 30)
       and (shipping_address is null or char_length(shipping_address) <= 500)
       and (admin_note is null or char_length(admin_note) <= 2000)) not valid;
exception when duplicate_object then null; end $$;
create index if not exists orders_member_id_idx      on public.orders(member_id);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists orders_created_at_idx     on public.orders(created_at desc);

-- 2.7 order_cards — kartu yang diproduksi untuk sebuah pesanan
create table if not exists public.order_cards (
  order_id   uuid not null references public.orders(id) on delete cascade,
  card_id    uuid not null references public.cards(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (order_id, card_id),
  unique (card_id)
);

-- 2.8 exp_adjustments — audit bonus/pengurangan EXP oleh admin
create table if not exists public.exp_adjustments (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards(id) on delete cascade,
  admin_id   uuid references public.profiles(id) on delete set null,
  amount     integer not null,
  reason     text not null,
  created_at timestamptz not null default now(),
  constraint exp_adjustments_nonzero check (amount <> 0),
  constraint exp_adjustments_reason_length check (char_length(reason) between 3 and 500)
);
create index if not exists exp_adjustments_card_idx on public.exp_adjustments(card_id, created_at desc);

-- 2.9 exp_settings — pengaturan EXP (satu baris)
create table if not exists public.exp_settings (
  id                         smallint primary key default 1 check (id = 1),
  exp_per_unique_daily_visit integer not null default 10,
  exp_per_level              integer not null default 100,
  updated_at                 timestamptz not null default now(),
  constraint exp_settings_visit_exp_nonnegative check (exp_per_unique_daily_visit >= 0),
  constraint exp_settings_level_positive check (exp_per_level > 0)
);
insert into public.exp_settings (id) values (1) on conflict (id) do nothing;

-- 2.10 rarity_prices — harga resmi per rarity (dibaca publik, diubah admin)
create table if not exists public.rarity_prices (
  rarity     public.card_rarity primary key,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.rarity_prices(rarity, unit_price) values
  ('COMMON',79000),('RARE',129000),('EPIC',199000),('LEGENDARY',299000),('SECRET',499000)
on conflict (rarity) do nothing;

-- ---------------------------------------------------------------------------
-- 3. FUNCTION & TRIGGER DASAR
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at before update on public.cards
  for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
drop trigger if exists exp_settings_set_updated_at on public.exp_settings;
create trigger exp_settings_set_updated_at before update on public.exp_settings
  for each row execute function public.set_updated_at();
drop trigger if exists rarity_prices_set_updated_at on public.rarity_prices;
create trigger rarity_prices_set_updated_at before update on public.rarity_prices
  for each row execute function public.set_updated_at();

-- Cek admin (dipakai RLS dan function admin)
create or replace function public.is_cardora_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN');
$$;

create or replace function public.require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_cardora_admin() then
    raise exception 'Akses administrator diperlukan' using errcode = '42501';
  end if;
end; $$;

-- Member tidak boleh mengubah role-nya sendiri. (Dari SQL Editor auth.uid()
-- bernilai null, jadi set_user_role() di bawah tetap bisa dipakai.)
create or replace function public.prevent_profile_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    raise exception 'Role hanya dapat diubah oleh administrator melalui SQL Editor';
  end if;
  return new;
end; $$;
drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation before update on public.profiles
  for each row execute function public.prevent_profile_role_escalation();

-- ---------------------------------------------------------------------------
-- 4. AUTH TANPA SMTP
-- ---------------------------------------------------------------------------

-- 4.1 Profil dibuat otomatis saat akun baru dibuat. Tidak pernah memblokir
--     pendaftaran: kalau insert gagal, profil dibuat ulang saat login lewat
--     public.ensure_my_profile().
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_user text;
begin
  v_name := left(btrim(coalesce(
              nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
              nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
              'Member')), 60);
  if char_length(v_name) < 1 then v_name := 'Member'; end if;

  v_user := nullif(new.raw_user_meta_data->>'username', '');
  if v_user is not null and v_user !~ '^[a-zA-Z0-9_.-]{3,30}$' then v_user := null; end if;

  begin
    insert into public.profiles (id, display_name, username)
    values (new.id, v_name, v_user)
    on conflict (id) do nothing;
  exception when others then
    begin
      insert into public.profiles (id, display_name)
      values (new.id, v_name)
      on conflict (id) do nothing;
    exception when others then
      raise warning 'Cardora: profil % gagal dibuat: %', new.id, sqlerrm;
    end;
  end;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 4.2 Konfirmasi email otomatis (tidak perlu SMTP).
--     CATATAN: di Supabase Dashboard tetap matikan "Confirm email"
--     (Authentication → Providers → Email) agar Supabase tidak mencoba
--     mengirim email konfirmasi sama sekali.
create or replace function public.autoconfirm_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists autoconfirm_before_insert on auth.users;
create trigger autoconfirm_before_insert
  before insert on auth.users
  for each row execute function public.autoconfirm_new_auth_user();

-- 4.3 Pemulihan profil: dipanggil frontend bila profil belum ada.
create or replace function public.ensure_my_profile()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  v_user    auth.users%rowtype;
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if found then return v_profile; end if;

  select * into v_user from auth.users where id = auth.uid();
  if not found then raise exception 'Akun tidak ditemukan'; end if;

  insert into public.profiles (id, display_name)
  values (v_user.id, left(coalesce(
            nullif(btrim(v_user.raw_user_meta_data->>'display_name'), ''),
            nullif(split_part(coalesce(v_user.email, ''), '@', 1), ''),
            'Member'), 60))
  on conflict (id) do nothing;

  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end; $$;

-- 4.4 Ubah role dari SQL Editor (bukan dari website):
--       select public.set_user_role('admin@email.com', 'ADMIN');
create or replace function public.set_user_role(p_email text, p_role public.app_role)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then raise exception 'Akun dengan email % tidak ditemukan', p_email; end if;
  insert into public.profiles (id, display_name)
  select u.id, left(coalesce(nullif(split_part(coalesce(u.email,''),'@',1),''),'Member'),60)
  from auth.users u where u.id = v_id
  on conflict (id) do nothing;
  update public.profiles set role = p_role where id = v_id;
  return format('%s sekarang berperan %s', p_email, p_role);
end; $$;

-- ---------------------------------------------------------------------------
-- 5. EXP & LEVEL
-- ---------------------------------------------------------------------------
create or replace function public.card_exp(p_card_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select count(*) from public.card_taps t where t.card_id = p_card_id), 0)::bigint
         * coalesce((select s.exp_per_unique_daily_visit from public.exp_settings s where s.id = 1), 10)::bigint
         + coalesce((select c.exp_bonus from public.cards c where c.id = p_card_id), 0)::bigint;
$$;

create or replace function public.card_level(p_card_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select floor(public.card_exp(p_card_id)::numeric
         / greatest(1, coalesce((select s.exp_per_level from public.exp_settings s where s.id = 1), 100)))::bigint + 1;
$$;

-- Dipanggil HANYA oleh API server (service_role) — lihat api/visit.js.
drop function if exists public.register_card_visit(text, text, text, text);
create function public.register_card_visit(
  p_card_code text,
  p_visitor_hash text,
  p_user_agent_family text default null,
  p_referrer_domain text default null
) returns table(out_card_id uuid, out_eligible boolean, out_exp bigint, out_level bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_card public.cards%rowtype;
  v_new  boolean := false;
begin
  if p_visitor_hash is null or char_length(p_visitor_hash) < 32 or char_length(p_visitor_hash) > 128 then
    raise exception 'Invalid visitor key';
  end if;

  select * into v_card from public.cards
  where cards.card_code = upper(btrim(p_card_code)) and cards.status = 'ACTIVE'
  for update;
  if not found then raise exception 'Card not found or inactive'; end if;

  insert into public.card_taps (card_id, visitor_hash, visited_on, user_agent_family, referrer_domain)
  values (v_card.id, p_visitor_hash, (now() at time zone 'utc')::date,
          left(p_user_agent_family, 80), left(p_referrer_domain, 255))
  on conflict (card_id, visitor_hash, visited_on)
  do update set tap_count = public.card_taps.tap_count + 1, last_seen_at = now()
  returning (xmax = 0) into v_new;

  update public.cards
     set total_taps = (select count(*) from public.card_taps where card_taps.card_id = v_card.id)
   where id = v_card.id;

  return query select v_card.id, v_new, public.card_exp(v_card.id), public.card_level(v_card.id);
end; $$;

-- Fungsi pencatatan tap kartu fisik (dapat dipanggil oleh klien publik)
create or replace function public.record_card_tap(
  p_card_code text,
  p_visitor_hash text default null,
  p_user_agent_family text default null,
  p_referrer_domain text default null
) returns table(out_card_id uuid, out_eligible boolean, out_exp bigint, out_level bigint, out_taps bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_card public.cards%rowtype;
  v_new  boolean := false;
  v_hash text;
  v_total bigint;
begin
  select * into v_card from public.cards
  where cards.card_code = upper(btrim(coalesce(p_card_code, ''))) and cards.status = 'ACTIVE'
  for update;
  if not found then raise exception 'Card not found or inactive'; end if;

  v_hash := coalesce(p_visitor_hash, md5(coalesce(auth.uid()::text, '') || clock_timestamp()::text || random()::text));
  if char_length(v_hash) < 32 then
    v_hash := rpad(v_hash, 32, '0');
  elsif char_length(v_hash) > 128 then
    v_hash := left(v_hash, 128);
  end if;

  insert into public.card_taps (card_id, visitor_hash, visited_on, user_agent_family, referrer_domain)
  values (v_card.id, v_hash, (now() at time zone 'utc')::date,
          left(p_user_agent_family, 80), left(p_referrer_domain, 255))
  on conflict (card_id, visitor_hash, visited_on)
  do update set tap_count = public.card_taps.tap_count + 1, last_seen_at = now()
  returning (xmax = 0) into v_new;

  update public.cards
     set total_taps = (select count(*) from public.card_taps where card_taps.card_id = v_card.id)
   where id = v_card.id;

  select total_taps into v_total from public.cards where id = v_card.id;

  return query select v_card.id, v_new, public.card_exp(v_card.id), public.card_level(v_card.id), coalesce(v_total, 0);
end; $$;

-- ---------------------------------------------------------------------------
-- 6. HALAMAN PUBLIK KARTU & DASHBOARD MEMBER
-- ---------------------------------------------------------------------------

-- Data halaman /c/KODE untuk siapa pun (hanya kartu ACTIVE, profil publik).
create or replace function public.get_public_card(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_card    public.cards%rowtype;
  v_prof    public.profiles%rowtype;
  v_per     integer;
  v_exp     bigint;
  v_owner   jsonb := null;
  v_socials jsonb := '[]'::jsonb;
  v_first   timestamptz;
begin
  select * into v_card from public.cards
  where card_code = upper(btrim(coalesce(p_code, ''))) and status = 'ACTIVE';
  if not found then return null; end if;

  select s.exp_per_level into v_per from public.exp_settings s where s.id = 1;
  v_per := greatest(1, coalesce(v_per, 100));
  v_exp := public.card_exp(v_card.id);

  if v_card.owner_id is not null then
    select * into v_prof from public.profiles where id = v_card.owner_id and is_public = true;
    if found then
      v_owner := jsonb_build_object(
        'display_name', v_prof.display_name, 'username', v_prof.username,
        'avatar_url', v_prof.avatar_url, 'bio', v_prof.bio, 'location', v_prof.location,
        'website_url', v_prof.website_url, 'joined_at', v_prof.created_at);
      select coalesce(jsonb_agg(jsonb_build_object('platform', so.platform, 'label', so.label, 'url', so.url)
                                order by so.sort_order, so.created_at), '[]'::jsonb)
        into v_socials
        from public.profile_socials so
       where so.profile_id = v_prof.id and so.is_visible = true;
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
    'owner', v_owner, 'socials', v_socials);
end; $$;

-- Ringkasan dashboard member (kartu milik sendiri).
create or replace function public.member_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cards jsonb;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'code', c.card_code, 'number', c.collection_number, 'rarity', c.rarity,
           'status', c.status, 'display_name', c.display_name,
           'exp', public.card_exp(c.id), 'level', public.card_level(c.id), 'taps', c.total_taps)
         order by c.created_at), '[]'::jsonb)
    into v_cards
    from public.cards c where c.owner_id = auth.uid();

  return jsonb_build_object(
    'cards', v_cards,
    'card_count', jsonb_array_length(v_cards),
    'total_exp', coalesce((select sum((x->>'exp')::bigint) from jsonb_array_elements(v_cards) x), 0),
    'top_level', coalesce((select max((x->>'level')::bigint) from jsonb_array_elements(v_cards) x), 0),
    'total_taps', coalesce((select sum((x->>'taps')::bigint) from jsonb_array_elements(v_cards) x), 0));
end; $$;

-- ---------------------------------------------------------------------------
-- 7. PESANAN
-- ---------------------------------------------------------------------------
drop function if exists public.create_cardora_order(public.card_rarity, integer, text, text);
drop function if exists public.create_cardora_order(public.card_rarity, integer, text, text, text, text);
create function public.create_cardora_order(
  p_rarity           public.card_rarity,
  p_quantity         integer,
  p_phone            text,
  p_shipping_address text,
  p_card_type        text default 'Kartu baru',
  p_customer_note    text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_user    auth.users%rowtype;
  v_profile public.profiles%rowtype;
  v_price   numeric(12,2);
  v_phone   text := btrim(coalesce(p_phone, ''));
  v_addr    text := btrim(coalesce(p_shipping_address, ''));
  v_order   public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then raise exception 'Jumlah tidak valid'; end if;
  if p_card_type is null or p_card_type not in ('Kartu baru','Kartu custom','Penggantian kartu') then
    raise exception 'Jenis kartu tidak valid';
  end if;
  if v_phone !~ '^[0-9+() -]{6,30}$' then raise exception 'Nomor telepon tidak valid'; end if;
  if char_length(v_addr) < 10 or char_length(v_addr) > 500 then raise exception 'Alamat pengiriman harus 10–500 karakter'; end if;
  if p_customer_note is not null and char_length(p_customer_note) > 2000 then raise exception 'Catatan terlalu panjang'; end if;

  select * into v_user from auth.users where id = auth.uid();
  select * into v_profile from public.profiles where id = auth.uid();
  if v_user.id is null or v_profile.id is null then raise exception 'Profil pengguna tidak ditemukan'; end if;

  if (select count(*) from public.orders where member_id = auth.uid() and status = 'PENDING') >= 20 then
    raise exception 'Terlalu banyak pesanan yang belum dikonfirmasi';
  end if;

  select unit_price into v_price from public.rarity_prices where rarity = p_rarity and active = true;
  if v_price is null then raise exception 'Jenis kartu tidak tersedia'; end if;

  insert into public.orders (order_number, member_id, customer_name, email, phone, shipping_address,
                             card_type, quantity, rarity, unit_price, total_price, currency, status, customer_note)
  values ('CDR-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' ||
            upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          auth.uid(), v_profile.display_name, v_user.email, v_phone, v_addr,
          p_card_type, p_quantity, p_rarity, v_price, v_price * p_quantity, 'IDR', 'PENDING',
          nullif(btrim(p_customer_note), ''))
  returning * into v_order;
  return v_order;
end; $$;

drop function if exists public.admin_update_order_status(uuid, public.order_status);
create function public.admin_update_order_status(
  p_order_id   uuid,
  p_status     public.order_status,
  p_admin_note text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  perform public.require_admin();
  if p_status is null then raise exception 'Status tidak valid'; end if;
  update public.orders set
    status       = p_status,
    admin_note   = coalesce(nullif(btrim(p_admin_note), ''), admin_note),
    shipped_at   = case when p_status = 'SHIPPED'   then coalesce(shipped_at, now())   else shipped_at end,
    completed_at = case when p_status = 'COMPLETED' then coalesce(completed_at, now()) else completed_at end
  where id = p_order_id
  returning * into v_order;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  return v_order;
end; $$;

-- ---------------------------------------------------------------------------
-- 8. FUNCTION ADMIN (semua memanggil require_admin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'total_orders',   (select count(*) from public.orders),
    'pending_orders', (select count(*) from public.orders where status = 'PENDING'),
    'total_cards',    (select count(*) from public.cards),
    'active_cards',   (select count(*) from public.cards where status = 'ACTIVE'),
    'members',        (select count(*) from public.profiles where role = 'MEMBER'),
    'taps_today',     (select coalesce(sum(tap_count), 0) from public.card_taps
                        where visited_on = (now() at time zone 'utc')::date));
end; $$;

create or replace function public.admin_list_members()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'email', u.email, 'display_name', p.display_name, 'username', p.username,
      'role', p.role, 'created_at', p.created_at,
      'order_count', (select count(*) from public.orders o where o.member_id = p.id),
      'card_count',  (select count(*) from public.cards c where c.owner_id = p.id)
    ) order by p.created_at desc)
    from public.profiles p left join auth.users u on u.id = p.id
  ), '[]'::jsonb);
end; $$;

create or replace function public.admin_list_cards()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.card_code, 'number', c.collection_number, 'rarity', c.rarity,
      'status', c.status, 'display_name', c.display_name, 'title', c.title,
      'owner_id', c.owner_id, 'owner_name', p.display_name, 'owner_email', u.email,
      'taps', c.total_taps, 'exp_bonus', c.exp_bonus,
      'order_id', oc.order_id, 'order_number', o.order_number,
      'exp', public.card_exp(c.id), 'level', public.card_level(c.id), 'created_at', c.created_at
    ) order by c.created_at desc)
    from public.cards c
    left join public.profiles p on p.id = c.owner_id
    left join auth.users u on u.id = c.owner_id
    left join public.order_cards oc on oc.card_id = c.id
    left join public.orders o on o.id = oc.order_id
  ), '[]'::jsonb);
end; $$;

create or replace function public.admin_create_card(
  p_code         text,
  p_rarity       public.card_rarity,
  p_status       public.card_status default 'DRAFT',
  p_number       integer default null,
  p_display_name text default null,
  p_title        text default null
) returns public.cards
language plpgsql security definer set search_path = public as $$
declare
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_status public.card_status := coalesce(p_status, 'DRAFT');
  v_num    integer;
  v_card   public.cards%rowtype;
begin
  perform public.require_admin();
  if v_code !~ '^[A-Z0-9][A-Z0-9-]{2,39}$' then
    raise exception 'Kode kartu harus 3–40 karakter: huruf besar, angka, atau tanda strip';
  end if;
  v_num := coalesce(p_number, (select coalesce(max(collection_number), 0) + 1 from public.cards));
  if v_num < 1 then raise exception 'Nomor koleksi harus lebih dari 0'; end if;

  insert into public.cards (card_code, collection_number, rarity, status, display_name, title, issued_at, activated_at)
  values (v_code, v_num, p_rarity, v_status, nullif(btrim(p_display_name), ''), nullif(btrim(p_title), ''),
          case when v_status = 'ACTIVE' then now() end,
          case when v_status = 'ACTIVE' then now() end)
  returning * into v_card;
  return v_card;
exception when unique_violation then
  raise exception 'Kode kartu % sudah digunakan', v_code;
end; $$;

create or replace function public.admin_set_card_status(p_card_id uuid, p_status public.card_status)
returns public.cards language plpgsql security definer set search_path = public as $$
declare v_card public.cards%rowtype;
begin
  perform public.require_admin();
  if p_status is null then raise exception 'Status tidak valid'; end if;
  update public.cards set
    status       = p_status,
    issued_at    = case when p_status = 'ACTIVE' then coalesce(issued_at, now())    else issued_at end,
    activated_at = case when p_status = 'ACTIVE' then coalesce(activated_at, now()) else activated_at end
  where id = p_card_id returning * into v_card;
  if not found then raise exception 'Kartu tidak ditemukan'; end if;
  return v_card;
end; $$;

-- Pindahkan kartu ke member (berdasarkan email). Email kosong = lepas pemilik.
create or replace function public.admin_assign_card(p_card_id uuid, p_owner_email text)
returns public.cards language plpgsql security definer set search_path = public as $$
declare
  v_old  uuid;
  v_new  uuid := null;
  v_mail text := btrim(coalesce(p_owner_email, ''));
  v_card public.cards%rowtype;
begin
  perform public.require_admin();
  select owner_id into v_old from public.cards where id = p_card_id;
  if not found then raise exception 'Kartu tidak ditemukan'; end if;

  if v_mail <> '' then
    select u.id into v_new from auth.users u
     where lower(u.email) = lower(v_mail) and exists (select 1 from public.profiles p where p.id = u.id);
    if v_new is null then raise exception 'Member dengan email % tidak ditemukan', v_mail; end if;
  end if;

  update public.cards set owner_id = v_new where id = p_card_id returning * into v_card;
  insert into public.card_ownership_history (card_id, previous_owner_id, new_owner_id, changed_by, note)
  values (p_card_id, v_old, v_new, auth.uid(), 'Diubah oleh administrator');
  return v_card;
end; $$;

create or replace function public.admin_adjust_exp(p_card_id uuid, p_amount integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_card public.cards%rowtype;
begin
  perform public.require_admin();
  if p_amount is null or p_amount = 0 then raise exception 'Jumlah EXP tidak boleh 0'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Alasan minimal 3 karakter'; end if;
  select * into v_card from public.cards where id = p_card_id for update;
  if not found then raise exception 'Kartu tidak ditemukan'; end if;
  if v_card.exp_bonus + p_amount < 0 then raise exception 'Bonus EXP tidak boleh kurang dari 0'; end if;

  update public.cards set exp_bonus = exp_bonus + p_amount where id = p_card_id;
  insert into public.exp_adjustments (card_id, admin_id, amount, reason)
  values (p_card_id, auth.uid(), p_amount, btrim(p_reason));
  return jsonb_build_object('exp', public.card_exp(p_card_id), 'level', public.card_level(p_card_id));
end; $$;

create or replace function public.admin_set_rarity_price(p_rarity public.card_rarity, p_price numeric, p_active boolean)
returns public.rarity_prices language plpgsql security definer set search_path = public as $$
declare v_row public.rarity_prices%rowtype;
begin
  perform public.require_admin();
  if p_price is null or p_price < 0 or p_price > 100000000 then raise exception 'Harga tidak valid'; end if;
  insert into public.rarity_prices (rarity, unit_price, active)
  values (p_rarity, p_price, coalesce(p_active, true))
  on conflict (rarity) do update set unit_price = excluded.unit_price, active = excluded.active
  returning * into v_row;
  return v_row;
end; $$;

create or replace function public.admin_set_exp_settings(p_visit_exp integer, p_per_level integer)
returns public.exp_settings language plpgsql security definer set search_path = public as $$
declare v_row public.exp_settings%rowtype;
begin
  perform public.require_admin();
  if p_visit_exp is null or p_visit_exp < 0 or p_visit_exp > 100000 then raise exception 'EXP per kunjungan tidak valid'; end if;
  if p_per_level is null or p_per_level < 1 or p_per_level > 1000000 then raise exception 'EXP per level tidak valid'; end if;
  insert into public.exp_settings (id, exp_per_unique_daily_visit, exp_per_level)
  values (1, p_visit_exp, p_per_level)
  on conflict (id) do update
    set exp_per_unique_daily_visit = excluded.exp_per_unique_daily_visit,
        exp_per_level = excluded.exp_per_level
  returning * into v_row;
  return v_row;
end; $$;

-- ---------------------------------------------------------------------------
-- 8b. TAUTKAN KARTU NFC KE PESANAN (admin)
--     order_cards = kartu fisik yang diproduksi untuk sebuah pesanan.
--     Menautkan kartu otomatis menjadikan member pemesan sebagai pemilik kartu.
-- ---------------------------------------------------------------------------

-- Inti logika tautan (internal, tidak bisa dipanggil langsung dari client).
create or replace function public.link_card_to_order_internal(
  p_order_id uuid, p_card_id uuid, p_activate boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_card  public.cards%rowtype;
  v_count integer;
  v_old   uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if v_order.status in ('PENDING', 'CANCELLED') then
    raise exception 'Pesanan berstatus % belum bisa ditautkan kartu. Konfirmasi pesanan terlebih dahulu.', v_order.status;
  end if;
  if v_order.member_id is null then
    raise exception 'Pesanan ini tidak terhubung ke akun member (akun sudah dihapus)';
  end if;

  select * into v_card from public.cards where id = p_card_id for update;
  if not found then raise exception 'Kartu tidak ditemukan'; end if;
  if v_card.status in ('LOST', 'RETIRED') then
    raise exception 'Kartu % berstatus % dan tidak dapat ditautkan', v_card.card_code, v_card.status;
  end if;
  if exists (select 1 from public.order_cards where card_id = p_card_id) then
    raise exception 'Kartu % sudah ditautkan ke pesanan lain', v_card.card_code;
  end if;
  if v_order.rarity is not null and v_card.rarity <> v_order.rarity then
    raise exception 'Rarity kartu % (%) tidak sesuai dengan pesanan (%)', v_card.card_code, v_card.rarity, v_order.rarity;
  end if;
  if v_card.owner_id is not null and v_card.owner_id <> v_order.member_id then
    raise exception 'Kartu % sudah dimiliki member lain. Lepas pemilik lebih dulu lewat tab Kartu.', v_card.card_code;
  end if;

  select count(*) into v_count from public.order_cards where order_id = p_order_id;
  if v_count >= v_order.quantity then
    raise exception 'Seluruh % kartu pada pesanan ini sudah ditautkan', v_order.quantity;
  end if;

  insert into public.order_cards (order_id, card_id) values (p_order_id, p_card_id);

  v_old := v_card.owner_id;
  update public.cards set
    owner_id     = v_order.member_id,
    status       = case when p_activate and status = 'DRAFT' then 'ACTIVE'::public.card_status else status end,
    issued_at    = case when p_activate and status = 'DRAFT' then coalesce(issued_at, now())    else issued_at end,
    activated_at = case when p_activate and status = 'DRAFT' then coalesce(activated_at, now()) else activated_at end
  where id = p_card_id
  returning * into v_card;

  if v_old is distinct from v_order.member_id then
    insert into public.card_ownership_history (card_id, previous_owner_id, new_owner_id, changed_by, note)
    values (p_card_id, v_old, v_order.member_id, auth.uid(), 'Ditautkan ke pesanan ' || v_order.order_number);
  end if;

  return jsonb_build_object(
    'order_id', p_order_id, 'card_id', p_card_id, 'code', v_card.card_code,
    'status', v_card.status, 'linked', v_count + 1, 'quantity', v_order.quantity);
end; $$;

-- Tautkan kartu yang SUDAH ADA (dibuat di tab Kartu) ke sebuah pesanan.
create or replace function public.admin_link_card_to_order(
  p_order_id uuid, p_card_id uuid, p_activate boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  return public.link_card_to_order_internal(p_order_id, p_card_id, coalesce(p_activate, true));
end; $$;

-- Buat kartu baru (rarity mengikuti pesanan) lalu langsung tautkan. Atomik:
-- bila penautan gagal, kartu baru ikut dibatalkan.
create or replace function public.admin_issue_order_card(
  p_order_id     uuid,
  p_code         text,
  p_display_name text    default null,
  p_title        text    default null,
  p_activate     boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_id    uuid;
begin
  perform public.require_admin();
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if v_order.rarity is null then
    raise exception 'Pesanan ini tidak memiliki rarity. Buat kartu lewat tab Kartu lalu tautkan.';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9-]{2,39}$' then
    raise exception 'Kode kartu harus 3–40 karakter: huruf besar, angka, atau tanda strip';
  end if;

  insert into public.cards (card_code, collection_number, rarity, status, display_name, title)
  values (v_code, (select coalesce(max(collection_number), 0) + 1 from public.cards),
          v_order.rarity, 'DRAFT', nullif(btrim(p_display_name), ''), nullif(btrim(p_title), ''))
  returning id into v_id;

  return public.link_card_to_order_internal(p_order_id, v_id, coalesce(p_activate, true));
exception when unique_violation then
  raise exception 'Kode kartu % sudah digunakan', v_code;
end; $$;

-- Lepas tautan kartu dari pesanan (koreksi salah tautan). Pemilik kartu
-- dilepas bila masih member pemesan; status kartu tidak diubah.
create or replace function public.admin_unlink_order_card(p_order_id uuid, p_card_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_code  text;
begin
  perform public.require_admin();
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;

  delete from public.order_cards where order_id = p_order_id and card_id = p_card_id;
  if not found then raise exception 'Kartu ini tidak tertaut pada pesanan tersebut'; end if;

  update public.cards set owner_id = null
   where id = p_card_id and owner_id is not distinct from v_order.member_id and owner_id is not null
  returning card_code into v_code;
  if found then
    insert into public.card_ownership_history (card_id, previous_owner_id, new_owner_id, changed_by, note)
    values (p_card_id, v_order.member_id, null, auth.uid(), 'Tautan ke pesanan ' || v_order.order_number || ' dilepas');
  end if;

  return jsonb_build_object('order_id', p_order_id, 'card_id', p_card_id,
    'linked', (select count(*) from public.order_cards where order_id = p_order_id));
end; $$;

-- ---------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.profile_socials         enable row level security;
alter table public.cards                   enable row level security;
alter table public.card_ownership_history  enable row level security;
alter table public.card_taps               enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_cards             enable row level security;
alter table public.exp_adjustments         enable row level security;
alter table public.exp_settings            enable row level security;
alter table public.rarity_prices           enable row level security;

-- Hapus semua policy lama (termasuk yang bersifat publik pada v2/v3)
drop policy if exists "Public profiles are viewable"        on public.profiles;
drop policy if exists "Members update own profile"          on public.profiles;
drop policy if exists "Members insert own profile"          on public.profiles;
drop policy if exists "Admins view all profiles"            on public.profiles;
drop policy if exists "Visible social links are public"     on public.profile_socials;
drop policy if exists "Members manage own social links"     on public.profile_socials;
drop policy if exists "Active cards are public"             on public.cards;
drop policy if exists "Card owners view tap records"        on public.card_taps;
drop policy if exists "Card owners view ownership history"  on public.card_ownership_history;
drop policy if exists "Members view own orders"             on public.orders;
drop policy if exists "Members create own orders"           on public.orders;
drop policy if exists "Admins update orders"                on public.orders;
drop policy if exists "Order owner sees linked cards"       on public.order_cards;
drop policy if exists "Active rarity prices are public"     on public.rarity_prices;

-- Data publik (kartu, profil pemilik, tautan sosial) hanya lewat get_public_card().
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_cardora_admin());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "socials_select_own_or_admin" on public.profile_socials
  for select to authenticated using (profile_id = auth.uid() or public.is_cardora_admin());
create policy "socials_manage_own" on public.profile_socials
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "cards_select_owner_or_admin" on public.cards
  for select to authenticated using (owner_id = auth.uid() or public.is_cardora_admin());

create policy "taps_select_owner_or_admin" on public.card_taps
  for select to authenticated using (
    public.is_cardora_admin()
    or exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));

create policy "ownership_select_owner_or_admin" on public.card_ownership_history
  for select to authenticated using (
    public.is_cardora_admin()
    or exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));

create policy "orders_select_own_or_admin" on public.orders
  for select to authenticated using (member_id = auth.uid() or public.is_cardora_admin());

create policy "order_cards_select_owner_or_admin" on public.order_cards
  for select to authenticated using (
    public.is_cardora_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.member_id = auth.uid()));

create policy "exp_adjustments_select_admin" on public.exp_adjustments
  for select to authenticated using (public.is_cardora_admin());
create policy "exp_settings_select_admin" on public.exp_settings
  for select to authenticated using (public.is_cardora_admin());

create policy "rarity_prices_select_active" on public.rarity_prices
  for select to anon, authenticated using (active = true);
create policy "rarity_prices_select_admin" on public.rarity_prices
  for select to authenticated using (public.is_cardora_admin());

-- ---------------------------------------------------------------------------
-- 10. HAK AKSES TABEL (lapisan kedua di atas RLS)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.profile_socials, public.cards,
              public.card_ownership_history, public.card_taps, public.orders,
              public.order_cards, public.exp_adjustments, public.exp_settings,
              public.rarity_prices
  from anon, authenticated;

grant select on public.profiles, public.profile_socials, public.cards,
                public.card_ownership_history, public.card_taps, public.orders,
                public.order_cards, public.exp_adjustments, public.exp_settings
  to authenticated;
grant select on public.rarity_prices to anon, authenticated;

-- Member hanya boleh mengubah kolom profil ini (bukan role/id).
grant update (display_name, username, avatar_url, bio, location, website_url, is_public)
  on public.profiles to authenticated;
grant insert, update, delete on public.profile_socials to authenticated;

grant all on public.profiles, public.profile_socials, public.cards,
             public.card_ownership_history, public.card_taps, public.orders,
             public.order_cards, public.exp_adjustments, public.exp_settings,
             public.rarity_prices
  to service_role;

-- ---------------------------------------------------------------------------
-- 11. HAK EKSEKUSI FUNCTION
-- ---------------------------------------------------------------------------
-- Tutup semua dulu, lalu buka seperlunya.
revoke all on function public.set_updated_at()                          from public, anon, authenticated;
revoke all on function public.handle_new_auth_user()                    from public, anon, authenticated;
revoke all on function public.autoconfirm_new_auth_user()               from public, anon, authenticated;
revoke all on function public.prevent_profile_role_escalation()         from public, anon, authenticated;
revoke all on function public.require_admin()                           from public, anon, authenticated;
revoke all on function public.card_exp(uuid)                            from public, anon, authenticated;
revoke all on function public.card_level(uuid)                          from public, anon, authenticated;
revoke all on function public.is_cardora_admin()                        from public, anon;
revoke all on function public.set_user_role(text, public.app_role)      from public, anon, authenticated;
revoke all on function public.register_card_visit(text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_public_card(text)                     from public;
revoke all on function public.ensure_my_profile()                       from public, anon;
revoke all on function public.member_dashboard()                        from public, anon;
revoke all on function public.create_cardora_order(public.card_rarity, integer, text, text, text, text) from public, anon;
revoke all on function public.admin_update_order_status(uuid, public.order_status, text) from public, anon;
revoke all on function public.admin_dashboard()                         from public, anon;
revoke all on function public.admin_list_members()                      from public, anon;
revoke all on function public.admin_list_cards()                        from public, anon;
revoke all on function public.admin_create_card(text, public.card_rarity, public.card_status, integer, text, text) from public, anon;
revoke all on function public.admin_set_card_status(uuid, public.card_status) from public, anon;
revoke all on function public.admin_assign_card(uuid, text)             from public, anon;
revoke all on function public.admin_adjust_exp(uuid, integer, text)     from public, anon;
revoke all on function public.admin_set_rarity_price(public.card_rarity, numeric, boolean) from public, anon;
revoke all on function public.admin_set_exp_settings(integer, integer)  from public, anon;
revoke all on function public.link_card_to_order_internal(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_link_card_to_order(uuid, uuid, boolean) from public, anon;
revoke all on function public.admin_issue_order_card(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.admin_unlink_order_card(uuid, uuid)       from public, anon;

grant execute on function public.get_public_card(text)                  to anon, authenticated;
grant execute on function public.is_cardora_admin()                     to authenticated, service_role;
grant execute on function public.ensure_my_profile()                    to authenticated;
grant execute on function public.member_dashboard()                     to authenticated;
grant execute on function public.create_cardora_order(public.card_rarity, integer, text, text, text, text) to authenticated;
grant execute on function public.admin_update_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.admin_dashboard()                      to authenticated;
grant execute on function public.admin_list_members()                   to authenticated;
grant execute on function public.admin_list_cards()                     to authenticated;
grant execute on function public.admin_create_card(text, public.card_rarity, public.card_status, integer, text, text) to authenticated;
grant execute on function public.admin_set_card_status(uuid, public.card_status) to authenticated;
grant execute on function public.admin_assign_card(uuid, text)          to authenticated;
grant execute on function public.admin_adjust_exp(uuid, integer, text)  to authenticated;
grant execute on function public.admin_set_rarity_price(public.card_rarity, numeric, boolean) to authenticated;
grant execute on function public.admin_set_exp_settings(integer, integer) to authenticated;
grant execute on function public.admin_link_card_to_order(uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_issue_order_card(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.register_card_visit(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.record_card_tap(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.set_user_role(text, public.app_role)   to service_role;

-- ---------------------------------------------------------------------------
-- 12. PERBAIKAN DATA AKUN YANG SUDAH ADA
-- ---------------------------------------------------------------------------
-- Akun lama yang belum punya profil (mis. trigger lama gagal)
insert into public.profiles (id, display_name)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
                     nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Member'), 60)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Tanpa SMTP, akun yang tertahan "email belum dikonfirmasi" dikonfirmasi.
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;

commit;

-- ============================================================================
-- LANGKAH SETELAH SQL INI (jalankan terpisah, satu per satu)
--
-- A) Buat akun admin — pilih salah satu:
--    1. Daftar lewat website sebagai customer, ATAU
--    2. Dashboard → Authentication → Users → Add user → Create new user
--       (isi email + password, centang "Auto Confirm User").
--
-- B) Jadikan akun itu admin (ganti email):
--      select public.set_user_role('admin@contoh.com', 'ADMIN');
--
-- C) Login admin: buka  https://DOMAIN-KAMU/admin-login
--    (tidak ada tautan ke halaman ini di website; hanya lewat URL).
--
-- D) Cek hasil instalasi:
--      select
--        (select count(*) from public.profiles where role = 'ADMIN') as admin,
--        (select count(*) from auth.users)                           as users,
--        (select count(*) from public.profiles)                      as profiles,
--        (select count(*) from public.rarity_prices)                 as harga;
--    "users" dan "profiles" harus sama.
-- ============================================================================
