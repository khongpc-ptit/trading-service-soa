# ========================================================
# Dockerfile for Trading Service (Multi-Stage Build)
# Complies with BA-SOA §19 (Node 22, Port 8083)
# ========================================================

# --------------------------------------------------------
# Stage 1: Build & Compile TypeScript
# --------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install native dependencies required by Prisma engine on Alpine
RUN apk add --no-cache openssl libc6-compat

# Copy package manifests and build configuration
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# Install full dependencies (including TypeScript and devDependencies)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY src ./src/

# Compile TypeScript and rewrite path aliases (@share/*, @modules/*)
RUN npm run build

# --------------------------------------------------------
# Stage 2: Production Runtime
# --------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime dependencies for Prisma on Alpine
RUN apk add --no-cache openssl libc6-compat

# Environment defaults
ENV NODE_ENV=production
ENV SERVER_PORT=8083

# Copy package manifests and Prisma schema for production
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# Install production-only dependencies
RUN npm ci --omit=dev

# Generate Prisma Client for the production environment
RUN npx prisma generate

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Create keys folder placeholder for RS256 JWT public key mount
RUN mkdir -p /app/keys

# Set permissions for non-root user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose Trading Service port
EXPOSE 8083

# Start the application
CMD ["node", "dist/index.js"]
