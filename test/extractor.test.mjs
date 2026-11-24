// Test réel de l'extracteur dédié (npm run test:extractor) : nécessite yt-dlp (variable YTDLP sinon « yt-dlp » du PATH).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOKEN = 'jeton_de_test_local_0123456789abcdef', PORT = 8799, VID = 'h38KSr90aX0';
const base = `http://127.0.0.1:${PORT}`;

test('Extracteur : jeton exigé, Range 206, début et milieu du fichier', async t => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../extractor/server.mjs', import.meta.url))], { env: { ...process.env, EXTRACTOR_TOKEN: TOKEN, PORT: String(PORT) }, stdio: 'inherit' });
  t.after(() => child.kill());
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* démarrage */ } await new Promise(r => setTimeout(r, 100)); }
  assert.equal((await fetch(`${base}/audio/${VID}`)).status, 401);
  assert.equal((await fetch(`${base}/audio/${VID}`, { headers: { authorization: 'Bearer mauvais' } })).status, 401);
  const auth = { authorization: `Bearer ${TOKEN}` };
  assert.equal((await fetch(`${base}/audio/bad`, { headers: auth })).status, 400);
  const r = await fetch(`${base}/audio/${VID}`, { headers: { ...auth, range: 'bytes=0-1023' } });
  assert.equal(r.status, 206);
  const head = new TextDecoder('latin1').decode(new Uint8Array(await r.arrayBuffer()));
  assert.equal(head.slice(4, 12), 'ftypM4A ', 'M4A classique, pas « dash » (Safari iOS)');
  assert.ok(head.indexOf('moov') > 0 && (head.indexOf('mdat') === -1 || head.indexOf('moov') < head.indexOf('mdat')), 'moov en tête (faststart)');
  const m = await fetch(`${base}/audio/${VID}`, { headers: { ...auth, range: 'bytes=1500000-1500099' } });
  assert.equal(m.status, 206);
  assert.equal((await m.arrayBuffer()).byteLength, 100);
});
