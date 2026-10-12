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
