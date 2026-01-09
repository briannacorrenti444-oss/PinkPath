/**
 * @fileoverview Street Lighting Service
 * Fetches streetlight complaint data from SF 311 and combines with sunset data
 * to assess lighting quality along routes
 */

import { apiConfig, cacheConfig } from '../config/index.js';

// In-memory cache
const cache = new Map();

// ==============================================
// STREETLIGHT COMPLAINTS (311 Data)
// ==============================================

/**
 * Get streetlight complaint data near a location
 * Uses SF 311 service request data to identify areas with lighting problems
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMeters - Search radius in meters (default: 500)
 * @returns {Promise<Array>} Array of streetlight complaints
 */
export async function getStreetlightComplaints(lat, lng, radiusMeters = 500) {
  const cacheKey = `lighting_${lat.toFixed(4)}_${lng.toFixed(4)}_${radiusMeters}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheConfig.streetlights) {
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

    // Query 311 streetlight data
    const dataset = apiConfig.dataSF.datasets.streetlights;
    const baseUrl = `${apiConfig.dataSF.baseUrl}/${dataset}.json`;

    // Get complaints from last 365 days
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

    // Build query - the Point column contains location data
    const params = new URLSearchParams({
      '$limit': '500',
      '$order': 'opened DESC',
      '$$app_token': apiConfig.dataSF.appToken,
    });

    const response = await fetch(`${baseUrl}?${params}`);

    if (!response.ok) {
      throw new Error(`DataSF Streetlight API error: ${response.status}`);
    }

    const complaints = await response.json();

    // Helper to parse POINT format "POINT (-122.xxx 37.xxx)"
    const parsePoint = (point) => {
      if (!point) return null;

      // Handle string format "POINT (-122.xxx 37.xxx)"
      if (typeof point === 'string') {
        const match = point.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
        if (match) {
          return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
        }
        return null;
      }

      // Handle GeoJSON format
      if (point.coordinates) {
        return { lng: point.coordinates[0], lat: point.coordinates[1] };
      }

      // Handle object with lat/lng
      if (point.latitude && point.longitude) {
        return { lat: parseFloat(point.latitude), lng: parseFloat(point.longitude) };
      }

      return null;
    };

    // Filter by location and enrich data
    const filteredComplaints = complaints
      .filter(complaint => {
        const coords = parsePoint(complaint.point);
        if (!coords) return false;

        // Check if within bounding box
        return (
          coords.lat >= bbox.south &&
          coords.lat <= bbox.north &&
          coords.lng >= bbox.west &&
          coords.lng <= bbox.east
        );
      })
      .map(complaint => {
        const coords = parsePoint(complaint.point);

        return {
          id: complaint.caseid || complaint.case_id || complaint.service_request_id,
          latitude: coords.lat,
          longitude: coords.lng,
          address: complaint.address,
          neighborhood: complaint.neighborhood,
          status: complaint.status,
          opened_date: complaint.opened,
          closed_date: complaint.closed,
          request_type: complaint.request_type,
          request_details: complaint.request_details,
          is_open: complaint.status !== 'Closed',
          days_open: complaint.closed
            ? null
            : Math.floor((Date.now() - new Date(complaint.opened)) / (1000 * 60 * 60 * 24)),
        };
      });

    // Cache the result
    cache.set(cacheKey, {
      data: filteredComplaints,
      timestamp: Date.now(),
    });

    console.log(`[LightingService] Retrieved ${filteredComplaints.length} streetlight complaints near (${lat}, ${lng})`);

    return filteredComplaints;

  } catch (error) {
    console.error('[LightingService] Error fetching streetlight data:', error.message);
    return [];
  }
}

/**
 * Calculate lighting quality score for a location
 * Combines 311 complaint data with time-of-day information
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} sunData - Sunrise/sunset data
 * @returns {Promise<Object>} Lighting quality assessment
 */
export async function assessLightingQuality(lat, lng, sunData) {
  const complaints = await getStreetlightComplaints(lat, lng);

  // Count open vs closed complaints
  const openComplaints = complaints.filter(c => c.is_open);
  const recentComplaints = complaints.filter(c => {
    const opened = new Date(c.opened_date);
    return (Date.now() - opened) < 90 * 24 * 60 * 60 * 1000; // Last 90 days
  });

  // Calculate base lighting score
  let score = 100;

  // Deduct points for open complaints (more severe)
  score -= openComplaints.length * 10;

  // Deduct points for recent complaints (even if closed)
  score -= recentComplaints.length * 3;

  // Ensure score is in valid range
  score = Math.max(0, Math.min(100, score));

  // Determine if it's dark
  const now = new Date();
  const sunrise = new Date(sunData?.sunrise || new Date().setHours(6, 0, 0, 0));
  const sunset = new Date(sunData?.sunset || new Date().setHours(18, 0, 0, 0));
  const isDark = now < sunrise || now > sunset;

  // Lighting matters more when it's dark
  const adjustedScore = isDark ? score : score * 0.3 + 70; // Lighting less important during day

  return {
    score: Math.round(adjustedScore),
    baseScore: Math.round(score),
    totalComplaints: complaints.length,
    openComplaints: openComplaints.length,
    recentComplaints: recentComplaints.length,
    isDark,
    assessment: getAssessmentLabel(adjustedScore),
  };
}

/**
 * Get assessment label from score
 */
function getAssessmentLabel(score) {
  if (score >= 90) return 'Well Lit';
  if (score >= 70) return 'Adequately Lit';
  if (score >= 50) return 'Some Lighting Issues';
  if (score >= 30) return 'Poor Lighting';
  return 'Major Lighting Concerns';
}

/**
 * Clear lighting cache
 */
export function clearLightingCache() {
  cache.clear();
  console.log('[LightingService] Cache cleared');
}

export default {
  getStreetlightComplaints,
  assessLightingQuality,
  clearLightingCache,
};
