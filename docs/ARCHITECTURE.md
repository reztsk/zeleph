# Architecture de Zeleph

Application **indépendante**. REZ Music n'a servi que d'inspiration technique (extraction directe du flux audio,
client YouTube « visionOS » prioritaire, vérification des octets, paroles LRCLIB). Aucune de ses fonctions annexes
(blind test, Vibe Radar, SoundCloud, binaires Windows) n'est reprise.

## Vue d'ensemble

```
iPhone (Safari / écran d'accueil, PWA)
  │  même origine, cookie de session HttpOnly
  ▼
Cloudflare Worker « zeleph »  ──  fichiers statiques public/ (binding ASSETS)
  ├─ /api/auth/*      comptes, OTP Brevo, mot de passe oublié      ──► api.brevo.com
  ├─ /api/me, users, friends, playlists, likes, history, home     ──► D1 (SQLite)
  ├─ /api/search, artist, collection, radio                       ──► music.youtube.com (InnerTube WEB_REMIX)
  ├─ /api/lyrics                                                   ──► lrclib.net
  └─ /api/stream/:id  flux M4A/AAC relayé avec Range              ──► youtube.com (player VISIONOS) + googlevideo
                       cache des URL ~4 h (KV si lié, sinon mémoire / Cache API)
                       repli optionnel ──► extracteur dédié (extractor/, yt-dlp, derrière Cloudflare Tunnel)
```

- **Un seul Worker** sert la PWA et l'API : même origine, donc **zéro CORS** et cookie `SameSite=Lax`.
  (Cloudflare recommande désormais Workers + Static Assets plutôt que Pages ; le résultat est identique pour l'utilisateur.)
- **Zéro dépendance** côté client et serveur. Seule dépendance de développement : `wrangler`.
- **Poids** : PWA + Worker = 57 Ko (18 Ko gzip). Pas de framework, pas de bundler, pas d'Electron.
- Prête pour un wrapper léger (Tauri 2 / WKWebView) : tout passe par HTTP, aucune API propre au navigateur hors `<audio>` et `mediaSession`.

## Audio : zéro pub, zéro clip, écran verrouillé

1. `/api/stream/:id` demande au lecteur InnerTube un format **itag 140 (audio/mp4, AAC 128 kb/s)**. Jamais WebM/Opus,
   jamais de vidéo, jamais d'iframe : les publicités n'existent que dans le lecteur YouTube, absent ici.
2. Client **VISIONOS + visitorData** (testé le 24/11/2026) : seul client donnant un fichier lisible en entier.
   IOS / ANDROID répondent « OK » mais googlevideo refuse tout au-delà du 1er Mo (PO token exigé) → chaque URL est
   **sondée au milieu du fichier** avant d'être mise en cache.
3. Le Worker **relaie** les octets (les URL googlevideo sont liées à l'IP qui les a obtenues) et transmet `Range`
   → réponses **206** avec `Content-Range`, indispensables à Safari iOS (lecture, avance rapide).
4. Si YouTube bloque l'IP du Worker (« confirmez que vous n'êtes pas un robot »), le Worker bascule 10 min sur
   **l'extracteur dédié** (`EXTRACTOR_URL`), qui fait la même chose avec yt-dlp depuis une IP résidentielle.
5. Côté client : **une seule balise `<audio>` persistante** + `navigator.mediaSession` (titre, artiste, pochette,
   lecture/pause/suivant/précédent/position) → lecture continue écran verrouillé et en arrière-plan.
6. **Préchargement** : 4 s après le début d'un titre, le client demande 2 octets du suivant → le serveur résout et
   met en cache son URL, le lancement suivant est quasi instantané.

## Données (D1)

`users` (@pseudo unique, e-mail, PBKDF2, nom, avatar, thème) · `sessions` (une par appareil, hash du secret) ·
`otps` (codes hachés, 10 min, 5 essais, 5 envois) · `login_fails` (anti force brute) · `friends` (a → b, pending/accepted) ·
`playlists` (+ pochette, visibilité amis) · `playlist_tracks` · `playlist_shares` · `likes` · `history` (200 derniers).
Les métadonnées d'un titre sont copiées dans chaque ligne (JSON validé) : aucune table partagée qu'un utilisateur pourrait altérer.

## Sécurité

- Mot de passe : PBKDF2-SHA256 100 000 itérations + sel ; comparaison à temps constant ; même coût si compte inconnu.
- Session : cookie `HttpOnly; Secure; SameSite=Lax` (1 an) ; secret jamais stocké en clair ; changement / réinitialisation
  du mot de passe = autres appareils déconnectés.
- Anti-CSRF : toute écriture exige `Content-Type: application/json` et refuse une `Origin` étrangère.
- OTP : code haché, usage unique, 10 min, 5 essais, 5 demandes/h par e-mail, 20/h par IP (hachée), renvoi verrouillé.
  Mot de passe oublié : même réponse et même durée qu'un e-mail existe ou non. Brevo en panne → demande annulée.
- `BREVO_API_KEY` uniquement en secret Worker. `DEMO_OTP` n'agit que sur `localhost`.
- CSP stricte (`public/_headers`) : scripts et styles locaux uniquement, images YouTube seulement, aucune frame.
- Entrées client bornées : titres, images (data URL JPEG/PNG/WebP ≤ 300 Ko), identifiants YouTube.

## Thèmes (11)

| Id | Nom | Style |
| --- | --- | --- |
| `noir-oled` | Noir OLED Pur | noir absolu, accent rouge-rose (défaut) |
| `cover` | Cover Dynamique | couleurs extraites de la pochette en cours |
| `sakura-nuit` | Sakura Nuit | nuit prune, accent rose cerisier |
| `sakura-rose` | Sakura Rose | clair rose pâle, accent framboise |
| `rose-velours` | Rose Velours | bordeaux velours, accent rose ancien |
| `neon-rose` | Néon Rose | violet nuit, rose néon lumineux |
| `minuit-bleu` | Minuit Bleu | bleu nuit, accent bleu vif |
| `emeraude` | Émeraude Sombre | vert profond, accent émeraude |
| `ambre` | Ambre / Sunset | brun chaud, accent orange coucher de soleil |
| `violet` | Violet Crépuscule | indigo, accent lavande |
| `clair` | Blanc / Clair | gris clair iOS, accent rouge-rose |

Appliqués instantanément (variables CSS), enregistrés sur le compte, rejoués avant même la réponse du serveur.
Le fond du lecteur plein écran suit la pochette (réglable).

## Plan des fichiers

```
public/                 PWA servie telle quelle (aucun build)
  index.html            coquille + <audio> unique
  manifest.webmanifest  « Zeleph », standalone, icônes
  sw.js                 coquille hors ligne (jamais /api)
  _headers              CSP et en-têtes de sécurité
  css/app.css           une feuille, safe-areas iPhone 11 → 18
  js/app.js             démarrage, routes (#/…), onglets
  js/api.js             fetch même origine
  js/ui.js              h(), icônes SVG, lignes, cartes, feuilles, images
  js/player.js          <audio>, mediaSession, préchargement, favoris
  js/queue.js           file d'attente (logique pure, testée)
  js/nowplaying.js      mini-lecteur + plein écran (pochette, paroles, file)
  js/lrc.js             paroles LRC (testé)
  js/themes.js          thèmes (partagé avec le Worker)
  js/menu.js            menu « … » d'un titre
  js/views/             auth, browse (accueil, recherche, artiste, album), library, social, settings
worker/                 API Cloudflare
  index.js  routes      auth.js  comptes/OTP/sessions     mail.js  Brevo
  social.js amis        library.js playlists/favoris      yt.js    YouTube Music + résolution audio
  stream.js flux Range  lyrics.js LRCLIB                  cache.js cache 2 niveaux
  util.js   validations schema.sql D1
extractor/              extracteur dédié optionnel (Node + yt-dlp, Dockerfile)
test/                   unit, api (Worker réel + D1 simulée), live (réseau), extractor ; fixtures YouTube réelles
tools/                  check.mjs (syntaxe, secrets, PWA), icons.mjs (icônes PNG)
```

## Variables d'environnement

| Nom | Où | Rôle |
| --- | --- | --- |
| `BREVO_API_KEY` | secret Worker | envoi des codes OTP (jamais côté client) |
| `BREVO_SENDER_EMAIL` | `[vars]` | expéditeur validé chez Brevo |
| `BREVO_SENDER_NAME` | `[vars]` | nom affiché (« Zeleph ») |
| `EXTRACTOR_URL` | `[vars]` | optionnel : URL de l'extracteur dédié |
| `EXTRACTOR_TOKEN` | secret Worker + extracteur | jeton partagé (≥ 24 caractères) |
| `DEMO_OTP` | `.dev.vars` local | code affiché à l'écran, **localhost uniquement** |
| `DB` | binding D1 | base `zeleph` |
| `CACHE` | binding KV (optionnel) | cache des URL audio partagé entre data centers |

## Limites connues

- YouTube change régulièrement ses règles : si VISIONOS cesse de fonctionner, mettre à jour `CLIENTS` dans `worker/yt.js`
  (le test `npm run test:live` le détecte) ou s'appuyer sur l'extracteur (yt-dlp se met à jour à chaque build Docker).
- Les IP Cloudflare peuvent être bloquées par YouTube : prévoir l'extracteur pour un usage fiable.
- iOS ignore `audio.volume` : le curseur de volume n'apparaît que là où il fonctionne (sur iPhone : boutons physiques).
- Playlists YouTube : ~100 premiers titres (pas de pagination).
