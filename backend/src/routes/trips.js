/**
 * @fileoverview Trip Sharing Routes
 * API endpoints for trip lifecycle, notifications, and sharing
 */

import * as tripService from '../services/tripService.js';
// BETA: Notification service disabled - using manual SMS for beta
// Re-enable when Twilio A2P registration is complete
// import * as notificationService from '../services/notificationService.js';
import * as arrivalService from '../services/arrivalService.js';
import { query } from '../db/connection.js';
import { formatMessage, formatETA, formatLocation } from '../services/twilioService.js';

/**
 * Trip routes plugin for Fastify
 * @param {FastifyInstance} fastify - Fastify instance
 */
export default async function tripRoutes(fastify) {

  // All trip routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // ==============================================
  // TRIP LIFECYCLE
  // ==============================================

  /**
   * POST /api/trips
   * Start a new trip with optional sharing
   */
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['startLat', 'startLng', 'endLat', 'endLng'],
        properties: {
          startLat: { type: 'number' },
          startLng: { type: 'number' },
          endLat: { type: 'number' },
          endLng: { type: 'number' },
          originName: { type: 'string' },
          destinationName: { type: 'string' },
          estimatedArrivalMinutes: { type: 'number' },
          sharingEnabled: { type: 'boolean' },
          routeHistoryId: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const {
      startLat, startLng, endLat, endLng,
      originName, destinationName,
      estimatedArrivalMinutes,
      sharingEnabled,
      routeHistoryId,
    } = request.body;

    try {
      // Check for existing active trip
      const activeTrip = await tripService.getActiveTrip(request.user.id);
      if (activeTrip) {
        return reply.status(409).send({
          error: 'Active trip exists',
          message: 'Please end your current trip before starting a new one',
          tripId: activeTrip.id,
        });
      }

      // Calculate estimated arrival time
      let estimatedArrival = null;
      if (estimatedArrivalMinutes) {
        estimatedArrival = new Date(Date.now() + estimatedArrivalMinutes * 60 * 1000);
      }

      // Get user's sharing preference if not specified
      let shouldShare = sharingEnabled;
      if (shouldShare === undefined) {
        const prefs = await tripService.getTripSharingPreferences(request.user.id);
        shouldShare = prefs.share_trips_default;
      }

      // Create trip
      const trip = await tripService.createTrip({
        userId: request.user.id,
        routeHistoryId,
        startLat,
        startLng,
        endLat,
        endLng,
        originName,
        destinationName,
        estimatedArrival,
        sharingEnabled: shouldShare,
      });

      // BETA: Automatic notifications disabled - frontend handles manual SMS
      // Re-enable when Twilio A2P registration is complete
      // let notificationResult = null;
      // if (shouldShare) {
      //   notificationResult = await notificationService.notifyTripStarted(trip.id);
      // }

      return reply.status(201).send({
        message: 'Trip started',
        trip: {
          id: trip.id,
          status: trip.status,
          destinationName: trip.destination_name,
          estimatedArrival: trip.estimated_arrival,
          sharingEnabled: trip.sharing_enabled,
        },
        // BETA: notifications field will be null until Twilio is enabled
        notifications: null,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to start trip',
        message: 'An error occurred',
      });
    }
  });

  /**
   * GET /api/trips/active
   * Get user's current active trip
   */
  fastify.get('/active', async (request, reply) => {
    try {
      const trip = await tripService.getActiveTrip(request.user.id);

      if (!trip) {
        return reply.status(404).send({
          error: 'No active trip',
          message: 'You have no active trip',
        });
      }

      return reply.send({ trip });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get active trip',
        message: 'An error occurred',
      });
    }
  });

  /**
   * GET /api/trips/:id
   * Get a specific trip
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const trip = await tripService.getTripById(id);

      if (!trip) {
        return reply.status(404).send({
          error: 'Trip not found',
        });
      }

      // Ensure user owns this trip
      if (trip.user_id !== request.user.id) {
        return reply.status(403).send({
          error: 'Access denied',
        });
      }

      // BETA: Get notifications directly from DB (notificationService disabled)
      const notifResult = await query(
        `SELECT tn.*, c.name as contact_name, c.phone_number
         FROM trip_notifications tn
         JOIN contacts c ON tn.contact_id = c.id
         WHERE tn.trip_id = $1
         ORDER BY tn.created_at DESC`,
        [id]
      );
      const notifications = notifResult.rows;

      return reply.send({ trip, notifications });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get trip',
        message: 'An error occurred',
      });
    }
  });

  /**
   * GET /api/trips
   * Get user's recent trips
   */
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const { limit } = request.query;

    try {
      const trips = await tripService.getUserTrips(request.user.id, limit);
      return reply.send({ trips });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get trips',
        message: 'An error occurred',
      });
    }
  });

  // ==============================================
  // TRIP STATUS UPDATES
  // ==============================================

  /**
   * PATCH /api/trips/:id/status
   * Update trip status (arrived, cancelled)
   */
  fastify.patch('/:id/status', {
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['arrived', 'cancelled'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;

    try {
      const trip = await tripService.getTripById(id);

      if (!trip) {
        return reply.status(404).send({ error: 'Trip not found' });
      }

      if (trip.user_id !== request.user.id) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      // Check valid state transition
      if (!['started', 'in_progress'].includes(trip.status)) {
        return reply.status(400).send({
          error: 'Invalid status transition',
          message: `Cannot change status from ${trip.status} to ${status}`,
        });
      }

      // Update status
      const updatedTrip = await tripService.updateTripStatus(id, status);

      // BETA: Automatic notifications disabled - frontend handles manual SMS
      // Re-enable when Twilio A2P registration is complete
      // let notificationResult = null;
      // if (trip.sharing_enabled) {
      //   if (status === 'arrived') {
      //     notificationResult = await notificationService.notifyArrived(id);
      //   } else if (status === 'cancelled') {
      //     notificationResult = await notificationService.notifyCancelled(id);
      //   }
      // }

      return reply.send({
        message: `Trip marked as ${status}`,
        trip: updatedTrip,
        notifications: null,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to update trip status',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/trips/:id/location
   * Update current location during trip
   */
  fastify.post('/:id/location', {
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
    const { id } = request.params;
    const { lat, lng } = request.body;

    try {
      const trip = await tripService.getTripById(id);

      if (!trip) {
        return reply.status(404).send({ error: 'Trip not found' });
      }

      if (trip.user_id !== request.user.id) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      if (!['started', 'in_progress'].includes(trip.status)) {
        return reply.status(400).send({
          error: 'Trip not active',
          message: 'Cannot update location for completed trip',
        });
      }

      // Process location update with automatic arrival detection
      const result = await arrivalService.processLocationUpdate(id, lat, lng);

      return reply.send({
        message: result.arrived ? 'Arrived at destination' : 'Location updated',
        arrived: result.arrived,
        distanceToDestination: Math.round(result.distance),
        notifications: result.notifications,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to update location',
        message: 'An error occurred',
      });
    }
  });

  // ==============================================
  // CHECK-IN AND SOS
  // ==============================================

  /**
   * POST /api/trips/:id/check-in
   * Send "I'm OK" check-in to contacts
   */
  fastify.post('/:id/check-in', async (request, reply) => {
    const { id } = request.params;

    try {
      const trip = await tripService.getTripById(id);

      if (!trip) {
        return reply.status(404).send({ error: 'Trip not found' });
      }

      if (trip.user_id !== request.user.id) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      if (!trip.sharing_enabled) {
        return reply.status(400).send({
          error: 'Sharing not enabled',
          message: 'This trip is not being shared with contacts',
        });
      }

      // BETA: Automatic notifications disabled - frontend handles manual SMS
      // Re-enable when Twilio A2P registration is complete
      // const notificationResult = await notificationService.notifyCheckIn(id);

      return reply.send({
        message: 'Check-in ready',
        // BETA: Return message content for manual SMS
        manualSms: true,
        notifications: null,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to send check-in',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/trips/:id/sos
   * Trigger SOS emergency alert
   */
  fastify.post('/:id/sos', async (request, reply) => {
    const { id } = request.params;

    try {
      const trip = await tripService.getTripById(id);

      if (!trip) {
        return reply.status(404).send({ error: 'Trip not found' });
      }

      if (trip.user_id !== request.user.id) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      // Update trip status to SOS
      await tripService.updateTripStatus(id, 'sos');

      // BETA: Automatic notifications disabled - frontend handles manual SMS
      // Re-enable when Twilio A2P registration is complete
      // const notificationResult = await notificationService.notifySOS(id);

      return reply.send({
        message: 'SOS status updated',
        // BETA: Frontend will open SMS app with SOS message
        manualSms: true,
        notifications: null,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to send SOS',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/trips/sos
   * Standalone SOS (no active trip)
   */
  fastify.post('/sos', {
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
      // Check for active trip first
      const activeTrip = await tripService.getActiveTrip(request.user.id);

      if (activeTrip) {
        // Use trip-based SOS
        await tripService.updateTripStatus(activeTrip.id, 'sos');
        await tripService.updateTripLocation(activeTrip.id, lat, lng);

        // BETA: Automatic notifications disabled - frontend handles manual SMS
        // Re-enable when Twilio A2P registration is complete
        // const notificationResult = await notificationService.notifySOS(activeTrip.id);

        return reply.send({
          message: 'SOS status updated',
          tripId: activeTrip.id,
          manualSms: true,
          notifications: null,
        });
      }

      // Standalone SOS - BETA: No automatic SMS, frontend handles it
      // const notificationResult = await notificationService.sendStandaloneSOS(
      //   request.user.id,
      //   lat,
      //   lng
      // );

      return reply.send({
        message: 'SOS logged',
        manualSms: true,
        notifications: null,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to send SOS',
        message: 'An error occurred',
      });
    }
  });

  // ==============================================
  // BETA: MANUAL SMS SUPPORT
  // ==============================================

  /**
   * GET /api/trips/:id/share-message
   * Get formatted message for manual SMS sharing
   * BETA: Used when Twilio is not configured
   */
  fastify.get('/:id/share-message', {
    schema: {
      querystring: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['started', 'arrived', 'check_in', 'sos'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { type } = request.query;

    try {
      const trip = await tripService.getTripById(id);

      if (!trip) {
        return reply.status(404).send({ error: 'Trip not found' });
      }

      if (trip.user_id !== request.user.id) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      // Get user info for message
      const userResult = await query(
        'SELECT email, username FROM users WHERE id = $1',
        [trip.user_id]
      );
      const user = userResult.rows[0];
      const userName = user.username || user.email.split('@')[0];

      // Build message data
      const messageData = {
        userName,
        destination: trip.destination_name || 'my destination',
        origin: trip.origin_name || 'my location',
        eta: formatETA(trip.estimated_arrival),
        location: formatLocation(
          trip.current_lat || trip.start_lat,
          trip.current_lng || trip.start_lng
        ),
        time: new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      };

      const message = formatMessage(type, messageData);

      return reply.send({
        message,
        type,
        tripId: id,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to generate message',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/trips/:id/log-share-intent
   * Log when user opens SMS app for manual sharing
   * BETA: Used for analytics when Twilio is not configured
   */
  fastify.post('/:id/log-share-intent', {
    schema: {
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['started', 'arrived', 'check_in', 'sos'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { type } = request.body;

    try {
      const trip = await tripService.getTripById(id);

      if (!trip) {
        return reply.status(404).send({ error: 'Trip not found' });
      }

      if (trip.user_id !== request.user.id) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      // Log the share intent
      await query(
        `INSERT INTO share_intents (user_id, trip_id, intent_type) VALUES ($1, $2, $3)`,
        [request.user.id, id, type]
      );

      console.log(`[ShareIntent] User ${request.user.id} opened SMS for trip ${id} (type: ${type})`);

      return reply.send({ logged: true });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to log intent',
        message: 'An error occurred',
      });
    }
  });

  /**
   * GET /api/trips/sos-message
   * Get formatted SOS message without active trip
   * BETA: Used for standalone SOS when Twilio is not configured
   */
  fastify.get('/sos-message', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const { lat, lng } = request.query;

    try {
      // Get user info for message
      const userResult = await query(
        'SELECT email, username FROM users WHERE id = $1',
        [request.user.id]
      );
      const user = userResult.rows[0];
      const userName = user.username || user.email.split('@')[0];

      const messageData = {
        userName,
        location: formatLocation(lat, lng),
        time: new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        destination: null,
      };

      const message = formatMessage('sos', messageData);

      return reply.send({
        message,
        type: 'sos',
        // Include Google Maps link for easy sharing
        mapsLink: `https://maps.google.com/?q=${lat},${lng}`,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to generate SOS message',
        message: 'An error occurred',
      });
    }
  });

  /**
   * POST /api/trips/log-sos-intent
   * Log standalone SOS intent (no active trip)
   * BETA: Used for analytics
   */
  fastify.post('/log-sos-intent', {
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
      // Log the SOS intent without a trip
      await query(
        `INSERT INTO share_intents (user_id, trip_id, intent_type) VALUES ($1, NULL, 'sos')`,
        [request.user.id]
      );

      console.log(`[ShareIntent] User ${request.user.id} opened SMS for SOS (no trip) at ${lat}, ${lng}`);

      return reply.send({ logged: true });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to log SOS intent',
        message: 'An error occurred',
      });
    }
  });

  // ==============================================
  // TRIP SHARING PREFERENCES
  // ==============================================

  /**
   * GET /api/trips/preferences
   * Get trip sharing preferences
   */
  fastify.get('/preferences', async (request, reply) => {
    try {
      const prefs = await tripService.getTripSharingPreferences(request.user.id);
      return reply.send({ preferences: prefs });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get preferences',
        message: 'An error occurred',
      });
    }
  });

  /**
   * PUT /api/trips/preferences
   * Update trip sharing preferences
   */
  fastify.put('/preferences', {
    schema: {
      body: {
        type: 'object',
        properties: {
          shareTripsDefault: { type: 'boolean' },
          notifyOnArrival: { type: 'boolean' },
          notifyOnDelay: { type: 'boolean' },
          delayThresholdMinutes: { type: 'integer', minimum: 5, maximum: 60 },
        },
      },
    },
  }, async (request, reply) => {
    const {
      shareTripsDefault,
      notifyOnArrival,
      notifyOnDelay,
      delayThresholdMinutes,
    } = request.body;

    try {
      const prefs = await tripService.updateTripSharingPreferences(request.user.id, {
        share_trips_default: shareTripsDefault,
        notify_on_arrival: notifyOnArrival,
        notify_on_delay: notifyOnDelay,
        delay_threshold_minutes: delayThresholdMinutes,
      });

      return reply.send({
        message: 'Preferences updated',
        preferences: prefs,
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to update preferences',
        message: 'An error occurred',
      });
    }
  });
}
