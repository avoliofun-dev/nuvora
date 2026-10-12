import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  ShieldCheck, ArrowRight, Rotate3D, Layers, Share2, Pencil, ChevronLeft, ChevronRight,
  Instagram, Globe, ExternalLink, Mail, Phone, MapPin, Briefcase, Download, Sparkles,
  MessageCircle, Send, Link2
} from 'lucide-react';
import { rarities, fmtDate } from './shared.js';

// Kartu contoh: hanya tampil untuk /c/NRD-0001 bila kode itu belum ada di database.
export const DEMO_CARD = {
  demo: true, code: 'NRD-0001', number: 1, rarity: 'LEGENDARY', display_name: 'Narendra',
  title: 'Builder & Kolektor',
  level: 12, exp: 320, exp_per_level: 500, exp_into_level: 320, taps: 48, style: {}, is_owner: false,
  created_at: '2026-10-12', activated_at: '2026-10-12', first_visit_at: '2026-10-12',
  owner: {
    display_name: 'Narendra', username: '', location: 'Indonesia', joined_at: '2026-10-12',
    headline: 'Founder & Product Builder', company: 'Cardora Studio',
    public_email: 'halo@example.com', public_phone: '',
    bio: 'Builder, kreator, dan kolektor. Senang membuat hal digital menjadi nyata.'
  },
  experiences: [
    { title: 'Founder', org: 'Cardora Studio', start_year: 2025, end_year: null, description: 'Membangun identitas digital berbasis kartu NFC.' },
    { title: 'Product Designer', org: 'Studio Kreatif', start_year: 2022, end_year: 2025, description: 'Merancang produk digital untuk brand lokal.' }
  ],
  socials: [
    { platform: 'instagram', label: 'Instagram', url: 'https://instagram.com' },
    { platform: 'website', label: 'Website', url: 'https://example.com' }
  ]
};

const safeUrl = u => /^https?:\/\/\S+$/i.test(u || '');
const cssUrl = u => 'url("' + String(u).replace(/["\\\s()]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')) + '")';
const monthYear = d => d ? new Date(d).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '';
const FONTS = {
  modern: "Manrope,'DM Sans',system-ui,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,monospace"
};

function downloadVcf(owner, name, code) {
  const esc = v => String(v || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + esc(name), 'N:;' + esc(name) + ';;;'];
  if (owner?.company) lines.push('ORG:' + esc(owner.company));
  if (owner?.headline) lines.push('TITLE:' + esc(owner.headline));
  if (owner?.public_phone) lines.push('TEL;TYPE=CELL:' + esc(owner.public_phone));
  if (owner?.public_email) lines.push('EMAIL:' + esc(owner.public_email));
  if (safeUrl(owner?.website_url)) lines.push('URL:' + owner.website_url);
  lines.push('NOTE:Kartu Cardora ' + esc(code), 'END:VCARD');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (name || 'kontak').replace(/[^\w.-]+/g, '_') + '.vcf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------------------------------------------------------------------------
   Kartu fisik 2 sisi + hologram. Rotasi dikendalikan lewat ref (tanpa re-render)
   supaya mulus di HP. Mode 3D: seret bebas 360°, ada inersia. Mode biasa:
   hanya miring tipis mengikuti kursor, dan bisa dibalik dengan tombol.
--------------------------------------------------------------------------- */
export const HoloCard = forwardRef(function HoloCard({ view, r, art, accent, st, mode3d, qr }, ref) {
  const rootRef = useRef(null);
  const innerRef = useRef(null);
  const s = useRef({ x: 0, y: 0, vx: 0, vy: 0, drag: false, lx: 0, ly: 0, raf: 0, target: null });

  const apply = useCallback(() => {
    const c = s.current, root = rootRef.current, inner = innerRef.current;
    if (!root || !inner) return;
    inner.style.transform = `rotateX(${c.x}deg) rotateY(${c.y}deg)`;
    const rad = Math.PI / 180;
    const mx = 50 + Math.sin(c.y * rad) * 50;
    const my = 50 - Math.sin(c.x * rad) * 50;
    const hi = Math.min(1, (Math.abs(Math.sin(c.y * rad)) + Math.abs(Math.sin(c.x * rad))) * 1.15 + 0.3);
    root.style.setProperty('--mx', mx.toFixed(1) + '%');
    root.style.setProperty('--my', my.toFixed(1) + '%');
    root.style.setProperty('--hi', hi.toFixed(2));
  }, []);

  const tick = useCallback(() => {
    const c = s.current; c.raf = 0;
    if (c.target != null) {
      const d = c.target - c.y;
      c.y += d * 0.14; c.x += (0 - c.x) * 0.14;
      if (Math.abs(d) < 0.3 && Math.abs(c.x) < 0.3) { c.y = c.target; c.x = 0; c.target = null; apply(); return; }
    } else if (!c.drag) {
      c.y += c.vy; c.x += c.vx;
      c.vy *= 0.95; c.vx *= 0.9; c.x *= 0.94;
      c.x = Math.max(-38, Math.min(38, c.x));
      if (Math.abs(c.vy) < 0.05 && Math.abs(c.x) < 0.2) { c.vy = 0; c.vx = 0; c.x = 0; apply(); return; }
    } else { apply(); return; }
    apply();
    c.raf = requestAnimationFrame(tick);
  }, [apply]);

  const kick = useCallback(() => { if (!s.current.raf) s.current.raf = requestAnimationFrame(tick); }, [tick]);

  useImperativeHandle(ref, () => ({
    flip() { const c = s.current; c.vx = c.vy = 0; c.drag = false; c.target = Math.round(c.y / 180) * 180 + 180; kick(); },
    spin() { const c = s.current; c.vx = c.vy = 0; c.drag = false; c.target = Math.round(c.y / 360) * 360 + 360; kick(); },
    reset() { const c = s.current; c.vx = c.vy = 0; c.drag = false; c.target = Math.round(c.y / 360) * 360; kick(); }
  }), [kick]);

  useEffect(() => { apply(); const c = s.current; return () => cancelAnimationFrame(c.raf); }, [apply]);

  const onDown = e => {
    if (!mode3d) return;
    const c = s.current;
    c.drag = true; c.target = null; c.lx = e.clientX; c.ly = e.clientY; c.vx = c.vy = 0;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* abaikan */ }
  };
  const onMove = e => {
    const c = s.current;
    if (mode3d) {
      if (!c.drag) return;
      const dx = e.clientX - c.lx, dy = e.clientY - c.ly;
      c.lx = e.clientX; c.ly = e.clientY;
      c.y += dx * 0.6; c.x = Math.max(-38, Math.min(38, c.x - dy * 0.4));
      c.vy = dx * 0.6; c.vx = -dy * 0.4;
      apply();
    } else if (e.pointerType === 'mouse') {
      const b = e.currentTarget.getBoundingClientRect();
      const px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
      c.target = null; c.y = Math.round(c.y / 180) * 180 + px * 16; c.x = -py * 16;
      apply();
    }
  };
  const onUp = () => { const c = s.current; if (mode3d && c.drag) { c.drag = false; kick(); } };
  const onLeave = () => { if (!mode3d) { const c = s.current; c.target = Math.round(c.y / 180) * 180; kick(); } };

  const owner = view.owner;
  const cardName = view.display_name || owner?.display_name || 'Cardora';
  const sub = owner?.headline || view.title || '';
  const layout = st.layout || 'classic';
  const bg = st.bg || 'art';
  const frontBg = bg === 'art'
    ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.05) 0%,rgba(2,8,14,.35) 55%,rgba(2,8,14,.96) 100%),${cssUrl(art)}` }
    : bg === 'gradient'
      ? { backgroundImage: 'radial-gradient(circle at 18% 12%,color-mix(in srgb,var(--accent) 55%,transparent),transparent 55%),radial-gradient(circle at 88% 92%,color-mix(in srgb,var(--rarity) 48%,transparent),transparent 58%),linear-gradient(160deg,#10202f,#050b12)' }
      : { background: 'linear-gradient(160deg,#111c28,#070e15)' };

  return (
    <div
      ref={rootRef}
      className={`hc holo-${view.rarity} ${mode3d ? 'hc3d' : ''} ${st.holo === false ? 'no-holo' : ''}`}
      style={{ '--rarity': r.color, '--accent': accent, '--cfont': FONTS[st.font] || FONTS.modern }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onLeave}
    >
      <div className="hc-inner" ref={innerRef}>
        <div className={`hc-face hc-front fl-${layout}`}>
          <div className="hc-bg" style={frontBg} />
          {layout === 'bold' && <div className="hc-watermark">{String(view.level).padStart(2, '0')}</div>}
          <div className="hc-top"><span>✦ CARDORA</span><span className="rarity-chip">{view.rarity}</span></div>
          <div className="hc-bottom">
            <b>{cardName}</b>
            {sub && <em>{sub}</em>}
            <div className="hc-meta"><span>{view.code}</span><small><ShieldCheck size={11} /> AUTHENTIC</small></div>
          </div>
          <div className="holo" /><div className="glare" /><div className="sheen" />
        </div>

        <div className="hc-face hc-back">
          <div className="hc-back-pattern" />
          <div className="hc-back-inner">
            <Sparkles size={22} />
            <strong>CARDORA</strong>
            {qr ? <img className="hc-qr" src={qr} alt={'QR ' + view.code} draggable="false" /> : <span className="nfc-glyph">◉</span>}
            <b>{view.code}</b>
            <span>KOLEKSI #{String(view.number).padStart(3, '0')} · LV {view.level}</span>
            <small>Tap atau pindai untuk verifikasi</small>
          </div>
          <div className="holo" /><div className="glare" />
        </div>
      </div>
    </div>
  );
});

const SOCIAL_BADGE = { tiktok: 'Tk', linkedin: 'in', x: 'X', twitter: 'X', youtube: 'YT', facebook: 'f', github: 'GH' };
function SocialIcon({ platform }) {
  const I = { instagram: Instagram, whatsapp: MessageCircle, telegram: Send, website: Globe }[platform];
  if (I) return <I size={17} />;
  if (SOCIAL_BADGE[platform]) return <span className="cp-badge-ic" aria-hidden="true">{SOCIAL_BADGE[platform]}</span>;
  return <Link2 size={17} />;
}
const SLIDE_DEFS = [['Kartu', null], ['Profil', 'profile'], ['Pengalaman', 'experience'], ['Kontak', 'contact'], ['Statistik', 'stats']];

export default function CardPage({ view, loading, code, go, notify }) {
  const [mode3d, setMode3d] = useState(false);
  const [idx, setIdx] = useState(0);
  const [qr, setQr] = useState('');
  const card2d = useRef(null);
  const card3d = useRef(null);
  const swRef = useRef(null);
  const drag = useRef({ on: false, x: 0, l: 0 });

  useEffect(() => {
    if (!view) return;
    let alive = true;
    import('qrcode').then(m => (m.default || m).toDataURL(location.origin + '/c/' + view.code, { margin: 1, width: 260, color: { dark: '#0b1620', light: '#f4f6f9' } }))
      .then(u => { if (alive) setQr(u); }).catch(() => {});
    return () => { alive = false; };
  }, [view]);

  const hide = (view && (view.hide || (view.style && view.style.hide))) || [];
  const slideNames = SLIDE_DEFS.filter(([, k]) => !k || !hide.includes(k)).map(([n]) => n);
  const show = k => !hide.includes(k);
  const goTo = useCallback(i => {
    const el = swRef.current; if (!el) return;
    const n = Math.max(0, Math.min(slideNames.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  }, [slideNames.length]);

  useEffect(() => {
    const onKey = e => {
      if (mode3d) { if (e.key === 'Escape') setMode3d(false); return; }
      if (e.key === 'ArrowRight') goTo(idx + 1);
      if (e.key === 'ArrowLeft') goTo(idx - 1);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [idx, mode3d, goTo]);

  if (loading) return <div className="cp-root cp-center"><div className="cp-loader"><span /><small>Memuat kartu…</small></div></div>;

  if (!view) {
    return (
      <div className="cp-root cp-center">
        <div className="cp-notfound">
          <Sparkles size={30} />
          <h2>Kartu tidak ditemukan</h2>
          <p>Kode <b>{code}</b> belum terdaftar atau kartunya belum aktif. Periksa kembali kode pada kartumu.</p>
          <button className="btn btn-gold" onClick={() => go('home')}>Ke beranda <ArrowRight size={15} /></button>
        </div>
      </div>
    );
  }

  const r = rarities.find(x => x.id === view.rarity) || rarities[0];
  const st = view.style || {};
  const accent = /^#[0-9a-f]{6}$/i.test(st.accent || '') ? st.accent : r.color;
  const owner = view.owner;
  const cardName = view.display_name || owner?.display_name || 'Cardora';
  const art = safeUrl(view.front_image) ? view.front_image : r.image;
  const pct = Math.min(100, Math.round((view.exp_into_level / Math.max(1, view.exp_per_level)) * 100));
  const socials = [...(view.socials || [])].filter(x => safeUrl(x.url));
  if (safeUrl(owner?.website_url) && !socials.some(x => x.url === owner.website_url)) socials.push({ platform: 'website', label: 'Website', url: owner.website_url });
  const experiences = view.experiences || [];
  const events = [['Kartu dibuat', view.created_at], view.activated_at && ['Kartu diaktifkan', view.activated_at], view.first_visit_at && ['Kunjungan unik pertama', view.first_visit_at]].filter(Boolean);
  const showTaps = st.show_taps !== false;
  const hasContact = owner && (owner.public_email || owner.public_phone || socials.length > 0);

  const share = async () => {
    const url = location.origin + '/c/' + view.code;
    try {
      if (navigator.share) { await navigator.share({ title: cardName + ' · Cardora', url }); return; }
      await navigator.clipboard.writeText(url); notify('Tautan kartu disalin.');
    } catch { notify('Salin tautan dari address bar browser.'); }
  };

  const onScroll = () => { const el = swRef.current; if (el) setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); };
  const mDown = e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('a,button')) return;
    const el = swRef.current; drag.current = { on: true, x: e.clientX, l: el.scrollLeft };
    el.classList.add('dragging');
  };
  const mMove = e => { const d = drag.current; if (d.on) swRef.current.scrollLeft = d.l - (e.clientX - d.x); };
  const mUp = () => {
    const d = drag.current; if (!d.on) return; d.on = false;
    const el = swRef.current; el.classList.remove('dragging');
    goTo(Math.round(el.scrollLeft / el.clientWidth));
  };

  const ringC = 2 * Math.PI * 44;

  return (
    <div className="cp-root" style={{ '--accent': accent, '--rarity': r.color }}>
      <div className="cp-aurora" />

      <header className="cp-head">
        {owner && view.is_owner
          ? <button className="cp-pill" onClick={() => go('member')}><ChevronLeft size={15} /> Dashboard</button>
          : <span className="cp-word">✦ cardora</span>}
        <div className="cp-actions">
          <button className="cp-icon" onClick={() => setMode3d(true)} aria-label="Mode 3D" title="Mode 3D"><Rotate3D size={17} /></button>
          <button className="cp-icon" onClick={share} aria-label="Bagikan" title="Bagikan"><Share2 size={17} /></button>
          {view.is_owner && <button className="cp-icon gold" onClick={() => go('card-editor', view.code)} aria-label="Edit kartu" title="Edit kartu"><Pencil size={16} /></button>}
        </div>
      </header>

      <div className="cp-swiper" ref={swRef} onScroll={onScroll}
        onPointerDown={mDown} onPointerMove={mMove} onPointerUp={mUp} onPointerLeave={mUp}>

        <section className="cp-slide">
          <div className="cp-card-wrap">
            <HoloCard ref={card2d} view={view} r={r} art={art} accent={accent} st={st} mode3d={false} qr={qr} />
          </div>
          <div className="cp-card-tools">
            <button className="cp-chip" onClick={() => card2d.current?.flip()}><Layers size={14} /> Balik kartu</button>
            <button className="cp-chip" onClick={() => setMode3d(true)}><Rotate3D size={14} /> Mode 3D</button>
          </div>
          {slideNames.length > 1 && <button className="cp-hint" onClick={() => goTo(1)}>Geser untuk melihat {slideNames[1].toLowerCase()} <ChevronRight size={15} /></button>}
        </section>

        {show('profile') && <section className="cp-slide">
          <div className="cp-panel">
            <span className="cp-eyebrow">PROFIL</span>
            {owner ? <>
              <div className="cp-ident">
                {safeUrl(owner.avatar_url)
                  ? <img className="cp-avatar" src={owner.avatar_url} alt="" />
                  : <div className="cp-avatar">{(owner.display_name || 'C').slice(0, 1).toUpperCase()}</div>}
                <div>
                  <h2>{owner.display_name}</h2>
                  {owner.headline && <p className="cp-headline">{owner.headline}</p>}
                  {owner.username && <small>@{owner.username}</small>}
                </div>
              </div>
              <div className="cp-tags">
                {owner.company && <span><Briefcase size={13} /> {owner.company}</span>}
                {owner.location && <span><MapPin size={13} /> {owner.location}</span>}
              </div>
              {owner.bio ? <p className="cp-bio">{owner.bio}</p> : <p className="cp-muted">Pemilik belum menulis bio.</p>}
              <button className="btn btn-gold cp-cta" onClick={() => downloadVcf(owner, owner.display_name, view.code)}><Download size={15} /> Simpan kontak</button>
            </> : <>
              <h2>Profil belum tersedia</h2>
              <p className="cp-muted">Kartu ini belum dimiliki siapa pun, atau pemiliknya menyembunyikan profil.</p>
            </>}
          </div>
        </section>}

        {show('experience') && <section className="cp-slide">
          <div className="cp-panel">
            <span className="cp-eyebrow">PENGALAMAN</span>
            <h2>Perjalanan profesional</h2>
            {experiences.length === 0 && <p className="cp-muted">Belum ada pengalaman yang ditampilkan.</p>}
            <div className="cp-exps">
              {experiences.map((e, i) => (
                <div className="cp-exp" key={i}>
                  <span className="cp-exp-dot" />
                  <div>
                    <b>{e.title}</b>
                    <small>{[e.org, [e.start_year, e.end_year || (e.start_year ? 'Sekarang' : null)].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</small>
                    {e.description && <p>{e.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>}

        {show('contact') && <section className="cp-slide">
          <div className="cp-panel">
            <span className="cp-eyebrow">KONTAK & SOSIAL</span>
            <h2>{owner ? `Terhubung dengan ${owner.display_name}` : 'Tautan'}</h2>
            {!hasContact && <p className="cp-muted">Belum ada kontak atau tautan sosial yang dibagikan.</p>}
            {owner && !show('profile') && hasContact && <button className="btn btn-gold cp-cta" onClick={() => downloadVcf(owner, owner.display_name, view.code)}><Download size={15} /> Simpan kontak</button>}
            <div className="cp-links">
              {owner?.public_email && <a href={'mailto:' + owner.public_email}><Mail size={17} /> {owner.public_email}</a>}
              {owner?.public_phone && <a href={'tel:' + owner.public_phone.replace(/[^\d+]/g, '')}><Phone size={17} /> {owner.public_phone}</a>}
              {socials.map(x => (
                <a key={x.platform + x.url} href={x.url} target="_blank" rel="noreferrer noopener">
                  <SocialIcon platform={x.platform} /> {x.label || x.platform} <ExternalLink size={13} className="cp-ext" />
                </a>
              ))}
            </div>
          </div>
        </section>}

        {show('stats') && <section className="cp-slide">
          <div className="cp-panel">
            <span className="cp-eyebrow">STATISTIK KARTU</span>
            <div className="cp-ring">
              <svg viewBox="0 0 100 100" width="132" height="132">
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
                <circle cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={ringC} strokeDashoffset={ringC * (1 - pct / 100)} transform="rotate(-90 50 50)" />
              </svg>
              <div><small>LEVEL</small><b>{view.level}</b></div>
            </div>
            <p className="cp-center-text">{view.exp_into_level} / {view.exp_per_level} EXP menuju level berikutnya</p>
            <div className="cp-stats">
              <div><small>Total EXP</small><b>{view.exp}</b></div>
              {showTaps && <div><small>Total tap</small><b>{view.taps}</b></div>}
              <div><small>Koleksi</small><b>#{String(view.number).padStart(3, '0')}</b></div>
            </div>
            {events.map(([label, date]) => <div className="cp-event" key={label}><span /><b>{label}</b><small>{fmtDate(date)}</small></div>)}
            <p className="cp-muted cp-center-text">Diterbitkan {monthYear(view.activated_at || view.created_at)}{view.demo ? ' · kartu contoh' : ''}</p>
          </div>
        </section>}
      </div>

      <footer className="cp-foot">
        <button className="cp-nav" onClick={() => goTo(idx - 1)} disabled={idx === 0} aria-label="Sebelumnya"><ChevronLeft size={18} /></button>
        <div className="cp-dots">
          {slideNames.map((n, i) => <button key={n} className={i === idx ? 'active' : ''} onClick={() => goTo(i)} aria-label={n}><span>{n}</span></button>)}
        </div>
        <button className="cp-nav" onClick={() => goTo(idx + 1)} disabled={idx === slideNames.length - 1} aria-label="Berikutnya"><ChevronRight size={18} /></button>
      </footer>

      {mode3d && (
        <div className="cp-3d">
          <div className="cp-spot" />
          <button className="cp-pill cp-3d-close" onClick={() => setMode3d(false)}>Tutup 3D</button>
          <div className="cp-3d-stage"><HoloCard ref={card3d} view={view} r={r} art={art} accent={accent} st={st} mode3d qr={qr} /></div>
          <p className="cp-3d-hint">Seret untuk memutar kartu 360°</p>
          <div className="cp-3d-tools">
            <button className="cp-chip" onClick={() => card3d.current?.flip()}><Layers size={14} /> Balik</button>
            <button className="cp-chip" onClick={() => card3d.current?.spin()}><Rotate3D size={14} /> Putar 360°</button>
            <button className="cp-chip" onClick={() => card3d.current?.reset()}>Reset</button>
            {slideNames.length > 1 && <button className="cp-chip" onClick={() => { setMode3d(false); setTimeout(() => goTo(1), 60); }}>{slideNames[1]}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
