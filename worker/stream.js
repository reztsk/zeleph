import { fail, HttpError, VID_RE } from './util.js';
import { resolveAudio } from './yt.js';
import { cached, forget } from './cache.js';

// Flux audio relayé par le Worker (les URL googlevideo sont liées à l'IP qui les a demandées) avec prise en charge
// des requêtes Range (indispensable pour Safari iOS : lecture, avance rapide, écran verrouillé).
// Ordre : extracteur dédié (EXTRACTOR_URL, M4A remuxé) si configuré → sinon extraction directe InnerTube (URL en cache ~4 h).
const TTL = 4 * 3600;
const BOT = /robot|bot|sign in|connectez-vous|LOGIN_REQUIRED/i;

function audioResponse(up, mime) {
  const h = new Headers({ 'content-type': mime || 'audio/mp4', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=600', 'x-content-type-options': 'nosniff' });
  for (const k of ['content-length', 'content-range']) { const v = up.headers.get(k); if (v) h.set(k, v); }
  return new Response(up.body, { status: up.status, headers: h });
}

async function viaExtractor(c, vid, range) {
  const base = String(c.env.EXTRACTOR_URL).replace(/\/+$/, '');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 45000); // délai sur les en-têtes seulement (1er remux d'un long titre), jamais sur le flux
  try {
    const up = await fetch(`${base}/audio/${vid}`, { method: c.req.method, headers: { authorization: `Bearer ${String(c.env.EXTRACTOR_TOKEN ?? '').trim().replace(/^﻿/, '')}`, ...(range && { range }) }, signal: ctl.signal });
    if (up.ok) return audioResponse(up, up.headers.get('content-type'));
    if (up.status === 416) return new Response(null, { status: 416, headers: { 'content-range': up.headers.get('content-range') ?? '' } });
    console.error('extracteur : statut', up.status, (await up.text().catch(() => '')).slice(0, 300));
  } catch (e) { console.error('extracteur : réseau', e.name); }
  finally { clearTimeout(t); }
  return null;
}

export async function stream(c, vid) {
  if (!VID_RE.test(vid)) fail(400, 'bad_id', 'Identifiant invalide');
  const range = c.req.headers.get('range');
  if (range && !/^bytes=\d*-\d*$/.test(range)) fail(416, 'bad_range', 'Plage invalide');
  const key = `au:${vid}`;
  let reason = 'Lecture impossible pour ce titre';
  // Extracteur seul quand il existe : le flux direct est un M4A DASH fragmenté sur lequel Safari iOS reste bloqué à 0:00
  // sans erreur ; mieux vaut une erreur nette (le lecteur l'affiche et passe au titre suivant).
  if (c.env.EXTRACTOR_URL) return (await viaExtractor(c, vid, range)) ?? fail(502, 'no_audio', 'Titre indisponible pour le moment, réessaie dans un instant.');
  for (let attempt = 0; attempt < 2; attempt++) {
    let s;
    try {
      s = await cached(c.env, key, TTL, async () => {
        const r = await resolveAudio(c.env, vid);
        if (r.error) throw new HttpError(502, 'no_audio', r.error);
        return r;
      }, { kv: true });
    } catch (e) { reason = e.message; break; }
    const up = await fetch(s.url, { method: c.req.method, headers: { 'user-agent': s.ua, ...(range && { range }) } }).catch(() => null);
    if (up?.ok) return audioResponse(up, s.mime);
    if (up?.status === 416) return new Response(null, { status: 416, headers: { 'content-range': up.headers.get('content-range') ?? '' } });
    await forget(c.env, key, { kv: true }); // URL expirée ou liée à une autre IP : on la redemande une fois
  }
  fail(502, 'no_audio', BOT.test(reason) ? 'YouTube bloque temporairement la lecture depuis le serveur. Réessaie plus tard.' : reason);
}
