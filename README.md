# Zeleph

Lecteur musical **PWA ultra léger pour iPhone** (iPhone 11 → 18), 100 % en français :
audio YouTube **sans pub et sans clip**, lecture **écran verrouillé**, playlists façon Apple Music, paroles
synchronisées, file d'attente, amis par `@pseudo`, 11 thèmes (dont Sakura / rosés).

- Frontend : HTML/CSS/JS natifs, zéro dépendance, zéro build, zéro Electron (57 Ko au total).
- Backend : un Worker Cloudflare (API + fichiers) + D1. E-mails OTP via Brevo.
- Détails techniques : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Fonctionnalités

- **Compte** : création avec `@pseudo` unique (disponibilité en direct), e-mail, mot de passe ; activation par code à
  6 chiffres envoyé par e-mail (Brevo, 10 min) ; mot de passe oublié par code ; session persistante multi-appareils.
- **Accueil** : écoutés récemment, « Dans ton style » (sons similaires), playlists des amis, sélections YouTube Music.
- **Recherche** : titres, artistes, albums, playlists.
- **Bibliothèque** : titres likés, playlists avec photo perso, recherche interne, Lire / Aléatoire, partage aux amis,
  visibilité sur le profil.
- **Lecteur** : mini-lecteur, plein écran (fond couleur de la pochette), paroles synchronisées (touche = saut),
  file « À suivre » + « Poursuivre la lecture » (monter, descendre, en premier, retirer, mélanger).
- **Menu « … »** : lire ensuite, ajouter à la file, favori, ajouter à une playlist, aller à l'artiste / l'album,
  supprimer de la playlist.
- **Amis** : recherche `@pseudo`, demandes (accepter / refuser), profils et playlists partagées.
- **Réglages** : avatar, nom, mot de passe, thèmes, fond du lecteur, déconnexion.

## Lancer en local

```bash
npm install
cp .env.example .dev.vars        # garder DEMO_OTP=1 : le code s'affiche à l'écran (localhost uniquement)
npm run db:init                  # crée les tables D1 locales
npm run dev                      # http://localhost:8787
```

## Tests

```bash
npm test                 # contrôles statiques + 10 tests unitaires + 11 tests API (Worker réel, D1 simulée)
npm run test:live        # réseau réel : recherche, flux M4A (début + milieu), paroles
npm run test:extractor   # extracteur dédié (YTDLP=chemin/vers/yt-dlp)
npm run build            # compilation Cloudflare à blanc (wrangler --dry-run)
```

## Déployer sur Cloudflare

1. `npx wrangler login`
2. `npx wrangler d1 create zeleph` → copier `database_id` dans `wrangler.toml`.
3. (Recommandé) `npx wrangler kv namespace create CACHE` → décommenter le bloc `kv_namespaces` avec l'id.
4. Brevo : valider un expéditeur, le mettre dans `BREVO_SENDER_EMAIL` (`wrangler.toml`), puis
   `npx wrangler secret put BREVO_API_KEY`.
5. `npm run db:init:remote`
6. `npm run deploy` → l'adresse `https://zeleph.<ton-sous-domaine>.workers.dev` s'affiche
   (ou ajouter un domaine perso dans le tableau de bord Cloudflare).

### Extracteur dédié (indispensable : YouTube bloque les IP Cloudflare)

**Sur un VPS** (Debian 12 / Ubuntu 22.04+, 1 vCPU / 1 Go suffisent), en une commande, HTTPS automatique sans DNS :

```bash
scp extractor/server.mjs extractor/install.sh root@IP_DU_VPS:/root/
ssh root@IP_DU_VPS 'EXTRACTOR_TOKEN=<longue-chaine-aleatoire> bash /root/install.sh'
```

Le script installe Node, yt-dlp (mis à jour chaque jour), un service systemd et Caddy (Let's Encrypt sur
`<ip-avec-tirets>.sslip.io`, ou sur ton domaine passé en argument). Il affiche l'URL à mettre dans `EXTRACTOR_URL`.

**Avec Docker** (PC ou serveur) :

```bash
cd extractor
docker build -t zeleph-extractor .
docker run -d --restart unless-stopped -e EXTRACTOR_TOKEN=<longue-chaine-aleatoire> -p 8788:8788 zeleph-extractor
cloudflared tunnel --url http://localhost:8788     # ou un tunnel nommé sur ton domaine
```

Sans Docker, sous Windows (Node + yt-dlp.exe) :

```powershell
$env:EXTRACTOR_TOKEN="<longue-chaine-aleatoire>"; $env:YTDLP="C:\chemin\yt-dlp.exe"; node extractor/server.mjs
```

Puis côté Worker : `EXTRACTOR_URL` dans `[vars]` et `npx wrangler secret put EXTRACTOR_TOKEN` (même valeur).

> Constaté le 24/11/2026 : depuis les IP Cloudflare, la recherche YouTube Music fonctionne mais la lecture est refusée
> (« confirmez que vous n'êtes pas un robot »). **En production, l'extracteur est indispensable pour lire la musique.**

## Partager avec tes amis

Envoie l'adresse du Worker. Sur iPhone : ouvrir dans **Safari** → bouton **Partager** → **Sur l'écran d'accueil**.
L'icône « Zeleph » s'ouvre en plein écran comme une app ; chacun crée son compte et t'ajoute avec ton `@pseudo`.

## Avertissement

Projet personnel. Le flux provient de YouTube : respecte les conditions d'utilisation de YouTube et les droits
des artistes.
