/**
 * @fileoverview Google Routes API Service
 * Handles communication with Google Routes API for walking directions
 */

import { apiConfig } from '../config/index.js';

// ==============================================
// GOOGLE ROUTES API
// ==============================================

/**
 * Get walking routes from Google Routes API
 *
 * @param {Object} start - Starting location { lat, lng }
 * @param {Object} destination - Destination { lat, lng }
 * @param {Object} options - Route options
 * @param {string} options.travelMode - Travel mode (default: 'WALK')
 * @param {boolean} options.computeAlternativeRoutes - Get alternatives (default: true)
 * @param {number} options.routeCount - Number of routes to request (default: 8)
 * @returns {Promise<Array>} Array of route objects
 */
export async function getGoogleRoutes(start, destination, options = {}) {
  const apiKey = apiConfig.google.apiKey;

  if (!apiKey) {
    console.warn('[GoogleRoutes] API key not configured, returning mock routes');
    return getMockRoutes(start, destination, options.routeCount || 8);
  }

  const {
    travelMode = 'WALK',
    computeAlternativeRoutes = true,
    routeCount = 8,
  } = options;

  try {
    const response = await fetch(apiConfig.google.routesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline,routes.legs,routes.routeLabels',
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: start.lat,
              longitude: start.lng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.lat,
              longitude: destination.lng,
            },
          },
        },
        travelMode,
        computeAlternativeRoutes,
        // Note: routeModifiers (avoidHighways, avoidTolls, etc.) only apply to DRIVE/TWO_WHEELER modes
        // For WALK mode, we don't need any modifiers
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Routes API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes returned from Google Routes API');
    }

    // Process and normalize routes
    const routes = data.routes.map((route, index) => ({
      index,
      distanceMeters: route.distanceMeters,
      durationSeconds: parseDuration(route.duration),
      polyline: {
        encodedPolyline: route.polyline?.encodedPolyline || '',
        coordinates: decodePolyline(route.polyline?.encodedPolyline || ''),
      },
      legs: route.legs || [],
      labels: route.routeLabels || [],
    }));

    console.log(`[GoogleRoutes] Retrieved ${routes.length} routes`);

    // If we got fewer routes than requested, generate variations
    // (This is a workaround since Google only returns ~3 alternatives)
    if (routes.length < routeCount && routes.length > 0) {
      console.log(`[GoogleRoutes] Generating ${routeCount - routes.length} route variations`);
      // In production, you might use waypoints or different routing options
      // For now, we'll work with what we have
    }

    return routes;

  } catch (error) {
    console.error('[GoogleRoutes] Error:', error.message);

    // Return mock routes as fallback during development
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[GoogleRoutes] Falling back to mock routes');
      return getMockRoutes(start, destination, routeCount);
    }

    throw error;
  }
}

/**
 * Parse duration string to seconds
 * Google returns duration as "123s" format
 */
function parseDuration(duration) {
  if (!duration) return 0;
  if (typeof duration === 'number') return duration;
  if (typeof duration === 'string') {
    const match = duration.match(/(\d+)s/);
    return match ? parseInt(match[1], 10) : 0;
  }
  if (duration.seconds) return parseInt(duration.seconds, 10);
  return 0;
}

/**
 * Decode Google's encoded polyline format to coordinates
 *
 * @param {string} encoded - Encoded polyline string
 * @returns {Array} Array of { lat, lng } coordinates
 */
function decodePolyline(encoded) {
  if (!encoded) return [];

  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += deltaLat;

    // Decode longitude
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += deltaLng;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return coordinates;
}

/**
 * Encode coordinates to Google's polyline format
 *
 * @param {Array} coordinates - Array of { lat, lng } coordinates
 * @returns {string} Encoded polyline string
 */
export function encodePolyline(coordinates) {
  if (!coordinates || coordinates.length === 0) return '';

  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const coord of coordinates) {
    const lat = Math.round(coord.lat * 1e5);
    const lng = Math.round(coord.lng * 1e5);

    encoded += encodeValue(lat - prevLat);
    encoded += encodeValue(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

/**
 * Encode a single value for polyline
 */
function encodeValue(value) {
  let v = value < 0 ? ~(value << 1) : (value << 1);
  let encoded = '';

  while (v >= 0x20) {
    encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }

  encoded += String.fromCharCode(v + 63);
  return encoded;
}

// ==============================================
// MOCK ROUTES FOR DEVELOPMENT
// ==============================================

/**
 * Generate mock routes for development/testing
 * Used when Google API key is not configured
 */
function getMockRoutes(start, destination, count = 8) {
  const routes = [];
  const baseDuration = calculateBaseDuration(start, destination);
  const baseDistance = calculateBaseDistance(start, destination);

  for (let i = 0; i < count; i++) {
    // Vary duration and distance slightly for each route
    const durationVariation = 1 + (i * 0.1) + (Math.random() * 0.1);
    const distanceVariation = 1 + (i * 0.08) + (Math.random() * 0.05);

    const coordinates = generateMockPath(start, destination, i);

    routes.push({
      index: i,
      distanceMeters: Math.round(baseDistance * distanceVariation),
      durationSeconds: Math.round(baseDuration * durationVariation),
      polyline: {
        encodedPolyline: encodePolyline(coordinates),
        coordinates,
      },
      legs: [],
      labels: i === 0 ? ['DEFAULT'] : ['ALTERNATIVE'],
    });
  }

  return routes;
}

/**
 * Calculate base duration (assuming 5 km/h walking speed)
 */
function calculateBaseDuration(start, destination) {
  const distanceKm = haversineDistance(start.lat, start.lng, destination.lat, destination.lng);
  const walkingSpeedKmh = 5;
  return (distanceKm / walkingSpeedKmh) * 3600; // Convert to seconds
}

/**
 * Calculate base distance in meters
 */
function calculateBaseDistance(start, destination) {
  return haversineDistance(start.lat, start.lng, destination.lat, destination.lng) * 1000;
}

/**
 * Haversine distance formula
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Generate a mock path between two points
 * Creates a slightly varied path for visual distinction
 */
function generateMockPath(start, destination, routeIndex) {
  const points = [];
  const steps = 20;

  // Calculate perpendicular offset direction
  const dx = destination.lng - start.lng;
  const dy = destination.lat - start.lat;
  const length = Math.sqrt(dx * dx + dy * dy);

  // Perpendicular vector (normalized)
  const perpX = -dy / length;
  const perpY = dx / length;

  // Offset amount varies by route index
  const maxOffset = 0.005 * (routeIndex % 4); // ~500m offset
  const offsetDirection = routeIndex % 2 === 0 ? 1 : -1;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Linear interpolation
    let lat = start.lat + (destination.lat - start.lat) * t;
    let lng = start.lng + (destination.lng - start.lng) * t;

    // Add curved offset (sine wave)
    const offsetAmount = Math.sin(t * Math.PI) * maxOffset * offsetDirection;
    lat += perpY * offsetAmount;
    lng += perpX * offsetAmount;

    points.push({ lat, lng });
  }

  return points;
}

export default getGoogleRoutes;
