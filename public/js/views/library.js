// Bibliothèque (style Apple Music) : favoris, playlists perso, playlists partagées ; page Playlist avec recherche interne.
import { h, fill, btn, icon, page, card, section, trackRow, cover, empty, spinner, toast, ask, sheet, confirmSheet, pickImage, artistsText, avatar } from '../ui.js';
import { get, post, put, del } from '../api.js';
import * as player from '../player.js';
import { trackMenu } from '../menu.js';
import { go, back, session } from '../nav.js';
import { collectionHead, playButtons, filterBox } from './browse.js';

const plCard = p => card({ title: p.name, subtitle: p.mine ? `${p.count} titre${p.count > 1 ? 's' : ''}` : `@${p.owner?.handle}`, thumb: p.cover }, () => go(`/playlist/${p.id}`));

async function newPlaylist() {
  const name = await ask('Nouvelle playlist', { placeholder: 'Nom de la playlist', ok: 'Créer' });
  if (!name) return;
  try { const r = await post('/playlists', { name }); go(`/playlist/${r.playlist.id}`); } catch (e) { toast(e.message); }
}

export async function library(root) {
  const body = page(root, 'Bibliothèque', { right: [btn('icon-btn', 'Nouvelle playlist', newPlaylist, icon('plus')), btn('icon-btn me-btn', 'Mon profil', () => go('/me'), avatar(session.me?.avatar, 'avatar sm'))] });
  body.append(spinner());
  let d;
  try { d = await get('/library'); } catch (e) { fill(body, empty(e.message)); return; }
  fill(body, 
    h('div.lib-links', {},
      h('button.lib-link', { type: 'button', onclick: () => go('/likes') }, h('span.lib-ic.likes', {}, icon('heartOn')), h('span', {}, 'Titres likés'), h('small', {}, String(d.likes)), icon('back', 'chev')),
      h('button.lib-link', { type: 'button', onclick: newPlaylist }, h('span.lib-ic', {}, icon('plus')), h('span', {}, 'Nouvelle playlist'), h('small'), icon('back', 'chev'))),
    section('Mes playlists', d.playlists.length ? h('div.grid', {}, d.playlists.map(plCard)) : empty('Crée ta première playlist avec le bouton +', 'library')),
    d.shared.length ? section('Partagées avec moi', h('div.grid', {}, d.shared.map(plCard))) : null,
  );
}

export async function likes(root) {
  const body = page(root, 'Titres likés', { backTo: back });
  body.append(spinner());
  let d;
  try { d = await get('/likes'); } catch (e) { fill(body, empty(e.message)); return; }
  const list = h('div.list');
  const draw = q => {
    const f = q ? d.tracks.filter(t => `${t.title} ${artistsText(t)}`.toLowerCase().includes(q)) : d.tracks;
    list.replaceChildren(...(f.length ? f.map(t => trackRow(t, { onPlay: () => player.playList(f, f.indexOf(t)), onMore: () => trackMenu(t) })) : [empty(d.tracks.length ? 'Aucun titre trouvé' : 'Touche ♥ ou « … » sur un son pour l\'ajouter ici', 'heart')]));
  };
  fill(body, playButtons(() => d.tracks), filterBox(draw), list);
  draw('');
}

export async function playlist(root, id) {
  const body = page(root, '', { backTo: back });
  body.append(spinner());
  let d;
  try { d = await get(`/playlists/${id}`); } catch (e) { fill(body, empty(e.message)); return; }
  const p = d.playlist;
  root.querySelector('.bar-title').textContent = p.name;
  const reload = () => playlist(root, id);
  let q = '';
  const list = h('div.list');
  const draw = (nq = q) => {
    q = nq;
    const f = q ? d.tracks.filter(t => `${t.title} ${artistsText(t)}`.toLowerCase().includes(q)) : d.tracks;
    list.replaceChildren(...(f.length ? f.map(t => trackRow(t, {
      onPlay: () => player.playList(f, f.indexOf(t)),
      onMore: () => trackMenu(t, { playlist: p, onRemoved: () => { d.tracks = d.tracks.filter(x => x.id !== t.id); draw(); } }),
    })) : [empty(d.tracks.length ? 'Aucun titre trouvé' : p.mine ? 'Ajoute des sons avec « … » → Ajouter à une playlist' : 'Playlist vide', 'note')]));
  };
  const changeCover = async () => {
    try { const img = await pickImage(512); if (!img) return; await put(`/playlists/${id}`, { cover: img }); toast('Photo mise à jour'); reload(); } catch (e) { toast(e.message); }
  };
  const owner = p.mine ? null : h('button.link.owner', { type: 'button', onclick: () => go(`/u/${p.owner.handle}`) }, `${p.owner.name} · @${p.owner.handle}`);
  const sub = `${d.tracks.length} titre${d.tracks.length > 1 ? 's' : ''}${p.mine ? (p.public ? ' · visible par mes amis' : ' · privée') : ''}`;
  if (p.mine) root.querySelector('.bar-right').append(btn('icon-btn', 'Options de la playlist', () => options(p, d, reload, changeCover), icon('more')));
  fill(body, collectionHead(p.cover, p.name, owner, sub, p.mine ? changeCover : null), playButtons(() => d.tracks), filterBox(v => draw(v)), list);
  draw('');
}

function options(p, d, reload, changeCover) {
  sheet({
    head: h('div.sheet-title', {}, p.name),
    items: [
      { label: 'Renommer', icon: 'gear', onClick: async () => { const n = await ask('Renommer', { value: p.name, ok: 'Enregistrer' }); if (n) try { await put(`/playlists/${p.id}`, { name: n }); reload(); } catch (e) { toast(e.message); } } },
      { label: 'Changer la photo', icon: 'camera', onClick: changeCover },
      p.cover?.startsWith('/api/img/') ? { label: 'Retirer la photo', icon: 'close', onClick: async () => { try { await put(`/playlists/${p.id}`, { cover: null }); reload(); } catch (e) { toast(e.message); } } } : null,
      { label: p.public ? 'Masquer à mes amis' : 'Rendre visible par mes amis', icon: 'eye', onClick: async () => { try { await put(`/playlists/${p.id}`, { public: !p.public }); toast(p.public ? 'Playlist privée' : 'Visible sur ton profil par tes amis'); reload(); } catch (e) { toast(e.message); } } },
      { label: 'Partager à des amis…', icon: 'share', onClick: () => shareTo(p, d.playlist.sharedWith ?? []) },
      { label: 'Ajouter toute la playlist à la file', icon: 'playLater', onClick: () => { d.tracks.forEach(t => player.queue.playLater(t)); player.edit(() => {}); toast(`${d.tracks.length} titres ajoutés à la file`); } },
      { label: 'Supprimer la playlist', icon: 'trash', danger: true, onClick: async () => { if (await confirmSheet(`Supprimer « ${p.name} » ?`, 'Supprimer définitivement')) try { await del(`/playlists/${p.id}`); toast('Playlist supprimée'); go('/library'); } catch (e) { toast(e.message); } } },
    ],
  });
}

async function shareTo(p, already) {
  let f;
  try { f = await get('/friends'); } catch (e) { return toast(e.message); }
  if (!f.friends.length) return toast('Ajoute d\'abord des amis (onglet Amis)');
  const picked = new Set();
  const close = sheet({
    head: h('div.sheet-title', {}, `Partager « ${p.name} »`),
    body: h('div.pick', {},
      f.friends.map(u => {
        const done = already.includes(u.handle);
        const row = h(`button.pick-row${done ? '.done' : ''}`, { type: 'button', disabled: done, onclick: () => { picked.has(u.handle) ? picked.delete(u.handle) : picked.add(u.handle); row.classList.toggle('on'); } },
          avatar(u.avatar, 'avatar'), h('span', {}, u.name, h('small', {}, ` @${u.handle}`)), done ? h('small', {}, 'Déjà partagée') : icon('check', 'tick'));
        return row;
      }),
      h('button.primary', { type: 'button', onclick: async () => {
        if (!picked.size) return toast('Choisis au moins un ami');
        try { await post(`/playlists/${p.id}/share`, { handles: [...picked] }); close(); toast(`Partagée avec ${picked.size} ami${picked.size > 1 ? 's' : ''}`); } catch (e) { toast(e.message); }
      } }, 'Partager')),
  });
}
