// ========================================
// RATING CONTROLLER
// Handles route rating UI and segment pin functionality
// ========================================

import { API_BASE_URL } from '../config.js';
import { getAuthState, authFetch } from './authController.js';

// Cached rating categories from server
let ratingCategories = null;

// Current rating session state
let currentRatingContext = null;
let pendingPins = [];

// ========================================
// CATEGORY MANAGEMENT
// ========================================

/**
 * Fetch and cache rating categories from server
 * @returns {Promise<{safe: Array, caution: Array}>}
 */
export async function loadRatingCategories() {
    if (ratingCategories) {
        return ratingCategories;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/ratings/categories`);

        if (response.ok) {
            ratingCategories = await response.json();
            console.log('[ratingController] Categories loaded:', ratingCategories);
            return ratingCategories;
        }

        console.error('[ratingController] Failed to load categories:', response.status);
        return getDefaultCategories();

    } catch (error) {
        console.error('[ratingController] Error loading categories:', error);
        return getDefaultCategories();
    }
}

/**
 * Get default categories as fallback
 */
function getDefaultCategories() {
    return {
        safe: [
            { code: 'well_lit', label: 'Well-lit streets' },
            { code: 'busy_area', label: 'Busy area' },
            { code: 'police_presence', label: 'Police/security presence' },
            { code: 'open_businesses', label: 'Open businesses' },
            { code: 'good_visibility', label: 'Good visibility' },
        ],
        caution: [
            { code: 'dark_poorly_lit', label: 'Dark/poorly lit' },
            { code: 'isolated_empty', label: 'Isolated/empty' },
            { code: 'suspicious_activity', label: 'Suspicious activity' },
            { code: 'unsafe_construction', label: 'Unsafe construction' },
            { code: 'obstructed_visibility', label: 'Obstructed visibility' },
        ],
    };
}

/**
 * Get categories for a specific rating (safe vs caution reasons)
 * @param {string} rating - 'safe', 'neutral', or 'unsafe'
 */
export function getCategoriesForRating(rating) {
    const categories = ratingCategories || getDefaultCategories();

    if (rating === 'safe') {
        return categories.safe;
    } else if (rating === 'unsafe') {
        return categories.caution;
    }
    // For neutral, show both
    return [...categories.safe, ...categories.caution];
}

// ========================================
// AUTH CHECKS
// ========================================

/**
 * Check if user can submit rating (must be authenticated)
 * @returns {boolean}
 */
export function canSubmitRating() {
    const { isLoggedIn } = getAuthState();
    return isLoggedIn;
}

// ========================================
// RATING CONTEXT MANAGEMENT
// ========================================

/**
 * Set the current rating context (route info for rating)
 * @param {object} context - Route context for rating
 */
export function setRatingContext(context) {
    currentRatingContext = {
        startLat: context.startLat,
        startLng: context.startLng,
        endLat: context.endLat,
        endLng: context.endLng,
        polyline: context.polyline || null,
        routeHistoryId: context.routeHistoryId || null,
        wasPreviewMode: context.wasPreviewMode || false,
    };
    pendingPins = [];
    console.log('[ratingController] Rating context set:', currentRatingContext);
}

/**
 * Get current rating context
 */
export function getRatingContext() {
    return currentRatingContext;
}

/**
 * Clear rating context after submission
 */
export function clearRatingContext() {
    currentRatingContext = null;
    pendingPins = [];
}

// ========================================
// ROUTE RATING SUBMISSION
// ========================================

/**
 * Submit overall route rating
 * @param {object} ratingData - Rating data
 * @param {string} ratingData.rating - 'unsafe', 'neutral', or 'safe'
 * @param {number} ratingData.starRating - 1-5 star rating (optional)
 * @param {Array<string>} ratingData.reasons - Selected reason codes
 * @param {string} ratingData.comment - Optional comment
 * @returns {Promise<{success: boolean, ratingId?: number, error?: string}>}
 */
export async function submitRouteRating(ratingData) {
    if (!canSubmitRating()) {
        return { success: false, error: 'Please sign in to rate routes' };
    }

    if (!currentRatingContext) {
        return { success: false, error: 'No route to rate' };
    }

    try {
        const payload = {
            rating: ratingData.rating,
            starRating: ratingData.starRating || null,
            reasons: ratingData.reasons || [],
            comment: ratingData.comment || null,
            ...currentRatingContext,
        };

        const response = await authFetch('/api/ratings/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (response.ok) {
            console.log('[ratingController] Route rating submitted:', data.ratingId);

            // Link pending pins to this rating
            if (pendingPins.length > 0 && data.ratingId) {
                await linkPinsToRating(data.ratingId);
            }

            return { success: true, ratingId: data.ratingId };
        }

        return { success: false, error: data.message || 'Rating submission failed' };

    } catch (error) {
        console.error('[ratingController] Submit rating error:', error);
        return { success: false, error: 'Network error. Please try again.' };
    }
}

/**
 * Link pending pins to a submitted rating
 * @param {number} routeRatingId
 */
async function linkPinsToRating(routeRatingId) {
    // Note: Pins are already submitted, but we could update them with the routeRatingId
    // For now, pins are submitted independently during navigation
    console.log('[ratingController] Linking', pendingPins.length, 'pins to rating', routeRatingId);
    pendingPins = [];
}

// ========================================
// SEGMENT PIN SUBMISSION
// ========================================

/**
 * Submit a segment pin at a specific location
 * @param {object} pinData
 * @param {number} pinData.lat
 * @param {number} pinData.lng
 * @param {string} pinData.pinType - 'safe' or 'caution'
 * @param {string} pinData.category - Category code
 * @param {string} pinData.comment - Optional comment
 * @returns {Promise<{success: boolean, pinId?: number, error?: string}>}
 */
export async function submitSegmentPin(pinData) {
    if (!canSubmitRating()) {
        return { success: false, error: 'Please sign in to add pins' };
    }

    try {
        const payload = {
            lat: pinData.lat,
            lng: pinData.lng,
            pinType: pinData.pinType,
            category: pinData.category,
            comment: pinData.comment || null,
            wasPreviewMode: currentRatingContext?.wasPreviewMode || false,
        };

        const response = await authFetch('/api/ratings/pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (response.ok) {
            console.log('[ratingController] Pin submitted:', data.pinId);
            pendingPins.push(data.pinId);
            return { success: true, pinId: data.pinId };
        }

        return { success: false, error: data.message || 'Pin submission failed' };

    } catch (error) {
        console.error('[ratingController] Submit pin error:', error);
        return { success: false, error: 'Network error. Please try again.' };
    }
}

// ========================================
// NEARBY PINS (for map display)
// ========================================

/**
 * Get aggregated pins near a location
 * @param {number} lat
 * @param {number} lng
 * @param {number} radius - Radius in meters (default 500)
 * @returns {Promise<Array>}
 */
export async function getNearbyPins(lat, lng, radius = 500) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/ratings/pins/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
        );

        if (response.ok) {
            const data = await response.json();
            return data.pins || [];
        }

        console.error('[ratingController] Failed to fetch nearby pins');
        return [];

    } catch (error) {
        console.error('[ratingController] Get nearby pins error:', error);
        return [];
    }
}

// ========================================
// USER RATING HISTORY
// ========================================

/**
 * Get current user's rating history
 * @param {number} limit - Max results
 * @param {number} offset - Pagination offset
 * @returns {Promise<{ratings: Array, count: number}>}
 */
export async function getUserRatings(limit = 20, offset = 0) {
    if (!canSubmitRating()) {
        return { ratings: [], count: 0 };
    }

    try {
        const response = await authFetch(`/api/ratings/user?limit=${limit}&offset=${offset}`);

        if (response.ok) {
            return await response.json();
        }

        return { ratings: [], count: 0 };

    } catch (error) {
        console.error('[ratingController] Get user ratings error:', error);
        return { ratings: [], count: 0 };
    }
}

// ========================================
// ANALYTICS
// ========================================

/**
 * Get city-wide rating statistics
 * @returns {Promise<object>}
 */
export async function getRatingStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/ratings/stats`);

        if (response.ok) {
            return await response.json();
        }

        return null;

    } catch (error) {
        console.error('[ratingController] Get stats error:', error);
        return null;
    }
}
