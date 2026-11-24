// Accueil (style OpenTune), Recherche YouTube Music, pages Artiste et Album / Playlist YouTube.
import { h, fill, btn, icon, page, card, carousel, section, trackRow, cover, empty, spinner, toast, debounce, avatar, artistsText } from '../ui.js';
import { get } from '../api.js';
import * as player from '../player.js';
import { trackMenu } from '../menu.js';
import { go, back, session } from '../nav.js';
import { shuffled } from '../queue.js';

const meBtn = () => btn('icon-btn me-btn', 'Mon profil', () => go('/me'), avatar(session.me?.avatar, 'avatar sm'));
const open = it => go(it.kind === 'artist' ? `/artist/${it.id}` : it.kind === 'playlist' && it.mine !== undefined ? `/playlist/${it.id}` : `/collection/${it.id}`);
const cardFor = it => (it.kind === 'track' ? card(it, () => player.playTrack(it)) : card(it, () => open(it)));
const rows = (list, ctx = {}) => list.map((t, i) => trackRow(t, { onPlay: () => player.playList(list, i), onMore: () => trackMenu(t, ctx) }));

// Grille « Choix rapides » : colonnes de 4 titres qui défilent horizontalement.
function quickPicks(list) {
  const cols = [], all = rows(list);
  for (let i = 0; i < all.length; i += 4) cols.push(h('div.qp-col', {}, all.slice(i, i + 4)));
  return h('div.carousel.qp', {}, cols);
}

export async function home(root) {
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Bonne nuit' : hour < 18 ? 'Bonjour' : 'Bonsoir';
  const body = page(root, 'Accueil', { right: [meBtn()], sub: h('p.hello', {}, `${hello}, ${session.me?.name ?? ''}`) });
  body.append(spinner());
  let d;
  try { d = await get('/home'); } catch (e) { fill(body, empty(e.message)); return; }
  const recentCards = d.recent.map((t, i) => card(t, () => player.playList(d.recent, i)));
  fill(body, 
    carousel('Écoutés récemment', recentCards),
    d.forYou.length ? section('Dans ton style', quickPicks(d.forYou)) : null,
    carousel('Playlists de tes amis', d.friends.map(p => card({ ...p, kind: 'playlist', title: p.name, subtitle: `@${p.owner?.handle}`, thumb: p.cover }, () => go(`/playlist/${p.id}`)))),
    ...d.featured.map(s => (s.items.every(i => i.kind === 'track') ? section(s.title, quickPicks(s.items)) : carousel(s.title, s.items.map(cardFor)))),
  );
  if (!d.recent.length && !d.forYou.length) body.prepend(h('div.hint-card', {}, icon('search'), h('p', {}, 'Lance un premier son depuis la Recherche : l\'accueil s\'adaptera à tes goûts.')));
}

const RECENT_KEY = 'zeleph.searches';
const recentSearches = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const remember = q => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...recentSearches().filter(x => x !== q)].slice(0, 10))); } catch { /* privé */ } };
let lastQuery = '', lastType = 'all';

export async function search(root) {
  const body = page(root, 'Recherche', { right: [meBtn()] });
  const out = h('div.results');
  const input = h('input.search-field', { type: 'search', placeholder: 'Artistes, titres, playlists…', value: lastQuery, enterkeyhint: 'search', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Rechercher' });
  const TYPES = [['all', 'Tout'], ['songs', 'Titres'], ['artists', 'Artistes'], ['albums', 'Albums'], ['playlists', 'Playlists']];
  const chips = h('div.chips', {}, TYPES.map(([k, l]) => h(`button.chip${k === lastType ? '.on' : ''}`, { type: 'button', onclick: e => { lastType = k; chips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === e.currentTarget)); run(); } }, l)));
  let seq = 0;
  const showRecent = () => {
    const list = recentSearches();
    fill(out, list.length ? section('Recherches récentes', h('div.list', {}, list.map(q => h('button.recent-q', { type: 'button', onclick: () => { input.value = q; run(); } }, icon('search'), h('span', {}, q))))) : empty('Cherche un son, un artiste ou une playlist', 'search'));
  };
  const run = async () => {
    const q = input.value.trim();
    lastQuery = q;
    if (!q) return showRecent();
    const my = ++seq;
    fill(out, spinner());
    let r;
    try { r = await get(`/search?q=${encodeURIComponent(q)}&type=${lastType}`); } catch (e) { if (my === seq) fill(out, empty(e.message)); return; }
    if (my !== seq) return;
    remember(q);
    const songs = lastType === 'all' ? r.songs.slice(0, 6) : r.songs;
    fill(out, 
      songs.length ? section(lastType === 'all' ? 'Titres' : null, h('div.list', {}, rows(songs))) : null,
      lastType === 'all' && r.songs.length > 6 ? h('button.see-all', { type: 'button', onclick: () => chips.children[1].click() }, 'Voir tous les titres') : null,
      lastType === 'all' ? carousel('Artistes', r.artists.map(cardFor)) : r.artists.length ? h('div.grid', {}, r.artists.map(cardFor)) : null,
      lastType === 'all' ? carousel('Albums', r.albums.map(cardFor)) : r.albums.length ? h('div.grid', {}, r.albums.map(cardFor)) : null,
      lastType === 'all' ? carousel('Playlists', r.playlists.map(cardFor)) : r.playlists.length ? h('div.grid', {}, r.playlists.map(cardFor)) : null,
    );
    if (!out.children.length) fill(out, empty(`Aucun résultat pour « ${q} »`, 'search'));
  };
  const deb = debounce(run, 380);
  input.addEventListener('input', deb);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { input.blur(); run(); } });
  body.append(h('div.search-box', {}, icon('search'), input), chips, out);
  lastQuery ? run() : showRecent();
  if (!lastQuery) setTimeout(() => input.focus(), 100);
}

export async function artist(root, id) {
  const body = page(root, '', { backTo: back });
  body.append(spinner());
  let a;
  try { a = await get(`/artist/${encodeURIComponent(id)}`); } catch (e) { fill(body, empty(e.message)); return; }
  const top = a.sections.find(s => s.items.some(i => i.kind === 'track'));
  const tracks = top?.items.filter(i => i.kind === 'track') ?? [];
  fill(body, 
    h('div.artist-hero', {}, cover(a.thumb, 'hero-img'), h('div.hero-fade'), h('h1.hero-name', {}, a.name)),
    tracks.length ? h('div.play-row', {},
      h('button.primary.pill', { type: 'button', onclick: () => player.playList(tracks) }, icon('play'), 'Lire'),
      h('button.secondary.pill', { type: 'button', onclick: () => player.playList(shuffled(tracks)) }, icon('shuffle'), 'Aléatoire')) : null,
    ...a.sections.map(s => (s === top ? section(s.title || 'Titres', h('div.list', {}, rows(tracks)))
      : s.items.every(i => i.kind === 'track') ? carousel(s.title, s.items.map(t => card(t, () => player.playList(s.items, s.items.indexOf(t)))))
        : carousel(s.title, s.items.map(cardFor)))),
  );
  root.querySelector('.bar-title').textContent = a.name;
}

// Album ou playlist YouTube Music : en-tête, Lire / Aléatoire, recherche interne, titres.
export async function collection(root, id) {
  const body = page(root, '', { backTo: back });
  body.append(spinner());
  let c;
  try { c = await get(`/collection/${encodeURIComponent(id)}`); } catch (e) { fill(body, empty(e.message)); return; }
  root.querySelector('.bar-title').textContent = c.title;
  const list = h('div.list');
  const draw = q => {
    const f = q ? c.tracks.filter(t => `${t.title} ${artistsText(t)}`.toLowerCase().includes(q)) : c.tracks;
    list.replaceChildren(...(f.length ? f.map(t => trackRow(t, { onPlay: () => player.playList(f, f.indexOf(t)), onMore: () => trackMenu(t), noCover: c.kind === 'album', index: c.tracks.indexOf(t) + 1 })) : [empty('Aucun titre')]));
  };
  fill(body, 
    collectionHead(c.thumb, c.title, c.artists?.length ? h('button.link.owner', { type: 'button', onclick: () => c.artists[0].id && go(`/artist/${c.artists[0].id}`) }, artistsText(c)) : null, c.subtitle),
    playButtons(() => c.tracks),
    filterBox(draw),
    list,
    ...c.related.map(s => carousel(s.title, s.items.map(cardFor))),
  );
  draw('');
}

export const collectionHead = (thumb, title, owner, sub, onCover) => h('div.coll-head', {},
  onCover ? h('button.cover-btn', { type: 'button', onclick: onCover, 'aria-label': 'Changer la photo' }, cover(thumb, 'big-cover'), h('span.cover-edit', {}, icon('camera'))) : cover(thumb, 'big-cover'),
  h('h1.coll-title', {}, title), owner, sub ? h('p.coll-sub', {}, sub) : null);

export const playButtons = getTracks => h('div.play-row', {},
  h('button.primary.pill', { type: 'button', onclick: () => { const t = getTracks(); if (t.length) player.playList(t); else toast('Aucun titre'); } }, icon('play'), 'Lire'),
  h('button.secondary.pill', { type: 'button', onclick: () => { const t = getTracks(); if (t.length) player.playList(shuffled(t)); else toast('Aucun titre'); } }, icon('shuffle'), 'Aléatoire'));

export function filterBox(draw) {
  const input = h('input.search-field', { type: 'search', placeholder: 'Rechercher dans la playlist', autocomplete: 'off', 'aria-label': 'Rechercher dans la playlist' });
  input.addEventListener('input', () => draw(input.value.trim().toLowerCase()));
  return h('div.search-box.small', {}, icon('search'), input);
}
