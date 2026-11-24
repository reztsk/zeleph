# Extracteur audio Zeleph : Node 22 + yt-dlp (version zipapp Python, mise à jour à chaque build).
FROM node:22-alpine
RUN apk add --no-cache python3 ca-certificates \
 && wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp
WORKDIR /app
COPY server.mjs .
USER node
ENV PORT=8788
EXPOSE 8788
CMD ["node", "server.mjs"]
