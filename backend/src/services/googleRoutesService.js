/**
 * @fileoverview Google Routes API Service
 * Handles communication with Google Routes API for walking directions
 *
 * Provides two main functions:
 * 1. getGoogleRoutes() - Get base routes from Google (1-3 routes)
 * 2. getRoutesWithWaypoints() - Get additional route variations via strategic waypoints
 */

import { apiConfig } from '../config/index.js';
import { reverseGeocode } from './geocodingService.js';
import { withCircuitBreaker } from './circuitBreaker.js';

// Circuit breaker config for Google Routes API
const CIRCUIT_CONFIG = {
  failureThreshold: 3,        // Open after 3 consecutive failures
  successThreshold: 2,        // Close after 2 successes in half-open
  timeout: 30000,             // Try half-open after 30 seconds
};

// ==============================================
// GOOGLE ROUTES API - BASE ROUTES
// ==============================================

/**
 * Get walking routes from Google Routes API
 * Returns only the routes Google provides (typically 1-3 for walking)
 * No fake variations are generated.
 *
 * @param {Object} start - Starting location { lat, lng }
 * @param {Object} destination - Destination { lat, lng }
 * @param {Object} options - Route options
 * @param {string} options.travelMode - Travel mode (default: 'WALK')
 * @param {boolean} options.computeAlternativeRoutes - Get alternatives (default: true)
 * @returns {Promise<Array>} Array of route objects
 */
export async function getGoogleRoutes(start, destination, options = {}) {
  const apiKey = apiConfig.google.apiKey;

  if (!apiKey) {
    console.warn('[GoogleRoutes] API key not configured, returning mock routes');
    return getMockRoutes(start, destination, 3);
  }

  const {
    travelMode = 'WALK',
    computeAlternativeRoutes = false, // Single route for beta - no alternatives
  } = options;

  try {
    // Use circuit breaker to prevent cascading failures
    const data = await withCircuitBreaker(
      'google-routes-api',
      async () => {
        const response = await fetch(apiConfig.google.routesUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.startLocation,routes.routeLabels',
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
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Google Routes API error: ${response.status} - ${errorText}`);
        }

        return response.json();
      },
      {
        config: CIRCUIT_CONFIG,
        // No fallback - let the caller handle the error
      }
    );

    // DIAGNOSTIC: Log raw Google API response structure
    console.log('[GoogleRoutes] DIAGNOSTIC - Raw API response keys:', Object.keys(data));
    if (data.routes && data.routes.length > 0) {
      const firstRoute = data.routes[0];
      console.log('[GoogleRoutes] DIAGNOSTIC - First route keys:', Object.keys(firstRoute));
      console.log('[GoogleRoutes] DIAGNOSTIC - First route has legs:', !!firstRoute.legs);
      if (firstRoute.legs && firstRoute.legs.length > 0) {
        console.log('[GoogleRoutes] DIAGNOSTIC - Number of legs:', firstRoute.legs.length);
        console.log('[GoogleRoutes] DIAGNOSTIC - First leg keys:', Object.keys(firstRoute.legs[0]));
        console.log('[GoogleRoutes] DIAGNOSTIC - First leg has steps:', !!firstRoute.legs[0].steps);
        if (firstRoute.legs[0].steps) {
          console.log('[GoogleRoutes] DIAGNOSTIC - Number of steps in first leg:', firstRoute.legs[0].steps.length);
          if (firstRoute.legs[0].steps.length > 0) {
            console.log('[GoogleRoutes] DIAGNOSTIC - First step:', JSON.stringify(firstRoute.legs[0].steps[0], null, 2));
          }
        }
      } else {
        console.log('[GoogleRoutes] DIAGNOSTIC - No legs in first route!');
      }
    }

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes returned from Google Routes API');
    }

    // Process and normalize routes - return ONLY what Google gives us
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
      isGoogleRoute: true, // Flag to identify real Google routes
    }));

    console.log(`[GoogleRoutes] Retrieved ${routes.length} routes from Google`);
    return routes;

  } catch (error) {
    console.error('[GoogleRoutes] Error:', error.message);

    // Return mock routes as fallback during development
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[GoogleRoutes] Falling back to mock routes');
      return getMockRoutes(start, destination, 3);
    }

    throw error;
  }
}

// ==============================================
// WAYPOINT-BASED ROUTE VARIATIONS
// ==============================================

/**
 * Get additional route variations by routing through strategic waypoints
 * Each waypoint creates a genuinely different route that follows real streets
 *
 * @param {Object} start - Starting location { lat, lng }
 * @param {Object} destination - Destination { lat, lng }
 * @param {Object} baseRoute - The primary route to base variations on
 * @param {number} count - Number of variations to generate (default: 5)
 * @returns {Promise<Array>} Array of route variations
 */
export async function getRoutesWithWaypoints(start, destination, baseRoute, count = 5) {
  const apiKey = apiConfig.google.apiKey;

  if (!apiKey) {
    console.warn('[GoogleRoutes] API key not configured, cannot generate waypoint routes');
    return [];
  }

  // Generate strategic waypoint candidates (more than needed to account for duplicates)
  const rawCandidates = generateWaypointCandidates(start, destination, baseRoute, count + 3);
  console.log(`[GoogleRoutes] Generated ${rawCandidates.length} raw waypoint candidates`);

  // Snap waypoints to actual streets using reverse geocoding
  const waypointCandidates = await snapWaypointsToStreets(rawCandidates);
  console.log(`[GoogleRoutes] Validated ${waypointCandidates.length} street-snapped waypoints`);

  const routes = [];
  const seenPolylines = new Set();

  // Add base route polyline to seen set to avoid duplicates
  if (baseRoute?.polyline?.encodedPolyline) {
    seenPolylines.add(baseRoute.polyline.encodedPolyline.substring(0, 50));
  }

  // Request routes through each waypoint
  for (const waypoint of waypointCandidates) {
    if (routes.length >= count) break;

    try {
      const routeWithWaypoint = await getRouteWithWaypoint(start, destination, waypoint, apiKey);

      if (routeWithWaypoint) {
        // Check for duplicate routes (compare first 50 chars of polyline)
        const polylineKey = routeWithWaypoint.polyline.encodedPolyline.substring(0, 50);

        if (!seenPolylines.has(polylineKey)) {
          // Check for backtracking before adding route
          if (routeHasBacktracking(routeWithWaypoint, start, destination)) {
            console.log(`[GoogleRoutes] Rejected route via "${waypoint.streetAddress || 'unknown'}" - backtracking detected`);
            continue;
          }

          seenPolylines.add(polylineKey);
          routes.push({
            ...routeWithWaypoint,
            index: routes.length,
            waypoint: waypoint,
            isWaypointRoute: true,
          });
          console.log(`[GoogleRoutes] Added waypoint route ${routes.length}: ${routeWithWaypoint.distanceMeters}m via "${waypoint.streetAddress || 'unknown'}"`);
        } else {
          console.log(`[GoogleRoutes] Skipped duplicate route via waypoint`);
        }
      }
    } catch (error) {
      console.warn(`[GoogleRoutes] Failed to get route with waypoint:`, error.message);
    }
  }

  console.log(`[GoogleRoutes] Generated ${routes.length} unique waypoint-based routes`);
  return routes;
}

/**
 * Snap waypoint coordinates to actual street addresses using reverse geocoding
 * This ensures waypoints are on real, walkable streets
 *
 * @param {Array} candidates - Array of raw waypoint candidates { lat, lng, description }
 * @returns {Promise<Array>} Array of validated waypoints with street addresses
 */
async function snapWaypointsToStreets(candidates) {
  const validatedWaypoints = [];

  for (const candidate of candidates) {
    try {
      const geocodeResult = await reverseGeocode(candidate.lat, candidate.lng);

      if (geocodeResult.success && geocodeResult.latitude && geocodeResult.longitude) {
        // Use the geocoded location (snapped to street)
        validatedWaypoints.push({
          lat: geocodeResult.latitude,
          lng: geocodeResult.longitude,
          description: candidate.description,
          streetAddress: geocodeResult.formattedAddress,
          originalLat: candidate.lat,
          originalLng: candidate.lng,
        });
      } else {
        // If geocoding fails, still use the original but flag it
        console.warn(`[GoogleRoutes] Could not snap waypoint to street: (${candidate.lat.toFixed(4)}, ${candidate.lng.toFixed(4)})`);
        validatedWaypoints.push({
          ...candidate,
          streetAddress: null,
        });
      }
    } catch (error) {
      console.warn(`[GoogleRoutes] Reverse geocoding failed for waypoint:`, error.message);
      // Still include the waypoint, Google Routes will handle routing to nearest street
      validatedWaypoints.push({
        ...candidate,
        streetAddress: null,
      });
    }
  }

  return validatedWaypoints;
}

/**
 * Generate strategic waypoint candidates for route variations
 * Creates points perpendicular to the route at various distances and positions
 *
 * @param {Object} start - Starting location { lat, lng }
 * @param {Object} destination - Destination { lat, lng }
 * @param {Object} baseRoute - Base route with coordinates
 * @param {number} count - Number of waypoints to generate
 * @returns {Array} Array of waypoint coordinates { lat, lng, description }
 */
function generateWaypointCandidates(start, destination, baseRoute, count) {
  const candidates = [];

  // Calculate perpendicular direction to the route
  const dx = destination.lng - start.lng;
  const dy = destination.lat - start.lat;
  const routeLength = Math.sqrt(dx * dx + dy * dy);

  // Perpendicular unit vectors (normalized)
  const perpLatUnit = -dx / routeLength;
  const perpLngUnit = dy / routeLength;

  // Get key points along the route
  const routePoints = {
    midpoint: null,
    oneThird: null,
    twoThirds: null,
    oneQuarter: null,
    threeQuarters: null,
  };

  if (baseRoute?.polyline?.coordinates?.length > 4) {
    const coords = baseRoute.polyline.coordinates;
    routePoints.midpoint = coords[Math.floor(coords.length / 2)];
    routePoints.oneThird = coords[Math.floor(coords.length / 3)];
    routePoints.twoThirds = coords[Math.floor((coords.length * 2) / 3)];
    routePoints.oneQuarter = coords[Math.floor(coords.length / 4)];
    routePoints.threeQuarters = coords[Math.floor((coords.length * 3) / 4)];
  } else {
    // Fallback to straight-line interpolation
    routePoints.midpoint = {
      lat: (start.lat + destination.lat) / 2,
      lng: (start.lng + destination.lng) / 2,
    };
    routePoints.oneThird = {
      lat: start.lat + (destination.lat - start.lat) / 3,
      lng: start.lng + (destination.lng - start.lng) / 3,
    };
    routePoints.twoThirds = {
      lat: start.lat + ((destination.lat - start.lat) * 2) / 3,
      lng: start.lng + ((destination.lng - start.lng) * 2) / 3,
    };
    routePoints.oneQuarter = {
      lat: start.lat + (destination.lat - start.lat) / 4,
      lng: start.lng + (destination.lng - start.lng) / 4,
    };
    routePoints.threeQuarters = {
      lat: start.lat + ((destination.lat - start.lat) * 3) / 4,
      lng: start.lng + ((destination.lng - start.lng) * 3) / 4,
    };
  }

  // Offset distances in degrees (approximately: 0.001 degree ≈ 111 meters in SF)
  // Using varied distances and positions to maximize route diversity
  const waypointConfigs = [
    // Midpoint variations (primary detours)
    { point: 'midpoint', distance: 0.0025, direction: 1, label: 'mid-north-close' },     // ~275m
    { point: 'midpoint', distance: 0.0025, direction: -1, label: 'mid-south-close' },    // ~275m
    { point: 'midpoint', distance: 0.0045, direction: 1, label: 'mid-north-medium' },    // ~500m
    { point: 'midpoint', distance: 0.0045, direction: -1, label: 'mid-south-medium' },   // ~500m

    // Early route variations (1/3 point)
    { point: 'oneThird', distance: 0.003, direction: 1, label: 'early-north' },          // ~330m
    { point: 'oneThird', distance: 0.003, direction: -1, label: 'early-south' },         // ~330m

    // Late route variations (2/3 point)
    { point: 'twoThirds', distance: 0.003, direction: 1, label: 'late-north' },          // ~330m
    { point: 'twoThirds', distance: 0.003, direction: -1, label: 'late-south' },         // ~330m

    // Quarter point variations for longer routes
    { point: 'oneQuarter', distance: 0.0035, direction: 1, label: 'quarter-north' },     // ~385m
    { point: 'threeQuarters', distance: 0.0035, direction: -1, label: 'threequarter-south' }, // ~385m
  ];

  // Generate waypoints from configurations
  for (let i = 0; i < Math.min(waypointConfigs.length, count); i++) {
    const config = waypointConfigs[i];
    const basePoint = routePoints[config.point];

    if (basePoint) {
      candidates.push({
        lat: basePoint.lat + (perpLatUnit * config.distance * config.direction),
        lng: basePoint.lng + (perpLngUnit * config.distance * config.direction),
        description: config.label,
      });
    }
  }

  return candidates;
}

/**
 * Get a single route that passes through a waypoint
 *
 * @param {Object} start - Starting location { lat, lng }
 * @param {Object} destination - Destination { lat, lng }
 * @param {Object} waypoint - Intermediate waypoint { lat, lng }
 * @param {string} apiKey - Google API key
 * @returns {Promise<Object|null>} Route object or null if failed
 */
async function getRouteWithWaypoint(start, destination, waypoint, apiKey) {
  try {
    const response = await fetch(apiConfig.google.routesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.startLocation,routes.routeLabels',
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
        intermediates: [
          {
            location: {
              latLng: {
                latitude: waypoint.lat,
                longitude: waypoint.lng,
              },
            },
          },
        ],
        travelMode: 'WALK',
        computeAlternativeRoutes: false, // We only need one route per waypoint
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Routes API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    return {
      distanceMeters: route.distanceMeters,
      durationSeconds: parseDuration(route.duration),
      polyline: {
        encodedPolyline: route.polyline?.encodedPolyline || '',
        coordinates: decodePolyline(route.polyline?.encodedPolyline || ''),
      },
      legs: route.legs || [],
      labels: ['WAYPOINT_ROUTE'],
    };

  } catch (error) {
    console.warn(`[GoogleRoutes] Waypoint route failed:`, error.message);
    return null;
  }
}

// ==============================================
// BACKTRACKING DETECTION
// ==============================================

/**
 * Detect if a route exhibits significant backtracking
 * Backtracking occurs when the route reverses direction and retraces its steps
 *
 * Algorithm:
 * 1. Calculate cumulative progress toward destination for each point
 * 2. Detect if progress ever reverses significantly before resuming
 * 3. Flag routes where the reversal exceeds threshold (indicates "go out then come back")
 *
 * @param {Array} coordinates - Array of { lat, lng } route coordinates
 * @param {Object} start - Starting location { lat, lng }
 * @param {Object} destination - Destination { lat, lng }
 * @returns {boolean} True if route backtracks significantly
 */
function detectsBacktracking(coordinates, start, destination) {
  if (!coordinates || coordinates.length < 5) {
    return false; // Not enough points to detect backtracking
  }

  // Calculate distance from each point to destination
  const distancesToDestination = coordinates.map(coord =>
    haversineDistance(coord.lat, coord.lng, destination.lat, destination.lng)
  );

  const totalDistance = haversineDistance(start.lat, start.lng, destination.lat, destination.lng);

  // Track the minimum distance achieved so far (best progress toward destination)
  let minDistanceSoFar = distancesToDestination[0];
  let maxBacktrackAmount = 0;

  // Analyze progress along the route
  for (let i = 1; i < distancesToDestination.length; i++) {
    const currentDist = distancesToDestination[i];

    // If current distance is less than our best, update minimum
    if (currentDist < minDistanceSoFar) {
      minDistanceSoFar = currentDist;
    } else {
      // We're getting further from destination (potential backtracking)
      const backtrackAmount = currentDist - minDistanceSoFar;
      maxBacktrackAmount = Math.max(maxBacktrackAmount, backtrackAmount);
    }
  }

  // Calculate backtrack ratio (how much we went back relative to total route)
  const backtrackRatio = maxBacktrackAmount / totalDistance;

  // Threshold: Flag if backtracking exceeds 15% of total distance
  // This allows for minor street-following deviations while catching
  // significant "go out another street then walk back" patterns
  const BACKTRACK_THRESHOLD = 0.15;

  if (backtrackRatio > BACKTRACK_THRESHOLD) {
    console.log(`[GoogleRoutes] Backtracking detected: ${(backtrackRatio * 100).toFixed(1)}% reversal (threshold: ${BACKTRACK_THRESHOLD * 100}%)`);
    return true;
  }

  return false;
}

/**
 * Additional check: Detect if route crosses itself (loop detection)
 * This catches routes that make unnecessary loops
 *
 * @param {Array} coordinates - Array of { lat, lng } route coordinates
 * @returns {boolean} True if route has significant self-intersection
 */
function detectsSelfCrossing(coordinates) {
  if (!coordinates || coordinates.length < 10) {
    return false;
  }

  // Sample points to check (checking every point would be expensive)
  const sampleRate = Math.max(1, Math.floor(coordinates.length / 20));
  const sampledPoints = coordinates.filter((_, i) => i % sampleRate === 0);

  // Check if any non-adjacent sampled points are too close to each other
  // (indicates route passed through same area twice)
  const PROXIMITY_THRESHOLD = 0.0001; // ~11 meters
  const MIN_INDEX_GAP = 3; // Points must be at least 3 samples apart

  for (let i = 0; i < sampledPoints.length; i++) {
    for (let j = i + MIN_INDEX_GAP; j < sampledPoints.length; j++) {
      const dist = Math.sqrt(
        Math.pow(sampledPoints[i].lat - sampledPoints[j].lat, 2) +
        Math.pow(sampledPoints[i].lng - sampledPoints[j].lng, 2)
      );

      if (dist < PROXIMITY_THRESHOLD) {
        console.log(`[GoogleRoutes] Self-crossing detected: points ${i} and ${j} overlap`);
        return true;
      }
    }
  }

  return false;
}

/**
 * Combined backtracking check for route quality
 * Returns true if route should be rejected due to backtracking
 *
 * @param {Object} route - Route object with polyline.coordinates
 * @param {Object} start - Starting location { lat, lng }
 * @param {Object} destination - Destination { lat, lng }
 * @returns {boolean} True if route backtracks (should be rejected)
 */
function routeHasBacktracking(route, start, destination) {
  const coordinates = route?.polyline?.coordinates;

  if (!coordinates || coordinates.length < 5) {
    return false;
  }

  // Check both backtracking and self-crossing
  return detectsBacktracking(coordinates, start, destination) ||
         detectsSelfCrossing(coordinates);
}

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

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
export function decodePolyline(encoded) {
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
function getMockRoutes(start, destination, count = 3) {
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
      isGoogleRoute: false,
      isMockRoute: true,
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
  const maxOffset = 0.003 * (routeIndex % 3); // ~300m offset max
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
