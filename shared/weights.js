/**
 * @fileoverview Safety Score Weights Configuration
 *
 * This file contains all configurable weights for the PinkPath safety scoring algorithm.
 * Weights determine how much each factor contributes to the overall safety score.
 *
 * IMPORTANT: These weights are designed to produce scores that skew towards higher
 * numbers (like school grades: A=90-100, B=80-89, etc.) to provide a more intuitive
 * user experience.
 *
 * To modify weights:
 * 1. Edit values in this file directly (manual)
 * 2. In future: User safety preferences will override these defaults per-user
 *
 * Score calculation: Each factor produces a 0-100 sub-score, weighted by these values.
 * Final score = weighted average of all factor scores.
 */

// ==============================================
// SAFETY FACTOR WEIGHTS
// ==============================================
// These weights determine how much each factor affects the final safety score.
// All weights should sum to 1.0 (100%)
// Higher weight = more influence on final score

/**
 * Default weights for safety factors
 * @type {Object}
 */
export const SAFETY_WEIGHTS = {
  /**
   * Crime weight - How much historical crime data affects score
   * Includes both violent and property crimes
   * Higher = more penalty for routes through high-crime areas
   */
  crime: 0.35,

  /**
   * Crime severity breakdown (within the crime weight)
   * violent: Assault, robbery, homicide, etc.
   * property: Theft, burglary, vandalism, etc.
   */
  crimeSeverity: {
    violent: 0.7,   // 70% of crime weight goes to violent crimes
    property: 0.3,  // 30% of crime weight goes to property crimes
  },

  /**
   * Real-time incidents weight - Recent CAD dispatch calls
   * More weight = more responsive to current police activity
   */
  realtimeCrime: 0.15,

  /**
   * Lighting quality weight - Street lighting conditions
   * Combines 311 complaint data + time of day
   * Higher = prefer well-lit routes, especially at night
   */
  lighting: 0.20,

  /**
   * Foot traffic weight - Pedestrian activity levels
   * More people = generally safer (safety in numbers)
   * Uses Google Popular Times + transit stop proximity
   */
  footTraffic: 0.15,

  /**
   * Time of day weight - Sunset/sunrise consideration
   * Adjusts overall score based on whether it's dark
   */
  timeOfDay: 0.15,
};

// ==============================================
// TIME-BASED MODIFIERS
// ==============================================
// These modify the base score based on time conditions

/**
 * Time of day score modifiers
 * Applied as multipliers to the final score
 */
export const TIME_MODIFIERS = {
  /**
   * Daylight hours modifier (sunrise to sunset)
   * 1.0 = no modification (baseline)
   */
  daylight: 1.0,

  /**
   * Twilight modifier (30 min before/after sunrise/sunset)
   * Slight penalty during transition periods
   */
  twilight: 0.95,

  /**
   * Night modifier (after sunset, before sunrise)
   * Significant penalty for nighttime travel
   */
  night: 0.85,

  /**
   * Late night modifier (midnight to 5am)
   * Highest penalty - most dangerous time
   */
  lateNight: 0.75,
};

// ==============================================
// CRIME SCORING PARAMETERS
// ==============================================

/**
 * Crime severity scores (higher = worse)
 * Used to calculate crime impact on route segments
 */
export const CRIME_SEVERITY = {
  // Violent crimes (most severe)
  homicide: 100,
  assault: 85,
  robbery: 80,
  sexualAssault: 90,
  kidnapping: 95,

  // Property crimes with potential for confrontation
  burglary: 60,
  vehicleTheft: 40,
  arson: 70,

  // Property crimes (less severe for pedestrian safety)
  larcenyTheft: 30,
  vandalism: 20,
  fraud: 10,

  // Other
  drugNarcotic: 35,
  weaponLaws: 75,
  other: 25,
};

/**
 * Crime recency decay - Recent crimes matter more
 * Multiplier based on how long ago the crime occurred
 */
export const CRIME_RECENCY = {
  last24Hours: 1.0,      // Full weight
  last7Days: 0.8,        // 80% weight
  last30Days: 0.5,       // 50% weight
  last90Days: 0.3,       // 30% weight
};

/**
 * Crime proximity - Closer crimes matter more
 * Distance in meters from route segment
 */
export const CRIME_PROXIMITY = {
  within100m: 1.0,       // Full impact
  within250m: 0.7,       // 70% impact
  within500m: 0.4,       // 40% impact
  within800m: 0.2,       // 20% impact
};

// ==============================================
// LIGHTING SCORING PARAMETERS
// ==============================================

/**
 * Lighting quality scores based on 311 complaint density
 * Fewer complaints = better lighting = higher score
 */
export const LIGHTING_SCORES = {
  /**
   * No 311 complaints in area - assume good lighting
   */
  noComplaints: 100,

  /**
   * Low complaint density (1-2 per 500m segment)
   */
  lowComplaints: 80,

  /**
   * Medium complaint density (3-5 per 500m segment)
   */
  mediumComplaints: 60,

  /**
   * High complaint density (6+ per 500m segment)
   */
  highComplaints: 40,
};

/**
 * Time-based lighting importance
 * Lighting matters more when it's dark
 */
export const LIGHTING_TIME_MULTIPLIER = {
  daylight: 0.2,    // Lighting barely matters during day
  twilight: 0.6,    // Moderate importance
  night: 1.0,       // Full importance at night
  lateNight: 1.0,   // Full importance late night
};

// ==============================================
// FOOT TRAFFIC SCORING PARAMETERS
// ==============================================

/**
 * Foot traffic scores based on activity level
 * More foot traffic = safer (safety in numbers)
 */
export const FOOT_TRAFFIC_SCORES = {
  veryHigh: 100,    // Busy area, many pedestrians
  high: 85,
  medium: 70,
  low: 50,
  veryLow: 30,      // Deserted area
  unknown: 60,      // Default when no data available
};

/**
 * Transit stop proximity bonus
 * Areas near transit stops typically have more foot traffic
 * Distance in meters to nearest transit stop
 */
export const TRANSIT_PROXIMITY_BONUS = {
  within50m: 20,    // +20 points
  within100m: 15,   // +15 points
  within200m: 10,   // +10 points
  within400m: 5,    // +5 points
  beyond400m: 0,    // No bonus
};

// ==============================================
// PATH SELECTION PARAMETERS
// ==============================================

/**
 * Configuration for the "Happy Medium" path selection
 * This determines how to balance safety vs speed
 */
export const PATH_SELECTION = {
  /**
   * Minimum safety score for "Happy Medium" path
   * Won't select a path below this threshold even if faster
   */
  minimumSafetyScore: 60,

  /**
   * Weight for safety vs speed in happy medium calculation
   * 0.5 = equal weight, higher = prefer safety
   */
  safetySpeedBalance: 0.6,

  /**
   * Maximum acceptable time increase over fastest route (percentage)
   * Happy medium won't be more than X% longer than fastest
   */
  maxTimeIncrease: 0.25,  // 25% max time increase

  /**
   * Number of routes to request from Google Routes API
   */
  routesToRequest: 8,

  /**
   * Number of routes to display to user
   */
  routesToDisplay: 3,
};

// ==============================================
// ROUTE SAMPLING PARAMETERS
// ==============================================

/**
 * Parameters for sampling points along routes for analysis
 */
export const ROUTE_SAMPLING = {
  /**
   * Distance between sample points in meters
   * Used to query crime/lighting data along route
   */
  sampleIntervalMeters: 500,

  /**
   * Radius around each sample point for data queries (meters)
   */
  queryRadiusMeters: 800,

  /**
   * Maximum sample points per route (to limit API calls)
   */
  maxSamplesPerRoute: 20,
};

// ==============================================
// SCORE CURVE PARAMETERS
// ==============================================

/**
 * Parameters to adjust the final score distribution
 * Designed to produce school-grade-like distribution
 */
export const SCORE_CURVE = {
  /**
   * Minimum possible score (even worst routes get this)
   */
  floorScore: 20,

  /**
   * Score boost to shift distribution higher
   * Added after initial calculation
   */
  baseBoost: 15,

  /**
   * Curve exponent for score compression
   * < 1 compresses high scores, > 1 compresses low scores
   * 0.85 gives a nice "grade curve" feel
   */
  curveExponent: 0.85,
};

// ==============================================
// HELPER FUNCTIONS
// ==============================================

/**
 * Get the time period based on current time and sun data
 * @param {Date} currentTime - Current time
 * @param {Object} sunData - { sunrise: Date, sunset: Date }
 * @returns {string} Time period: 'daylight', 'twilight', 'night', or 'lateNight'
 */
export function getTimePeriod(currentTime, sunData) {
  const hour = currentTime.getHours();
  const { sunrise, sunset } = sunData;

  // Late night: midnight to 5am
  if (hour >= 0 && hour < 5) {
    return 'lateNight';
  }

  // Calculate twilight windows (30 minutes)
  const twilightMinutes = 30;
  const sunriseTime = new Date(sunrise);
  const sunsetTime = new Date(sunset);

  const preSunrise = new Date(sunriseTime.getTime() - twilightMinutes * 60000);
  const postSunrise = new Date(sunriseTime.getTime() + twilightMinutes * 60000);
  const preSunset = new Date(sunsetTime.getTime() - twilightMinutes * 60000);
  const postSunset = new Date(sunsetTime.getTime() + twilightMinutes * 60000);

  // Twilight periods
  if (currentTime >= preSunrise && currentTime <= postSunrise) {
    return 'twilight';
  }
  if (currentTime >= preSunset && currentTime <= postSunset) {
    return 'twilight';
  }

  // Daylight: between sunrise and sunset
  if (currentTime > postSunrise && currentTime < preSunset) {
    return 'daylight';
  }

  // Night: after sunset, before midnight (excluding late night)
  return 'night';
}

/**
 * Apply score curve to raw score
 * Transforms linear score to grade-like distribution
 * @param {number} rawScore - Raw score 0-100
 * @returns {number} Curved score 0-100
 */
export function applyCurve(rawScore) {
  const { floorScore, baseBoost, curveExponent } = SCORE_CURVE;

  // Normalize to 0-1
  const normalized = rawScore / 100;

  // Apply curve (power function)
  const curved = Math.pow(normalized, curveExponent);

  // Scale back and add boost
  let finalScore = (curved * (100 - floorScore - baseBoost)) + floorScore + baseBoost;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(finalScore)));
}

/**
 * Validate that weights sum to 1.0
 * @throws {Error} If weights don't sum to 1.0
 */
export function validateWeights() {
  const sum = Object.values(SAFETY_WEIGHTS)
    .filter(v => typeof v === 'number')
    .reduce((a, b) => a + b, 0);

  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error(`Safety weights must sum to 1.0, got ${sum}`);
  }

  const severitySum = SAFETY_WEIGHTS.crimeSeverity.violent + SAFETY_WEIGHTS.crimeSeverity.property;
  if (Math.abs(severitySum - 1.0) > 0.001) {
    throw new Error(`Crime severity weights must sum to 1.0, got ${severitySum}`);
  }
}

// Validate on module load
validateWeights();
