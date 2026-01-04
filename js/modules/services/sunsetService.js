// ========================================
// PINKPATH SUNSET/SUNRISE SERVICE
// Handles sunset/sunrise API calls and time checks
// ========================================

// Import configuration
import { SUNSET_API, CACHE_DURATION } from '../config.js';

// ========================================
// CACHE
// ========================================

// Sunset cache (24-hour cache to reduce API calls)
const sunsetCache = new Map();

// ========================================
// CACHE FUNCTIONS
// ========================================

/**
 * Get cache key for sunset data
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Cache key
 */
export function getSunsetCacheKey(lat, lng) {
    const roundedLat = lat.toFixed(2);
    const roundedLng = lng.toFixed(2);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `sunset_${roundedLat}_${roundedLng}_${today}`;
}

// ========================================
// API FUNCTIONS
// ========================================

/**
 * Fetch sunset/sunrise times for a location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object|null} Sunset data {sunrise, sunset, solarNoon} or null on error
 */
export async function getSunriseSunset(lat, lng) {
    // Check cache first
    const cacheKey = getSunsetCacheKey(lat, lng);
    const cached = sunsetCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        return cached.data;
    }

    try {
        const url = `${SUNSET_API.baseUrl}?lat=${lat}&lng=${lng}&date=today&formatted=0`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Sunset API returned ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== 'OK') {
            throw new Error('Sunset API error');
        }

        // Parse times (API returns ISO 8601 UTC times)
        const sunData = {
            sunrise: new Date(data.results.sunrise),
            sunset: new Date(data.results.sunset),
            solarNoon: new Date(data.results.solar_noon)
        };

        // Cache the results
        sunsetCache.set(cacheKey, {
            data: sunData,
            timestamp: Date.now()
        });

        return sunData;

    } catch (error) {
        console.error('❌ Sunset API error:', error.message);
        return null; // Return null to trigger fallback
    }
}

// ========================================
// TIME CHECK FUNCTIONS
// ========================================

/**
 * Check if current time is after sunset
 * @param {Date} currentTime - Current time
 * @param {Date} sunset - Sunset time
 * @returns {boolean} True if after sunset
 */
export function isAfterSunset(currentTime, sunset) {
    return currentTime >= sunset;
}

/**
 * Check if current time is before sunrise
 * @param {Date} currentTime - Current time
 * @param {Date} sunrise - Sunrise time
 * @returns {boolean} True if before sunrise
 */
export function isBeforeSunrise(currentTime, sunrise) {
    return currentTime < sunrise;
}

/**
 * Check if within X hours of sunset (for dusk detection)
 * @param {Date} currentTime - Current time
 * @param {Date} sunset - Sunset time
 * @param {number} hours - Hours threshold (default: 2)
 * @returns {boolean} True if within X hours after sunset
 */
export function isNearSunset(currentTime, sunset, hours = 2) {
    const timeDiff = currentTime - sunset;
    const hoursDiff = timeDiff / (1000 * 60 * 60); // Convert ms to hours
    return hoursDiff >= 0 && hoursDiff <= hours;
}
