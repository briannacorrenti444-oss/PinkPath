/**
 * @fileoverview Hazard Reporting API
 * Handles user-submitted hazard reports for route safety
 * Supports both spot reports (specific location) and route-wide reports
 */

import { query } from '../db/connection.js';

/**
 * Determine time of day category from current hour
 * @param {number} hour - Hour of day (0-23)
 * @returns {string} Time period
 */
function getTimeOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Reporting routes plugin for Fastify
 * @param {FastifyInstance} fastify - Fastify instance
 */
export default async function reportingRoutes(fastify) {

  // ==============================================
  // HAZARD CATEGORIES
  // ==============================================

  /**
   * GET /api/reports/categories
   * Fetch available hazard categories for UI
   */
  fastify.get('/categories', async (request, reply) => {
    try {
      const result = await query(
        `SELECT code, label, icon, severity_default, display_order
         FROM hazard_categories
         WHERE is_active = true
         ORDER BY display_order`
      );

      return reply.send({
        categories: result.rows,
        count: result.rows.length,
      });

    } catch (error) {
      fastify.log.error('Failed to fetch hazard categories:', error);
      return reply.status(500).send({
        error: 'Failed to fetch categories',
        message: 'An error occurred while loading hazard options',
      });
    }
  });

  // ==============================================
  // HAZARD REPORTS
  // ==============================================

  /**
   * POST /api/reports/hazard
   * Submit a hazard report (requires authentication)
   * Supports both spot reports and route-wide reports
   */
  fastify.post('/hazard', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['reportScope', 'hazardTypes'],
        properties: {
          reportScope: { type: 'string', enum: ['spot', 'route'] },
          hazardTypes: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 12,
          },
          severity: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
          comment: { type: 'string', maxLength: 500 },

          // For spot reports
          lat: { type: 'number' },
          lng: { type: 'number' },

          // For route reports
          startLat: { type: 'number' },
          startLng: { type: 'number' },
          endLat: { type: 'number' },
          endLng: { type: 'number' },
          polyline: { type: 'string' },

          wasPreviewMode: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request, reply) => {
    const {
      reportScope,
      hazardTypes,
      severity,
      comment,
      lat,
      lng,
      startLat,
      startLng,
      endLat,
      endLng,
      polyline,
      wasPreviewMode,
    } = request.body;

    // Validate required fields based on scope
    if (reportScope === 'spot' && (lat === undefined || lng === undefined)) {
      return reply.status(400).send({
        error: 'Missing location',
        message: 'Spot reports require lat and lng coordinates',
      });
    }

    if (reportScope === 'route' && (startLat === undefined || endLat === undefined)) {
      return reply.status(400).send({
        error: 'Missing route bounds',
        message: 'Route reports require start and end coordinates',
      });
    }

    try {
      const timeOfDay = getTimeOfDay(new Date().getHours());

      // Sanitize comment (strip HTML tags)
      const sanitizedComment = comment
        ? comment.replace(/<[^>]*>/g, '').substring(0, 500)
        : null;

      const result = await query(
        `INSERT INTO hazard_reports
         (user_id, report_scope, lat, lng, start_lat, start_lng, end_lat, end_lng,
          polyline, hazard_types, severity, comment, time_of_day, was_preview_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, created_at`,
        [
          request.user.id,
          reportScope,
          reportScope === 'spot' ? lat : null,
          reportScope === 'spot' ? lng : null,
          reportScope === 'route' ? startLat : null,
          reportScope === 'route' ? startLng : null,
          reportScope === 'route' ? endLat : null,
          reportScope === 'route' ? endLng : null,
          polyline || null,
          JSON.stringify(hazardTypes),
          severity || 'medium',
          sanitizedComment,
          timeOfDay,
          wasPreviewMode || false,
        ]
      );

      fastify.log.info(`Hazard report submitted: ${result.rows[0].id} by user ${request.user.id}`);

      return reply.status(201).send({
        success: true,
        reportId: result.rows[0].id,
        message: 'Thank you for reporting this hazard!',
      });

    } catch (error) {
      fastify.log.error('Failed to submit hazard report:', error);
      return reply.status(500).send({
        error: 'Report submission failed',
        message: 'An error occurred while saving your report',
      });
    }
  });

  /**
   * GET /api/reports/hazard/nearby
   * Get aggregated hazard reports near a location
   * Returns reports with 1+ reports in the last 30 days (lower threshold for hazards)
   */
  fastify.get('/hazard/nearby', {
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
      const latDelta = (radius || 500) / 111000;
      const lngDelta = (radius || 500) / (111000 * Math.cos(lat * Math.PI / 180));

      const result = await query(
        `SELECT
           ROUND(lat::numeric, 4) as lat,
           ROUND(lng::numeric, 4) as lng,
           hazard_types,
           severity,
           COUNT(*) as report_count,
           MAX(created_at) as last_reported
         FROM hazard_reports
         WHERE is_active = true
           AND report_scope = 'spot'
           AND lat BETWEEN $1 AND $2
           AND lng BETWEEN $3 AND $4
           AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY ROUND(lat::numeric, 4), ROUND(lng::numeric, 4), hazard_types, severity
         ORDER BY severity DESC, report_count DESC
         LIMIT 100`,
        [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta]
      );

      return reply.send({
        reports: result.rows,
        count: result.rows.length,
      });

    } catch (error) {
      fastify.log.error('Failed to fetch nearby hazard reports:', error);
      return reply.status(500).send({
        error: 'Failed to fetch reports',
        message: 'An error occurred while loading nearby hazards',
      });
    }
  });

  /**
   * GET /api/reports/hazard/route
   * Get hazard reports along a route (for route preview)
   */
  fastify.get('/hazard/route', {
    schema: {
      querystring: {
        type: 'object',
        required: ['startLat', 'startLng', 'endLat', 'endLng'],
        properties: {
          startLat: { type: 'number' },
          startLng: { type: 'number' },
          endLat: { type: 'number' },
          endLng: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const { startLat, startLng, endLat, endLng } = request.query;

    try {
      // Get route-wide reports for this route
      const routeReports = await query(
        `SELECT
           id, hazard_types, severity, comment, created_at
         FROM hazard_reports
         WHERE is_active = true
           AND report_scope = 'route'
           AND ABS(start_lat - $1) < 0.001
           AND ABS(start_lng - $2) < 0.001
           AND ABS(end_lat - $3) < 0.001
           AND ABS(end_lng - $4) < 0.001
           AND created_at > NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC
         LIMIT 20`,
        [startLat, startLng, endLat, endLng]
      );

      // Get spot reports along the route bounding box
      const minLat = Math.min(startLat, endLat);
      const maxLat = Math.max(startLat, endLat);
      const minLng = Math.min(startLng, endLng);
      const maxLng = Math.max(startLng, endLng);

      // Add buffer around the route
      const buffer = 0.002; // ~200m buffer

      const spotReports = await query(
        `SELECT
           ROUND(lat::numeric, 4) as lat,
           ROUND(lng::numeric, 4) as lng,
           hazard_types,
           severity,
           COUNT(*) as report_count
         FROM hazard_reports
         WHERE is_active = true
           AND report_scope = 'spot'
           AND lat BETWEEN $1 AND $2
           AND lng BETWEEN $3 AND $4
           AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY ROUND(lat::numeric, 4), ROUND(lng::numeric, 4), hazard_types, severity
         ORDER BY severity DESC
         LIMIT 50`,
        [minLat - buffer, maxLat + buffer, minLng - buffer, maxLng + buffer]
      );

      return reply.send({
        routeReports: routeReports.rows,
        spotReports: spotReports.rows,
        routeReportCount: routeReports.rows.length,
        spotReportCount: spotReports.rows.length,
      });

    } catch (error) {
      fastify.log.error('Failed to fetch route hazard reports:', error);
      return reply.status(500).send({
        error: 'Failed to fetch reports',
        message: 'An error occurred while loading route hazards',
      });
    }
  });

  /**
   * GET /api/reports/user
   * Get current user's hazard report history
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
        `SELECT id, report_scope, lat, lng, start_lat, start_lng, end_lat, end_lng,
                hazard_types, severity, comment, time_of_day, is_active, created_at
         FROM hazard_reports
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [request.user.id, limit || 20, offset || 0]
      );

      return reply.send({
        reports: result.rows,
        count: result.rows.length,
      });

    } catch (error) {
      fastify.log.error('Failed to fetch user hazard reports:', error);
      return reply.status(500).send({
        error: 'Failed to fetch reports',
        message: 'An error occurred while loading your reports',
      });
    }
  });

  /**
   * GET /api/reports/stats
   * Get aggregated hazard statistics
   */
  fastify.get('/stats', async (request, reply) => {
    try {
      const [typeStats, severityStats, timeStats] = await Promise.all([
        // Top hazard types
        query(`
          SELECT
            elem as hazard_type,
            COUNT(*) as count
          FROM hazard_reports,
               jsonb_array_elements_text(hazard_types) as elem
          WHERE is_active = true
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY elem
          ORDER BY count DESC
          LIMIT 20
        `),

        // Reports by severity
        query(`
          SELECT
            severity,
            COUNT(*) as count
          FROM hazard_reports
          WHERE is_active = true
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY severity
          ORDER BY
            CASE severity
              WHEN 'high' THEN 1
              WHEN 'medium' THEN 2
              WHEN 'low' THEN 3
            END
        `),

        // Reports by time of day
        query(`
          SELECT
            time_of_day,
            COUNT(*) as count
          FROM hazard_reports
          WHERE is_active = true
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY time_of_day
          ORDER BY count DESC
        `),
      ]);

      return reply.send({
        period: '30 days',
        topHazardTypes: typeStats.rows,
        bySeverity: severityStats.rows,
        byTimeOfDay: timeStats.rows,
        generatedAt: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to fetch hazard stats:', error);
      return reply.status(500).send({
        error: 'Failed to fetch statistics',
        message: 'An error occurred while generating analytics',
      });
    }
  });
}
