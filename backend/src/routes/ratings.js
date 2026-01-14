/**
 * @fileoverview Route Ratings API
 * Handles user feedback on route safety - both overall ratings and segment pins
 */

import { query } from '../db/connection.js';

/**
 * Determine time of day category from current hour
 * @param {number} hour - Hour of day (0-23)
 * @returns {string} Time period: 'morning', 'afternoon', 'evening', or 'night'
 */
function getTimeOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Ratings routes plugin for Fastify
 * @param {FastifyInstance} fastify - Fastify instance
 */
export default async function ratingsRoutes(fastify) {

  // ==============================================
  // RATING CATEGORIES
  // ==============================================

  /**
   * GET /api/ratings/categories
   * Fetch available rating categories for UI
   */
  fastify.get('/categories', async (request, reply) => {
    try {
      const result = await query(
        `SELECT code, label, pin_type, display_order
         FROM rating_categories
         WHERE is_active = true
         ORDER BY pin_type, display_order`
      );

      const categories = {
        safe: result.rows.filter(r => r.pin_type === 'safe'),
        caution: result.rows.filter(r => r.pin_type === 'caution'),
      };

      return reply.send(categories);

    } catch (error) {
      fastify.log.error('Failed to fetch rating categories:', error);
      return reply.status(500).send({
        error: 'Failed to fetch categories',
        message: 'An error occurred while loading rating options',
      });
    }
  });

  // ==============================================
  // ROUTE RATINGS (Overall feedback after navigation)
  // ==============================================

  /**
   * POST /api/ratings/route
   * Submit overall route rating (requires authentication)
   */
  fastify.post('/route', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['rating', 'startLat', 'startLng', 'endLat', 'endLng'],
        properties: {
          rating: { type: 'string', enum: ['unsafe', 'neutral', 'safe'] },
          reasons: { type: 'array', items: { type: 'string' }, maxItems: 10 },
          comment: { type: 'string', maxLength: 500 },
          routeHistoryId: { type: 'integer' },
          polyline: { type: 'string' },
          startLat: { type: 'number' },
          startLng: { type: 'number' },
          endLat: { type: 'number' },
          endLng: { type: 'number' },
          wasPreviewMode: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const {
      rating,
      reasons,
      comment,
      routeHistoryId,
      polyline,
      startLat,
      startLng,
      endLat,
      endLng,
      wasPreviewMode,
    } = request.body;

    try {
      const timeOfDay = getTimeOfDay(new Date().getHours());

      // Sanitize comment (strip any HTML tags)
      const sanitizedComment = comment
        ? comment.replace(/<[^>]*>/g, '').substring(0, 500)
        : null;

      const result = await query(
        `INSERT INTO route_ratings
         (user_id, route_history_id, rating, reasons, comment, polyline,
          start_lat, start_lng, end_lat, end_lng, was_preview_mode, time_of_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, created_at`,
        [
          request.user.id,
          routeHistoryId || null,
          rating,
          JSON.stringify(reasons || []),
          sanitizedComment,
          polyline || null,
          startLat,
          startLng,
          endLat,
          endLng,
          wasPreviewMode || false,
          timeOfDay,
        ]
      );

      // Mark route_history as rated if applicable
      if (routeHistoryId) {
        await query(
          'UPDATE route_history SET rating_submitted = true WHERE id = $1',
          [routeHistoryId]
        );
      }

      return reply.status(201).send({
        success: true,
        ratingId: result.rows[0].id,
        message: 'Thank you for your feedback!',
      });

    } catch (error) {
      fastify.log.error('Failed to submit route rating:', error);
      return reply.status(500).send({
        error: 'Rating submission failed',
        message: 'An error occurred while saving your rating',
      });
    }
  });

  /**
   * GET /api/ratings/user
   * Get current user's rating history (requires authentication)
   */
  fastify.get('/user', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 20, maximum: 100 },
          offset: { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { limit, offset } = request.query;

    try {
      const result = await query(
        `SELECT id, rating, reasons, comment,
                start_lat, start_lng, end_lat, end_lng,
                time_of_day, was_preview_mode, created_at
         FROM route_ratings
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [request.user.id, limit || 20, offset || 0]
      );

      return reply.send({
        ratings: result.rows,
        count: result.rows.length,
      });

    } catch (error) {
      fastify.log.error('Failed to fetch user ratings:', error);
      return reply.status(500).send({
        error: 'Failed to fetch ratings',
        message: 'An error occurred while loading your ratings',
      });
    }
  });

  // ==============================================
  // SEGMENT PINS (Location-specific reports)
  // ==============================================

  /**
   * POST /api/ratings/pin
   * Submit a segment pin at a specific location (requires authentication)
   */
  fastify.post('/pin', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['lat', 'lng', 'pinType', 'category'],
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          pinType: { type: 'string', enum: ['safe', 'caution'] },
          category: { type: 'string', maxLength: 50 },
          comment: { type: 'string', maxLength: 200 },
          routeRatingId: { type: 'integer' },
          wasPreviewMode: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const { lat, lng, pinType, category, comment, routeRatingId, wasPreviewMode } = request.body;

    try {
      const timeOfDay = getTimeOfDay(new Date().getHours());

      // Sanitize comment
      const sanitizedComment = comment
        ? comment.replace(/<[^>]*>/g, '').substring(0, 200)
        : null;

      const result = await query(
        `INSERT INTO segment_pins
         (user_id, route_rating_id, lat, lng, pin_type, category, comment, was_preview_mode, time_of_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, created_at`,
        [
          request.user.id,
          routeRatingId || null,
          lat,
          lng,
          pinType,
          category,
          sanitizedComment,
          wasPreviewMode || false,
          timeOfDay,
        ]
      );

      return reply.status(201).send({
        success: true,
        pinId: result.rows[0].id,
        message: 'Pin added successfully',
      });

    } catch (error) {
      fastify.log.error('Failed to submit segment pin:', error);
      return reply.status(500).send({
        error: 'Pin submission failed',
        message: 'An error occurred while saving your pin',
      });
    }
  });

  /**
   * GET /api/ratings/pins/nearby
   * Get aggregated pins near a location (for map display)
   * Returns pins with 2+ reports in the last 90 days
   */
  fastify.get('/pins/nearby', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          radius: { type: 'number', default: 500, maximum: 2000 },
        },
      },
    },
  }, async (request, reply) => {
    const { lat, lng, radius } = request.query;

    try {
      // Convert radius from meters to approximate degrees
      // At SF latitude (~37.7), 1 degree lat ≈ 111km, 1 degree lng ≈ 88km
      const latDelta = (radius || 500) / 111000;
      const lngDelta = (radius || 500) / (111000 * Math.cos(lat * Math.PI / 180));

      const result = await query(
        `SELECT
           ROUND(lat::numeric, 4) as lat,
           ROUND(lng::numeric, 4) as lng,
           pin_type,
           category,
           COUNT(*) as report_count,
           MAX(created_at) as last_reported
         FROM segment_pins
         WHERE is_visible = true
           AND lat BETWEEN $1 AND $2
           AND lng BETWEEN $3 AND $4
           AND created_at > NOW() - INTERVAL '90 days'
         GROUP BY ROUND(lat::numeric, 4), ROUND(lng::numeric, 4), pin_type, category
         HAVING COUNT(*) >= 2
         ORDER BY report_count DESC
         LIMIT 100`,
        [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
      );

      return reply.send({
        pins: result.rows,
        count: result.rows.length,
      });

    } catch (error) {
      fastify.log.error('Failed to fetch nearby pins:', error);
      return reply.status(500).send({
        error: 'Failed to fetch pins',
        message: 'An error occurred while loading nearby reports',
      });
    }
  });

  // ==============================================
  // ANALYTICS (City-wide insights)
  // ==============================================

  /**
   * GET /api/ratings/stats
   * Get aggregated safety statistics for analytics
   */
  fastify.get('/stats', async (request, reply) => {
    try {
      const [routeStats, pinStats, timeStats] = await Promise.all([
        // Overall route rating distribution
        query(`
          SELECT
            rating,
            COUNT(*) as count
          FROM route_ratings
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY rating
        `),

        // Top segment pin categories
        query(`
          SELECT
            pin_type,
            category,
            COUNT(*) as count
          FROM segment_pins
          WHERE is_visible = true
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY pin_type, category
          ORDER BY count DESC
          LIMIT 20
        `),

        // Ratings by time of day
        query(`
          SELECT
            time_of_day,
            rating,
            COUNT(*) as count
          FROM route_ratings
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY time_of_day, rating
          ORDER BY time_of_day, rating
        `),
      ]);

      return reply.send({
        period: '30 days',
        routeRatings: routeStats.rows,
        segmentPins: pinStats.rows,
        ratingsByTime: timeStats.rows,
        generatedAt: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to fetch rating stats:', error);
      return reply.status(500).send({
        error: 'Failed to fetch statistics',
        message: 'An error occurred while generating analytics',
      });
    }
  });

  /**
   * GET /api/ratings/heatmap
   * Get safety heatmap data for visualization
   */
  fastify.get('/heatmap', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          gridSize: { type: 'number', default: 0.005, minimum: 0.001, maximum: 0.01 },
        },
      },
    },
  }, async (request, reply) => {
    const { gridSize } = request.query;
    const grid = gridSize || 0.005; // ~500m grid cells

    try {
      const result = await query(`
        WITH grid_ratings AS (
          SELECT
            FLOOR(start_lat / $1) * $1 as grid_lat,
            FLOOR(start_lng / $1) * $1 as grid_lng,
            CASE rating
              WHEN 'unsafe' THEN 0
              WHEN 'neutral' THEN 50
              WHEN 'safe' THEN 100
            END as score
          FROM route_ratings
          WHERE created_at > NOW() - INTERVAL '90 days'
        )
        SELECT
          grid_lat as lat,
          grid_lng as lng,
          ROUND(AVG(score)::numeric, 1) as avg_score,
          COUNT(*) as rating_count
        FROM grid_ratings
        GROUP BY grid_lat, grid_lng
        HAVING COUNT(*) >= 3
        ORDER BY rating_count DESC
        LIMIT 500
      `, [grid]);

      return reply.send({
        gridSize: grid,
        cells: result.rows,
        generatedAt: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to generate heatmap:', error);
      return reply.status(500).send({
        error: 'Failed to generate heatmap',
        message: 'An error occurred while generating heatmap data',
      });
    }
  });
}
