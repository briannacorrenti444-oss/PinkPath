/**
 * @fileoverview PinkPath Backend Server
 * Fastify-based API server for the PinkPath safety navigation app
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
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

// Import database
import { initializeDatabase, closeDatabase } from './db/connection.js';

// ==============================================
// SERVER CONFIGURATION
// ==============================================

const isDev = process.env.NODE_ENV !== 'production';

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
});

// ==============================================
// PLUGINS & MIDDLEWARE
// ==============================================

/**
 * Register CORS for frontend communication
 * In development, allow all origins for mobile testing
 */
await server.register(cors, {
  origin: process.env.FRONTEND_URL === '*' ? true : (process.env.FRONTEND_URL || 'http://localhost:3000'),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
});

/**
 * Register cookie support for sessions
 */
await server.register(cookie, {
  secret: process.env.SESSION_SECRET || 'development-session-secret',
  hook: 'onRequest',
});

/**
 * Register JWT for authentication tokens
 */
await server.register(jwt, {
  secret: process.env.JWT_SECRET || 'development-jwt-secret-change-in-production',
  sign: {
    expiresIn: '7d', // Tokens expire in 7 days
  },
});

// ==============================================
// AUTHENTICATION DECORATOR
// ==============================================

/**
 * Decorator to verify JWT tokens on protected routes
 */
server.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({
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

// ==============================================
// ERROR HANDLING
// ==============================================

/**
 * Global error handler
 */
server.setErrorHandler(function (error, request, reply) {
  server.log.error(error);

  // Handle validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: error.message,
      details: error.validation,
    });
  }

  // Handle known errors
  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      error: error.name || 'Error',
      message: error.message,
    });
  }

  // Handle unknown errors
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

    if (isDev) {
      server.log.info(`API docs: http://localhost:${port}/api/health`);
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
