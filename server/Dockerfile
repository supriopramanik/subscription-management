# Build context must be the repository root.
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=4000 COOKIE_SECURE=true
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace=server --include-workspace-root=false && npm cache clean --force
COPY --chown=node:node server/src server/src
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
