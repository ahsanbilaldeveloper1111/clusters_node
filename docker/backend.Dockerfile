# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
RUN npm install --workspace=backend --include-workspace-root=false 2>/dev/null || \
    (cd backend && npm install)

COPY backend/ ./backend/
RUN npm run build -w backend

# ---- Production stage ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget \
  && addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
RUN npm install --workspace=backend --omit=dev --include-workspace-root=false 2>/dev/null || \
    (cd backend && npm install --omit=dev)

COPY --from=builder /app/backend/dist ./backend/dist
COPY database/ ./database/

USER nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "backend/dist/cluster/primary.js"]
