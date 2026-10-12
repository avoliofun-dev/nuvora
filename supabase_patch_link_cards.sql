-- ============================================================================
-- CARDORA — PATCH: tautkan kartu NFC ke pesanan (admin)
--
-- Untuk database yang SUDAH menjalankan supabase_schema.sql v4.
-- (Project baru tidak perlu file ini: isinya sudah ada di supabase_schema.sql.)
-- Aman dijalankan berulang kali. Jalankan sekali di Supabase → SQL Editor.
-- ============================================================================
begin;

-- admin_list_cards sekarang juga mengembalikan order_id & order_number
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

revoke all on function public.link_card_to_order_internal(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_link_card_to_order(uuid, uuid, boolean) from public, anon;
revoke all on function public.admin_issue_order_card(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.admin_unlink_order_card(uuid, uuid)       from public, anon;

grant execute on function public.admin_link_card_to_order(uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_issue_order_card(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.admin_unlink_order_card(uuid, uuid)    to authenticated;

commit;
