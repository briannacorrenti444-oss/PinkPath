/**
 * @fileoverview Foot Traffic Service
 * Estimates pedestrian foot traffic using:
 * - Google Places API (Popular Times when available)
 * - SFMTA Transit stop proximity as a proxy
 * - Time-of-day adjustments
 *
 * NOTE: Google Popular Times requires specific Place IDs and may not be
 * available for all locations. Transit proximity serves as a reliable fallback.
 */

import { apiConfig, cacheConfig } from '../config/index.js';

// In-memory cache
const cache = new Map();

// ==============================================
// TRANSIT STOP DATA (SFMTA GTFS)
// ==============================================

/**
 * Get nearby transit stops from SFMTA GTFS data
 * Transit stops indicate areas with regular foot traffic
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMeters - Search radius in meters (default: 300)
 * @returns {Promise<Array>} Array of nearby transit stops
 */
export async function getNearbyTransitStops(lat, lng, radiusMeters = 300) {
  const cacheKey = `transit_${lat.toFixed(4)}_${lng.toFixed(4)}_${radiusMeters}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheConfig.transit) {
    return cached.data;
  }

  try {
    // Calculate bounding box
    const radiusDegrees = radiusMeters / 111000;
    const bbox = {
      north: lat + radiusDegrees,
      south: lat - radiusDegrees,
      east: lng + radiusDegrees / Math.cos(lat * Math.PI / 180),
      west: lng - radiusDegrees / Math.cos(lat * Math.PI / 180),
    };

    // Query SFMTA GTFS stops data
    const dataset = apiConfig.dataSF.datasets.transitStops;
    const baseUrl = `${apiConfig.dataSF.baseUrl}/${dataset}.json`;

    const whereClause = `
      stop_lat >= ${bbox.south} AND
      stop_lat <= ${bbox.north} AND
      stop_lon >= ${bbox.west} AND
      stop_lon <= ${bbox.east}
    `.replace(/\s+/g, ' ').trim();

    const params = new URLSearchParams({
      '$where': whereClause,
      '$limit': '50',
      '$$app_token': apiConfig.dataSF.appToken,
    });

    const response = await fetch(`${baseUrl}?${params}`);

    if (!response.ok) {
      throw new Error(`SFMTA API error: ${response.status}`);
    }

    const stops = await response.json();

    // Enrich stop data with traffic estimates
    const enrichedStops = stops.map(stop => ({
      stopId: stop.stop_id,
      stopName: stop.stop_name,
      latitude: parseFloat(stop.stop_lat),
      longitude: parseFloat(stop.stop_lon),
      stopCode: stop.stop_code,
      // Estimate traffic based on stop type
      trafficEstimate: estimateStopTraffic(stop),
      distance: calculateDistance(
        lat, lng,
        parseFloat(stop.stop_lat),
        parseFloat(stop.stop_lon)
      ),
    }));

    // Sort by distance
    enrichedStops.sort((a, b) => a.distance - b.distance);

    // Cache the result
    cache.set(cacheKey, {
      data: enrichedStops,
      timestamp: Date.now(),
    });

    console.log(`[FootTrafficService] Found ${enrichedStops.length} transit stops near (${lat}, ${lng})`);

    return enrichedStops;

  } catch (error) {
    console.error('[FootTrafficService] Error fetching transit stops:', error.message);
    return [];
  }
}

/**
 * Estimate foot traffic based on stop characteristics
 * Major transit hubs have more foot traffic than local stops
 *
 * @param {Object} stop - Transit stop data
 * @returns {string} Traffic level: 'high' | 'medium' | 'low'
 */
function estimateStopTraffic(stop) {
  const stopName = (stop.stop_name || '').toLowerCase();

  // Major transit hubs
  const majorHubs = [
    'powell', 'montgomery', 'embarcadero', 'civic center',
    '16th street', '24th street', 'balboa park', 'glen park',
    'castro', 'church', 'van ness', 'market',
  ];

  // Check if stop is a major hub
  for (const hub of majorHubs) {
    if (stopName.includes(hub)) {
      return 'high';
    }
  }

  // BART and Muni Metro stations generally have higher traffic
  if (stopName.includes('station') || stopName.includes('bart')) {
    return 'high';
  }

  // Default to medium for regular stops
  return 'medium';
}

// ==============================================
// GOOGLE PLACES API (Popular Times)
// ==============================================

/**
 * Get nearby places with activity levels from Google Places API
 * NOTE: Popular Times data is limited and may not be available
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMeters - Search radius in meters (default: 200)
 * @returns {Promise<Array>} Array of nearby places with activity data
 */
export async function getNearbyPlaces(lat, lng, radiusMeters = 200) {
  const apiKey = apiConfig.google.apiKey;

  if (!apiKey) {
    console.warn('[FootTrafficService] Google API key not configured');
    return [];
  }

  const cacheKey = `places_${lat.toFixed(4)}_${lng.toFixed(4)}_${radiusMeters}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheConfig.places) {
    return cached.data;
  }

  try {
    // Use Google Places Nearby Search
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', radiusMeters);
    url.searchParams.set('key', apiKey);
    // Focus on places that indicate foot traffic
    url.searchParams.set('type', 'restaurant|cafe|store|transit_station');

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places returned status: ${data.status}`);
    }

    const places = (data.results || []).map(place => ({
      placeId: place.place_id,
      name: place.name,
      latitude: place.geometry?.location?.lat,
      longitude: place.geometry?.location?.lng,
      types: place.types || [],
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      priceLevel: place.price_level,
      // Estimate activity based on ratings and type
      activityLevel: estimatePlaceActivity(place),
      distance: calculateDistance(
        lat, lng,
        place.geometry?.location?.lat,
        place.geometry?.location?.lng
      ),
    }));

    // Sort by activity level and distance
    places.sort((a, b) => {
      const activityOrder = { high: 0, medium: 1, low: 2 };
      const activityDiff = activityOrder[a.activityLevel] - activityOrder[b.activityLevel];
      if (activityDiff !== 0) return activityDiff;
      return a.distance - b.distance;
    });

    // Cache the result
    cache.set(cacheKey, {
      data: places,
      timestamp: Date.now(),
    });

    console.log(`[FootTrafficService] Found ${places.length} nearby places`);

    return places;

  } catch (error) {
    console.error('[FootTrafficService] Error fetching places:', error.message);
    return [];
  }
}

/**
 * Estimate place activity based on available data
 *
 * @param {Object} place - Google Place data
 * @returns {string} Activity level: 'high' | 'medium' | 'low'
 */
function estimatePlaceActivity(place) {
  // Transit stations always have traffic
  if (place.types?.includes('transit_station')) {
    return 'high';
  }

  // Use rating count as activity proxy
  const ratingCount = place.user_ratings_total || 0;

  if (ratingCount > 500) return 'high';
  if (ratingCount > 100) return 'medium';
  return 'low';
}

// ==============================================
// COMBINED FOOT TRAFFIC ASSESSMENT
// ==============================================

/**
 * Calculate foot traffic score for a location
 * Combines transit proximity and nearby places data
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} sunData - Sunrise/sunset data for time adjustments
 * @returns {Promise<Object>} Foot traffic assessment
 */
export async function assessFootTraffic(lat, lng, sunData = null) {
  // Gather data in parallel
  const [transitStops, nearbyPlaces] = await Promise.all([
    getNearbyTransitStops(lat, lng),
    getNearbyPlaces(lat, lng),
  ]);

  // Calculate base score from transit proximity
  let transitScore = 50; // Base score

  if (transitStops.length > 0) {
    const closestStop = transitStops[0];

    // Closer stops = more foot traffic
    if (closestStop.distance < 50) {
      transitScore = 95;
    } else if (closestStop.distance < 100) {
      transitScore = 85;
    } else if (closestStop.distance < 200) {
      transitScore = 75;
    } else if (closestStop.distance < 300) {
      transitScore = 65;
    }

    // Boost for high-traffic stops
    if (closestStop.trafficEstimate === 'high') {
      transitScore = Math.min(100, transitScore + 10);
    }
  }

  // Calculate score from nearby places
  let placesScore = 50;

  if (nearbyPlaces.length > 0) {
    const highActivityCount = nearbyPlaces.filter(p => p.activityLevel === 'high').length;
    const mediumActivityCount = nearbyPlaces.filter(p => p.activityLevel === 'medium').length;

    placesScore = Math.min(100, 50 + (highActivityCount * 10) + (mediumActivityCount * 5));
  }

  // Combine scores (weighted average)
  let combinedScore = (transitScore * 0.6) + (placesScore * 0.4);

  // Apply time-of-day adjustment
  const timeMultiplier = getTimeOfDayMultiplier(sunData);
  combinedScore *= timeMultiplier;

  // Ensure score is in valid range
  combinedScore = Math.max(0, Math.min(100, combinedScore));

  return {
    score: Math.round(combinedScore),
    transitScore: Math.round(transitScore),
    placesScore: Math.round(placesScore),
    transitStopsNearby: transitStops.length,
    placesNearby: nearbyPlaces.length,
    closestTransitStop: transitStops[0] || null,
    timeMultiplier,
    assessment: getTrafficAssessment(combinedScore),
  };
}

/**
 * Get time-of-day multiplier for foot traffic
 * Foot traffic varies significantly by time
 *
 * @param {Object} sunData - Sun data with time period
 * @returns {number} Multiplier between 0.3 and 1.0
 */
function getTimeOfDayMultiplier(sunData) {
  if (!sunData) {
    // Default based on current hour
    const hour = new Date().getHours();

    // Peak hours: 7-9am, 12-1pm, 5-7pm
    if ((hour >= 7 && hour <= 9) || (hour >= 12 && hour <= 13) || (hour >= 17 && hour <= 19)) {
      return 1.0;
    }

    // Normal daytime: 9am-5pm (excluding peaks already covered)
    if (hour >= 9 && hour <= 17) {
      return 0.8;
    }

    // Evening: 7-10pm
    if (hour >= 19 && hour <= 22) {
      return 0.6;
    }

    // Late night: 10pm-6am
    return 0.3;
  }

  // Use sun data time period
  const multipliers = {
    daylight: 0.9,
    twilight: 0.7,
    night: 0.4,
    lateNight: 0.3,
  };

  // Additional peak hour boost during daylight
  if (sunData.timePeriod === 'daylight') {
    const hour = new Date().getHours();
    if ((hour >= 7 && hour <= 9) || (hour >= 12 && hour <= 13) || (hour >= 17 && hour <= 19)) {
      return 1.0;
    }
  }

  return multipliers[sunData.timePeriod] || 0.5;
}

/**
 * Get traffic assessment label from score
 *
 * @param {number} score - Foot traffic score
 * @returns {string} Assessment label
 */
function getTrafficAssessment(score) {
  if (score >= 80) return 'High Foot Traffic';
  if (score >= 60) return 'Moderate Foot Traffic';
  if (score >= 40) return 'Some Foot Traffic';
  if (score >= 20) return 'Low Foot Traffic';
  return 'Very Low Foot Traffic';
}

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

/**
 * Calculate distance between two points in meters (Haversine formula)
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
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
 * Clear foot traffic cache
 */
export function clearFootTrafficCache() {
  cache.clear();
  console.log('[FootTrafficService] Cache cleared');
}

export default {
  getNearbyTransitStops,
  getNearbyPlaces,
  assessFootTraffic,
  clearFootTrafficCache,
};
