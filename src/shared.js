export const rarities=[
 {id:'COMMON',label:'Common',color:'#b9c3d0',price:79000,desc:'Awal dari cerita koleksimu.',image:'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=600&q=85'},
 {id:'RARE',label:'Rare',color:'#55a9ff',price:129000,desc:'Untuk identitas yang menonjol.',image:'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=600&q=85'},
 {id:'EPIC',label:'Epic',color:'#c084fc',price:199000,desc:'Koleksi dengan karakter kuat.',image:'https://images.unsplash.com/photo-1604072366595-e75dc92d6bdc?auto=format&fit=crop&w=600&q=85'},
 {id:'LEGENDARY',label:'Legendary',color:'#f6bd60',price:299000,desc:'Kartu istimewa untuk cerita besarmu.',image:'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=85'},
 {id:'SECRET',label:'Secret',color:'#ff647c',price:499000,desc:'Edisi langka bagi para kolektor.',image:'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=600&q=85'}
];
export const orderStatusLabel={PENDING:'Menunggu konfirmasi',CONFIRMED:'Dikonfirmasi',IN_PRODUCTION:'Diproses',SHIPPED:'Dikirim',COMPLETED:'Selesai',CANCELLED:'Dibatalkan'};
export const orderStatusValue=Object.fromEntries(Object.entries(orderStatusLabel).map(([k,v])=>[v,k]));
export function money(n){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n)}
export function fmtDate(d){return d?new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):''}
export function mapOrder(o){return {id:o.order_number||o.id,dbId:o.id,rarity:o.rarity||'COMMON',qty:o.quantity||1,status:orderStatusLabel[o.status]||o.status,date:fmtDate(o.created_at),kind:o.card_type,note:o.customer_note,total:Number(o.total_price||0),customer:o.customer_name||'',email:o.email||'',phone:o.phone||'',address:o.shipping_address||'',adminNote:o.admin_note||'',statusKey:o.status,memberId:o.member_id||null,photos:Array.isArray(o.photo_urls)?o.photo_urls:[],cards:(o.order_cards||[]).map(x=>{const c=Array.isArray(x.cards)?x.cards[0]:x.cards;return {id:x.card_id,code:c?c.card_code:'',rarity:c?c.rarity:'',status:c?c.status:'',linkedAt:x.created_at}}).sort((a,b)=>String(a.linkedAt).localeCompare(String(b.linkedAt)))}}
export const socialPlatforms=[['instagram','Instagram'],['tiktok','TikTok'],['linkedin','LinkedIn'],['x','X (Twitter)'],['youtube','YouTube'],['facebook','Facebook'],['github','GitHub'],['whatsapp','WhatsApp'],['telegram','Telegram'],['website','Website'],['other','Lainnya']];
// Rapikan tautan yang diketik member: tambahkan https://, nomor WhatsApp -> wa.me. null bila tidak valid.
export function normalizeUrl(raw,platform){let v=String(raw||'').trim();if(!v)return null;
 if(platform==='whatsapp'&&/^\+?[0-9][0-9 -]{5,}$/.test(v))return 'https://wa.me/'+v.replace(/\D/g,'');
 if(/^https?:\/\/\S+$/i.test(v))return v;
 if(/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v))return 'https://'+v;
 return null}

export const BADGES = [
  { id: 'pioneer', label: 'Pionir', icon: 'Sparkles', desc: 'Tap pertama kali berhasil', req: '1 tap unik', minTaps: 1, exp: 20 },
  { id: 'connector', label: 'Konektor', icon: 'ShieldCheck', desc: 'Mencapai 10 kunjungan unik', req: '10 tap unik', minTaps: 10, exp: 50 },
  { id: 'influencer', label: 'Influencer', icon: 'Zap', desc: 'Mencapai 50 kunjungan unik', req: '50 tap unik', minTaps: 50, exp: 150 },
  { id: 'centurion', label: 'Centurion', icon: 'Crown', desc: 'Mencapai 100 kunjungan unik', req: '100 tap unik', minTaps: 100, exp: 300 },
  { id: 'streak_3', label: 'Fire Streak', icon: 'Flame', desc: 'Kartu di-tap 3 hari berturut-turut', req: 'Streak 3 hari', minStreak: 3, exp: 50 },
  { id: 'streak_7', label: 'Master Networker', icon: 'Flame', desc: 'Kartu di-tap 7 hari berturut-turut', req: 'Streak 7 hari', minStreak: 7, exp: 150 },
  { id: 'vcard', label: 'Digital Rolodex', icon: 'Download', desc: 'Kontakmu berhasil disimpan pengunjung', req: '1x simpan vCard', minVcards: 1, exp: 15 },
  { id: 'lead', label: 'Buku Tamu', icon: 'Users', desc: 'Mendapatkan kontak dari pengunjung', req: '1x tukar kontak', minLeads: 1, exp: 25 },
  { id: 'profile_master', label: 'Identitas Emas', icon: 'Award', desc: 'Melengkapi seluruh informasi profil & portofolio', req: 'Profil 100%', minProfile: true, exp: 100 },
  { id: 'event_turbo', label: 'Networking Pro', icon: 'Rocket', desc: 'Mengaktifkan Mode Acara untuk boost 2x EXP', req: 'Mode Acara aktif', minEvent: true, exp: 50 }
];

export function getCardBadges(taps = 0, streak = 0, extra = {}) {
  const t = Number(taps) || 0;
  const s = Number(streak) || 0;
  const actions = extra.actions || {};
  const vcards = Number(actions.vcards || extra.vcards || 0);
  const leads = Number(actions.leads || extra.leads || 0);
  const profileComplete = Boolean(extra.profileComplete);
  const eventMode = Boolean(extra.eventMode);

  return BADGES.map(b => {
    let unlocked = false;
    let progress = 0;
    if (b.minTaps) {
      unlocked = t >= b.minTaps;
      progress = Math.min(100, Math.round((t / b.minTaps) * 100));
    } else if (b.minStreak) {
      unlocked = s >= b.minStreak;
      progress = Math.min(100, Math.round((s / b.minStreak) * 100));
    } else if (b.minVcards) {
      unlocked = vcards >= b.minVcards;
      progress = unlocked ? 100 : Math.round((vcards / b.minVcards) * 100);
    } else if (b.minLeads) {
      unlocked = leads >= b.minLeads;
      progress = unlocked ? 100 : Math.round((leads / b.minLeads) * 100);
    } else if (b.minProfile) {
      unlocked = profileComplete;
      progress = unlocked ? 100 : 50;
    } else if (b.minEvent) {
      unlocked = eventMode;
      progress = unlocked ? 100 : 0;
    }
    return { ...b, unlocked, progress };
  });
}

