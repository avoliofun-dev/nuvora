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
- [x] Tahap 3 (UI selesai) — Sidebar fix desktop, user popup topbar, profile 2-grid, menu member pindah ke sidebar
- [ ] Tahap 3 (lanjutan) — setel 3D, swipe, hologram setelah uji di HP; tombol tulis NFC; tema tambahan
- [ ] Tahap 4 — data tap lebih kaya, pertukaran kontak, notifikasi tap
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

## Catatan teknis penting
- Fungsi `member_card_taps(uuid)` ada di `supabase_patch_v5.sql`. Jika data tap kosong/error, jalankan patch tersebut di Supabase SQL Editor.
- Git diinisialisasi di root proyek. Commit pertama: `07a2427`.
- Dev server berjalan di http://localhost:5173/ (task background).

