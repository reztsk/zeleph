// Briques d'interface sans framework : h() crée les éléments (jamais d'innerHTML avec des données),
// icônes SVG, lignes de titres, cartes, feuilles d'actions, toasts, redimensionnement d'images.
const P = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/>',
  pause: '<rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/>',
  next: '<path d="M4 6.2v11.6a.9.9 0 0 0 1.4.75L13 13.1v4.7a.9.9 0 0 0 1.4.75l8.3-5.8a.9.9 0 0 0 0-1.5l-8.3-5.8a.9.9 0 0 0-1.4.75v4.7L5.4 5.45A.9.9 0 0 0 4 6.2Z"/>',
  prev: '<path d="M20 6.2v11.6a.9.9 0 0 1-1.4.75L11 13.1v4.7a.9.9 0 0 1-1.4.75l-8.3-5.8a.9.9 0 0 1 0-1.5l8.3-5.8a.9.9 0 0 1 1.4.75v4.7l7.6-5.45A.9.9 0 0 1 20 6.2Z"/>',
  shuffle: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 7h3.5c2.5 0 3.7 1.3 5 4.2l1 2.6c1.3 2.9 2.5 4.2 5 4.2H21M17.5 4.5 21 7l-3.5 2.5M3 17h3.5c1.4 0 2.4-.4 3.2-1.3M21 7h-3.5c-1.4 0-2.4.4-3.2 1.3M17.5 14.5 21 17l-3.5 2.5"/>',
  more: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
  heart: '<path fill="none" stroke="currentColor" stroke-width="2" d="M12 20.3S3.5 15.2 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 6-8.5 11.1-8.5 11.1Z"/>',
  heartOn: '<path d="M12 20.3S3.5 15.2 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 6-8.5 11.1-8.5 11.1Z"/>',
  home: '<path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6v5.5H5.5A1.5 1.5 0 0 1 4 19Z"/>',
  search: '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="m20 20-4.2-4.2M17.5 10.8a6.7 6.7 0 1 1-13.4 0 6.7 6.7 0 0 1 13.4 0Z"/>',
  library: '<path d="M4 4h3v16H4zM9.5 4h3v16h-3zM15 5.2l2.9-.8 3.8 15.3-2.9.8z"/>',
  friends: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 19.5c.4-3.6 3-5.8 6.5-5.8s6.1 2.2 6.5 5.8z"/><circle cx="17" cy="9" r="2.8"/><path d="M16.2 13.8c3 .1 5 2 5.3 5.2h-4.4c-.2-2.1-.6-3.6-.9-5.2Z"/>',
  lyrics: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.6A.9.9 0 0 1 4 18.9ZM8 7.5v2.2h2.2V12c-.9 0-1.6.4-1.9 1h.5c1.8 0 2.9-1.3 2.9-3.6V7.5Zm5 0v2.2h2.2V12c-.9 0-1.6.4-1.9 1h.5c1.8 0 2.9-1.3 2.9-3.6V7.5Z"/>',
  queue: '<path d="M3 5.5h13M3 10.5h13M3 15.5h7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14 13.2v6.6a.6.6 0 0 0 .9.5l5.3-3.3a.6.6 0 0 0 0-1l-5.3-3.3a.6.6 0 0 0-.9.5Z"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  down: '<path d="m6 9.5 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  back: '<path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  up: '<path d="m6 14.5 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  top: '<path d="M6 4.5h12M12 20V9m-5 5 5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4.8c0-.7.5-1.3 1.3-1.3h2.4c.8 0 1.3.6 1.3 1.3v1.7M6.5 6.5l.9 12.3c.1 1 .9 1.7 1.8 1.7h5.6c1 0 1.7-.7 1.8-1.7l.9-12.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  share: '<path d="M12 3.5v11M8 7.2l4-3.7 4 3.7M6.5 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  camera: '<path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  gear: '<path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm8.1 4.6-1.6 1.2.2 2-1.9 1.9-2-.2-1.2 1.6h-2.7L9.7 18l-2 .2-1.9-1.9.2-2-1.6-1.2v-2.7L6 9.2l-.2-2 1.9-1.9 2 .2 1.2-1.6h2.7l1.2 1.6 2-.2 1.9 1.9-.2 2 1.6 1.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4 20.5c.6-4.3 3.8-6.7 8-6.7s7.4 2.4 8 6.7z"/>',
  note: '<path d="M9 17.5V6.2l10-2.2v11.3M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2.2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" fill="none" stroke="currentColor" stroke-width="2"/>',
  disc: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  playNext: '<path d="M3 6h11M3 11h11M3 16h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M15 12.5v7l5.5-3.5Z"/>',
  playLater: '<path d="M3 6h11M3 11h7M3 16h7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M17 11v8M13 15h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  volLow: '<path d="M4 9.5h3L11 6v12l-4-3.5H4Z"/>',
  volHigh: '<path d="M4 9.5h3L11 6v12l-4-3.5H4Z"/><path d="M14.5 8.5a5 5 0 0 1 0 7M17 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  logout: '<path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14M10 12h10m-3.5-3.5L20 12l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3"/>',
};
export const icon = (name, cls = '') => h(`span.ic${cls ? `.${cls}` : ''}`, { 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" fill="currentColor">${P[name] ?? ''}</svg>` });

export const $ = (s, r = document) => r.querySelector(s);
// replaceChildren() écrirait « null » pour une section vide : on filtre.
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));
export function h(tag, props, ...kids) {
  const [t, ...cls] = tag.split('.');
  const el = document.createElement(t || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x);
    else if (k === 'html') el.innerHTML = v; // réservé aux constantes (icônes)
    else if (k === 'cls') el.classList.add(...String(v).split(' ').filter(Boolean));
    else if (['value', 'checked', 'disabled', 'hidden', 'textContent'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
export const btn = (cls, label, onclick, ...kids) => h(`button.${cls}`, { type: 'button', 'aria-label': label, onclick }, ...kids);

export const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const artistsText = t => (t.artists ?? []).map(a => a.name).join(', ') || 'Artiste inconnu';
export const small = u => (u ? u.replace(/=w544-h544-l90-rj$/, '=w226-h226-l90-rj').replace(/=s544$/, '=s226') : u);

export function cover(src, cls = 'cover', alt = '') {
  if (!src) return h(`div.${cls}.ph`, { 'aria-hidden': 'true' }, icon('note'));
  const el = h(`img.${cls}`, { src, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  el.addEventListener('error', () => el.replaceWith(cover(null, cls)), { once: true });
  return el;
}
export const explicitBadge = t => (t.explicit ? h('span.explicit', { title: 'Explicite', 'aria-label': 'Explicite' }, 'E') : null);

// Ligne de titre : pochette, titre (+ E), artistes, bouton « … ». data-vid sert à surligner le titre en cours.
export function trackRow(t, { onPlay, onMore, index = null, noCover = false } = {}) {
  return h('div.row', { 'data-vid': t.id, role: 'button', tabindex: '0', onclick: e => { if (!e.target.closest('.more')) onPlay?.(); }, onkeydown: e => { if (e.key === 'Enter') onPlay?.(); } },
    index != null && noCover ? h('span.idx', {}, index) : cover(small(t.thumb), 'cover'),
    h('div.meta', {}, h('div.t', {}, h('span.tt', {}, t.title), explicitBadge(t)), h('div.s', {}, artistsText(t))),
    onMore ? btn('more', 'Plus d\'options', e => { e.stopPropagation(); onMore(); }, icon('more')) : null);
}

// Carte (album, playlist, artiste, titre) pour les carrousels et grilles.
export function card(it, onclick) {
  return h(`div.card${it.kind === 'artist' ? '.round' : ''}`, { role: 'button', tabindex: '0', onclick, onkeydown: e => { if (e.key === 'Enter') onclick(); } },
    cover(small(it.thumb ?? it.cover), 'art'),
    h('div.ct', {}, it.title ?? it.name, it.explicit ? explicitBadge(it) : null),
    h('div.cs', {}, it.subtitle ?? (it.artists ? artistsText(it) : '') ?? ''));
}
export const carousel = (title, nodes, more) => (nodes.length ? h('section.sec', {}, h('div.sec-h', {}, h('h2', {}, title), more ?? null), h('div.carousel', {}, nodes)) : null);
export const section = (title, ...kids) => h('section.sec', {}, title ? h('div.sec-h', {}, h('h2', {}, title)) : null, ...kids);
export const empty = (text, ic = 'note') => h('div.empty', {}, icon(ic), h('p', {}, text));
export const spinner = () => h('div.spin', { role: 'status', 'aria-label': 'Chargement' });

let toastTimer;
export function toast(msg, ms = 2600) {
  let el = $('#toast');
  if (!el) { el = h('div.toast', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// Feuille d'actions (bas de l'écran, style iOS). items : [{ icon, label, danger, onClick }]
export function sheet({ head, items = [], body } = {}) {
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 220); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const panel = h('div.sheet', { role: 'dialog', 'aria-modal': 'true' },
    h('div.grab'),
    head ?? null,
    body ?? null,
    items.length ? h('div.actions', {}, items.filter(Boolean).map(it => h(`button.act${it.danger ? '.danger' : ''}`, { type: 'button', onclick: () => { close(); it.onClick(); } }, h('span', {}, it.label), icon(it.icon)))) : null,
    h('button.cancel', { type: 'button', onclick: close }, 'Annuler'));
  const wrap = h('div.backdrop', { onclick: e => { if (e.target === wrap) close(); } }, panel);
  document.body.append(wrap);
  document.addEventListener('keydown', esc);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return close;
}
export const sheetHead = (thumb, title, sub) => h('div.sheet-head', {}, cover(small(thumb), 'cover'), h('div.meta', {}, h('div.t', {}, h('span.tt', {}, title)), h('div.s', {}, sub ?? '')));

// Saisie de texte dans une feuille (renommer, nouvelle playlist).
export function ask(title, { value = '', placeholder = '', ok = 'Valider', max = 80 } = {}) {
  return new Promise(resolve => {
    const input = h('input.field', { value, placeholder, maxlength: String(max), enterkeyhint: 'done', autocapitalize: 'sentences' });
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const form = h('form.ask', { onsubmit: e => { e.preventDefault(); const v = input.value.trim(); if (v) { finish(v); close(); } } },
      h('h3', {}, title), input, h('button.primary', { type: 'submit' }, ok));
    const close = sheet({ body: form });
    const obs = new MutationObserver(() => { if (!form.isConnected) { obs.disconnect(); finish(null); } });
    obs.observe(document.body, { childList: true });
    setTimeout(() => input.focus(), 250);
  });
}
export function confirmSheet(title, label, danger = true) {
  return new Promise(resolve => {
    let done = false;
    const close = sheet({ head: h('div.sheet-title', {}, title), items: [{ label, icon: danger ? 'trash' : 'check', danger, onClick: () => { done = true; resolve(true); } }] });
    const obs = new MutationObserver(() => { if (!document.querySelector('.backdrop')) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
    return close;
  });
}

// Choix d'une image locale → carré JPEG redimensionné (data URL), pour avatar et pochette.
export function pickImage(size = 512) {
  return new Promise((resolve, reject) => {
    const input = h('input', { type: 'file', accept: 'image/*' });
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight), cv = h('canvas', { width: String(size), height: String(size) });
        cv.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        let q = 0.85, out = cv.toDataURL('image/jpeg', q);
        while (out.length > 390000 && q > 0.4) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
      img.src = url;
    };
    input.click();
  });
}

// Couleur dominante d'une pochette (moyenne pondérée par la saturation), pour le fond du lecteur et le thème dynamique.
const colorCache = new Map();
export function coverColor(src) {
  if (!src) return Promise.resolve(null);
  const u = src.replace(/=w\d+-h\d+-l90-rj$/, '=w60-h60-l90-rj');
  if (colorCache.has(u)) return Promise.resolve(colorCache.get(u));
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = cv.height = 24;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), k = (mx - mn) / 255 + 0.08;
          r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; w += k;
        }
        const rgb = [r / w, g / w, b / w].map(Math.round);
        colorCache.set(u, rgb);
        resolve(rgb);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = u;
  });
}

// En-tête de page : barre (retour, actions) + grand titre style iOS. Renvoie le conteneur de contenu.
export function page(root, title, { backTo = null, right = [], sub = null } = {}) {
  const body = h('div.page-body');
  fill(root,
    h('header.bar', {}, backTo ? btn('icon-btn', 'Retour', backTo, icon('back')) : h('span'), h('div.bar-title', {}, title), h('div.bar-right', {}, right)),
    h('div.page', {}, title ? h('h1.large', {}, title) : null, sub, body));
  return body;
}
export function avatar(src, cls = 'avatar') { return src ? h(`img.${cls}`, { src, alt: '', decoding: 'async' }) : h(`div.${cls}.ph`, {}, icon('user')); }

// Recherche différée (frappe en cours).
export const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
