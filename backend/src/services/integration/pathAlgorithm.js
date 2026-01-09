/**
 * @fileoverview PinkPath Safety Algorithm
 *
 * This is the core integration layer that determines safe walking routes.
 * It implements the 6-function algorithm as specified:
 *
 * Function 1: getGoogleRoutes() - Get 8 paths from Google Routes API
 * Function 2: appendCrimeData() - Add crime data to each path
 * Function 3: appendLightingAndTraffic() - Add lighting and foot traffic data
 * Function 4: getSunsetSunriseData() - Get current sun position data
 * Function 5: scorePaths() - Calculate safety score for each path
 * Function 6: selectPaths() - Select Safest, Fastest, and Happy Medium
 */

import { getGoogleRoutes } from '../googleRoutesService.js';
import { getCrimeData, getRealtimeCadData } from '../crimeService.js';
import { getStreetlightComplaints } from '../lightingService.js';
import { getSunsetData } from '../sunsetService.js';
import { assessFootTraffic } from '../footTrafficService.js';
import {
  SAFETY_WEIGHTS,
  TIME_MODIFIERS,
  CRIME_SEVERITY,
  CRIME_RECENCY,
  CRIME_PROXIMITY,
  LIGHTING_SCORES,
  LIGHTING_TIME_MULTIPLIER,
  FOOT_TRAFFIC_SCORES,
  TRANSIT_PROXIMITY_BONUS,
  PATH_SELECTION,
  ROUTE_SAMPLING,
  applyCurve,
  getTimePeriod,
} from '@pinkpath/shared/weights.js';
import { calculateDistance } from '@pinkpath/shared/constants.js';

// ==============================================
// MAIN ENTRY POINT
// ==============================================

/**
 * Calculate safe routes between two points
 * This is the main entry point that orchestrates the 6 algorithm functions
 *
 * @param {Object} start - Starting location { lat, lng, address? }
 * @param {Object} destination - Destination { lat, lng, address? }
 * @param {Object} preferences - User safety preferences (optional)
 * @returns {Promise<Object>} Routes object with safest, fastest, and balanced paths
 */
export async function calculateSafeRoutes(start, destination, preferences = {}) {
  console.log('[Algorithm] Starting safe route calculation...');
  console.log(`[Algorithm] From: (${start.lat}, ${start.lng})`);
  console.log(`[Algorithm] To: (${destination.lat}, ${destination.lng})`);

  // Function 1: Get 8 routes from Google
  const routes = await getGoogleRoutePaths(start, destination);
  console.log(`[Algorithm] Retrieved ${routes.length} routes from Google`);

  if (routes.length === 0) {
    throw new Error('No routes found between the specified locations');
  }

  // Function 4: Get sunset/sunrise data (do this early, needed for scoring)
  const sunData = await getSunsetSunriseData(start.lat, start.lng);
  console.log(`[Algorithm] Sun data: sunrise=${sunData.sunrise}, sunset=${sunData.sunset}`);

  // Function 2: Append crime data to each path
  const routesWithCrime = await appendCrimeData(routes);
  const totalCrimes = routesWithCrime.reduce((sum, r) => sum + (r.crimeData?.length || 0), 0);
  console.log(`[Algorithm] Crime data appended to all routes (total crimes found: ${totalCrimes})`);

  // Function 3: Append lighting and foot traffic data
  const routesWithAllData = await appendLightingAndTraffic(routesWithCrime, sunData);
  console.log('[Algorithm] Lighting and foot traffic data appended');

  // Function 5: Score each path
  const scoredRoutes = scorePaths(routesWithAllData, sunData, preferences);
  console.log('[Algorithm] All routes scored');

  // Function 6: Select the 3 paths to display
  const selectedRoutes = selectPaths(scoredRoutes);
  console.log('[Algorithm] Final routes selected');

  return {
    safest: selectedRoutes.safest,
    fastest: selectedRoutes.fastest,
    balanced: selectedRoutes.balanced,
    totalRoutesAnalyzed: routes.length,
  };
}

// ==============================================
// FUNCTION 1: GET GOOGLE ROUTES
// ==============================================

/**
 * Function 1: Get 8 walking paths from Google Routes API
 *
 * @param {Object} start - Starting location { lat, lng }
 * @param {Object} destination - Destination { lat, lng }
 * @returns {Promise<Array>} Array of route objects with coordinates and metadata
 */
async function getGoogleRoutePaths(start, destination) {
  try {
    const routes = await getGoogleRoutes(start, destination, {
      travelMode: 'WALK',
      computeAlternativeRoutes: true,
      routeCount: PATH_SELECTION.routesToRequest,
    });

    // Normalize route format
    return routes.map((route, index) => ({
      id: `route_${index}`,
      index,
      coordinates: route.polyline?.coordinates || [],
      distanceMeters: route.distanceMeters || 0,
      durationSeconds: route.duration?.seconds || route.durationSeconds || 0,
      polylineEncoded: route.polyline?.encodedPolyline || '',
      legs: route.legs || [],
      // Sample points along the route for data queries
      samplePoints: sampleRoutePoints(route.polyline?.coordinates || []),
      // Initialize data containers
      crimeData: [],
      realtimeCrimeData: [],
      lightingData: [],
      footTrafficData: [],
    }));

  } catch (error) {
    console.error('[Algorithm] Error getting Google routes:', error.message);
    throw new Error(`Failed to get routes: ${error.message}`);
  }
}

/**
 * Sample points along a route at regular intervals
 * Used to query crime/lighting data along the path
 *
 * @param {Array} coordinates - Array of [lng, lat] or {lat, lng} points
 * @returns {Array} Array of sample points { lat, lng, index }
 */
function sampleRoutePoints(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return [];
  }

  const samples = [];
  let accumulatedDistance = 0;
  const intervalMeters = ROUTE_SAMPLING.sampleIntervalMeters;
  const maxSamples = ROUTE_SAMPLING.maxSamplesPerRoute;

  // Always include start point
  const firstPoint = normalizeCoordinate(coordinates[0]);
  samples.push({ ...firstPoint, index: 0 });

  for (let i = 1; i < coordinates.length && samples.length < maxSamples; i++) {
    const prevPoint = normalizeCoordinate(coordinates[i - 1]);
    const currPoint = normalizeCoordinate(coordinates[i]);

    const segmentDistance = calculateDistance(
      prevPoint.lat, prevPoint.lng,
      currPoint.lat, currPoint.lng,
      'meters'
    );

    accumulatedDistance += segmentDistance;

    if (accumulatedDistance >= intervalMeters) {
      samples.push({ ...currPoint, index: i });
      accumulatedDistance = 0;
    }
  }

  // Always include end point
  const lastPoint = normalizeCoordinate(coordinates[coordinates.length - 1]);
  if (samples.length < maxSamples) {
    samples.push({ ...lastPoint, index: coordinates.length - 1 });
  }

  return samples;
}

/**
 * Normalize coordinate to { lat, lng } format
 */
function normalizeCoordinate(coord) {
  if (Array.isArray(coord)) {
    return { lng: coord[0], lat: coord[1] };
  }
  return { lat: coord.lat || coord.latitude, lng: coord.lng || coord.longitude };
}

// ==============================================
// FUNCTION 2: APPEND CRIME DATA
// ==============================================

/**
 * Function 2: Append crime data to each path
 *
 * For each route, queries crime data within the specified radius
 * of each sample point along the route.
 *
 * @param {Array} routes - Array of route objects from Function 1
 * @returns {Promise<Array>} Routes with crimeData and realtimeCrimeData appended
 */
async function appendCrimeData(routes) {
  const queryRadius = ROUTE_SAMPLING.queryRadiusMeters;
  const daysBack = 90; // Last 90 days of crime data

  const enrichedRoutes = await Promise.all(routes.map(async (route) => {
    const allCrimes = new Map(); // Deduplicate by incident ID
    const allRealtimeCrimes = [];

    // Query crime data for each sample point
    for (const point of route.samplePoints) {
      try {
        // Historical crime data
        const crimes = await getCrimeData(point.lat, point.lng, queryRadius, daysBack);
        crimes.forEach(crime => {
          if (crime.id && !allCrimes.has(crime.id)) {
            allCrimes.set(crime.id, {
              ...crime,
              distanceFromRoute: calculateDistance(
                point.lat, point.lng,
                parseFloat(crime.latitude), parseFloat(crime.longitude),
                'meters'
              ),
            });
          }
        });

        // Real-time CAD data
        const realtimeCrimes = await getRealtimeCadData(point.lat, point.lng, queryRadius);
        allRealtimeCrimes.push(...realtimeCrimes);

      } catch (error) {
        console.warn(`[Algorithm] Crime query failed for point (${point.lat}, ${point.lng}):`, error.message);
      }
    }

    return {
      ...route,
      crimeData: Array.from(allCrimes.values()),
      realtimeCrimeData: deduplicateById(allRealtimeCrimes),
      crimeStats: calculateCrimeStats(Array.from(allCrimes.values())),
    };
  }));

  return enrichedRoutes;
}

/**
 * Calculate crime statistics for a route
 */
function calculateCrimeStats(crimes) {
  const now = new Date();
  const stats = {
    total: crimes.length,
    violent: 0,
    property: 0,
    recent7Days: 0,
    recent30Days: 0,
    recent90Days: 0,
  };

  crimes.forEach(crime => {
    // Count by type
    if (isViolentCrime(crime.incident_category)) {
      stats.violent++;
    } else {
      stats.property++;
    }

    // Count by recency
    const crimeDate = new Date(crime.incident_datetime);
    const daysDiff = (now - crimeDate) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 7) stats.recent7Days++;
    if (daysDiff <= 30) stats.recent30Days++;
    if (daysDiff <= 90) stats.recent90Days++;
  });

  return stats;
}

/**
 * Check if a crime category is violent
 */
function isViolentCrime(category) {
  if (!category) return false;
  const violentKeywords = ['assault', 'robbery', 'homicide', 'rape', 'kidnapping', 'weapon'];
  return violentKeywords.some(kw => category.toLowerCase().includes(kw));
}

/**
 * Deduplicate array by ID field
 */
function deduplicateById(items) {
  const seen = new Set();
  return items.filter(item => {
    const id = item.id || item.cad_number;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// ==============================================
// FUNCTION 3: APPEND LIGHTING AND TRAFFIC
// ==============================================

/**
 * Function 3: Append lighting quality and foot traffic data
 *
 * @param {Array} routes - Routes with crime data from Function 2
 * @param {Object} sunData - Sunset/sunrise data from Function 4
 * @returns {Promise<Array>} Routes with lighting and foot traffic data
 */
async function appendLightingAndTraffic(routes, sunData) {
  const queryRadius = ROUTE_SAMPLING.queryRadiusMeters;

  const enrichedRoutes = await Promise.all(routes.map(async (route) => {
    const allLightingComplaints = [];
    const allFootTraffic = [];

    // Query data for each sample point
    for (const point of route.samplePoints) {
      try {
        // Streetlight complaint data
        const lightingComplaints = await getStreetlightComplaints(point.lat, point.lng, queryRadius);
        allLightingComplaints.push(...lightingComplaints);

        // Foot traffic data (transit proximity + nearby places)
        const footTraffic = await assessFootTraffic(point.lat, point.lng, sunData);
        allFootTraffic.push(footTraffic);

      } catch (error) {
        console.warn(`[Algorithm] Data query failed for point (${point.lat}, ${point.lng}):`, error.message);
      }
    }

    // Calculate lighting score based on complaints
    const lightingScore = calculateLightingScore(allLightingComplaints, sunData);

    // Calculate foot traffic score
    const footTrafficScore = calculateFootTrafficScore(allFootTraffic);

    return {
      ...route,
      lightingData: deduplicateById(allLightingComplaints),
      footTrafficData: allFootTraffic,
      lightingScore,
      footTrafficScore,
      lightingStats: {
        totalComplaints: allLightingComplaints.length,
        openComplaints: allLightingComplaints.filter(c => c.status !== 'Closed').length,
      },
      footTrafficStats: {
        averageActivityLevel: footTrafficScore,
        samplePoints: allFootTraffic.length,
      },
    };
  }));

  return enrichedRoutes;
}

/**
 * Calculate lighting score based on 311 complaints
 */
function calculateLightingScore(complaints, sunData) {
  // Determine current lighting importance based on time
  const now = new Date();
  const timePeriod = getTimePeriod(now, sunData);
  const timeMultiplier = LIGHTING_TIME_MULTIPLIER[timePeriod];

  // Base score on complaint density
  const openComplaints = complaints.filter(c => c.status !== 'Closed').length;

  let baseScore;
  if (openComplaints === 0) {
    baseScore = LIGHTING_SCORES.noComplaints;
  } else if (openComplaints <= 2) {
    baseScore = LIGHTING_SCORES.lowComplaints;
  } else if (openComplaints <= 5) {
    baseScore = LIGHTING_SCORES.mediumComplaints;
  } else {
    baseScore = LIGHTING_SCORES.highComplaints;
  }

  // Apply time multiplier (lighting matters more when dark)
  // At night, low scores have more impact; during day, less impact
  return baseScore * timeMultiplier + (100 * (1 - timeMultiplier));
}

/**
 * Calculate foot traffic score
 */
function calculateFootTrafficScore(footTrafficData) {
  if (footTrafficData.length === 0) {
    return FOOT_TRAFFIC_SCORES.unknown;
  }

  // Average the scores from all sample points
  const totalScore = footTrafficData.reduce((sum, data) => {
    return sum + (data.score || FOOT_TRAFFIC_SCORES.unknown);
  }, 0);

  return totalScore / footTrafficData.length;
}

// ==============================================
// FUNCTION 4: GET SUNSET/SUNRISE DATA
// ==============================================

/**
 * Function 4: Get sunrise, sunset, and current time
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} { sunrise, sunset, current, timePeriod, isDark }
 */
async function getSunsetSunriseData(lat, lng) {
  try {
    const sunData = await getSunsetData(lat, lng);

    const now = new Date();
    const sunrise = new Date(sunData.sunrise);
    const sunset = new Date(sunData.sunset);
    const isDark = now < sunrise || now > sunset;
    const timePeriod = getTimePeriod(now, { sunrise, sunset });

    return {
      sunrise: sunData.sunrise,
      sunset: sunData.sunset,
      current: now.toISOString(),
      timePeriod,
      isDark,
      dayLengthHours: (sunset - sunrise) / (1000 * 60 * 60),
    };

  } catch (error) {
    console.warn('[Algorithm] Failed to get sunset data, using defaults:', error.message);

    // Default to assuming it's light (safer for scoring)
    return {
      sunrise: new Date().setHours(6, 0, 0, 0),
      sunset: new Date().setHours(18, 0, 0, 0),
      current: new Date().toISOString(),
      timePeriod: 'daylight',
      isDark: false,
      dayLengthHours: 12,
    };
  }
}

// ==============================================
// FUNCTION 5: SCORE PATHS
// ==============================================

/**
 * San Francisco citywide crime baseline (crimes per km per 90 days)
 * Based on historical SF crime data - used for relative scoring
 * This represents a "typical" crime density in SF for comparison
 */
const SF_CITYWIDE_BASELINE = {
  crimesPerKm: 8.5,          // Average crimes per km in 90 days
  violentPerKm: 1.2,         // Average violent crimes per km
  felonyThreshold: 15,       // Crimes/km considered "regular felonies" territory
};

/**
 * Function 5: Calculate safety score for each path
 *
 * Scoring Philosophy:
 * - Crime: 100 = no crimes found, 0 = regular felonies (high frequency violent crime)
 * - Real-time Activity (foot traffic): 100 = streets flooded with people, 0 = ghost town
 * - Lighting: 100 = bright as day, 0 = completely dark
 * - Time of Day: 100 = solar noon (sun at peak), 0 = solar midnight (darkest point)
 *
 * @param {Array} routes - Routes with all data attached
 * @param {Object} sunData - Sun position data
 * @param {Object} preferences - User safety preferences
 * @returns {Array} Routes with safetyScore added
 */
function scorePaths(routes, sunData, preferences = {}) {
  // Get weights (use user preferences or defaults)
  const weights = {
    crime: preferences.crime_weight ?? SAFETY_WEIGHTS.crime,
    realtimeCrime: preferences.realtime_crime_weight ?? SAFETY_WEIGHTS.realtimeCrime,
    lighting: preferences.lighting_weight ?? SAFETY_WEIGHTS.lighting,
    footTraffic: preferences.foot_traffic_weight ?? SAFETY_WEIGHTS.footTraffic,
    timeOfDay: preferences.time_of_day_weight ?? SAFETY_WEIGHTS.timeOfDay,
  };

  return routes.map(route => {
    // Calculate individual factor scores with new methodology
    const crimeScore = calculateCrimeScoreRelative(route.crimeData, route.distanceMeters);
    const footTrafficScore = calculateFootTrafficDensity(route.footTrafficData);
    const lightingScore = calculateBrightnessScore(route.lightingData, sunData);
    const timeScore = calculateSolarPositionScore(sunData);

    // Real-time incidents still factor into crime (not foot traffic)
    const realtimeIncidentPenalty = calculateRealtimeIncidentPenalty(route.realtimeCrimeData);
    const adjustedCrimeScore = Math.max(0, crimeScore - realtimeIncidentPenalty);

    // Weighted average
    const rawScore =
      adjustedCrimeScore * weights.crime +
      footTrafficScore * weights.footTraffic +  // Now represents people density
      lightingScore * weights.lighting +
      footTrafficScore * weights.realtimeCrime + // Use foot traffic for "activity"
      timeScore * weights.timeOfDay;

    // Apply curve to skew towards higher scores
    const finalScore = applyCurve(rawScore);

    // Determine safety label
    const safetyLabel = getSafetyLabel(finalScore);

    // Build detailed metrics for "Show More" feature
    const detailedMetrics = buildDetailedMetrics(route, sunData, {
      crimeScore: adjustedCrimeScore,
      footTrafficScore,
      lightingScore,
      timeScore,
    });

    return {
      ...route,
      safetyScore: finalScore,
      safetyLabel,
      scoreBreakdown: {
        crime: Math.round(adjustedCrimeScore),
        realtimeCrime: Math.round(footTrafficScore), // Renamed semantically: real-time activity = people
        lighting: Math.round(lightingScore),
        footTraffic: Math.round(footTrafficScore),
        timeOfDay: Math.round(timeScore),
        weights,
      },
      detailedMetrics, // New: detailed data for "Show More"
    };
  });
}

/**
 * Build detailed metrics for the "Show More" expansion
 */
function buildDetailedMetrics(route, sunData, scores) {
  const crimeStats = route.crimeStats || {};
  const recentCrimes = (route.crimeData || [])
    .filter(c => {
      const daysSince = (Date.now() - new Date(c.incident_datetime)) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    })
    .slice(0, 5) // Top 5 most recent
    .map(c => ({
      type: c.incident_category,
      date: c.incident_datetime,
      severity: isViolentCrime(c.incident_category) ? 'violent' : 'property',
    }));

  return {
    crime: {
      score: Math.round(scores.crimeScore),
      totalIncidents: crimeStats.total || 0,
      violentCount: crimeStats.violent || 0,
      propertyCount: crimeStats.property || 0,
      last7Days: crimeStats.recent7Days || 0,
      last30Days: crimeStats.recent30Days || 0,
      recentCrimes,
      assessment: getCrimeAssessment(scores.crimeScore),
    },
    footTraffic: {
      score: Math.round(scores.footTrafficScore),
      transitStopsNearby: route.footTrafficStats?.transitStopsNearby || 0,
      placesNearby: route.footTrafficStats?.placesNearby || 0,
      assessment: getFootTrafficAssessment(scores.footTrafficScore),
      peakHours: getPeakHoursInfo(),
    },
    lighting: {
      score: Math.round(scores.lightingScore),
      openComplaints: route.lightingStats?.openComplaints || 0,
      totalComplaints: route.lightingStats?.totalComplaints || 0,
      isDaytime: !sunData.isDark,
      assessment: getLightingAssessment(scores.lightingScore, sunData.isDark),
    },
    timeOfDay: {
      score: Math.round(scores.timeScore),
      currentTime: new Date().toLocaleTimeString(),
      sunrise: sunData.sunrise,
      sunset: sunData.sunset,
      timePeriod: sunData.timePeriod,
      isDark: sunData.isDark,
      assessment: getTimeAssessment(scores.timeScore, sunData),
    },
  };
}

/**
 * Get crime assessment text
 */
function getCrimeAssessment(score) {
  if (score >= 90) return 'Very low crime area - minimal incidents recorded';
  if (score >= 70) return 'Below average crime - safer than typical SF areas';
  if (score >= 50) return 'Average crime levels for San Francisco';
  if (score >= 30) return 'Above average crime - exercise caution';
  return 'High crime density - multiple serious incidents recorded';
}

/**
 * Get foot traffic assessment text
 */
function getFootTrafficAssessment(score) {
  if (score >= 90) return 'Very busy area - lots of people around';
  if (score >= 70) return 'Good foot traffic - regularly populated';
  if (score >= 50) return 'Moderate activity - some people around';
  if (score >= 30) return 'Quiet area - few pedestrians expected';
  return 'Very isolated - minimal pedestrian activity';
}

/**
 * Get lighting assessment text
 */
function getLightingAssessment(score, isDark) {
  if (!isDark) return 'Daylight - natural lighting available';
  if (score >= 90) return 'Well-lit streets - good visibility';
  if (score >= 70) return 'Adequate lighting - most areas visible';
  if (score >= 50) return 'Some lighting - darker spots possible';
  if (score >= 30) return 'Poor lighting - limited visibility';
  return 'Very dark - minimal street lighting';
}

/**
 * Get time of day assessment text
 */
function getTimeAssessment(score, sunData) {
  if (score >= 80) return 'Peak daylight hours - optimal visibility';
  if (score >= 60) return 'Good daylight remaining';
  if (score >= 40) return 'Twilight period - fading light';
  if (score >= 20) return 'Dark but not late night';
  return 'Late night hours - lowest visibility';
}

/**
 * Get peak hours info for current day
 */
function getPeakHoursInfo() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    return {
      currentPeriod: hour >= 10 && hour <= 20 ? 'peak' : 'off-peak',
      peakHours: '10 AM - 8 PM',
      note: 'Weekend hours - midday through evening busiest',
    };
  }

  const isMorningRush = hour >= 7 && hour <= 9;
  const isLunchRush = hour >= 11 && hour <= 13;
  const isEveningRush = hour >= 17 && hour <= 19;

  return {
    currentPeriod: (isMorningRush || isLunchRush || isEveningRush) ? 'peak' : 'off-peak',
    peakHours: '7-9 AM, 11 AM-1 PM, 5-7 PM',
    note: 'Weekday commute and lunch hours busiest',
  };
}

/**
 * Calculate crime score RELATIVE to city historical data
 * 100 = no crimes found along path (pristine)
 * 0 = regular felonies (extreme crime density with violent crimes)
 */
function calculateCrimeScoreRelative(crimes, routeDistanceMeters) {
  if (!crimes || crimes.length === 0) {
    return 100; // No crimes = perfect score
  }

  const routeKm = Math.max(routeDistanceMeters / 1000, 0.5);
  const crimesPerKm = crimes.length / routeKm;

  // Count violent crimes specifically
  const violentCrimes = crimes.filter(c => isViolentCrime(c.incident_category));
  const violentPerKm = violentCrimes.length / routeKm;

  // Compare to citywide baseline
  const { crimesPerKm: baseline, violentPerKm: violentBaseline, felonyThreshold } = SF_CITYWIDE_BASELINE;

  // Calculate crime density ratio (how this route compares to city average)
  // Ratio < 1 = better than average, Ratio > 1 = worse than average
  const crimeRatio = crimesPerKm / baseline;
  const violentRatio = violentPerKm / Math.max(violentBaseline, 0.1);

  // Weight violent crimes more heavily (70% violent, 30% property)
  const combinedRatio = (violentRatio * 0.7) + (crimeRatio * 0.3);

  // Apply recency weighting - recent crimes matter more
  let recencyMultiplier = 1.0;
  const recentCrimes = crimes.filter(c => {
    const daysSince = (Date.now() - new Date(c.incident_datetime)) / (1000 * 60 * 60 * 24);
    return daysSince <= 7;
  });
  if (recentCrimes.length > 0) {
    recencyMultiplier = 1.0 + (recentCrimes.length / crimes.length) * 0.5;
  }

  // Convert ratio to score (0-100)
  // Ratio 0 = score 100 (no crime)
  // Ratio 1 = score 50 (average)
  // Ratio 2+ = score approaches 0 (felony territory)
  const adjustedRatio = combinedRatio * recencyMultiplier;

  let score;
  if (adjustedRatio <= 0) {
    score = 100;
  } else if (adjustedRatio <= 0.5) {
    // Below average crime: 75-100
    score = 100 - (adjustedRatio * 50);
  } else if (adjustedRatio <= 1.0) {
    // Average crime: 50-75
    score = 75 - ((adjustedRatio - 0.5) * 50);
  } else if (adjustedRatio <= 2.0) {
    // Above average: 25-50
    score = 50 - ((adjustedRatio - 1.0) * 25);
  } else {
    // High crime / felony territory: 0-25
    score = Math.max(0, 25 - ((adjustedRatio - 2.0) * 12.5));
  }

  // Extra penalty for violent crimes in close proximity
  const closeViolent = violentCrimes.filter(c => (c.distanceFromRoute || 400) < 200);
  if (closeViolent.length > 0) {
    score = Math.max(0, score - (closeViolent.length * 5));
  }

  return Math.round(score);
}

/**
 * Calculate penalty from real-time CAD incidents
 * These reduce the crime score rather than being a separate metric
 */
function calculateRealtimeIncidentPenalty(incidents) {
  if (!incidents || incidents.length === 0) {
    return 0; // No penalty
  }

  // Active incidents indicate current danger - significant penalty
  const penaltyPerIncident = 10;
  return Math.min(40, incidents.length * penaltyPerIncident);
}

/**
 * Calculate foot traffic density score
 * 100 = streets flooded with people (very safe - safety in numbers)
 * 0 = ghost town (no one around - isolated)
 */
function calculateFootTrafficDensity(footTrafficData) {
  if (!footTrafficData || footTrafficData.length === 0) {
    return 50; // Unknown - assume average
  }

  // Average the foot traffic scores from sample points
  const totalScore = footTrafficData.reduce((sum, data) => {
    return sum + (data.score || 50);
  }, 0);

  const avgScore = totalScore / footTrafficData.length;

  // Boost score if near transit hubs (high activity areas)
  const nearTransit = footTrafficData.some(d =>
    d.transitStopsNearby > 0 && d.closestTransitStop?.distance < 100
  );
  const transitBonus = nearTransit ? 10 : 0;

  // Check for peak hours bonus
  const now = new Date();
  const hour = now.getHours();
  const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 12 && hour <= 13) || (hour >= 17 && hour <= 19);
  const peakBonus = isPeakHour ? 10 : 0;

  return Math.min(100, Math.round(avgScore + transitBonus + peakBonus));
}

/**
 * Calculate brightness/lighting score
 * 100 = bright as day (full daylight or excellent street lighting)
 * 0 = completely dark (no lighting, nighttime in poorly lit area)
 */
function calculateBrightnessScore(lightingComplaints, sunData) {
  const isDaytime = !sunData.isDark;

  if (isDaytime) {
    // During daylight, score is naturally high (natural light)
    // Minor reduction only for overcast indication from time period
    if (sunData.timePeriod === 'daylight') {
      return 100; // Full daylight = perfect brightness
    } else if (sunData.timePeriod === 'twilight') {
      return 75; // Twilight = fading light but still visible
    }
  }

  // Nighttime scoring based on street lighting quality
  const openComplaints = lightingComplaints?.filter(c => c.status !== 'Closed').length || 0;

  // Base nighttime score (assumes some street lighting exists)
  let nightScore = 60;

  // Reduce score based on lighting complaints
  if (openComplaints === 0) {
    nightScore = 80; // No complaints = good lighting infrastructure
  } else if (openComplaints <= 2) {
    nightScore = 65; // Minor issues
  } else if (openComplaints <= 5) {
    nightScore = 45; // Moderate lighting problems
  } else if (openComplaints <= 10) {
    nightScore = 25; // Significant lighting issues
  } else {
    nightScore = 10; // Severe lighting problems - very dark
  }

  // Late night penalty (fewer ambient lights from businesses)
  if (sunData.timePeriod === 'lateNight') {
    nightScore = Math.max(0, nightScore - 15);
  }

  return Math.round(nightScore);
}

/**
 * Calculate time of day score based on SOLAR POSITION relative to sunrise/sunset
 * 100 = solar noon (sun at highest point in sky)
 * 0 = solar midnight (sun at lowest point - darkest)
 *
 * Uses actual sunrise/sunset data for accurate timezone handling
 */
function calculateSolarPositionScore(sunData) {
  const now = new Date();

  // Parse sunrise/sunset from sun data
  const sunrise = new Date(sunData.sunrise);
  const sunset = new Date(sunData.sunset);

  // Calculate solar noon (midpoint between sunrise and sunset)
  const solarNoonTime = new Date((sunrise.getTime() + sunset.getTime()) / 2);

  // Calculate solar midnight (12 hours from solar noon)
  const solarMidnightTime = new Date(solarNoonTime.getTime() + 12 * 60 * 60 * 1000);

  // Adjust solar midnight if it's past the current day
  if (solarMidnightTime.getDate() !== now.getDate()) {
    solarMidnightTime.setDate(solarMidnightTime.getDate() - 1);
  }

  // Get daylight duration
  const daylightDuration = sunset.getTime() - sunrise.getTime();

  // Calculate score based on where we are in the day
  let score;

  if (now >= sunrise && now <= sunset) {
    // Daytime: score based on distance from solar noon
    const distanceFromNoon = Math.abs(now.getTime() - solarNoonTime.getTime());
    const halfDaylight = daylightDuration / 2;

    // At solar noon: score = 100, at sunrise/sunset: score = 50
    const dayScore = 100 - (distanceFromNoon / halfDaylight) * 50;
    score = Math.max(50, dayScore);
  } else {
    // Nighttime: score based on how far into the night we are
    const nightDuration = 24 * 60 * 60 * 1000 - daylightDuration;

    let nightProgress;
    if (now > sunset) {
      // After sunset (evening)
      nightProgress = (now.getTime() - sunset.getTime()) / (nightDuration / 2);
    } else {
      // Before sunrise (morning)
      const lastSunset = new Date(sunset);
      lastSunset.setDate(lastSunset.getDate() - 1);
      nightProgress = (now.getTime() - lastSunset.getTime()) / (nightDuration / 2);

      // If we're close to sunrise, we're coming out of the night
      const timeUntilSunrise = sunrise.getTime() - now.getTime();
      if (timeUntilSunrise < nightDuration / 2) {
        nightProgress = 2 - (timeUntilSunrise / (nightDuration / 2));
      }
    }

    // Cap nightProgress at 1 (deepest night)
    nightProgress = Math.min(1, nightProgress);

    // At sunset/sunrise: score = 50, at solar midnight: score = 0
    score = 50 - (nightProgress * 50);
    score = Math.max(0, score);
  }

  console.log(`[Algorithm] Time score: ${Math.round(score)} (isDark: ${sunData.isDark}, timePeriod: ${sunData.timePeriod})`);

  return Math.round(score);
}

/**
 * Get safety label from score
 */
function getSafetyLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Very Good';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Moderate';
  if (score >= 50) return 'Fair';
  return 'Use Caution';
}

// ==============================================
// FUNCTION 6: SELECT PATHS
// ==============================================

/**
 * Function 6: Select the 3 paths to display
 *
 * @param {Array} scoredRoutes - Routes with safety scores
 * @returns {Object} { safest, fastest, balanced }
 */
function selectPaths(scoredRoutes) {
  if (scoredRoutes.length === 0) {
    throw new Error('No routes to select from');
  }

  // Sort by safety score (descending)
  const sortedBySafety = [...scoredRoutes].sort((a, b) => b.safetyScore - a.safetyScore);

  // Sort by duration (ascending)
  const sortedBySpeed = [...scoredRoutes].sort((a, b) => a.durationSeconds - b.durationSeconds);

  // Safest route = highest safety score
  const safest = formatRouteForResponse(sortedBySafety[0], 'safest');

  // Fastest route = shortest duration
  const fastest = formatRouteForResponse(sortedBySpeed[0], 'fastest');

  // Happy Medium = balance between safety and speed
  const balanced = selectBalancedRoute(scoredRoutes, safest, fastest);

  return { safest, fastest, balanced };
}

/**
 * Select the "Happy Medium" route
 * Balances safety and speed based on configured weights
 */
function selectBalancedRoute(routes, safest, fastest) {
  const { safetySpeedBalance, minimumSafetyScore, maxTimeIncrease } = PATH_SELECTION;

  // If safest and fastest are the same, use it
  if (safest.id === fastest.id) {
    return formatRouteForResponse(routes.find(r => r.id === safest.id), 'balanced');
  }

  // Calculate "balanced score" for each route
  const fastestTime = fastest.durationSeconds;
  const safestScore = safest.safetyScore;

  const scoredForBalance = routes.map(route => {
    // Skip routes below minimum safety threshold
    if (route.safetyScore < minimumSafetyScore) {
      return { ...route, balanceScore: -1 };
    }

    // Skip routes that take too much longer than fastest
    const timeRatio = route.durationSeconds / fastestTime;
    if (timeRatio > 1 + maxTimeIncrease) {
      return { ...route, balanceScore: -1 };
    }

    // Calculate balance score
    // Normalize safety to 0-1 range
    const normalizedSafety = route.safetyScore / 100;

    // Normalize speed (inverse - faster is better)
    // 1 = same as fastest, 0 = at max increase threshold
    const normalizedSpeed = 1 - ((timeRatio - 1) / maxTimeIncrease);

    // Weighted combination
    const balanceScore =
      normalizedSafety * safetySpeedBalance +
      normalizedSpeed * (1 - safetySpeedBalance);

    return { ...route, balanceScore };
  });

  // Sort by balance score and pick the best
  const validRoutes = scoredForBalance.filter(r => r.balanceScore >= 0);

  if (validRoutes.length === 0) {
    // Fallback to safest route
    return formatRouteForResponse(routes.find(r => r.id === safest.id), 'balanced');
  }

  validRoutes.sort((a, b) => b.balanceScore - a.balanceScore);

  // Pick a route that's neither the safest nor fastest (if possible)
  const balanced = validRoutes.find(r =>
    r.id !== safest.id && r.id !== fastest.id
  ) || validRoutes[0];

  return formatRouteForResponse(balanced, 'balanced');
}

/**
 * Format route for API response
 * Includes detailedMetrics for "Show More" expansion
 */
function formatRouteForResponse(route, type) {
  return {
    id: route.id,
    type,
    safetyScore: route.safetyScore,
    safetyLabel: route.safetyLabel,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    distanceText: formatDistance(route.distanceMeters),
    durationText: formatDuration(route.durationSeconds),
    polyline: route.polylineEncoded,
    coordinates: route.coordinates,
    scoreBreakdown: route.scoreBreakdown,
    stats: {
      crimes: {
        ...route.crimeStats,
        // Include raw crime data for frontend crime markers
        rawData: (route.crimeData || []).slice(0, 100), // Limit to 100 for response size
      },
      lighting: route.lightingStats,
      footTraffic: {
        ...route.footTrafficStats,
        transitStopsNearby: route.footTrafficData?.reduce((sum, d) => sum + (d.transitStopsNearby || 0), 0) || 0,
        placesNearby: route.footTrafficData?.reduce((sum, d) => sum + (d.placesNearby || 0), 0) || 0,
      },
    },
    // Include crime data directly for backward compatibility
    crimes: (route.crimeData || []).slice(0, 100),
    crimeCount: route.crimeStats?.total || 0,
    // Detailed metrics for "Show More" expansion
    detailedMetrics: route.detailedMetrics || null,
  };
}

/**
 * Format distance for display
 */
function formatDistance(meters) {
  const miles = meters / 1609.34;
  if (miles < 0.1) {
    return `${Math.round(miles * 5280)} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

/**
 * Format duration for display
 */
function formatDuration(seconds) {
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

export default calculateSafeRoutes;
