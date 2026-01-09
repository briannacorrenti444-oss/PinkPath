/**
 * @fileoverview User Management Routes
 * API endpoints for user profile, preferences, and contacts
 */

import bcrypt from 'bcrypt';
import { query } from '../db/connection.js';
import { authConfig } from '../config/index.js';

/**
 * User routes plugin for Fastify
 * @param {FastifyInstance} fastify - Fastify instance
 */
export default async function userRoutes(fastify) {

  // All user routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // ==============================================
  // PROFILE MANAGEMENT
  // ==============================================

  /**
   * GET /api/users/profile
   * Get current user's profile
   */
  fastify.get('/profile', async (request, reply) => {
    try {
      const result = await query(
        `SELECT id, email, username, subscription_level, created_at, last_login_at
         FROM users WHERE id = $1`,
        [request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'User not found',
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
        error: 'Failed to get profile',
        message: 'An error occurred',
      });
    }
  });

  /**
   * PATCH /api/users/profile
   * Update current user's profile
   */
  fastify.patch('/profile', {
    schema: {
      body: {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 100 },
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const { username, email } = request.body;

    try {
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (username) {
        updates.push(`username = $${paramIndex++}`);
        values.push(username);
      }

      if (email) {
        // Check if email is already taken
        const existing = await query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [email.toLowerCase(), request.user.id]
        );

        if (existing.rows.length > 0) {
          return reply.status(409).send({
            error: 'Email already in use',
            code: 'USER_002',
          });
        }

        updates.push(`email = $${paramIndex++}`);
        values.push(email.toLowerCase());
      }

      if (updates.length === 0) {
        return reply.status(400).send({
          error: 'No updates provided',
        });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(request.user.id);

      const result = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
         RETURNING id, email, username, subscription_level`,
        values
      );

      return reply.send({
        message: 'Profile updated',
        user: result.rows[0],
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to update profile',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/users/change-password
   * Change user's password
   */
  fastify.post('/change-password', {
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;

    try {
      // Get current password hash
      const result = await query(
        'SELECT password_hash FROM users WHERE id = $1',
        [request.user.id]
      );

      if (!result.rows[0].password_hash) {
        return reply.status(400).send({
          error: 'Cannot change password',
          message: 'This account uses Google login and has no password',
        });
      }

      // Verify current password
      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

      if (!valid) {
        return reply.status(401).send({
          error: 'Invalid password',
          message: 'Current password is incorrect',
        });
      }

      // Hash and update new password
      const newHash = await bcrypt.hash(newPassword, authConfig.bcryptRounds);

      await query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newHash, request.user.id]
      );

      return reply.send({
        message: 'Password changed successfully',
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to change password',
        message: 'An error occurred',
      });
    }
  });

  // ==============================================
  // SAFETY PREFERENCES
  // ==============================================

  /**
   * GET /api/users/preferences
   * Get user's safety preferences
   */
  fastify.get('/preferences', async (request, reply) => {
    try {
      const result = await query(
        'SELECT * FROM safety_preferences WHERE user_id = $1',
        [request.user.id]
      );

      if (result.rows.length === 0) {
        // Create default preferences
        const newPrefs = await query(
          `INSERT INTO safety_preferences (user_id)
           VALUES ($1)
           RETURNING *`,
          [request.user.id]
        );
        return reply.send({ preferences: newPrefs.rows[0] });
      }

      return reply.send({ preferences: result.rows[0] });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get preferences',
        message: 'An error occurred',
      });
    }
  });

  /**
   * PUT /api/users/preferences
   * Update user's safety preferences
   */
  fastify.put('/preferences', {
    schema: {
      body: {
        type: 'object',
        properties: {
          crimeWeight: { type: 'number', minimum: 0, maximum: 1 },
          realtimeCrimeWeight: { type: 'number', minimum: 0, maximum: 1 },
          lightingWeight: { type: 'number', minimum: 0, maximum: 1 },
          footTrafficWeight: { type: 'number', minimum: 0, maximum: 1 },
          timeOfDayWeight: { type: 'number', minimum: 0, maximum: 1 },
          preferWellLit: { type: 'boolean' },
          preferBusyAreas: { type: 'boolean' },
          avoidConstruction: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const {
      crimeWeight,
      realtimeCrimeWeight,
      lightingWeight,
      footTrafficWeight,
      timeOfDayWeight,
      preferWellLit,
      preferBusyAreas,
      avoidConstruction,
    } = request.body;

    try {
      const result = await query(
        `INSERT INTO safety_preferences (
           user_id, crime_weight, realtime_crime_weight, lighting_weight,
           foot_traffic_weight, time_of_day_weight, prefer_well_lit,
           prefer_busy_areas, avoid_construction
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id)
         DO UPDATE SET
           crime_weight = COALESCE($2, safety_preferences.crime_weight),
           realtime_crime_weight = COALESCE($3, safety_preferences.realtime_crime_weight),
           lighting_weight = COALESCE($4, safety_preferences.lighting_weight),
           foot_traffic_weight = COALESCE($5, safety_preferences.foot_traffic_weight),
           time_of_day_weight = COALESCE($6, safety_preferences.time_of_day_weight),
           prefer_well_lit = COALESCE($7, safety_preferences.prefer_well_lit),
           prefer_busy_areas = COALESCE($8, safety_preferences.prefer_busy_areas),
           avoid_construction = COALESCE($9, safety_preferences.avoid_construction),
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          request.user.id,
          crimeWeight,
          realtimeCrimeWeight,
          lightingWeight,
          footTrafficWeight,
          timeOfDayWeight,
          preferWellLit,
          preferBusyAreas,
          avoidConstruction,
        ]
      );

      return reply.send({
        message: 'Preferences updated',
        preferences: result.rows[0],
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to update preferences',
        message: 'An error occurred',
      });
    }
  });

  // ==============================================
  // EMERGENCY CONTACTS
  // ==============================================

  /**
   * GET /api/users/contacts
   * Get user's emergency contacts
   */
  fastify.get('/contacts', async (request, reply) => {
    try {
      const result = await query(
        'SELECT * FROM contacts WHERE user_id = $1 ORDER BY is_primary DESC, name ASC',
        [request.user.id]
      );

      return reply.send({ contacts: result.rows });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get contacts',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/users/contacts
   * Add a new emergency contact
   */
  fastify.post('/contacts', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'phoneNumber'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          phoneNumber: { type: 'string', minLength: 10, maxLength: 20 },
          relationship: { type: 'string', maxLength: 50 },
          isPrimary: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, phoneNumber, relationship, isPrimary } = request.body;

    try {
      // Check contact limit based on subscription
      const user = await query(
        'SELECT subscription_level FROM users WHERE id = $1',
        [request.user.id]
      );

      const contactCount = await query(
        'SELECT COUNT(*) FROM contacts WHERE user_id = $1',
        [request.user.id]
      );

      const limits = { free: 1, basic: 5, premium: Infinity };
      const limit = limits[user.rows[0].subscription_level] || 1;

      if (parseInt(contactCount.rows[0].count, 10) >= limit) {
        return reply.status(403).send({
          error: 'Contact limit reached',
          message: `Your subscription allows ${limit} emergency contact(s)`,
          code: 'AUTH_003',
        });
      }

      // If this is primary, unset other primary contacts
      if (isPrimary) {
        await query(
          'UPDATE contacts SET is_primary = false WHERE user_id = $1',
          [request.user.id]
        );
      }

      const result = await query(
        `INSERT INTO contacts (user_id, name, phone_number, relationship, is_primary)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [request.user.id, name, phoneNumber, relationship, isPrimary || false]
      );

      return reply.status(201).send({
        message: 'Contact added',
        contact: result.rows[0],
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to add contact',
        message: 'An error occurred',
      });
    }
  });

  /**
   * DELETE /api/users/contacts/:id
   * Delete an emergency contact
   */
  fastify.delete('/contacts/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await query(
        'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, request.user.id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'Contact not found',
        });
      }

      return reply.send({
        message: 'Contact deleted',
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to delete contact',
        message: 'An error occurred',
      });
    }
  });

  /**
   * DELETE /api/users/account
   * Delete user account
   */
  fastify.delete('/account', async (request, reply) => {
    try {
      await query('DELETE FROM users WHERE id = $1', [request.user.id]);

      return reply.send({
        message: 'Account deleted successfully',
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to delete account',
        message: 'An error occurred',
      });
    }
  });
}
