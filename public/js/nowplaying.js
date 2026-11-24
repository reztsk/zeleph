// Mini-lecteur (au-dessus des onglets) + lecteur plein écran : pochette, paroles synchronisées, file d'attente.
import { h, fill, btn, icon, cover, small, fmt, artistsText, explicitBadge, coverColor, toast } from './ui.js';
import { get } from './api.js';
import * as player from './player.js';
import { trackMenu } from './menu.js';
import { parseLrc, activeLine } from './lrc.js';
import { go } from './nav.js';
import { prefs } from './prefs.js';

const { queue } = player;
let np, mode = 'cover', seeking = false;
const ui = {};

// ---------- Mini-lecteur ----------
export function mountMini(el) {
  const art = h('div.mini-art'), title = h('div.mini-t'), sub = h('div.mini-s');
  const play = btn('icon-btn mini-play', 'Lecture', e => { e.stopPropagation(); player.toggle(); });
  const next = btn('icon-btn', 'Suivant', e => { e.stopPropagation(); player.next(); }, icon('next'));
  const bar = h('div.mini-progress', {}, h('span'));
  el.replaceChildren(h('div.mini', { role: 'button', tabindex: '0', 'aria-label': 'Ouvrir le lecteur', onclick: () => open() }, art, h('div.mini-meta', {}, title, sub), play, next, bar));
  const upd = type => {
    const s = player.state();
    el.hidden = !s.track;
    document.body.classList.toggle('has-mini', !!s.track);
    if (!s.track) return;
    if (type === 'track' || type === 'init') { art.replaceChildren(cover(small(s.track.thumb), 'cover')); title.textContent = s.track.title; sub.textContent = artistsText(s.track); }
    if (type !== 'time') play.replaceChildren(icon(s.playing ? 'pause' : 'play'));
    play.setAttribute('aria-label', s.playing ? 'Pause' : 'Lecture');
    bar.firstChild.style.setProperty('width', `${s.dur ? (s.time / s.dur) * 100 : 0}%`);
  };
  player.on(upd);
  upd('init');
}

// ---------- Plein écran ----------
function build() {
  ui.bg = h('div.np-bg');
  ui.cover = h('div.np-cover-wrap');
  ui.lyrics = h('div.np-lyrics', { onscroll: () => { ui.userScroll = Date.now(); } });
  ui.queue = h('div.np-queue');
  ui.headArt = h('div.np-head-art');
  ui.title = h('div.np-title');
  ui.artist = h('button.np-artist', { type: 'button', onclick: () => { const a = player.state().track?.artists?.find(x => x.id); if (a) { close(); go(`/artist/${a.id}`); } } });
  ui.like = btn('icon-btn np-like', 'Favori', () => { const t = player.state().track; if (t) player.toggleLike(t); });
  ui.more = btn('icon-btn np-more', 'Plus d\'options', () => { const t = player.state().track; if (t) trackMenu(t); }, icon('more'));
  ui.range = h('input.np-range', { type: 'range', min: '0', max: '1', step: '0.1', value: '0', 'aria-label': 'Position' });
  ui.range.addEventListener('input', () => { seeking = true; ui.cur.textContent = fmt(+ui.range.value); paintRange(); });
  ui.range.addEventListener('change', () => { player.seek(+ui.range.value); seeking = false; });
  ui.cur = h('span'); ui.left = h('span');
  ui.play = btn('icon-btn np-play', 'Lecture', () => player.toggle());
  const vol = player.volumeSupported ? h('div.np-vol', {}, icon('volLow'), h('input.np-range.vol', { type: 'range', min: '0', max: '1', step: '0.01', value: String(player.audio.volume), 'aria-label': 'Volume', oninput: e => { player.audio.volume = +e.target.value; } }), icon('volHigh')) : null;
  ui.lyrBtn = btn('icon-btn np-tab', 'Paroles', () => setMode(mode === 'lyrics' ? 'cover' : 'lyrics'), icon('lyrics'));
  ui.qBtn = btn('icon-btn np-tab', 'File d\'attente', () => setMode(mode === 'queue' ? 'cover' : 'queue'), icon('queue'));

  np = h('div.np', { role: 'dialog', 'aria-label': 'Lecteur', 'aria-modal': 'true' },
    ui.bg,
    h('div.np-inner', {},
      h('div.np-top', {}, btn('icon-btn np-close', 'Fermer le lecteur', close, icon('down')), h('div.np-grab')),
      h('div.np-compact', {}, ui.headArt, h('div.np-compact-meta', {}, h('div.np-ct'), h('div.np-cs')), ui.like.cloneNode(true)),
      h('div.np-stage', {}, ui.cover, ui.lyrics, ui.queue),
      h('div.np-info', {}, h('div.np-meta', {}, ui.title, ui.artist), ui.like, ui.more),
      h('div.np-progress', {}, ui.range, h('div.np-times', {}, ui.cur, ui.left)),
      h('div.np-controls', {}, btn('icon-btn np-skip', 'Précédent', player.prev, icon('prev')), ui.play, btn('icon-btn np-skip', 'Suivant', player.next, icon('next'))),
      vol,
      h('div.np-bottom', {}, ui.lyrBtn, ui.qBtn)));
  np.querySelector('.np-compact .np-like').addEventListener('click', () => { const t = player.state().track; if (t) player.toggleLike(t); });
  swipeToClose(np.querySelector('.np-top'));
  swipeToClose(ui.cover);
  document.body.append(np);
  player.on(update);
  player.audio.addEventListener('zeleph:prefs', paintBg);
}

function swipeToClose(el) {
  let y0 = null;
  el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchmove', e => { if (y0 == null) return; const dy = Math.max(0, e.touches[0].clientY - y0); np.style.setProperty('transform', `translateY(${dy}px)`); }, { passive: true });
  el.addEventListener('touchend', e => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    np.style.removeProperty('transform');
    if (dy > 110) close();
  });
}

export function open(m = mode) {
  if (!player.state().track) return;
  if (!np) build();
  np.classList.add('open');
  document.body.classList.add('np-open');
  setMode(m);
  update('track');
}
export function close() { np?.classList.remove('open'); document.body.classList.remove('np-open'); }

function setMode(m) {
  mode = m;
  np.dataset.mode = m;
  ui.lyrBtn.classList.toggle('on', m === 'lyrics');
  ui.qBtn.classList.toggle('on', m === 'queue');
  if (m === 'lyrics') loadLyrics();
  if (m === 'queue') drawQueue();
}

function paintRange() {
  const r = ui.range, pct = (+r.value / (+r.max || 1)) * 100;
  r.style.setProperty('--p', `${pct}%`);
}
async function paintBg() {
  const t = player.state().track;
  const rgb = prefs.coverBg && t ? await coverColor(t.thumb) : null;
  if (rgb) {
    const [r, g, b] = rgb, d = k => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
    ui.bg.style.setProperty('background', `linear-gradient(180deg, ${d(0.85)} 0%, ${d(0.45)} 55%, ${d(0.18)} 100%)`);
    np.classList.add('tinted');
  } else { ui.bg.style.removeProperty('background'); np.classList.remove('tinted'); }
}

function update(type) {
  if (!np?.classList.contains('open')) return;
  const s = player.state(), t = s.track;
  if (!t) return close();
  if (type === 'track') {
    ui.cover.replaceChildren(cover(t.thumb, 'np-cover'));
    ui.headArt.replaceChildren(cover(small(t.thumb), 'cover'));
    fill(ui.title, h('span', {}, t.title), explicitBadge(t));
    np.querySelector('.np-ct').textContent = t.title;
    np.querySelector('.np-cs').textContent = artistsText(t);
    ui.artist.textContent = artistsText(t);
    paintBg();
    lyr = null;
    if (mode === 'lyrics') loadLyrics();
  }
  if (type === 'track' || type === 'likes') {
    const on = player.likes.has(t.id);
    np.querySelectorAll('.np-like').forEach(b => { b.replaceChildren(icon(on ? 'heartOn' : 'heart')); b.classList.toggle('on', on); b.setAttribute('aria-label', on ? 'Retirer des favoris' : 'Ajouter aux favoris'); });
  }
  if (type === 'track' || s.playing !== ui.playing) {
    ui.playing = s.playing;
    np.classList.toggle('playing', s.playing);
    ui.play.replaceChildren(icon(s.playing ? 'pause' : 'play'));
    ui.play.setAttribute('aria-label', s.playing ? 'Pause' : 'Lecture');
  }
  if (!seeking) {
    ui.range.max = String(s.dur || 1);
    ui.range.value = String(s.time);
    ui.cur.textContent = fmt(s.time);
    paintRange();
  }
  ui.left.textContent = `-${fmt((s.dur || 0) - s.time)}`;
  if (mode === 'lyrics') syncLyrics(s.time);
  if (mode === 'queue' && (type === 'queue' || type === 'track')) drawQueue();
}

// ---------- Paroles ----------
let lyr = null, lyrLoading = null, activeIdx = -1;
async function loadLyrics() {
  const t = player.state().track;
  if (!t || lyr?.id === t.id || lyrLoading === t.id) return;
  lyrLoading = t.id;
  ui.lyrics.replaceChildren(h('div.spin'));
  let r;
  try { r = await get(`/lyrics?${new URLSearchParams({ title: t.title, artist: t.artists?.[0]?.name ?? '', dur: String(t.dur || Math.round(player.audio.duration) || 0) })}`); }
  catch { r = { synced: null, plain: null }; }
  if (player.state().track?.id !== t.id) return;
  lyrLoading = null;
  lyr = { id: t.id, lines: parseLrc(r.synced).filter(l => l.l) };
  activeIdx = -1;
  if (lyr.lines.length) {
    ui.lyrics.replaceChildren(h('div.lyr-pad'), ...lyr.lines.map(l => h('button.lyr-line', { type: 'button', onclick: () => { player.seek(l.t); ui.userScroll = 0; } }, l.l)), h('div.lyr-pad'));
    syncLyrics(player.state().time);
  } else if (r.plain) ui.lyrics.replaceChildren(h('div.lyr-plain', {}, r.plain));
  else ui.lyrics.replaceChildren(h('div.lyr-none', {}, icon('lyrics'), h('p', {}, 'Paroles indisponibles pour ce titre')));
}
function syncLyrics(time) {
  if (!lyr?.lines.length) return;
  const i = activeLine(lyr.lines, time);
  if (i === activeIdx) return;
  const els = ui.lyrics.querySelectorAll('.lyr-line');
  els[activeIdx]?.classList.remove('on');
  activeIdx = i;
  const el = els[i];
  if (!el) return;
  el.classList.add('on');
  if (Date.now() - (ui.userScroll || 0) > 2500) {
    ui.lyrics.scrollTo({ top: el.offsetTop - ui.lyrics.clientHeight * 0.32, behavior: 'smooth' });
    setTimeout(() => { ui.userScroll = 0; }, 0); // le défilement automatique ne compte pas comme un geste
  }
}

// ---------- File d'attente ----------
function qRow(t, list, i, n) {
  return h('div.row.q-row', { 'data-vid': t.id, role: 'button', tabindex: '0', onclick: e => { if (!e.target.closest('button')) player.jump(list, i); } },
    cover(small(t.thumb), 'cover'),
    h('div.meta', {}, h('div.t', {}, h('span.tt', {}, t.title), explicitBadge(t)), h('div.s', {}, artistsText(t))),
    h('div.q-actions', {},
      i > 0 || list === 'auto' ? btn('icon-btn q-btn', 'Passer en premier', () => player.edit(q => q.toTop(list, i)), icon('top')) : null,
      btn('icon-btn q-btn', 'Monter', () => player.edit(q => q.move(list, i, -1)), icon('up')),
      btn('icon-btn q-btn', 'Descendre', () => player.edit(q => q.move(list, i, 1)), icon('down')),
      btn('icon-btn q-btn', 'Retirer de la file', () => player.edit(q => q.remove(list, i)), icon('close'))));
}
function drawQueue() {
  const t = player.state().track;
  fill(ui.queue, 
    h('div.q-sec', {},
      h('div.q-h', {}, h('h3', {}, 'À suivre'), h('div', {},
        queue.next.length > 1 ? h('button.chip', { type: 'button', onclick: () => { player.edit(q => q.shuffleNext()); toast('File mélangée'); } }, icon('shuffle'), 'Mélanger') : null,
        queue.next.length ? h('button.chip', { type: 'button', onclick: () => player.edit(q => q.clearNext()) }, 'Effacer') : null)),
      queue.next.length ? queue.next.map((x, i) => qRow(x, 'next', i)) : h('p.muted.pad', {}, 'Rien en attente. Utilise « … » → Lire ensuite.')),
    h('div.q-sec', {},
      h('div.q-h', {}, h('h3', {}, 'Poursuivre la lecture'), h('small.muted', {}, 'Sons similaires')),
      queue.auto.length ? queue.auto.map((x, i) => qRow(x, 'auto', i)) : h('p.muted.pad', {}, queue.next.length >= 3 ? "Des sons similaires s'ajouteront à la fin de « À suivre »." : 'Les suggestions arrivent…')));
}
