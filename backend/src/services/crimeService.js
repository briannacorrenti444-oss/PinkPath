/**
 * @fileoverview Crime Data Service
 * Fetches crime data from SF Open Data (DataSF) APIs
 * - Historical crime data (past 90 days)
 * - Real-time CAD dispatch data
 */

import { apiConfig, cacheConfig } from '../config/index.js';
import { query } from '../db/connection.js';
import { CRIME_CATEGORIES } from '@pinkpath/shared/constants.js';

// ==============================================
// LRU CACHE WITH TTL AND MAX SIZE
// ==============================================

const MAX_CACHE_SIZE = 100; // Maximum number of cached entries
const cache = new Map();

/**
 * Set a cache entry with LRU eviction
 * @param {string} key - Cache key
 * @param {Object} value - Value to cache (must have 'data' and 'timestamp')
 */
function setCacheEntry(key, value) {
  // If key exists, delete it first (to update position in Map)
  if (cache.has(key)) {
    cache.delete(key);
  }

  // Evict oldest entries if at max size
  while (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
    console.log(`[CrimeService] Cache evicted oldest entry: ${oldestKey}`);
  }

  cache.set(key, value);
}

/**
 * Get a cache entry, returning null if expired
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in milliseconds
 * @returns {Object|null} Cached data or null if expired/missing
 */
function getCacheEntry(key, ttl) {
  const cached = cache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp >= ttl) {
    cache.delete(key);
    return null;
  }

  // Move to end of Map for LRU ordering
  cache.delete(key);
  cache.set(key, cached);

  return cached.data;
}

/**
 * Periodically clean expired entries (runs every 5 minutes)
 */
function cleanExpiredEntries() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, value] of cache.entries()) {
    const ttl = key.startsWith('cad_') ? cacheConfig.cad : cacheConfig.crime;
    if (now - value.timestamp >= ttl) {
      cache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[CrimeService] Cleaned ${cleaned} expired cache entries`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanExpiredEntries, 5 * 60 * 1000);

// ==============================================
// HISTORICAL CRIME DATA
// ==============================================

/**
 * Get historical crime data near a location
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMeters - Search radius in meters (default: 800)
 * @param {number} daysBack - Number of days of history (default: 90)
 * @returns {Promise<Array>} Array of crime incidents
 */
export async function getCrimeData(lat, lng, radiusMeters = 800, daysBack = 90) {
  const cacheKey = `crime_${lat.toFixed(4)}_${lng.toFixed(4)}_${radiusMeters}_${daysBack}`;

  // Check cache with TTL
  const cachedData = getCacheEntry(cacheKey, cacheConfig.crime);
  if (cachedData) {
    return cachedData;
  }

  try {
    // Calculate bounding box from radius
    const radiusDegrees = radiusMeters / 111000; // Approximate degrees per meter
    const bbox = {
      north: lat + radiusDegrees,
      south: lat - radiusDegrees,
      east: lng + radiusDegrees / Math.cos(lat * Math.PI / 180),
      west: lng - radiusDegrees / Math.cos(lat * Math.PI / 180),
    };

    // Calculate date range - format dates for SODA API (no timezone suffix)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Format dates as YYYY-MM-DDTHH:MM:SS (floating timestamp for SODA)
    const formatSodaDate = (date) => {
      return date.toISOString().replace('Z', '').split('.')[0];
    };

    // Build SODA query
    const dataset = apiConfig.dataSF.datasets.crime;
    const baseUrl = `${apiConfig.dataSF.baseUrl}/${dataset}.json`;

    const whereClause = `
      latitude >= ${bbox.south} AND
      latitude <= ${bbox.north} AND
      longitude >= ${bbox.west} AND
      longitude <= ${bbox.east} AND
      incident_datetime >= '${formatSodaDate(startDate)}' AND
      incident_datetime <= '${formatSodaDate(endDate)}'
    `.replace(/\s+/g, ' ').trim();

    const params = new URLSearchParams({
      '$where': whereClause,
      '$limit': '1000',
      '$order': 'incident_datetime DESC',
      '$$app_token': apiConfig.dataSF.appToken,
    });

    const fullUrl = `${baseUrl}?${params}`;
    console.log(`[CrimeService] Fetching crime data from: ${fullUrl.substring(0, 150)}...`);

    const response = await fetch(fullUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CrimeService] DataSF API error ${response.status}: ${errorText.substring(0, 200)}`);
      throw new Error(`DataSF API error: ${response.status}`);
    }

    const crimes = await response.json();
    console.log(`[CrimeService] DataSF returned ${crimes.length} crimes for bbox: north=${bbox.north.toFixed(4)}, south=${bbox.south.toFixed(4)}`);

    // Enrich crime data
    const enrichedCrimes = crimes.map(crime => ({
      id: crime.row_id || crime.incident_id,
      latitude: parseFloat(crime.latitude),
      longitude: parseFloat(crime.longitude),
      incident_datetime: crime.incident_datetime,
      incident_category: crime.incident_category,
      incident_subcategory: crime.incident_subcategory,
      incident_description: crime.incident_description,
      resolution: crime.resolution,
      police_district: crime.police_district,
      neighborhood: crime.analysis_neighborhood,
      isViolent: CRIME_CATEGORIES.isViolent(crime.incident_category || ''),
      isProperty: CRIME_CATEGORIES.isProperty(crime.incident_category || ''),
    }));

    // Cache the result with LRU eviction
    setCacheEntry(cacheKey, {
      data: enrichedCrimes,
      timestamp: Date.now(),
    });

    console.log(`[CrimeService] Retrieved ${enrichedCrimes.length} crimes near (${lat}, ${lng})`);

    return enrichedCrimes;

  } catch (error) {
    console.error('[CrimeService] Error fetching crime data:', error.message);

    // Try to get from database cache
    try {
      const dbResult = await query(
        `SELECT * FROM crime_data_cache
         WHERE latitude BETWEEN $1 AND $2
         AND longitude BETWEEN $3 AND $4
         AND incident_datetime >= $5`,
        [
          lat - radiusMeters / 111000,
          lat + radiusMeters / 111000,
          lng - radiusMeters / (111000 * Math.cos(lat * Math.PI / 180)),
          lng + radiusMeters / (111000 * Math.cos(lat * Math.PI / 180)),
          new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
        ]
      );

      if (dbResult.rows.length > 0) {
        console.log(`[CrimeService] Using ${dbResult.rows.length} cached crimes from database`);
        return dbResult.rows;
      }
    } catch (dbError) {
      console.warn('[CrimeService] Database cache query failed:', dbError.message);
    }

    // Return empty array as last resort
    return [];
  }
}

// ==============================================
// REAL-TIME CAD DATA
// ==============================================

/**
 * Get real-time CAD (Computer Aided Dispatch) data
 * Shows current police activity in an area
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMeters - Search radius in meters (default: 1000)
 * @returns {Promise<Array>} Array of active CAD incidents
 */
export async function getRealtimeCadData(lat, lng, radiusMeters = 1000) {
  const cacheKey = `cad_${lat.toFixed(4)}_${lng.toFixed(4)}_${radiusMeters}`;

  // Check cache with TTL (shorter duration for real-time data)
  const cachedData = getCacheEntry(cacheKey, cacheConfig.cad);
  if (cachedData) {
    return cachedData;
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

    // Query CAD data
    const dataset = apiConfig.dataSF.datasets.cad;
    const baseUrl = `${apiConfig.dataSF.baseUrl}/${dataset}.json`;

    // Get incidents from last 24 hours that haven't been closed
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);

    // Format dates as YYYY-MM-DDTHH:MM:SS (floating timestamp for SODA)
    const formatSodaDate = (date) => {
      return date.toISOString().replace('Z', '').split('.')[0];
    };

    const whereClause = `
      received_datetime >= '${formatSodaDate(cutoffTime)}' AND
      (close_datetime IS NULL OR close_datetime >= '${formatSodaDate(new Date())}')
    `.replace(/\s+/g, ' ').trim();

    const params = new URLSearchParams({
      '$where': whereClause,
      '$limit': '200',
      '$order': 'received_datetime DESC',
      '$$app_token': apiConfig.dataSF.appToken,
    });

    const response = await fetch(`${baseUrl}?${params}`);

    if (!response.ok) {
      throw new Error(`DataSF CAD API error: ${response.status}`);
    }

    const incidents = await response.json();

    // Filter by location (CAD data may not have precise coordinates)
    // and enrich the data
    const enrichedIncidents = incidents
      .filter(incident => {
        // If no coordinates, include it (we'll rely on neighborhood/address)
        if (!incident.intersection_point) return true;

        // Parse coordinates from intersection_point (POINT format)
        const match = incident.intersection_point?.match(/POINT \(([-\d.]+) ([-\d.]+)\)/);
        if (!match) return true;

        const incLng = parseFloat(match[1]);
        const incLat = parseFloat(match[2]);

        return (
          incLat >= bbox.south &&
          incLat <= bbox.north &&
          incLng >= bbox.west &&
          incLng <= bbox.east
        );
      })
      .map(incident => {
        // Parse coordinates
        let incLat = null;
        let incLng = null;
        const match = incident.intersection_point?.match(/POINT \(([-\d.]+) ([-\d.]+)\)/);
        if (match) {
          incLng = parseFloat(match[1]);
          incLat = parseFloat(match[2]);
        }

        return {
          id: incident.cad_number,
          cad_number: incident.cad_number,
          latitude: incLat,
          longitude: incLng,
          received_datetime: incident.received_datetime,
          dispatch_datetime: incident.dispatch_datetime,
          call_type: incident.call_type_final_desc || incident.call_type_original_desc,
          priority: incident.priority_final || incident.priority_original,
          disposition: incident.disposition,
          agency: incident.agency,
          is_active: !incident.close_datetime,
        };
      });

    // Cache the result with LRU eviction
    setCacheEntry(cacheKey, {
      data: enrichedIncidents,
      timestamp: Date.now(),
    });

    console.log(`[CrimeService] Retrieved ${enrichedIncidents.length} CAD incidents`);

    return enrichedIncidents;

  } catch (error) {
    console.error('[CrimeService] Error fetching CAD data:', error.message);
    return [];
  }
}

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

/**
 * Clear the crime data cache
 */
export function clearCrimeCache() {
  cache.clear();
  console.log('[CrimeService] Cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

export default {
  getCrimeData,
  getRealtimeCadData,
  clearCrimeCache,
  getCacheStats,
};
