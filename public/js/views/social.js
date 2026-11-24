// Amis (recherche par @pseudo, demandes, liste) et pages Profil.
import { h, fill, btn, icon, page, card, section, empty, spinner, toast, debounce, avatar, confirmSheet } from '../ui.js';
import { get, post, del } from '../api.js';
import { go, back, session } from '../nav.js';

const REL = {
  none: ['Ajouter', 'primary'],
  outgoing: ['Demande envoyée', 'secondary'],
  incoming: ['Accepter', 'primary'],
  friend: ['Amis', 'secondary'],
};

async function relAction(u, after) {
  try {
    if (u.rel === 'friend') { if (!(await confirmSheet(`Retirer @${u.handle} de tes amis ?`, 'Retirer'))) return; await del(`/friends/${u.handle}`); toast('Ami retiré'); }
    else if (u.rel === 'outgoing') { await del(`/friends/${u.handle}`); toast('Demande annulée'); }
    else { const r = await post(`/friends/${u.handle}`); toast(r.rel === 'friend' ? `Toi et @${u.handle} êtes amis` : 'Demande envoyée'); }
    after();
  } catch (e) { toast(e.message); }
}

const userRow = (u, actions) => h('div.row.user-row', { role: 'button', tabindex: '0', onclick: e => { if (!e.target.closest('button')) go(`/u/${u.handle}`); } },
  avatar(u.avatar, 'avatar'), h('div.meta', {}, h('div.t', {}, h('span.tt', {}, u.name)), h('div.s', {}, `@${u.handle}`)), h('div.row-actions', {}, actions));

export async function friends(root) {
  const body = page(root, 'Amis', { right: [btn('icon-btn me-btn', 'Mon profil', () => go('/me'), avatar(session.me?.avatar, 'avatar sm'))] });
  const results = h('div.list'), lists = h('div');
  const input = h('input.search-field', { type: 'search', placeholder: 'Rechercher un @pseudo', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Rechercher un ami' });
  const refresh = async () => {
    fill(lists, spinner());
    let f;
    try { f = await get('/friends'); } catch (e) { fill(lists, empty(e.message)); return; }
    fill(lists, 
      f.incoming.length ? section(`Demandes reçues (${f.incoming.length})`, h('div.list', {}, f.incoming.map(u => userRow(u, [
        h('button.mini.primary', { type: 'button', onclick: () => relAction(u, refresh) }, 'Accepter'),
        h('button.mini.secondary', { type: 'button', onclick: async () => { try { await del(`/friends/${u.handle}`); toast('Demande refusée'); refresh(); } catch (e) { toast(e.message); } } }, 'Refuser'),
      ])))) : null,
      section(`Mes amis (${f.friends.length})`, f.friends.length ? h('div.list', {}, f.friends.map(u => userRow(u, [icon('back', 'chev')]))) : empty('Cherche le @pseudo d\'un ami pour l\'ajouter', 'friends')),
      f.outgoing.length ? section('Demandes envoyées', h('div.list', {}, f.outgoing.map(u => userRow(u, [h('button.mini.secondary', { type: 'button', onclick: () => relAction(u, refresh) }, 'Annuler')])))) : null,
    );
  };
  const find = debounce(async () => {
    const q = input.value.trim();
    if (q.replace(/^@/, '').length < 2) { results.replaceChildren(); return; }
    try {
      const r = await get(`/users?q=${encodeURIComponent(q)}`);
      results.replaceChildren(...(r.users.length ? r.users.map(u => userRow(u, [h(`button.mini.${REL[u.rel][1]}`, { type: 'button', onclick: () => relAction(u, () => { find(); refresh(); }) }, REL[u.rel][0])])) : [h('p.muted.pad', {}, 'Aucun utilisateur trouvé')]));
    } catch (e) { results.replaceChildren(h('p.muted.pad', {}, e.message)); }
  }, 300);
  input.addEventListener('input', find);
  body.append(h('div.search-box', {}, icon('search'), input), results, lists);
  refresh();
}

export async function profile(root, handle) {
  const self = !handle || handle === session.me?.handle;
  const body = page(root, '', { backTo: self && !handle ? null : back, right: self ? [btn('icon-btn', 'Réglages', () => go('/settings'), icon('gear'))] : [] });
  body.append(spinner());
  let d;
  try { d = await get(`/users/${encodeURIComponent(handle || session.me.handle)}`); } catch (e) { fill(body, empty(e.message)); return; }
  const u = d.user;
  const action = self ? h('button.secondary.pill', { type: 'button', onclick: () => go('/settings') }, 'Modifier le profil')
    : h(`button.${REL[u.rel][1]}.pill`, { type: 'button', onclick: () => relAction(u, () => profile(root, handle)) }, u.rel === 'friend' ? icon('check') : null, REL[u.rel][0]);
  fill(body, 
    h('div.profile-head', {}, avatar(u.avatar, 'avatar xl'), h('h1.coll-title', {}, u.name), h('p.muted', {}, `@${u.handle} · ${u.friends} ami${u.friends > 1 ? 's' : ''}`), action),
    section(self ? 'Mes playlists' : 'Playlists', d.playlists.length
      ? h('div.grid', {}, d.playlists.map(p => card({ title: p.name, subtitle: `${p.count} titre${p.count > 1 ? 's' : ''}${self && !p.public ? ' · privée' : ''}`, thumb: p.cover }, () => go(`/playlist/${p.id}`))))
      : empty(self ? 'Aucune playlist' : u.rel === 'friend' ? 'Aucune playlist visible' : 'Ajoute cette personne en ami pour voir ses playlists', 'library')),
  );
  root.querySelector('.bar-title').textContent = `@${u.handle}`;
}
