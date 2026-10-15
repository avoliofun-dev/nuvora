import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2, Crown, Zap, ShieldCheck } from 'lucide-react';
import { socialPlatforms, normalizeUrl } from './shared.js';
import ImageField from './ImageUpload.jsx';

const emptyPf = { username: '', name: '', bio: '', location: '', website: '', headline: '', company: '', public_email: '', public_phone: '', avatar_url: '' };
const blankSocial = () => ({ platform: 'instagram', label: '', url: '', is_visible: true });
const blankExp = () => ({ title: '', org: '', start_year: '', end_year: '', description: '' });
const MAX_SOCIALS = 12, MAX_EXPS = 15;

// Profil member: satu sumber data untuk semua kartu (identitas, profesional, tautan sosial, pengalaman).
export default function ProfilePage({ supabase, auth, user, notify, go, onSaved }) {
  const uid = auth.user && auth.user.id;
  const [pf, setPf] = useState(emptyPf);
  const [socials, setSocials] = useState([]);
  const [exps, setExps] = useState([]);
  const [cardStats, setCardStats] = useState(null);
  const [loaded, setLoaded] = useState({ socials: [], exps: [] });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase || !uid) return;
    let alive = true;
    (async () => {
      const p = await supabase.from('profiles')
        .select('display_name,username,bio,location,website_url,avatar_url,headline,company,public_email,public_phone').eq('id', uid).maybeSingle();
      if (!alive) return;
      if (p.error) {
        // kolom v5 belum ada -> muat kolom dasar saja
        notify('Kolom profil profesional belum ada. Jalankan supabase_patch_v5.sql di Supabase.');
        const b = await supabase.from('profiles').select('display_name,username,bio,location,website_url,avatar_url').eq('id', uid).maybeSingle();
        if (!alive) return;
        if (b.data) setPf({ ...emptyPf, name: b.data.display_name || '', username: b.data.username || '', bio: b.data.bio || '', location: b.data.location || '', website: b.data.website_url || '', avatar_url: b.data.avatar_url || '' });
      } else if (p.data) {
        const d = p.data;
        setPf({ name: d.display_name || '', username: d.username || '', bio: d.bio || '', location: d.location || '', website: d.website_url || '', headline: d.headline || '', company: d.company || '', public_email: d.public_email || '', public_phone: d.public_phone || '', avatar_url: d.avatar_url || '' });
      }
      supabase.rpc('member_dashboard').then(({ data, error }) => {
        if (alive && !error && data) setCardStats(data);
      }).catch(() => {});
      const s = await supabase.from('profile_socials').select('id,platform,label,url,is_visible,sort_order').eq('profile_id', uid).order('sort_order').order('created_at');
      const e = await supabase.from('profile_experiences').select('id,title,org,start_year,end_year,description').eq('profile_id', uid).order('sort_order').order('start_year', { ascending: false });
      if (!alive) return;
      const sl = (s.data || []).map(x => ({ id: x.id, platform: x.platform, label: x.label || '', url: x.url, is_visible: x.is_visible !== false }));
      const el = (e.data || []).map(x => ({ ...x, start_year: x.start_year || '', end_year: x.end_year || '', org: x.org || '', description: x.description || '' }));
      setSocials(sl); setExps(el);
      setLoaded({ socials: sl.map(x => x.id), exps: el.map(x => x.id) });
      setReady(true);
    })();
    return () => { alive = false; };
  }, [supabase, uid]);

  const set = patch => setPf(p => ({ ...p, ...patch }));
  const upS = (i, patch) => setSocials(a => a.map((x, j) => j === i ? { ...x, ...patch } : x));
  const upE = (i, patch) => setExps(a => a.map((x, j) => j === i ? { ...x, ...patch } : x));
  const move = (setter, i, d) => setter(a => { const j = i + d; if (j < 0 || j >= a.length) return a; const c = [...a]; [c[i], c[j]] = [c[j], c[i]]; return c; });

  async function save() {
    const name = pf.name.trim();
    if (!name || name.length > 60) { notify('Nama tampilan harus 1–60 karakter.'); return; }
    const uname = pf.username.trim();
    if (uname && !/^[a-zA-Z0-9_.-]{3,30}$/.test(uname)) { notify('Username 3–30 karakter: huruf, angka, titik, garis bawah, atau strip.'); return; }
    if (pf.bio.length > 500) { notify('Bio maksimal 500 karakter.'); return; }
    if (pf.public_email && !/^\S+@\S+\.\S+$/.test(pf.public_email.trim())) { notify('Format email tidak valid.'); return; }
    if (pf.public_phone && !/^[0-9+() -]{6,30}$/.test(pf.public_phone.trim())) { notify('Telepon hanya boleh angka, +, (), spasi, dan strip (6–30 karakter).'); return; }
    const web = pf.website.trim() ? normalizeUrl(pf.website, 'website') : null;
    if (pf.website.trim() && !web) { notify('Alamat website tidak valid.'); return; }
    if (pf.avatar_url && !/^https?:\/\/\S+$/i.test(pf.avatar_url.trim())) { notify('Alamat foto profil harus diawali http:// atau https://'); return; }

    const cleanSocials = [];
    for (const x of socials) {
      if (!x.url.trim() && !x.label.trim()) continue;
      const u = normalizeUrl(x.url, x.platform);
      if (!u) { notify('Tautan "' + (x.label || x.platform) + '" tidak valid. Contoh: https://instagram.com/namamu'); return; }
      if (x.platform === 'other' && !x.label.trim()) { notify('Beri nama untuk tautan "Lainnya".'); return; }
      if (cleanSocials.some(c => c.platform === x.platform && c.url === u)) { notify('Ada tautan ganda: ' + u); return; }
      cleanSocials.push({ ...x, url: u });
    }
    for (const x of exps) {
      if (!x.title.trim() && !x.org.trim() && !x.description.trim() && x.start_year === '' && x.end_year === '') continue;
      if (!x.title.trim()) { notify('Setiap pengalaman harus punya judul.'); return; }
      for (const y of [x.start_year, x.end_year]) if (y !== '' && !(Number(y) >= 1950 && Number(y) <= 2100)) { notify('Tahun harus antara 1950 dan 2100.'); return; }
    }
    const cleanExps = exps.filter(x => x.title.trim());

    setBusy(true);
    try {
      const patch = {
        display_name: name, username: uname || null, bio: pf.bio.trim() || null, location: pf.location.trim() || null,
        website_url: web, avatar_url: pf.avatar_url.trim() || null,
        headline: pf.headline.trim() || null, company: pf.company.trim() || null,
        public_email: pf.public_email.trim() || null, public_phone: pf.public_phone.trim() || null
      };
      const r = await supabase.from('profiles').update(patch).eq('id', uid);
      if (r.error) { notify(r.error.code === '23505' ? 'Username sudah dipakai orang lain.' : /column .* does not exist/i.test(r.error.message) ? 'Jalankan supabase_patch_v5.sql di Supabase dulu.' : 'Profil gagal disimpan: ' + r.error.message); return; }

      // Tautan sosial: hapus yang dibuang, perbarui yang ada, tambahkan yang baru.
      // Hapus dulu agar tidak bentrok dengan aturan unik (profil, platform, url).
      const keepS = cleanSocials.filter(x => x.id).map(x => x.id);
      const delS = loaded.socials.filter(id => !keepS.includes(id));
      if (delS.length) { const d = await supabase.from('profile_socials').delete().in('id', delS).eq('profile_id', uid); if (d.error) { notify('Tautan sosial gagal disimpan: ' + d.error.message); return; } }
      const sOut = [];
      for (let i = 0; i < cleanSocials.length; i++) {
        const x = cleanSocials[i];
        const row = { platform: x.platform, label: x.label.trim() || (socialPlatforms.find(p => p[0] === x.platform) || [])[1] || x.platform, url: x.url, is_visible: x.is_visible, sort_order: i };
        if (x.id) {
          const u = await supabase.from('profile_socials').update(row).eq('id', x.id).eq('profile_id', uid);
          if (u.error) { notify('Tautan sosial gagal disimpan: ' + u.error.message); return; }
          sOut.push({ ...x, label: x.label });
        } else {
          const n = await supabase.from('profile_socials').insert({ ...row, profile_id: uid }).select('id').single();
          if (n.error) { notify('Tautan sosial gagal disimpan: ' + n.error.message); return; }
          sOut.push({ ...x, id: n.data.id });
        }
      }

      const keepE = cleanExps.filter(x => x.id).map(x => x.id);
      const delE = loaded.exps.filter(id => !keepE.includes(id));
      if (delE.length) { const d = await supabase.from('profile_experiences').delete().in('id', delE).eq('profile_id', uid); if (d.error) { notify('Pengalaman gagal disimpan: ' + d.error.message); return; } }
      const eOut = [];
      for (let i = 0; i < cleanExps.length; i++) {
        const x = cleanExps[i];
        const row = { title: x.title.trim(), org: x.org.trim() || null, description: x.description.trim() || null, start_year: x.start_year === '' ? null : Number(x.start_year), end_year: x.end_year === '' ? null : Number(x.end_year), sort_order: i };
        if (x.id) {
          const u = await supabase.from('profile_experiences').update(row).eq('id', x.id).eq('profile_id', uid);
          if (u.error) { notify('Pengalaman gagal disimpan: ' + u.error.message); return; }
          eOut.push(x);
        } else {
          const n = await supabase.from('profile_experiences').insert({ ...row, profile_id: uid }).select('id').single();
          if (n.error) { notify('Pengalaman gagal disimpan: ' + n.error.message); return; }
          eOut.push({ ...x, id: n.data.id });
        }
      }

      setSocials(sOut); setExps(eOut);
      setLoaded({ socials: sOut.map(x => x.id), exps: eOut.map(x => x.id) });
      setPf(p => ({ ...p, website: web || '' }));
      onSaved(patch);
      notify('Profil disimpan. Perubahan langsung tampil di semua kartumu.');
    } finally { setBusy(false); }
  }

  if (!supabase || !uid) return <p className="muted">Silakan login untuk mengedit profil.</p>;
  if (!ready) return <p className="muted">Memuat pengaturan profil…</p>;

  return (
    <div className="profile-page-content">
      <div className="profile-header-area">
        <div className="eyebrow">PENGATURAN AKUN</div>
        <h1 style={{ fontSize: 'clamp(28px,3.8vw,40px)', margin: '10px 0' }}>Pengaturan & Profil <em>member.</em></h1>
        <p className="muted">Data di sini dibagikan ke semua kartumu. Lengkapi profil dan tautan sosial agar kartu digitalmu tampil maksimal.</p>
      </div>

      {cardStats && (
        <div className="panel pf-stats-banner">
          <div className="pf-stats-left">
            <span className="eyebrow" style={{ color: 'var(--gold)' }}>HASIL TAP & AKTIVITAS KARTU</span>
            <div className="pf-stats-numbers">
              <div className="pf-stat-item">
                <span className="pf-stat-label"><Eye size={14} /> Total Tap</span>
                <strong className="pf-stat-val gold">{cardStats.total_taps ?? 0}</strong>
              </div>
              <div className="pf-stat-sep" />
              <div className="pf-stat-item">
                <span className="pf-stat-label"><Crown size={14} /> Level</span>
                <strong className="pf-stat-val">LV {cardStats.top_level ?? 1}</strong>
              </div>
              <div className="pf-stat-sep" />
              <div className="pf-stat-item">
                <span className="pf-stat-label"><Zap size={14} /> EXP</span>
                <strong className="pf-stat-val">{cardStats.total_exp ?? 0}</strong>
              </div>
            </div>
          </div>
          <div className="pf-stats-actions">
            <button type="button" className="btn btn-ghost small" onClick={() => go('my-cards')}>Kartu saya ({cardStats.card_count ?? 0})</button>
            {cardStats.cards && cardStats.cards[0] && (
              <button type="button" className="btn btn-gold small" onClick={() => go('card-editor', cardStats.cards[0].code)}>Studio & Data tap</button>
            )}
          </div>
        </div>
      )}

      <div className="profile-grid-2col">
        {/* Kolom Kiri: Identitas & Profesional */}
        <div className="profile-col-left">
          <div className="panel profile-form pf-section">
            <h3>Identitas</h3>
            <ImageField supabase={supabase} uid={uid} folder="avatar" value={pf.avatar_url} onChange={v => set({ avatar_url: v })} notify={notify} label="Foto profil" hint="JPG/PNG/WebP, otomatis dikecilkan." round max={800} />
            <label>Nama tampilan<input value={pf.name} onChange={e => set({ name: e.target.value })} maxLength="60" /></label>
            <label>Username<input value={pf.username} onChange={e => set({ username: e.target.value })} placeholder="huruf, angka, titik, _ atau -" maxLength="30" /></label>
            <label>Email akun<input value={user.email} readOnly /></label>
            <label>Bio<textarea rows="4" value={pf.bio} onChange={e => set({ bio: e.target.value })} maxLength="500" placeholder="Ceritakan dirimu secara singkat" /><small className="muted">{pf.bio.length}/500</small></label>
          </div>

          <div className="panel profile-form pf-section">
            <h3>Profesional & Kontak</h3>
            <label>Jabatan / headline<input value={pf.headline} onChange={e => set({ headline: e.target.value })} maxLength="120" placeholder="Mis. Product Designer" /></label>
            <div className="pf-row">
              <label>Perusahaan / organisasi<input value={pf.company} onChange={e => set({ company: e.target.value })} maxLength="120" /></label>
              <label>Lokasi<input value={pf.location} onChange={e => set({ location: e.target.value })} maxLength="80" /></label>
            </div>
            <div className="pf-row">
              <label>Email publik<input type="email" value={pf.public_email} onChange={e => set({ public_email: e.target.value })} maxLength="160" placeholder="halo@contoh.com" /></label>
              <label>Telepon publik<input value={pf.public_phone} onChange={e => set({ public_phone: e.target.value })} maxLength="30" placeholder="+62…" /></label>
            </div>
            <label>Website<input value={pf.website} onChange={e => set({ website: e.target.value })} placeholder="contoh.com" /></label>
            <p className="muted">Email dan telepon hanya tampil di kartu jika diisi.</p>
          </div>

          <div className="pf-savebar pf-savebar-left">
            <button className="btn btn-gold" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan profil'}</button>
            <button className="btn btn-ghost" onClick={() => go('my-cards')}>Kartu saya</button>
          </div>
        </div>

        {/* Kolom Kanan: Tautan Sosial & Pengalaman */}
        <div className="profile-col-right">
          <div className="panel profile-form pf-section">
            <h3>Tautan sosial</h3>
            <p className="muted" style={{ marginTop: 0 }}>Pilih platform, tempel tautan atau nomor (WhatsApp). Ikon mata mengatur apakah tautan tampil di kartu.</p>
            {socials.map((x, i) => (
              <div className="pf-social" key={x.id || 'n' + i}>
                <select value={x.platform} onChange={e => upS(i, { platform: e.target.value })}>{socialPlatforms.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <input value={x.url} onChange={e => upS(i, { url: e.target.value })} placeholder={x.platform === 'whatsapp' ? '08xxxxxxxxxx atau https://wa.me/…' : 'https://…'} aria-label="Tautan" />
                {x.platform === 'other' && <input value={x.label} onChange={e => upS(i, { label: e.target.value })} placeholder="Nama tautan" maxLength="40" aria-label="Nama tautan" />}
                <div className="pf-tools">
                  <button type="button" onClick={() => upS(i, { is_visible: !x.is_visible })} title={x.is_visible ? 'Tampil di kartu' : 'Disembunyikan'} aria-label="Tampil/sembunyi">{x.is_visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                  <button type="button" onClick={() => move(setSocials, i, -1)} disabled={i === 0} aria-label="Naik"><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => move(setSocials, i, 1)} disabled={i === socials.length - 1} aria-label="Turun"><ArrowDown size={15} /></button>
                  <button type="button" className="danger" onClick={() => setSocials(a => a.filter((_, j) => j !== i))} aria-label="Hapus"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-ghost small" onClick={() => setSocials(a => a.length >= MAX_SOCIALS ? a : [...a, blankSocial()])} disabled={socials.length >= MAX_SOCIALS}><Plus size={14} /> Tambah tautan</button>
          </div>

          <div className="panel profile-form pf-section">
            <h3>Pengalaman</h3>
            {exps.length === 0 && <p className="muted" style={{ marginTop: 0 }}>Tambahkan riwayat kerja, proyek, atau pencapaian.</p>}
            {exps.map((x, i) => (
              <div className="ce-exp" key={x.id || 'n' + i}>
                <div className="ce-exp-head"><span>Pengalaman {i + 1}</span>
                  <span className="pf-tools">
                    <button type="button" onClick={() => move(setExps, i, -1)} disabled={i === 0} aria-label="Naik"><ArrowUp size={14} /></button>
                    <button type="button" onClick={() => move(setExps, i, 1)} disabled={i === exps.length - 1} aria-label="Turun"><ArrowDown size={14} /></button>
                    <button type="button" className="danger" onClick={() => setExps(a => a.filter((_, j) => j !== i))} aria-label="Hapus"><Trash2 size={14} /></button>
                  </span>
                </div>
                <label>Judul / peran<input value={x.title} maxLength="120" onChange={e => upE(i, { title: e.target.value })} /></label>
                <label>Organisasi<input value={x.org} maxLength="120" onChange={e => upE(i, { org: e.target.value })} /></label>
                <div className="pf-row">
                  <label>Tahun mulai<input inputMode="numeric" value={x.start_year} onChange={e => upE(i, { start_year: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="2022" /></label>
                  <label>Tahun selesai<input inputMode="numeric" value={x.end_year} onChange={e => upE(i, { end_year: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="Kosong = sekarang" /></label>
                </div>
                <label>Deskripsi singkat<textarea rows="2" maxLength="400" value={x.description} onChange={e => upE(i, { description: e.target.value })} /></label>
              </div>
            ))}
            <button type="button" className="btn btn-ghost small" onClick={() => setExps(a => a.length >= MAX_EXPS ? a : [...a, blankExp()])} disabled={exps.length >= MAX_EXPS}><Plus size={14} /> Tambah pengalaman</button>
          </div>
        </div>
      </div>
    </div>
  );
}
