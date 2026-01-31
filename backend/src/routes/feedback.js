/**
 * @fileoverview Feature Feedback Routes
 * Handles feature votes and user feedback collection for beta testing
 */

import { query } from '../db/connection.js';

/**
 * Register feedback routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
export default async function feedbackRoutes(fastify, options) {

  // ============================================
  // FEATURE VOTES
  // ============================================

  /**
   * POST /feature-votes
   * Log a feature vote (works with or without authentication)
   * Uses session_id for anonymous users, user_id for authenticated users
   */
  fastify.post('/feature-votes', async (request, reply) => {
    const { feature_key, session_id } = request.body;

    // Validate feature_key
    const validFeatures = [
      'safety_preferences',
      'alternative_routes',
      'live_location',
      'automatic_notifications',
      'emergency_contacts'
    ];

    if (!feature_key || !validFeatures.includes(feature_key)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Invalid feature_key. Must be one of: ${validFeatures.join(', ')}`
      });
    }

    // Check for authenticated user
    let userId = null;
    try {
      await request.jwtVerify();
      userId = request.user.id;
    } catch (e) {
      // Not authenticated - use session_id
    }

    // Require either user_id or session_id
    if (!userId && !session_id) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Either authentication or session_id is required'
      });
    }

    try {
      // Insert vote (unique constraint prevents duplicates)
      if (userId) {
        await query(`
          INSERT INTO feature_votes (user_id, feature_key)
          VALUES ($1, $2)
          ON CONFLICT (user_id, feature_key) DO NOTHING
        `, [userId, feature_key]);
      } else {
        await query(`
          INSERT INTO feature_votes (session_id, feature_key)
          VALUES ($1, $2)
          ON CONFLICT (session_id, feature_key) DO NOTHING
        `, [session_id, feature_key]);
      }

      console.log(`[FeatureVote] Recorded vote for: ${feature_key} (user: ${userId || 'anonymous'})`);

      return reply.status(201).send({
        success: true,
        message: 'Vote recorded',
        feature_key
      });

    } catch (error) {
      console.error('[FeatureVote] Error recording vote:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to record vote'
      });
    }
  });

  /**
   * GET /feature-votes/summary
   * Get vote counts for all features (admin/analytics endpoint)
   * No authentication required for beta - add auth for production
   */
  fastify.get('/feature-votes/summary', async (request, reply) => {
    try {
      const result = await query(`
        SELECT
          feature_key,
          COUNT(*) as vote_count,
          COUNT(DISTINCT user_id) as authenticated_votes,
          COUNT(DISTINCT session_id) as anonymous_votes,
          MIN(created_at) as first_vote,
          MAX(created_at) as last_vote
        FROM feature_votes
        GROUP BY feature_key
        ORDER BY vote_count DESC
      `);

      // Get total unique voters
      const totalResult = await query(`
        SELECT
          COUNT(DISTINCT COALESCE(user_id::text, session_id)) as total_voters
        FROM feature_votes
      `);

      return reply.send({
        success: true,
        summary: result.rows,
        total_voters: parseInt(totalResult.rows[0]?.total_voters || '0', 10),
        generated_at: new Date().toISOString()
      });

    } catch (error) {
      console.error('[FeatureVote] Error fetching summary:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch vote summary'
      });
    }
  });

  /**
   * GET /feature-votes/export
   * Export all votes as CSV for analysis
   */
  fastify.get('/feature-votes/export', async (request, reply) => {
    try {
      const result = await query(`
        SELECT
          id,
          COALESCE(user_id::text, 'anonymous') as user_type,
          feature_key,
          created_at
        FROM feature_votes
        ORDER BY created_at DESC
      `);

      // Generate CSV
      const headers = 'id,user_type,feature_key,created_at';
      const rows = result.rows.map(row =>
        `${row.id},${row.user_type},${row.feature_key},${row.created_at}`
      );
      const csv = [headers, ...rows].join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename=feature_votes.csv');
      return reply.send(csv);

    } catch (error) {
      console.error('[FeatureVote] Error exporting votes:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to export votes'
      });
    }
  });
}
