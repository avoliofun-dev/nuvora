-- ===========================================================================
-- SUPABASE PATCH V7: PERBAIKAN HASIL TAP KARTU & PERMISSION
-- ===========================================================================
-- Jalankan patch ini sekali di Supabase SQL Editor agar hasil tap kartu fisik NFC
-- dapat tercatat secara otomatis dan langsung muncul di profil serta dashboard.
-- ===========================================================================

-- 1. Pastikan kolom total_taps ada di tabel cards
alter table public.cards add column if not exists total_taps bigint not null default 0;

-- 2. Fungsi record_card_tap (dapat dipanggil oleh pengunjung anonim maupun member)
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

-- 3. Beri hak akses eksekusi ke anon, authenticated, dan service_role
grant execute on function public.record_card_tap(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.register_card_visit(text, text, text, text) to anon, authenticated, service_role;
