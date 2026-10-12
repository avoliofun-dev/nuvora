-- ===========================================================================
-- Cardora v6 patch — jalankan SEKALI di Supabase → SQL Editor (idempoten).
-- WAJIB menjalankan supabase_patch_v5.sql lebih dulu.
--
-- Menambahkan:
--   1. Bucket Storage "card-images" (upload foto dari perangkat)
--   2. Foto per kartu pada pesanan (orders.photo_urls) + arsip foto cetak (cards.print_image_url)
--   3. create_cardora_order menerima daftar foto
--   4. Penautan kartu ke pesanan otomatis memasang foto cetak
--   5. Saklar sembunyi bagian per kartu (style.hide) — ditegakkan di server
--   6. Edit foto kartu hanya untuk kartu ACTIVE milik member
-- ===========================================================================

-- 1. Storage ----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "card_images_public_read"  on storage.objects;
drop policy if exists "card_images_insert_own"   on storage.objects;
drop policy if exists "card_images_update_own"   on storage.objects;
drop policy if exists "card_images_delete_own"   on storage.objects;

create policy "card_images_public_read" on storage.objects
  for select to public using (bucket_id = 'card-images');
create policy "card_images_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "card_images_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "card_images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Kolom baru ---------------------------------------------------------------
alter table public.orders add column if not exists photo_urls text[] not null default '{}';
alter table public.cards  add column if not exists print_image_url text;

do $$ begin
  alter table public.orders add constraint orders_photo_count
    check (coalesce(array_length(photo_urls, 1), 0) <= 100) not valid;
exception when duplicate_object then null; end $$;

-- 3. create_cardora_order dengan foto -----------------------------------------
drop function if exists public.create_cardora_order(public.card_rarity, integer, text, text, text, text);
drop function if exists public.create_cardora_order(public.card_rarity, integer, text, text, text, text, text[]);
create function public.create_cardora_order(
  p_rarity           public.card_rarity,
  p_quantity         integer,
  p_phone            text,
  p_shipping_address text,
  p_card_type        text default 'Kartu baru',
  p_customer_note    text default null,
  p_photo_urls       text[] default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_user    auth.users%rowtype;
  v_profile public.profiles%rowtype;
  v_price   numeric(12,2);
  v_phone   text := btrim(coalesce(p_phone, ''));
  v_addr    text := btrim(coalesce(p_shipping_address, ''));
  v_photos  text[] := '{}';
  v_u       text;
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

  -- Foto: satu per kartu, urutan = urutan kartu. Wajib untuk Kartu custom.
  foreach v_u in array coalesce(p_photo_urls, '{}') loop
    v_u := btrim(v_u);
    if v_u = '' then continue; end if;
    if v_u !~* '^https://\S+$' or char_length(v_u) > 2048 then raise exception 'Alamat foto tidak valid'; end if;
    v_photos := v_photos || v_u;
  end loop;
  if coalesce(array_length(v_photos, 1), 0) > p_quantity then
    raise exception 'Jumlah foto (%) melebihi jumlah kartu (%)', array_length(v_photos, 1), p_quantity;
  end if;
  if p_card_type = 'Kartu custom' and coalesce(array_length(v_photos, 1), 0) <> p_quantity then
    raise exception 'Kartu custom membutuhkan % foto (satu per kartu)', p_quantity;
  end if;

  select * into v_user from auth.users where id = auth.uid();
  select * into v_profile from public.profiles where id = auth.uid();
  if v_user.id is null or v_profile.id is null then raise exception 'Profil pengguna tidak ditemukan'; end if;

  if (select count(*) from public.orders where member_id = auth.uid() and status = 'PENDING') >= 20 then
    raise exception 'Terlalu banyak pesanan yang belum dikonfirmasi';
  end if;

  select unit_price into v_price from public.rarity_prices where rarity = p_rarity and active = true;
  if v_price is null then raise exception 'Jenis kartu tidak tersedia'; end if;

  insert into public.orders (order_number, member_id, customer_name, email, phone, shipping_address,
                             card_type, quantity, rarity, unit_price, total_price, currency, status,
                             customer_note, photo_urls)
  values ('CDR-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' ||
            upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          auth.uid(), v_profile.display_name, v_user.email, v_phone, v_addr,
          p_card_type, p_quantity, p_rarity, v_price, v_price * p_quantity, 'IDR', 'PENDING',
          nullif(btrim(p_customer_note), ''), v_photos)
  returning * into v_order;
  return v_order;
end; $$;

revoke all on function public.create_cardora_order(public.card_rarity, integer, text, text, text, text, text[]) from public, anon;
grant execute on function public.create_cardora_order(public.card_rarity, integer, text, text, text, text, text[]) to authenticated;

-- 4. Penautan kartu → foto cetak ---------------------------------------------
create or replace function public.link_card_to_order_internal(
  p_order_id uuid, p_card_id uuid, p_activate boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_card  public.cards%rowtype;
  v_count integer;
  v_old   uuid;
  v_photo text;
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

  -- Foto ke-N pesanan menjadi foto cetak kartu ke-N yang ditautkan.
  v_photo := v_order.photo_urls[v_count + 1];

  v_old := v_card.owner_id;
  update public.cards set
    owner_id     = v_order.member_id,
    print_image_url      = coalesce(v_photo, print_image_url),
    card_front_image_url = case when v_photo is not null and card_front_image_url is null
                                then v_photo else card_front_image_url end,
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
revoke all on function public.link_card_to_order_internal(uuid, uuid, boolean) from public, anon, authenticated;

-- 5+6. update_my_card_style: saklar sembunyi + aturan edit foto ---------------
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
  v_hide  jsonb;
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
  if v_img is distinct from v_card.card_front_image_url and v_card.status <> 'ACTIVE' then
    raise exception 'Foto kartu baru bisa diubah setelah kartu aktif'; end if;

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

  -- Bagian yang disembunyikan: hanya nilai yang dikenal, tanpa duplikat.
  if jsonb_typeof(p_style->'hide') = 'array' then
    select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into v_hide
      from jsonb_array_elements_text(p_style->'hide') t(x)
     where x in ('profile','experience','contact','stats');
    v_style := v_style || jsonb_build_object('hide', v_hide);
  end if;

  update public.cards set
    display_name         = nullif(btrim(p_display_name), ''),
    title                = nullif(btrim(p_title), ''),
    card_front_image_url = v_img,
    style                = v_style
  where id = v_card.id;

  return v_style;
end; $$;
revoke all on function public.update_my_card_style(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.update_my_card_style(uuid, text, text, text, jsonb) to authenticated;

-- 7. member_dashboard: sertakan foto cetak -------------------------------------
create or replace function public.member_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cards jsonb;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'code', c.card_code, 'number', c.collection_number, 'rarity', c.rarity,
           'status', c.status, 'display_name', c.display_name, 'title', c.title,
           'front_image', c.card_front_image_url, 'print_image', c.print_image_url, 'style', c.style,
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
grant execute on function public.member_dashboard() to authenticated;

-- 8. get_public_card: hormati style.hide (data tidak dikirim sama sekali) -------
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
begin
  select * into v_card from public.cards
  where card_code = upper(btrim(coalesce(p_code, ''))) and status = 'ACTIVE';
  if not found then return null; end if;

  v_hide := case when jsonb_typeof(v_card.style->'hide') = 'array' then v_card.style->'hide' else '[]'::jsonb end;

  select s.exp_per_level into v_per from public.exp_settings s where s.id = 1;
  v_per := greatest(1, coalesce(v_per, 100));
  v_exp := public.card_exp(v_card.id);

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
    'style', coalesce(v_card.style, '{}'::jsonb),
    'hide', v_hide,
    'is_owner', (auth.uid() is not null and v_card.owner_id = auth.uid()),
    'owner', v_owner, 'socials', v_socials, 'experiences', v_expers);
end; $$;
grant execute on function public.get_public_card(text) to anon, authenticated;

-- 9. Cek hasil (jalankan terpisah setelah patch) -------------------------------
-- select id, public from storage.buckets where id = 'card-images';            -- 1 baris, public = true
-- select column_name from information_schema.columns
--   where table_name = 'orders' and column_name = 'photo_urls';                 -- 1 baris
-- select column_name from information_schema.columns
--   where table_name = 'cards' and column_name in ('style','print_image_url');  -- 2 baris
-- select column_name from information_schema.columns
--   where table_name = 'profiles' and column_name in ('headline','company','public_email','public_phone'); -- 4 baris
