import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';

const BUCKET = 'card-images';
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT = 12 * 1024 * 1024; // file asli dari HP bisa besar; diperkecil sebelum diunggah

function loadBitmap(file) {
  if (window.createImageBitmap) return createImageBitmap(file);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('decode'));
    img.src = URL.createObjectURL(file);
  });
}

// Perkecil (sisi terpanjang <= max) dan simpan sebagai JPEG agar ringan.
async function shrink(file, max) {
  const bmp = await loadBitmap(file);
  const w0 = bmp.width, h0 = bmp.height;
  const k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
  if (!blob) throw new Error('encode');
  return blob;
}

const rand = () => Math.random().toString(36).slice(2, 10);

// Unggah satu gambar ke Supabase Storage. Mengembalikan alamat publik (https).
export async function uploadImage(supabase, uid, file, folder = 'misc', max = 1600) {
  if (!supabase || !uid) throw new Error('Silakan login terlebih dahulu.');
  if (!file) throw new Error('Pilih file gambar.');
  if (!OK_TYPES.includes(file.type)) throw new Error('Format harus JPG, PNG, atau WebP. (Foto HEIC: ubah ke JPG dulu atau ambil ulang dengan kamera.)');
  if (file.size > MAX_INPUT) throw new Error('Ukuran file maksimal 12 MB.');
  let blob;
  try { blob = await shrink(file, max); } catch { throw new Error('Gambar tidak bisa dibaca. Coba file lain.'); }
  if (blob.size > 5 * 1024 * 1024) throw new Error('Gambar masih terlalu besar setelah dikecilkan.');
  const path = `${uid}/${folder}/${Date.now()}-${rand()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) {
    if (/bucket/i.test(error.message) && /not found/i.test(error.message)) throw new Error('Penyimpanan belum siap. Jalankan supabase_patch_v6.sql di Supabase.');
    throw new Error('Unggah gagal: ' + error.message);
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Kolom gambar: pilih dari perangkat (atau tempel tautan bila allowUrl).
export default function ImageField({ supabase, uid, folder, value, onChange, notify, label, hint, round = false, allowUrl = false, max = 1600 }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { onChange(await uploadImage(supabase, uid, f, folder, max)); }
    catch (err) { notify(err.message || 'Unggah gagal.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="ce-field">
      {label}
      <div className="img-field">
        <button type="button" className={'img-drop' + (round ? ' round' : '')} onClick={() => ref.current && ref.current.click()} disabled={busy} aria-label="Pilih gambar dari perangkat">
          {value ? <img src={value} alt="" /> : busy ? <Loader2 size={20} className="spin" /> : <ImagePlus size={22} />}
          {value && busy && <span className="img-busy"><Loader2 size={20} className="spin" /></span>}
        </button>
        <div className="img-side">
          <button type="button" className="btn btn-ghost small" onClick={() => ref.current && ref.current.click()} disabled={busy}>
            <ImagePlus size={14} /> {busy ? 'Mengunggah…' : value ? 'Ganti gambar' : 'Pilih dari perangkat'}
          </button>
          {value && <button type="button" className="ce-link-danger" onClick={() => onChange('')} disabled={busy}><X size={12} /> Hapus</button>}
          {hint && <small>{hint}</small>}
        </div>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      </div>
      {allowUrl && <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder="atau tempel alamat gambar https://…" />}
    </div>
  );
}
