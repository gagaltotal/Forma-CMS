# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# devDependencies (esbuild, tailwindcss) WAJIB ada saat build; di-prune setelah build selesai.
RUN npm ci
COPY tsconfig.json ./
COPY tailwind.config.mjs ./
COPY src ./src
COPY admin ./admin
COPY scripts ./scripts
COPY docs ./docs
# build:server (tsc) + build:admin (esbuild + Tailwind landing.css) sebelum prune.
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
# Pengguna non-root; data (SQLite + upload) di volume terpisah.
RUN mkdir -p /data/uploads && chown -R node:node /data
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY --chown=root:root package.json ./
ENV SQLITE_PATH=/data/forma.db UPLOAD_DIR=/data/uploads
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
