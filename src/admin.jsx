import React, { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, LayoutDashboard, ShoppingBag, Layers, UserRound, Crown, Settings, LogOut, Search, Zap, Eye, Sparkles, Plus, Link2, Nfc } from 'lucide-react';
import QRCode from 'qrcode';
import { rarities, money, fmtDate, orderStatusLabel, orderStatusValue, mapOrder } from './shared.js';

const TABS = [['Ringkasan', <LayoutDashboard />], ['Pesanan', <ShoppingBag />], ['Kartu', <Layers />], ['Member', <UserRound />], ['Rarity', <Crown />], ['Pengaturan', <Settings />]];
const CARD_STATUS = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'LOST', 'RETIRED'];
const rarityLabel = id => rarities.find(r => r.id === id)?.label || id;

function Metric({ label, value, icon }) {
  return <div className="metric-card"><span className="metric-icon">{icon}</span><span>{label}</span><strong>{value}</strong></div>;
}

export default function AdminPanel({ supabase, user, go, logout, notify, tab, setTab }) {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [cards, setCards] = useState([]);
  const [members, setMembers] = useState([]);
  const [prices, setPrices] = useState({});
  const [settings, setSettings] = useState({ visit: 10, perLevel: 100 });
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ code: '', rarity: 'COMMON', status: 'DRAFT', number: '', name: '', title: '' });
  const [busy, setBusy] = useState(false);
  const [nfcBusy, setNfcBusy] = useState('');
  const [qr, setQr] = useState('');
  const [linkUi, setLinkUi] = useState({ mode: 'new', cardId: '', codes: '', name: '', title: '', activate: true });

  const fail = (e, msg) => notify(msg + ': ' + (e?.message || e));

  const loadStats = useCallback(async () => { const { data, error } = await supabase.rpc('admin_dashboard'); if (error) return fail(error, 'Gagal memuat ringkasan'); setStats(data); }, [supabase]);
  const loadOrders = useCallback(async () => { const { data, error } = await supabase.from('orders').select('*, order_cards(card_id, created_at, cards(id, card_code, rarity, status))').order('created_at', { ascending: false }).limit(500); if (error) return fail(error, 'Gagal memuat pesanan'); setOrders((data || []).map(mapOrder)); }, [supabase]);
  const loadCards = useCallback(async () => { const { data, error } = await supabase.rpc('admin_list_cards'); if (error) return fail(error, 'Gagal memuat kartu'); setCards(data || []); }, [supabase]);
  const loadMembers = useCallback(async () => { const { data, error } = await supabase.rpc('admin_list_members'); if (error) return fail(error, 'Gagal memuat member'); setMembers(data || []); }, [supabase]);
  const loadPrices = useCallback(async () => { const { data, error } = await supabase.from('rarity_prices').select('rarity,unit_price,active'); if (error) return fail(error, 'Gagal memuat harga'); setPrices(Object.fromEntries((data || []).map(r => [r.rarity, { price: String(Number(r.unit_price)), active: r.active }]))); }, [supabase]);
  const loadSettings = useCallback(async () => { const { data, error } = await supabase.from('exp_settings').select('exp_per_unique_daily_visit,exp_per_level').eq('id', 1).maybeSingle(); if (error) return fail(error, 'Gagal memuat pengaturan'); if (data) setSettings({ visit: String(data.exp_per_unique_daily_visit), perLevel: String(data.exp_per_level) }); }, [supabase]);

  useEffect(() => {
    setSearch(''); setOpen(null); setDialog(null);
    if (tab === 'Ringkasan') { loadStats(); loadOrders(); }
    else if (tab === 'Pesanan') loadOrders();
    else if (tab === 'Kartu') loadCards();
    else if (tab === 'Member') loadMembers();
    else if (tab === 'Rarity') loadPrices();
    else if (tab === 'Pengaturan') loadSettings();
  }, [tab]);

  async function changeStatus(o, next) {
    const { data, error } = await supabase.rpc('admin_update_order_status', { p_order_id: o.dbId, p_status: orderStatusValue[next] });
    if (error) return fail(error, 'Status gagal diperbarui');
    setOrders(prev => prev.map(x => x.dbId === o.dbId ? { ...mapOrder(data), cards: x.cards } : x));
    notify('Status pesanan diperbarui.');
  }

  // ---- Tulis URL kartu ke chip NFC (Web NFC: Chrome Android, HTTPS) ----
  const cardUrl = code => location.origin + '/c/' + encodeURIComponent(code);

  useEffect(() => {
    if (dialog && dialog.type === 'share') QRCode.toDataURL(cardUrl(dialog.card.code), { width: 360, margin: 2 }).then(setQr).catch(() => setQr(''));
    else setQr('');
  }, [dialog && dialog.type, dialog && dialog.card && dialog.card.code]);

  async function copyUrl(code) {
    try { await navigator.clipboard.writeText(cardUrl(code)); notify('Tautan disalin.'); }
    catch { window.prompt('Salin tautan kartu:', cardUrl(code)); }
  }

  async function activateShared(c) {
    const { data, error } = await supabase.rpc('admin_set_card_status', { p_card_id: c.id, p_status: 'ACTIVE' });
    if (error) return fail(error, 'Kartu gagal diaktifkan');
    notify('Kartu diaktifkan. Halaman kartu kini bisa dibuka publik.');
    setDialog(d => ({ ...d, card: { ...d.card, status: data.status } })); loadCards();
  }

  async function writeNfc(code) {
    if (!('NDEFReader' in window)) return notify('Web NFC tidak didukung di perangkat ini. Buka panel admin lewat Chrome di Android (alamat https).');
    const url = cardUrl(code);
    if (!window.confirm('Tulis URL ini ke chip NFC?\n\n' + url + '\n\nIsi chip sebelumnya akan ditimpa.')) return;
    setNfcBusy(code);
    notify('Tempelkan kartu NFC ke bagian belakang HP…');
    try {
      const ndef = new window.NDEFReader();
      await ndef.write({ records: [{ recordType: 'url', data: url }] }, { overwrite: true });
      notify('Berhasil menulis ' + url);
    } catch (e) {
      fail(e, e && e.name === 'NotAllowedError' ? 'Izin NFC ditolak atau NFC HP belum aktif' : 'Gagal menulis NFC');
    } finally { setNfcBusy(''); }
  }

  // ---- Tautkan kartu NFC ke pesanan ----
  function toggleOpen(o) {
    if (open === o.dbId) return setOpen(null);
    setOpen(o.dbId);
    setLinkUi({ mode: 'new', cardId: '', codes: '', name: '', title: '', activate: true });
    loadCards(); // daftar kartu terbaru untuk pilihan "kartu yang sudah ada"
  }

  async function refreshAfterLink() {
    await Promise.all([loadOrders(), loadCards(), tab === 'Ringkasan' ? loadStats() : null]);
  }

  async function linkExisting(o) {
    if (!linkUi.cardId) return notify('Pilih kartu terlebih dahulu.');
    setBusy(true);
    const { error } = await supabase.rpc('admin_link_card_to_order', { p_order_id: o.dbId, p_card_id: linkUi.cardId, p_activate: linkUi.activate });
    setBusy(false);
    if (error) return fail(error, 'Kartu gagal ditautkan');
    notify('Kartu ditautkan ke pesanan dan akun member.');
    setLinkUi(u => ({ ...u, cardId: '' }));
    refreshAfterLink();
  }

  async function issueNew(o) {
    const codes = [...new Set(linkUi.codes.split(/[\s,;]+/).map(c => c.trim().toUpperCase()).filter(Boolean))];
    const remaining = o.qty - o.cards.length;
    if (!codes.length) return notify('Isi minimal satu kode kartu.');
    if (codes.length > remaining) return notify('Pesanan ini hanya membutuhkan ' + remaining + ' kartu lagi.');
    setBusy(true);
    let ok = 0;
    for (const code of codes) {
      const { error } = await supabase.rpc('admin_issue_order_card', { p_order_id: o.dbId, p_code: code, p_display_name: linkUi.name || null, p_title: linkUi.title || null, p_activate: linkUi.activate });
      if (error) { setBusy(false); await refreshAfterLink(); return fail(error, 'Kode ' + code + ' gagal (' + ok + ' kartu sudah tertaut)'); }
      ok++;
    }
    setBusy(false);
    notify(ok + ' kartu dibuat dan ditautkan ke pesanan.');
    setLinkUi(u => ({ ...u, codes: '', name: '', title: '' }));
    refreshAfterLink();
  }

  async function unlinkCard(o, c) {
    if (!window.confirm('Lepas kartu ' + c.code + ' dari pesanan ' + o.id + '? Pemilik kartu akan dikosongkan.')) return;
    const { error } = await supabase.rpc('admin_unlink_order_card', { p_order_id: o.dbId, p_card_id: c.id });
    if (error) return fail(error, 'Tautan gagal dilepas');
    notify('Tautan kartu dilepas.');
    refreshAfterLink();
  }

  async function createCard(e) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.rpc('admin_create_card', { p_code: form.code, p_rarity: form.rarity, p_status: form.status, p_number: form.number ? Number(form.number) : null, p_display_name: form.name || null, p_title: form.title || null });
    setBusy(false);
    if (error) return fail(error, 'Kartu gagal dibuat');
    setForm({ code: '', rarity: form.rarity, status: form.status, number: '', name: '', title: '' });
    notify('Kartu dibuat.'); loadCards();
  }

  async function setCardStatus(c, status) {
    const { error } = await supabase.rpc('admin_set_card_status', { p_card_id: c.id, p_status: status });
    if (error) return fail(error, 'Status kartu gagal diubah');
    notify('Status kartu diperbarui.'); loadCards();
  }

  async function submitDialog(e) {
    e.preventDefault(); setBusy(true);
    const d = dialog;
    const res = d.type === 'assign'
      ? await supabase.rpc('admin_assign_card', { p_card_id: d.card.id, p_owner_email: d.email || '' })
      : await supabase.rpc('admin_adjust_exp', { p_card_id: d.card.id, p_amount: Number(d.amount), p_reason: d.reason || '' });
    setBusy(false);
    if (res.error) return fail(res.error, 'Gagal menyimpan');
    notify(d.type === 'assign' ? 'Pemilik kartu diperbarui.' : 'Bonus EXP dicatat.');
    setDialog(null); loadCards();
  }

  async function savePrice(id) {
    const p = prices[id]; if (!p || p.price === '') return notify('Isi harga terlebih dahulu.');
    const { error } = await supabase.rpc('admin_set_rarity_price', { p_rarity: id, p_price: Number(p.price), p_active: p.active });
    if (error) return fail(error, 'Harga gagal disimpan');
    notify('Harga ' + rarityLabel(id) + ' disimpan.');
  }

  async function saveSettings(e) {
    e.preventDefault();
    const { error } = await supabase.rpc('admin_set_exp_settings', { p_visit_exp: Number(settings.visit), p_per_level: Number(settings.perLevel) });
    if (error) return fail(error, 'Pengaturan gagal disimpan');
    notify('Pengaturan EXP disimpan.');
  }

  const q = search.toLowerCase();
  const shownOrders = orders.filter(o => !q || [o.id, o.customer, o.email].some(v => (v || '').toLowerCase().includes(q)));
  const shownCards = cards.filter(c => !q || [c.code, c.display_name, c.owner_email, c.owner_name].some(v => (v || '').toLowerCase().includes(q)));
  const shownMembers = members.filter(m => !q || [m.email, m.display_name, m.username].some(v => (v || '').toLowerCase().includes(q)));
  const searchBox = <div className="search-box"><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari…" /></div>;
  const setF = k => e => setForm({ ...form, [k]: e.target.value });

  const linkBox = o => {
    const remaining = o.qty - o.cards.length;
    const blocked = o.statusKey === 'PENDING' || o.statusKey === 'CANCELLED' || !o.memberId;
    const linkable = cards.filter(c => !c.order_id && (!c.owner_id || c.owner_id === o.memberId) && (!o.rarity || c.rarity === o.rarity) && !['LOST', 'RETIRED'].includes(c.status));
    const setL = k => e => setLinkUi({ ...linkUi, [k]: e.target.value });
    return (
      <div className="link-box">
        <div className="link-box-head"><b><Nfc size={14} /> Kartu NFC pesanan ini</b><span className={'status ' + (remaining <= 0 ? 'done' : 'pending')}>{o.cards.length} dari {o.qty} tertaut</span></div>
        {o.cards.map(c => <div className="link-card-row" key={c.id}>
          <a className="text-link" href={'/c/' + c.code} target="_blank" rel="noreferrer">{c.code}</a>
          <span className="rarity-pill">{rarityLabel(c.rarity)}</span>
          <span className={'status ' + (c.status === 'ACTIVE' ? 'done' : 'pending')}>{c.status}</span>
          <button className="text-link" disabled={!!nfcBusy} onClick={() => writeNfc(c.code)}><Nfc size={12} /> {nfcBusy === c.code ? 'Menunggu kartu…' : 'Tulis ke NFC'}</button>
          <button className="text-link" onClick={() => copyUrl(c.code)}>Salin tautan</button>
          <button className="text-link link-card-remove" onClick={() => unlinkCard(o, c)}>Lepas</button>
        </div>)}
        {o.cards.length === 0 && <p className="muted">Belum ada kartu yang ditautkan. Pemilik kartu otomatis menjadi {o.customer}.</p>}

        {remaining > 0 && blocked && <p className="muted">{!o.memberId ? 'Pesanan ini tidak terhubung ke akun member.' : 'Ubah status pesanan menjadi Dikonfirmasi (atau setelahnya) agar kartu dapat ditautkan.'}</p>}

        {remaining > 0 && !blocked && <>
          <div className="link-tabs">
            <button className={linkUi.mode === 'new' ? 'active' : ''} onClick={() => setLinkUi({ ...linkUi, mode: 'new' })}>Buat & tautkan kartu baru</button>
            <button className={linkUi.mode === 'existing' ? 'active' : ''} onClick={() => setLinkUi({ ...linkUi, mode: 'existing' })}>Pilih kartu yang sudah ada ({linkable.length})</button>
          </div>
          {linkUi.mode === 'new'
            ? <div className="admin-form">
                <label>Kode kartu (sisa {remaining}; pisahkan dengan baris baru atau koma)<textarea rows="3" value={linkUi.codes} onChange={setL('codes')} placeholder={'NRD-0001\nNRD-0002'} /></label>
                <label>Nama di kartu (opsional, untuk semua kode)<input value={linkUi.name} onChange={setL('name')} maxLength="80" /></label>
                <label>Judul (opsional)<input value={linkUi.title} onChange={setL('title')} maxLength="120" /></label>
              </div>
            : <div className="admin-form">
                <label>Kartu (rarity {rarityLabel(o.rarity)}, belum tertaut)<select value={linkUi.cardId} onChange={setL('cardId')}>
                  <option value="">— pilih kartu —</option>
                  {linkable.map(c => <option key={c.id} value={c.id}>{c.code} · {c.status}{c.owner_email ? ' · ' + c.owner_email : ''}</option>)}
                </select></label>
              </div>}
          <label className="link-check"><input type="checkbox" checked={linkUi.activate} onChange={e => setLinkUi({ ...linkUi, activate: e.target.checked })} /> Aktifkan kartu (DRAFT → ACTIVE) agar halaman <code>/c/KODE</code> bisa dibuka</label>
          <button className="btn btn-gold small" disabled={busy} onClick={() => linkUi.mode === 'new' ? issueNew(o) : linkExisting(o)}><Link2 size={14} /> Tautkan ke {o.customer}</button>
        </>}

        {remaining <= 0 && o.statusKey !== 'SHIPPED' && o.statusKey !== 'COMPLETED' && o.statusKey !== 'CANCELLED' && <p className="muted">Semua kartu sudah tertaut. Ubah status pesanan ke Dikirim bila kartu sudah dikirim.</p>}
      </div>
    );
  };

  const ordersTable = (list, limit) => (
    <div className="table-wrap"><table>
      <thead><tr><th>Pesanan</th><th>Tanggal</th><th>Pelanggan</th><th>Rarity</th><th>Qty</th><th>Total</th><th>Kartu</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        {list.slice(0, limit || 500).map(o => <React.Fragment key={o.dbId}>
          <tr>
            <td><button className="text-link" onClick={() => toggleOpen(o)}>{o.id}</button></td>
            <td>{o.date}</td><td>{o.customer}</td>
            <td><span className="rarity-pill">{rarityLabel(o.rarity)}</span></td>
            <td>{o.qty}</td><td>{money(o.total)}</td>
            <td><button className="text-link" onClick={() => toggleOpen(o)} title="Tautkan kartu NFC"><span className={'status ' + (o.statusKey === 'CANCELLED' ? 'pending' : o.cards.length >= o.qty ? 'done' : 'pending')}>{o.cards.length}/{o.qty}</span></button></td>
            <td><span className={'status ' + (o.status === 'Selesai' ? 'done' : 'pending')}>{o.status}</span></td>
            <td><select className="status-select" value={o.status} onChange={e => changeStatus(o, e.target.value)}>{Object.values(orderStatusLabel).map(s => <option key={s}>{s}</option>)}</select></td>
          </tr>
          {open === o.dbId && <tr className="row-detail"><td colSpan="9">
            <b>{o.customer}</b> · {o.email} · {o.phone || '—'}<br />
            Alamat: {o.address || '—'}<br />
            Jenis: {o.kind || '—'}{o.note ? <> · Catatan: {o.note}</> : null}
            {o.photos && o.photos.length > 0 && <div className="order-photo-strip"><span>Foto cetak (urutan = urutan kartu yang ditautkan):</span>
              <div>{o.photos.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer noopener" title={'Foto kartu ' + (i + 1)}><img src={u} alt={'Foto kartu ' + (i + 1)} loading="lazy" /><small>#{i + 1}</small></a>)}</div></div>}
            {linkBox(o)}
          </td></tr>}
        </React.Fragment>)}
        {list.length === 0 && <tr><td colSpan="9" className="muted">Belum ada pesanan.</td></tr>}
      </tbody>
    </table></div>
  );

  return (
    <main className="dashboard-wrap">
      <aside className="sidebar">
        <button className="brand" onClick={() => go('home')}><span className="brand-mark"><Sparkles size={17} /></span><span>cardora</span></button>
        <span className="sidebar-label">ADMIN</span>
        {TABS.map(([label, icon]) => <button key={label} className={'side-link ' + (tab === label ? 'active' : '')} onClick={() => setTab(label)}>{icon}{label}</button>)}
        <div className="sidebar-bottom"><button className="side-link" onClick={logout}><LogOut />Keluar</button></div>
      </aside>

      <section className="dashboard-main">
        <div className="dashboard-top">
          <div><div className="eyebrow">ADMIN CONSOLE</div><h1>{tab === 'Ringkasan' ? 'Dashboard admin' : tab}</h1><p>{user?.email}</p></div>
          <div className="top-actions"><span className="admin-badge"><ShieldCheck size={15} /> Administrator</span><button className="btn btn-ghost small mobile-only" onClick={logout}>Keluar</button></div>
        </div>

        {tab === 'Ringkasan' && <>
          <div className="metric-cards">
            <Metric label="Total pesanan" value={stats ? stats.total_orders : '—'} icon={<ShoppingBag />} />
            <Metric label="Kartu aktif" value={stats ? stats.active_cards : '—'} icon={<Layers />} />
            <Metric label="Member" value={stats ? stats.members : '—'} icon={<UserRound />} />
            <Metric label="Tap hari ini" value={stats ? stats.taps_today : '—'} icon={<Eye />} />
          </div>
          <div className="panel">
            <div className="panel-heading"><div><h3>Pesanan terbaru</h3><p className="muted">{stats ? `${stats.pending_orders} menunggu konfirmasi` : ''}</p></div><button className="text-link" onClick={() => setTab('Pesanan')}>Lihat semua</button></div>
            {ordersTable(orders, 8)}
          </div>
        </>}

        {tab === 'Pesanan' && <div className="panel">
          <div className="panel-heading"><div><h3>Semua pesanan</h3><p className="muted">Klik nomor pesanan untuk melihat alamat dan kontak.</p></div>{searchBox}</div>
          {ordersTable(shownOrders)}
        </div>}

        {tab === 'Kartu' && <>
          <div className="panel">
            <div className="panel-heading"><h3>Terbitkan kartu</h3><Plus size={17} /></div>
            <form className="admin-form" onSubmit={createCard}>
              <label>Kode kartu<input value={form.code} onChange={setF('code')} placeholder="NRD-0001" required /></label>
              <label>Rarity<select value={form.rarity} onChange={setF('rarity')}>{rarities.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
              <label>Status<select value={form.status} onChange={setF('status')}>{CARD_STATUS.map(s => <option key={s}>{s}</option>)}</select></label>
              <label>No. koleksi<input type="number" min="1" value={form.number} onChange={setF('number')} placeholder="otomatis" /></label>
              <label>Nama di kartu<input value={form.name} onChange={setF('name')} maxLength="80" /></label>
              <label>Judul<input value={form.title} onChange={setF('title')} maxLength="120" /></label>
              <button className="btn btn-gold" disabled={busy}>Buat kartu</button>
            </form>
          </div>

          {dialog && dialog.type !== 'share' && <div className="panel">
            <div className="panel-heading"><h3>{dialog.type === 'assign' ? 'Ubah pemilik' : 'Bonus EXP'} · {dialog.card.code}</h3><button className="text-link" onClick={() => setDialog(null)}>Tutup</button></div>
            <form className="admin-form" onSubmit={submitDialog}>
              {dialog.type === 'assign'
                ? <label>Email member (kosongkan untuk melepas pemilik)<input type="email" value={dialog.email} onChange={e => setDialog({ ...dialog, email: e.target.value })} /></label>
                : <><label>Jumlah EXP (negatif untuk mengurangi)<input type="number" value={dialog.amount} onChange={e => setDialog({ ...dialog, amount: e.target.value })} required /></label>
                  <label>Alasan<input value={dialog.reason} onChange={e => setDialog({ ...dialog, reason: e.target.value })} minLength="3" maxLength="500" required /></label></>}
              <button className="btn btn-gold" disabled={busy}>Simpan</button>
            </form>
          </div>}

          {dialog && dialog.type === 'share' && (() => {
            const c = dialog.card, url = cardUrl(c.code), active = c.status === 'ACTIVE';
            return <div className="panel">
              <div className="panel-heading"><h3>Tautan & NFC · {c.code}</h3><button className="text-link" onClick={() => setDialog(null)}>Tutup</button></div>
              <div className="share-grid">
                <div>
                  <label className="share-label">Tautan halaman kartu (isi chip NFC dengan tautan ini)</label>
                  <div className="share-url"><input readOnly value={url} onFocus={e => e.target.select()} /><button className="btn btn-ghost small" onClick={() => copyUrl(c.code)}>Salin</button></div>
                  <div className="share-actions">
                    <button className="btn btn-gold small" disabled={!!nfcBusy} onClick={() => writeNfc(c.code)}><Nfc size={14} /> {nfcBusy === c.code ? 'Menunggu kartu…' : 'Tulis ke kartu NFC'}</button>
                    <a className="btn btn-ghost small" href={url} target="_blank" rel="noreferrer">Buka halaman kartu</a>
                  </div>
                  <ul className="share-checks">
                    <li className={active ? 'ok' : 'warn'}>{active ? 'Kartu ACTIVE: bisa dilihat siapa saja yang membuka tautan.' : <>Kartu berstatus {c.status}: halaman kartu <b>belum bisa dilihat publik</b>. <button className="text-link" onClick={() => activateShared(c)}>Aktifkan sekarang</button></>}</li>
                    <li className={c.owner_email ? 'ok' : 'warn'}>{c.owner_email ? 'Pemilik: ' + c.owner_email + '. Profilnya tampil di halaman kartu (selama profil member berstatus publik).' : 'Belum ada pemilik: halaman kartu tampil tanpa profil member. Tautkan lewat tab Pesanan atau tombol Pemilik.'}</li>
                  </ul>
                  <p className="muted">Tulis ke NFC butuh Chrome di Android, NFC aktif, dan panel dibuka dari domain produksi (https). Dari perangkat lain, salin tautan lalu tulis dengan aplikasi NFC Tools, atau pakai QR di samping.</p>
                </div>
                <div className="share-qr">{qr ? <img src={qr} alt={'QR ' + c.code} /> : <span className="muted">Membuat QR…</span>}{qr && <a className="text-link" href={qr} download={'cardora-' + c.code + '.png'}>Unduh QR</a>}</div>
              </div>
            </div>;
          })()}

          <div className="panel">
            <div className="panel-heading"><div><h3>Daftar kartu</h3><p className="muted">Kartu hanya tampil publik bila statusnya ACTIVE.</p></div>{searchBox}</div>
            <div className="table-wrap"><table>
              <thead><tr><th>Kode</th><th>Rarity</th><th>Status</th><th>Pemilik</th><th>Pesanan</th><th>Level</th><th>EXP</th><th>Tap</th><th>Aksi</th></tr></thead>
              <tbody>
                {shownCards.map(c => <tr key={c.id}>
                  <td><a className="text-link" href={'/c/' + c.code} target="_blank" rel="noreferrer">{c.code}</a></td>
                  <td><span className="rarity-pill">{rarityLabel(c.rarity)}</span></td>
                  <td><select className="status-select" value={c.status} onChange={e => setCardStatus(c, e.target.value)}>{CARD_STATUS.map(s => <option key={s}>{s}</option>)}</select></td>
                  <td>{c.owner_email || <span className="muted">Belum ada</span>}</td>
                  <td>{c.order_number || <span className="muted">—</span>}</td>
                  <td>{c.level}</td><td>{c.exp}</td><td>{c.taps}</td>
                  <td><button className="text-link" onClick={() => setDialog({ type: 'assign', card: c, email: c.owner_email || '' })}>Pemilik</button>{' · '}<button className="text-link" onClick={() => setDialog({ type: 'share', card: c })}>Tautan & NFC</button>{' · '}<button className="text-link" onClick={() => setDialog({ type: 'exp', card: c, amount: '', reason: '' })}>Bonus EXP</button></td>
                </tr>)}
                {shownCards.length === 0 && <tr><td colSpan="9" className="muted">Belum ada kartu.</td></tr>}
              </tbody>
            </table></div>
          </div>
        </>}

        {tab === 'Member' && <div className="panel">
          <div className="panel-heading"><div><h3>Member terdaftar</h3><p className="muted">{members.length} akun</p></div>{searchBox}</div>
          <div className="table-wrap"><table>
            <thead><tr><th>Nama</th><th>Email</th><th>Username</th><th>Role</th><th>Pesanan</th><th>Kartu</th><th>Bergabung</th></tr></thead>
            <tbody>
              {shownMembers.map(m => <tr key={m.id}><td>{m.display_name}</td><td>{m.email}</td><td>{m.username || '—'}</td><td><span className="rarity-pill">{m.role}</span></td><td>{m.order_count}</td><td>{m.card_count}</td><td>{fmtDate(m.created_at)}</td></tr>)}
              {shownMembers.length === 0 && <tr><td colSpan="7" className="muted">Tidak ada data.</td></tr>}
            </tbody>
          </table></div>
        </div>}

        {tab === 'Rarity' && <div className="panel">
          <div className="panel-heading"><div><h3>Harga per rarity</h3><p className="muted">Harga ini yang dipakai server saat menghitung total pesanan.</p></div></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Rarity</th><th>Harga (IDR)</th><th>Dijual</th><th>Aksi</th></tr></thead>
            <tbody>{rarities.map(r => {
              const p = prices[r.id];
              return <tr key={r.id}>
                <td><span className="rarity-pill" style={{ color: r.color, borderColor: r.color }}>{r.label}</span></td>
                <td><input className="mini-input" type="number" min="0" value={p ? p.price : ''} placeholder="belum diatur" onChange={e => setPrices({ ...prices, [r.id]: { price: e.target.value, active: p ? p.active : true } })} /></td>
                <td><input type="checkbox" checked={p ? p.active : true} onChange={e => setPrices({ ...prices, [r.id]: { price: p ? p.price : '', active: e.target.checked } })} /></td>
                <td><button className="text-link" onClick={() => savePrice(r.id)}>Simpan</button></td>
              </tr>;
            })}</tbody>
          </table></div>
        </div>}

        {tab === 'Pengaturan' && <div className="panel">
          <div className="panel-heading"><div><h3>Aturan EXP</h3><p className="muted">Berlaku untuk semua kartu.</p></div><Zap size={17} /></div>
          <form className="admin-form" onSubmit={saveSettings}>
            <label>EXP per kunjungan unik harian<input type="number" min="0" value={settings.visit} onChange={e => setSettings({ ...settings, visit: e.target.value })} required /></label>
            <label>EXP per level<input type="number" min="1" value={settings.perLevel} onChange={e => setSettings({ ...settings, perLevel: e.target.value })} required /></label>
            <button className="btn btn-gold">Simpan pengaturan</button>
          </form>
        </div>}
      </section>
    </main>
  );
}
