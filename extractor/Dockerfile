# Extracteur audio Zeleph : Node (lance server.mjs, sert aussi de moteur JS à yt-dlp) + python3 + ffmpeg
# + yt-dlp[default] (inclut les scripts de défis JS « ejs »), mis à jour à chaque build via pip.
# Écoute sur 8080 ; GET /health → "ok". EXTRACTOR_TOKEN (24 car. min.) à passer à l'exécution, jamais dans l'image.
FROM node:22-alpine
RUN apk add --no-cache python3 py3-pip ffmpeg ca-certificates \
 && pip install --no-cache-dir --break-system-packages -U "yt-dlp[default]" \
 && yt-dlp --version
WORKDIR /app
COPY server.mjs .
USER node
ENV PORT=8080 HOST=0.0.0.0
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server.mjs"]
