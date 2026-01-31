/**
 * @fileoverview Trip Service
 * Handles trip lifecycle management for trip sharing feature
 */

import { query } from '../db/connection.js';

// ==============================================
// TRIP CRUD OPERATIONS
// ==============================================

/**
 * Create a new trip
 * @param {Object} tripData - Trip details
 * @returns {Promise<Object>} Created trip
 */
export async function createTrip({
  userId,
  routeHistoryId = null,
  startLat,
  startLng,
  endLat,
  endLng,
  originName = null,
  destinationName = null,
  estimatedArrival = null,
  sharingEnabled = true,
}) {
  const result = await query(
    `INSERT INTO trips (
      user_id, route_history_id, status,
      start_lat, start_lng, end_lat, end_lng,
      origin_name, destination_name,
      estimated_arrival, sharing_enabled
    ) VALUES ($1, $2, 'started', $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      userId, routeHistoryId,
      startLat, startLng, endLat, endLng,
      originName, destinationName,
      estimatedArrival, sharingEnabled,
    ]
  );

  console.log('[TripService] Created trip:', result.rows[0].id, 'for user:', userId);
  return result.rows[0];
}

/**
 * Get a trip by ID
 * @param {number} tripId
 * @returns {Promise<Object|null>}
 */
export async function getTripById(tripId) {
  const result = await query(
    'SELECT * FROM trips WHERE id = $1',
    [tripId]
  );
  return result.rows[0] || null;
}

/**
 * Get user's active trip (started or in_progress)
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
export async function getActiveTrip(userId) {
  const result = await query(
    `SELECT * FROM trips
     WHERE user_id = $1 AND status IN ('started', 'in_progress')
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Get user's recent trips
 * @param {number} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getUserTrips(userId, limit = 10) {
  const result = await query(
    `SELECT * FROM trips
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

// ==============================================
// TRIP STATUS UPDATES
// ==============================================

/**
 * Update trip status
 * @param {number} tripId
 * @param {string} status - 'started', 'in_progress', 'arrived', 'cancelled', 'sos'
 * @returns {Promise<Object>} Updated trip
 */
export async function updateTripStatus(tripId, status) {
  const updates = { status };

  // Set actual_arrival for terminal states
  if (status === 'arrived') {
    updates.actual_arrival = new Date();
  }

  const setClauses = Object.keys(updates)
    .map((key, i) => `${toSnakeCase(key)} = $${i + 2}`)
    .join(', ');

  const result = await query(
    `UPDATE trips SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [tripId, ...Object.values(updates)]
  );

  console.log('[TripService] Updated trip', tripId, 'status to:', status);
  return result.rows[0];
}

/**
 * Update trip location
 * @param {number} tripId
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Object>} Updated trip
 */
export async function updateTripLocation(tripId, lat, lng) {
  const result = await query(
    `UPDATE trips SET
      current_lat = $2,
      current_lng = $3,
      last_location_update = CURRENT_TIMESTAMP,
      status = CASE WHEN status = 'started' THEN 'in_progress' ELSE status END,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [tripId, lat, lng]
  );

  return result.rows[0];
}

/**
 * Mark trip as delay-notified (to prevent duplicate notifications)
 * @param {number} tripId
 * @returns {Promise<void>}
 */
export async function markDelayNotified(tripId) {
  await query(
    `UPDATE trips SET delay_notified = true, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [tripId]
  );
}

// ==============================================
// DELAY DETECTION
// ==============================================

/**
 * Check if trip is delayed past threshold
 * @param {Object} trip
 * @param {number} thresholdMinutes
 * @returns {{isDelayed: boolean, minutesOver: number}}
 */
export function checkTripDelay(trip, thresholdMinutes = 15) {
  if (!trip.estimated_arrival) {
    return { isDelayed: false, minutesOver: 0 };
  }

  const now = new Date();
  const eta = new Date(trip.estimated_arrival);
  const diffMs = now - eta;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  return {
    isDelayed: diffMinutes >= thresholdMinutes,
    minutesOver: Math.max(0, diffMinutes),
  };
}

/**
 * Get all active trips that are delayed and haven't been notified
 * @param {number} thresholdMinutes - Default delay threshold
 * @returns {Promise<Array>} Array of delayed trips with user preferences
 */
export async function getDelayedTrips(thresholdMinutes = 15) {
  const result = await query(
    `SELECT t.*, sp.delay_threshold_minutes, sp.notify_on_delay
     FROM trips t
     LEFT JOIN safety_preferences sp ON t.user_id = sp.user_id
     WHERE t.status IN ('started', 'in_progress')
       AND t.sharing_enabled = true
       AND t.delay_notified = false
       AND t.estimated_arrival IS NOT NULL
       AND t.estimated_arrival < (CURRENT_TIMESTAMP - INTERVAL '1 minute' * COALESCE(sp.delay_threshold_minutes, $1))`,
    [thresholdMinutes]
  );

  return result.rows;
}

// ==============================================
// USER PREFERENCES
// ==============================================

/**
 * Get user's trip sharing preferences
 * @param {number} userId
 * @returns {Promise<Object>}
 */
export async function getTripSharingPreferences(userId) {
  const result = await query(
    `SELECT share_trips_default, notify_on_arrival, notify_on_delay, delay_threshold_minutes
     FROM safety_preferences WHERE user_id = $1`,
    [userId]
  );

  // Return defaults if no preferences set
  if (!result.rows[0]) {
    return {
      share_trips_default: true,
      notify_on_arrival: true,
      notify_on_delay: true,
      delay_threshold_minutes: 15,
    };
  }

  return result.rows[0];
}

/**
 * Update user's trip sharing preferences
 * @param {number} userId
 * @param {Object} prefs
 * @returns {Promise<Object>}
 */
export async function updateTripSharingPreferences(userId, prefs) {
  // Upsert safety_preferences
  const result = await query(
    `INSERT INTO safety_preferences (user_id, share_trips_default, notify_on_arrival, notify_on_delay, delay_threshold_minutes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       share_trips_default = COALESCE($2, safety_preferences.share_trips_default),
       notify_on_arrival = COALESCE($3, safety_preferences.notify_on_arrival),
       notify_on_delay = COALESCE($4, safety_preferences.notify_on_delay),
       delay_threshold_minutes = COALESCE($5, safety_preferences.delay_threshold_minutes),
       updated_at = CURRENT_TIMESTAMP
     RETURNING share_trips_default, notify_on_arrival, notify_on_delay, delay_threshold_minutes`,
    [
      userId,
      prefs.share_trips_default,
      prefs.notify_on_arrival,
      prefs.notify_on_delay,
      prefs.delay_threshold_minutes,
    ]
  );

  return result.rows[0];
}

// ==============================================
// HELPERS
// ==============================================

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export default {
  createTrip,
  getTripById,
  getActiveTrip,
  getUserTrips,
  updateTripStatus,
  updateTripLocation,
  markDelayNotified,
  checkTripDelay,
  getDelayedTrips,
  getTripSharingPreferences,
  updateTripSharingPreferences,
};
