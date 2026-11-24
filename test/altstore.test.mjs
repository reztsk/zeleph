import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base, addVersion } from '../tools/altstore.mjs';

const v = n => ({ version: `1.0.${n}`, build: String(n), size: 1000 + n, url: `https://github.com/reztsk/zeleph/releases/download/v1.0.${n}/Zeleph.ipa`, date: '2026-11-24T00:00:00.000Z' });

test('apps.json : dernière version en tête, champs à plat, 10 versions max, pas de doublon', () => {
  const src = base();
  for (let n = 1; n <= 12; n++) addVersion(src, v(n));
  addVersion(src, v(12));
  const app = src.apps[0];
  assert.equal(app.versions.length, 10);
  assert.equal(app.versions[0].version, '1.0.12');
  assert.equal(app.versions[0].buildVersion, '12');
  assert.equal(app.versions.filter(x => x.version === '1.0.12').length, 1);
  assert.equal(app.downloadURL, v(12).url);
  assert.equal(app.size, 1012);
});

test('apps.json : entrée invalide refusée', () => {
  assert.throws(() => addVersion(base(), { ...v(1), size: 0 }));
  assert.throws(() => addVersion(base(), { ...v(1), url: 'http://x' }));
  assert.throws(() => addVersion(base(), { ...v(1), version: '1.0' }));
});
