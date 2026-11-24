// Contrôles statiques : syntaxe de chaque fichier JS, aucun secret en dur, PWA cohérente (manifest, service worker, nom).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? (/node_modules|\.git|\.wrangler|fixtures/.test(f) ? [] : walk(p)) : [p]; });
const files = walk(root);
let bad = 0;
const fail = m => { console.error(`✗ ${m}`); bad++; };

for (const f of files.filter(f => /\.(m?js)$/.test(f))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { fail(`syntaxe : ${f}\n${e.stderr}`); }
}
// Secrets : clés Brevo, jetons GitHub/Cloudflare, clés privées.
const SECRET = /(xkeysib-[a-f0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|cf[a-z]?_[A-Za-z0-9]{30,})/;
for (const f of files.filter(f => !/\.(png|jpg)$/.test(f))) if (SECRET.test(readFileSync(f, 'utf8'))) fail(`secret possible dans ${f}`);
if (existsSync(join(root, '.dev.vars')) && !readFileSync(join(root, '.gitignore'), 'utf8').includes('.dev.vars')) fail('.dev.vars non ignoré par git');

const man = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));
if (man.name !== 'Zeleph' || man.short_name !== 'Zeleph' || man.lang !== 'fr') fail('manifest : nom Zeleph / langue fr');
for (const i of man.icons) if (!existsSync(join(root, 'public', i.src))) fail(`icône manquante ${i.src}`);
const html = readFileSync(join(root, 'public/index.html'), 'utf8');
for (const k of ['apple-mobile-web-app-title" content="Zeleph"', 'viewport-fit=cover', 'apple-touch-icon', '<audio id="audio"', 'lang="fr"']) if (!html.includes(k)) fail(`index.html : ${k}`);
if (/<iframe|<video|youtube\.com\/embed/i.test(files.filter(f => f.includes('public')).map(f => (/\.(html|js|css)$/.test(f) ? readFileSync(f, 'utf8') : '')).join('\n'))) fail('iframe / vidéo interdite côté client');
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');
for (const p of [...sw.matchAll(/'(\/[^']+\.(?:js|css|png|html|webmanifest))'/g)].map(m => m[1])) if (!existsSync(join(root, 'public', p))) fail(`sw.js : fichier absent ${p}`);
const jsFiles = files.filter(f => f.includes(`public${process.platform === 'win32' ? '\\' : '/'}js`)).map(f => f.split(/public[\\/]/)[1].replace(/\\/g, '/'));
for (const j of jsFiles) if (!sw.includes(`'/${j}'`)) fail(`sw.js : /${j} absent de la coquille`);

if (bad) { console.error(`${bad} problème(s)`); process.exit(1); }
console.log(`✓ contrôles statiques (${files.length} fichiers)`);
