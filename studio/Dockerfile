FROM node:22-alpine AS web-build

ARG VITE_BRIDGE_ORIGIN=http://127.0.0.1:4174
ENV VITE_BRIDGE_ORIGIN=$VITE_BRIDGE_ORIGIN
WORKDIR /build

COPY studio/web/package.json studio/web/package-lock.json ./
RUN npm ci

COPY studio/web/ ./
RUN npm run build

FROM node:22-alpine AS runtime

ENV AIPHONE_STATIC_ONLY=1 \
    AIPHONE_STUDIO_HOST=0.0.0.0 \
    AIPHONE_STUDIO_PORT=4173 \
    NODE_ENV=production
WORKDIR /app

COPY studio/host/package.json studio/host/package-lock.json ./host/
RUN cd host && npm ci --omit=dev
COPY studio/host/*.mjs ./host/
COPY --from=web-build /build/dist/ ./web/dist/

USER node
EXPOSE 4173
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "host/server.mjs", "--static-only"]
