// Vercel Serverless Function — mencatat kunjungan unik ke halaman kartu.
// Opsional: tanpa 3 environment variable di bawah, endpoint ini hanya
// membalas {ok:false} dan website tetap berjalan normal (EXP tidak bertambah).
//
//   SUPABASE_URL                 (atau VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY    RAHASIA — jangan pakai awalan VITE_
//   VISITOR_HASH_SECRET          string acak panjang (min. 32 karakter)
import crypto from 'node:crypto';

function uaFamily(ua) {
  if (/bot|crawl|spider|preview|facebookexternalhit|slurp/i.test(ua)) return 'bot';
  if (/edg\//i.test(ua)) return 'edge';
  if (/chrome|crios/i.test(ua)) return 'chrome';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/safari/i.test(ua)) return 'safari';
  return 'other';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.VISITOR_HASH_SECRET;
  if (!url || !key || !secret || secret.length < 32) return res.status(200).json({ ok: false, reason: 'not_configured' });

  const code = String((req.body && req.body.code) || '').toUpperCase().trim();
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(code)) return res.status(400).json({ ok: false });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '';
  const ua = String(req.headers['user-agent'] || '');
  const family = uaFamily(ua);
  if (family === 'bot') return res.status(200).json({ ok: false, reason: 'bot' });

  // Domain perujuk saja (tanpa path/query); dipakai untuk data tap milik pemilik kartu.
  let refHost = null;
  try {
    const h = new URL(String((req.body && req.body.ref) || '')).hostname;
    if (h && h.length <= 255) refHost = h.replace(/^www\./, '');
  } catch { /* tidak ada perujuk */ }

  // Hash harian: tidak menyimpan IP mentah, dan berganti tiap hari (UTC).
  const day = new Date().toISOString().slice(0, 10);
  const hash = crypto.createHmac('sha256', secret).update(`${ip}|${ua}|${code}|${day}`).digest('hex');

  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/register_card_visit`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_card_code: code, p_visitor_hash: hash, p_user_agent_family: family, p_referrer_domain: refHost })
    });
    return res.status(200).json({ ok: r.ok });
  } catch {
    return res.status(200).json({ ok: false });
  }
}
