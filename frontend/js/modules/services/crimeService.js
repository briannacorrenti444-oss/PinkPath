// ========================================
// PINKPATH CRIME SERVICE
// UI utility functions for crime data display
// Note: Backend handles all API calls and scoring
// ========================================

import { CRIME_WEIGHTS } from '../config.js';

// ========================================
// UI DATA PROCESSING FUNCTIONS
// These functions process crime data received from backend for display
// ========================================

/**
 * Filter crimes to last 30 days for display
 * @param {Array} crimes - Array of crime objects from backend
 * @returns {Array} Crimes from the last 30 days
 */
export function filterCrimesLast30Days(crimes) {
    if (!crimes || crimes.length === 0) return [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return crimes.filter(crime => {
        const crimeDate = new Date(crime.incident_datetime);
        return crimeDate >= thirtyDaysAgo;
    });
}

/**
 * Group crimes by type and count occurrences
 * @param {Array} crimes - Array of crime objects
 * @returns {Object} Object with crime categories as keys and counts as values
 */
export function groupCrimesByType(crimes) {
    if (!crimes || crimes.length === 0) return {};

    const grouped = {};

    crimes.forEach(crime => {
        const category = crime.incident_category;
        if (category) {
            grouped[category] = (grouped[category] || 0) + 1;
        }
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
 * @param {string} category - Crime category name
 * @returns {string} 'high', 'medium', or 'low'
 */
export function getCrimeSeverity(category) {
    const weight = CRIME_WEIGHTS[category] || 1.0;
    if (weight >= 3.0) return 'high';
    if (weight >= 2.0) return 'medium';
    return 'low';
}

/**
 * Filter crimes to last 7 days and violent/theft categories only
 * Used for displaying recent crime markers on map
 * @param {Array} crimes - Array of crime objects from backend
 * @returns {Array} Filtered violent/theft crimes with isViolent flag
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
