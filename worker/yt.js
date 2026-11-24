import { fail, VID_RE, BROWSE_RE } from './util.js';
import { cached } from './cache.js';

// YouTube Music via l'API InnerTube (JSON, sans clé, sans dépendance). Recherche, artistes, albums, playlists, radio.
// Jamais de vidéo ni d'iframe : on ne garde que titres, artistes, pochettes et identifiants.
const MUSIC = 'https://music.youtube.com/youtubei/v1/';
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const REMIX = { clientName: 'WEB_REMIX', clientVersion: '1.20241127.01.00', hl: 'fr', gl: 'FR' };

async function music(ep, body) {
  let r;
  try {
    r = await fetch(`${MUSIC}${ep}?prettyPrint=false`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://music.youtube.com', 'user-agent': WEB_UA },
      body: JSON.stringify({ context: { client: REMIX }, ...body }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) { fail(502, 'yt_down', 'YouTube ne répond pas, réessaie'); }
  if (!r.ok) fail(502, 'yt_down', `YouTube a refusé la requête (${r.status})`);
  return r.json();
}

// ---------- Lecture des réponses ----------
export const text = r => (r?.runs ?? []).map(x => x.text).join('') || r?.simpleText || '';
export const seconds = s => (/^\d+(:\d{1,2}){1,2}$/.test(s ?? '') ? s.split(':').reduce((a, b) => a * 60 + Number(b), 0) : 0);
const TIME = /^\d+(:\d{2}){1,2}$/;
export function big(u) {
  if (!u) return null;
  if (u.startsWith('//')) u = `https:${u}`;
  return u.replace(/=w\d+-h\d+(-[a-z0-9-]+)?$/, '=w544-h544-l90-rj').replace(/=s\d+(-[a-z0-9-]+)?$/, '=s544');
}
const thumbs = n => n?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? n?.thumbnail?.thumbnails ?? n?.thumbnails ?? [];
const thumb = n => big(thumbs(n).at(-1)?.url);
const pageType = e => e?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ?? '';
const explicit = badges => (badges ?? []).some(b => b.musicInlineBadgeRenderer?.icon?.iconType === 'MUSIC_EXPLICIT_BADGE' || b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_EXPLICIT');
const LABELS = /^(Titre|Vidéo|Artiste|Album|Single|EP|Playlist|Épisode|Podcast|Song|Video|Artist)$/i;

// Ligne « Artiste • Album • 3:45 » → artistes (liens), album, durée.
export function byline(runs = []) {
  const artists = [], out = { artists, album: null, dur: 0 };
  for (const r of runs) {
    const b = r.navigationEndpoint?.browseEndpoint, pt = pageType(b);
    if (b && /ARTIST|USER_CHANNEL/.test(pt)) artists.push({ name: r.text, id: b.browseId });
    else if (b && /ALBUM/.test(pt)) out.album = { name: r.text, id: b.browseId };
    else if (TIME.test(r.text)) out.dur = seconds(r.text);
  }
  if (!artists.length) { // artiste sans lien : premier segment qui n'est ni un type, ni une durée, ni un nombre de vues
    const first = runs.map(r => r.text).join('').split(' • ').map(s => s.trim()).find(s => s && !LABELS.test(s) && !TIME.test(s) && !/\d\s*(M|k|Md)?\s*(vues|lectures|views|abonnés)/i.test(s) && !/^\d{4}$/.test(s));
    if (first) artists.push(...first.split(/\s*(?:,|&|\bet\b)\s*/).filter(Boolean).map(name => ({ name, id: null })));
  }
  return out;
}

function listItem(r) {
  const cols = (r.flexColumns ?? []).map(c => c.musicResponsiveListItemFlexColumnRenderer?.text);
  const title = text(cols[0]);
  const vid = cols[0]?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ?? r.playlistItemData?.videoId
    ?? r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
  const b = r.navigationEndpoint?.browseEndpoint;
  if (vid) {
    const info = byline(cols[1]?.runs);
    const fixed = text(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text);
    return { kind: 'track', id: vid, title, artists: info.artists, album: info.album, thumb: thumb(r.thumbnail), dur: info.dur || seconds(fixed), explicit: explicit(r.badges) };
  }
  if (!b) return null;
  return browseItem(b, title, text(cols[1]), thumb(r.thumbnail));
}

function browseItem(b, title, subtitle, img) {
  const pt = pageType(b);
  const kind = /ARTIST|USER_CHANNEL/.test(pt) ? 'artist' : /ALBUM/.test(pt) ? 'album' : /PLAYLIST/.test(pt) ? 'playlist' : null;
  if (!kind || !BROWSE_RE.test(b.browseId)) return null;
  return { kind, id: b.browseId, title, subtitle, thumb: img };
}

function twoRow(r) {
  const title = text(r.title), sub = r.subtitle?.runs ?? [], nav = r.navigationEndpoint;
  const vid = nav?.watchEndpoint?.videoId;
  if (vid) { const info = byline(sub); return { kind: 'track', id: vid, title, artists: info.artists, album: info.album, thumb: thumb(r.thumbnailRenderer), dur: 0, explicit: explicit(r.subtitleBadges) }; }
  return nav?.browseEndpoint ? browseItem(nav.browseEndpoint, title, text(r.subtitle), thumb(r.thumbnailRenderer)) : null;
}

function panel(r) {
  const vid = r.videoId ?? r.navigationEndpoint?.watchEndpoint?.videoId;
  if (!vid) return null;
  const info = byline(r.longBylineText?.runs);
  return { kind: 'track', id: vid, title: text(r.title), artists: info.artists, album: info.album, thumb: thumb(r.thumbnail), dur: seconds(text(r.lengthText)), explicit: explicit(r.badges) };
}

export function item(node) {
  if (node.musicResponsiveListItemRenderer) return listItem(node.musicResponsiveListItemRenderer);
  if (node.musicTwoRowItemRenderer) return twoRow(node.musicTwoRowItemRenderer);
  if (node.playlistPanelVideoRenderer) return panel(node.playlistPanelVideoRenderer);
  if (node.playlistPanelVideoWrapperRenderer) return panel(node.playlistPanelVideoWrapperRenderer.primaryRenderer?.playlistPanelVideoRenderer ?? {});
  return null;
}
const valid = i => i && (i.kind !== 'track' || VID_RE.test(i.id));

// Toutes les étagères (listes, carrousels, playlists, file radio) d'une réponse, sans doublon d'imbrication.
export function sections(json) {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (['musicShelfRenderer', 'musicCarouselShelfRenderer', 'musicPlaylistShelfRenderer', 'playlistPanelRenderer'].includes(k)) {
        const title = text(v.title) || text(v.header?.musicCarouselShelfBasicHeaderRenderer?.title);
        const more = v.bottomEndpoint?.browseEndpoint?.browseId ?? v.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ?? null;
        out.push({ title, more, items: (v.contents ?? []).map(item).filter(valid) });
      } else walk(v);
    }
  })(json);
  return out.filter(s => s.items.length);
}

function find(o, key) {
  if (!o || typeof o !== 'object') return null;
  if (o[key]) return o[key];
  for (const v of Object.values(o)) { const r = find(v, key); if (r) return r; }
  return null;
}

// ---------- Pages ----------
const SEARCH_PARAMS = { songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA==', artists: 'EgWKAQIgAWoKEAkQChAFEAMQBA==', albums: 'EgWKAQIYAWoKEAkQChAFEAMQBA==', playlists: 'EgeKAQQoADgBagwQDhAKEAMQBRAJEAQ=' };
export function parseSearch(json) { return sections(json).flatMap(s => s.items); }

export async function search(env, q, type = 'all') {
  q = String(q ?? '').trim().slice(0, 120);
  if (q.length < 1) return { songs: [], artists: [], albums: [], playlists: [] };
  const types = type === 'all' ? Object.keys(SEARCH_PARAMS) : SEARCH_PARAMS[type] ? [type] : fail(400, 'bad_type', 'Type de recherche inconnu');
  const res = await Promise.all(types.map(t => cached(env, `s:${t}:${q.toLowerCase()}`, 3600, async () => parseSearch(await music('search', { query: q, params: SEARCH_PARAMS[t] })))));
  const out = { songs: [], artists: [], albums: [], playlists: [] };
  types.forEach((t, i) => { out[t] = res[i].filter(x => x.kind === { songs: 'track', artists: 'artist', albums: 'album', playlists: 'playlist' }[t]).slice(0, t === 'songs' ? 30 : 12); });
  return out;
}

export function parseArtist(json) {
  const h = find(json, 'musicImmersiveHeaderRenderer') ?? find(json, 'musicVisualHeaderRenderer') ?? find(json, 'musicResponsiveHeaderRenderer') ?? {};
  return { name: text(h.title), thumb: thumb(h.thumbnail), sections: sections(json).map(s => ({ ...s, items: s.items.map(i => (i.kind === 'track' && !i.artists.length ? { ...i, artists: [{ name: text(h.title), id: null }] } : i)) })) };
}

// Album ou playlist : en-tête + titres (les pistes d'album n'ont ni artiste ni pochette propre → reprises de l'en-tête).
export function parseCollection(json, id) {
  const h = find(json, 'musicResponsiveHeaderRenderer') ?? find(json, 'musicDetailHeaderRenderer') ?? find(json, 'musicEditablePlaylistDetailHeaderRenderer') ?? {};
  const title = text(h.title), img = thumb(h.thumbnail);
  const owner = byline(h.straplineTextOne?.runs);
  const isAlbum = id.startsWith('MPRE');
  const all = sections(json);
  const tracks = (all.find(s => s.items.some(i => i.kind === 'track'))?.items ?? []).filter(i => i.kind === 'track').map(t => ({
    ...t,
    artists: t.artists.length ? t.artists : owner.artists,
    album: t.album ?? (isAlbum ? { name: title, id } : null),
    thumb: t.thumb ?? img,
  }));
  return { id, kind: isAlbum ? 'album' : 'playlist', title, subtitle: text(h.subtitle), artists: owner.artists, thumb: img, tracks, related: all.filter(s => !s.items.some(i => i.kind === 'track')) };
}

export async function artist(env, id) {
  if (!BROWSE_RE.test(id)) fail(400, 'bad_id', 'Identifiant invalide');
  return cached(env, `a:${id}`, 6 * 3600, async () => parseArtist(await music('browse', { browseId: id })));
}
export async function collection(env, id) {
  if (!BROWSE_RE.test(id)) fail(400, 'bad_id', 'Identifiant invalide');
  const bid = /^(PL|RD|OL|LM)/.test(id) ? `VL${id}` : id;
  // shortcut: seules les ~100 premières pistes d'une playlist YouTube (pas de continuation), suffisant pour l'écoute
  return cached(env, `c:${bid}`, 6 * 3600, async () => parseCollection(await music('browse', { browseId: bid }), bid));
}
export async function radio(env, vid) {
  if (!VID_RE.test(vid)) fail(400, 'bad_id', 'Identifiant invalide');
  return cached(env, `r:${vid}`, 3 * 3600, async () => {
    const items = sections(await music('next', { videoId: vid, playlistId: `RDAMVM${vid}`, isAudioOnly: true })).flatMap(s => s.items);
    return items.filter(i => i.kind === 'track' && i.id !== vid).slice(0, 40);
  });
}
export async function featured(env) {
  return cached(env, 'home', 6 * 3600, async () => sections(await music('browse', { browseId: 'FEmusic_home' }))
    .map(s => ({ ...s, items: s.items.slice(0, 15) })).filter(s => s.title).slice(0, 6));
}

// ---------- Flux audio M4A/AAC (itag 140, lisible par Safari iOS) ----------
// Clients InnerTube testés le 24/11/2026 : seul VISIONOS (+ visitorData) donne un flux lisible en entier.
// IOS / ANDROID répondent OK mais googlevideo refuse tout au-delà du 1er Mo (PO token exigé) → URL vérifiée au milieu du fichier.
// Le flux direct = aucune publicité (les pubs n'existent que dans le lecteur YouTube).
const CLIENTS = [
  { id: 101, ctx: { clientName: 'VISIONOS', clientVersion: '0.1' }, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', visitor: true },
  { id: 5, ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' }, ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)' },
];

// Vérifie que l'URL sert aussi la suite du fichier (sinon la lecture s'arrêterait après ~1 min).
async function usable(url, ua, len) {
  if (len && len <= 1048576) return true; // tient dans la 1re plage d'1 Mo toujours servie
  const mid = Math.max(1048576, Math.floor((len || 2097152) / 2));
  const r = await fetch(url, { headers: { 'user-agent': ua, range: `bytes=${mid}-${mid + 1}` }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  await r?.body?.cancel();
  return r?.status === 206;
}

async function visitorData(env) {
  return cached(env, 'visitor', 6 * 3600, async () => {
    const t = await (await fetch('https://www.youtube.com/sw.js_data', { headers: { 'user-agent': WEB_UA }, signal: AbortSignal.timeout(6000) })).text();
    return JSON.parse(t.replace(/^\)\]\}'/, ''))[0][2][0][0][13];
  });
}

// Choix du format : audio/mp4 (AAC), le plus haut débit ≤ 160 kb/s ; jamais WebM/Opus (non lu par Safari iOS ancien).
export function pickAudio(formats = []) {
  const aac = formats.filter(f => f.url && /^audio\/mp4/.test(f.mimeType ?? ''));
  return aac.find(f => f.itag === 140) ?? aac.sort((a, b) => b.bitrate - a.bitrate)[0] ?? null;
}

export async function resolveAudio(env, vid) {
  let reason = 'indisponible';
  for (const k of CLIENTS) {
    try {
      const visitor = k.visitor ? await visitorData(env) : null;
      const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': k.ua, 'x-youtube-client-name': String(k.id), 'x-youtube-client-version': k.ctx.clientVersion, ...(visitor && { 'x-goog-visitor-id': visitor }) },
        body: JSON.stringify({ videoId: vid, context: { client: { ...k.ctx, hl: 'fr', gl: 'FR', ...(visitor && { visitorData: visitor }) } }, contentCheckOk: true, racyCheckOk: true }),
        signal: AbortSignal.timeout(8000),
      });
      const p = await r.json();
      const f = p.playabilityStatus?.status === 'OK' && pickAudio(p.streamingData?.adaptiveFormats);
      const len = Number(f?.contentLength) || 0;
      if (f && await usable(f.url, k.ua, len)) {
        const exp = Number(new URL(f.url).searchParams.get('expire')) * 1e3 || Date.now() + 5 * 36e5;
        return { url: f.url, ua: k.ua, mime: f.mimeType.split(';')[0], len, exp };
      }
      reason = f ? 'flux limité par YouTube' : p.playabilityStatus?.reason || reason;
    } catch (e) { reason = e.name; }
  }
  return { error: reason };
}
