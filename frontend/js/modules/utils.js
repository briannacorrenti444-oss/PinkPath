// ========================================
// PINKPATH UTILITY FUNCTIONS
// Helper functions for calculations and formatting
// ========================================

// ========================================
// DISTANCE CALCULATIONS
// ========================================

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lng1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lng2 - Second point longitude
 * @returns {number} Distance in miles
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth's radius in miles
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
}

/**
 * Convert degrees to radians
 * @param {number} degrees
 * @returns {number} Radians
 */
export function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// ========================================
// UNIT CONVERSION
// ========================================

/**
 * Convert meters to miles
 * @param {number} meters
 * @returns {number} Miles
 */
export function metersToMiles(meters) {
    return meters / 1609.34;
}

/**
 * Convert seconds to minutes
 * @param {number} seconds
 * @returns {number} Minutes
 */
export function secondsToMinutes(seconds) {
    return seconds / 60;
}

// ========================================
// FORMATTING
// ========================================

/**
 * Format distance for display
 * @param {number} miles - Distance in miles
 * @returns {string} Formatted distance string
 */
export function formatDistance(miles) {
    if (miles < 0.1) {
        // Less than 0.1 miles, show in feet
        const feet = Math.round(miles * 5280);
        return `${feet} ft`;
    } else if (miles < 10) {
        // Less than 10 miles, show one decimal
        return `${miles.toFixed(1)} mi`;
    } else {
        // 10+ miles, show whole number
        return `${Math.round(miles)} mi`;
    }
}

/**
 * Format duration for display
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration string
 */
export function formatDuration(minutes) {
    if (minutes < 1) {
        // Less than a minute, show seconds
        const seconds = Math.round(minutes * 60);
        return `${seconds} sec`;
    } else if (minutes < 60) {
        // Less than an hour, show minutes
        return `${Math.round(minutes)} min`;
    } else {
        // 1+ hours, show hours and minutes
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        if (mins === 0) {
            return `${hours} hr`;
        } else {
            return `${hours} hr ${mins} min`;
        }
    }
}
