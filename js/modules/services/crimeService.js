// ========================================
// PINKPATH CRIME SERVICE
// Handles all crime data API calls, caching, and processing
// ========================================

// Import configuration and utilities
import { CRIME_API, CACHE_DURATION, SF_BOUNDS, CRIME_WEIGHTS } from '../config.js';
import { calculateDistance } from '../utils.js';

// Crime cache (24-hour cache to reduce API calls)
// MIGRATION: Moved from script.js line 94
const crimeCache = new Map();

// ========================================
// SAN FRANCISCO BOUNDS CHECKING
// ========================================

/**
 * Check if a location is within San Francisco bounds
 */
export function isInSanFrancisco(lat, lng) {
    return lat >= SF_BOUNDS.south &&
           lat <= SF_BOUNDS.north &&
           lng >= SF_BOUNDS.west &&
           lng <= SF_BOUNDS.east;
}

/**
 * Check if entire route is in San Francisco
 */
export function isRouteInSanFrancisco(startLat, startLng, endLat, endLng) {
    return isInSanFrancisco(startLat, startLng) && isInSanFrancisco(endLat, endLng);
}

// ========================================
// CACHE MANAGEMENT
// ========================================

/**
 * Generate cache key for crime data
 */
export function getCrimesCacheKey(lat, lng) {
    const roundedLat = lat.toFixed(2);
    const roundedLng = lng.toFixed(2);
    const today = new Date().toISOString().split('T')[0];
    return `crime_${roundedLat}_${roundedLng}_${today}`;
}

/**
 * Get cached crime data
 */
export function getCachedCrimes(lat, lng) {
    const key = getCrimesCacheKey(lat, lng);
    const cached = crimeCache.get(key);

    if (!cached) return null;

    // Check if cache is still valid (24 hours)
    if (Date.now() - cached.timestamp > CACHE_DURATION) {
        crimeCache.delete(key);
        return null;
    }

    return cached.data;
}

/**
 * Set cached crime data
 */
export function setCachedCrimes(lat, lng, data) {
    const key = getCrimesCacheKey(lat, lng);
    crimeCache.set(key, { data: data, timestamp: Date.now() });
}

// ========================================
// CRIME API QUERIES
// ========================================

/**
 * Query crimes near a specific location from SF Open Data API
 */
export async function queryCrimesNearLocation(lat, lng, radiusMeters = CRIME_API.radiusMeters) {
    // Check cache first
    const cached = getCachedCrimes(lat, lng);
    if (cached !== null) return cached;

    try {
        // Calculate date range (last 90 days)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - CRIME_API.daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];

        // Build API query URL
        const whereClause = `within_circle(point, ${lat}, ${lng}, ${radiusMeters}) AND incident_datetime > '${startDateStr}'`;
        const selectFields = 'incident_category,incident_datetime,latitude,longitude';

        const url = `${CRIME_API.baseUrl}?` +
                    `$$app_token=${CRIME_API.appToken}&` +
                    `$where=${encodeURIComponent(whereClause)}&` +
                    `$select=${selectFields}&` +
                    `$limit=1000`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Crime API returned ${response.status}`);
        }

        const crimes = await response.json();
        setCachedCrimes(lat, lng, crimes);
        return crimes;

    } catch (error) {
        console.error('❌ Error querying crime data:', error);
        return null;
    }
}

/**
 * Query crimes along entire route
 */
export async function queryCrimesAlongRoute(routeCoordinates, sampleRoutePointsFn) {
    if (!routeCoordinates || routeCoordinates.length === 0) return null;

    try {
        // Sample points along the route (every ~0.15 miles)
        const samplePoints = sampleRoutePointsFn(routeCoordinates, CRIME_API.sampleInterval);

        // Query crimes near each sample point in parallel
        const crimePromises = samplePoints.map(point =>
            queryCrimesNearLocation(point.lat, point.lng)
        );
        const crimeResults = await Promise.all(crimePromises);

        // Check if any API call failed
        if (crimeResults.some(result => result === null)) return null;

        // Flatten results and remove duplicates
        const allCrimes = [];
        const crimeSets = new Set();

        crimeResults.forEach(crimes => {
            crimes.forEach(crime => {
                const crimeId = `${crime.incident_category}_${crime.incident_datetime}_${crime.latitude}_${crime.longitude}`;
                if (!crimeSets.has(crimeId)) {
                    crimeSets.add(crimeId);
                    allCrimes.push(crime);
                }
            });
        });

        // Combine sample points with their crime data for ombre route coloring
        const crimeSamples = samplePoints.map((point, index) => ({
            lat: point.lat,
            lng: point.lng,
            crimes: crimeResults[index] || []
        }));

        return { allCrimes, crimeSamples };

    } catch (error) {
        console.error('❌ Error analyzing route crime data:', error);
        return null;
    }
}

/**
 * Calculate area baseline for relative crime scoring (3-mile radius)
 */
export async function calculateAreaBaseline(midpointLat, midpointLng) {
    try {
        const radiusMeters = 3 * 1609.34; // 3 miles to meters

        // Check cache first (use larger grid for baseline)
        const cacheKey = `baseline_${midpointLat.toFixed(1)}_${midpointLng.toFixed(1)}`;
        const cached = crimeCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            return cached.data;
        }

        // Build API query for baseline area
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - CRIME_API.daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];

        const whereClause = `within_circle(point, ${midpointLat}, ${midpointLng}, ${radiusMeters}) AND incident_datetime > '${startDateStr}'`;
        const selectFields = 'incident_category,incident_datetime';

        const url = `${CRIME_API.baseUrl}?` +
                    `$$app_token=${CRIME_API.appToken}&` +
                    `$where=${encodeURIComponent(whereClause)}&` +
                    `$select=${selectFields}&` +
                    `$limit=5000`;

        const response = await fetch(url);
        if (!response.ok) return null;

        const crimes = await response.json();

        // Calculate baseline density (crimes per square mile)
        const areaSqMiles = Math.PI * 3 * 3; // π * r²

        // Calculate weighted baseline
        let weightedBaseline = 0;
        crimes.forEach(crime => {
            const weight = CRIME_WEIGHTS[crime.incident_category] || 1.0;
            if (weight > 0) weightedBaseline += weight;
        });

        const baselineData = {
            totalCrimes: crimes.length,
            density: crimes.length / areaSqMiles,
            weightedDensity: weightedBaseline / areaSqMiles
        };

        // Cache the baseline
        crimeCache.set(cacheKey, { data: baselineData, timestamp: Date.now() });
        return baselineData;

    } catch (error) {
        console.error('❌ Error calculating baseline:', error);
        return null;
    }
}

// ========================================
// DATA PROCESSING
// ========================================

/**
 * Filter crimes to last 30 days for display
 */
export function filterCrimesLast30Days(crimes) {
    if (!crimes || crimes.length === 0) return [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return crimes.filter(crime => new Date(crime.incident_datetime) >= thirtyDaysAgo);
}

/**
 * Group crimes by type and count occurrences
 */
export function groupCrimesByType(crimes) {
    const grouped = {};

    crimes.forEach(crime => {
        const category = crime.incident_category;
        grouped[category] = (grouped[category] || 0) + 1;
    });

    // Sort by count (descending)
    return Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
        }, {});
}

/**
 * Get severity level for a crime category
 */
export function getCrimeSeverity(category) {
    const weight = CRIME_WEIGHTS[category] || 1.0;
    if (weight >= 3.0) return 'high';
    if (weight >= 2.0) return 'medium';
    return 'low';
}

/**
 * Score crime data with relative scoring (graded curve)
 */
export function scoreCrimeData(crimes, routeLengthMiles, timeOfDay, areaBaseline = null) {
    if (!crimes || crimes.length === 0) {
        return {
            score: 100,
            totalCrimes: 0,
            highSeverity: 0,
            mediumSeverity: 0,
            lowSeverity: 0,
            comparisonText: 'No crimes found',
            percentDifference: 0
        };
    }

    // Calculate weighted crime count
    let weightedCrimeCount = 0;
    const hour = timeOfDay || new Date().getHours();
    const isNighttime = hour >= 20 || hour < 6;

    // Count crimes by severity
    let highSeverity = 0, mediumSeverity = 0, lowSeverity = 0;

    crimes.forEach(crime => {
        const category = crime.incident_category;
        const weight = CRIME_WEIGHTS[category] || 1.0;

        if (weight === 0) return; // Skip excluded categories

        // Time-of-day multiplier
        const crimeHour = new Date(crime.incident_datetime).getHours();
        const crimeAtNight = crimeHour >= 20 || crimeHour < 6;

        let timeMultiplier = 1.0;
        if (isNighttime && crimeAtNight) {
            timeMultiplier = 1.5;
        } else if (!isNighttime && !crimeAtNight) {
            timeMultiplier = 1.2;
        }

        weightedCrimeCount += weight * timeMultiplier;

        // Track severity for breakdown
        if (weight >= 3.0) highSeverity++;
        else if (weight >= 2.0) mediumSeverity++;
        else lowSeverity++;
    });

    // Calculate crimes per mile
    const crimesPerMile = weightedCrimeCount / Math.max(routeLengthMiles, 0.5);

    let score;
    let comparisonText = '';
    let percentDifference = 0;

    // RELATIVE SCORING: Compare to area baseline if available
    if (areaBaseline && areaBaseline.weightedDensity > 0) {
        const routeDensitySqMi = crimesPerMile / 0.1;
        const relativeRatio = routeDensitySqMi / areaBaseline.weightedDensity;
        percentDifference = ((areaBaseline.weightedDensity - routeDensitySqMi) / areaBaseline.weightedDensity) * 100;

        score = Math.max(10, Math.min(100, 100 - (relativeRatio * 50)));

        if (percentDifference > 15) {
            comparisonText = `${Math.abs(percentDifference).toFixed(0)}% safer than area average`;
        } else if (percentDifference < -15) {
            comparisonText = `${Math.abs(percentDifference).toFixed(0)}% higher than area average`;
        } else {
            comparisonText = `Similar to area average`;
        }
    } else {
        // ABSOLUTE SCORING
        if (crimesPerMile <= 5) {
            score = 100 - (crimesPerMile * 6);
        } else if (crimesPerMile <= 15) {
            score = 70 - ((crimesPerMile - 5) * 3);
        } else {
            score = Math.max(20, 40 - Math.log10(crimesPerMile - 14) * 15);
        }

        score = Math.max(0, Math.min(100, score));
        comparisonText = 'Absolute scoring (no baseline)';
    }

    return {
        score,
        totalCrimes: crimes.length,
        highSeverity,
        mediumSeverity,
        lowSeverity,
        comparisonText,
        percentDifference
    };
}

/**
 * Analyze day vs night crime rates
 */
export function analyzeDayNightCrimes(crimes, sunData) {
    if (!crimes || crimes.length === 0 || !sunData) {
        return { daytimeCrimes: 0, nighttimeCrimes: 0, nighttimeIncreasePercent: 0 };
    }

    let daytimeCrimes = 0;
    let nighttimeCrimes = 0;

    const sunriseHour = sunData.sunrise.getHours();
    const sunsetHour = sunData.sunset.getHours();

    crimes.forEach(crime => {
        const crimeHour = new Date(crime.incident_datetime).getHours();
        if (crimeHour >= sunsetHour || crimeHour < sunriseHour) {
            nighttimeCrimes++;
        } else {
            daytimeCrimes++;
        }
    });

    // Calculate percentage increase
    let nighttimeIncreasePercent = 0;
    if (daytimeCrimes > 0) {
        const dayHours = sunsetHour - sunriseHour;
        const nightHours = 24 - dayHours;
        const daytimeRate = daytimeCrimes / dayHours;
        const nighttimeRate = nighttimeCrimes / nightHours;
        nighttimeIncreasePercent = ((nighttimeRate - daytimeRate) / daytimeRate) * 100;
    }

    return { daytimeCrimes, nighttimeCrimes, nighttimeIncreasePercent };
}

/**
 * Filter crimes to last 7 days and violent/theft categories only
 */
export function filterRecentViolentCrimes(crimes) {
    if (!crimes || crimes.length === 0) return [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const violentCategories = [
        'Homicide', 'Robbery', 'Assault', 'Sex Offense', 'Human Trafficking', 'Weapon Offense'
    ];
    const theftCategories = ['Burglary', 'Motor Vehicle Theft', 'Larceny Theft'];
    const targetCategories = [...violentCategories, ...theftCategories];

    return crimes
        .filter(crime => {
            const crimeDate = new Date(crime.incident_datetime);
            return crimeDate >= sevenDaysAgo && targetCategories.includes(crime.incident_category);
        })
        .map(crime => ({
            ...crime,
            isViolent: violentCategories.includes(crime.incident_category)
        }));
}
