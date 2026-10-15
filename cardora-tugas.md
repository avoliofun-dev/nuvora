# Cardora — tugas & keputusan

## Keputusan
- Saat kartu ditap, yang tampil adalah kartu yang ditap.
- Satu foto per kartu; foto pertama = foto yang dikirim saat memesan.
- Setelah kartu fisik diterima (kartu ACTIVE & tertaut ke member), member boleh mengedit foto di kartu digital.
- Data profil dibagi di level akun; tampilan kartu terpisah per kartu; ada saklar sembunyi bagian per kartu.
- Foto cetak tersimpan sebagai arsip tetap dengan tombol "Kembalikan ke foto cetak".
- Form pesanan meminta satu foto per kartu (wajib untuk Kartu custom; untuk Kartu baru: semua atau kosong).

## Status
- [x] Tahap 1 — dashboard semua kartu, profil digabung, saklar sembunyi (kode selesai; belum diuji di database nyata)
- [x] Tahap 2 — upload dari perangkat, foto di form pesanan, editor tautan sosial (kode selesai; belum diuji di browser/HP)
- [x] Tahap 3 — Sidebar desktop, user popup, profile 2-grid, setel 3D, tilt giroskop HP, ketuk balik kartu, tombol tulis Web NFC, tema latar & font baru
- [x] Tahap 4 — data tap lebih kaya, pertukaran kontak (buku tamu leads), interaksi EXP (vCard, medsos, kenalan), mode acara 2x boost, profile mastery
- [ ] Tahap 5 — pembayaran online, keamanan & rate limit, uji lintas perangkat, checklist rilis

## Log keberhasilan
| Tanggal | Fitur | Status |
|---|---|---|
| 2026-10-13 | Sidebar fix/sticky di desktop (240px, top:78px) | ✅ Selesai |
| 2026-10-13 | Semua menu topbar member dipindah ke sidebar | ✅ Selesai |
| 2026-10-13 | User popup dropdown di topbar (klik avatar → menu) | ✅ Selesai |
| 2026-10-13 | Halaman profil jadi 2 grid kanan-kiri di desktop | ✅ Selesai |
| 2026-10-13 | Data tap: loading spinner, error yang jelas + tombol retry | ✅ Selesai |
| 2026-10-13 | Koleksi tampilkan sidebar jika member login | ✅ Selesai |
| 2026-10-13 | Git init + commit pertama berhasil | ✅ Selesai |
| 2026-10-13 | Build produksi sukses (✓ 1677 modules, exit 0) | ✅ Selesai |
| 2026-10-13 | Rebrand nama web ke **Dhiraya** di seluruh UI & metadata | ✅ Selesai |
| 2026-10-13 | Penguatan SEO: Open Graph, Twitter Cards, Schema JSON-LD, Sitemap & robots.txt | ✅ Selesai |
| 2026-10-15 | Perbaikan tap kartu: catat kunjungan otomatis, tampilkan hasil tap di profil kartu publik & profil member | ✅ Selesai |
| 2026-10-15 | Tahap 3 lanjutan: Web NFC writer (Studio & Card Page), kemiringan giroskop HP (deviceorientation), tap-to-flip, tema latar & font baru | ✅ Selesai |
| 2026-10-15 | Gamifikasi: Daily Tap Streak (hari berturut-turut + bonus EXP bertingkat) & Lencana Pencapaian (Badges) | ✅ Selesai |
| 2026-10-15 | Gamifikasi Ekspansi (Tahap 4): Multi-Visitor EXP, Engagement Aksi (vCard +15 EXP, Medsos +5 EXP, Tukar Kontak +25 EXP), Mode Acara 2x Booster, Profile Mastery +100 EXP, dan Buku Tamu Studio | ✅ Selesai |

## Catatan teknis penting
- Fungsi `member_card_taps(uuid)` ada di `supabase_patch_v5.sql`. Jika data tap kosong/error, jalankan patch tersebut di Supabase SQL Editor.
- Patch `supabase_patch_v7_tap_fix.sql` menyediakan fungsi `record_card_tap()` dengan izin anon/authenticated sehingga tap kartu NFC tercatat secara langsung dan bertambah otomatis.
- Patch `supabase_patch_v8_gamification.sql` menambahkan perhitungan streak harian otomatis dan bonus EXP berjenjang (+50 EXP untuk streak 3 hari, +150 EXP untuk streak 7 hari).
- Patch `supabase_patch_v9_gamification_expansion.sql` menambahkan tabel `card_actions`, fungsi `record_card_action`, perhitungan bonus kelengkapan profil (hingga +100 EXP), multiplier Mode Acara (2x), dan Buku Tamu kontak pengunjung (`get_card_leads`).
- Git diinisialisasi di root proyek.
- Dev server berjalan di http://localhost:5173/ (task background).


