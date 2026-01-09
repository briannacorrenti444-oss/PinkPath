/**
 * @fileoverview Sunset/Sunrise Service
 * Fetches sunrise and sunset times for time-of-day safety adjustments
 * Uses the free sunrise-sunset.org API
 */

import { apiConfig, cacheConfig } from '../config/index.js';

// In-memory cache for sun data
const cache = new Map();

// ==============================================
// SUNRISE/SUNSET DATA
// ==============================================

/**
 * Get sunrise and sunset times for a location
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} date - Date in YYYY-MM-DD format (default: today)
 * @returns {Promise<Object>} Sun data with sunrise, sunset, and derived values
 */
export async function getSunsetData(lat, lng, date = null) {
  // Default to today's date
  const targetDate = date || new Date().toISOString().split('T')[0];
  const cacheKey = `sun_${lat.toFixed(2)}_${lng.toFixed(2)}_${targetDate}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheConfig.sunset) {
    return cached.data;
  }

  try {
    // Build API URL - sunrise-sunset.org is free and doesn't require API key
    const url = new URL(apiConfig.sunsetApi.baseUrl);
    url.searchParams.set('lat', lat);
    url.searchParams.set('lng', lng);
    url.searchParams.set('date', targetDate);
    url.searchParams.set('formatted', '0'); // Get ISO 8601 format

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Sunset API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      throw new Error(`Sunset API returned status: ${data.status}`);
    }

    const results = data.results;

    // Parse times and calculate derived values
    const sunData = {
      date: targetDate,
      sunrise: results.sunrise,
      sunset: results.sunset,
      solarNoon: results.solar_noon,
      dayLength: results.day_length,
      civilTwilightBegin: results.civil_twilight_begin,
      civilTwilightEnd: results.civil_twilight_end,
      nauticalTwilightBegin: results.nautical_twilight_begin,
      nauticalTwilightEnd: results.nautical_twilight_end,
      astronomicalTwilightBegin: results.astronomical_twilight_begin,
      astronomicalTwilightEnd: results.astronomical_twilight_end,
      // Derived values for safety calculations
      timePeriod: calculateTimePeriod(results),
      isDark: isCurrentlyDark(results),
      minutesUntilDark: calculateMinutesUntilDark(results),
      minutesUntilLight: calculateMinutesUntilLight(results),
    };

    // Cache the result
    cache.set(cacheKey, {
      data: sunData,
      timestamp: Date.now(),
    });

    console.log(`[SunsetService] Retrieved sun data for ${targetDate}: sunrise ${sunData.sunrise}, sunset ${sunData.sunset}`);

    return sunData;

  } catch (error) {
    console.error('[SunsetService] Error fetching sun data:', error.message);

    // Return fallback data (approximate SF times)
    return getFallbackSunData(targetDate);
  }
}

/**
 * Calculate the current time period based on sun position
 *
 * @param {Object} results - API results with twilight times
 * @returns {string} Time period: 'daylight' | 'twilight' | 'night' | 'lateNight'
 */
function calculateTimePeriod(results) {
  const now = new Date();
  const sunrise = new Date(results.sunrise);
  const sunset = new Date(results.sunset);
  const civilTwilightBegin = new Date(results.civil_twilight_begin);
  const civilTwilightEnd = new Date(results.civil_twilight_end);

  // Late night: midnight to 5am
  const hour = now.getHours();
  if (hour >= 0 && hour < 5) {
    return 'lateNight';
  }

  // Full daylight: after sunrise to before sunset
  if (now >= sunrise && now <= sunset) {
    return 'daylight';
  }

  // Morning twilight: between civil twilight begin and sunrise
  if (now >= civilTwilightBegin && now < sunrise) {
    return 'twilight';
  }

  // Evening twilight: between sunset and civil twilight end
  if (now > sunset && now <= civilTwilightEnd) {
    return 'twilight';
  }

  // Night: after civil twilight end or before civil twilight begin
  return 'night';
}

/**
 * Check if it's currently dark (after sunset or before sunrise)
 *
 * @param {Object} results - API results
 * @returns {boolean} True if dark
 */
function isCurrentlyDark(results) {
  const now = new Date();
  const sunrise = new Date(results.sunrise);
  const sunset = new Date(results.sunset);

  return now < sunrise || now > sunset;
}

/**
 * Calculate minutes until it gets dark (sunset)
 *
 * @param {Object} results - API results
 * @returns {number|null} Minutes until dark, or null if already dark
 */
function calculateMinutesUntilDark(results) {
  const now = new Date();
  const sunset = new Date(results.sunset);

  if (now >= sunset) {
    return null; // Already dark
  }

  return Math.round((sunset - now) / (1000 * 60));
}

/**
 * Calculate minutes until it gets light (sunrise)
 *
 * @param {Object} results - API results
 * @returns {number|null} Minutes until light, or null if already light
 */
function calculateMinutesUntilLight(results) {
  const now = new Date();
  const sunrise = new Date(results.sunrise);

  if (now >= sunrise) {
    // Check tomorrow's sunrise
    const tomorrow = new Date(sunrise);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return Math.round((tomorrow - now) / (1000 * 60));
  }

  return Math.round((sunrise - now) / (1000 * 60));
}

/**
 * Get fallback sun data when API fails
 * Uses approximate SF times based on season
 *
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Object} Fallback sun data
 */
function getFallbackSunData(date) {
  const targetDate = new Date(date);
  const month = targetDate.getMonth();

  // Approximate SF sunrise/sunset times by season
  const seasonTimes = {
    winter: { sunrise: '07:00', sunset: '17:00' }, // Dec, Jan, Feb
    spring: { sunrise: '06:15', sunset: '19:30' }, // Mar, Apr, May
    summer: { sunrise: '05:45', sunset: '20:30' }, // Jun, Jul, Aug
    fall: { sunrise: '06:30', sunset: '18:30' },   // Sep, Oct, Nov
  };

  let season;
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall';
  else season = 'winter';

  const times = seasonTimes[season];
  const dateStr = date;

  // Construct ISO timestamps
  const sunrise = new Date(`${dateStr}T${times.sunrise}:00-08:00`);
  const sunset = new Date(`${dateStr}T${times.sunset}:00-08:00`);

  console.warn('[SunsetService] Using fallback sun data');

  return {
    date: dateStr,
    sunrise: sunrise.toISOString(),
    sunset: sunset.toISOString(),
    solarNoon: null,
    dayLength: null,
    civilTwilightBegin: null,
    civilTwilightEnd: null,
    nauticalTwilightBegin: null,
    nauticalTwilightEnd: null,
    astronomicalTwilightBegin: null,
    astronomicalTwilightEnd: null,
    timePeriod: calculateTimePeriodFromTimes(sunrise, sunset),
    isDark: isCurrentlyDarkFromTimes(sunrise, sunset),
    minutesUntilDark: calculateMinutesUntilDarkFromTimes(sunset),
    minutesUntilLight: calculateMinutesUntilLightFromTimes(sunrise),
    isFallback: true,
  };
}

/**
 * Helper functions for fallback data
 */
function calculateTimePeriodFromTimes(sunrise, sunset) {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 0 && hour < 5) return 'lateNight';
  if (now >= sunrise && now <= sunset) return 'daylight';
  return 'night';
}

function isCurrentlyDarkFromTimes(sunrise, sunset) {
  const now = new Date();
  return now < sunrise || now > sunset;
}

function calculateMinutesUntilDarkFromTimes(sunset) {
  const now = new Date();
  if (now >= sunset) return null;
  return Math.round((sunset - now) / (1000 * 60));
}

function calculateMinutesUntilLightFromTimes(sunrise) {
  const now = new Date();
  if (now >= sunrise) {
    const tomorrow = new Date(sunrise);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return Math.round((tomorrow - now) / (1000 * 60));
  }
  return Math.round((sunrise - now) / (1000 * 60));
}

/**
 * Clear sunset cache
 */
export function clearSunsetCache() {
  cache.clear();
  console.log('[SunsetService] Cache cleared');
}

/**
 * Get time modifier for safety scoring based on time of day
 *
 * @param {Object} sunData - Sun data from getSunsetData()
 * @returns {number} Modifier between 0.75 and 1.0
 */
export function getTimeModifier(sunData) {
  const modifiers = {
    daylight: 1.0,
    twilight: 0.95,
    night: 0.85,
    lateNight: 0.75,
  };

  return modifiers[sunData.timePeriod] || 0.85;
}

export default {
  getSunsetData,
  clearSunsetCache,
  getTimeModifier,
};
