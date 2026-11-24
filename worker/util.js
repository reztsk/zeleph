export class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new HttpError(status, code, message); };
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const VID_RE = /^[A-Za-z0-9_-]{11}$/;
export const BROWSE_RE = /^[A-Za-z0-9_-]{2,80}$/;
export const ID_RE = /^[0-9a-f-]{36}$/;

const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
export function safeEq(a, b) { // comparaison à durée constante
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
export const randInt = max => crypto.getRandomValues(new Uint32Array(1))[0] % max;
export const run = (db, sql, ...p) => db.prepare(sql).bind(...p).run();
export const all = async (db, sql, ...p) => (await db.prepare(sql).bind(...p).all()).results;
export const one = (db, sql, ...p) => db.prepare(sql).bind(...p).first();

export async function hashPass(pw, salt = randHex(16)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256); // 100 000 : maximum accepté par Workers
  return `${salt}$${hex(bits)}`;
}
export const DUMMY_PASS = `${'0'.repeat(32)}$${'0'.repeat(64)}`; // même coût de calcul quand le compte est inconnu
export const passOk = async (pw, stored) => safeEq(await hashPass(pw, stored.split('$')[0]), stored);

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const IMG_HOST = /^https:\/\/(?:[a-z0-9-]+\.googleusercontent\.com|i\.ytimg\.com|[a-z0-9-]+\.ggpht\.com)\//;
// Titre reçu du client (playlist, favori, historique) : champs bornés, URL d'image limitée aux hôtes YouTube.
export function cleanTrack(t) {
  if (!t || typeof t !== 'object' || !VID_RE.test(t.id)) fail(400, 'bad_track', 'Titre invalide');
  const artists = (Array.isArray(t.artists) ? t.artists : []).slice(0, 6)
    .map(a => ({ name: str(a?.name, 120), id: BROWSE_RE.test(a?.id) ? a.id : null })).filter(a => a.name);
  const album = t.album && str(t.album.name, 160) ? { name: str(t.album.name, 160), id: BROWSE_RE.test(t.album.id) ? t.album.id : null } : null;
  return {
    id: t.id,
    title: str(t.title, 200) || 'Sans titre',
    artists,
    album,
    thumb: typeof t.thumb === 'string' && t.thumb.length < 600 && IMG_HOST.test(t.thumb) ? t.thumb : null,
    dur: Number.isFinite(t.dur) && t.dur > 0 && t.dur < 86400 ? Math.round(t.dur) : 0,
    explicit: t.explicit === true,
  };
}

// Image envoyée par le client (avatar, pochette) : data URL JPEG/PNG/WebP, 300 Ko max.
export function cleanImage(v) {
  if (v === null) return null;
  if (typeof v !== 'string' || v.length > 400000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)) fail(400, 'bad_image', 'Image invalide (JPEG/PNG/WebP, 300 Ko max)');
  return v;
}
export function imageResponse(dataUrl) {
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) fail(404, 'not_found', 'Image introuvable');
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'content-type': m[1], 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}
