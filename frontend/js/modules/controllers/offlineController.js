// ========================================
// OFFLINE CONTROLLER
// Handles offline detection, route caching, and offline UI
// ========================================

// Storage keys
const CACHED_ROUTE_KEY = 'pinkpath_cached_route';
const CACHED_NAVIGATION_KEY = 'pinkpath_cached_navigation';
const PENDING_SUBMISSIONS_KEY = 'pinkpath_pending_submissions';

// Offline state
let isOffline = !navigator.onLine;
let offlineBanner = null;

// ========================================
// INITIALIZATION
// ========================================

/**
 * Initialize offline handling
 * Sets up event listeners and creates UI elements
 */
export function initOfflineHandling() {
    // Create offline banner
    createOfflineBanner();

    // Set initial state
    isOffline = !navigator.onLine;
    updateOfflineUI();

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    console.log('[Offline] Initialized, current state:', isOffline ? 'OFFLINE' : 'ONLINE');

    // Try to sync pending submissions if online
    if (!isOffline) {
        syncPendingSubmissions();
    }
}

/**
 * Create the offline banner element
 */
function createOfflineBanner() {
    offlineBanner = document.createElement('div');
    offlineBanner.id = 'offline-banner';
    offlineBanner.className = 'offline-banner';
    offlineBanner.innerHTML = `
        <div class="offline-banner-content">
            <svg class="offline-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7L12 21.5l3.07-4.04 3.22 3.22 1.27-1.27-2.52-2.52z"/>
            </svg>
            <span class="offline-text">You're offline. Showing cached route.</span>
        </div>
    `;
    document.body.appendChild(offlineBanner);
}

// ========================================
// EVENT HANDLERS
// ========================================

/**
 * Handle coming back online
 */
function handleOnline() {
    console.log('[Offline] Back online');
    isOffline = false;
    updateOfflineUI();

    // Dispatch event for other modules
    window.dispatchEvent(new CustomEvent('app-online'));

    // Try to sync pending submissions
    syncPendingSubmissions();

    // Show toast
    showToast('You\'re back online', 'success');
}

/**
 * Handle going offline
 */
function handleOffline() {
    console.log('[Offline] Gone offline');
    isOffline = true;
    updateOfflineUI();

    // Dispatch event for other modules
    window.dispatchEvent(new CustomEvent('app-offline'));

    // Show toast
    showToast('You\'re offline. Your route is saved.', 'warning');
}

/**
 * Update UI based on offline state
 */
function updateOfflineUI() {
    if (offlineBanner) {
        if (isOffline) {
            offlineBanner.classList.add('visible');
        } else {
            offlineBanner.classList.remove('visible');
        }
    }
}

// ========================================
// ROUTE CACHING
// ========================================

/**
 * Cache the current route for offline use
 * @param {object} routeData - Route data to cache
 * @param {object} navigationState - Current navigation state
 */
export function cacheCurrentRoute(routeData, navigationState = {}) {
    if (!routeData) return;

    try {
        const cacheData = {
            route: routeData,
            navigation: navigationState,
            cachedAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        };

        localStorage.setItem(CACHED_ROUTE_KEY, JSON.stringify(cacheData));
        console.log('[Offline] Route cached successfully');
    } catch (error) {
        console.error('[Offline] Failed to cache route:', error);
    }
}

/**
 * Get cached route data
 * @returns {object|null} Cached route data or null
 */
export function getCachedRoute() {
    try {
        const cached = localStorage.getItem(CACHED_ROUTE_KEY);
        if (!cached) return null;

        const data = JSON.parse(cached);

        // Check if expired
        if (data.expiresAt && Date.now() > data.expiresAt) {
            clearCachedRoute();
            return null;
        }

        return data;
    } catch (error) {
        console.error('[Offline] Failed to get cached route:', error);
        return null;
    }
}

/**
 * Clear cached route
 */
export function clearCachedRoute() {
    localStorage.removeItem(CACHED_ROUTE_KEY);
    localStorage.removeItem(CACHED_NAVIGATION_KEY);
    console.log('[Offline] Route cache cleared');
}

/**
 * Check if we have a valid cached route
 * @returns {boolean}
 */
export function hasCachedRoute() {
    return getCachedRoute() !== null;
}

// ========================================
// PENDING SUBMISSIONS (Ratings/Reports)
// ========================================

/**
 * Save a failed submission for later retry
 * @param {string} type - 'rating' or 'report'
 * @param {object} data - Submission data
 */
export function savePendingSubmission(type, data) {
    try {
        const pending = getPendingSubmissions();
        pending.push({
            type,
            data,
            savedAt: Date.now(),
            retryCount: 0,
        });

        localStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(pending));
        console.log(`[Offline] Saved pending ${type} for later`);

        return true;
    } catch (error) {
        console.error('[Offline] Failed to save pending submission:', error);
        return false;
    }
}

/**
 * Get all pending submissions
 * @returns {Array}
 */
export function getPendingSubmissions() {
    try {
        const pending = localStorage.getItem(PENDING_SUBMISSIONS_KEY);
        return pending ? JSON.parse(pending) : [];
    } catch (error) {
        return [];
    }
}

/**
 * Remove a pending submission after successful sync
 * @param {number} index - Index of submission to remove
 */
function removePendingSubmission(index) {
    try {
        const pending = getPendingSubmissions();
        pending.splice(index, 1);
        localStorage.setItem(PENDING_SUBMISSIONS_KEY, JSON.stringify(pending));
    } catch (error) {
        console.error('[Offline] Failed to remove pending submission:', error);
    }
}

/**
 * Sync all pending submissions when back online
 */
async function syncPendingSubmissions() {
    const pending = getPendingSubmissions();
    if (pending.length === 0) return;

    console.log(`[Offline] Syncing ${pending.length} pending submissions...`);

    // Import auth functions dynamically to avoid circular deps
    const { authFetch, getAuthState } = await import('./authController.js');
    const { isLoggedIn } = getAuthState();

    if (!isLoggedIn) {
        console.log('[Offline] Not logged in, skipping sync');
        return;
    }

    // Process each pending submission
    for (let i = pending.length - 1; i >= 0; i--) {
        const item = pending[i];

        try {
            let endpoint;
            if (item.type === 'rating') {
                endpoint = '/api/ratings/route';
            } else if (item.type === 'report') {
                endpoint = '/api/reports/hazard';
            } else if (item.type === 'pin') {
                endpoint = '/api/ratings/pin';
            } else {
                // Unknown type, remove it
                removePendingSubmission(i);
                continue;
            }

            const response = await authFetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.data),
            });

            if (response.ok) {
                console.log(`[Offline] Synced pending ${item.type}`);
                removePendingSubmission(i);
            } else {
                // Increment retry count
                item.retryCount++;
                if (item.retryCount >= 3) {
                    console.warn(`[Offline] Giving up on ${item.type} after 3 retries`);
                    removePendingSubmission(i);
                }
            }
        } catch (error) {
            console.error(`[Offline] Failed to sync ${item.type}:`, error);
        }
    }

    // Notify user if any were synced
    const remaining = getPendingSubmissions().length;
    const synced = pending.length - remaining;
    if (synced > 0) {
        showToast(`Synced ${synced} saved submission${synced > 1 ? 's' : ''}`, 'success');
    }
}

/**
 * Check if there are pending submissions
 * @returns {boolean}
 */
export function hasPendingSubmissions() {
    return getPendingSubmissions().length > 0;
}

// ========================================
// UTILITIES
// ========================================

/**
 * Check if currently offline
 * @returns {boolean}
 */
export function isCurrentlyOffline() {
    return isOffline;
}

/**
 * Show a toast notification
 * @param {string} message
 * @param {string} type - 'success', 'warning', 'error'
 */
function showToast(message, type = 'info') {
    // Create or reuse toast element
    let toast = document.getElementById('offline-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'offline-toast';
        toast.className = 'offline-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `offline-toast ${type} visible`;

    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}

export default {
    initOfflineHandling,
    cacheCurrentRoute,
    getCachedRoute,
    clearCachedRoute,
    hasCachedRoute,
    savePendingSubmission,
    getPendingSubmissions,
    hasPendingSubmissions,
    isCurrentlyOffline,
};
