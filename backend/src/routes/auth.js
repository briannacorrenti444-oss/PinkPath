/**
 * @fileoverview Authentication Routes
 * Handles user registration, login, and OAuth flows
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from '../db/connection.js';
import { authConfig } from '../config/index.js';

// SECURITY: In-memory store for OAuth state tokens
// In production with multiple instances, use Redis instead
const oauthStateStore = new Map();
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a secure OAuth state token
 * @returns {string} Secure random state token
 */
function generateOAuthState() {
  const state = crypto.randomBytes(32).toString('hex');
  oauthStateStore.set(state, Date.now());
  return state;
}

/**
 * Validate an OAuth state token
 * @param {string} state - State token to validate
 * @returns {boolean} True if valid and not expired
 */
function validateOAuthState(state) {
  const timestamp = oauthStateStore.get(state);
  if (!timestamp) return false;

  // Check expiry
  if (Date.now() - timestamp > STATE_EXPIRY_MS) {
    oauthStateStore.delete(state);
    return false;
  }

  // Use once - delete after validation
  oauthStateStore.delete(state);
  return true;
}

// Cleanup expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, timestamp] of oauthStateStore.entries()) {
    if (now - timestamp > STATE_EXPIRY_MS) {
      oauthStateStore.delete(state);
    }
  }
}, 60000); // Every minute

/**
 * Auth routes plugin for Fastify
 * @param {FastifyInstance} fastify - Fastify instance
 */
export default async function authRoutes(fastify) {

  // ==============================================
  // LOCAL AUTHENTICATION
  // ==============================================

  /**
   * POST /api/auth/register
   * Register a new user with email/password
   */
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          username: { type: 'string', minLength: 3, maxLength: 100 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, username } = request.body;

    try {
      // Check if user already exists
      const existing = await query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existing.rows.length > 0) {
        return reply.status(409).send({
          error: 'User already exists',
          message: 'An account with this email already exists',
          code: 'USER_002',
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, authConfig.bcryptRounds);

      // Create user
      const result = await query(
        `INSERT INTO users (email, password_hash, username, subscription_level)
         VALUES ($1, $2, $3, 'free')
         RETURNING id, email, username, subscription_level, created_at`,
        [email.toLowerCase(), passwordHash, username]
      );

      const user = result.rows[0];

      // Create default safety preferences
      await query(
        'INSERT INTO safety_preferences (user_id) VALUES ($1)',
        [user.id]
      );

      // Generate JWT token
      const token = fastify.jwt.sign({
        id: user.id,
        email: user.email,
        subscription: user.subscription_level,
      });

      return reply.status(201).send({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          subscriptionLevel: user.subscription_level,
        },
        token,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Registration failed',
        message: 'An error occurred during registration',
      });
    }
  });

  /**
   * POST /api/auth/login
   * Login with email/password
   */
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;

    try {
      // Find user
      const result = await query(
        `SELECT id, email, username, password_hash, subscription_level, is_active
         FROM users WHERE email = $1`,
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
          code: 'AUTH_001',
        });
      }

      const user = result.rows[0];

      // Check if user has password (might be OAuth-only)
      if (!user.password_hash) {
        return reply.status(401).send({
          error: 'Invalid login method',
          message: 'This account uses Google login. Please sign in with Google.',
          code: 'AUTH_001',
        });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
          code: 'AUTH_001',
        });
      }

      // Check if account is active
      if (!user.is_active) {
        return reply.status(403).send({
          error: 'Account disabled',
          message: 'This account has been disabled',
          code: 'AUTH_003',
        });
      }

      // Update last login
      await query(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      // Generate JWT token
      const token = fastify.jwt.sign({
        id: user.id,
        email: user.email,
        subscription: user.subscription_level,
      });

      return reply.send({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          subscriptionLevel: user.subscription_level,
        },
        token,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Login failed',
        message: 'An error occurred during login',
      });
    }
  });

  // ==============================================
  // GOOGLE OAUTH
  // ==============================================

  /**
   * GET /api/auth/google
   * Initiate Google OAuth flow
   * Redirects to Google's OAuth consent page
   * SECURITY: Uses cryptographically secure state parameter
   */
  fastify.get('/google', async (request, reply) => {
    const { clientId } = authConfig.google;

    if (!clientId) {
      return reply.status(503).send({
        error: 'OAuth not configured',
        message: 'Google OAuth is not configured on this server',
      });
    }

    const redirectUri = encodeURIComponent(authConfig.google.callbackUrl);
    const scope = encodeURIComponent('email profile');
    // SECURITY: Generate cryptographically secure state token
    const state = generateOAuthState();

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&state=${state}` +
      `&access_type=offline` +
      `&prompt=consent`;

    return reply.redirect(googleAuthUrl);
  });

  /**
   * GET /api/auth/google/callback
   * Handle Google OAuth callback
   * SECURITY: Validates state parameter to prevent CSRF attacks
   */
  fastify.get('/google/callback', async (request, reply) => {
    const { code, error, state } = request.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (error) {
      return reply.redirect(`${frontendUrl}/auth/callback?error=${error}`);
    }

    // SECURITY: Validate state parameter to prevent CSRF
    if (!state || !validateOAuthState(state)) {
      fastify.log.warn('OAuth callback with invalid state parameter');
      return reply.redirect(`${frontendUrl}/auth/callback?error=invalid_state`);
    }

    if (!code) {
      return reply.status(400).send({
        error: 'Missing authorization code',
        message: 'No authorization code received from Google',
      });
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: authConfig.google.clientId,
          client_secret: authConfig.google.clientSecret,
          redirect_uri: authConfig.google.callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (!tokens.access_token) {
        throw new Error('Failed to get access token');
      }

      // Get user info from Google
      const userInfoResponse = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );

      const googleUser = await userInfoResponse.json();

      // Find or create user
      let user;
      const existingUser = await query(
        'SELECT * FROM users WHERE google_id = $1 OR email = $2',
        [googleUser.id, googleUser.email]
      );

      if (existingUser.rows.length > 0) {
        // Update existing user with Google ID if needed
        user = existingUser.rows[0];
        if (!user.google_id) {
          await query(
            'UPDATE users SET google_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [googleUser.id, user.id]
          );
        }
        // Update last login
        await query(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );
      } else {
        // Create new user
        const result = await query(
          `INSERT INTO users (email, google_id, username, subscription_level)
           VALUES ($1, $2, $3, 'free')
           RETURNING *`,
          [googleUser.email, googleUser.id, googleUser.name || googleUser.email.split('@')[0]]
        );
        user = result.rows[0];

        // Create default safety preferences
        await query(
          'INSERT INTO safety_preferences (user_id) VALUES ($1)',
          [user.id]
        );
      }

      // Generate JWT token
      const token = fastify.jwt.sign({
        id: user.id,
        email: user.email,
        subscription: user.subscription_level,
      });

      // Redirect to frontend with token
      // Note: Token in URL is standard for OAuth callbacks, but ensure HTTPS in production
      return reply.redirect(`${frontendUrl}/auth/callback?token=${token}`);

    } catch (error) {
      fastify.log.error('Google OAuth error:', error);
      return reply.redirect(`${frontendUrl}/auth/callback?error=oauth_failed`);
    }
  });

  // ==============================================
  // TOKEN MANAGEMENT
  // ==============================================

  /**
   * GET /api/auth/me
   * Get current user info from JWT token
   */
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const result = await query(
        `SELECT id, email, username, subscription_level, created_at, last_login_at
         FROM users WHERE id = $1`,
        [request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'User not found',
          message: 'User account no longer exists',
          code: 'USER_001',
        });
      }

      const user = result.rows[0];

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          subscriptionLevel: user.subscription_level,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at,
        },
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get user info',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/auth/refresh
   * Refresh JWT token
   */
  fastify.post('/refresh', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      // Generate new token
      const token = fastify.jwt.sign({
        id: request.user.id,
        email: request.user.email,
        subscription: request.user.subscription,
      });

      return reply.send({
        message: 'Token refreshed',
        token,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to refresh token',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Logout (client should discard token)
   */
  fastify.post('/logout', async (request, reply) => {
    // JWT tokens are stateless, so we just return success
    // Client is responsible for discarding the token
    return reply.send({
      message: 'Logged out successfully',
    });
  });
}
