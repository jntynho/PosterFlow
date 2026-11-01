# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build && npm prune --omit=dev --offline --no-audit --no-fund

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node src/config.js ./src/config.js
COPY --chown=node:node server ./server
USER node
EXPOSE 3000
CMD ["node", "--use-env-proxy", "server/index.js"]
