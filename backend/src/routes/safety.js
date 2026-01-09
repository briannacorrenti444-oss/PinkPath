/**
 * @fileoverview Safety Data Routes
 * API endpoints for crime data, lighting, and safety information
 */

import { getCrimeData, getRealtimeCadData } from '../services/crimeService.js';
import { getStreetlightComplaints } from '../services/lightingService.js';
import { getSunsetData } from '../services/sunsetService.js';

/**
 * Safety routes plugin for Fastify
 * @param {FastifyInstance} fastify - Fastify instance
 */
export default async function safetyRoutes(fastify) {

  // ==============================================
  // CRIME DATA
  // ==============================================

  /**
   * GET /api/safety/crime
   * Get crime data for a location
   */
  fastify.get('/crime', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          radius: { type: 'number', default: 800 }, // meters
          days: { type: 'integer', default: 90 },
        },
      },
    },
  }, async (request, reply) => {
    const { lat, lng, radius, days } = request.query;

    try {
      const crimes = await getCrimeData(lat, lng, radius, days);

      return reply.send({
        success: true,
        location: { lat, lng },
        radius,
        daysBack: days,
        totalCrimes: crimes.length,
        crimes: crimes.slice(0, 100), // Limit response size
      });

    } catch (error) {
      fastify.log.error('Crime data error:', error);
      return reply.status(500).send({
        error: 'Failed to get crime data',
        message: 'Unable to fetch crime statistics',
      });
    }
  });

  /**
   * GET /api/safety/crime/realtime
   * Get real-time CAD dispatch data
   */
  fastify.get('/crime/realtime', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          radius: { type: 'number', default: 1000 }, // meters
        },
      },
    },
  }, async (request, reply) => {
    const { lat, lng, radius } = request.query;

    try {
      const incidents = await getRealtimeCadData(lat, lng, radius);

      return reply.send({
        success: true,
        location: { lat, lng },
        radius,
        totalIncidents: incidents.length,
        incidents,
      });

    } catch (error) {
      fastify.log.error('CAD data error:', error);
      return reply.status(500).send({
        error: 'Failed to get real-time data',
        message: 'Unable to fetch current incident data',
      });
    }
  });

  // ==============================================
  // LIGHTING DATA
  // ==============================================

  /**
   * GET /api/safety/lighting
   * Get streetlight complaint data for a location
   */
  fastify.get('/lighting', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          radius: { type: 'number', default: 500 }, // meters
        },
      },
    },
  }, async (request, reply) => {
    const { lat, lng, radius } = request.query;

    try {
      const complaints = await getStreetlightComplaints(lat, lng, radius);

      return reply.send({
        success: true,
        location: { lat, lng },
        radius,
        totalComplaints: complaints.length,
        complaints,
      });

    } catch (error) {
      fastify.log.error('Lighting data error:', error);
      return reply.status(500).send({
        error: 'Failed to get lighting data',
        message: 'Unable to fetch streetlight information',
      });
    }
  });

  // ==============================================
  // SUNSET/SUNRISE DATA
  // ==============================================

  /**
   * GET /api/safety/sunset
   * Get sunrise/sunset times for a location
   */
  fastify.get('/sunset', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number', default: 37.7749 }, // SF default
          lng: { type: 'number', default: -122.4194 },
          date: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (request, reply) => {
    const { lat, lng, date } = request.query;

    try {
      const sunData = await getSunsetData(lat, lng, date);

      return reply.send({
        success: true,
        location: { lat, lng },
        date: date || new Date().toISOString().split('T')[0],
        ...sunData,
      });

    } catch (error) {
      fastify.log.error('Sunset data error:', error);
      return reply.status(500).send({
        error: 'Failed to get sunset data',
        message: 'Unable to fetch sunrise/sunset times',
      });
    }
  });

  // ==============================================
  // AGGREGATE SAFETY SCORE
  // ==============================================

  /**
   * GET /api/safety/score
   * Get aggregate safety score for a location
   */
  fastify.get('/score', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          radius: { type: 'number', default: 500 },
        },
      },
    },
  }, async (request, reply) => {
    const { lat, lng, radius } = request.query;

    try {
      // Gather all data in parallel
      const [crimes, realtimeIncidents, lightingComplaints, sunData] = await Promise.all([
        getCrimeData(lat, lng, radius, 90),
        getRealtimeCadData(lat, lng, radius),
        getStreetlightComplaints(lat, lng, radius),
        getSunsetData(lat, lng),
      ]);

      // Calculate simple safety score
      // This is a simplified version - the full algorithm is in pathAlgorithm.js
      const crimeScore = Math.max(0, 100 - (crimes.length * 2));
      const realtimeScore = Math.max(0, 100 - (realtimeIncidents.length * 10));
      const lightingScore = Math.max(0, 100 - (lightingComplaints.length * 5));

      // Time-based modifier
      const now = new Date();
      const sunset = new Date(sunData.sunset);
      const sunrise = new Date(sunData.sunrise);
      const isDark = now < sunrise || now > sunset;
      const timeModifier = isDark ? 0.85 : 1.0;

      // Weighted average
      const rawScore = (
        crimeScore * 0.4 +
        realtimeScore * 0.2 +
        lightingScore * 0.2 +
        80 * 0.2 // Base foot traffic score
      ) * timeModifier;

      const finalScore = Math.round(Math.max(20, Math.min(100, rawScore)));

      return reply.send({
        success: true,
        location: { lat, lng },
        safetyScore: finalScore,
        breakdown: {
          crimeScore: Math.round(crimeScore),
          realtimeScore: Math.round(realtimeScore),
          lightingScore: Math.round(lightingScore),
          timeModifier,
          isDark,
        },
        data: {
          crimesNearby: crimes.length,
          activeIncidents: realtimeIncidents.length,
          lightingComplaints: lightingComplaints.length,
        },
      });

    } catch (error) {
      fastify.log.error('Safety score error:', error);
      return reply.status(500).send({
        error: 'Failed to calculate safety score',
        message: 'Unable to calculate area safety',
      });
    }
  });

  // ==============================================
  // HEATMAP DATA
  // ==============================================

  /**
   * GET /api/safety/heatmap
   * Get crime heatmap data for an area
   */
  fastify.get('/heatmap', {
    schema: {
      querystring: {
        type: 'object',
        required: ['north', 'south', 'east', 'west'],
        properties: {
          north: { type: 'number' },
          south: { type: 'number' },
          east: { type: 'number' },
          west: { type: 'number' },
          days: { type: 'integer', default: 30 },
        },
      },
    },
  }, async (request, reply) => {
    const { north, south, east, west, days } = request.query;

    try {
      // Calculate center point
      const centerLat = (north + south) / 2;
      const centerLng = (east + west) / 2;

      // Calculate radius (approximate)
      const latDiff = (north - south) * 111000; // degrees to meters
      const lngDiff = (east - west) * 111000 * Math.cos(centerLat * Math.PI / 180);
      const radius = Math.max(latDiff, lngDiff) / 2;

      const crimes = await getCrimeData(centerLat, centerLng, radius, days);

      // Format for heatmap
      const heatmapData = crimes
        .filter(c => c.latitude && c.longitude)
        .map(c => ({
          lat: parseFloat(c.latitude),
          lng: parseFloat(c.longitude),
          weight: c.isViolent ? 2 : 1,
        }));

      return reply.send({
        success: true,
        bounds: { north, south, east, west },
        daysBack: days,
        totalPoints: heatmapData.length,
        heatmapData,
      });

    } catch (error) {
      fastify.log.error('Heatmap error:', error);
      return reply.status(500).send({
        error: 'Failed to get heatmap data',
        message: 'Unable to generate crime heatmap',
      });
    }
  });
}
