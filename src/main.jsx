import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Sparkles, ShieldCheck, ArrowRight, Menu, X, UserRound, Layers, ShoppingBag, LayoutDashboard, Settings, LogOut, Instagram, Globe, Zap, Eye, Rotate3D, Check, Plus, Minus, Search, ChevronRight, Crown, CircleHelp, ExternalLink } from 'lucide-react';
import './style.css';
import { supabase } from './supabase.js';
import { rarities, money, mapOrder } from './shared.js';
import AdminPanel from './admin.jsx';
import CardPage, { DEMO_CARD } from './CardPage.jsx';
import CardEditor from './CardEditor.jsx';
import ProfilePage from './ProfilePage.jsx';
import ImageField from './ImageUpload.jsx';

const initialOrders=[];
const pageFromPath=()=>location.pathname.startsWith('/c/')?'card':(location.pathname.replace(/^\//,'').split('/')[0]||'home');
const codeFromPath=()=>location.pathname.startsWith('/c/')?decodeURIComponent(location.pathname.split('/')[2]||'').toUpperCase()||'NRD-0001':'NRD-0001';
function friendlyAuthError(e){const m=(e&&e.message)||String(e);
 if(/invalid login credentials/i.test(m))return 'Email atau kata sandi salah.';
 if(/email not confirmed/i.test(m))return 'Email belum terkonfirmasi. Matikan "Confirm email" di Supabase atau jalankan ulang supabase_schema.sql (lihat README).';
 if(/already registered|already been registered/i.test(m))return 'Email ini sudah terdaftar. Silakan masuk.';
 if(/rate limit|sending confirmation|sending.*email/i.test(m))return 'Supabase mencoba mengirim email. Matikan "Confirm email" di Authentication → Providers → Email agar tidak butuh SMTP.';
 if(/database error saving new user/i.test(m))return 'Database belum siap. Jalankan supabase_schema.sql terbaru di SQL Editor.';
 if(/signups? not allowed|signup is disabled/i.test(m))return 'Pendaftaran dinonaktifkan di Supabase (Authentication → Sign In / Providers).';
 return m}
function App(){
 const [page,setPage]=useState(location.pathname.startsWith('/c/')?'card':location.pathname.replace(/^\//,'').split('/')[0]||'home'); const [mobileMenu,setMobileMenu]=useState(false); const [rarity,setRarity]=useState('LEGENDARY'); const [qty,setQty]=useState(1); const [kind,setKind]=useState('Kartu baru'); const [note,setNote]=useState(''); const [toast,setToast]=useState(''); const [sidebarCollapsed,setSidebarCollapsed]=useState(false); const [orders,setOrders]=useState(initialOrders); const [user,setUser]=useState({name:'Member',username:'',email:''}); const [authMode,setAuthMode]=useState('login'); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [displayName,setDisplayName]=useState(user.name); const [search,setSearch]=useState(''); const [adminTab,setAdminTab]=useState('Ringkasan'); const [auth,setAuth]=useState({ready:false,user:null,profile:null}); const [cardCode,setCardCode]=useState(codeFromPath()); const [cardView,setCardView]=useState(null); const [cardLoading,setCardLoading]=useState(false); const [stats,setStats]=useState(null); const [phone,setPhone]=useState(''); const [address,setAddress]=useState(''); const [priceMap,setPriceMap]=useState(null); const [photos,setPhotos]=useState([]); const [busy,setBusy]=useState(false); const [userPopup,setUserPopup]=useState(false); const userPopupRef=useRef(null);
 useEffect(()=>{const sync=()=>{setPage(pageFromPath());setCardCode(codeFromPath())};addEventListener('popstate',sync);return()=>removeEventListener('popstate',sync)},[]);
 useEffect(()=>{if(page==='admin-login')setAuthMode('login')},[page]);
 useEffect(()=>{
  function handler(e){if(userPopupRef.current&&!userPopupRef.current.contains(e.target))setUserPopup(false);}
  if(userPopup)document.addEventListener('mousedown',handler);
  return()=>document.removeEventListener('mousedown',handler);
 },[userPopup]);

 // Sesi login: dimuat sekali, lalu mengikuti perubahan (login/logout/refresh token)
 useEffect(()=>{
  if(!supabase){setAuth({ready:true,user:null,profile:null});return}
  let alive=true;
  async function hydrate(session){
   if(!session||!session.user){if(alive)setAuth({ready:true,user:null,profile:null});return}
   const u=session.user;const profile=await loadProfile(u.id);
   if(!alive)return;
   setAuth({ready:true,user:{id:u.id,email:u.email||''},profile});
   if(profile)setUser({name:profile.display_name||'Member',username:profile.username||'',email:u.email||''});
  }
  supabase.auth.getSession().then(({data})=>hydrate(data.session));
  const {data:sub}=supabase.auth.onAuthStateChange((evt,session)=>{if(evt==='INITIAL_SESSION'||evt==='TOKEN_REFRESHED')return;setTimeout(()=>hydrate(session),0)});
  return()=>{alive=false;sub.subscription.unsubscribe()}
 },[]);

 // Penjaga halaman: member, admin, dan halaman login
 useEffect(()=>{
  if(!auth.ready)return;
  const role=auth.profile&&auth.profile.role;
  if(page==='admin'){
   if(!auth.user){go('admin-login');return}
   if(role!=='ADMIN'){notify('Akun ini tidak memiliki akses administrator.');go('admin-login')}
   return}
  if(['member','orders','profile','card-editor','my-cards'].includes(page)){
   if(!auth.user){go('customer-login');return}
   if(role==='ADMIN')go('admin');
   return}
  if(page==='customer-login'&&auth.user&&role==='MEMBER')go('member');
  if(page==='admin-login'&&auth.user&&role==='ADMIN')go('admin');
 },[page,auth]);

 // Harga resmi dari database (rarity yang tidak dijual disembunyikan)
 useEffect(()=>{if(!supabase)return;supabase.from('rarity_prices').select('rarity,unit_price,active').then(({data})=>{if(data&&data.length)setPriceMap(Object.fromEntries(data.map(r=>[r.rarity,{price:Number(r.unit_price)}])))})},[]);

 // Pesanan + ringkasan dashboard member
 useEffect(()=>{
  if(!supabase||!auth.user||(auth.profile&&auth.profile.role==='ADMIN')||!['member','orders','my-cards'].includes(page))return;
  let alive=true;
  (async()=>{
   const {data,error}=await supabase.from('orders').select('id,order_number,rarity,quantity,status,created_at,card_type,customer_note,total_price,shipping_address,phone,photo_urls').order('created_at',{ascending:false}).limit(100);
   if(!alive)return;
   if(error){notify('Gagal memuat pesanan: '+error.message);return}
   setOrders((data||[]).map(mapOrder));
   if(page==='member'||page==='my-cards'){const r=await supabase.rpc('member_dashboard');if(alive&&!r.error)setStats(r.data)}
  })();
  return()=>{alive=false}
 },[page,auth]);

 // Halaman kartu publik: ambil dari database, catat kunjungan (opsional)
 useEffect(()=>{
  if(page!=='card')return;
  let alive=true;setCardLoading(true);setCardView(null);
  (async()=>{
   let view=null;
   if(supabase){
    const {data}=await supabase.rpc('get_public_card',{p_code:cardCode});view=data||null;
    if(view)fetch('/api/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:cardCode,ref:document.referrer||''})}).catch(()=>{});
   }
   if(!view&&cardCode==='NRD-0001')view=DEMO_CARD;
   if(alive){setCardView(view);setCardLoading(false)}
  })();
  return()=>{alive=false}
 },[page,cardCode]);

 async function loadProfile(uid){
  let {data:profile}=await supabase.from('profiles').select('id,display_name,username,role,bio,location,website_url').eq('id',uid).maybeSingle();
  if(!profile){const r=await supabase.rpc('ensure_my_profile');profile=r.data||null}
  return profile}
 function openMyCard(){const l=(stats&&stats.cards)||[];if(l.length===0){notify('Kamu belum memiliki kartu. Setelah pesananmu diproses, admin akan menautkan kartu ke akunmu.');return}if(l.length===1){go('card',l[0].code);return}go('my-cards')}
 function go(p,arg){const code=String(arg||'NRD-0001').toUpperCase();const path=p==='card'?'/c/'+encodeURIComponent(code):p==='home'?'/':p==='admin-login'?'/admin-login':p==='customer-login'?'/customer-login':'/'+p;history.pushState({},'',path);setPage(p);if(p==='card'||p==='card-editor')setCardCode(code);setMobileMenu(false);window.scrollTo(0,0)}
 function notify(s){setToast(s);setTimeout(()=>setToast(''),5000)}
 async function submitOrder(){
  if(!supabase){notify('Supabase belum dikonfigurasi.');return}
  if(!auth.user){notify('Silakan login sebelum membuat pesanan.');go('customer-login');return}
  if(phone.trim().length<6||address.trim().length<10){notify('Lengkapi nomor telepon dan alamat pengiriman (min. 10 karakter).');return}
  const ph=kind==='Penggantian kartu'?[]:Array.from({length:qty},(_,i)=>photos[i]||'');
  const filled=ph.filter(Boolean).length;
  if(kind==='Kartu custom'&&filled<qty){notify('Kartu custom membutuhkan '+qty+' foto (satu per kartu). Pilih foto untuk setiap kartu.');return}
  if(kind==='Kartu baru'&&filled>0&&filled<qty){notify('Isi foto untuk semua kartu, atau kosongkan semuanya.');return}
  setBusy(true);
  const {data,error}=await supabase.rpc('create_cardora_order',{p_rarity:selected.id,p_quantity:qty,p_phone:phone.trim(),p_shipping_address:address.trim(),p_card_type:kind,p_customer_note:note||null,p_photo_urls:filled?ph:null});
  setBusy(false);
  if(error){notify('Pesanan gagal disimpan: '+error.message);return}
  setOrders(prev=>[mapOrder(data),...prev]);setNote('');setPhotos([]);notify('Pesanan terkirim. Admin akan mengonfirmasi sebelum produksi.');go('orders')}
 async function login(e){
  e.preventDefault();
  if(!supabase){notify('Supabase belum dikonfigurasi.');return}
  const isAdmin=page==='admin-login';
  const mode=isAdmin?'login':authMode;
  const mail=email.trim().toLowerCase();
  setBusy(true);
  try{
   if(mode==='signup'){
    if(password.length<8){notify('Kata sandi minimal 8 karakter.');return}
    const name=displayName.trim().slice(0,60);
    if(!name){notify('Nama tampilan wajib diisi.');return}
    const {data,error}=await supabase.auth.signUp({email:mail,password,options:{data:{display_name:name}}});
    if(error){notify(friendlyAuthError(error));return}
    if(data.user&&data.user.identities&&data.user.identities.length===0){notify('Email ini sudah terdaftar. Silakan masuk.');setAuthMode('login');return}
    let session=data.session;
    if(!session){const r=await supabase.auth.signInWithPassword({email:mail,password});if(r.error){notify(friendlyAuthError(r.error));setAuthMode('login');return}session=r.data.session}
    const profile=await loadProfile(session.user.id);
    if(!profile){await supabase.auth.signOut();notify('Akun dibuat, tetapi profil belum tersedia. Jalankan supabase_schema.sql terbaru lalu masuk kembali.');setAuthMode('login');return}
    setAuth({ready:true,user:{id:session.user.id,email:session.user.email||''},profile});
    setUser({name:profile.display_name||name,username:profile.username||'',email:session.user.email||''});
    setPassword('');notify('Akun berhasil dibuat. Selamat datang!');go('member');return}
   const {data,error}=await supabase.auth.signInWithPassword({email:mail,password});
   if(error){notify(friendlyAuthError(error));return}
   const au=data.user;
   if(!au){notify('Login gagal. Silakan coba lagi.');return}
   const profile=await loadProfile(au.id);
   if(!profile){await supabase.auth.signOut();notify('Profil belum tersedia. Jalankan supabase_schema.sql terbaru di SQL Editor.');return}
   if(isAdmin&&profile.role!=='ADMIN'){await supabase.auth.signOut();notify('Akses ditolak. Akun ini bukan administrator.');return}
   if(!isAdmin&&profile.role==='ADMIN'){await supabase.auth.signOut();notify('Akun administrator tidak dapat masuk dari halaman ini.');return}
   setAuth({ready:true,user:{id:au.id,email:au.email||''},profile});
   setUser({name:profile.display_name||(isAdmin?'Admin':'Member'),username:profile.username||'',email:au.email||''});
   setPassword('');notify(isAdmin?'Login administrator berhasil.':'Berhasil masuk.');go(isAdmin?'admin':'member')
  }finally{setBusy(false)}
 }
 async function logout(){if(supabase)await supabase.auth.signOut();setUser({name:'Member',username:'',email:''});setOrders([]);setStats(null);setAuth({ready:true,user:null,profile:null});go('home');notify('Kamu telah keluar.')}
 const shop=priceMap?rarities.filter(r=>priceMap[r.id]).map(r=>({...r,price:priceMap[r.id].price})):rarities;
 const selected=shop.find(r=>r.id===rarity)||shop[0]||rarities[3];
 return <div className="app-shell">{page!=='card'&&<header className="topbar">
   <button className="brand" onClick={()=>go(auth.user?'member':'home')}><span className="brand-mark"><Sparkles size={19}/></span><span>dhiraya</span></button>
   {!auth.user && <nav className="desktop-nav">
      <button className={page==='home'?'active':''} onClick={()=>go('home')}>Beranda</button>
      <button className={page==='collection'?'active':''} onClick={()=>go('collection')}>Koleksi</button>
      <button className={page==='how'?'active':''} onClick={()=>go('how')}>Cara Kerja</button>
      <button className={page==='about'?'active':''} onClick={()=>go('about')}>Tentang</button>
    </nav>}
   <div className="nav-actions">
     {auth.user ? (
       <div className="user-nav-actions" ref={userPopupRef}>
          <button className="avatar-chip" onClick={()=>setUserPopup(v=>!v)} aria-haspopup="true" aria-expanded={userPopup} title={'Profil: '+(user.name||'Member')}>
            <span className="avatar-letter">{(user.name||'M').slice(0,1).toUpperCase()}</span>
            <span className="avatar-name">{user.name||'Member'}</span>
            <span className="avatar-caret">{userPopup?'▴':'▾'}</span>
          </button>
          {userPopup&&<div className="user-popup" role="menu">
            <div className="user-popup-header">
              <span className="user-popup-avatar">{(user.name||'M').slice(0,1).toUpperCase()}</span>
              <div className="user-popup-info"><b>{user.name||'Member'}</b><small>{auth.user.email}</small></div>
            </div>
            <div className="user-popup-divider"/>
            <button className="user-popup-item" role="menuitem" onClick={()=>{setUserPopup(false);go('member');}}><LayoutDashboard size={15}/>Dashboard</button>
            <button className="user-popup-item" role="menuitem" onClick={()=>{setUserPopup(false);go('my-cards');}}><Layers size={15}/>Kartu saya</button>
            <button className="user-popup-item" role="menuitem" onClick={()=>{setUserPopup(false);go('profile');}}><Settings size={15}/>Pengaturan profil</button>
            <div className="user-popup-divider"/>
            <button className="user-popup-item danger" role="menuitem" onClick={()=>{setUserPopup(false);logout();}}><LogOut size={15}/>Keluar</button>
          </div>}
        </div>
     ) : (
       <>
         <button className="btn btn-ghost small" onClick={()=>{setAuthMode('login');go('customer-login')}}>Masuk</button>
         <button className="btn btn-gold small" onClick={()=>{setAuthMode('signup');go('customer-login')}}>Daftar <ArrowRight size={14}/></button>
       </>
     )}
   </div>
   <button className="menu-toggle" onClick={()=>setMobileMenu(!mobileMenu)} aria-label="Menu navigasi">{mobileMenu?<X size={22}/>:<Menu size={22}/>}</button>
 </header>}
 {mobileMenu&&page!=='card'&&<div className="mobile-drawer-overlay" onClick={()=>setMobileMenu(false)}>
   <div className="mobile-drawer" onClick={e=>e.stopPropagation()}>
     <div className="drawer-header">
       <div className="brand"><span className="brand-mark"><Sparkles size={16}/></span><span>dhiraya</span></div>
       <button className="drawer-close-btn" onClick={()=>setMobileMenu(false)} aria-label="Tutup"><X size={18}/></button>
     </div>
     {auth.user ? (
       <>
         <div className="drawer-user-box" onClick={()=>{go('profile');setMobileMenu(false)}}>
           <div className="avatar-letter large">{(user.name||'M').slice(0,1).toUpperCase()}</div>
           <div className="drawer-user-meta">
             <b>{user.name||'Member'}</b>
             <small>{auth.user.email}</small>
           </div>
           <ChevronRight size={16} className="drawer-chevron"/>
         </div>
         <div className="drawer-group">
           <span className="drawer-title">MENU MEMBER</span>
           <button className={page==='member'?'active':''} onClick={()=>go('member')}><LayoutDashboard size={16}/> Dashboard</button>
           <button className={['my-cards','card-editor'].includes(page)?'active':''} onClick={()=>go('my-cards')}><Layers size={16}/> Kartu Saya</button>
           <button className={page==='orders'?'active':''} onClick={()=>go('orders')}><ShoppingBag size={16}/> Pesanan</button>
           <button className={page==='collection'?'active':''} onClick={()=>go('collection')}><Crown size={16}/> Pesan Kartu Baru</button>
           <button className={page==='profile'?'active':''} onClick={()=>go('profile')}><Settings size={16}/> Pengaturan</button>
           <button className="drawer-logout-btn" onClick={()=>{logout();setMobileMenu(false)}}><LogOut size={16}/> Keluar</button>
         </div>
       </>
     ) : (
       <>
         <div className="drawer-group">
           <span className="drawer-title">JELAJAH</span>
           <button className={page==='home'?'active':''} onClick={()=>go('home')}><Sparkles size={16}/> Beranda</button>
           <button className={page==='collection'?'active':''} onClick={()=>go('collection')}><Crown size={16}/> Koleksi Kartu</button>
           <button className={page==='how'?'active':''} onClick={()=>go('how')}><Zap size={16}/> Cara Kerja</button>
           <button className={page==='about'?'active':''} onClick={()=>go('about')}><ShieldCheck size={16}/> Tentang Dhiraya</button>
         </div>
         <div className="drawer-group drawer-auth-actions">
           <button className="btn btn-ghost full" onClick={()=>{setAuthMode('login');go('customer-login')}}>Masuk</button>
           <button className="btn btn-gold full" onClick={()=>{setAuthMode('signup');go('customer-login')}}>Daftar Akun Baru <ArrowRight size={14}/></button>
         </div>
       </>
     )}
   </div>
 </div>}
 {page==='home'&&<><main><section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> DIGITAL IDENTITY & COLLECTIBLES</div><h1>Kartu digital.<br/><em>Penuh cerita.</em></h1><p className="hero-lead">Satu kartu untuk memperkenalkan dirimu, membagikan duniamu, dan mengoleksi perjalanan yang terus berkembang.</p><div className="hero-buttons"><button className="btn btn-gold" onClick={()=>go('collection')}>Mulai koleksi <ArrowRight size={16}/></button><button className="btn btn-ghost" onClick={()=>go('card')}>Lihat kartu demo <Eye size={16}/></button></div><div className="hero-proof"><span><ShieldCheck size={17}/> Profil terverifikasi</span><span><Zap size={17}/> EXP berkembang</span><span><Layers size={17}/> 5 tingkat koleksi</span></div></div><div className="hero-visual"><div className="orb orb-one"/><div className="orb orb-two"/><div className="hero-card card-backdrop"><div className="card-art" style={{backgroundImage:`linear-gradient(180deg,transparent 30%,#071019 100%),url(${selected.image})`}}/><div className="card-top"><span>✦ DHIRAYA</span><span className="rarity-chip" style={{color:selected.color,borderColor:selected.color}}>LEGENDARY</span></div><div className="hero-card-bottom"><span className="serial">NRD-0001</span><span className="auth-tag"><ShieldCheck size={12}/> AUTHENTIC</span></div></div><div className="floating-card float-one"><div className="mini-art art-blue"/><span>RARE</span></div><div className="floating-card float-two"><div className="mini-art art-red"/><span>SECRET</span></div><div className="float-note"><span className="live-dot"/> Koleksi #0001 <b>Legendary</b></div></div></section>
 <section className="stats-strip"><div><strong>05</strong><span>Tingkat rarity</span></div><div><strong>01</strong><span>Identitas digital</span></div><div><strong>∞</strong><span>Cerita yang dibagikan</span></div><div><strong>100%</strong><span>Profil milikmu</span></div></section>
 <section className="section collection-section" id="collection"><div className="section-heading"><div><div className="eyebrow">PILIH CERITAMU</div><h2>Temukan tingkat <em>koleksimu.</em></h2></div><button className="text-link" onClick={()=>go('collection')}>Lihat semua <ArrowRight size={16}/></button></div><div className="rarity-grid">{shop.map((r,i)=><button key={r.id} className={'rarity-card '+(rarity===r.id?'selected':'')} style={{'--rarity':r.color}} onClick={()=>{setRarity(r.id);go('collection')}}><div className="rarity-art" style={{backgroundImage:`linear-gradient(180deg,transparent 45%,rgba(3,9,16,.96)),url(${r.image})`}}><span className="rarity-symbol">{i===3?<Crown/>:<Sparkles/>}</span><span className="rarity-index">0{i+1}</span></div><div className="rarity-info"><span>{r.label}</span><strong>{money(r.price)}</strong></div></button>)}</div></section>
 <section className="feature-band"><div className="feature-copy"><div className="eyebrow">LEBIH DARI SEBUAH KARTU</div><h2>Kenalan sekali.<br/><em>Cerita terus berjalan.</em></h2><p>Bagikan profil, sosial media, pengalaman, dan pencapaianmu melalui satu halaman yang dirancang untukmu.</p><button className="btn btn-gold" onClick={()=>go('card')}>Jelajahi kartu <ArrowRight size={16}/></button></div><div className="feature-list"><div><span className="feature-icon"><UserRound/></span><div><b>Profil personal</b><p>Nama, bio, dan tautan sosial dalam satu tempat.</p></div></div><div><span className="feature-icon"><Zap/></span><div><b>EXP & level</b><p>Pengalaman bertambah dari kunjungan unik yang valid.</p></div></div><div><span className="feature-icon"><ShieldCheck/></span><div><b>Identitas tepercaya</b><p>Kode kartu dan status aktif dapat diperiksa pengunjung.</p></div></div></div></section>
 <section className="cta-section"><div className="cta-emblem"><Sparkles size={28}/></div><div><div className="eyebrow">CERITAMU DIMULAI DI SINI</div><h2>Siap punya kartu pertamamu?</h2><p>Pilih rarity, tentukan jumlah, lalu biarkan ceritamu berkembang.</p></div><button className="btn btn-gold" onClick={()=>go('collection')}>Pesan kartu <ArrowRight size={16}/></button></section></main><Footer go={go}/></>}
 {page==='collection'&&(auth.user ? <main className="dashboard-wrap"><Sidebar page={page} go={t=>t==='card'?openMyCard():go(t)} logout={logout}/><section className="dashboard-main"><div className="page-intro"><div className="eyebrow">DHIRAYA COLLECTION</div><h1>Pilih kartu <em>pilihanmu.</em></h1><p>Setiap tingkat punya karakter dan cerita berbeda. EXP tidak dibeli—ia tumbuh dari aktivitas yang valid.</p></div><div className="order-layout"><div className="rarity-select-grid">{shop.map((r,i)=><button key={r.id} className={'rarity-card '+(rarity===r.id?'selected':'')} style={{'--rarity':r.color}} onClick={()=>setRarity(r.id)}><div className="rarity-art" style={{backgroundImage:`linear-gradient(180deg,transparent 45%,rgba(3,9,16,.96)),url(${r.image})`}}><span className="rarity-symbol">{i===3?<Crown/>:<Sparkles/>}</span><span className="rarity-index">0{i+1}</span></div><div className="rarity-info"><span>{r.label}</span><strong>{money(r.price)}</strong></div></button>)}</div><aside className="order-panel"><div className="order-title"><div className="selected-emblem" style={{color:selected.color,borderColor:selected.color}}><Crown/></div><div><span className="eyebrow">RARITY TERPILIH</span><h2>{selected.label}</h2></div></div><p>{selected.desc}</p><div className="price-line"><span>Harga per kartu</span><strong>{money(selected.price)}</strong></div><label>Jenis kartu<select value={kind} onChange={e=>setKind(e.target.value)}><option>Kartu baru</option><option>Kartu custom</option><option>Penggantian kartu</option></select></label><label>Jumlah kartu<div className="quantity"><button onClick={()=>setQty(Math.max(1,qty-1))}><Minus size={15}/></button><strong>{qty}</strong><button onClick={()=>setQty(Math.min(20,qty+1))}><Plus size={15}/></button></div></label><label>Nomor telepon<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="08xxxxxxxxxx" maxLength="30" autoComplete="tel"/></label><label>Alamat pengiriman<textarea rows="3" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Jalan, kota, kode pos" maxLength="500" autoComplete="street-address"/></label>{kind!=='Penggantian kartu'&&auth.user&&<div className="order-photos"><span className="op-title">Foto kartu {kind==='Kartu custom'?<b>wajib</b>:<span className="optional">opsional</span>}</span><small>Satu foto per kartu. Foto ini dicetak di kartu fisikmu dan menjadi foto awal kartu digital.</small><div className="op-grid">{Array.from({length:qty},(_,i)=><ImageField key={i} supabase={supabase} uid={auth.user.id} folder="orders" value={photos[i]||''} onChange={v=>setPhotos(p=>{const c=[...p];c[i]=v;return c})} notify={notify} label={'Kartu '+(i+1)} max={1600}/>)}</div></div>}{kind!=='Penggantian kartu'&&!auth.user&&<p className="fineprint">Masuk untuk mengunggah foto kartu.</p>}<label>Catatan <span className="optional">opsional</span><textarea rows="3" placeholder="Nama cetak, permintaan desain, dll." value={note} onChange={e=>setNote(e.target.value)}/></label><div className="total-line"><span>Total estimasi</span><strong>{money(selected.price*qty)}</strong></div><button className="btn btn-gold full" onClick={submitOrder} disabled={busy}>Kirim pesanan <ArrowRight size={16}/></button><p className="fineprint"><ShieldCheck size={13}/> Harga mengikuti daftar harga resmi. Admin akan mengonfirmasi pesanan sebelum produksi.</p></aside></div></section></main> : <main className="page-wrap"><div className="page-intro"><div className="eyebrow">DHIRAYA COLLECTION</div><h1>Pilih kartu <em>pilihanmu.</em></h1><p>Setiap tingkat punya karakter dan cerita berbeda. EXP tidak dibeli—ia tumbuh dari aktivitas yang valid.</p></div><div className="order-layout"><div className="rarity-select-grid">{shop.map((r,i)=><button key={r.id} className={'rarity-card '+(rarity===r.id?'selected':'')} style={{'--rarity':r.color}} onClick={()=>setRarity(r.id)}><div className="rarity-art" style={{backgroundImage:`linear-gradient(180deg,transparent 45%,rgba(3,9,16,.96)),url(${r.image})`}}><span className="rarity-symbol">{i===3?<Crown/>:<Sparkles/>}</span><span className="rarity-index">0{i+1}</span></div><div className="rarity-info"><span>{r.label}</span><strong>{money(r.price)}</strong></div></button>)}</div><aside className="order-panel"><div className="order-title"><div className="selected-emblem" style={{color:selected.color,borderColor:selected.color}}><Crown/></div><div><span className="eyebrow">RARITY TERPILIH</span><h2>{selected.label}</h2></div></div><p>{selected.desc}</p><div className="price-line"><span>Harga per kartu</span><strong>{money(selected.price)}</strong></div><label>Jenis kartu<select value={kind} onChange={e=>setKind(e.target.value)}><option>Kartu baru</option><option>Kartu custom</option><option>Penggantian kartu</option></select></label><label>Jumlah kartu<div className="quantity"><button onClick={()=>setQty(Math.max(1,qty-1))}><Minus size={15}/></button><strong>{qty}</strong><button onClick={()=>setQty(Math.min(20,qty+1))}><Plus size={15}/></button></div></label><label>Nomor telepon<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="08xxxxxxxxxx" maxLength="30" autoComplete="tel"/></label><label>Alamat pengiriman<textarea rows="3" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Jalan, kota, kode pos" maxLength="500" autoComplete="street-address"/></label>{kind!=='Penggantian kartu'&&auth.user&&<div className="order-photos"><span className="op-title">Foto kartu {kind==='Kartu custom'?<b>wajib</b>:<span className="optional">opsional</span>}</span><small>Satu foto per kartu. Foto ini dicetak di kartu fisikmu dan menjadi foto awal kartu digital.</small><div className="op-grid">{Array.from({length:qty},(_,i)=><ImageField key={i} supabase={supabase} uid={auth.user.id} folder="orders" value={photos[i]||''} onChange={v=>setPhotos(p=>{const c=[...p];c[i]=v;return c})} notify={notify} label={'Kartu '+(i+1)} max={1600}/>)}</div></div>}{kind!=='Penggantian kartu'&&!auth.user&&<p className="fineprint">Masuk untuk mengunggah foto kartu.</p>}<label>Catatan <span className="optional">opsional</span><textarea rows="3" placeholder="Nama cetak, permintaan desain, dll." value={note} onChange={e=>setNote(e.target.value)}/></label><div className="total-line"><span>Total estimasi</span><strong>{money(selected.price*qty)}</strong></div><button className="btn btn-gold full" onClick={submitOrder} disabled={busy}>Kirim pesanan <ArrowRight size={16}/></button><p className="fineprint"><ShieldCheck size={13}/> Harga mengikuti daftar harga resmi. Admin akan mengonfirmasi pesanan sebelum produksi.</p></aside></div></main>)}
 {page==='card-editor'&&<main className="dashboard-wrap"><Sidebar page={page} go={t=>t==='card'?openMyCard():go(t)} logout={logout}/><section className="dashboard-main"><CardEditor supabase={supabase} auth={auth} notify={notify} go={go} cardCode={cardCode}/></section></main>}
 {page==='card'&&<CardPage key={cardCode} view={cardView} loading={cardLoading} code={cardCode} go={go} notify={notify}/>}
 {(page==='auth'||page==='customer-login'||page==='admin-login')&&<main className="auth-wrap"><div className="auth-card"><div className="auth-logo"><span className="brand-mark"><Sparkles/></span><b>dhiraya</b></div><div className="eyebrow">{page==='admin-login'?'ADMIN CONSOLE':'YOUR STORY, YOUR CARD'}</div><h1>{page==='admin-login'?'Login administrator':authMode==='login'?'Selamat datang kembali.':'Mulai ceritamu.'}</h1><p>{page==='admin-login'?'Masuk dengan akun yang telah diberi role ADMIN di database.':authMode==='login'?'Masuk untuk mengelola kartu dan koleksimu.':'Buat akun untuk memesan dan mengelola kartu digital.'}</p><form onSubmit={login}>{page!=='admin-login'&&authMode==='signup'&&<label>Nama tampilan<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nama kamu" required/></label>}<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nama@email.com" required/></label><label>Kata sandi<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimal 8 karakter" minLength="8" required/></label><button className="btn btn-gold full" type="submit" disabled={busy}>{page==='admin-login'||authMode==='login'?'Masuk':'Buat akun'} <ArrowRight size={16}/></button></form>{page!=='admin-login'&&<p className="auth-switch">{authMode==='login'?'Belum punya akun?':'Sudah punya akun?'} <button onClick={()=>setAuthMode(authMode==='login'?'signup':'login')}>{authMode==='login'?'Daftar sekarang':'Masuk'}</button></p>}{page==='admin-login'&&<p className="auth-switch"><button onClick={()=>go('home')}>Kembali ke beranda</button></p>}{!supabase&&<div className="demo-note"><CircleHelp size={15}/> Supabase belum dikonfigurasi. Autentikasi dan dashboard terkunci; tidak ada mode demo.</div>}</div></main>}
 {page==='member'&&<main className="dashboard-wrap"><Sidebar page={page} go={t=>t==='card'?openMyCard():go(t)} logout={logout}/><section className="dashboard-main"><div className="dashboard-top"><div><div className="eyebrow">MEMBER SPACE</div><h1>Dashboard member</h1><p>Halo, {user.name}. Senang melihatmu kembali.</p></div><div className="top-actions"><button className="btn btn-ghost small mobile-only" onClick={logout}>Keluar</button><button className="avatar-small" onClick={()=>go('profile')}>{user.name.slice(0,1)}</button></div></div><div className="welcome-card"><div><span className="eyebrow">KARTU UTAMA</span><h2>Hai, {user.name} 👋</h2><p>Identitas digitalmu siap dibagikan ke dunia.</p><button className="btn btn-gold" onClick={openMyCard}>{stats&&stats.card_count>1?'Lihat semua kartu':'Lihat kartu'} <ArrowRight size={15}/></button></div><div className="welcome-mini-card"><div className="mini-card-art"/><b>{stats&&stats.cards&&stats.cards[0]?stats.cards[0].code:'—'}</b><span>{stats&&stats.cards&&stats.cards[0]?stats.cards[0].rarity:'BELUM ADA KARTU'}</span></div></div><div className="metric-cards"><Metric label="Kartu saya" value={stats?String(stats.card_count):'—'} icon={<Layers/>}/><Metric label="Level" value={stats?String(stats.top_level):'—'} icon={<Crown/>}/><Metric label="Total EXP" value={stats?String(stats.total_exp):'—'} icon={<Zap/>}/><Metric label="Kunjungan" value={stats?String(stats.total_taps):'—'} icon={<Eye/>}/></div><div className="panel" style={{marginBottom:18}}><div className="panel-heading"><h3>Kartu saya</h3>{stats&&stats.card_count>0&&<button className="text-link" onClick={()=>go('my-cards')}>Kelola</button>}</div><MyCards stats={stats} go={go}/></div><div className="dashboard-columns"><div className="panel"><div className="panel-heading"><h3>Riwayat pesanan</h3><button className="text-link" onClick={()=>go('orders')}>Lihat semua</button></div>{orders.slice(0,4).map(o=><div className="order-history" key={o.id}><div className="order-icon"><ShoppingBag size={16}/></div><div className="order-hist-info"><b>{o.id}</b><span>{rarities.find(r=>r.id===o.rarity)?.label||o.rarity} · {o.qty} kartu · {o.date}</span></div><span className={'status '+(o.status==='Selesai'?'done':'pending')}>{o.status}</span></div>)}{orders.length===0&&<p className="muted">Belum ada pesanan.</p>}</div><div className="panel"><div className="panel-heading"><h3>Aktivitas & EXP</h3><Zap size={17}/></div><div className="activity"><span className="activity-icon"><ShieldCheck/></span><div><b>EXP dihitung otomatis</b><p>Hanya kunjungan unik yang lolos aturan yang dihitung.</p></div></div><div className="activity"><span className="activity-icon gold"><Sparkles/></span><div><b>Bonus khusus</b><p>Admin dapat memberi bonus EXP dengan alasan yang tercatat.</p></div></div><button className="btn btn-ghost full" onClick={openMyCard}>Buka halaman kartu <ArrowRight size={15}/></button></div></div></section></main>}
 {page==='my-cards'&&<main className="dashboard-wrap"><Sidebar page={page} go={t=>t==='card'?openMyCard():go(t)} logout={logout}/><section className="dashboard-main"><div className="dashboard-top"><div><div className="eyebrow">MEMBER SPACE</div><h1>Kartu saya</h1><p>Semua kartu yang tertaut ke akunmu.</p></div><button className="btn btn-gold" onClick={()=>go('collection')}>Pesan kartu <Plus size={15}/></button></div><MyCards stats={stats} go={go}/></section></main>}
 {page==='orders'&&<main className="dashboard-wrap"><Sidebar page={page} go={t=>t==='card'?openMyCard():go(t)} logout={logout}/><section className="dashboard-main"><div className="dashboard-top"><div><div className="eyebrow">MEMBER SPACE</div><h1>Pesanan saya</h1><p>Lihat status pesanan kartu milikmu.</p></div><button className="btn btn-gold" onClick={()=>go('collection')}>Pesan kartu <Plus size={15}/></button></div><div className="panel"><div className="table-wrap"><table><thead><tr><th>Nomor pesanan</th><th>Tanggal</th><th>Rarity</th><th>Jumlah</th><th>Total</th><th>Status</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>{o.id}</td><td>{o.date}</td><td><span className="rarity-pill">{rarities.find(r=>r.id===o.rarity)?.label||o.rarity}</span></td><td>{o.qty}</td><td>{money(o.total)}</td><td><span className={'status '+(o.status==='Selesai'?'done':'pending')}>{o.status}</span></td></tr>)}{orders.length===0&&<tr><td colSpan="6" className="muted">Belum ada pesanan.</td></tr>}</tbody></table></div></div></section></main>}
 {page==='admin'&&supabase&&auth.profile&&auth.profile.role==='ADMIN'&&<AdminPanel supabase={supabase} user={user} go={go} logout={logout} notify={notify} tab={adminTab} setTab={setAdminTab}/>}
 {page==='profile'&&<main className="dashboard-wrap"><Sidebar page={page} go={t=>t==='card'?openMyCard():go(t)} logout={logout}/><section className="dashboard-main"><ProfilePage supabase={supabase} auth={auth} user={user} notify={notify} go={go} onSaved={patch=>{setAuth(a=>({...a,profile:{...a.profile,...patch}}));setUser(u=>({...u,name:patch.display_name,username:patch.username||''}))}}/></section></main>}
 {page==='how'&&<main className="page-wrap"><div className="page-intro"><div className="eyebrow">CARA KERJA</div><h1>Sesederhana itu. <em>Seistimewa kamu.</em></h1></div><div className="steps-grid">{[['01','Pilih rarity','Tentukan tingkat koleksi dan jenis kartu yang kamu inginkan.'],['02','Personalisasi','Lengkapi profil, foto, pengalaman, dan tautan sosial.'],['03','Aktifkan kartu','Setelah pesanan disetujui dan kartu diterbitkan, halaman kartu siap dibagikan.'],['04','Bangun cerita','EXP bertambah dari aktivitas kunjungan unik yang memenuhi aturan.']].map(s=><div className="step-card" key={s[0]}><span>{s[0]}</span><h3>{s[1]}</h3><p>{s[2]}</p></div>)}</div></main>}
 {page==='about'&&<main className="page-wrap narrow"><div className="eyebrow">TENTANG DHIRAYA</div><h1>Identitas digital yang <em>terasa personal.</em></h1><p className="hero-lead">Dhiraya menggabungkan kartu koleksi fisik dengan profil digital yang dapat berkembang. Setiap kartu memiliki kode unik, halaman publik, dan cerita pemiliknya.</p><div className="notice"><ShieldCheck/><span>EXP didapat dari aktivitas valid. Rarity adalah jenis koleksi, bukan penentu level. Keamanan data dijaga melalui aturan akses di database.</span></div></main>}
 {((['how','about'].includes(page)) || (page==='collection'&&!auth.user))&&<Footer go={go}/>}
 {toast&&<div className="toast"><Check size={17}/>{toast}</div>}
 <BottomNav page={page} go={go} auth={auth} setAuthMode={setAuthMode}/>
 </div>
}
function BottomNav({page,go,auth,setAuthMode}){
 if(page==='card')return null;
 if(auth.user){
  const items=[
   {id:'member',label:'Dashboard',icon:<LayoutDashboard size={19}/>},
   {id:'my-cards',label:'Kartu',icon:<Layers size={19}/>,match:['my-cards','card-editor']},
   {id:'orders',label:'Pesanan',icon:<ShoppingBag size={19}/>},
   {id:'profile',label:'Pengaturan',icon:<Settings size={19}/>}
  ];
  return <nav className="bottom-nav" aria-label="Navigasi Web App">
   {items.map(it=>{
    const active=it.match?it.match.includes(page):page===it.id;
    return <button key={it.id} className={'bnav-item '+(active?'active':'')} onClick={()=>go(it.id)}>
     <span className="bnav-icon">{it.icon}</span>
     <span className="bnav-label">{it.label}</span>
     {active&&<span className="bnav-dot"/>}
    </button>
   })}
  </nav>
 }
 const publicItems=[
  {id:'home',label:'Beranda',icon:<Sparkles size={19}/>},
  {id:'collection',label:'Koleksi',icon:<Crown size={19}/>},
  {id:'how',label:'Cara Kerja',icon:<Zap size={19}/>},
  {id:'customer-login',label:'Masuk',icon:<UserRound size={19}/>,action:()=>{setAuthMode('login');go('customer-login')}}
 ];
 return <nav className="bottom-nav" aria-label="Navigasi Web App">
  {publicItems.map(it=>{
   const active=page===it.id;
   return <button key={it.id} className={'bnav-item '+(active?'active':'')} onClick={it.action||(()=>go(it.id))}>
    <span className="bnav-icon">{it.icon}</span>
    <span className="bnav-label">{it.label}</span>
    {active&&<span className="bnav-dot"/>}
   </button>
  })}
 </nav>
}
function MyCards({stats,go}){
 if(!stats)return <p className="muted">Memuat kartu…</p>;
 const list=stats.cards||[];
 if(list.length===0)return <p className="muted">Belum ada kartu. Setelah pesananmu diproses, admin akan menautkan kartu ke akunmu.</p>;
 return <div className="mc-grid">{list.map(c=>{const r=rarities.find(x=>x.id===c.rarity)||rarities[0];const art=/^https?:\/\//i.test(c.front_image||'')?c.front_image:r.image;return <div className="mc-tile" key={c.id} style={{'--rarity':(c.style&&/^#[0-9a-f]{6}$/i.test(c.style.accent||''))?c.style.accent:r.color}}><button className="mc-art" onClick={()=>go('card',c.code)} style={{backgroundImage:`linear-gradient(180deg,transparent 40%,rgba(3,9,16,.95)),url(${art})`}} aria-label={'Buka kartu '+c.code}><span className="mc-rarity">{r.label}</span><b>{c.display_name||c.code}</b><small>{c.code} · LV {c.level}</small></button><div className="mc-meta"><span className={'status '+(c.status==='ACTIVE'?'done':'pending')}>{c.status==='ACTIVE'?'Aktif':c.status}</span><span>{c.exp} EXP · {c.taps} tap</span></div><div className="mc-actions"><button className="btn btn-ghost small" onClick={()=>go('card',c.code)}>Lihat</button><button className="btn btn-gold small" onClick={()=>go('card-editor',c.code)}>Studio</button></div></div>})}</div>}
function Metric({label,value,icon}){return <div className="metric-card"><span className="metric-icon">{icon}</span><span>{label}</span><strong>{value}</strong><small><span className="live-dot"/> Terbarui</small></div>}
function Sidebar({page,go,logout,admin=false}){const links=admin?[['Ringkasan','admin',<LayoutDashboard size={18}/>],['Pesanan','orders',<ShoppingBag size={18}/>],['Koleksi','collection',<Layers size={18}/>],['Member','member',<UserRound size={18}/>],['Pengaturan','about',<Settings size={18}/>]]:[['Dashboard','member',<LayoutDashboard size={18}/>],['Kartu saya','my-cards',<Layers size={18}/>],['Pesanan','orders',<ShoppingBag size={18}/>],['Pesan kartu baru','collection',<Crown size={18}/>],['Pengaturan','profile',<Settings size={18}/>]];return <aside className="sidebar"><span className="sidebar-label">{admin?'ADMIN CONSOLE':'MENU UTAMA'}</span><div className="sidebar-links">{links.map(([label,target,icon])=>{const active=(page===target||(admin&&page==='admin'&&target==='admin')||(!admin&&target==='my-cards'&&page==='card-editor'));return <button key={label} className={'side-link '+(active?'active':'')} onClick={()=>go(target)}>{icon}<span>{label}</span></button>})}</div><div className="sidebar-bottom"><button className="side-link logout" onClick={logout}><LogOut size={18}/><span>Keluar</span></button></div></aside>}
function Footer({go}){return <footer className="footer"><div className="footer-brand"><span className="brand-mark"><Sparkles size={17}/></span><b>dhiraya</b><span>Digital identity & collectibles.</span></div><div className="footer-links"><button onClick={()=>go('collection')}>Koleksi</button><button onClick={()=>go('how')}>Cara kerja</button><button onClick={()=>go('about')}>Tentang</button></div><small>© 2026 Dhiraya. Dibuat untuk ceritamu.</small></footer>}

class ErrorBoundary extends React.Component{
 constructor(p){super(p);this.state={err:null}}
 static getDerivedStateFromError(err){return {err}}
 componentDidCatch(err,info){console.error('Dhiraya error:',err,info&&info.componentStack)}
 render(){
  if(!this.state.err)return this.props.children;
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#07111b',color:'#edf2f7',fontFamily:'DM Sans,sans-serif'}}><div style={{maxWidth:520}}><h2 style={{margin:'0 0 10px'}}>Halaman gagal dimuat</h2><p style={{color:'#93a3b5'}}>Terjadi kesalahan saat menampilkan halaman ini. Muat ulang; bila masih terjadi, kirim pesan di bawah ini ke pengembang.</p><pre style={{whiteSpace:'pre-wrap',background:'#0d1a27',border:'1px solid #203143',borderRadius:10,padding:12,fontSize:12,color:'#ff9aa8'}}>{String(this.state.err&&(this.state.err.stack||this.state.err.message||this.state.err)).slice(0,900)}</pre><button onClick={()=>location.reload()} style={{padding:'10px 18px',borderRadius:99,border:0,background:'#f4c16b',color:'#1b2026',fontWeight:700,cursor:'pointer'}}>Muat ulang</button></div></div>}
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
