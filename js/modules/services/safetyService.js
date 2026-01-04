// ========================================
// PINKPATH SAFETY SCORING SERVICE
// Calculates safety scores for routes
// ========================================

// Import dependencies
import { metersToMiles } from '../utils.js';

import {
    isRouteInSanFrancisco,
    queryCrimesAlongRoute,
    calculateAreaBaseline,
    scoreCrimeData,
    analyzeDayNightCrimes
} from './crimeService.js';

import {
    getSunriseSunset,
    isAfterSunset,
    isBeforeSunrise,
    isNearSunset
} from './sunsetService.js';

// ========================================
// MAIN SAFETY SCORING FUNCTION
// ========================================

/**
 * Calculate comprehensive safety score for a route
 * @param {Object} route - Route object from OSRM with coordinates and instructions
 * @param {Object} startLocation - Start location {lat, lng, name}
 * @param {Object} endLocation - End location {lat, lng, name}
 * @param {Object|null} currentUserLocation - Current user location {lat, lng} (optional)
 * @param {Function|null} sampleRoutePointsFn - Function to sample route points (optional)
 * @returns {Object} Safety score data {score, label, color, breakdown, etc.}
 */
export async function calculateSafetyScore(route, startLocation, endLocation, currentUserLocation = null, sampleRoutePointsFn = null) {

    const distanceMiles = metersToMiles(route.summary.totalDistance);
    const hour = new Date().getHours();

    // Check if route is in San Francisco
    const inSF = isRouteInSanFrancisco(
        startLocation.lat, startLocation.lng,
        endLocation.lat, endLocation.lng
    );

    let crimeScore = null;
    let crimeData = null;
    let crimeBreakdown = null;
    let areaBaseline = null;
    let usingCrimeData = false;
    let crimeSamples = null; // Crime samples for ombre route coloring

    // PHASE 2C: Try to get real crime data if in San Francisco
    if (inSF) {
        try {
            const crimeResult = await queryCrimesAlongRoute(route.coordinates, sampleRoutePointsFn);

            if (crimeResult !== null) {
                crimeData = crimeResult.allCrimes; // Extract allCrimes array
                crimeSamples = crimeResult.crimeSamples; // Extract crime samples for ombre route

                // Calculate route midpoint for baseline
                const midLat = (startLocation.lat + endLocation.lat) / 2;
                const midLng = (startLocation.lng + endLocation.lng) / 2;

                // Get area baseline for relative scoring
                areaBaseline = await calculateAreaBaseline(midLat, midLng);

                // Score crime data with baseline
                crimeBreakdown = scoreCrimeData(crimeData, distanceMiles, hour, areaBaseline);
                crimeScore = crimeBreakdown.score;
                usingCrimeData = true;
            }
        } catch (error) {
            console.error('❌ Error getting crime data:', error);
        }
    }

    // Determine location for sunset/sunrise (priority: user location → start location)
    const locationForSunset = currentUserLocation || startLocation;

    // Get sunset/sunrise data for nighttime warning
    let sunData = null;
    let showNighttimeWarning = false;

    if (locationForSunset) {
        sunData = await getSunriseSunset(locationForSunset.lat, locationForSunset.lng);
    }

    // Calculate other factor scores (0-100)
    const lengthScore = scoreRouteLength(distanceMiles);
    const timeScore = await scoreTimeOfDay(locationForSunset); // Now async with location
    const complexityScore = scoreRouteComplexity(route);
    const roadTypeScore = scoreRoadType(route);

    // Analyze day/night crimes and check if warning should be shown
    if (usingCrimeData && crimeData && sunData) {
        const dayNightAnalysis = analyzeDayNightCrimes(crimeData, sunData);
        const now = new Date();
        const isNighttime = isAfterSunset(now, sunData.sunset);

        // Show warning if: currently nighttime AND 25%+ crime increase at night
        if (isNighttime && dayNightAnalysis.nighttimeIncreasePercent >= 25) {
            showNighttimeWarning = true;
        }
    }

    let totalScore;
    let breakdown;

    if (usingCrimeData) {
        // PHASE 2B: New weighted formula with crime data
        totalScore = (crimeScore * 0.50) +           // Crime data - 50%
                     (timeScore * 0.20) +            // Time of day - 20%
                     (lengthScore * 0.10) +          // Route length - 10%
                     (complexityScore * 0.10) +      // Complexity - 10%
                     (roadTypeScore * 0.10);         // Road type - 10%

        breakdown = {
            crimeData: {
                score: crimeScore,
                weight: 50,
                count: crimeData.length,
                highSeverity: crimeBreakdown.highSeverity,
                mediumSeverity: crimeBreakdown.mediumSeverity,
                lowSeverity: crimeBreakdown.lowSeverity,
                comparisonText: crimeBreakdown.comparisonText,
                percentDifference: crimeBreakdown.percentDifference
            },
            timeOfDay: { score: timeScore, weight: 20 },
            routeLength: { score: lengthScore, weight: 10 },
            complexity: { score: complexityScore, weight: 10 },
            roadType: { score: roadTypeScore, weight: 10 }
        };
    } else {
        // PHASE 2A: Fallback to original algorithm (no crime data)
        const densityScore = scorePopulationDensity(startLocation, endLocation);

        totalScore = (lengthScore * 0.30) +
                     (timeScore * 0.25) +
                     (complexityScore * 0.20) +
                     (roadTypeScore * 0.15) +
                     (densityScore * 0.10);

        breakdown = {
            routeLength: { score: lengthScore, weight: 30 },
            timeOfDay: { score: timeScore, weight: 25 },
            complexity: { score: complexityScore, weight: 20 },
            roadType: { score: roadTypeScore, weight: 15 },
            density: { score: densityScore, weight: 10 }
        };
    }

    // Convert to 0-10 scale
    const finalScore = (totalScore / 10).toFixed(1);

    return {
        score: parseFloat(finalScore),
        label: getSafetyLabel(finalScore),
        color: getSafetyColor(finalScore),
        breakdown: breakdown,
        usingCrimeData: usingCrimeData,
        inSanFrancisco: inSF,
        rawCrimeData: crimeData, // Store raw crime array for detailed analysis
        crimeSamples: crimeSamples, // Crime samples for ombre route coloring
        showNighttimeWarning: showNighttimeWarning // Nighttime warning flag
    };
}

// ========================================
// INDIVIDUAL SCORING FUNCTIONS
// ========================================

/**
 * Score based on route length (shorter is safer)
 * @param {number} miles - Route length in miles
 * @returns {number} Score 0-100
 */
export function scoreRouteLength(miles) {
    if (miles < 0.5) return 100;
    if (miles < 1.0) return 90;
    if (miles < 2.0) return 75;
    if (miles < 5.0) return 50;
    return 30;
}

/**
 * Score based on time of day (daylight is safer) - Uses dynamic sunset/sunrise
 * @param {Object} location - Location object {lat, lng} for sunset calculation
 * @returns {number} Score 0-100
 */
export async function scoreTimeOfDay(location) {
    const now = new Date();

    // Try to get dynamic sunset/sunrise times
    if (location && location.lat && location.lng) {
        try {
            const sunData = await getSunriseSunset(location.lat, location.lng);

            if (sunData) {
                const afterSunset = isAfterSunset(now, sunData.sunset);
                const beforeSunrise = isBeforeSunrise(now, sunData.sunrise);
                const nearSunset = isNearSunset(now, sunData.sunset, 2);

                if ((afterSunset && beforeSunrise) || beforeSunrise) {
                    return 40; // Nighttime
                } else if (nearSunset) {
                    return 70; // Dusk
                } else {
                    return 100; // Daytime
                }
            }
        } catch (error) {
            // Sunset API unavailable, fall through to hardcoded hours
        }
    }

    // FALLBACK: Use hardcoded hours (6am-8pm = day)
    const hour = now.getHours();
    if (hour >= 6 && hour < 20) return 100;  // Daylight
    if (hour >= 20 && hour < 22) return 70;  // Dusk
    return 40; // Night
}

/**
 * Score based on route complexity (fewer turns is safer)
 * @param {Object} route - Route object with instructions
 * @returns {number} Score 0-100
 */
export function scoreRouteComplexity(route) {
    const instructions = route.instructions || [];
    const turnCount = instructions.filter(inst => {
        const type = inst.type;
        return type !== 'Head' && type !== 'Continue' && type !== 'Arrive';
    }).length;

    if (turnCount <= 3) return 100;
    if (turnCount <= 7) return 80;
    if (turnCount <= 12) return 60;
    return 40;
}

/**
 * Score based on road types (major roads safer than alleys)
 * @param {Object} route - Route object with instructions
 * @returns {number} Score 0-100
 */
export function scoreRoadType(route) {
    const instructions = route.instructions || [];
    let majorRoadCount = 0;
    const totalRoads = instructions.length || 1;

    instructions.forEach(inst => {
        const roadName = inst.road || inst.name || '';
        if (roadName.match(/(Avenue|Boulevard|Highway|Street|Road|Drive|Way|Parkway)/i)) {
            majorRoadCount++;
        }
    });

    const majorRoadPercentage = (majorRoadCount / totalRoads) * 100;
    if (majorRoadPercentage >= 80) return 100;
    if (majorRoadPercentage >= 60) return 85;
    if (majorRoadPercentage >= 40) return 70;
    return 50;
}

/**
 * Score based on population density (urban is safer - more people)
 * @param {Object} startLocation - Start location {lat, lng, name}
 * @param {Object} endLocation - End location {lat, lng, name}
 * @returns {number} Score 0-100
 */
export function scorePopulationDensity(startLocation, endLocation) {
    const checkAddress = (location) => {
        if (!location || !location.name) return 'suburban';

        const address = location.name.toLowerCase();
        if (address.match(/(downtown|city center|central|metro|manhattan|brooklyn|bronx)/i)) {
            return 'urban';
        }
        if (address.match(/(suburb|residential|neighborhood)/i)) {
            return 'suburban';
        }
        if (address.match(/(rural|country|village|farm|remote)/i)) {
            return 'rural';
        }
        return 'suburban';
    };

    const scores = { urban: 100, suburban: 70, rural: 50 };
    return Math.min(scores[checkAddress(startLocation)], scores[checkAddress(endLocation)]);
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get safety label from score
 * @param {number} score - Safety score (0-10)
 * @returns {string} Label: "Excellent", "Good", "Fair", or "Caution"
 */
export function getSafetyLabel(score) {
    score = parseFloat(score);
    if (score >= 8.5) return 'Excellent';
    if (score >= 7.0) return 'Good';
    if (score >= 5.0) return 'Fair';
    return 'Caution';
}

/**
 * Get color class from score
 * @param {number} score - Safety score (0-10)
 * @returns {string} CSS class: "excellent", "good", "fair", or "caution"
 */
export function getSafetyColor(score) {
    score = parseFloat(score);
    if (score >= 8.5) return 'excellent';
    if (score >= 7.0) return 'good';
    if (score >= 5.0) return 'fair';
    return 'caution';
}
