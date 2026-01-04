// ========================================
// PINKPATH GEOCODING SERVICE
// Handles all geocoding API calls and data transformation
// Pure functions - no DOM manipulation or global state
// ========================================

// Import configuration and utilities
import { NOMINATIM_API } from '../config.js';
import { calculateDistance, createBoundingBox } from '../utils.js';

// ========================================
// RESULT PARSING
// ========================================

/**
 * Parse Nominatim result into cleaner format
 * @param {Object} result - Raw Nominatim API result
 * @returns {Object} Parsed result with primaryName, secondaryAddress, isPlace, type, category
 */
export function parseNominatimResult(result) {
    const displayName = result.display_name;
    const address = result.address || {};

    // Try to extract the primary name (POI, building, etc.)
    let primaryName = null;
    let isPlace = false;

    // Check for specific location types (POIs, businesses, etc.)
    if (address.amenity) {
        primaryName = address.amenity;
        isPlace = true;
    } else if (address.shop) {
        primaryName = address.shop;
        isPlace = true;
    } else if (address.tourism) {
        primaryName = address.tourism;
        isPlace = true;
    } else if (address.building && address.building !== 'yes') {
        primaryName = address.building;
        isPlace = true;
    } else if (result.name && result.name !== result.type) {
        primaryName = result.name;
        isPlace = true;
    }

    // Build secondary address (everything except the primary name)
    let secondaryAddress = '';

    if (isPlace && primaryName) {
        // For POIs, show the street address
        const parts = [];
        if (address.house_number && address.road) {
            parts.push(`${address.house_number} ${address.road}`);
        } else if (address.road) {
            parts.push(address.road);
        }
        if (address.city || address.town || address.village) {
            parts.push(address.city || address.town || address.village);
        }
        if (address.state) {
            parts.push(address.state);
        }
        secondaryAddress = parts.join(', ');
    } else {
        // For regular addresses, use the full display name
        secondaryAddress = displayName;
    }

    return {
        primaryName: primaryName,
        secondaryAddress: secondaryAddress || displayName,
        isPlace: isPlace,
        type: result.type,
        category: result.class,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: displayName
    };
}

/**
 * Get icon for location type
 * @param {Object} parsedResult - Parsed Nominatim result
 * @returns {string} Emoji icon
 */
export function getLocationIcon(parsedResult) {
    if (!parsedResult.isPlace) {
        return '📍'; // Regular address
    }

    const category = parsedResult.category;
    const type = parsedResult.type;

    let icon = '📍'; // Default

    // Category-based icons
    if (category === 'amenity') {
        if (type === 'restaurant' || type === 'fast_food' || type === 'cafe') icon = '🍽️';
        else if (type === 'bar' || type === 'pub') icon = '🍺';
        else if (type === 'hospital' || type === 'clinic' || type === 'pharmacy') icon = '🏥';
        else if (type === 'school' || type === 'university' || type === 'college') icon = '🎓';
        else if (type === 'bank' || type === 'atm') icon = '🏦';
        else if (type === 'fuel') icon = '⛽';
        else if (type === 'parking') icon = '🅿️';
        else if (type === 'police') icon = '👮';
        else if (type === 'post_office') icon = '📮';
        else if (type === 'library') icon = '📚';
        else icon = '🏢';
    } else if (category === 'shop') {
        if (type === 'supermarket' || type === 'convenience') icon = '🛒';
        else if (type === 'mall' || type === 'department_store') icon = '🏬';
        else if (type === 'clothes' || type === 'fashion') icon = '👔';
        else if (type === 'bakery') icon = '🥖';
        else if (type === 'coffee') icon = '☕';
        else icon = '🏪';
    } else if (category === 'tourism') {
        if (type === 'hotel' || type === 'motel') icon = '🏨';
        else if (type === 'museum') icon = '🏛️';
        else if (type === 'attraction') icon = '🎡';
        else icon = '🗺️';
    } else if (category === 'building') {
        icon = '🏢';
    }

    return icon;
}

// ========================================
// GEOCODING API CALLS
// ========================================

/**
 * Forward geocode: Convert address string to coordinates
 * @param {string} address - Address string to geocode
 * @returns {Promise<Object|null>} Location object {lat, lng, name} or null on error
 */
export async function geocodeAddress(address) {
    try {
        const url = `${NOMINATIM_API.baseUrl}/search?format=json&q=${encodeURIComponent(address)}&limit=1`;

        const response = await fetch(url, {
            headers: { 'User-Agent': NOMINATIM_API.userAgent }
        });
        const results = await response.json();

        if (results.length > 0) {
            return {
                lat: parseFloat(results[0].lat),
                lng: parseFloat(results[0].lon),
                name: results[0].display_name
            };
        }

        return null;
    } catch (error) {
        console.error('❌ Geocoding error:', error.message);
        return null;
    }
}

/**
 * Reverse geocode: Convert coordinates to address string
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string|null>} Address string or null on error
 */
export async function reverseGeocode(lat, lng) {
    try {
        const url = `${NOMINATIM_API.baseUrl}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

        const response = await fetch(url, {
            headers: { 'User-Agent': NOMINATIM_API.userAgent }
        });
        const result = await response.json();

        if (result && result.display_name) {
            return result.display_name;
        }

        return null;
    } catch (error) {
        console.error('❌ Reverse geocoding error:', error.message);
        return null;
    }
}

/**
 * Search for addresses matching a query
 * @param {string} query - Search query
 * @param {Object|null} userLocation - Optional user location {lat, lng} for proximity sorting
 * @returns {Promise<Array>} Array of parsed results with distance info
 */
export async function searchAddresses(query, userLocation = null) {
    try {
        // Build URL with optional bounding box
        let url = `${NOMINATIM_API.baseUrl}/search?format=json&q=${encodeURIComponent(query)}&limit=${NOMINATIM_API.searchLimit}&addressdetails=1`;

        // Add bounding box if we have user location (prioritize nearby results)
        if (userLocation) {
            const bbox = createBoundingBox(userLocation.lat, userLocation.lng, 50); // 50km radius
            url += `&viewbox=${bbox.left},${bbox.bottom},${bbox.right},${bbox.top}&bounded=1`;
        }

        const response = await fetch(url, {
            headers: { 'User-Agent': NOMINATIM_API.userAgent }
        });
        const results = await response.json();

        if (results.length === 0) {
            return [];
        }

        // Parse and enhance each result
        const parsedResults = results.map(result => {
            const parsed = parseNominatimResult(result);
            const icon = getLocationIcon(parsed);

            // Calculate distance if we have user location
            let distance = null;
            if (userLocation) {
                distance = calculateDistance(
                    userLocation.lat,
                    userLocation.lng,
                    parsed.lat,
                    parsed.lng
                );
            }

            return {
                ...parsed,
                icon: icon,
                distance: distance,
                raw: result // Keep raw result for display_name access
            };
        });

        // Sort by distance if available (closest first)
        if (userLocation) {
            parsedResults.sort((a, b) => a.distance - b.distance);
        }

        // Return top results based on config
        return parsedResults.slice(0, NOMINATIM_API.displayLimit);

    } catch (error) {
        console.error('❌ Address search error:', error.message);
        throw error; // Re-throw so caller can handle
    }
}
