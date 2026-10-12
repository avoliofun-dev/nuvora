import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Eye, Layers, RotateCcw, UserRound } from 'lucide-react';
import { rarities, fmtDate } from './shared.js';
import { HoloCard } from './CardPage.jsx';
import ImageField from './ImageUpload.jsx';

const SWATCHES = ['#f4c16b', '#55a9ff', '#c084fc', '#ff647c', '#5be0ae', '#f0f4f8'];
const httpOk = v => !v || /^https?:\/\/\S+$/i.test(v);
const TABS = ['Tampilan kartu', 'Bagian tampil', 'Data tap'];
const SECTIONS = [['profile', 'Profil', 'Foto, jabatan, perusahaan, lokasi, dan bio'], ['experience', 'Pengalaman', 'Riwayat kerja dan pencapaian'], ['contact', 'Kontak & sosial', 'Email, telepon, website, dan tautan sosial'], ['stats', 'Statistik', 'Level, EXP, dan riwayat kartu']];

export default function CardEditor({ supabase, auth, notify, go, cardCode }) {
  const [tab, setTab] = useState(TABS[0]);
  const [cards, setCards] = useState(null);
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ display_name: '', title: '', front_image: '', style: {} });
  const [profInfo, setProfInfo] = useState({ name: '', headline: '' });
  const [taps, setTaps] = useState(null);
  const [tapError, setTapError] = useState(null);
  const [tapLoading, setTapLoading] = useState(false);
  const previewRef = useRef(null);

  const uid = auth.user && auth.user.id;
  const card = useMemo(() => (cards || []).find(c => c.code === sel) || null, [cards, sel]);

  // Muat kartu milik member + profil + pengalaman
  useEffect(() => {
    if (!supabase || !uid) return;
    let alive = true;
    (async () => {
      const d = await supabase.rpc('member_dashboard');
      if (!alive) return;
      if (d.error) { notify('Gagal memuat kartu: ' + d.error.message); setCards([]); return; }
      const list = (d.data && d.data.cards) || [];
      setCards(list);
      const first = list.find(c => c.code === cardCode) || list[0];
      if (first) setSel(first.code);

      const p = await supabase.from('profiles').select('display_name,headline').eq('id', uid).maybeSingle();
      if (!alive) return;
      if (p.data) setProfInfo({ name: p.data.display_name || '', headline: p.data.headline || '' });
    })();
    return () => { alive = false; };
  }, [supabase, uid]);

  // Isi draft saat kartu dipilih
  useEffect(() => {
    if (!card) return;
    setDraft({ display_name: card.display_name || '', title: card.title || '', front_image: card.front_image || '', style: card.style || {} });
    setTaps(null);
    setTapError(null);
    setTapLoading(false);
  }, [card && card.id]);

  // Data tap dimuat saat tab dibuka
  function loadTaps() {
    if (!card || tapLoading) return;
    setTapLoading(true);
    setTapError(null);
    setTaps(null);
    supabase.rpc('member_card_taps', { p_card_id: card.id }).then(({ data, error }) => {
      setTapLoading(false);
      if (error) {
        if (/function.*not exist|Could not find/i.test(error.message)) {
          setTapError('Fungsi data tap belum tersedia di database. Jalankan supabase_patch_v5.sql di Supabase SQL Editor terlebih dahulu.');
        } else if (/JWT|auth|Login/i.test(error.message)) {
          setTapError('Sesi login berakhir. Muat ulang halaman dan login kembali.');
        } else {
          setTapError('Gagal memuat data tap: ' + error.message);
        }
      } else {
        setTaps(data);
      }
    });
  }

  useEffect(() => {
    if (tab !== 'Data tap' || !card || taps || tapLoading || tapError) return;
    loadTaps();
  }, [tab, card && card.id]);

  const setStyle = patch => setDraft(d => ({ ...d, style: { ...d.style, ...patch } }));
  const st = draft.style || {};
  const hidden = Array.isArray(st.hide) ? st.hide : [];
  const setHidden = (k, off) => setStyle({ hide: off ? [...new Set([...hidden, k])] : hidden.filter(x => x !== k) });

  const previewView = useMemo(() => card ? ({
    code: card.code, number: card.number, rarity: card.rarity, level: card.level, exp: card.exp,
    display_name: draft.display_name, title: draft.title, owner: { display_name: profInfo.name, headline: profInfo.headline },
    style: st
  }) : null, [card, draft, profInfo]);

  async function saveCard() {
    if (!card) return;
    if (!httpOk(draft.front_image.trim())) { notify('Alamat gambar harus diawali http:// atau https://'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('update_my_card_style', {
      p_card_id: card.id, p_display_name: draft.display_name, p_title: draft.title,
      p_front_image: draft.front_image.trim() || null, p_style: st
    });
    setBusy(false);
    if (error) { notify(error.message.includes('Could not find') ? 'Jalankan supabase_patch_v5.sql dulu di Supabase.' : 'Gagal menyimpan: ' + error.message); return; }
    setCards(cs => cs.map(c => c.id === card.id ? { ...c, display_name: draft.display_name.trim() || null, title: draft.title.trim() || null, front_image: draft.front_image.trim() || null, style: data || st } : c));
    notify('Tampilan kartu disimpan.');
  }

  if (!supabase || !uid) return <main className="page-wrap narrow"><p className="muted">Silakan login untuk mengedit kartu.</p></main>;
  if (cards === null) return <main className="page-wrap narrow"><p className="muted">Memuat…</p></main>;

  const maxVisitors = taps ? Math.max(1, ...taps.days.map(d => Number(d.visitors))) : 1;
  const r = card ? (rarities.find(x => x.id === card.rarity) || rarities[0]) : rarities[0];
  const art = r.image;

  return (
    <div className="card-editor-content">
      <button className="text-link" onClick={() => go('my-cards')}><ChevronLeft size={15} /> Kembali ke kartu saya</button>
      <div className="page-intro" style={{ textAlign: 'left', margin: '14px 0 22px', maxWidth: 'none' }}>
        <div className="eyebrow">STUDIO KARTU</div>
        <h1 style={{ fontSize: 'clamp(28px,3.8vw,40px)', margin: '10px 0' }}>Atur kartu <em>milikmu.</em></h1>
        <p>Sesuaikan tampilan kartu, lengkapi profil profesional, dan pantau kapan kartumu di-tap.</p>
      </div>

      {cards.length === 0 && (
        <div className="panel">
          <h3>Belum ada kartu</h3>
          <p className="muted">Setelah pesananmu diproses, admin akan menautkan kartu ke akunmu. Profilmu tetap bisa dilengkapi sekarang di halaman Profil.</p>
        </div>
      )}

      <div className="ce-tabs">
        {TABS.map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      <div className="ce-grid">
        <div className="panel">
          {tab === 'Tampilan kartu' && (card ? <>
            {cards.length > 1 && (
              <label className="ce-field">Pilih kartu
                <select value={sel} onChange={e => setSel(e.target.value)}>{cards.map(c => <option key={c.id} value={c.code}>{c.code} · {c.rarity}</option>)}</select>
              </label>
            )}
            <div className="ce-row">
              <label className="ce-field">Nama di kartu<input value={draft.display_name} maxLength={80} onChange={e => setDraft({ ...draft, display_name: e.target.value })} placeholder={profInfo.name || 'Nama tampilan'} /></label>
              <label className="ce-field">Judul / tagline<input value={draft.title} maxLength={120} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Mis. Founder & Designer" /></label>
            </div>
            <div className="ce-field">Latar kartu
              <div className="ce-choices">{[['art', 'Gambar'], ['gradient', 'Gradien'], ['solid', 'Polos']].map(([v, l]) => <button key={v} className={(st.bg || 'art') === v ? 'active' : ''} onClick={() => setStyle({ bg: v })}>{l}</button>)}</div>
            </div>
            {(st.bg || 'art') === 'art' && <>
              {card.status !== 'ACTIVE'
                ? <p className="muted">Foto kartu bisa diganti setelah kartumu aktif.</p>
                : <ImageField supabase={supabase} uid={uid} folder="cards" value={draft.front_image} onChange={v => setDraft(d => ({ ...d, front_image: v }))} notify={notify}
                    label="Foto kartu" hint="Satu foto per kartu. Kosongkan untuk gambar bawaan rarity." allowUrl />}
              {card.print_image && card.status === 'ACTIVE' && draft.front_image !== card.print_image && (
                <button type="button" className="btn btn-ghost small" onClick={() => setDraft(d => ({ ...d, front_image: card.print_image }))}><RotateCcw size={14} /> Kembalikan ke foto cetak</button>
              )}
              {card.print_image && <p className="muted" style={{ fontSize: 11 }}>Foto cetak (yang dipakai di kartu fisik) tersimpan permanen sebagai arsip.</p>}
            </>}
            <div className="ce-field">Tata letak
              <div className="ce-choices">{[['classic', 'Klasik'], ['minimal', 'Minimal'], ['bold', 'Tegas']].map(([v, l]) => <button key={v} className={(st.layout || 'classic') === v ? 'active' : ''} onClick={() => setStyle({ layout: v })}>{l}</button>)}</div>
            </div>
            <div className="ce-field">Gaya huruf
              <div className="ce-choices">{[['modern', 'Modern'], ['serif', 'Serif'], ['mono', 'Mono']].map(([v, l]) => <button key={v} className={(st.font || 'modern') === v ? 'active' : ''} onClick={() => setStyle({ font: v })}>{l}</button>)}</div>
            </div>
            <div className="ce-field">Warna aksen
              <div className="ce-swatches">
                {SWATCHES.map(c => <button key={c} style={{ background: c }} className={st.accent === c ? 'active' : ''} onClick={() => setStyle({ accent: c })} aria-label={c} />)}
                <input type="color" value={st.accent || r.color} onChange={e => setStyle({ accent: e.target.value })} aria-label="Warna kustom" />
                <button className="btn btn-ghost small" onClick={() => { const { accent, ...rest } = st; setDraft(d => ({ ...d, style: rest })); }}>Ikuti rarity</button>
              </div>
            </div>
            <label className="ce-toggle"><span>Efek hologram<small>Kilau hologram mengikuti rarity kartu ({card.rarity}).</small></span>
              <input type="checkbox" checked={st.holo !== false} onChange={e => setStyle({ holo: e.target.checked })} /></label>
            <label className="ce-toggle"><span>Tampilkan jumlah tap di halaman publik<small>Jika dimatikan, pengunjung tidak melihat total tap.</small></span>
              <input type="checkbox" checked={st.show_taps !== false} onChange={e => setStyle({ show_taps: e.target.checked })} /></label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              <button className="btn btn-gold" onClick={saveCard} disabled={busy}>Simpan tampilan</button>
              <button className="btn btn-ghost" onClick={() => go('card', card.code)}><Eye size={15} /> Lihat halaman kartu</button>
            </div>
          </> : <p className="muted">Kamu belum memiliki kartu untuk dikustomisasi.</p>)}

          {tab === 'Bagian tampil' && (card ? <>
            {cards.length > 1 && (
              <label className="ce-field">Pilih kartu
                <select value={sel} onChange={e => setSel(e.target.value)}>{cards.map(c => <option key={c.id} value={c.code}>{c.code} · {c.rarity}</option>)}</select>
              </label>
            )}
            <p className="muted" style={{ marginTop: 0 }}>Pilih bagian yang boleh dilihat pengunjung kartu <b>{card.code}</b>. Bagian yang dimatikan tidak dikirim ke pengunjung sama sekali. Isi profil, kontak, dan pengalamanmu sama untuk semua kartu dan diatur di halaman Profil.</p>
            {SECTIONS.map(([k, label, sub]) => (
              <label className="ce-toggle" key={k}><span>{label}<small>{sub}</small></span>
                <input type="checkbox" checked={!hidden.includes(k)} onChange={e => setHidden(k, !e.target.checked)} /></label>
            ))}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              <button className="btn btn-gold" onClick={saveCard} disabled={busy}>Simpan</button>
              <button className="btn btn-ghost" onClick={() => go('profile')}><UserRound size={15} /> Edit profil</button>
            </div>
          </> : <p className="muted">Kamu belum memiliki kartu.</p>)}

          {tab === 'Data tap' && (!card ? <p className="muted">Belum ada kartu.</p> : tapLoading ? (
            <div className="ce-tap-loading"><span className="tap-spinner"/><p className="muted">Memuat data tap…</p></div>
          ) : tapError ? (
            <div className="ce-tap-error">
              <div className="notice" style={{marginBottom:16}}>{tapError}</div>
              <button className="btn btn-ghost small" onClick={loadTaps}>↻ Coba lagi</button>
            </div>
          ) : !taps ? null : <>
            <div className="ce-metrics">
              <div><small>Total tap</small><b>{taps.total_taps}</b></div>
              <div><small>Pengunjung unik</small><b>{taps.unique_visitors}</b></div>
              <div><small>Hari ini</small><b>{taps.today}</b></div>
            </div>
            <div className="panel-heading"><h3>14 hari terakhir</h3><span className="muted">Pengunjung unik per hari</span></div>
            <div className="ce-chart">
              {taps.days.map(d => <div key={d.day} title={`${d.day}: ${d.visitors} pengunjung, ${d.taps} tap`}><span style={{ height: Math.max(3, (Number(d.visitors) / maxVisitors) * 100) + '%', opacity: Number(d.visitors) ? 1 : .25 }} /></div>)}
            </div>
            <div className="ce-chart-days">{taps.days.map(d => <small key={d.day}>{d.day.slice(8)}</small>)}</div>
            <div className="panel-heading" style={{ marginTop: 24 }}><h3>Tap terbaru</h3><span className="muted">{taps.last_tap_at ? 'Terakhir ' + fmtDate(taps.last_tap_at) : ''}</span></div>
            {taps.recent.length === 0 && <p className="muted">Belum ada tap. Coba tempelkan kartu ke HP untuk mengujinya.</p>}
            {taps.recent.map((t, i) => (
              <div className="ce-tap" key={i}>
                <div><b>{fmtDate(t.visited_on)} · {new Date(t.last_seen_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b>
                  <small>{[t.user_agent_family, t.referrer_domain].filter(Boolean).join(' · ') || 'Pengunjung anonim'}</small></div>
                <em>{t.tap_count}×</em>
              </div>
            ))}
            <p className="muted" style={{ marginTop: 14 }}>Identitas pengunjung tidak disimpan; hanya hash harian anonim, jenis browser, dan jumlah tap.</p>
            <button className="btn btn-ghost small" style={{marginTop:8}} onClick={loadTaps}>↻ Refresh data</button>
          </>)}
        </div>

        <aside className="ce-preview">
          {previewView ? <>
            <HoloCard ref={previewRef} view={previewView} r={r} art={/^https?:\/\//i.test(draft.front_image) ? draft.front_image : art} accent={/^#[0-9a-f]{6}$/i.test(st.accent || '') ? st.accent : r.color} st={st} mode3d={false} qr="" />
            <button className="cp-chip" onClick={() => previewRef.current && previewRef.current.flip()}><Layers size={14} /> Balik kartu</button>
            <small className="muted">Pratinjau langsung · {card.code}</small>
          </> : <p className="muted">Pratinjau kartu muncul di sini setelah kartu ditautkan ke akunmu.</p>}
        </aside>
      </div>
    </div>
  );
}
