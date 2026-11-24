import { fail } from './util.js';

// Codes OTP par e-mail via l'API HTTP Brevo (compatible Workers, aucune dépendance).
// BREVO_API_KEY = secret Worker (jamais dans le code ni côté client). BREVO_SENDER_EMAIL = expéditeur vérifié chez Brevo.
const APP = 'Zeleph';
export const mailReady = env => !!(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);

const WHY = {
  signup: { subject: `ton code d'activation ${APP}`, lead: 'activer ton compte', title: 'Active ton compte' },
  reset: { subject: `réinitialisation de ton mot de passe ${APP}`, lead: 'choisir un nouveau mot de passe', title: 'Mot de passe oublié' },
};
const SAFE = `Si tu n'es pas à l'origine de cette demande, ignore cet e-mail : sans ce code, personne ne peut accéder à ton compte. Ne communique jamais ce code, l'équipe ${APP} ne te le demandera jamais.`;

// Aucune donnée saisie par l'utilisateur n'entre dans le message : seulement le code, le motif et la durée.
export function otpMessage(kind, code, minutes) {
  const w = WHY[kind];
  if (!w || !/^\d{6}$/.test(code)) throw new Error('otpMessage : motif ou code invalide');
  const subject = `${code} : ${w.subject}`;
  const text = `${APP.toUpperCase()}\n\n${w.title}\n\nTon code pour ${w.lead} :\n\n    ${code}\n\nIl expire dans ${minutes} minutes et ne sert qu'une fois.\n\n${SAFE}\n`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0b0710">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0710"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="460" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:460px;font-family:-apple-system,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f6eef3">
<tr><td style="padding:0 0 18px;font-size:22px;font-weight:700;letter-spacing:.02em;color:#ff8fb8">${APP}</td></tr>
<tr><td bgcolor="#1a1118" style="background:#1a1118;border:1px solid #33222e;border-radius:18px;padding:30px 26px">
<div style="font-size:21px;line-height:28px;font-weight:600;padding-bottom:8px">${w.title}</div>
<div style="font-size:15px;line-height:22px;color:#c2b2bc;padding-bottom:22px">Voici ton code pour ${w.lead}.</div>
<div style="background:#24161f;border:1px solid #ff8fb8;border-radius:12px;padding:16px 8px;text-align:center;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;line-height:40px;font-weight:600;letter-spacing:.3em">${code}</div>
<div style="font-size:14px;line-height:21px;color:#c2b2bc;padding:18px 0 20px">Il expire dans <b style="color:#f6eef3">${minutes} minutes</b> et ne sert qu'une fois.</div>
<div style="border-top:1px solid #33222e;padding-top:18px;font-size:12px;line-height:19px;color:#8f7f89">${SAFE}</div>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

export async function sendOtp(env, to, kind, code, minutes) {
  const { subject, html, text } = otpMessage(kind, code, minutes);
  let res;
  try {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: env.BREVO_SENDER_NAME || APP, email: env.BREVO_SENDER_EMAIL }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) { console.error('mail : réseau', e.name); fail(502, 'mail_fail', 'Envoi du code impossible, réessaie dans un instant'); }
  if (!res.ok) { console.error('mail : refusé par Brevo', res.status); fail(502, 'mail_fail', 'Envoi du code impossible, réessaie dans un instant'); } // jamais la clé ni le corps de réponse dans les journaux
}
