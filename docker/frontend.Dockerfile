# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/
RUN npm install --workspace=frontend --include-workspace-root=false 2>/dev/null || \
    (cd frontend && npm install)

COPY frontend/ ./frontend/
# nginx proxies /api → backend; browser uses same-origin /api
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build -w frontend

# ---- Nginx serve stage ----
FROM nginx:1.27-alpine AS production

RUN apk add --no-cache wget

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
