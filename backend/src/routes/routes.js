/**
 * @fileoverview Route Calculation Routes
 * API endpoints for calculating safe walking routes
 */

import { calculateSafeRoutes, scoreAdditionalRoutes } from '../services/integration/pathAlgorithm.js';
import { query } from '../db/connection.js';
import { SF_BOUNDS } from '@pinkpath/shared/constants.js';

/**
 * Routes plugin for Fastify
 * @param {FastifyInstance} fastify - Fastify instance
 */
export default async function routeRoutes(fastify) {

  // ==============================================
  // ROUTE CALCULATION
  // ==============================================

  /**
   * POST /api/routes/calculate
   * Calculate safe walking routes between two points
   *
   * This is the main endpoint that:
   * 1. Gets 8 routes from Google Routes API
   * 2. Scores each route for safety
   * 3. Returns 3 routes: Safest, Fastest, Happy Medium
   */
  fastify.post('/calculate', {
    schema: {
      body: {
        type: 'object',
        required: ['start', 'destination'],
        properties: {
          start: {
            type: 'object',
            required: ['lat', 'lng'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lng: { type: 'number', minimum: -180, maximum: 180 },
              address: { type: 'string' },
            },
          },
          destination: {
            type: 'object',
            required: ['lat', 'lng'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lng: { type: 'number', minimum: -180, maximum: 180 },
              address: { type: 'string' },
            },
          },
          preferences: {
            type: 'object',
            properties: {
              preferWellLit: { type: 'boolean' },
              preferBusyAreas: { type: 'boolean' },
              avoidConstruction: { type: 'boolean' },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { start, destination, preferences } = request.body;

    try {
      // Validate locations are in San Francisco
      if (!SF_BOUNDS.contains(start.lat, start.lng)) {
        return reply.status(400).send({
          error: 'Out of service area',
          message: 'Starting location is outside San Francisco',
          code: 'ROUTE_001',
        });
      }

      if (!SF_BOUNDS.contains(destination.lat, destination.lng)) {
        return reply.status(400).send({
          error: 'Out of service area',
          message: 'Destination is outside San Francisco',
          code: 'ROUTE_001',
        });
      }

      // Validate start != destination (avoid zero-distance routes)
      const MIN_DISTANCE_METERS = 50; // At least 50 meters apart
      const latDiff = Math.abs(start.lat - destination.lat);
      const lngDiff = Math.abs(start.lng - destination.lng);
      // Rough distance calculation (good enough for validation)
      const approxDistanceMeters = Math.sqrt(
        Math.pow(latDiff * 111000, 2) + Math.pow(lngDiff * 85000, 2)
      );

      if (approxDistanceMeters < MIN_DISTANCE_METERS) {
        return reply.status(400).send({
          error: 'Invalid route',
          message: 'Start and destination are too close together. Please choose different locations.',
          code: 'ROUTE_002',
        });
      }

      // Validate reasonable walking distance (max 20 miles / ~32 km)
      const MAX_WALKING_METERS = 32000;
      if (approxDistanceMeters > MAX_WALKING_METERS) {
        return reply.status(400).send({
          error: 'Distance too far',
          message: 'This route is too far for walking. Consider using transportation for part of the journey.',
          code: 'ROUTE_003',
        });
      }

      // Get user preferences if authenticated
      let userPreferences = preferences || {};
      if (request.user) {
        try {
          const prefsResult = await query(
            'SELECT * FROM safety_preferences WHERE user_id = $1',
            [request.user.id]
          );
          if (prefsResult.rows.length > 0) {
            userPreferences = {
              ...prefsResult.rows[0],
              ...preferences, // Request preferences override user defaults
            };
          }
        } catch (e) {
          // Continue with default preferences if DB query fails
          fastify.log.warn('Failed to load user preferences:', e);
        }
      }

      // Calculate routes using the integration algorithm
      const routes = await calculateSafeRoutes(start, destination, userPreferences);

      // Track warnings to include in response
      const warnings = [];
      let routeHistoryId = null;

      // Save route history if user is authenticated
      if (request.user && routes.safest) {
        try {
          const historyResult = await query(
            `INSERT INTO route_history
             (user_id, start_lat, start_lng, end_lat, end_lng,
              start_address, end_address, safety_score, distance_meters,
              duration_seconds, route_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'safest')
             RETURNING id`,
            [
              request.user.id,
              start.lat,
              start.lng,
              destination.lat,
              destination.lng,
              start.address || null,
              destination.address || null,
              routes.safest.safetyScore,
              routes.safest.distanceMeters,
              routes.safest.durationSeconds,
            ]
          );
          routeHistoryId = historyResult.rows[0]?.id;
        } catch (e) {
          // Don't fail the request if history save fails, but log and warn
          fastify.log.error('Failed to save route history:', e);
          warnings.push({
            code: 'HISTORY_SAVE_FAILED',
            message: 'Route history could not be saved',
          });
        }
      }

      return reply.send({
        success: true,
        routes: {
          safest: routes.safest,
          fastest: routes.fastest,
          balanced: routes.balanced,
          allRoutes: routes.allRoutes || [], // All routes ranked by safety score
        },
        metadata: {
          timestamp: new Date().toISOString(),
          inServiceArea: true,
          routesAnalyzed: routes.allRoutes?.length || routes.totalRoutesAnalyzed || 8,
          routeHistoryId,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      });

    } catch (error) {
      fastify.log.error('Route calculation error:', error);

      // Handle specific error types
      if (error.message?.includes('API key')) {
        return reply.status(503).send({
          error: 'Service unavailable',
          message: 'Routing service is not configured',
          code: 'API_001',
        });
      }

      return reply.status(500).send({
        error: 'Route calculation failed',
        message: 'Unable to calculate routes. Please try again.',
        code: 'ROUTE_002',
      });
    }
  });

  // ==============================================
  // ALTERNATIVE ROUTES (SHOW MORE)
  // ==============================================

  /**
   * POST /api/routes/alternatives
   * Get additional route alternatives via waypoints
   *
   * Called when user clicks "Show More Routes" to fetch 4 additional
   * real street-following routes through strategic waypoints.
   */
  fastify.post('/alternatives', {
    schema: {
      body: {
        type: 'object',
        required: ['start', 'destination', 'baseRoute'],
        properties: {
          start: {
            type: 'object',
            required: ['lat', 'lng'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lng: { type: 'number', minimum: -180, maximum: 180 },
            },
          },
          destination: {
            type: 'object',
            required: ['lat', 'lng'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lng: { type: 'number', minimum: -180, maximum: 180 },
            },
          },
          baseRoute: {
            type: 'object',
            description: 'The safest route from initial calculation, used as base for waypoint generation',
            properties: {
              coordinates: { type: 'array' },
              polyline: { type: 'string' },
              distanceMeters: { type: 'number' },
              durationSeconds: { type: 'number' },
            },
          },
          preferences: {
            type: 'object',
            properties: {
              preferWellLit: { type: 'boolean' },
              preferBusyAreas: { type: 'boolean' },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { start, destination, baseRoute, preferences } = request.body;

    try {
      // Validate locations are in San Francisco
      if (!SF_BOUNDS.contains(start.lat, start.lng)) {
        return reply.status(400).send({
          error: 'Out of service area',
          message: 'Starting location is outside San Francisco',
          code: 'ROUTE_001',
        });
      }

      if (!SF_BOUNDS.contains(destination.lat, destination.lng)) {
        return reply.status(400).send({
          error: 'Out of service area',
          message: 'Destination is outside San Francisco',
          code: 'ROUTE_001',
        });
      }

      // Get user preferences if authenticated
      let userPreferences = preferences || {};
      if (request.user) {
        try {
          const prefsResult = await query(
            'SELECT * FROM safety_preferences WHERE user_id = $1',
            [request.user.id]
          );
          if (prefsResult.rows.length > 0) {
            userPreferences = {
              ...prefsResult.rows[0],
              ...preferences,
            };
          }
        } catch (e) {
          fastify.log.warn('Failed to load user preferences:', e);
        }
      }

      // Generate and score additional waypoint-based routes
      const result = await scoreAdditionalRoutes(start, destination, baseRoute, userPreferences);

      return reply.send({
        success: true,
        additionalRoutes: result.additionalRoutes,
        metadata: {
          timestamp: new Date().toISOString(),
          routesGenerated: result.totalGenerated,
          routesReturned: result.additionalRoutes.length,
        },
      });

    } catch (error) {
      fastify.log.error('Alternative routes error:', error);

      return reply.status(500).send({
        error: 'Failed to generate alternative routes',
        message: 'Unable to calculate additional routes. Please try again.',
        code: 'ROUTE_003',
      });
    }
  });

  /**
   * GET /api/routes/history
   * Get user's route history
   */
  fastify.get('/history', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { limit, offset } = request.query;

    try {
      const result = await query(
        `SELECT * FROM route_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [request.user.id, limit || 20, offset || 0]
      );

      const countResult = await query(
        'SELECT COUNT(*) FROM route_history WHERE user_id = $1',
        [request.user.id]
      );

      return reply.send({
        routes: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count, 10),
          limit: limit || 20,
          offset: offset || 0,
        },
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get route history',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/routes/geocode
   * Geocode an address to coordinates
   */
  fastify.post('/geocode', {
    schema: {
      body: {
        type: 'object',
        required: ['address'],
        properties: {
          address: { type: 'string', minLength: 3 },
        },
      },
    },
  }, async (request, reply) => {
    const { address } = request.body;

    try {
      // Import geocoding service
      const { geocodeAddress } = await import('../services/geocodingService.js');
      const result = await geocodeAddress(address);

      if (!result) {
        return reply.status(404).send({
          error: 'Address not found',
          message: 'Could not find coordinates for the given address',
        });
      }

      return reply.send({
        success: true,
        location: result,
      });

    } catch (error) {
      fastify.log.error('Geocoding error:', error);
      return reply.status(500).send({
        error: 'Geocoding failed',
        message: 'Unable to geocode address',
      });
    }
  });

  /**
   * POST /api/routes/reverse-geocode
   * Reverse geocode coordinates to an address
   */
  fastify.post('/reverse-geocode', {
    schema: {
      body: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const { lat, lng } = request.body;

    try {
      const { reverseGeocode } = await import('../services/geocodingService.js');
      const result = await reverseGeocode(lat, lng);

      if (!result) {
        return reply.status(404).send({
          error: 'Location not found',
          message: 'Could not find address for the given coordinates',
        });
      }

      return reply.send({
        success: true,
        address: result,
      });

    } catch (error) {
      fastify.log.error('Reverse geocoding error:', error);
      return reply.status(500).send({
        error: 'Reverse geocoding failed',
        message: 'Unable to reverse geocode coordinates',
      });
    }
  });
}
