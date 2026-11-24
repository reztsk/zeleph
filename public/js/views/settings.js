// Réglages : profil (avatar, nom), mot de passe, thèmes (aperçu + application instantanée + sauvegarde), fond du lecteur, déconnexion.
import { h, btn, icon, page, section, toast, pickImage, avatar } from '../ui.js';
import { put, post } from '../api.js';
import { back, session } from '../nav.js';
import { THEMES, applyTheme } from '../themes.js';
import { prefs, setPref, refreshTheme } from '../prefs.js';
import { VERSION, checkUpdate } from '../update.js';

export function settings(root, { onLogout }) {
  const me = session.me;
  const body = page(root, 'Réglages', { backTo: back });
  const av = h('div.av-wrap', {}, avatar(me.avatar, 'avatar xl'));
  const setMe = m => { Object.assign(session.me, m); av.replaceChildren(avatar(session.me.avatar, 'avatar xl')); document.querySelectorAll('.me-btn').forEach(b => b.replaceChildren(avatar(session.me.avatar, 'avatar sm'))); };

  const nameInput = h('input.field', { value: me.name, maxlength: '40', autocomplete: 'name' });
  const profileForm = h('form.form', {
    onsubmit: async e => { e.preventDefault(); try { setMe((await put('/me', { name: nameInput.value })).me); toast('Profil enregistré'); } catch (x) { toast(x.message); } },
  },
  h('div.profile-edit', {},
    h('button.cover-btn.round', { type: 'button', 'aria-label': 'Changer la photo de profil', onclick: async () => {
      try { const img = await pickImage(256); if (!img) return; setMe((await put('/me', { avatar: img })).me); toast('Photo de profil mise à jour'); } catch (x) { toast(x.message); }
    } }, av, h('span.cover-edit', {}, icon('camera'))),
    h('div.who', {}, h('strong', {}, `@${me.handle}`), h('small.muted', {}, me.email))),
  h('label.lbl', {}, h('span', {}, 'Nom affiché'), nameInput),
  h('div.btn-row', {},
    h('button.primary', { type: 'submit' }, 'Enregistrer'),
    me.avatar ? h('button.secondary', { type: 'button', onclick: async () => { try { setMe((await put('/me', { avatar: null })).me); toast('Photo retirée'); } catch (x) { toast(x.message); } } }, 'Retirer la photo') : null));

  const grid = h('div.themes', {}, THEMES.map(t => h(`button.theme${t.id === me.theme ? '.on' : ''}`, {
    type: 'button', 'aria-label': t.name,
    style: { '--t-bg': t.bg, '--t-bg2': t.bg2, '--t-surface': t.surface, '--t-accent': t.accent, '--t-text': t.text },
    onclick: async e => {
      const prev = session.me.theme;
      grid.querySelectorAll('.theme').forEach(b => b.classList.toggle('on', b === e.currentTarget));
      session.me.theme = t.id; applyTheme(t.id); refreshTheme(); localStorage.setItem('zeleph.theme', t.id);
      try { await put('/me', { theme: t.id }); } catch (x) { toast(x.message); session.me.theme = prev; applyTheme(prev); refreshTheme(); }
    },
  }, h('span.swatch', {}, h('span.sw-card'), h('span.sw-dot')), h('span.theme-name', {}, t.name))));

  const pw = h('form.form', {
    onsubmit: async e => {
      e.preventDefault();
      const f = pw.elements;
      if (f.next.value !== f.confirm.value) return toast('Les mots de passe ne correspondent pas');
      try { await post('/me/password', { current: f.current.value, next: f.next.value }); pw.reset(); toast('Mot de passe changé (autres appareils déconnectés)'); } catch (x) { toast(x.message); }
    },
  },
  h('label.lbl', {}, h('span', {}, 'Mot de passe actuel'), h('input.field', { name: 'current', type: 'password', autocomplete: 'current-password', required: true })),
  h('label.lbl', {}, h('span', {}, 'Nouveau mot de passe'), h('input.field', { name: 'next', type: 'password', autocomplete: 'new-password', minlength: '8', maxlength: '72', required: true })),
  h('label.lbl', {}, h('span', {}, 'Confirmer'), h('input.field', { name: 'confirm', type: 'password', autocomplete: 'new-password', minlength: '8', maxlength: '72', required: true })),
  h('button.secondary', { type: 'submit' }, 'Changer le mot de passe'));

  const bgToggle = h('input', { type: 'checkbox', checked: prefs.coverBg, onchange: e => setPref('coverBg', e.target.checked) });

  const upd = h('button.secondary', { type: 'button', onclick: async () => {
    upd.disabled = true;
    try { if (!await checkUpdate(true)) toast('Tu utilises déjà la dernière version'); } catch (x) { toast(x.message); } finally { upd.disabled = false; }
  } }, 'Vérifier les mises à jour');

  body.append(
    section('Profil', profileForm),
    section('Thèmes', h('p.muted.small', {}, 'Appliqué tout de suite et enregistré sur ton compte.'), grid),
    section('Lecteur', h('label.switch-row', {}, h('span', {}, 'Fond du lecteur aux couleurs de la pochette'), bgToggle, h('span.switch'))),
    section('Sécurité', pw),
    section('Application & Mises à jour',
      h('p.muted.small', {}, 'Version installée : ', h('strong.version', {}, VERSION)),
      h('div.btn-row', {}, upd, h('a.secondary', { href: 'https://github.com/reztsk/zeleph', target: '_blank', rel: 'noopener noreferrer' }, 'Dépôt GitHub'))),
    section(null, h('button.danger-btn', { type: 'button', onclick: onLogout }, icon('logout'), 'Se déconnecter')),
    h('p.muted.small.center', {}, 'Zeleph · audio YouTube sans publicité'),
  );
}
