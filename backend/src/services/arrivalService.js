/**
 * @fileoverview Arrival Detection Service
 * Handles geofence-based arrival detection and delay monitoring for trips
 */

import * as tripService from './tripService.js';
import * as notificationService from './notificationService.js';

// ==============================================
// CONSTANTS
// ==============================================

// Arrival detection radius in meters
const ARRIVAL_RADIUS_METERS = 50;

// Earth's radius in meters (for Haversine formula)
const EARTH_RADIUS_METERS = 6371000;

// Default delay threshold in minutes
const DEFAULT_DELAY_THRESHOLD = 15;

// Delay check interval (5 minutes)
const DELAY_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// ==============================================
// DISTANCE CALCULATION
// ==============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// ==============================================
// ARRIVAL DETECTION
// ==============================================

/**
 * Check if user has arrived at destination
 * @param {number} tripId
 * @param {number} currentLat
 * @param {number} currentLng
 * @returns {Promise<{arrived: boolean, distance: number, trip?: Object, notifications?: Object}>}
 */
export async function checkArrival(tripId, currentLat, currentLng) {
  const trip = await tripService.getTripById(tripId);

  if (!trip) {
    throw new Error(`Trip ${tripId} not found`);
  }

  // Calculate distance to destination
  const distance = calculateDistance(
    currentLat, currentLng,
    parseFloat(trip.end_lat), parseFloat(trip.end_lng)
  );

  const arrived = distance <= ARRIVAL_RADIUS_METERS;

  if (arrived && ['started', 'in_progress'].includes(trip.status)) {
    // Update trip status
    const updatedTrip = await tripService.updateTripStatus(tripId, 'arrived');

    // Send arrival notification if sharing enabled
    let notificationResult = null;
    if (trip.sharing_enabled) {
      notificationResult = await notificationService.notifyArrived(tripId);
    }

    console.log(`[ArrivalService] Trip ${tripId} arrived (${distance.toFixed(1)}m from destination)`);

    return {
      arrived: true,
      distance,
      trip: updatedTrip,
      notifications: notificationResult,
    };
  }

  return {
    arrived: false,
    distance,
  };
}

/**
 * Process a location update for a trip
 * Updates location and checks for arrival
 * @param {number} tripId
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{updated: boolean, arrived: boolean, distance: number}>}
 */
export async function processLocationUpdate(tripId, lat, lng) {
  // Update trip location
  await tripService.updateTripLocation(tripId, lat, lng);

  // Check for arrival
  const arrivalResult = await checkArrival(tripId, lat, lng);

  return {
    updated: true,
    arrived: arrivalResult.arrived,
    distance: arrivalResult.distance,
    notifications: arrivalResult.notifications,
  };
}

// ==============================================
// DELAY MONITORING
// ==============================================

/**
 * Check all active trips for delays and send notifications
 * Should be called periodically (e.g., every 5 minutes)
 * @returns {Promise<{checked: number, delayed: number, notified: number}>}
 */
export async function checkForDelayedTrips() {
  const stats = { checked: 0, delayed: 0, notified: 0 };

  try {
    // Get all delayed trips that haven't been notified yet
    const delayedTrips = await tripService.getDelayedTrips(DEFAULT_DELAY_THRESHOLD);
    stats.checked = delayedTrips.length;

    for (const trip of delayedTrips) {
      // Check if user has notify_on_delay preference enabled (default true)
      if (trip.notify_on_delay === false) {
        continue;
      }

      // Calculate how many minutes over ETA
      const delay = tripService.checkTripDelay(
        trip,
        trip.delay_threshold_minutes || DEFAULT_DELAY_THRESHOLD
      );

      if (delay.isDelayed) {
        stats.delayed++;

        // Send delay notification
        try {
          await notificationService.notifyDelayed(trip.id, delay.minutesOver);

          // Mark trip as delay-notified to prevent duplicate notifications
          await tripService.markDelayNotified(trip.id);
          stats.notified++;

          console.log(`[ArrivalService] Sent delay notification for trip ${trip.id} (${delay.minutesOver} min over ETA)`);
        } catch (notifyError) {
          console.error(`[ArrivalService] Failed to notify delay for trip ${trip.id}:`, notifyError.message);
        }
      }
    }

    if (stats.delayed > 0) {
      console.log(`[ArrivalService] Delay check: ${stats.checked} trips, ${stats.delayed} delayed, ${stats.notified} notified`);
    }

  } catch (error) {
    console.error('[ArrivalService] Error checking for delayed trips:', error.message);
  }

  return stats;
}

// ==============================================
// BACKGROUND JOB
// ==============================================

let delayCheckInterval = null;

/**
 * Start the background delay check job
 */
export function startDelayMonitoring() {
  if (delayCheckInterval) {
    console.warn('[ArrivalService] Delay monitoring already running');
    return;
  }

  console.log('[ArrivalService] Starting delay monitoring (every 5 minutes)');

  // Run immediately on startup
  checkForDelayedTrips();

  // Then run every 5 minutes
  delayCheckInterval = setInterval(checkForDelayedTrips, DELAY_CHECK_INTERVAL_MS);
}

/**
 * Stop the background delay check job
 */
export function stopDelayMonitoring() {
  if (delayCheckInterval) {
    clearInterval(delayCheckInterval);
    delayCheckInterval = null;
    console.log('[ArrivalService] Delay monitoring stopped');
  }
}

/**
 * Check if delay monitoring is running
 */
export function isDelayMonitoringRunning() {
  return delayCheckInterval !== null;
}

export default {
  calculateDistance,
  checkArrival,
  processLocationUpdate,
  checkForDelayedTrips,
  startDelayMonitoring,
  stopDelayMonitoring,
  isDelayMonitoringRunning,
  ARRIVAL_RADIUS_METERS,
};
