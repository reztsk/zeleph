// Lecteur : une seule balise <audio> persistante (index.html) → lecture continue écran verrouillé / en arrière-plan,
// contrôles écran verrouillé via navigator.mediaSession, préchargement du titre suivant, file d'attente auto.
import { Queue } from './queue.js';
import { get, post, put, del } from './api.js';
import { toast, artistsText } from './ui.js';

const audio = document.getElementById('audio');
export const queue = new Queue();
export const likes = new Set();
const subs = new Set();
const KEY = 'zeleph.queue';
let errors = 0, warmed = null, logged = null, filling = false;

export const on = f => { subs.add(f); return () => subs.delete(f); };
const emit = type => subs.forEach(f => f(type));
export const state = () => ({ track: queue.current, playing: !audio.paused && !audio.ended, time: audio.currentTime || 0, dur: audio.duration || queue.current?.dur || 0 });
export { audio };

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ ...queue.toJSON(), time: audio.currentTime || 0 })); } catch { /* stockage plein ou privé */ }
}
export function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s?.current) return;
    Object.assign(queue, new Queue(s));
    load(queue.current, false, s.time);
  } catch { /* état illisible : on repart de zéro */ }
}

function metadata(t) {
  if (!('mediaSession' in navigator)) return;
  const art = t.thumb ? [{ src: t.thumb, sizes: '544x544', type: 'image/jpeg' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }];
  navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: artistsText(t), album: t.album?.name ?? 'Zeleph', artwork: art });
}
function position() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = audio.duration;
  if (Number.isFinite(d) && d > 0) try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate || 1 }); } catch { /* valeurs transitoires */ }
}

function load(t, autoplay = true, at = 0) {
  if (!t) return;
  audio.src = `/api/stream/${t.id}`;
  if (at > 0) audio.addEventListener('loadedmetadata', () => { audio.currentTime = at; }, { once: true });
  metadata(t);
  emit('track');
  save();
  if (autoplay) audio.play().catch(e => { if (e.name !== 'AbortError') emit('state'); });
  fillAuto();
}

// Remplit « Poursuivre la lecture » avec des titres similaires quand la file se vide.
async function fillAuto() {
  if (filling || !queue.current || !queue.needsAuto()) return;
  filling = true;
  try { queue.fillAuto((await get(`/radio/${queue.current.id}`)).tracks); emit('queue'); save(); }
  catch { /* pas de suggestions : la lecture s'arrêtera en fin de file */ }
  finally { filling = false; }
}
// Préchargement : on demande 2 octets du titre suivant → le serveur résout et met en cache le flux, le lancement est quasi instantané.
function warmNext() {
  const n = queue.peek();
  if (!n || warmed === n.id) return;
  warmed = n.id;
  fetch(`/api/stream/${n.id}`, { headers: { range: 'bytes=0-1' }, credentials: 'same-origin' }).catch(() => {});
  if (n.thumb) new Image().src = n.thumb;
}

export function playList(tracks, i = 0) { load(queue.playList(tracks, i)); }
export function playTrack(t) { load(queue.playList([t], 0)); }
export function toggle() {
  if (!queue.current) return;
  if (audio.paused) { if (!audio.src) load(queue.current); else audio.play().catch(() => {}); } else audio.pause();
}
export function next() {
  const t = queue.advance();
  if (t) load(t); else { audio.pause(); emit('state'); }
  emit('queue');
}
export function prev() {
  if (audio.currentTime > 3 || !queue.past.length) { audio.currentTime = 0; return; }
  load(queue.back());
  emit('queue');
}
export function seek(s) { if (Number.isFinite(s)) { audio.currentTime = Math.max(0, s); position(); } }
export function jump(list, i) { const t = queue.jump(list, i); if (t) { load(t); emit('queue'); } }
export function playNext(t) { if (!queue.current) return playTrack(t); queue.playNext(t); emit('queue'); save(); toast('Lu ensuite'); }
export function playLater(t) { if (!queue.current) return playTrack(t); queue.playLater(t); emit('queue'); save(); toast('Ajouté à la file d\'attente'); }
export function edit(fn) { fn(queue); emit('queue'); save(); warmed = null; warmNext(); }

// ---------- Favoris ----------
export async function loadLikes() { try { likes.clear(); (await get('/likes/ids')).ids.forEach(id => likes.add(id)); emit('likes'); } catch { /* hors ligne */ } }
export async function toggleLike(t) {
  const was = likes.has(t.id);
  was ? likes.delete(t.id) : likes.add(t.id);
  emit('likes');
  try { was ? await del(`/likes/${t.id}`) : await put(`/likes/${t.id}`, { track: t }); toast(was ? 'Retiré des favoris' : 'Ajouté aux favoris'); }
  catch (e) { was ? likes.add(t.id) : likes.delete(t.id); emit('likes'); toast(e.message); }
}

// ---------- Événements audio ----------
audio.addEventListener('playing', () => {
  errors = 0;
  emit('state');
  const t = queue.current;
  if (t && logged !== t.id) { logged = t.id; post('/history', { track: t }).catch(() => {}); }
  setTimeout(warmNext, 4000);
});
audio.addEventListener('pause', () => { emit('state'); save(); });
audio.addEventListener('ended', next);
audio.addEventListener('timeupdate', () => emit('time'));
audio.addEventListener('durationchange', () => { position(); emit('time'); });
audio.addEventListener('error', () => {
  if (!audio.src || !queue.current) return;
  errors++;
  toast(errors >= 3 ? 'Lecture impossible pour le moment' : `Titre indisponible : ${queue.current.title}`);
  if (errors < 3) setTimeout(next, 600); else { audio.pause(); emit('state'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

if ('mediaSession' in navigator) {
  const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* action non prise en charge */ } };
  set('play', () => audio.play().catch(() => {}));
  set('pause', () => audio.pause());
  set('previoustrack', prev);
  set('nexttrack', next);
  set('seekto', d => seek(d.seekTime));
  set('seekbackward', d => seek(audio.currentTime - (d.seekOffset || 10)));
  set('seekforward', d => seek(audio.currentTime + (d.seekOffset || 10)));
}

// iOS ignore audio.volume (volume matériel uniquement) : on ne montre le curseur que s'il fonctionne.
export const volumeSupported = (() => { try { const v = audio.volume; audio.volume = 0.5; const ok = audio.volume === 0.5; audio.volume = v; return ok; } catch { return false; } })();
