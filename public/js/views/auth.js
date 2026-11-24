// Démarrage hors connexion : accueil, connexion, création de compte (@pseudo + e-mail + mot de passe + code OTP),
// mot de passe oublié (e-mail → code + nouveau mot de passe → reconnecté).
import { h, btn, icon, toast, debounce } from '../ui.js';
import { get, post } from '../api.js';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
let done;

export function renderAuth(root, onLogged) {
  done = onLogged;
  welcome(root);
}

const shell = (root, title, sub, ...kids) => {
  root.replaceChildren(h('div.auth', {},
    h('div.auth-top', {}, btn('icon-btn', 'Retour', () => welcome(root), icon('back'))),
    h('h1.auth-title', {}, title), sub ? h('p.auth-sub', {}, sub) : null, ...kids));
};
const field = (label, props) => h('label.lbl', {}, h('span', {}, label), h('input.field', props));
const errorBox = () => h('p.form-err', { role: 'alert' });
const busy = (b, on) => { b.disabled = on; b.classList.toggle('loading', on); };

function welcome(root) {
  root.replaceChildren(h('div.auth.welcome', {},
    h('div.logo', {}, h('img', { src: '/icons/icon-192.png', alt: '' })),
    h('h1.brand', {}, 'Zeleph'),
    h('p.auth-sub', {}, 'Ta musique, sans pub, partout.'),
    h('div.auth-actions', {},
      h('button.primary', { type: 'button', onclick: () => login(root) }, 'Se connecter'),
      h('button.secondary', { type: 'button', onclick: () => signup(root) }, 'Créer un compte'),
      h('button.link', { type: 'button', onclick: () => forgot(root) }, 'Mot de passe oublié ?'))));
}

function login(root) {
  const err = errorBox(), sub = h('button.primary', { type: 'submit' }, 'Se connecter');
  const form = h('form.form', {
    onsubmit: async e => {
      e.preventDefault(); err.textContent = ''; busy(sub, true);
      try { const r = await post('/auth/login', { login: form.elements.login.value, password: form.elements.password.value }); done(r.me); }
      catch (x) { err.textContent = x.message; busy(sub, false); }
    },
  },
  field('E-mail ou @pseudo', { name: 'login', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true }),
  field('Mot de passe', { name: 'password', type: 'password', autocomplete: 'current-password', required: true }),
  err, sub, h('button.link', { type: 'button', onclick: () => forgot(root) }, 'Mot de passe oublié ?'));
  shell(root, 'Connexion', 'Retrouve ta musique, tes playlists et tes amis.', form);
}

function signup(root) {
  const err = errorBox(), status = h('small.hint', {}, 'Lettres minuscules, chiffres et _ (3 à 20)');
  const sub = h('button.primary', { type: 'submit' }, 'Continuer');
  const handle = h('input.field', { name: 'handle', autocomplete: 'nickname', autocapitalize: 'none', spellcheck: 'false', maxlength: '20', required: true, placeholder: 'ton_pseudo' });
  const check = debounce(async v => {
    if (!HANDLE_RE.test(v)) { status.textContent = v ? 'Format : a-z, 0-9, _ (3 à 20)' : 'Lettres minuscules, chiffres et _ (3 à 20)'; status.className = v ? 'hint bad' : 'hint'; return; }
    try {
      const r = await get(`/handle/${encodeURIComponent(v)}`);
      if (handle.value !== v) return;
      status.textContent = r.available ? `@${v} est disponible` : `@${v} est déjà pris`;
      status.className = `hint ${r.available ? 'ok' : 'bad'}`;
    } catch { status.textContent = ''; }
  }, 300);
  handle.addEventListener('input', () => { const v = handle.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); if (v !== handle.value) handle.value = v; status.textContent = 'Vérification…'; status.className = 'hint'; check(v); });
  const form = h('form.form', {
    onsubmit: async e => {
      e.preventDefault(); err.textContent = '';
      const f = form.elements;
      if (f.password.value !== f.confirm.value) { err.textContent = 'Les mots de passe ne correspondent pas'; return; }
      busy(sub, true);
      try {
        const r = await post('/auth/signup', { handle: f.handle.value, email: f.email.value, password: f.password.value });
        otp(root, { ...r, email: f.email.value, kind: 'signup' });
      } catch (x) { err.textContent = x.message; busy(sub, false); }
    },
  },
  h('label.lbl', {}, h('span', {}, '@pseudo'), h('div.at', {}, h('span', {}, '@'), handle), status),
  field('E-mail', { name: 'email', type: 'email', autocomplete: 'email', autocapitalize: 'none', required: true }),
  field('Mot de passe', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: '8', maxlength: '72', required: true }),
  field('Confirmer le mot de passe', { name: 'confirm', type: 'password', autocomplete: 'new-password', minlength: '8', maxlength: '72', required: true }),
  err, sub);
  shell(root, 'Créer un compte', 'Un code de validation te sera envoyé par e-mail.', form);
}

function forgot(root) {
  const err = errorBox(), sub = h('button.primary', { type: 'submit' }, 'Recevoir un code');
  const form = h('form.form', {
    onsubmit: async e => {
      e.preventDefault(); err.textContent = ''; busy(sub, true);
      try { const r = await post('/auth/forgot', { email: form.elements.email.value }); otp(root, { ...r, email: form.elements.email.value, kind: 'reset' }); }
      catch (x) { err.textContent = x.message; busy(sub, false); }
    },
  }, field('E-mail du compte', { name: 'email', type: 'email', autocomplete: 'email', autocapitalize: 'none', required: true }), err, sub);
  shell(root, 'Mot de passe oublié', 'Saisis ton e-mail : tu recevras un code pour choisir un nouveau mot de passe.', form);
}

// Saisie du code à 6 chiffres (+ nouveau mot de passe pour une réinitialisation), renvoi avec compte à rebours.
function otp(root, ch) {
  const err = errorBox(), sub = h('button.primary', { type: 'submit' }, ch.kind === 'reset' ? 'Changer le mot de passe' : 'Activer mon compte');
  const code = h('input.field.code', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '\\d{6}', maxlength: '6', required: true, placeholder: '••••••' });
  const again = h('button.link', { type: 'button' });
  let wait = ch.resend ?? 30, timer;
  const tick = () => { again.disabled = wait > 0; again.textContent = wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'; if (wait-- <= 0) clearInterval(timer); };
  const startTimer = s => { wait = s; clearInterval(timer); tick(); timer = setInterval(tick, 1000); };
  again.onclick = async () => {
    try { const r = await post('/auth/resend', { challenge: ch.challenge }); toast('Nouveau code envoyé'); if (r.demo) code.value = r.demo; startTimer(r.resend ?? 30); }
    catch (x) { err.textContent = x.message; }
  };
  const form = h('form.form', {
    onsubmit: async e => {
      e.preventDefault(); err.textContent = '';
      const f = form.elements;
      if (ch.kind === 'reset' && f.password.value !== f.confirm.value) { err.textContent = 'Les mots de passe ne correspondent pas'; return; }
      busy(sub, true);
      try {
        const r = await post('/auth/verify', { challenge: ch.challenge, code: code.value, ...(ch.kind === 'reset' && { password: f.password.value }) });
        clearInterval(timer);
        toast(ch.kind === 'reset' ? 'Mot de passe changé, tu es connecté' : 'Compte activé, bienvenue !');
        done(r.me);
      } catch (x) { err.textContent = x.message; busy(sub, false); }
    },
  },
  h('label.lbl', {}, h('span', {}, 'Code reçu par e-mail'), code),
  ch.kind === 'reset' ? [
    field('Nouveau mot de passe', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: '8', maxlength: '72', required: true }),
    field('Confirmer', { name: 'confirm', type: 'password', autocomplete: 'new-password', minlength: '8', maxlength: '72', required: true }),
  ] : null,
  err, sub, again);
  shell(root, 'Vérifie tes e-mails', `Code envoyé à ${ch.email} (valable 10 minutes). Pense aux courriers indésirables.`, form);
  if (ch.demo) { code.value = ch.demo; toast('Mode démo local : code prérempli'); }
  startTimer(ch.resend ?? 30);
  setTimeout(() => code.focus(), 200);
}
