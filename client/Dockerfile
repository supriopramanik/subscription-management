# Build context must be the repository root.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --workspace=client --include-workspace-root=false
COPY client client
RUN npm run build -w client

FROM nginxinc/nginx-unprivileged:1.28-alpine
USER root
RUN apk add --no-cache ca-certificates
USER nginx
ENV BACKEND_URL=http://server:4000
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
