/**
 * @fileoverview PinkPath Backend Server
 * Fastify-based API server for the PinkPath safety navigation app
 *
 * SECURITY: This file implements production-grade security measures.
 * Do not modify security configurations without review.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import dotenv from 'dotenv';

// Load environment variables
// In Docker: env vars come from docker-compose
// Locally: load from .env file in project root
if (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL) {
  dotenv.config({ path: '../../.env' });
}

// Import routes
import authRoutes from './routes/auth.js';
import routeRoutes from './routes/routes.js';
import userRoutes from './routes/users.js';
import safetyRoutes from './routes/safety.js';
import ratingsRoutes from './routes/ratings.js';

// Import database
import { initializeDatabase, closeDatabase } from './db/connection.js';

// ==============================================
// ENVIRONMENT VALIDATION
// ==============================================

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Validate required environment variables in production
 * Fails fast if critical security configs are missing
 */
function validateEnvironment() {
  const required = [
    'JWT_SECRET',
    'SESSION_SECRET',
    'FRONTEND_URL',
    'DATABASE_URL',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (!isDev && missing.length > 0) {
    console.error('FATAL: Missing required environment variables:', missing.join(', '));
    console.error('Server cannot start in production without these security configurations.');
    process.exit(1);
  }

  // Warn about weak secrets even in development
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('WARNING: JWT_SECRET should be at least 32 characters for security');
  }
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    console.warn('WARNING: SESSION_SECRET should be at least 32 characters for security');
  }
}

validateEnvironment();

// ==============================================
// SERVER CONFIGURATION
// ==============================================

/**
 * Create and configure Fastify server instance
 */
const server = Fastify({
  logger: {
    level: isDev ? 'info' : 'warn',
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  },
  // Security: Limit request body size
  bodyLimit: 1048576, // 1MB max
});

// ==============================================
// SECURITY PLUGINS
// ==============================================

/**
 * Register Helmet for security headers
 * Sets various HTTP headers to protect against common attacks
 */
await server.register(helmet, {
  contentSecurityPolicy: isDev ? false : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    },
  },
  // Allow cross-origin requests (handled by CORS)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

/**
 * Register Rate Limiting to prevent abuse
 * Different limits for different endpoint types
 */
await server.register(rateLimit, {
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  // Skip rate limiting for health checks
  allowList: (request) => request.url === '/health',
  // Add rate limit headers to responses
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
  },
  // Custom error response
  errorResponseBuilder: (request, context) => ({
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    code: 'RATE_001',
  }),
});

/**
 * Register CORS for frontend communication
 * SECURITY: Strict origin validation in production
 */
await server.register(cors, {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow localhost variations
    if (isDev) {
      const devAllowed = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
      ];
      if (devAllowed.includes(origin)) {
        return callback(null, true);
      }
    }

    // In production, only allow configured frontend URL
    const allowedOrigin = process.env.FRONTEND_URL;
    if (allowedOrigin && (origin === allowedOrigin || allowedOrigin === '*')) {
      return callback(null, true);
    }

    // Reject unknown origins
    callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

/**
 * Register cookie support for sessions
 * SECURITY: Strict cookie settings in production
 */
await server.register(cookie, {
  secret: process.env.SESSION_SECRET || (isDev ? 'dev-session-secret-not-for-production' : undefined),
  hook: 'onRequest',
  parseOptions: {
    httpOnly: true,
    secure: !isDev, // HTTPS only in production
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
});

/**
 * Register JWT for authentication tokens
 * SECURITY: No default secret - must be configured
 */
await server.register(jwt, {
  secret: process.env.JWT_SECRET || (isDev ? 'dev-jwt-secret-not-for-production' : undefined),
  sign: {
    expiresIn: isDev ? '7d' : '1d', // Shorter expiration in production
  },
});

// ==============================================
// AUTHENTICATION DECORATOR
// ==============================================

/**
 * Decorator to verify JWT tokens on protected routes
 * SECURITY: Returns immediately on auth failure to prevent bypass
 */
server.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token',
      code: 'AUTH_002',
    });
  }
});

// ==============================================
// HEALTH CHECK
// ==============================================

/**
 * Health check endpoint for monitoring
 */
server.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };
});

/**
 * API info endpoint
 */
server.get('/api', async (request, reply) => {
  return {
    name: 'PinkPath API',
    version: '1.0.0',
    description: 'Safety navigation API for pedestrians',
    endpoints: {
      health: '/health',
      auth: '/api/auth/*',
      routes: '/api/routes/*',
      users: '/api/users/*',
      safety: '/api/safety/*',
      ratings: '/api/ratings/*',
    },
  };
});

// ==============================================
// ROUTE REGISTRATION
// ==============================================

/**
 * Register all API routes with /api prefix
 */
await server.register(authRoutes, { prefix: '/api/auth' });
await server.register(routeRoutes, { prefix: '/api/routes' });
await server.register(userRoutes, { prefix: '/api/users' });
await server.register(safetyRoutes, { prefix: '/api/safety' });
await server.register(ratingsRoutes, { prefix: '/api/ratings' });

// ==============================================
// ERROR HANDLING
// ==============================================

/**
 * Global error handler
 * SECURITY: Sanitize error messages in production
 */
server.setErrorHandler(function (error, request, reply) {
  server.log.error(error);

  // Handle rate limit errors
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: 'Too Many Requests',
      message: error.message,
    });
  }

  // Handle validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: error.message,
      // Only show validation details in development
      ...(isDev && { details: error.validation }),
    });
  }

  // Handle known errors
  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      error: error.name || 'Error',
      message: error.message,
    });
  }

  // Handle unknown errors - never expose internal details in production
  return reply.status(500).send({
    error: 'Internal Server Error',
    message: isDev ? error.message : 'An unexpected error occurred',
  });
});

/**
 * Not found handler
 */
server.setNotFoundHandler(function (request, reply) {
  reply.status(404).send({
    error: 'Not Found',
    message: `Route ${request.method} ${request.url} not found`,
  });
});

// ==============================================
// SERVER STARTUP
// ==============================================

/**
 * Start the server
 */
async function start() {
  try {
    // Initialize database connection (optional in dev mode)
    try {
      await initializeDatabase();
      server.log.info('Database connected successfully');
    } catch (dbError) {
      if (isDev) {
        server.log.warn('Database not available - running without DB features');
        server.log.warn('To enable database: set DATABASE_URL in .env and start PostgreSQL');
      } else {
        throw dbError; // In production, database is required
      }
    }

    // Start listening
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    server.log.info(`Server running at http://${host}:${port}`);
    server.log.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    server.log.info(`Rate limiting: ${process.env.RATE_LIMIT_MAX || 100} requests per ${(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)) / 1000}s`);

    if (isDev) {
      server.log.info(`API docs: http://localhost:${port}/api`);
      server.log.warn('Running in DEVELOPMENT mode - some security features relaxed');
    }

  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  server.log.info('Shutting down server...');

  try {
    await server.close();
    await closeDatabase();
    server.log.info('Server shutdown complete');
    process.exit(0);
  } catch (err) {
    server.log.error('Error during shutdown:', err);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
start();

export default server;
