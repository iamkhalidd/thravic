# ──────────────────────────────────────────────
# Stage 1: Build
# ──────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package*.json ./
COPY tsconfig.json ./

# Copy server package files
COPY apps/server/package*.json ./apps/server/
COPY apps/server/tsconfig.json ./apps/server/

# Install dependencies (using root workspace context)
RUN npm install

# Copy source code
COPY apps/server/src ./apps/server/src

# Build the app
RUN npm run build -w apps/server

# ──────────────────────────────────────────────
# Stage 2: Production
# ──────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S trackflow -u 1001

COPY --from=builder /app/apps/server/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist

USER trackflow

EXPOSE 3001

CMD ["node", "dist/index.js"]
