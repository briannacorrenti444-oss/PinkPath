# ==============================================
# PinkPath Backend Dockerfile
# Multi-stage build for security and size optimization
# ==============================================

# ----------------------------------------------
# Stage 1: Dependencies
# ----------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies for bcrypt native module
RUN apk add --no-cache python3 make g++

# Copy package files from backend
COPY backend/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ----------------------------------------------
# Stage 2: Production
# ----------------------------------------------
FROM node:20-alpine AS production

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S pinkpath -u 1001

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy shared package first
COPY --chown=pinkpath:nodejs shared /app/node_modules/@pinkpath/shared

# Copy backend application code
COPY --chown=pinkpath:nodejs backend/src ./src
COPY --chown=pinkpath:nodejs backend/package.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Switch to non-root user
USER pinkpath

# Start server
CMD ["node", "src/server.js"]
