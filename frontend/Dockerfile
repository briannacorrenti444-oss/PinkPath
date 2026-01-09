# ==============================================
# PinkPath Frontend Dockerfile
# Nginx-based static file server
# ==============================================

FROM nginx:alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy static files
COPY . /usr/share/nginx/html

# Remove unnecessary files from container
RUN rm -f /usr/share/nginx/html/Dockerfile \
    /usr/share/nginx/html/.dockerignore \
    /usr/share/nginx/html/nginx.conf \
    /usr/share/nginx/html/package*.json \
    /usr/share/nginx/html/jest.config.js
RUN rm -rf /usr/share/nginx/html/node_modules \
    /usr/share/nginx/html/tests

# Expose port
EXPOSE 3000

# Health check using curl (more reliable in alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
