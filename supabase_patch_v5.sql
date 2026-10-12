-- ===========================================================================
-- Cardora v5 patch — jalankan SEKALI di Supabase → SQL Editor (idempoten).
-- Menambahkan: kustomisasi tampilan kartu, profil profesional, pengalaman,
-- data tap untuk pemilik, dan versi baru get_public_card().
-- ===========================================================================

-- 1. Profil profesional ------------------------------------------------------
alter table public.profiles
  add column if not exists headline     text,
  add column if not exists company      text,
  add column if not exists public_email text,
  add column if not exists public_phone text;

do $$ begin
  alter table public.profiles add constraint profiles_headline_length
    check (headline is null or char_length(headline) <= 120) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_company_length
    check (company is null or char_length(company) <= 120) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_public_email_length
    check (public_email is null or char_length(public_email) <= 160) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_public_phone_format
    check (public_phone is null or public_phone ~ '^[0-9+() -]{6,30}$') not valid;
exception when duplicate_object then null; end $$;

-- 2. Pengalaman (riwayat kerja / pencapaian) --------------------------------
create table if not exists public.profile_experiences (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  org         text,
  start_year  smallint,
  end_year    smallint,
  description text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  constraint profile_exp_title_length check (char_length(title) between 1 and 120),
  constraint profile_exp_org_length   check (org is null or char_length(org) <= 120),
  constraint profile_exp_desc_length  check (description is null or char_length(description) <= 400),
  constraint profile_exp_years        check (
    (start_year is null or start_year between 1950 and 2100) and
    (end_year   is null or end_year   between 1950 and 2100))
);
create index if not exists profile_experiences_profile_idx on public.profile_experiences(profile_id, sort_order);

alter table public.profile_experiences enable row level security;
drop policy if exists "experiences_manage_own" on public.profile_experiences;
create policy "experiences_manage_own" on public.profile_experiences
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- 3. Gaya kartu (kustomisasi pemilik) ---------------------------------------
alter table public.cards
  add column if not exists style jsonb not null default '{}'::jsonb;

-- Pemilik mengubah tampilan kartunya. Hanya field yang diizinkan.
drop function if exists public.update_my_card_style(uuid, text, text, text, jsonb);
create function public.update_my_card_style(
  p_card_id      uuid,
  p_display_name text,
  p_title        text,
  p_front_image  text,
  p_style        jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_card  public.cards%rowtype;
  v_style jsonb := '{}'::jsonb;
  v_acc   text;
  v_img   text := nullif(btrim(coalesce(p_front_image, '')), '');
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  select * into v_card from public.cards where id = p_card_id and owner_id = auth.uid();
  if not found then raise exception 'Kartu bukan milikmu'; end if;

  if p_display_name is not null and char_length(btrim(p_display_name)) > 80 then
    raise exception 'Nama di kartu maksimal 80 karakter'; end if;
  if p_title is not null and char_length(btrim(p_title)) > 120 then
    raise exception 'Judul kartu maksimal 120 karakter'; end if;
  if v_img is not null and (v_img !~* '^https?://\S+$' or char_length(v_img) > 2048) then
    raise exception 'Alamat gambar harus diawali http:// atau https://'; end if;

  p_style := coalesce(p_style, '{}'::jsonb);
  v_acc := p_style->>'accent';
  if v_acc is not null and v_acc !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Warna aksen tidak valid'; end if;
  if v_acc is not null then v_style := v_style || jsonb_build_object('accent', lower(v_acc)); end if;

  if (p_style->>'layout') in ('classic','minimal','bold') then
    v_style := v_style || jsonb_build_object('layout', p_style->>'layout'); end if;
  if (p_style->>'bg') in ('art','gradient','solid') then
    v_style := v_style || jsonb_build_object('bg', p_style->>'bg'); end if;
  if (p_style->>'font') in ('modern','serif','mono') then
    v_style := v_style || jsonb_build_object('font', p_style->>'font'); end if;
  if (p_style->>'holo') in ('true','false') then
    v_style := v_style || jsonb_build_object('holo', (p_style->>'holo')::boolean); end if;
  if (p_style->>'show_taps') in ('true','false') then
    v_style := v_style || jsonb_build_object('show_taps', (p_style->>'show_taps')::boolean); end if;

  update public.cards set
    display_name         = nullif(btrim(p_display_name), ''),
    title                = nullif(btrim(p_title), ''),
    card_front_image_url = v_img,
    style                = v_style
  where id = v_card.id;

  return v_style;
end; $$;

-- 4. Data tap untuk pemilik kartu --------------------------------------------
drop function if exists public.member_card_taps(uuid);
create function public.member_card_taps(p_card_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_card public.cards%rowtype;
  v_days jsonb;
  v_recent jsonb;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  select * into v_card from public.cards where id = p_card_id and owner_id = auth.uid();
  if not found then raise exception 'Kartu bukan milikmu'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'visitors', coalesce(x.v, 0), 'taps', coalesce(x.t, 0))
                            order by d), '[]'::jsonb)
    into v_days
    from generate_series(((now() at time zone 'utc')::date - 13)::timestamp, ((now() at time zone 'utc')::date)::timestamp, interval '1 day') d
    left join (
      select visited_on, count(*) v, sum(tap_count) t
      from public.card_taps where card_id = v_card.id group by visited_on
    ) x on x.visited_on = d::date;

  select coalesce(jsonb_agg(r order by r.last_seen_at desc), '[]'::jsonb)
    into v_recent
    from (
      select visited_on, tap_count, user_agent_family, referrer_domain, first_seen_at, last_seen_at
      from public.card_taps where card_id = v_card.id
      order by last_seen_at desc limit 30
    ) r;

  return jsonb_build_object(
    'total_taps',      coalesce((select sum(tap_count) from public.card_taps where card_id = v_card.id), 0),
    'unique_visitors', (select count(*) from public.card_taps where card_id = v_card.id),
    'today',           coalesce((select sum(tap_count) from public.card_taps
                                  where card_id = v_card.id and visited_on = (now() at time zone 'utc')::date), 0),
    'last_tap_at',     (select max(last_seen_at) from public.card_taps where card_id = v_card.id),
    'days',            v_days,
    'recent',          v_recent);
end; $$;

-- 5. get_public_card versi baru (profil profesional, pengalaman, gaya) -------
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
        'website_url', v_prof.website_url, 'joined_at', v_prof.created_at,
        'headline', v_prof.headline, 'company', v_prof.company,
        'public_email', v_prof.public_email, 'public_phone', v_prof.public_phone);
      select coalesce(jsonb_agg(jsonb_build_object('platform', so.platform, 'label', so.label, 'url', so.url)
                                order by so.sort_order, so.created_at), '[]'::jsonb)
        into v_socials
        from public.profile_socials so
       where so.profile_id = v_prof.id and so.is_visible = true;
      select coalesce(jsonb_agg(jsonb_build_object(
               'title', e.title, 'org', e.org, 'start_year', e.start_year,
               'end_year', e.end_year, 'description', e.description)
               order by e.sort_order, e.start_year desc nulls last, e.created_at), '[]'::jsonb)
        into v_expers
        from public.profile_experiences e where e.profile_id = v_prof.id;
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
    'style', coalesce(v_card.style, '{}'::jsonb),
    'is_owner', (auth.uid() is not null and v_card.owner_id = auth.uid()),
    'owner', v_owner, 'socials', v_socials, 'experiences', v_expers);
end; $$;

-- 6. member_dashboard: sertakan judul & style agar editor bisa memuat -------
create or replace function public.member_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cards jsonb;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'code', c.card_code, 'number', c.collection_number, 'rarity', c.rarity,
           'status', c.status, 'display_name', c.display_name, 'title', c.title,
           'front_image', c.card_front_image_url, 'style', c.style,
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

-- 7. Hak akses ---------------------------------------------------------------
revoke all on function public.update_my_card_style(uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.member_card_taps(uuid)                              from public, anon;
grant execute on function public.update_my_card_style(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.member_card_taps(uuid)                              to authenticated;
grant execute on function public.get_public_card(text)                               to anon, authenticated;
grant execute on function public.member_dashboard()                                  to authenticated;
