-- ============================================================================
-- OPSIONAL — RESET DATA APLIKASI CARDORA (BERBAHAYA)
--
-- Gunakan HANYA jika project Supabase ini khusus untuk Cardora dan kamu ingin
-- mulai bersih (mis. schema lama bentrok dan supabase_schema.sql terus error).
--
-- Yang DIHAPUS: semua tabel/function/enum Cardora di schema public
--   (pesanan, kartu, profil, tautan sosial, kunjungan, harga, pengaturan EXP).
-- Yang TIDAK dihapus: akun login di Authentication → Users.
--
-- Setelah ini jalankan supabase_schema.sql. Profil akun yang sudah ada dibuat
-- ulang otomatis (role kembali MEMBER; jadikan admin lagi dengan set_user_role).
-- ============================================================================
begin;

drop trigger if exists on_auth_user_created      on auth.users;
drop trigger if exists autoconfirm_before_insert on auth.users;

drop table if exists public.order_cards            cascade;
drop table if exists public.exp_adjustments        cascade;
drop table if exists public.card_taps              cascade;
drop table if exists public.card_ownership_history cascade;
drop table if exists public.orders                 cascade;
drop table if exists public.cards                  cascade;
drop table if exists public.profile_socials        cascade;
drop table if exists public.profiles               cascade;
drop table if exists public.rarity_prices          cascade;
drop table if exists public.exp_settings           cascade;

drop function if exists public.create_cardora_order(public.card_rarity, integer, text, text, text, text);
drop function if exists public.create_cardora_order(public.card_rarity, integer, text, text);
drop function if exists public.admin_update_order_status(uuid, public.order_status, text);
drop function if exists public.admin_update_order_status(uuid, public.order_status);
drop function if exists public.admin_dashboard();
drop function if exists public.admin_list_members();
drop function if exists public.admin_list_cards();
drop function if exists public.admin_create_card(text, public.card_rarity, public.card_status, integer, text, text);
drop function if exists public.admin_set_card_status(uuid, public.card_status);
drop function if exists public.admin_assign_card(uuid, text);
drop function if exists public.admin_adjust_exp(uuid, integer, text);
drop function if exists public.admin_set_rarity_price(public.card_rarity, numeric, boolean);
drop function if exists public.admin_set_exp_settings(integer, integer);
drop function if exists public.register_card_visit(text, text, text, text);
drop function if exists public.get_public_card(text);
drop function if exists public.member_dashboard();
drop function if exists public.ensure_my_profile();
drop function if exists public.set_user_role(text, public.app_role);
drop function if exists public.card_level(uuid);
drop function if exists public.card_exp(uuid);
drop function if exists public.require_admin();
drop function if exists public.is_cardora_admin();
drop function if exists public.prevent_profile_role_escalation();
drop function if exists public.autoconfirm_new_auth_user();
drop function if exists public.handle_new_auth_user();
drop function if exists public.set_updated_at();

drop type if exists public.card_rarity  cascade;
drop type if exists public.order_status cascade;
drop type if exists public.card_status  cascade;
drop type if exists public.app_role     cascade;

commit;
