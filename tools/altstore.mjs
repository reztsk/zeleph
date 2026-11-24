// Source AltStore Classic (apps.json à la racine du dépôt) : ajoute la version compilée par .github/workflows/build-ipa.yml.
// Usage : node tools/altstore.mjs <version> <build> <taille en octets> <url du .ipa>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAW = 'https://raw.githubusercontent.com/reztsk/zeleph/main';
const KEEP = 10;

export const base = () => ({
  name: 'Zeleph',
  identifier: 'com.reztsk.zeleph.source',
  sourceURL: `${RAW}/apps.json`,
  iconURL: `${RAW}/public/icons/icon-512.png`,
  website: 'https://github.com/reztsk/zeleph',
  apps: [{
    name: 'Zeleph',
    bundleIdentifier: 'com.reztsk.zeleph',
    developerName: 'reztsk',
    subtitle: 'Musique sans pub, écran verrouillé, playlists.',
    localizedDescription: 'Lecteur musical Zeleph en application native : audio extrait directement sur l\'iPhone, sans publicité, lecture en arrière-plan et contrôles sur l\'écran verrouillé.',
    iconURL: `${RAW}/public/icons/icon-512.png`,
    tintColor: 'fa2d55',
    category: 'entertainment',
    screenshots: [],
    versions: [],
    appPermissions: { entitlements: [], privacy: {} },
  }],
  news: [],
});

export function addVersion(src, { version, build, size, url, date }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^\d+$/.test(build) || !(size > 0) || !/^https:\/\//.test(url)) throw new Error('version, build, taille ou URL invalide');
  const app = src.apps[0];
  const v = { version, buildVersion: build, date, localizedDescription: `Zeleph ${version}`, downloadURL: url, size, minOSVersion: '16.0' };
  app.versions = [v, ...app.versions.filter(x => x.version !== version)].slice(0, KEEP);
  // Champs « à plat » lus par les anciennes versions d'AltStore.
  Object.assign(app, { version, versionDate: date, versionDescription: v.localizedDescription, downloadURL: url, size });
  return src;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, build, size, url] = process.argv.slice(2);
  const file = fileURLToPath(new URL('../apps.json', import.meta.url));
  const src = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : base();
  addVersion(src, { version, build, size: Number(size), url, date: new Date().toISOString() });
  writeFileSync(file, `${JSON.stringify(src, null, 2)}\n`);
  console.log(`apps.json → ${version} (${size} octets)`);
}
