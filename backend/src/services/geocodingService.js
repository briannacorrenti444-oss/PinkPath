/**
 * @fileoverview Geocoding Service
 * Handles address-to-coordinates and coordinates-to-address conversion
 * Uses Google Geocoding API
 */

import { apiConfig, cacheConfig } from '../config/index.js';
import { SF_BOUNDS } from '@pinkpath/shared/constants.js';

// In-memory cache
const cache = new Map();

// ==============================================
// GEOCODING (Address to Coordinates)
// ==============================================

/**
 * Convert an address to coordinates
 *
 * @param {string} address - Address string to geocode
 * @param {Object} options - Geocoding options
 * @param {boolean} options.restrictToSF - Restrict results to San Francisco (default: true)
 * @returns {Promise<Object>} Geocoding result with coordinates and formatted address
 */
export async function geocodeAddress(address, options = {}) {
  const { restrictToSF = true } = options;
  const cacheKey = `geocode_${address.toLowerCase().replace(/\s+/g, '_')}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheConfig.geocoding) {
    return cached.data;
  }

  const apiKey = apiConfig.google.apiKey;

  if (!apiKey) {
    console.error('[GeocodingService] Google API key not configured');
    throw new Error('Geocoding service not configured');
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', apiKey);

    // Bias results towards San Francisco
    if (restrictToSF) {
      // SF bounds for biasing
      url.searchParams.set('bounds', `${SF_BOUNDS.south},${SF_BOUNDS.west}|${SF_BOUNDS.north},${SF_BOUNDS.east}`);
      // Also add region hint
      url.searchParams.set('region', 'us');
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'ZERO_RESULTS') {
      return {
        success: false,
        error: 'No results found for this address',
        query: address,
      };
    }

    if (data.status !== 'OK') {
      throw new Error(`Google Geocoding returned status: ${data.status}`);
    }

    // Get the first result
    const result = data.results[0];
    const location = result.geometry.location;

    // Check if result is within SF bounds
    const isInSF = SF_BOUNDS.contains(location.lat, location.lng);

    if (restrictToSF && !isInSF) {
      // Try to find an SF result from the list
      const sfResult = data.results.find(r => {
        const loc = r.geometry.location;
        return SF_BOUNDS.contains(loc.lat, loc.lng);
      });

      if (sfResult) {
        const sfLocation = sfResult.geometry.location;
        const geocodeResult = {
          success: true,
          latitude: sfLocation.lat,
          longitude: sfLocation.lng,
          formattedAddress: sfResult.formatted_address,
          placeId: sfResult.place_id,
          types: sfResult.types,
          isInSF: true,
          components: parseAddressComponents(sfResult.address_components),
        };

        cache.set(cacheKey, { data: geocodeResult, timestamp: Date.now() });
        return geocodeResult;
      }

      // Return result but flag it as outside SF
      console.warn(`[GeocodingService] Result for "${address}" is outside SF bounds`);
    }

    const geocodeResult = {
      success: true,
      latitude: location.lat,
      longitude: location.lng,
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
      types: result.types,
      isInSF,
      components: parseAddressComponents(result.address_components),
      // Include all results if multiple
      alternativeResults: data.results.length > 1
        ? data.results.slice(1, 4).map(r => ({
          formattedAddress: r.formatted_address,
          latitude: r.geometry.location.lat,
          longitude: r.geometry.location.lng,
          placeId: r.place_id,
        }))
        : [],
    };

    // Cache the result
    cache.set(cacheKey, {
      data: geocodeResult,
      timestamp: Date.now(),
    });

    console.log(`[GeocodingService] Geocoded "${address}" to (${location.lat}, ${location.lng})`);

    return geocodeResult;

  } catch (error) {
    console.error('[GeocodingService] Geocoding error:', error.message);
    throw error;
  }
}

// ==============================================
// REVERSE GEOCODING (Coordinates to Address)
// ==============================================

/**
 * Convert coordinates to an address
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Reverse geocoding result with address details
 */
export async function reverseGeocode(lat, lng) {
  const cacheKey = `reverse_${lat.toFixed(6)}_${lng.toFixed(6)}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheConfig.geocoding) {
    return cached.data;
  }

  const apiKey = apiConfig.google.apiKey;

  if (!apiKey) {
    console.error('[GeocodingService] Google API key not configured');
    throw new Error('Geocoding service not configured');
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Reverse Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'ZERO_RESULTS') {
      return {
        success: false,
        error: 'No address found for these coordinates',
        latitude: lat,
        longitude: lng,
      };
    }

    if (data.status !== 'OK') {
      throw new Error(`Google Geocoding returned status: ${data.status}`);
    }

    // Parse results to get different address types
    const results = data.results;
    const streetAddress = results.find(r => r.types.includes('street_address'));
    const premise = results.find(r => r.types.includes('premise'));
    const route = results.find(r => r.types.includes('route'));
    const neighborhood = results.find(r => r.types.includes('neighborhood'));
    const primaryResult = streetAddress || premise || route || results[0];

    const reverseResult = {
      success: true,
      latitude: lat,
      longitude: lng,
      formattedAddress: primaryResult.formatted_address,
      placeId: primaryResult.place_id,
      types: primaryResult.types,
      isInSF: SF_BOUNDS.contains(lat, lng),
      components: parseAddressComponents(primaryResult.address_components),
      // Provide different granularities
      addresses: {
        full: primaryResult.formatted_address,
        street: route?.formatted_address,
        neighborhood: neighborhood?.formatted_address,
      },
    };

    // Cache the result
    cache.set(cacheKey, {
      data: reverseResult,
      timestamp: Date.now(),
    });

    console.log(`[GeocodingService] Reverse geocoded (${lat}, ${lng}) to "${primaryResult.formatted_address}"`);

    return reverseResult;

  } catch (error) {
    console.error('[GeocodingService] Reverse geocoding error:', error.message);
    throw error;
  }
}

// ==============================================
// PLACE AUTOCOMPLETE
// ==============================================

/**
 * Get place autocomplete suggestions
 * Useful for address input fields
 *
 * @param {string} input - User input string
 * @param {Object} options - Autocomplete options
 * @returns {Promise<Array>} Array of place predictions
 */
export async function getPlaceAutocomplete(input, options = {}) {
  const { sessionToken = null, restrictToSF = true } = options;

  if (!input || input.length < 2) {
    return [];
  }

  const apiKey = apiConfig.google.apiKey;

  if (!apiKey) {
    console.error('[GeocodingService] Google API key not configured');
    return [];
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('types', 'address');

    if (restrictToSF) {
      // Restrict to San Francisco area
      url.searchParams.set('location', '37.7749,-122.4194');
      url.searchParams.set('radius', '15000'); // 15km radius from SF center
      url.searchParams.set('strictbounds', 'true');
    }

    if (sessionToken) {
      url.searchParams.set('sessiontoken', sessionToken);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Places Autocomplete API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Autocomplete returned status: ${data.status}`);
    }

    const predictions = (data.predictions || []).map(p => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text,
      secondaryText: p.structured_formatting?.secondary_text,
      types: p.types,
    }));

    console.log(`[GeocodingService] Got ${predictions.length} autocomplete suggestions for "${input}"`);

    return predictions;

  } catch (error) {
    console.error('[GeocodingService] Autocomplete error:', error.message);
    return [];
  }
}

/**
 * Get place details from a place ID
 *
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Object>} Place details with coordinates
 */
export async function getPlaceDetails(placeId) {
  const cacheKey = `place_${placeId}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheConfig.geocoding) {
    return cached.data;
  }

  const apiKey = apiConfig.google.apiKey;

  if (!apiKey) {
    console.error('[GeocodingService] Google API key not configured');
    throw new Error('Geocoding service not configured');
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('fields', 'geometry,formatted_address,name,address_components');

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Place Details API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      throw new Error(`Google Place Details returned status: ${data.status}`);
    }

    const result = data.result;
    const location = result.geometry.location;

    const placeDetails = {
      success: true,
      placeId,
      name: result.name,
      formattedAddress: result.formatted_address,
      latitude: location.lat,
      longitude: location.lng,
      isInSF: SF_BOUNDS.contains(location.lat, location.lng),
      components: parseAddressComponents(result.address_components),
    };

    // Cache the result
    cache.set(cacheKey, {
      data: placeDetails,
      timestamp: Date.now(),
    });

    console.log(`[GeocodingService] Got details for place ${placeId}`);

    return placeDetails;

  } catch (error) {
    console.error('[GeocodingService] Place details error:', error.message);
    throw error;
  }
}

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

/**
 * Parse Google address components into a structured object
 *
 * @param {Array} components - Google address components
 * @returns {Object} Structured address components
 */
function parseAddressComponents(components) {
  if (!components) return {};

  const parsed = {};

  for (const component of components) {
    const types = component.types;

    if (types.includes('street_number')) {
      parsed.streetNumber = component.long_name;
    }
    if (types.includes('route')) {
      parsed.street = component.long_name;
    }
    if (types.includes('neighborhood')) {
      parsed.neighborhood = component.long_name;
    }
    if (types.includes('locality')) {
      parsed.city = component.long_name;
    }
    if (types.includes('administrative_area_level_1')) {
      parsed.state = component.short_name;
    }
    if (types.includes('postal_code')) {
      parsed.zipCode = component.long_name;
    }
    if (types.includes('country')) {
      parsed.country = component.short_name;
    }
  }

  return parsed;
}

/**
 * Clear geocoding cache
 */
export function clearGeocodingCache() {
  cache.clear();
  console.log('[GeocodingService] Cache cleared');
}

/**
 * Validate coordinates are within valid ranges
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} True if valid
 */
export function isValidCoordinates(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !isNaN(lat) && !isNaN(lng)
  );
}

/**
 * Check if coordinates are within San Francisco bounds
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} True if in SF
 */
export function isInSanFrancisco(lat, lng) {
  return SF_BOUNDS.contains(lat, lng);
}

export default {
  geocodeAddress,
  reverseGeocode,
  getPlaceAutocomplete,
  getPlaceDetails,
  clearGeocodingCache,
  isValidCoordinates,
  isInSanFrancisco,
};
