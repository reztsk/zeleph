// Déploiement : version unique (commit court + horodatage UTC) injectée dans le Worker via APP_VERSION,
// puis exposée par /api/version et estampillée dans sw.js et js/update.js (voir worker/index.js).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sha = (process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim().slice(0, 7);
const version = `${sha}-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`;
console.log(`version ${version}`);
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
execFileSync(process.execPath, [wrangler, 'deploy', '--var', `APP_VERSION:${version}`, ...process.argv.slice(2)], { stdio: 'inherit' });
