#!/usr/bin/env bash
# Installation de l'extracteur audio Zeleph sur un VPS Debian 12 / Ubuntu 22.04+ (root).
#   scp extractor/server.mjs extractor/install.sh root@IP:/root/
#   ssh root@IP 'EXTRACTOR_TOKEN=<longue-chaine> bash /root/install.sh'            # HTTPS via <ip>.sslip.io
#   ssh root@IP 'EXTRACTOR_TOKEN=<longue-chaine> bash /root/install.sh mon.domaine.fr'   # ou ton domaine (DNS A → IP)
# Résultat : service systemd « zeleph-extractor » (127.0.0.1:8788), Caddy en HTTPS devant, yt-dlp mis à jour chaque jour.
set -euo pipefail

TOKEN="${EXTRACTOR_TOKEN:?EXTRACTOR_TOKEN manquant (24 caractères min.)}"
[ "${#TOKEN}" -ge 24 ] || { echo "EXTRACTOR_TOKEN trop court (24 caractères min.)"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "À lancer en root"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/server.mjs" ] || { echo "server.mjs introuvable à côté de install.sh"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q curl ca-certificates python3 caddy

# Node 22 (yt-dlp s'en sert comme moteur JavaScript pour YouTube ; Node des dépôts souvent trop ancien)
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource.sh
  bash /tmp/nodesource.sh && apt-get install -y -q nodejs
fi

# yt-dlp (version zipapp officielle, mise à jour quotidienne par minuterie systemd)
curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod 755 /usr/local/bin/yt-dlp

# Application + utilisateur système sans shell
id zeleph >/dev/null 2>&1 || useradd --system --home /opt/zeleph-extractor --shell /usr/sbin/nologin zeleph
install -d -o root -g root -m 755 /opt/zeleph-extractor
install -o root -g root -m 644 "$HERE/server.mjs" /opt/zeleph-extractor/server.mjs
umask 077
cat > /etc/zeleph-extractor.env <<EOF
EXTRACTOR_TOKEN=$TOKEN
HOST=127.0.0.1
PORT=8788
YTDLP=/usr/local/bin/yt-dlp
YTDLP_ARGS=--extractor-args youtube:player_client=visionos
EOF
umask 022

cat > /etc/systemd/system/zeleph-extractor.service <<'EOF'
[Unit]
Description=Extracteur audio Zeleph
After=network-online.target
Wants=network-online.target

[Service]
User=zeleph
EnvironmentFile=/etc/zeleph-extractor.env
WorkingDirectory=/opt/zeleph-extractor
ExecStart=/usr/bin/node /opt/zeleph-extractor/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
CacheDirectory=zeleph-extractor
Environment=XDG_CACHE_HOME=/var/cache/zeleph-extractor

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/yt-dlp-update.service <<'EOF'
[Unit]
Description=Mise à jour de yt-dlp
[Service]
Type=oneshot
ExecStart=/usr/local/bin/yt-dlp -U
ExecStartPost=/bin/systemctl restart zeleph-extractor
EOF
cat > /etc/systemd/system/yt-dlp-update.timer <<'EOF'
[Unit]
Description=Mise à jour quotidienne de yt-dlp
[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true
[Install]
WantedBy=timers.target
EOF

# HTTPS automatique (Let's Encrypt) : domaine fourni, sinon <ip-avec-tirets>.sslip.io (aucun DNS à configurer)
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  IP="$(curl -fsS4 https://api.ipify.org)"
  DOMAIN="${IP//./-}.sslip.io"
fi
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  reverse_proxy 127.0.0.1:8788
}
EOF

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp; ufw allow 443/tcp; fi

systemctl daemon-reload
systemctl enable --now zeleph-extractor yt-dlp-update.timer
systemctl restart caddy

for i in $(seq 1 30); do curl -fsS "http://127.0.0.1:8788/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:8788/health" >/dev/null || { journalctl -u zeleph-extractor -n 30 --no-pager; exit 1; }
CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'Range: bytes=0-1023' http://127.0.0.1:8788/audio/kJQP7kiw5Fk)"
echo
echo "Extracteur prêt : https://$DOMAIN   (test local audio : HTTP $CODE, attendu 206)"
echo "Côté Worker : EXTRACTOR_URL = \"https://$DOMAIN\" dans wrangler.toml + npx wrangler secret put EXTRACTOR_TOKEN"
