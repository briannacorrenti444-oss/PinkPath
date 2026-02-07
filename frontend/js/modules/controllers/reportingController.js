// ========================================
// REPORTING CONTROLLER
// Handles hazard report UI and submission
// ========================================

import { API_BASE_URL } from '../config.js';
import { getAuthState, authFetch } from './authController.js';

// Cached hazard categories from server
let hazardCategories = null;

// Current report session state
let currentReportContext = null;

// ========================================
// CATEGORY MANAGEMENT
// ========================================

/**
 * Fetch and cache hazard categories from server
 * @returns {Promise<Array>}
 */
export async function loadHazardCategories() {
    if (hazardCategories) {
        return hazardCategories;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/reports/categories`);

        if (response.ok) {
            const data = await response.json();
            hazardCategories = data.categories;
            console.log('[reportingController] Categories loaded:', hazardCategories.length);
            return hazardCategories;
        }

        console.error('[reportingController] Failed to load categories:', response.status);
        return getDefaultCategories();

    } catch (error) {
        console.error('[reportingController] Error loading categories:', error);
        return getDefaultCategories();
    }
}

/**
 * Get default categories as fallback
 */
function getDefaultCategories() {
    return [
        { code: 'poor_lighting', label: 'Poor/No Lighting', icon: '💡', severity_default: 'medium' },
        { code: 'broken_sidewalk', label: 'Broken Sidewalk', icon: '🚧', severity_default: 'low' },
        { code: 'construction', label: 'Construction Zone', icon: '🔨', severity_default: 'low' },
        { code: 'encampment', label: 'Encampment', icon: '🏕️', severity_default: 'medium' },
        { code: 'suspicious_activity', label: 'Suspicious Activity', icon: '👁️', severity_default: 'high' },
        { code: 'harassment', label: 'Harassment/Catcalling', icon: '🚨', severity_default: 'high' },
        { code: 'no_sidewalk', label: 'No Sidewalk', icon: '🚶', severity_default: 'medium' },
        { code: 'heavy_traffic', label: 'Heavy Traffic', icon: '🚗', severity_default: 'medium' },
        { code: 'isolated_area', label: 'Isolated/Deserted', icon: '🏚️', severity_default: 'high' },
        { code: 'obstructed_path', label: 'Obstructed Path', icon: '⛔', severity_default: 'low' },
        { code: 'poor_visibility', label: 'Poor Visibility', icon: '🌫️', severity_default: 'medium' },
        { code: 'aggressive_dogs', label: 'Aggressive Animals', icon: '🐕', severity_default: 'medium' },
    ];
}

/**
 * Get categories (cached or default)
 */
export function getHazardCategories() {
    return hazardCategories || getDefaultCategories();
}

// ========================================
// AUTH CHECKS
// ========================================

/**
 * Check if user can submit reports (must be authenticated)
 * @returns {boolean}
 */
export function canSubmitReport() {
    const { isLoggedIn } = getAuthState();
    return isLoggedIn;
}

// ========================================
// REPORT CONTEXT MANAGEMENT
// ========================================

/**
 * Set the current report context (route info for reporting)
 * @param {object} context - Route context for report
 */
export function setReportContext(context) {
    currentReportContext = {
        startLat: context.startLat,
        startLng: context.startLng,
        endLat: context.endLat,
        endLng: context.endLng,
        polyline: context.polyline || null,
        wasPreviewMode: context.wasPreviewMode || false,
    };
    console.log('[reportingController] Report context set:', currentReportContext);
}

/**
 * Get current report context
 */
export function getReportContext() {
    return currentReportContext;
}

/**
 * Clear report context
 */
export function clearReportContext() {
    currentReportContext = null;
}

// ========================================
// HAZARD REPORT SUBMISSION
// ========================================

/**
 * Submit a hazard report
 * @param {object} reportData - Report data
 * @param {string} reportData.reportScope - 'spot' or 'route'
 * @param {Array<string>} reportData.hazardTypes - Selected hazard codes
 * @param {string} reportData.severity - 'low', 'medium', or 'high'
 * @param {string} reportData.comment - Optional comment
 * @param {object} reportData.location - For spot: {lat, lng}, For route: from context
 * @returns {Promise<{success: boolean, reportId?: number, error?: string}>}
 */
export async function submitHazardReport(reportData) {
    if (!canSubmitReport()) {
        return { success: false, error: 'Please sign in to report hazards' };
    }

    if (!reportData.hazardTypes || reportData.hazardTypes.length === 0) {
        return { success: false, error: 'Please select at least one hazard type' };
    }

    try {
        const payload = {
            reportScope: reportData.reportScope,
            hazardTypes: reportData.hazardTypes,
            severity: reportData.severity || 'medium',
            comment: reportData.comment || null,
            wasPreviewMode: currentReportContext?.wasPreviewMode || false,
        };

        // Add location based on scope
        if (reportData.reportScope === 'spot') {
            if (!reportData.location?.lat || !reportData.location?.lng) {
                return { success: false, error: 'Please select a location on the map' };
            }
            payload.lat = reportData.location.lat;
            payload.lng = reportData.location.lng;
        } else if (reportData.reportScope === 'route') {
            if (!currentReportContext) {
                return { success: false, error: 'No route context available' };
            }
            payload.startLat = currentReportContext.startLat;
            payload.startLng = currentReportContext.startLng;
            payload.endLat = currentReportContext.endLat;
            payload.endLng = currentReportContext.endLng;
            payload.polyline = currentReportContext.polyline;
        }

        const response = await authFetch('/api/reports/hazard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (response.ok) {
            console.log('[reportingController] Report submitted:', data.reportId);
            return { success: true, reportId: data.reportId };
        }

        return { success: false, error: data.message || 'Report submission failed' };

    } catch (error) {
        console.error('[reportingController] Submit report error:', error);
        return { success: false, error: 'Network error. Please try again.' };
    }
}

// ========================================
// FETCH HAZARD REPORTS
// ========================================

/**
 * Get hazard reports near a location
 * @param {number} lat
 * @param {number} lng
 * @param {number} radius - Radius in meters (default 500)
 * @returns {Promise<Array>}
 */
export async function getNearbyHazards(lat, lng, radius = 500) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/reports/hazard/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
        );

        if (response.ok) {
            const data = await response.json();
            return data.reports || [];
        }

        console.error('[reportingController] Failed to fetch nearby hazards');
        return [];

    } catch (error) {
        console.error('[reportingController] Get nearby hazards error:', error);
        return [];
    }
}

/**
 * Get hazard reports along a route
 * @param {number} startLat
 * @param {number} startLng
 * @param {number} endLat
 * @param {number} endLng
 * @returns {Promise<{routeReports: Array, spotReports: Array}>}
 */
export async function getRouteHazards(startLat, startLng, endLat, endLng) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/reports/hazard/route?startLat=${startLat}&startLng=${startLng}&endLat=${endLat}&endLng=${endLng}`
        );

        if (response.ok) {
            return await response.json();
        }

        console.error('[reportingController] Failed to fetch route hazards');
        return { routeReports: [], spotReports: [] };

    } catch (error) {
        console.error('[reportingController] Get route hazards error:', error);
        return { routeReports: [], spotReports: [] };
    }
}

/**
 * Get current user's hazard report history
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<{reports: Array, count: number}>}
 */
export async function getUserReports(limit = 20, offset = 0) {
    if (!canSubmitReport()) {
        return { reports: [], count: 0 };
    }

    try {
        const response = await authFetch(`/api/reports/user?limit=${limit}&offset=${offset}`);

        if (response.ok) {
            return await response.json();
        }

        return { reports: [], count: 0 };

    } catch (error) {
        console.error('[reportingController] Get user reports error:', error);
        return { reports: [], count: 0 };
    }
}

// ========================================
// ANALYTICS
// ========================================

/**
 * Get hazard report statistics
 * @returns {Promise<object|null>}
 */
export async function getHazardStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/reports/stats`);

        if (response.ok) {
            return await response.json();
        }

        return null;

    } catch (error) {
        console.error('[reportingController] Get stats error:', error);
        return null;
    }
}
