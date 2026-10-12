# Cardora v6

React + Vite + Supabase (Auth & PostgreSQL), deploy ke Vercel. **Tanpa SMTP.**

- Customer: daftar dan masuk di `/customer-login`.
- Admin: masuk **hanya lewat URL** `/admin-login` (tidak ada tautan ke halaman itu di website, dan admin tidak bisa mendaftar dari website).

## 1. Environment variable

Lokal: salin `.env.example` menjadi `.env.local`. Vercel: Settings → Environment Variables (Production), lalu **Redeploy**.

| Variabel | Wajib | Keterangan |
|---|---|---|
| `VITE_SUPABASE_URL` | ya | Project URL |
| `VITE_SUPABASE_ANON_KEY` | ya | anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | tidak | hanya untuk `api/visit.js`; tanpa awalan `VITE_` |
| `VISITOR_HASH_SECRET` | tidak | string acak ≥ 32 karakter |

## 2. Database (satu kali)

1. Supabase → SQL Editor → tempel seluruh isi `supabase_schema.sql` → Run.
2. Harus selesai tanpa error. File ini idempoten: aman di project baru maupun yang pernah menjalankan schema lama. Jika masih bentrok dengan schema lama, jalankan `supabase_reset_optional.sql` (menghapus data aplikasi, bukan akun login), lalu jalankan `supabase_schema.sql` lagi.

## 3. Matikan konfirmasi email (pengganti SMTP)

Supabase → Authentication → Providers → Email → **matikan "Confirm email"**. Ini langkah wajib agar Supabase tidak mencoba mengirim email. Schema juga menandai semua akun baru sebagai terkonfirmasi sebagai lapisan cadangan.

Lalu di Authentication → URL Configuration, isi **Site URL** dengan domain Vercel kamu.

## 4. Buat admin

1. Buat akun: daftar lewat website, atau Supabase → Authentication → Users → Add user → Create new user (centang **Auto Confirm User**).
2. Jalankan di SQL Editor:
   ```sql
   select public.set_user_role('admin@contoh.com', 'ADMIN');
   ```
3. Buka `https://DOMAIN-KAMU/admin-login` dan masuk.

Akun admin tidak bisa masuk dari `/customer-login`, dan akun customer ditolak di `/admin-login`.

## 5. Fitur dan tabel yang tersambung

| Fitur | Tabel / function |
|---|---|
| Daftar, login, profil otomatis | `auth.users` → trigger → `profiles`; `ensure_my_profile()` memulihkan profil bila trigger gagal |
| Edit profil (nama, username, bio, lokasi, website, Instagram) | `profiles`, `profile_socials` |
| Pesan kartu (telepon + alamat pengiriman) | `create_cardora_order()` menghitung harga dari `rarity_prices` |
| Dashboard member (kartu, level, EXP, kunjungan) | `member_dashboard()` |
| Halaman kartu publik `/c/KODE` | `get_public_card()`; `/c/NRD-0001` menampilkan kartu contoh bila belum ada di database |
| Admin: ringkasan, pesanan + detail alamat | `admin_dashboard()`, `orders`, `admin_update_order_status()` |
| Admin: terbitkan kartu, ubah status, ubah pemilik, bonus EXP | `admin_create_card()`, `admin_set_card_status()`, `admin_assign_card()`, `admin_adjust_exp()` → `cards`, `card_ownership_history`, `exp_adjustments` |
| Admin: tautkan kartu NFC ke pesanan (buat & tautkan, pilih kartu yang ada, lepas tautan) | `admin_issue_order_card()`, `admin_link_card_to_order()`, `admin_unlink_order_card()` → `order_cards`, `cards.owner_id`, `card_ownership_history` |
| Admin: daftar member | `admin_list_members()` |
| Admin: harga rarity, aturan EXP | `rarity_prices`, `exp_settings` |
| Kunjungan unik → EXP | `api/visit.js` → `register_card_visit()` → `card_taps` |

Keamanan: semua tabel memakai RLS; data publik hanya lewat `get_public_card()`; member tidak bisa mengubah `role`, harga, status pesanan, atau EXP; semua function admin memanggil `require_admin()`.

### Menautkan kartu NFC ke pesanan (admin)

1. Admin → **Pesanan** → ubah status pesanan menjadi **Dikonfirmasi** (atau setelahnya). Pesanan *Menunggu konfirmasi* dan *Dibatalkan* tidak bisa ditautkan kartu.
2. Klik nomor pesanan (atau badge **Kartu 0/2**) untuk membuka kotak **Kartu NFC pesanan ini**.
3. Pilih salah satu:
   - **Buat & tautkan kartu baru**: isi kode kartu (satu per baris/koma; sesuai jumlah kartu yang masih kurang). Rarity mengikuti pesanan.
   - **Pilih kartu yang sudah ada**: kartu dari tab Kartu yang rarity-nya sama, belum tertaut, dan belum dimiliki member lain.
4. Setelah ditautkan, member pemesan otomatis menjadi pemilik kartu (riwayat pemilik tercatat) dan, bila kotak *Aktifkan kartu* dicentang, status DRAFT menjadi ACTIVE. Kartu langsung muncul di dashboard member.
5. Salah tautan? Klik **Lepas**: tautan dihapus dan pemilik dikosongkan (status kartu tidak diubah).

6. Klik **Tulis ke NFC** (di kotak pesanan atau tab Kartu), lalu tempelkan chip ke belakang HP. URL `https://DOMAIN-KAMU/c/KODE` ditulis ke chip. Syarat: Chrome di Android, NFC HP aktif, panel admin dibuka lewat https, dan dari domain produksi (alamat yang ditulis mengikuti domain yang sedang dibuka). iPhone/Safari belum mendukung Web NFC; pakai aplikasi seperti NFC Tools sebagai gantinya.

### Tautan kartu, QR, dan tulis NFC (admin → tab Kartu → **Tautan & NFC**)

Panel ini menampilkan tautan publik kartu (`/c/KODE`) dengan tombol **Salin**, **Tulis ke kartu NFC**, **Buka halaman kartu**, dan **QR** yang bisa diunduh. Ada pemeriksaan otomatis: bila kartu belum ACTIVE, halaman kartu belum bisa dilihat orang lain, dan tersedia tombol **Aktifkan sekarang**. Setelah `npm install` ulang (dependensi baru: `qrcode`), tidak ada perubahan database untuk fitur ini.

Database yang sudah berjalan cukup menjalankan `supabase_patch_link_cards.sql` sekali. Project baru cukup `supabase_schema.sql` (sudah termasuk).

## Pembaruan v5 — halaman kartu & Studio kartu

**Database (wajib untuk project yang sudah berjalan):** jalankan `supabase_patch_v5.sql` sekali di SQL Editor. File ini idempoten dan menambahkan kolom profil profesional (`headline`, `company`, `public_email`, `public_phone`), tabel `profile_experiences`, kolom `cards.style`, fungsi `update_my_card_style()` dan `member_card_taps()`, serta versi baru `get_public_card()` dan `member_dashboard()`.

**Halaman kartu `/c/KODE`** sekarang layar penuh tanpa topbar/footer:
- Mode biasa: geser kiri/kanan (swipe, drag mouse, tombol panah, atau titik navigasi) antar panel Kartu, Profil, Pengalaman, Kontak, Statistik. Ada tombol *Simpan kontak* (vCard).
- Mode 3D: seret untuk memutar kartu bebas 360° dengan inersia; tombol Balik, Putar 360°, Reset. Sisi belakang berisi QR kode kartu.
- Hologram menurut rarity: Common (kilau halus), Rare (biru), Epic (prisma ungu), Legendary (foil emas pelangi + glitter), Secret (spektrum penuh + garis scan).

**Studio kartu** (`/card-editor`, menu member): kustomisasi nama/judul, latar, tata letak, huruf, warna aksen, hologram on/off, tampilkan tap on/off; profil profesional; pengalaman; dan data tap (total, pengunjung unik, grafik 14 hari, tap terbaru dengan browser dan perujuk).

Tidak ada dependensi baru. Pastikan `npm install` lalu `npm run build` berhasil di mesinmu.

## 6. Jalankan dan deploy

```bash
npm install
npm run dev        # lokal
npm run build      # produksi → dist/
```

## 7. Checklist sebelum rilis

- [ ] `supabase_schema.sql` selesai tanpa error; `users` = `profiles` pada query cek di akhir file.
- [ ] Daftar customer baru → langsung masuk ke dashboard (tanpa email).
- [ ] `/customer-login` menolak akun admin; `/admin-login` menolak akun customer.
- [ ] Customer tidak bisa membuka `/admin` dan tidak melihat pesanan orang lain.
- [ ] Buat pesanan → muncul di admin lengkap dengan alamat; ubah status → tampil di akun customer.
- [ ] Terbitkan kartu ACTIVE, buka `/c/KODE`, cek EXP bertambah (butuh variabel opsional).
- [ ] Konfirmasi pesanan → tautkan kartu di admin → kartu muncul di dashboard customer pemesan.
- [ ] Belum ada pembayaran online: konfirmasi dan penagihan masih manual oleh admin.

## Pembaruan v6 — multi-kartu, profil gabungan, upload gambar

**Database (wajib):** jalankan berurutan di SQL Editor, masing-masing sekali (idempoten):
1. `supabase_patch_v5.sql` (bila belum)
2. `supabase_patch_v6.sql`

Patch v6 menambahkan bucket Storage `card-images` (publik, maks 5 MB), `orders.photo_urls`, `cards.print_image_url` (arsip foto cetak), `create_cardora_order` dengan parameter foto, penautan kartu yang otomatis memasang foto cetak, saklar sembunyi per kartu (`style.hide`, ditegakkan di server), dan aturan "foto kartu hanya bisa diganti setelah kartu ACTIVE".

**Cek hasil patch** (query ada di bagian bawah `supabase_patch_v6.sql`): bucket `card-images` ada dan publik; kolom `photo_urls`, `print_image_url`, `style` ada; empat kolom profil profesional ada.

**Perilaku baru**
- Dashboard dan menu **Kartu saya** menampilkan semua kartu member.
- Halaman **Profil** menggabungkan identitas, profesional, tautan sosial bebas (11 platform, urut & sembunyikan), dan pengalaman. Data ini dibagi ke semua kartu.
- **Studio kartu**: tampilan per kartu, tab **Bagian tampil** (sembunyikan Profil / Pengalaman / Kontak & sosial / Statistik per kartu), foto kartu dari perangkat, dan tombol **Kembalikan ke foto cetak**.
- **Form pesanan**: satu foto per kartu (wajib untuk Kartu custom). Foto ke-N menjadi foto cetak kartu ke-N yang ditautkan admin. Admin melihat foto di detail pesanan.
