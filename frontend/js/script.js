// ========================================
// PINKPATH - MODERN RESPONSIVE WEB APP
// Main Application Script
// Google Maps Implementation
// ========================================

console.log('[PinkPath] Loading script.js...');

// Global error handler to catch module loading issues
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('[PinkPath] Global error:', msg, 'at', url, lineNo);
    return false;
};

window.addEventListener('unhandledrejection', function(event) {
    console.error('[PinkPath] Unhandled promise rejection:', event.reason);
});

// Import configuration and utilities
import { defaultLocation, API_BASE_URL } from './modules/config.js';

import {
    calculateDistance,
    metersToMiles,
    secondsToMinutes,
    formatDistance,
    formatDuration
} from './modules/utils.js';

// Import crime service (only what we need)
import { filterViolentCrimes } from './modules/services/crimeService.js';

// Import search controller (Google Places)
import { reverseGeocode as googleReverseGeocode } from './modules/controllers/searchController.js';

// Import map controller (Google Maps)
import {
    createMap,
    showCurrentLocationOnMap,
    addMapStyleToggle,
    createRouteMarkers,
    removeMarker,
    fitBoundsToPoints,
    updateMarkerPosition,
    setMapStyle
} from './modules/controllers/mapController.js';

// Import safety controller
import {
    updateSafetyDisplay,
    openCrimeDetailsModal,
    toggleCrimeDetails,
    initShowMoreToggle,
    getSafetyLabel,
    getSafetyColor
} from './modules/controllers/safetyController.js';

// Import route controller (Google Maps)
import {
    drawOmbreRoute,
    drawBasicRoute,
    removePolylines,
    addCrimeMarkersToMap,
    removeCrimeMarkers,
    calculateDistanceToPolyline,
    decodePolyline
} from './modules/controllers/routeController.js';

// Import RoutePlanner component
import { RoutePlanner } from './modules/components/routePlanner.js';

// Import auth controller
import {
    initAuth,
    getAuthState,
    register,
    login,
    logout,
    getCurrentUser,
    authFetch,
    startGoogleSignIn
} from './modules/controllers/authController.js';

// Import rating controller
import {
    loadRatingCategories,
    getCategoriesForRating,
    canSubmitRating,
    setRatingContext,
    getRatingContext,
    clearRatingContext,
    submitRouteRating,
    submitSegmentPin
} from './modules/controllers/ratingController.js';

// Import trip controller
import {
    initTripSharing,
    startTrip,
    updateTripLocation,
    endTrip,
    sendCheckIn,
    triggerSOS,
    getActiveTrip,
    isTripSharingEnabled,
    loadTripSharingSettings,
    saveTripSharingSettings
} from './modules/controllers/tripController.js';

// Import reporting controller
import {
    loadHazardCategories,
    getHazardCategories,
    canSubmitReport,
    setReportContext,
    getReportContext,
    clearReportContext,
    submitHazardReport,
    getNearbyHazards,
    getRouteHazards
} from './modules/controllers/reportingController.js';

// Import offline controller
import {
    initOfflineHandling,
    cacheCurrentRoute,
    getCachedRoute,
    clearCachedRoute,
    savePendingSubmission,
    isCurrentlyOffline,
    hasPendingSubmissions
} from './modules/controllers/offlineController.js';

console.log('[PinkPath] All imports loaded successfully');

// ========================================
// MAP THEME TOGGLE (Dark Map Mode)
// ========================================

const MAP_THEME_STORAGE_KEY = 'pinkpath_map_theme';

/**
 * Initialize map theme from localStorage
 * Updates the global currentMode variable
 */
function initMapTheme() {
    const savedTheme = localStorage.getItem(MAP_THEME_STORAGE_KEY);
    if (savedTheme === 'dark' || savedTheme === 'light') {
        currentMode = savedTheme;
    }
    console.log('[MapTheme] Initialized:', currentMode);
}

/**
 * Toggle between light and dark map styles
 */
function toggleMapTheme() {
    currentMode = currentMode === 'dark' ? 'light' : 'dark';
    localStorage.setItem(MAP_THEME_STORAGE_KEY, currentMode);

    console.log('[MapTheme] Toggled to:', currentMode);

    // Update toggle button appearance
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
        toggleBtn.classList.toggle('map-dark', currentMode === 'dark');
    }

    // Update map styles
    updateMapTheme(currentMode === 'dark');
}

/**
 * Update all maps to match current theme
 * @param {boolean} isDark - Whether dark mode is active
 */
function updateMapTheme(isDark) {
    const mode = isDark ? 'dark' : 'light';

    // Update route map
    if (typeof routeMap !== 'undefined' && routeMap) {
        setMapStyle(routeMap, mode);
    }

    // Update navigation map
    if (typeof navigationMap !== 'undefined' && navigationMap) {
        setMapStyle(navigationMap, mode);
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Generate or retrieve a session ID for anonymous users
 * Used for feature vote tracking without requiring login
 * @returns {string} Session ID
 */
function generateSessionId() {
    const storageKey = 'pinkpath_session_id';
    let sessionId = localStorage.getItem(storageKey);

    if (!sessionId) {
        // Generate a random session ID
        sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(storageKey, sessionId);
    }

    return sessionId;
}

// ========================================
// API CONFIGURATION
// ========================================

// API_BASE_URL imported from config.js (without /api suffix)

// ========================================
// APPLICATION STATE
// ========================================

// ----------------------------------------
// 1. MAP STATE
// Google Maps instances and overlays
// ----------------------------------------

// Map instances (one per screen)
let routeMap = null;                    // Map on route results screen
let navigationMap = null;               // Map on navigation screen

// Route visualization (route results screen)
let ombreRoutePolylines = null;         // Selected route's colored polylines
let alternativeRoutePolylines = null;   // Alternative route's polylines
let crimeMarkersData = null;            // Crime markers and clusterer

// Route visualization (navigation screen)
let navOmbreRoutePolylines = null;      // Route polylines on navigation map
let navAlternativeRoutePolylines = null;
let navCrimeMarkersData = null;         // Crime markers on navigation map

// Location markers
let startMarker = null;                 // Green pin at start location
let destinationMarker = null;           // Red pin at destination
let locationMarker = null;              // Blue dot showing initial "you are here"
let locationAccuracyCircle = null;      // GPS accuracy circle
let navigationMarker = null;            // Blue dot during active navigation

// Component instances
let mainRoutePlanner = null;            // RoutePlanner component on plan-route screen
let homeRoutePlanner = null;            // RoutePlanner component on home screen CTA

// ----------------------------------------
// 2. LOCATION STATE
// User's selected start/destination and GPS position
// ----------------------------------------

// Route planning locations (set via autocomplete or "Use My Location")
let selectedStart = null;               // {lat, lng, name} - Start point for route
let selectedDestination = null;         // {lat, lng, name} - Destination for route

// GPS locations
let currentUserLocation = null;         // {lat, lng, accuracy} - One-time fix from "Use My Location" button
let currentUserPosition = null;         // {lat, lng, accuracy, heading} - Live GPS during navigation
let destinationLocation = null;         // {lat, lng} - Destination during active navigation

// ----------------------------------------
// 3. ROUTE STATE
// Calculated routes and selection
// ----------------------------------------

// The currently selected route object (from backend API)
let currentRoute = null;                // Route object with coordinates, instructions

// Processed route data for UI display
let currentRouteData = {
    distance: null,                     // Distance in miles
    duration: null,                     // Duration in minutes
    distanceText: null,                 // Formatted: "1.2 mi"
    durationText: null,                 // Formatted: "25 min"
    safetyScore: null,                  // 0-100 scale
    safetyLabel: null,                  // "Excellent", "Good", "Fair", "Caution"
    safetyColor: null,                  // CSS color
    scoreBreakdown: null,              // Object with individual factor scores
    usingCrimeData: null,               // Boolean: true if real crime data was used
    inSanFrancisco: null,               // Boolean: true if route is in SF
    crimeCount: null,                   // Number of crimes found along route
    rawCrimeData: null,                 // Array of crime objects for detailed analysis
    crimeSamples: null,                 // Crime samples for ombre coloring
    showNighttimeWarning: null          // Boolean: show nighttime safety warning
};

// Route comparison (when multiple routes are available)
let routeOptions = [];                  // Array of route data objects (safest, fastest, balanced)
let selectedRouteIndex = 0;             // Index of currently selected route in routeOptions
let hasLoadedMoreRoutes = false;        // Track if "Show More Routes" has been clicked
let isLoadingMoreRoutes = false;        // Track loading state for additional routes

// Route geometry for navigation
let routeSteps = [];                    // Array of turn-by-turn instruction objects
let routeCoordinates = [];              // Array of {lat, lng} points along route

// ----------------------------------------
// 4. NAVIGATION STATE
// Turn-by-turn navigation status and progress
// ----------------------------------------

let isNavigating = false;               // Is navigation currently active?
let isPreviewMode = false;              // true = preview (far from start), false = live GPS tracking
let isRecalculating = false;            // Is route being recalculated? (prevents duplicate recalcs)

let currentStepIndex = 0;               // Current step in routeSteps array
let navigationWatchId = null;           // GPS watchPosition ID (for cleanup)

// ----------------------------------------
// 5. UI STATE
// Visual preferences
// ----------------------------------------

let currentMode = 'light';              // Map color mode: 'light' or 'dark'

// ========================================
// SESSION & ERROR HANDLING
// ========================================

/**
 * Handle session expiration
 * Shows a modal prompting user to sign in again
 */
function handleSessionExpired() {
    console.log('[Auth] Session expired, showing re-auth modal');

    // Create session expired modal if it doesn't exist
    let modal = document.getElementById('session-expired-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'session-expired-modal';
        modal.className = 'session-expired-modal';
        modal.innerHTML = `
            <div class="session-expired-content">
                <svg class="session-expired-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <h3 class="session-expired-title">Session Expired</h3>
                <p class="session-expired-message">Your session has expired. Please sign in again to continue.</p>
                <div class="session-expired-buttons">
                    <button class="btn-secondary" id="session-dismiss-btn">Later</button>
                    <button class="btn-primary" id="session-signin-btn">Sign In</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add event listeners
        document.getElementById('session-dismiss-btn').addEventListener('click', () => {
            modal.classList.remove('visible');
        });

        document.getElementById('session-signin-btn').addEventListener('click', () => {
            modal.classList.remove('visible');
            goToScreen('screen-auth');
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('visible');
            }
        });
    }

    // Show the modal
    modal.classList.add('visible');
}

/**
 * Show a global toast message
 * @param {string} message
 * @param {string} type - 'success', 'warning', 'error', 'info'
 */
function showGlobalToast(message, type = 'info') {
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.className = 'offline-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `offline-toast ${type} visible`;

    setTimeout(() => {
        toast.classList.remove('visible');
    }, 4000);
}

// ========================================
// SCREEN NAVIGATION
// ========================================

/**
 * Navigate to a different screen in the single-page app
 * @param {string} screenId - The HTML id of the screen to show
 */
function goToScreen(screenId) {
    // Hide all screens
    const allScreens = document.querySelectorAll('.screen');
    allScreens.forEach(screen => {
        screen.classList.remove('active');
    });

    // Exit hazard selection mode if leaving route/navigation screens
    if (screenId !== 'screen-route-results' && screenId !== 'screen-active-navigation') {
        if (typeof exitHazardSelectionMode === 'function' && isHazardSelectionMode) {
            exitHazardSelectionMode();
        }
    }

    // Show the target screen
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        console.log(`Navigated to: ${screenId}`);

        // Close mobile menu if open
        closeMobileMenu();

        // Initialize map and trip sharing when showing route results
        if (screenId === 'screen-route-results') {
            setTimeout(initializeRouteMap, 100);
            // Initialize trip sharing toggle
            initTripSharing();
        }

        // Load trip sharing settings when showing account settings
        if (screenId === 'screen-account-settings') {
            loadTripSharingSettings();
        }
    } else {
        console.error(`Screen not found: ${screenId}`);
    }
}

// ========================================
// MOBILE MENU
// ========================================

function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    mobileMenu.classList.toggle('active');
}

function closeMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    mobileMenu.classList.remove('active');
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');

    if (mobileMenu && mobileMenu.classList.contains('active')) {
        if (!mobileMenu.contains(event.target) && !mobileMenuBtn.contains(event.target)) {
            closeMobileMenu();
        }
    }
});

// ========================================
// MODAL MANAGEMENT
// ========================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        console.log(`Opened modal: ${modalId}`);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        console.log(`Closed modal: ${modalId}`);
    }
}

function closeModalOnBackdrop(event, modalId) {
    if (event.target.id === modalId) {
        closeModal(modalId);
    }
}

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const activeModal = document.querySelector('.modal.active');
        if (activeModal) {
            closeModal(activeModal.id);
        }
    }
});

// ========================================
// PREFERENCES TOGGLE
// ========================================

function togglePreferences() {
    const content = document.getElementById('preferences-content');
    const arrow = document.getElementById('preferences-arrow');

    if (content && arrow) {
        content.classList.toggle('open');
        arrow.classList.toggle('open');
        console.log(`Preferences ${content.classList.contains('open') ? 'opened' : 'closed'}`);
    }
}

// ========================================
// ROUTE FINDING
// ========================================

async function findRoute(inputValues = {}, safetyPreferences = {}) {

    const startLocation = (inputValues.start || '').trim();
    const destination = (inputValues.destination || '').trim();

    console.log('📍 Start:', startLocation);
    console.log('📍 Destination:', destination);

    // Validate inputs
    if (!startLocation && !selectedStart) {
        alert('⚠️ Please enter your starting point');
        return;
    }

    if (!destination && !selectedDestination) {
        alert('⚠️ Please enter your destination');
        return;
    }

    // Show loading state
    const findRouteBtn = document.getElementById('main-find-route-btn');
    if (findRouteBtn) {
        findRouteBtn.disabled = true;
        findRouteBtn.textContent = 'Calculating...';
    }

    // Safety preferences with defaults
    const preferences = {
        preferWellLit: safetyPreferences.wellLit || false,
        preferBusyAreas: safetyPreferences.busyAreas || false,
        avoidConstruction: safetyPreferences.avoidConstruction || false
    };

    console.log('⚙️ Preferences:', preferences);

    // Navigate to results screen
    goToScreen('screen-route-results');

    // Reset loading state
    if (findRouteBtn) {
        findRouteBtn.disabled = false;
        findRouteBtn.textContent = 'Find Safest Route';
    }
}

// ========================================
// REAL-TIME LOCATION
// ========================================

async function getUserLocationForInput(inputId, onLocationSelected = null) {
    console.log('📍 Requesting user location for input:', inputId);

    // Derive button ID from input ID
    const btnId = inputId.replace('-start-location', '-use-location-btn');
    const btn = document.getElementById(btnId);
    const startInput = document.getElementById(inputId);

    // Check if geolocation is supported
    if (!navigator.geolocation) {
        alert('⚠️ Geolocation is not supported by your browser.');
        return;
    }

    // Check if elements exist
    if (!startInput) {
        console.error('Could not find input element:', inputId);
        return;
    }

    // Show loading state
    if (btn) {
        btn.classList.add('loading');
        btn.disabled = true;
    }
    startInput.placeholder = 'Getting your location...';

    // Request location
    navigator.geolocation.getCurrentPosition(
        // Success callback
        async function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            console.log('✅ Location found:', { lat, lng, accuracy });

            // Store current location
            currentUserLocation = { lat, lng, accuracy };

            // Reverse geocode to get address using Google
            const address = await googleReverseGeocode(lat, lng);

            if (address) {
                // Auto-fill the input
                startInput.value = address;

                // Store as selected start location
                selectedStart = {
                    lat: lat,
                    lng: lng,
                    name: address
                };

                console.log('📍 Address found:', address);

                // Trigger callback for sync between instances
                if (onLocationSelected) {
                    onLocationSelected(selectedStart);
                }

                // Show success state
                if (btn) {
                    btn.classList.remove('loading');
                    btn.classList.add('active');
                    btn.title = 'Location acquired';
                }
                startInput.placeholder = 'Current location';

                // Show location on map if visible
                if (routeMap) {
                    showCurrentLocationOnMap(routeMap, lat, lng, accuracy, {
                        getMarker: () => locationMarker,
                        setMarker: (m) => { locationMarker = m; },
                        getAccuracyCircle: () => locationAccuracyCircle,
                        setAccuracyCircle: (c) => { locationAccuracyCircle = c; }
                    });
                }
            } else {
                // Failed to get address
                alert('⚠️ Found your location but could not determine the address. Please type it manually.');
                if (btn) {
                    btn.classList.remove('loading');
                }
                startInput.placeholder = 'Enter your current location';
            }

            if (btn) {
                btn.disabled = false;
            }
        },
        // Error callback
        function(error) {
            console.error('❌ Location error:', error);
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
            startInput.placeholder = 'Enter your current location';

            // Handle specific errors
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    alert('⚠️ Location access denied.\n\nPlease enable location permissions in your browser settings to use this feature, or type your address manually.');
                    break;
                case error.POSITION_UNAVAILABLE:
                    alert('⚠️ Location information unavailable.\n\nPlease check your GPS/location settings or type your address manually.');
                    break;
                case error.TIMEOUT:
                    alert('⚠️ Location request timed out.\n\nPlease try again or type your address manually.');
                    break;
                default:
                    alert('⚠️ An unknown error occurred while getting your location.\n\nPlease type your address manually.');
            }
        },
        // Options
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000
        }
    );
}

// ========================================
// GOOGLE MAPS INITIALIZATION
// ========================================

/**
 * Wait for Google Maps to be ready with timeout
 * @param {number} timeoutMs - Timeout in milliseconds (default 15s)
 * @returns {Promise<void>}
 */
function waitForGoogleMaps(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        if (window.google && window.google.maps) {
            resolve();
            return;
        }

        const timeoutId = setTimeout(() => {
            reject(new Error('Google Maps failed to load'));
        }, timeoutMs);

        window.addEventListener('google-maps-ready', () => {
            clearTimeout(timeoutId);
            resolve();
        }, { once: true });

        // Also listen for error
        window.addEventListener('google-maps-error', () => {
            clearTimeout(timeoutId);
            reject(new Error('Google Maps load error'));
        }, { once: true });
    });
}

/**
 * Show Google Maps error UI in a map container
 * @param {HTMLElement} mapElement - The map container element
 */
function showMapsErrorUI(mapElement) {
    if (!mapElement) return;

    mapElement.innerHTML = `
        <div class="maps-error-container">
            <svg class="maps-error-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" opacity="0.3"/>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 2.88-2.88 7.19-5 9.88C9.92 16.21 7 11.85 7 9z"/>
            </svg>
            <h3 class="maps-error-title">Map couldn't load</h3>
            <p class="maps-error-message">Check your internet connection and try again.</p>
            <div class="maps-error-retry">
                <button class="btn-primary maps-retry-btn" onclick="location.reload()">
                    Retry
                </button>
            </div>
        </div>
    `;
}

/**
 * Initialize the route results map (shown after finding a route)
 */
async function initializeRouteMap() {
    console.log('🗺️ Initializing route map with Google Maps...');

    const mapElement = document.getElementById('route-map');
    if (!mapElement) {
        console.error('❌ Route map element not found');
        return;
    }

    try {
        // Wait for Google Maps API with timeout
        await waitForGoogleMaps();
        // Clean up existing map
        if (routeMap) {
            // Remove existing overlays
            removePolylines(ombreRoutePolylines);
            removePolylines(alternativeRoutePolylines);
            removeCrimeMarkers(crimeMarkersData);
            removeMarker(startMarker);
            removeMarker(destinationMarker);
            removeMarker(locationMarker);
        }

        // Create the Google Map
        routeMap = createMap(mapElement, {
            lat: defaultLocation.lat,
            lng: defaultLocation.lng,
            zoom: 13,
            mode: currentMode
        });

        // Add toggle button
        addMapStyleToggle(routeMap, {
            getMode: () => currentMode,
            setMode: (m) => { currentMode = m; }
        });

        // If we have selected locations, calculate route
        if (selectedStart && selectedDestination) {
            calculateAndDisplayRoute(selectedStart, selectedDestination);
        } else {
            console.log('ℹ️ Waiting for start and destination to be selected');
        }

    } catch (error) {
        console.error('❌ Error initializing route map:', error);
        showMapsErrorUI(mapElement);
        showGlobalToast('Map failed to load. Check your connection.', 'error');
    }
}

/**
 * Initialize the navigation map (for turn-by-turn directions)
 * @returns {Promise<boolean>} True if map initialized successfully
 */
async function initializeNavigationMap() {
    console.log('🧭 Initializing navigation map with Google Maps...');

    const mapElement = document.getElementById('navigation-map');
    if (!mapElement) {
        console.error('❌ Navigation map element not found');
        return false;
    }

    try {
        // Wait for Google Maps API with timeout
        await waitForGoogleMaps();
        // Clean up existing map
        if (navigationMap) {
            removePolylines(navOmbreRoutePolylines);
            removePolylines(navAlternativeRoutePolylines);
            removeCrimeMarkers(navCrimeMarkersData);
            removeMarker(navigationMarker);
        }

        // Create the Google Map
        navigationMap = createMap(mapElement, {
            lat: defaultLocation.lat,
            lng: defaultLocation.lng,
            zoom: 15,
            mode: currentMode
        });

        // Add toggle button
        addMapStyleToggle(navigationMap, {
            getMode: () => currentMode,
            setMode: (m) => { currentMode = m; }
        });

        return true;
    } catch (error) {
        console.error('❌ Error initializing navigation map:', error);
        showMapsErrorUI(mapElement);
        showGlobalToast('Navigation map failed to load.', 'error');
        return false;
    }
}

// ========================================
// ROUTE CALCULATION WITH BACKEND API
// ========================================

/**
 * Calculate and display walking routes using the backend API
 * @param {Object} start - Start location {lat, lng, name}
 * @param {Object} end - Destination {lat, lng, name}
 */
async function calculateAndDisplayRoute(start, end) {
    console.log('🔍 Calculating route via backend API...');
    console.log('From:', start?.name || start);
    console.log('To:', end?.name || end);

    // Validate that we have coordinates
    if (!start || typeof start.lat !== 'number' || typeof start.lng !== 'number') {
        console.error('❌ Invalid start location - missing coordinates');
        showGlobalToast('Please select a starting point from the dropdown or use GPS.', 'error');
        updateRouteLoadingState(false);
        return;
    }

    if (!end || typeof end.lat !== 'number' || typeof end.lng !== 'number') {
        console.error('❌ Invalid destination - missing coordinates');
        showGlobalToast('Please select a destination from the dropdown.', 'error');
        updateRouteLoadingState(false);
        return;
    }

    if (!routeMap) {
        console.error('❌ Map not initialized');
        return;
    }

    // Show loading state
    updateRouteLoadingState(true);

    try {
        // Call backend API
        const response = await fetch(`${API_BASE_URL}/api/routes/calculate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                start: { lat: start.lat, lng: start.lng, address: start.name },
                destination: { lat: end.lat, lng: end.lng, address: end.name },
                preferences: {}
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to calculate route');
        }

        const data = await response.json();
        console.log('📦 Route data received:', data);

        if (!data.success || !data.routes) {
            throw new Error('Invalid response from server');
        }

        // Reset "Show More Routes" state for new calculation
        hasLoadedMoreRoutes = false;
        isLoadingMoreRoutes = false;

        // Process routes from backend
        routeOptions = processBackendRoutes(data.routes);

        if (routeOptions.length === 0) {
            throw new Error('No routes found');
        }

        // Auto-select safest route (first in list)
        selectedRouteIndex = 0;
        const selectedRoute = routeOptions[selectedRouteIndex];

        // Store route data
        currentRouteData = {
            distance: selectedRoute.distance,
            duration: selectedRoute.duration,
            distanceText: selectedRoute.distanceText,
            durationText: selectedRoute.durationText,
            safetyScore: selectedRoute.safetyScore,
            safetyLabel: selectedRoute.safetyLabel,
            safetyColor: selectedRoute.safetyColor,
            scoreBreakdown: selectedRoute.scoreBreakdown || {},
            detailedMetrics: selectedRoute.detailedMetrics || null, // Detailed metrics for Show More
            usingCrimeData: selectedRoute.usingCrimeData,
            inSanFrancisco: true,
            crimeCount: selectedRoute.crimeCount || 0,
            rawCrimeData: selectedRoute.rawCrimeData || [],
            crimeSamples: selectedRoute.crimeSamples || [],
            showNighttimeWarning: selectedRoute.showNighttimeWarning || false
        };

        // Store current route
        currentRoute = selectedRoute.route;
        routeCoordinates = selectedRoute.coordinates || [];

        console.log(`📏 Distance: ${selectedRoute.distanceText}`);
        console.log(`⏱️ Duration: ${selectedRoute.durationText}`);
        console.log(`🛡️ Safety Score: ${selectedRoute.safetyScore}/100 (${selectedRoute.safetyLabel})`);

        // Clear existing overlays
        removePolylines(ombreRoutePolylines);
        removePolylines(alternativeRoutePolylines);
        removeCrimeMarkers(crimeMarkersData);
        removeMarker(startMarker);
        removeMarker(destinationMarker);

        // Draw routes on map
        drawRoutesOnMap(routeMap, routeOptions, selectedRouteIndex);

        // Add start/end markers
        const markers = createRouteMarkers(routeMap, start, end);
        startMarker = markers.startMarker;
        destinationMarker = markers.endMarker;

        // Fit map to show entire route
        if (routeCoordinates.length > 0) {
            fitBoundsToPoints(routeMap, routeCoordinates);
        }

        // Update UI - show single route display initially (not comparison)
        updateRouteDisplay();
        updateSafetyDisplay(() => currentRouteData);
        showSeeAlternativesButton();

        // Add crime markers
        if (currentRouteData.rawCrimeData && currentRouteData.rawCrimeData.length > 0) {
            const recentCrimes = filterViolentCrimes(currentRouteData.rawCrimeData);
            if (recentCrimes.length > 0) {
                crimeMarkersData = addCrimeMarkersToMap(routeMap, recentCrimes, { coordinates: routeCoordinates });
            }
        }

    } catch (error) {
        console.error('❌ Route calculation error:', error);
        alert(`⚠️ ${error.message || 'Could not calculate route. Please try different addresses.'}`);
    } finally {
        updateRouteLoadingState(false);
    }
}

/**
 * Process routes from backend response into frontend format
 * Now uses allRoutes array to show all available routes ranked by safety
 * @param {Object} routes - Routes from backend {safest, fastest, balanced, allRoutes}
 * @returns {Array} Processed route options
 */
function processBackendRoutes(routes) {
    const routeArray = [];

    // DIAGNOSTIC: Log what we receive from backend
    console.log('[processBackendRoutes] DIAGNOSTIC - Received routes object keys:', Object.keys(routes));
    if (routes.safest) {
        console.log('[processBackendRoutes] DIAGNOSTIC - Safest route keys:', Object.keys(routes.safest));
        console.log('[processBackendRoutes] DIAGNOSTIC - Safest route has steps:', !!routes.safest.steps);
        console.log('[processBackendRoutes] DIAGNOSTIC - Safest route steps length:', routes.safest.steps?.length || 0);
        console.log('[processBackendRoutes] DIAGNOSTIC - Safest route has instructions:', !!routes.safest.instructions);
        console.log('[processBackendRoutes] DIAGNOSTIC - Safest route instructions length:', routes.safest.instructions?.length || 0);
        if (routes.safest.steps && routes.safest.steps.length > 0) {
            console.log('[processBackendRoutes] DIAGNOSTIC - First step:', JSON.stringify(routes.safest.steps[0]));
        }
    }

    // Use allRoutes if available (all routes ranked by safety score)
    // Otherwise fall back to the 3 named routes
    const routesToProcess = routes.allRoutes && routes.allRoutes.length > 0
        ? routes.allRoutes
        : [routes.safest, routes.fastest, routes.balanced].filter(Boolean);

    routesToProcess.forEach((route, index) => {
        if (!route) return;

        // Decode polyline to coordinates
        const coordinates = route.polyline
            ? decodePolyline(route.polyline)
            : (route.coordinates || []);

        // Convert distance/duration
        const distanceMiles = route.distanceMeters ? metersToMiles(route.distanceMeters) : 0;
        const durationMinutes = route.durationSeconds ? secondsToMinutes(route.durationSeconds) : 0;

        // Safety score from backend is 0-100
        const safetyScore = route.safetyScore || 50;

        // Extract crime count from stats if available
        const crimeCount = route.stats?.crimes?.total || route.crimeCount || 0;

        // Extract raw crime data from stats or direct property
        const rawCrimeData = route.stats?.crimes?.rawData || route.crimes || [];

        routeArray.push({
            route: route,
            type: route.type || `route-${index + 1}`,
            rank: route.rank || index + 1,
            index: index,
            coordinates: coordinates,
            distance: distanceMiles,
            duration: durationMinutes,
            distanceText: formatDistance(distanceMiles),
            durationText: formatDuration(durationMinutes),
            safetyScore: safetyScore,  // Store as 0-100
            safetyLabel: route.safetyLabel || getSafetyLabel(safetyScore),
            safetyColor: getSafetyColor(safetyScore),
            scoreBreakdown: route.scoreBreakdown || {},
            detailedMetrics: route.detailedMetrics || null, // Extract detailed metrics from backend
            crimes: route.crimes || [],
            usingCrimeData: crimeCount > 0,
            crimeCount: crimeCount,
            rawCrimeData: rawCrimeData,
            crimeSamples: route.crimeSamples || [],
            showNighttimeWarning: route.scoreBreakdown?.timeOfDay < 40 // Show warning if time score is low
        });
    });

    return routeArray;
}

/**
 * Draw routes on the map with ombre coloring
 * Beta: Only draws single selected route (alternatives disabled)
 */
function drawRoutesOnMap(map, routes, selectedIdx) {
    // Clear existing routes
    removePolylines(ombreRoutePolylines);
    removePolylines(alternativeRoutePolylines);

    // Draw selected route only (beta: single route mode)
    const selectedRoute = routes[selectedIdx];
    if (selectedRoute) {
        if (selectedRoute.crimeSamples && selectedRoute.crimeSamples.length > 0) {
            ombreRoutePolylines = drawOmbreRoute(
                map,
                selectedRoute.coordinates,
                selectedRoute.crimeSamples,
                0.8,
                false
            );
        } else {
            ombreRoutePolylines = drawBasicRoute(
                map,
                selectedRoute.coordinates,
                0.8,
                false,
                '#4285f4'
            );
        }
    }

    // Alternative routes drawing disabled for beta
}

// Loading timeout handler
let loadingTimeoutId = null;

/**
 * Update loading state on route results screen with timeout handling
 * @param {boolean} isLoading - Whether loading is in progress
 * @param {number} timeoutMs - Timeout in ms before showing "taking longer" message
 */
function updateRouteLoadingState(isLoading, timeoutMs = 15000) {
    const loadingEl = document.getElementById('route-loading');
    const resultsEl = document.getElementById('route-results-content');

    // Clear any existing timeout
    if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        loadingTimeoutId = null;
    }

    if (loadingEl) {
        loadingEl.style.display = isLoading ? 'flex' : 'none';

        // Remove timeout message if exists
        const timeoutMsg = loadingEl.querySelector('.loading-timeout-message');
        if (timeoutMsg) {
            timeoutMsg.remove();
        }

        // Add timeout handler for long loading
        if (isLoading) {
            loadingTimeoutId = setTimeout(() => {
                // Check if still loading
                if (loadingEl.style.display === 'flex') {
                    // Add "taking longer than expected" message
                    const msgEl = document.createElement('div');
                    msgEl.className = 'loading-timeout-message';
                    msgEl.innerHTML = `
                        <p>This is taking longer than usual...</p>
                        <button class="btn-secondary" onclick="location.reload()">Retry</button>
                    `;
                    loadingEl.appendChild(msgEl);
                }
            }, timeoutMs);
        }
    }

    if (resultsEl) {
        resultsEl.style.display = isLoading ? 'none' : 'block';
    }
}

// ========================================
// SEE ALTERNATIVE ROUTES
// ========================================

/**
 * Show the "See Alternative Routes" button
 * Called after initial route is displayed
 */
function showSeeAlternativesButton() {
    const alternativesContainer = document.getElementById('see-alternatives-container');
    const comparisonContainer = document.getElementById('route-comparison-container');

    if (alternativesContainer) {
        alternativesContainer.style.display = 'flex';

        // Add click handler for the button
        const seeAlternativesBtn = document.getElementById('see-alternatives-btn');
        if (seeAlternativesBtn) {
            // Remove any existing listener first
            seeAlternativesBtn.replaceWith(seeAlternativesBtn.cloneNode(true));
            const newBtn = document.getElementById('see-alternatives-btn');
            newBtn.addEventListener('click', fetchAlternativeRoutes);
        }
    }

    // Hide comparison container initially
    if (comparisonContainer) {
        comparisonContainer.style.display = 'none';
    }

    console.log('[PinkPath] Showing "See Alternative Routes" button');
}

/**
 * Fetch alternative routes when user clicks "See Alternative Routes"
 * Gets 5 waypoint-based routes from the backend
 */
async function fetchAlternativeRoutes() {
    if (isLoadingMoreRoutes || hasLoadedMoreRoutes) {
        console.log('[PinkPath] Already loading or loaded alternative routes');
        return;
    }

    const alternativesContainer = document.getElementById('see-alternatives-container');
    const seeAlternativesBtn = document.getElementById('see-alternatives-btn');

    if (!seeAlternativesBtn) return;

    // Update button state to loading
    isLoadingMoreRoutes = true;
    const originalContent = seeAlternativesBtn.innerHTML;
    seeAlternativesBtn.innerHTML = `
        <div class="loading-spinner-small"></div>
        <span>Finding alternative routes...</span>
    `;
    seeAlternativesBtn.disabled = true;

    try {
        // Get the safest route (first in routeOptions) to use as base
        const baseRoute = routeOptions[0];
        if (!baseRoute) {
            throw new Error('No base route available');
        }

        console.log('[PinkPath] Fetching 5 alternative waypoint-based routes...');

        // Validate start/destination
        if (!selectedStart || !selectedDestination) {
            throw new Error('Start or destination location not available');
        }

        const response = await fetch(`${API_BASE_URL}/api/routes/alternatives`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: { lat: selectedStart.lat, lng: selectedStart.lng },
                destination: { lat: selectedDestination.lat, lng: selectedDestination.lng },
                baseRoute: {
                    coordinates: baseRoute.coordinates || [],
                    polyline: baseRoute.route?.polyline || '',
                    distanceMeters: baseRoute.route?.distanceMeters || baseRoute.distance * 1609.34,
                    durationSeconds: baseRoute.route?.durationSeconds || baseRoute.duration * 60,
                },
                preferences: {}
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to fetch alternative routes');
        }

        const data = await response.json();
        console.log('[PinkPath] Alternative routes received:', data);

        if (!data.success || !data.additionalRoutes || data.additionalRoutes.length === 0) {
            throw new Error('No alternative routes found');
        }

        // Process the additional routes
        const additionalRoutes = processAdditionalRoutes(data.additionalRoutes);
        console.log(`[PinkPath] Processed ${additionalRoutes.length} alternative routes`);

        // Combine original route with alternatives
        routeOptions = [routeOptions[0], ...additionalRoutes];

        // Sort all routes by safety score
        routeOptions.sort((a, b) => b.safetyScore - a.safetyScore);

        // Re-assign ranks after sorting
        routeOptions.forEach((route, index) => {
            route.rank = index + 1;
            // Mark the original safest route
            if (route.type === 'safest' || (!route.isWaypointRoute && index === 0)) {
                route.type = 'safest';
            }
        });

        // Mark as loaded
        hasLoadedMoreRoutes = true;

        // Hide the "See Alternative Routes" button
        if (alternativesContainer) {
            alternativesContainer.style.display = 'none';
        }

        // Show the comparison UI with all 6 routes
        updateRouteComparisonUI();

        // Redraw routes on map to show all options
        drawRoutesOnMap(routeMap, routeOptions, selectedRouteIndex);

        console.log(`[PinkPath] Total routes now: ${routeOptions.length} (showing all in comparison)`);

    } catch (error) {
        console.error('[PinkPath] Error fetching alternative routes:', error);

        // Show error in button
        seeAlternativesBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon" style="color: #ef4444;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>Failed - Try Again</span>
        `;
        seeAlternativesBtn.disabled = false;
        isLoadingMoreRoutes = false;

        // Reset after 3 seconds to allow retry
        setTimeout(() => {
            seeAlternativesBtn.innerHTML = originalContent;
        }, 3000);
        return;

    } finally {
        isLoadingMoreRoutes = false;
    }
}

// ========================================
// ROUTE COMPARISON UI
// ========================================

/**
 * Build and display the route comparison cards
 * Shows all routes ranked by safety score
 * Called after alternatives are loaded
 */
function updateRouteComparisonUI() {
    const comparisonContainer = document.getElementById('route-comparison-container');

    if (!comparisonContainer) {
        console.warn('⚠️ Route comparison container not found');
        return;
    }

    // Clear existing cards
    comparisonContainer.innerHTML = '';

    // Show comparison container
    comparisonContainer.style.display = 'flex';

    // Add header showing total routes
    const header = document.createElement('div');
    header.className = 'route-comparison-header';
    header.innerHTML = `<h3>All Routes (${routeOptions.length}) - Ranked by Safety</h3>`;
    comparisonContainer.appendChild(header);

    // Create scrollable container for route cards
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'route-cards-scroll';
    comparisonContainer.appendChild(cardsContainer);

    // Create card for each route option
    routeOptions.forEach((routeOption, index) => {
        const isSelected = (index === selectedRouteIndex);
        const rank = routeOption.rank || index + 1;

        // Determine display label
        let displayLabel = `#${rank}`;
        if (routeOption.type === 'safest') displayLabel += ' (Safest)';
        else if (routeOption.type === 'fastest') displayLabel += ' (Fastest)';

        const card = document.createElement('div');
        card.className = `route-card ${isSelected ? 'selected' : ''}`;
        card.dataset.routeIndex = index;

        // Get color based on safety score
        const scoreColor = getScoreColor(routeOption.safetyScore);

        card.innerHTML = `
            <div class="route-card-header">
                <div class="route-rank-badge" style="background-color: ${scoreColor};">
                    ${rank}
                </div>
                <h3>${displayLabel}</h3>
            </div>
            <div class="route-card-body">
                <div class="route-score-display">
                    <span class="score-large" style="color: ${scoreColor};">${Math.round(routeOption.safetyScore)}</span>
                    <span class="score-label">Safety</span>
                </div>
                <div class="route-stats-compact">
                    <div class="route-stat">
                        <span class="route-stat-value">${routeOption.distanceText}</span>
                        <span class="route-stat-label">Distance</span>
                    </div>
                    <div class="route-stat">
                        <span class="route-stat-value">${routeOption.durationText}</span>
                        <span class="route-stat-label">Duration</span>
                    </div>
                    <div class="route-stat">
                        <span class="route-stat-value">${routeOption.crimeCount}</span>
                        <span class="route-stat-label">Crimes</span>
                    </div>
                </div>
            </div>
            <button class="select-route-btn ${isSelected ? 'selected' : ''}" data-route-index="${index}">
                ${isSelected ? 'Selected' : 'Select'}
            </button>
        `;

        cardsContainer.appendChild(card);
    });

    // Add click handlers to select buttons
    const selectButtons = comparisonContainer.querySelectorAll('.select-route-btn');
    selectButtons.forEach(button => {
        button.addEventListener('click', function() {
            const newIndex = parseInt(this.dataset.routeIndex);
            selectRoute(newIndex);
        });
    });

    // Log route variety analysis
    console.log('📊 Route Variety Analysis:');
    routeOptions.forEach((r, i) => {
        console.log(`  Route ${i + 1}: Safety=${Math.round(r.safetyScore)}, Distance=${r.distanceText}, Duration=${r.durationText}`);
    });
}

/**
 * Get color based on safety score (0-100)
 */
function getScoreColor(score) {
    if (score >= 80) return '#22c55e'; // Green - Excellent
    if (score >= 60) return '#84cc16'; // Light green - Good
    if (score >= 40) return '#eab308'; // Yellow - Fair
    return '#ef4444'; // Red - Caution
}

/**
 * Switch the selected route
 * @param {number} newIndex - Index of route to select
 */
function selectRoute(newIndex) {
    if (newIndex === selectedRouteIndex) {
        return; // Already selected
    }

    selectedRouteIndex = newIndex;
    console.log(`🎯 User selected Route ${newIndex + 1}`);

    // Update current route data
    const selectedRoute = routeOptions[selectedRouteIndex];
    currentRoute = selectedRoute.route;
    routeCoordinates = selectedRoute.coordinates || [];

    currentRouteData = {
        distance: selectedRoute.distance,
        duration: selectedRoute.duration,
        distanceText: selectedRoute.distanceText,
        durationText: selectedRoute.durationText,
        safetyScore: selectedRoute.safetyScore,
        safetyLabel: selectedRoute.safetyLabel,
        safetyColor: selectedRoute.safetyColor,
        scoreBreakdown: selectedRoute.scoreBreakdown,
        detailedMetrics: selectedRoute.detailedMetrics || null, // Detailed metrics for Show More
        usingCrimeData: selectedRoute.usingCrimeData,
        inSanFrancisco: true,
        crimeCount: selectedRoute.crimeCount,
        rawCrimeData: selectedRoute.rawCrimeData,
        crimeSamples: selectedRoute.crimeSamples,
        showNighttimeWarning: selectedRoute.showNighttimeWarning
    };

    // Redraw routes
    drawRoutesOnMap(routeMap, routeOptions, selectedRouteIndex);

    // Update UI
    updateRouteComparisonUI();
    updateRouteDisplay();
    updateSafetyDisplay(() => currentRouteData);

    // Update crime markers
    removeCrimeMarkers(crimeMarkersData);
    if (selectedRoute.rawCrimeData && selectedRoute.rawCrimeData.length > 0) {
        const recentCrimes = filterViolentCrimes(selectedRoute.rawCrimeData);
        if (recentCrimes.length > 0) {
            crimeMarkersData = addCrimeMarkersToMap(routeMap, recentCrimes, { coordinates: routeCoordinates });
        }
    }
}

/**
 * Process additional routes from the alternatives endpoint
 * Similar to processBackendRoutes but for the waypoint-based routes
 * @param {Array} routes - Array of route objects from /api/routes/alternatives
 * @returns {Array} Processed route options
 */
function processAdditionalRoutes(routes) {
    const routeArray = [];

    routes.forEach((route, index) => {
        if (!route) return;

        // Decode polyline to coordinates
        const coordinates = route.polyline
            ? decodePolyline(route.polyline)
            : (route.coordinates || []);

        // Convert distance/duration
        const distanceMiles = route.distanceMeters ? metersToMiles(route.distanceMeters) : 0;
        const durationMinutes = route.durationSeconds ? secondsToMinutes(route.durationSeconds) : 0;

        // Safety score from backend is 0-100
        const safetyScore = route.safetyScore || 50;

        // Extract crime count from stats if available
        const crimeCount = route.stats?.crimes?.total || route.crimeCount || 0;

        // Extract raw crime data from stats or direct property
        const rawCrimeData = route.stats?.crimes?.rawData || route.crimes || [];

        routeArray.push({
            route: route,
            type: route.type || `waypoint-${index + 1}`,
            rank: null, // Will be assigned after sorting
            index: index,
            coordinates: coordinates,
            distance: distanceMiles,
            duration: durationMinutes,
            distanceText: formatDistance(distanceMiles),
            durationText: formatDuration(durationMinutes),
            safetyScore: safetyScore,
            safetyLabel: route.safetyLabel || getSafetyLabel(safetyScore),
            safetyColor: getSafetyColor(safetyScore),
            scoreBreakdown: route.scoreBreakdown || {},
            detailedMetrics: route.detailedMetrics || null,
            crimes: route.crimes || [],
            usingCrimeData: crimeCount > 0,
            crimeCount: crimeCount,
            rawCrimeData: rawCrimeData,
            crimeSamples: route.crimeSamples || [],
            showNighttimeWarning: route.scoreBreakdown?.timeOfDay < 40,
            isWaypointRoute: true, // Flag to identify these routes
        });
    });

    return routeArray;
}

// ========================================
// DISPLAY UPDATES
// ========================================

/**
 * Update route information displays
 */
function updateRouteDisplay() {
    // Update route results screen
    const routeDurationElement = document.getElementById('route-duration');
    if (routeDurationElement && currentRouteData.durationText) {
        routeDurationElement.textContent = currentRouteData.durationText;
    }

    // Update navigation screen
    const navDistanceElement = document.getElementById('nav-distance');
    if (navDistanceElement && currentRouteData.distanceText) {
        navDistanceElement.textContent = currentRouteData.distanceText;
    }

    const navDurationElement = document.getElementById('nav-duration');
    if (navDurationElement && currentRouteData.durationText) {
        navDurationElement.textContent = currentRouteData.durationText;
    }

    // Update navigation screen safety score
    const navSafetyScoreElement = document.getElementById('nav-safety-score');
    if (navSafetyScoreElement && currentRouteData.safetyScore) {
        navSafetyScoreElement.textContent = currentRouteData.safetyScore.toFixed(0);
    }
}

// ========================================
// GEOLOCATION HELPERS
// ========================================

/**
 * Get current position as a Promise
 * Wraps navigator.geolocation.getCurrentPosition for async/await use
 * @param {Object} options - Geolocation options
 * @returns {Promise<GeolocationPosition>}
 */
function getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by this browser'));
            return;
        }

        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        };

        navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            { ...defaultOptions, ...options }
        );
    });
}

// ========================================
// TURN-BY-TURN NAVIGATION
// ========================================

async function checkIfAtStartPoint() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.log('ℹ️ No GPS available - defaulting to Preview Mode');
            resolve(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            function(position) {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                const startLat = selectedStart.lat;
                const startLng = selectedStart.lng;

                const distance = calculateDistance(userLat, userLng, startLat, startLng);
                const distanceFeet = distance * 5280;

                console.log(`📍 Distance to start point: ${distanceFeet.toFixed(0)} ft`);

                if (distanceFeet <= 100) {
                    console.log('✅ User is at start point - Live Mode');
                    resolve(true);
                } else {
                    console.log(`ℹ️ User is ${distanceFeet.toFixed(0)} ft from start - Preview Mode`);
                    resolve(false);
                }
            },
            function(error) {
                console.log('⚠️ GPS permission denied or unavailable - Preview Mode');
                resolve(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    });
}

async function startNavigation() {
    console.log('🧭 Starting navigation...');

    if (!currentRoute || !selectedStart || !selectedDestination) {
        alert('⚠️ No route calculated. Please plan a route first.');
        return;
    }

    // Cache route for offline use
    cacheCurrentRoute(currentRouteData, {
        start: selectedStart,
        destination: selectedDestination,
        routeSteps: routeSteps,
        isPreviewMode: isPreviewMode,
    });
    console.log('[Navigation] Route cached for offline use');

    // Detect if user is at start point
    const atStartPoint = await checkIfAtStartPoint();
    isPreviewMode = !atStartPoint;

    console.log(`📋 Mode: ${isPreviewMode ? 'PREVIEW' : 'LIVE'}`);

    // Start trip with sharing if enabled (only in live mode)
    if (!isPreviewMode && isTripSharingEnabled()) {
        const durationMinutes = currentRoute.duration
            ? Math.ceil(currentRoute.duration / 60)
            : 15;

        await startTrip({
            origin: selectedStart,
            destination: selectedDestination,
            originName: document.getElementById('start-input')?.value || 'Starting point',
            destinationName: document.getElementById('destination-input')?.value || 'Destination',
            durationMinutes: durationMinutes,
        });
    }

    // Set navigation state
    destinationLocation = selectedDestination;
    currentStepIndex = 0;
    isNavigating = true;
    isRecalculating = false;

    // Navigate to navigation screen
    goToScreen('screen-active-navigation');

    // Wait for screen transition, then initialize
    setTimeout(() => {
        initializeNavigationSequence();
    }, 300);
}

async function initializeNavigationSequence() {
    console.log('🔄 Initializing navigation sequence...');

    // Step 1: Initialize the navigation map
    const mapInitialized = await initializeNavigationMap();

    if (!mapInitialized) {
        alert('⚠️ Failed to initialize navigation map. Please try again.');
        goToScreen('screen-route-results');
        return;
    }

    // Step 2: Display route on navigation map
    setTimeout(() => {
        displayRouteOnNavigationMap();

        // Step 3: Start GPS if in live mode
        setTimeout(() => {
            startNavigationAfterMapReady();
        }, 500);
    }, 400);
}

function displayRouteOnNavigationMap() {
    console.log('🗺️ Displaying route on navigation map...');

    if (!navigationMap) {
        console.error('❌ Navigation map not initialized');
        return;
    }

    // Extract steps from route
    // DIAGNOSTIC: Log currentRoute structure when extracting steps
    console.log('[displayRouteOnNavigationMap] DIAGNOSTIC - currentRoute keys:', currentRoute ? Object.keys(currentRoute) : 'null');
    console.log('[displayRouteOnNavigationMap] DIAGNOSTIC - currentRoute.steps:', currentRoute?.steps);
    console.log('[displayRouteOnNavigationMap] DIAGNOSTIC - currentRoute.instructions:', currentRoute?.instructions);

    routeSteps = currentRoute.steps || currentRoute.instructions || [];
    console.log('[displayRouteOnNavigationMap] DIAGNOSTIC - Extracted routeSteps length:', routeSteps.length);

    // Clear any existing polylines first
    removePolylines(navOmbreRoutePolylines);
    removePolylines(navAlternativeRoutePolylines);

    // Draw selected route only (beta: single route mode)
    const selectedRoute = routeOptions[selectedRouteIndex];
    if (selectedRoute) {
        if (selectedRoute.crimeSamples && selectedRoute.crimeSamples.length > 0) {
            navOmbreRoutePolylines = drawOmbreRoute(
                navigationMap,
                selectedRoute.coordinates,
                selectedRoute.crimeSamples,
                0.8,
                false
            );
        } else {
            navOmbreRoutePolylines = drawBasicRoute(
                navigationMap,
                selectedRoute.coordinates,
                0.8,
                false,
                '#4285f4'
            );
        }
    }

    // Alternative routes drawing disabled for beta

    // Add crime markers
    if (currentRouteData.rawCrimeData && currentRouteData.rawCrimeData.length > 0) {
        const recentCrimes = filterViolentCrimes(currentRouteData.rawCrimeData);
        if (recentCrimes.length > 0) {
            navCrimeMarkersData = addCrimeMarkersToMap(navigationMap, recentCrimes, { coordinates: routeCoordinates });
        }
    }

    // Fit map to route
    if (routeCoordinates.length > 0) {
        fitBoundsToPoints(navigationMap, routeCoordinates);
    }
}

function startNavigationAfterMapReady() {
    console.log(`[startNavigationAfterMapReady] Initial routeSteps.length=${routeSteps.length}`);

    if (routeSteps.length === 0) {
        // Create simple steps from coordinates if none provided
        routeSteps = [{
            text: 'Head toward your destination',
            distance: currentRouteData.distance * 1609.34
        }];
        console.log('[startNavigationAfterMapReady] Created fallback single step');
    }

    console.log(`📋 Route has ${routeSteps.length} steps`);
    console.log(`📋 isPreviewMode=${isPreviewMode}`);

    // Start GPS tracking in Live Mode
    if (!isPreviewMode) {
        console.log('🔴 Live Mode: Starting GPS tracking...');
        startGPSTracking();
    } else {
        console.log('🔵 Preview Mode: No GPS tracking');
    }

    // Update UI
    updateNavigationUI();
}

function startGPSTracking() {
    console.log('📍 Starting GPS tracking...');

    navigationWatchId = navigator.geolocation.watchPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const heading = position.coords.heading;

            currentUserPosition = {
                lat: lat,
                lng: lng,
                heading: heading,
                accuracy: position.coords.accuracy
            };

            console.log(`📍 Position update: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

            updateNavigationPosition();
        },
        function(error) {
            console.error('❌ GPS error:', error);

            switch(error.code) {
                case error.PERMISSION_DENIED:
                    alert('⚠️ Location permission denied. Navigation requires GPS access.');
                    endNavigation();
                    break;
                case error.POSITION_UNAVAILABLE:
                    updateNavigationStatus('GPS signal lost...', false);
                    break;
                case error.TIMEOUT:
                    updateNavigationStatus('GPS timeout...', false);
                    break;
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function updateNavigationPosition() {
    if (!isNavigating || !currentUserPosition) return;

    // Update map with current position
    updateNavigationMap();

    // Check if we've reached the current step
    if (currentStepIndex < routeSteps.length) {
        const currentStep = routeSteps[currentStepIndex];
        const stepLocation = currentStep.latLng || currentStep.location;

        if (stepLocation && stepLocation.lat && stepLocation.lng) {
            const distanceToStep = calculateDistance(
                currentUserPosition.lat,
                currentUserPosition.lng,
                stepLocation.lat,
                stepLocation.lng
            );

            console.log(`📏 Distance to next step: ${(distanceToStep * 5280).toFixed(0)} ft`);

            if (distanceToStep < 0.01) { // ~50 feet
                advanceToNextStep();
            }
        }
    }

    // Check if off-route
    if (!isRecalculating) {
        checkIfOffRoute();
    }

    updateNavigationUI();
}

function advanceToNextStep() {
    currentStepIndex++;

    if (currentStepIndex >= routeSteps.length) {
        console.log('🎉 Arrived at destination!');
        handleArrival();
        return;
    }

    console.log(`➡️ Advanced to step ${currentStepIndex + 1}/${routeSteps.length}`);
    updateNavigationUI();
}

function nextStep() {
    console.log(`[nextStep] Called. isPreviewMode=${isPreviewMode}, currentStepIndex=${currentStepIndex}, routeSteps.length=${routeSteps.length}`);

    if (!isPreviewMode) {
        console.log('[nextStep] Not in preview mode, returning');
        return;
    }

    if (currentStepIndex < routeSteps.length - 1) {
        currentStepIndex++;
        console.log(`➡️ Next step: ${currentStepIndex + 1}/${routeSteps.length}`);
        updateNavigationUI();
    } else {
        console.log('[nextStep] Already at last step');
    }
}

function previousStep() {
    console.log(`[previousStep] Called. isPreviewMode=${isPreviewMode}, currentStepIndex=${currentStepIndex}`);

    if (!isPreviewMode) {
        console.log('[previousStep] Not in preview mode, returning');
        return;
    }

    if (currentStepIndex > 0) {
        currentStepIndex--;
        console.log(`⬅️ Previous step: ${currentStepIndex + 1}/${routeSteps.length}`);
        updateNavigationUI();
    } else {
        console.log('[previousStep] Already at first step');
    }
}

function checkIfOffRoute() {
    if (!currentUserPosition || !routeCoordinates || routeCoordinates.length === 0) {
        return;
    }

    const distanceToRoute = calculateDistanceToPolyline(
        currentUserPosition.lat,
        currentUserPosition.lng,
        routeCoordinates
    );

    const offRouteThreshold = 150; // 150 feet
    const distanceFeet = distanceToRoute * 5280;

    console.log(`📏 Distance to route: ${distanceFeet.toFixed(0)} ft`);

    if (distanceFeet > offRouteThreshold) {
        console.log('⚠️ Off route! Recalculating...');
        recalculateRoute();
    }
}

async function recalculateRoute() {
    if (isRecalculating) return;

    isRecalculating = true;
    updateNavigationStatus('Recalculating...', true);

    console.log('🔄 Recalculating route...');

    const newStart = {
        lat: currentUserPosition.lat,
        lng: currentUserPosition.lng,
        name: 'Current Position'
    };

    try {
        const response = await fetch(`${API_BASE_URL}/api/routes/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start: { lat: newStart.lat, lng: newStart.lng },
                destination: { lat: destinationLocation.lat, lng: destinationLocation.lng }
            })
        });

        if (!response.ok) throw new Error('Recalculation failed');

        const data = await response.json();

        if (data.success && data.routes.safest) {
            const route = data.routes.safest;
            currentRoute = route;
            routeCoordinates = route.polyline ? decodePolyline(route.polyline) : [];
            routeSteps = route.steps || [];
            currentStepIndex = 0;

            // Redraw route on navigation map
            removePolylines(navOmbreRoutePolylines);
            navOmbreRoutePolylines = drawBasicRoute(
                navigationMap,
                routeCoordinates,
                0.8,
                false,
                '#4285f4'
            );

            // Update route data
            currentRouteData.distance = metersToMiles(route.distanceMeters);
            currentRouteData.duration = secondsToMinutes(route.durationSeconds);
            currentRouteData.distanceText = formatDistance(currentRouteData.distance);
            currentRouteData.durationText = formatDuration(currentRouteData.duration);
        }

        isRecalculating = false;
        updateNavigationStatus('ACTIVE ROUTE', true);
        updateNavigationUI();

    } catch (error) {
        console.error('❌ Recalculation failed:', error);
        isRecalculating = false;
        updateNavigationStatus('Recalculation failed', false);
    }
}

function updateNavigationMap() {
    if (!navigationMap || !currentUserPosition) return;

    // Update or create navigation marker
    if (navigationMarker) {
        updateMarkerPosition(navigationMarker, currentUserPosition.lat, currentUserPosition.lng);
    } else {
        showCurrentLocationOnMap(navigationMap, currentUserPosition.lat, currentUserPosition.lng,
            currentUserPosition.accuracy, {
                getMarker: () => navigationMarker,
                setMarker: (m) => { navigationMarker = m; }
            });
    }

    // Center map on user
    navigationMap.panTo({ lat: currentUserPosition.lat, lng: currentUserPosition.lng });
}

function updateNavigationUI() {
    if (!isNavigating) return;

    // Update trip sharing UI
    const tripSharingBanner = document.getElementById('trip-sharing-banner');
    const tripActionButtons = document.getElementById('trip-action-buttons');
    const activeTrip = getActiveTrip();

    if (tripSharingBanner && tripActionButtons) {
        const showTripUI = activeTrip && !isPreviewMode;
        tripSharingBanner.style.display = showTripUI ? 'flex' : 'none';
        tripActionButtons.style.display = showTripUI ? 'flex' : 'none';
    }

    // Update banner
    const statusText = document.getElementById('nav-status-text');
    if (statusText) {
        statusText.textContent = isPreviewMode ? 'ROUTE PREVIEW' : 'ACTIVE ROUTE';
    }

    // Update step counter
    const stepCounter = document.getElementById('step-counter');
    if (stepCounter) {
        stepCounter.textContent = `Step ${currentStepIndex + 1} of ${routeSteps.length}`;
        stepCounter.style.display = isPreviewMode ? 'block' : 'none';
    }

    // Show/hide preview buttons
    const prevBtn = document.getElementById('btn-prev-step');
    const nextBtn = document.getElementById('btn-next-step');
    if (prevBtn && nextBtn) {
        prevBtn.style.display = isPreviewMode ? 'inline-block' : 'none';
        nextBtn.style.display = isPreviewMode ? 'inline-block' : 'none';
        prevBtn.disabled = currentStepIndex === 0;
        nextBtn.disabled = currentStepIndex >= routeSteps.length - 1;
    }

    // Get current step
    const currentStep = routeSteps[currentStepIndex];
    const nextStepData = currentStepIndex + 1 < routeSteps.length ? routeSteps[currentStepIndex + 1] : null;

    if (currentStep) {
        // Update distance display
        const distanceElement = document.getElementById('instruction-distance');
        if (distanceElement) {
            if (isPreviewMode) {
                const stepDistance = currentStep.distance || 0;
                const stepDistanceMiles = stepDistance / 1609.34;
                if (stepDistanceMiles < 0.1) {
                    distanceElement.textContent = `${Math.round(stepDistanceMiles * 5280)} ft`;
                } else {
                    distanceElement.textContent = `${stepDistanceMiles.toFixed(1)} mi`;
                }
            } else if (currentUserPosition && currentStep.latLng) {
                const distanceToNext = calculateDistance(
                    currentUserPosition.lat,
                    currentUserPosition.lng,
                    currentStep.latLng.lat,
                    currentStep.latLng.lng
                );
                if (distanceToNext < 0.1) {
                    distanceElement.textContent = `in ${Math.round(distanceToNext * 5280)} ft`;
                } else {
                    distanceElement.textContent = `in ${distanceToNext.toFixed(1)} mi`;
                }
            }
        }

        // Update instructions
        const currentInstruction = document.getElementById('instruction-current');
        if (currentInstruction) {
            currentInstruction.textContent = currentStep.text || currentStep.instruction || 'Continue';
        }

        const nextInstruction = document.getElementById('instruction-next');
        if (nextInstruction) {
            if (nextStepData) {
                nextInstruction.textContent = `Then ${nextStepData.text || nextStepData.instruction || 'continue'}`;
            } else {
                nextInstruction.textContent = 'Destination ahead';
            }
        }
    }

    updateNavigationStats();

    // Update preview mode UI elements (rate button visibility)
    updatePreviewModeUI();
}

function updateNavigationStats() {
    if (currentUserPosition && destinationLocation) {
        const remainingDistance = calculateDistance(
            currentUserPosition.lat,
            currentUserPosition.lng,
            destinationLocation.lat,
            destinationLocation.lng
        );

        const walkingSpeedMph = 3;
        const remainingTimeMinutes = (remainingDistance / walkingSpeedMph) * 60;

        const navDistanceElement = document.getElementById('nav-distance');
        if (navDistanceElement) {
            navDistanceElement.textContent = formatDistance(remainingDistance);
        }

        const navDurationElement = document.getElementById('nav-duration');
        if (navDurationElement) {
            navDurationElement.textContent = formatDuration(remainingTimeMinutes);
        }

        // Auto-detect arrival when within ~100 feet (0.02 miles) of destination
        // Only trigger if actively navigating (not in preview mode)
        if (isNavigating && !isPreviewMode && remainingDistance < 0.02) {
            console.log('[Navigation] Auto-detected arrival - within 100ft of destination');
            handleArrival();
        }
    }
}

function updateNavigationStatus(text, isActive) {
    const statusText = document.getElementById('nav-status-text');
    if (statusText) {
        statusText.textContent = text;
    }

    const statusDot = document.getElementById('nav-status-dot');
    if (statusDot) {
        statusDot.classList.toggle('active', isActive);
    }
}

function handleArrival() {
    console.log('[PinkPath] Arrived at destination!');

    if (navigationWatchId) {
        navigator.geolocation.clearWatch(navigationWatchId);
        navigationWatchId = null;
    }

    isNavigating = false;

    updateNavigationStatus('ARRIVED', true);

    const distanceEl = document.getElementById('instruction-distance');
    const currentEl = document.getElementById('instruction-current');
    const nextEl = document.getElementById('instruction-next');

    if (distanceEl) distanceEl.textContent = 'Arrived!';
    if (currentEl) currentEl.textContent = 'You have reached your destination';
    if (nextEl) nextEl.textContent = '';

    // End trip as arrived
    const activeTrip = getActiveTrip();
    if (activeTrip) {
        endTrip('arrived');
    }

    // Show arrival celebration modal after a brief delay
    setTimeout(() => {
        showArrivalCelebration();
    }, 1000);
}

/**
 * Show the arrival celebration screen
 */
function showArrivalCelebration() {
    console.log('[PinkPath] Showing arrival celebration...');

    // Set up rating context with current route info
    const currentRoute = routeOptions[selectedRouteIndex];
    if (selectedStart && selectedDestination) {
        setRatingContext({
            startLat: selectedStart.lat,
            startLng: selectedStart.lng,
            endLat: selectedDestination.lat,
            endLng: selectedDestination.lng,
            polyline: currentRoute?.polyline || null,
            wasPreviewMode: isPreviewMode,
        });
    }

    // Reset modal state
    resetRatingModal();

    // Show celebration, hide other sections
    const celebration = document.getElementById('arrival-celebration');
    const authGate = document.getElementById('rating-auth-gate');
    const ratingForm = document.getElementById('rating-form');
    const ratingSuccess = document.getElementById('rating-success');
    const modalTitle = document.getElementById('rating-modal-title');

    if (celebration) celebration.style.display = 'block';
    if (authGate) authGate.style.display = 'none';
    if (ratingForm) ratingForm.style.display = 'none';
    if (ratingSuccess) ratingSuccess.style.display = 'none';
    if (modalTitle) modalTitle.textContent = "You've Arrived!";

    openModal('route-rating-modal');
}

/**
 * Show the rating form (after celebration or directly)
 */
function showRatingForm() {
    console.log('[PinkPath] Showing rating form...');

    const { isLoggedIn } = getAuthState();
    const celebration = document.getElementById('arrival-celebration');
    const authGate = document.getElementById('rating-auth-gate');
    const ratingForm = document.getElementById('rating-form');
    const ratingSuccess = document.getElementById('rating-success');
    const modalTitle = document.getElementById('rating-modal-title');

    if (celebration) celebration.style.display = 'none';
    if (ratingSuccess) ratingSuccess.style.display = 'none';
    if (modalTitle) modalTitle.textContent = 'Rate Your Route';

    if (isLoggedIn) {
        if (authGate) authGate.style.display = 'none';
        if (ratingForm) ratingForm.style.display = 'block';
    } else {
        if (authGate) authGate.style.display = 'block';
        if (ratingForm) ratingForm.style.display = 'none';
    }
}

/**
 * Show the route rating modal (legacy - now shows celebration first)
 * Sets up rating context and displays appropriate view based on auth state
 */
function showRatingModal() {
    console.log('[PinkPath] Showing rating modal...');

    // Set up rating context with current route info
    const currentRoute = routeOptions[selectedRouteIndex];
    if (selectedStart && selectedDestination) {
        setRatingContext({
            startLat: selectedStart.lat,
            startLng: selectedStart.lng,
            endLat: selectedDestination.lat,
            endLng: selectedDestination.lng,
            polyline: currentRoute?.polyline || null,
            wasPreviewMode: isPreviewMode,
        });
    }

    // Reset modal state
    resetRatingModal();

    // Check auth state and show appropriate view
    const { isLoggedIn } = getAuthState();
    const celebration = document.getElementById('arrival-celebration');
    const authGate = document.getElementById('rating-auth-gate');
    const ratingForm = document.getElementById('rating-form');
    const ratingSuccess = document.getElementById('rating-success');

    if (celebration) celebration.style.display = 'none';
    if (authGate) authGate.style.display = isLoggedIn ? 'none' : 'block';
    if (ratingForm) ratingForm.style.display = isLoggedIn ? 'block' : 'none';
    if (ratingSuccess) ratingSuccess.style.display = 'none';

    openModal('route-rating-modal');
}

/**
 * Reset rating modal to initial state
 */
function resetRatingModal() {
    // Clear star selection
    document.querySelectorAll('.star-btn').forEach(btn => {
        btn.classList.remove('filled', 'active');
    });

    // Reset star rating label
    const starLabel = document.getElementById('star-rating-label');
    if (starLabel) {
        starLabel.textContent = 'Tap to rate';
        starLabel.removeAttribute('data-rating');
    }

    // Hide reasons section
    const reasonsSection = document.getElementById('rating-reasons');
    if (reasonsSection) reasonsSection.style.display = 'none';

    // Clear reason chips
    const reasonChips = document.getElementById('reason-chips');
    if (reasonChips) reasonChips.innerHTML = '';

    // Clear comment
    const commentInput = document.getElementById('rating-comment-input');
    if (commentInput) commentInput.value = '';
    updateCommentCharCount();

    // Disable submit button
    const submitBtn = document.getElementById('submit-rating-btn');
    if (submitBtn) submitBtn.disabled = true;

    // Reset selected rating state
    window._selectedRating = null;
    window._selectedStarRating = null;
    window._selectedReasons = [];
}

/**
 * Handle star rating selection
 */
function handleStarRating(starBtn) {
    const rating = parseInt(starBtn.dataset.rating);
    console.log('[Rating] Star rating:', rating);

    // Update visual - fill stars up to selected
    document.querySelectorAll('.star-btn').forEach(btn => {
        const btnRating = parseInt(btn.dataset.rating);
        btn.classList.toggle('filled', btnRating <= rating);
        btn.classList.remove('active');
    });
    starBtn.classList.add('active');

    // Store selected rating
    window._selectedStarRating = rating;

    // Map star rating to safe/unsafe/neutral for reason chips
    let ratingType;
    if (rating <= 2) {
        ratingType = 'unsafe';
    } else if (rating === 3) {
        ratingType = 'neutral';
    } else {
        ratingType = 'safe';
    }
    window._selectedRating = ratingType;
    window._selectedReasons = [];

    // Update label
    const labels = {
        1: 'Very Unsafe',
        2: 'Felt Unsafe',
        3: 'Neutral',
        4: 'Felt Safe',
        5: 'Very Safe'
    };
    const starLabel = document.getElementById('star-rating-label');
    if (starLabel) {
        starLabel.textContent = labels[rating];
        starLabel.setAttribute('data-rating', rating);
    }

    // Show reason chips
    showReasonChips(ratingType);

    // Enable submit button
    const submitBtn = document.getElementById('submit-rating-btn');
    if (submitBtn) submitBtn.disabled = false;
}

/**
 * Handle star hover effect
 */
function handleStarHover(starBtn, isHovering) {
    if (window._selectedStarRating) return; // Don't change if already selected

    const rating = parseInt(starBtn.dataset.rating);

    document.querySelectorAll('.star-btn').forEach(btn => {
        const btnRating = parseInt(btn.dataset.rating);
        if (isHovering) {
            btn.classList.toggle('filled', btnRating <= rating);
        } else {
            btn.classList.remove('filled');
        }
    });
}

/**
 * Handle rating option selection (legacy 3-level - kept for compatibility)
 */
function handleRatingSelection(option) {
    const rating = option.dataset.rating;
    console.log('[Rating] Selected:', rating);

    // Update visual selection
    document.querySelectorAll('.rating-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    option.classList.add('selected');

    // Store selected rating
    window._selectedRating = rating;
    window._selectedReasons = [];

    // Show reason chips for this rating
    showReasonChips(rating);

    // Enable submit button
    const submitBtn = document.getElementById('submit-rating-btn');
    if (submitBtn) submitBtn.disabled = false;
}

/**
 * Show reason chips based on selected rating
 */
function showReasonChips(rating) {
    const reasonsSection = document.getElementById('rating-reasons');
    const reasonChips = document.getElementById('reason-chips');

    if (!reasonsSection || !reasonChips) return;

    reasonsSection.style.display = 'block';
    reasonChips.innerHTML = '';

    const categories = getCategoriesForRating(rating);
    categories.forEach(cat => {
        const chip = document.createElement('button');
        chip.className = 'reason-chip';
        chip.textContent = cat.label;
        chip.dataset.code = cat.code;
        chip.addEventListener('click', () => toggleReasonChip(chip, cat.code));
        reasonChips.appendChild(chip);
    });
}

/**
 * Toggle a reason chip selection
 */
function toggleReasonChip(chip, code) {
    chip.classList.toggle('selected');

    if (chip.classList.contains('selected')) {
        if (!window._selectedReasons.includes(code)) {
            window._selectedReasons.push(code);
        }
    } else {
        window._selectedReasons = window._selectedReasons.filter(c => c !== code);
    }
}

/**
 * Update comment character count
 */
function updateCommentCharCount() {
    const input = document.getElementById('rating-comment-input');
    const counter = document.getElementById('comment-char-count');
    if (input && counter) {
        counter.textContent = input.value.length;
    }
}

/**
 * Handle rating submission
 */
async function handleRatingSubmit() {
    if (!window._selectedRating && !window._selectedStarRating) {
        console.log('[Rating] No rating selected');
        return;
    }

    const submitBtn = document.getElementById('submit-rating-btn');
    const commentInput = document.getElementById('rating-comment-input');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }

    const ratingData = {
        rating: window._selectedRating,
        starRating: window._selectedStarRating || null,
        reasons: window._selectedReasons || [],
        comment: commentInput?.value || null,
    };

    console.log('[Rating] Submitting:', ratingData);

    const result = await submitRouteRating(ratingData);

    if (result.success) {
        console.log('[Rating] Submitted successfully:', result.ratingId);
        showRatingSuccess();
    } else {
        console.error('[Rating] Submission failed:', result.error);

        // Check if offline or network error - offer to save for later
        if (isCurrentlyOffline() || result.code === 'NETWORK_ERROR' || result.code === 'TIMEOUT_ERROR') {
            const saved = savePendingSubmission('rating', {
                ...ratingData,
                context: getRatingContext(),
            });

            if (saved) {
                showGlobalToast('Rating saved. Will submit when back online.', 'warning');
                showRatingSuccess(); // Close modal
            } else {
                showGlobalToast('Failed to save rating. Please try again.', 'error');
            }
        } else {
            showGlobalToast('Failed to submit rating: ' + result.error, 'error');
        }

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Rating';
        }
    }
}

/**
 * Show rating success message
 */
function showRatingSuccess() {
    const ratingForm = document.getElementById('rating-form');
    const ratingSuccess = document.getElementById('rating-success');

    if (ratingForm) ratingForm.style.display = 'none';
    if (ratingSuccess) ratingSuccess.style.display = 'block';
}

/**
 * Close rating modal and clean up
 */
function closeRatingModal() {
    closeModal('route-rating-modal');
    clearRatingContext();

    // Return to results screen if we were navigating
    if (document.getElementById('screen-active-navigation').classList.contains('active')) {
        endNavigation();
    }
}

// ========================================
// SEGMENT PIN PANEL
// ========================================

// Pin panel state
let pinPanelMapListener = null;
let selectedPinLocation = null;
let selectedPinCategory = null;
let selectedPinType = null;

/**
 * Open the segment pin panel
 */
function openPinPanel() {
    console.log('[Pin] Opening pin panel...');

    // Check auth
    if (!canSubmitRating()) {
        alert('Please sign in to add safety notes');
        return;
    }

    const panel = document.getElementById('segment-pin-panel');
    if (panel) {
        panel.style.display = 'block';
        populatePinChips();
        resetPinPanel();

        // Enable map click for pin location
        if (navigationMap) {
            pinPanelMapListener = navigationMap.addListener('click', handleMapClickForPin);
        }
    }
}

/**
 * Close the segment pin panel
 */
function closePinPanel() {
    const panel = document.getElementById('segment-pin-panel');
    if (panel) panel.style.display = 'none';

    // Remove map click listener
    if (pinPanelMapListener) {
        google.maps.event.removeListener(pinPanelMapListener);
        pinPanelMapListener = null;
    }

    resetPinPanel();
}

/**
 * Reset pin panel state
 */
function resetPinPanel() {
    selectedPinLocation = null;
    selectedPinCategory = null;
    selectedPinType = null;

    const locationPreview = document.getElementById('pin-location-preview');
    if (locationPreview) locationPreview.style.display = 'none';

    document.querySelectorAll('.pin-chip').forEach(chip => {
        chip.classList.remove('selected');
    });

    const submitBtn = document.getElementById('submit-pin-btn');
    if (submitBtn) submitBtn.disabled = true;
}

/**
 * Populate pin category chips
 */
function populatePinChips() {
    const safeChips = document.getElementById('safe-pin-chips');
    const cautionChips = document.getElementById('caution-pin-chips');

    if (!safeChips || !cautionChips) return;

    const categories = getCategoriesForRating('neutral'); // Get all categories

    // Clear existing
    safeChips.innerHTML = '';
    cautionChips.innerHTML = '';

    // Add safe chips
    const safeCategories = getCategoriesForRating('safe');
    safeCategories.forEach(cat => {
        const chip = document.createElement('button');
        chip.className = 'pin-chip safe';
        chip.textContent = cat.label;
        chip.dataset.code = cat.code;
        chip.dataset.type = 'safe';
        chip.addEventListener('click', () => selectPinCategory(chip, cat.code, 'safe'));
        safeChips.appendChild(chip);
    });

    // Add caution chips
    const cautionCategories = getCategoriesForRating('unsafe');
    cautionCategories.forEach(cat => {
        const chip = document.createElement('button');
        chip.className = 'pin-chip caution';
        chip.textContent = cat.label;
        chip.dataset.code = cat.code;
        chip.dataset.type = 'caution';
        chip.addEventListener('click', () => selectPinCategory(chip, cat.code, 'caution'));
        cautionChips.appendChild(chip);
    });
}

/**
 * Handle map click for pin placement
 */
function handleMapClickForPin(event) {
    selectedPinLocation = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
    };

    console.log('[Pin] Location selected:', selectedPinLocation);

    const locationPreview = document.getElementById('pin-location-preview');
    const coordsDisplay = document.getElementById('pin-coords');

    if (locationPreview) locationPreview.style.display = 'flex';
    if (coordsDisplay) {
        coordsDisplay.textContent = `${selectedPinLocation.lat.toFixed(5)}, ${selectedPinLocation.lng.toFixed(5)}`;
    }

    updatePinSubmitButton();
}

/**
 * Clear selected pin location
 */
function clearPinLocation() {
    selectedPinLocation = null;

    const locationPreview = document.getElementById('pin-location-preview');
    if (locationPreview) locationPreview.style.display = 'none';

    updatePinSubmitButton();
}

/**
 * Select a pin category
 */
function selectPinCategory(chip, code, type) {
    // Clear other selections
    document.querySelectorAll('.pin-chip').forEach(c => {
        c.classList.remove('selected');
    });

    chip.classList.add('selected');
    selectedPinCategory = code;
    selectedPinType = type;

    updatePinSubmitButton();
}

/**
 * Update pin submit button state
 */
function updatePinSubmitButton() {
    const submitBtn = document.getElementById('submit-pin-btn');
    if (submitBtn) {
        submitBtn.disabled = !(selectedPinLocation && selectedPinCategory);
    }
}

/**
 * Handle pin submission
 */
async function handlePinSubmit() {
    if (!selectedPinLocation || !selectedPinCategory) {
        console.log('[Pin] Missing location or category');
        return;
    }

    const submitBtn = document.getElementById('submit-pin-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';
    }

    const pinData = {
        lat: selectedPinLocation.lat,
        lng: selectedPinLocation.lng,
        pinType: selectedPinType,
        category: selectedPinCategory,
    };

    console.log('[Pin] Submitting:', pinData);

    const result = await submitSegmentPin(pinData);

    if (result.success) {
        console.log('[Pin] Added successfully:', result.pinId);

        // Add visual marker to map
        addPinMarkerToMap(pinData);

        // Reset and show success
        closePinPanel();
    } else {
        console.error('[Pin] Submission failed:', result.error);
        alert('Failed to add note: ' + result.error);
    }

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Note';
    }
}

/**
 * Add a visual marker for a submitted pin
 */
function addPinMarkerToMap(pinData) {
    if (!navigationMap) return;

    const color = pinData.pinType === 'safe' ? '#48bb78' : '#ed8936';

    const markerContent = document.createElement('div');
    markerContent.style.cssText = `
        width: 24px;
        height: 24px;
        background: ${color};
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: white;
        font-weight: bold;
    `;
    markerContent.innerHTML = pinData.pinType === 'safe' ? '&#10003;' : '!';

    new google.maps.marker.AdvancedMarkerElement({
        map: navigationMap,
        position: { lat: pinData.lat, lng: pinData.lng },
        content: markerContent,
        title: pinData.category,
    });
}

// ========================================
// HAZARD REPORTING MODAL
// ========================================

// Report modal state
let reportModalMapListener = null;
let selectedReportLocation = null;
let selectedHazardTypes = [];
let currentReportScope = 'spot';
let isHazardSelectionMode = false;
let hazardSelectionMarker = null;

/**
 * Get the active map for reporting based on current screen
 * @returns {google.maps.Map|null} The active map instance
 */
function getActiveMapForReporting() {
    // If navigating and navigation map exists, use it
    if (isNavigating && navigationMap) {
        return navigationMap;
    }
    // Otherwise use route map
    return routeMap;
}

/**
 * Enter hazard selection mode - Step 1 of two-step flow
 * Shows banner and enables map click to select hazard location
 * Only works on route preview or navigation screens
 */
function enterHazardSelectionMode() {
    console.log('[Report] Entering hazard selection mode...');

    // Verify user is on a valid screen (route preview or navigation)
    const routeScreen = document.getElementById('screen-route-results');
    const navScreen = document.getElementById('screen-active-navigation');
    const isOnValidScreen = (routeScreen && routeScreen.classList.contains('active')) ||
                            (navScreen && navScreen.classList.contains('active'));

    if (!isOnValidScreen) {
        console.warn('[Report] Cannot enter selection mode - not on route or navigation screen');
        return;
    }

    // Check auth first
    if (!canSubmitReport()) {
        // Open modal to show auth gate
        openReportModal();
        return;
    }

    // Get active map - must exist to enter selection mode
    const activeMap = getActiveMapForReporting();
    if (!activeMap) {
        console.warn('[Report] Cannot enter selection mode - no active map');
        return;
    }

    // Set selection mode state
    isHazardSelectionMode = true;

    // Show the selection banner
    const banner = document.getElementById('hazard-selection-banner');
    if (banner) {
        banner.classList.add('visible');
    }

    // Enable map click listener on active map
    // Remove any existing listener first
    if (reportModalMapListener) {
        google.maps.event.removeListener(reportModalMapListener);
    }
    reportModalMapListener = activeMap.addListener('click', handleHazardLocationSelect);

    // Close mobile menu if open
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu && mobileMenu.classList.contains('open')) {
        mobileMenu.classList.remove('open');
    }
}

/**
 * Exit hazard selection mode without selecting a location
 */
function exitHazardSelectionMode() {
    console.log('[Report] Exiting hazard selection mode...');

    isHazardSelectionMode = false;

    // Hide the selection banner
    const banner = document.getElementById('hazard-selection-banner');
    if (banner) {
        banner.classList.remove('visible');
    }

    // Remove map click listener
    if (reportModalMapListener) {
        google.maps.event.removeListener(reportModalMapListener);
        reportModalMapListener = null;
    }

    // Remove any temporary marker
    if (hazardSelectionMarker) {
        hazardSelectionMarker.setMap(null);
        hazardSelectionMarker = null;
    }

    // Reset selected location
    selectedReportLocation = null;
}

/**
 * Handle map click during hazard selection mode - Step 2 of two-step flow
 * Places marker and opens modal with location pre-filled
 */
function handleHazardLocationSelect(event) {
    // Store the selected location
    selectedReportLocation = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
    };

    console.log('[Report] Hazard location selected:', selectedReportLocation);

    // Get the active map
    const activeMap = getActiveMapForReporting();

    // Remove any existing selection marker
    if (hazardSelectionMarker) {
        hazardSelectionMarker.setMap(null);
    }

    // Create a marker at the selected location
    if (activeMap) {
        hazardSelectionMarker = new google.maps.Marker({
            position: event.latLng,
            map: activeMap,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: '#FF1493',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3,
            },
            title: 'Hazard Location',
            zIndex: 1000,
        });
    }

    // Exit selection mode (hides banner, removes listener)
    isHazardSelectionMode = false;
    const banner = document.getElementById('hazard-selection-banner');
    if (banner) {
        banner.classList.remove('visible');
    }
    if (reportModalMapListener) {
        google.maps.event.removeListener(reportModalMapListener);
        reportModalMapListener = null;
    }

    // Open the report modal with location pre-filled
    openReportModal();
}

/**
 * Open the hazard report modal
 * If selectedReportLocation is already set (from two-step flow), uses that location
 */
function openReportModal() {
    console.log('[Report] Opening report modal...');

    const modal = document.getElementById('report-hazard-modal');
    if (!modal) return;

    // Check if we have a pre-selected location from the two-step flow
    const hasPreselectedLocation = selectedReportLocation !== null;

    // Check auth state
    const authGate = document.getElementById('report-auth-gate');
    const reportForm = document.getElementById('report-form');
    const reportSuccess = document.getElementById('report-success');

    if (canSubmitReport()) {
        authGate.style.display = 'none';
        reportForm.style.display = 'block';
        reportSuccess.style.display = 'none';

        // Set report context from current route
        if (currentRoute) {
            setReportContext({
                startLat: currentRoute.startLat || currentRoute.legs?.[0]?.start_location?.lat(),
                startLng: currentRoute.startLng || currentRoute.legs?.[0]?.start_location?.lng(),
                endLat: currentRoute.endLat || currentRoute.legs?.[0]?.end_location?.lat(),
                endLng: currentRoute.endLng || currentRoute.legs?.[0]?.end_location?.lng(),
                polyline: currentRoute.polyline || currentRoute.overview_polyline?.points,
                wasPreviewMode: isPreviewMode,
            });
        }

        populateHazardTypes();

        // Only reset if we don't have a pre-selected location
        if (hasPreselectedLocation) {
            // Reset form fields but keep the location
            selectedHazardTypes = [];
            currentReportScope = 'spot';

            // Reset hazard type checkboxes
            document.querySelectorAll('.hazard-type-option input').forEach(checkbox => {
                checkbox.checked = false;
            });

            // Reset severity to medium
            const mediumSeverity = document.querySelector('input[name="report-severity"][value="medium"]');
            if (mediumSeverity) mediumSeverity.checked = true;

            // Clear comment
            const commentInput = document.getElementById('report-comment-input');
            if (commentInput) commentInput.value = '';
            updateReportCommentCharCount();

            // Show the pre-selected location in the preview
            const locationPreview = document.getElementById('report-location-preview');
            const coordsDisplay = document.getElementById('report-location-coords');
            const locationHint = document.querySelector('.location-hint');

            if (locationPreview) locationPreview.style.display = 'flex';
            if (coordsDisplay) {
                coordsDisplay.textContent = `${selectedReportLocation.lat.toFixed(5)}, ${selectedReportLocation.lng.toFixed(5)}`;
            }
            // Hide the "tap the map" hint since location is already selected
            if (locationHint) locationHint.style.display = 'none';

            // Update submit button state
            updateReportSubmitButton();
        } else {
            resetReportModal();
        }
    } else {
        authGate.style.display = 'block';
        reportForm.style.display = 'none';
        reportSuccess.style.display = 'none';
    }

    openModal('report-hazard-modal');

    // Only add map click listener if we don't have a pre-selected location
    // (In two-step flow, location is already selected)
    if (!hasPreselectedLocation) {
        const activeMap = getActiveMapForReporting();
        if (activeMap && currentReportScope === 'spot') {
            reportModalMapListener = activeMap.addListener('click', handleMapClickForReport);
        }
    }
}

/**
 * Close the hazard report modal
 */
function closeReportModal() {
    closeModal('report-hazard-modal');

    // Remove map click listener
    if (reportModalMapListener) {
        google.maps.event.removeListener(reportModalMapListener);
        reportModalMapListener = null;
    }

    // Remove hazard selection marker from map
    if (hazardSelectionMarker) {
        hazardSelectionMarker.setMap(null);
        hazardSelectionMarker = null;
    }

    // Reset location hint visibility
    const locationHint = document.querySelector('.location-hint');
    if (locationHint) locationHint.style.display = '';

    // Exit selection mode if still active
    if (isHazardSelectionMode) {
        exitHazardSelectionMode();
    }

    resetReportModal();
}

/**
 * Reset report modal state
 */
function resetReportModal() {
    selectedReportLocation = null;
    selectedHazardTypes = [];
    currentReportScope = 'spot';

    // Reset scope selection
    const spotRadio = document.querySelector('input[name="report-scope"][value="spot"]');
    if (spotRadio) spotRadio.checked = true;

    // Show spot location section
    const spotSection = document.getElementById('spot-location-section');
    if (spotSection) spotSection.style.display = 'block';

    // Hide location preview
    const locationPreview = document.getElementById('report-location-preview');
    if (locationPreview) locationPreview.style.display = 'none';

    // Reset hazard type checkboxes
    document.querySelectorAll('.hazard-type-option input').forEach(checkbox => {
        checkbox.checked = false;
    });

    // Reset severity to medium
    const mediumSeverity = document.querySelector('input[name="report-severity"][value="medium"]');
    if (mediumSeverity) mediumSeverity.checked = true;

    // Clear comment
    const commentInput = document.getElementById('report-comment-input');
    if (commentInput) commentInput.value = '';
    updateReportCommentCharCount();

    // Disable submit button
    const submitBtn = document.getElementById('submit-report-btn');
    if (submitBtn) submitBtn.disabled = true;
}

/**
 * Populate hazard type checkboxes
 */
function populateHazardTypes() {
    const grid = document.getElementById('hazard-types-grid');
    if (!grid) return;

    const categories = getHazardCategories();

    grid.innerHTML = '';

    categories.forEach(cat => {
        const label = document.createElement('label');
        label.className = 'hazard-type-option';

        label.innerHTML = `
            <input type="checkbox" value="${cat.code}" data-severity="${cat.severity_default}">
            <span class="hazard-type-content">
                <span class="hazard-type-icon">${cat.icon || '⚠️'}</span>
                <span class="hazard-type-label">${cat.label}</span>
            </span>
        `;

        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', () => handleHazardTypeChange(checkbox));

        grid.appendChild(label);
    });
}

/**
 * Handle hazard type checkbox change
 */
function handleHazardTypeChange(checkbox) {
    if (checkbox.checked) {
        selectedHazardTypes.push(checkbox.value);
    } else {
        selectedHazardTypes = selectedHazardTypes.filter(t => t !== checkbox.value);
    }

    updateReportSubmitButton();
}

/**
 * Handle report scope change (spot vs route)
 */
function handleReportScopeChange(event) {
    currentReportScope = event.target.value;

    const spotSection = document.getElementById('spot-location-section');

    if (currentReportScope === 'spot') {
        if (spotSection) spotSection.style.display = 'block';

        // Enable map click on active map
        const activeMap = getActiveMapForReporting();
        if (activeMap && !reportModalMapListener) {
            reportModalMapListener = activeMap.addListener('click', handleMapClickForReport);
        }
    } else {
        if (spotSection) spotSection.style.display = 'none';

        // Remove map click listener
        if (reportModalMapListener) {
            google.maps.event.removeListener(reportModalMapListener);
            reportModalMapListener = null;
        }
    }

    updateReportSubmitButton();
}

/**
 * Handle map click for report location selection
 */
function handleMapClickForReport(event) {
    selectedReportLocation = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
    };

    console.log('[Report] Location selected:', selectedReportLocation);

    const locationPreview = document.getElementById('report-location-preview');
    const coordsDisplay = document.getElementById('report-location-coords');

    if (locationPreview) locationPreview.style.display = 'flex';
    if (coordsDisplay) {
        coordsDisplay.textContent = `${selectedReportLocation.lat.toFixed(5)}, ${selectedReportLocation.lng.toFixed(5)}`;
    }

    updateReportSubmitButton();
}

/**
 * Clear selected report location
 */
function clearReportLocation() {
    selectedReportLocation = null;

    const locationPreview = document.getElementById('report-location-preview');
    if (locationPreview) locationPreview.style.display = 'none';

    updateReportSubmitButton();
}

/**
 * Update report comment character count
 */
function updateReportCommentCharCount() {
    const input = document.getElementById('report-comment-input');
    const counter = document.getElementById('report-char-count');

    if (input && counter) {
        counter.textContent = input.value.length;
    }
}

/**
 * Update report submit button state
 */
function updateReportSubmitButton() {
    const submitBtn = document.getElementById('submit-report-btn');
    if (!submitBtn) return;

    let canSubmit = selectedHazardTypes.length > 0;

    // For spot reports, also require location
    if (currentReportScope === 'spot' && !selectedReportLocation) {
        canSubmit = false;
    }

    // For route reports, require report context
    if (currentReportScope === 'route' && !getReportContext()) {
        canSubmit = false;
    }

    submitBtn.disabled = !canSubmit;
}

/**
 * Handle report submission
 */
async function handleReportSubmit() {
    if (selectedHazardTypes.length === 0) {
        console.log('[Report] No hazard types selected');
        return;
    }

    const submitBtn = document.getElementById('submit-report-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }

    const severity = document.querySelector('input[name="report-severity"]:checked')?.value || 'medium';
    const comment = document.getElementById('report-comment-input')?.value || '';

    const reportData = {
        reportScope: currentReportScope,
        hazardTypes: selectedHazardTypes,
        severity: severity,
        comment: comment,
    };

    // Add location for spot reports
    if (currentReportScope === 'spot') {
        reportData.location = selectedReportLocation;
    }

    console.log('[Report] Submitting:', reportData);

    const result = await submitHazardReport(reportData);

    if (result.success) {
        console.log('[Report] Submitted successfully:', result.reportId);

        // Show success state
        const reportForm = document.getElementById('report-form');
        const reportSuccess = document.getElementById('report-success');

        if (reportForm) reportForm.style.display = 'none';
        if (reportSuccess) reportSuccess.style.display = 'block';

        // Add visual marker to map for spot reports
        if (currentReportScope === 'spot' && selectedReportLocation) {
            addHazardMarkerToMap(selectedReportLocation, selectedHazardTypes);
        }
    } else {
        console.error('[Report] Submission failed:', result.error);

        // Check if offline or network error - offer to save for later
        if (isCurrentlyOffline() || result.code === 'NETWORK_ERROR' || result.code === 'TIMEOUT_ERROR') {
            const saved = savePendingSubmission('report', {
                ...reportData,
                context: getReportContext(),
            });

            if (saved) {
                showGlobalToast('Report saved. Will submit when back online.', 'warning');
                // Show success state anyway - user did their part
                const reportForm = document.getElementById('report-form');
                const reportSuccess = document.getElementById('report-success');
                if (reportForm) reportForm.style.display = 'none';
                if (reportSuccess) reportSuccess.style.display = 'block';
            } else {
                showGlobalToast('Failed to save report. Please try again.', 'error');
            }
        } else {
            showGlobalToast('Failed to submit report: ' + result.error, 'error');
        }
    }

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
    }
}

/**
 * Add a visual marker for a submitted hazard report
 */
function addHazardMarkerToMap(location, hazardTypes) {
    const mapToUse = routeMap || navigationMap;
    if (!mapToUse) return;

    const markerContent = document.createElement('div');
    markerContent.style.cssText = `
        width: 28px;
        height: 28px;
        background: #dc143c;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        color: white;
        font-weight: bold;
    `;
    markerContent.innerHTML = '!';

    new google.maps.marker.AdvancedMarkerElement({
        map: mapToUse,
        position: { lat: location.lat, lng: location.lng },
        content: markerContent,
        title: hazardTypes.join(', '),
    });
}

/**
 * Update navigation UI elements
 * Rate button is now always visible (both preview and live modes)
 */
function updatePreviewModeUI() {
    const rateBtn = document.getElementById('rate-route-preview-btn');
    if (rateBtn) {
        // Always show rate button during navigation (preview or live)
        rateBtn.style.display = 'flex';
    }
}

function endNavigation() {
    console.log('🛑 Ending navigation...');

    if (navigationWatchId) {
        navigator.geolocation.clearWatch(navigationWatchId);
        navigationWatchId = null;
    }

    // End trip if active (ask user if they arrived or cancelled)
    const activeTrip = getActiveTrip();
    if (activeTrip) {
        // For now, assume cancelled when user manually ends
        // In Phase 6, we'll add a prompt asking if they arrived
        endTrip('cancelled');
    }

    isNavigating = false;
    isPreviewMode = false;
    currentStepIndex = 0;
    currentUserPosition = null;
    isRecalculating = false;

    // Clean up navigation map overlays
    removePolylines(navOmbreRoutePolylines);
    removePolylines(navAlternativeRoutePolylines);
    removeCrimeMarkers(navCrimeMarkersData);
    removeMarker(navigationMarker);

    navOmbreRoutePolylines = null;
    navAlternativeRoutePolylines = null;
    navCrimeMarkersData = null;
    navigationMarker = null;

    goToScreen('screen-route-results');
}

// ========================================
// TRIP SHARING ACTIONS
// ========================================

let checkInCooldown = false;

async function handleCheckIn() {
    if (checkInCooldown) {
        alert('Please wait before sending another check-in.');
        return;
    }

    const success = await sendCheckIn();
    if (success) {
        // Set 10-minute cooldown
        checkInCooldown = true;
        const checkInBtn = document.getElementById('check-in-btn');
        if (checkInBtn) {
            checkInBtn.disabled = true;
            checkInBtn.textContent = 'Sent!';
        }

        setTimeout(() => {
            checkInCooldown = false;
            if (checkInBtn) {
                checkInBtn.disabled = false;
                checkInBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    I'm OK
                `;
            }
        }, 10 * 60 * 1000); // 10 minutes
    }
}

async function handleArrived() {
    console.log('[Navigation] User tapped I Arrived button');

    // Stop GPS tracking
    if (navigationWatchId) {
        navigator.geolocation.clearWatch(navigationWatchId);
        navigationWatchId = null;
    }

    isNavigating = false;
    updateNavigationStatus('ARRIVED', true);

    // End trip as arrived
    await endTrip('arrived');

    // Show arrival celebration modal
    showArrivalCelebration();
}

/**
 * Handle share trip button from route preview screen
 * Works without sign-in - generates message from current route data
 */
function handleShareTripFromPreview() {
    if (!currentRouteData || !currentRouteData.safetyScore) {
        alert('No route to share. Please find a route first.');
        return;
    }

    // Get location names from input fields (same IDs used in startNavigation)
    const destination = document.getElementById('main-destination')?.value ||
        document.getElementById('destination-input')?.value ||
        'my destination';
    const origin = document.getElementById('main-start-location')?.value ||
        document.getElementById('start-input')?.value ||
        'my current location';
    const duration = currentRouteData.durationText || currentRouteData.duration || 'unknown';
    const safetyScore = currentRouteData.safetyScore || '--';

    // Calculate estimated arrival time
    let eta = 'soon';
    if (currentRouteData.durationValue) {
        const arrivalTime = new Date(Date.now() + currentRouteData.durationValue * 1000);
        eta = arrivalTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    // Build the share message
    const message = `I'm about to walk from ${origin} to ${destination}.

ETA: ${eta}
Walk time: ${duration}
Safety Score: ${safetyScore}/100

I'll let you know when I arrive safely!

Sent via PinkPath - the safety navigation app`;

    // Show the manual SMS modal
    showShareTripModal(message);
}

/**
 * Show share trip modal with message preview
 * @param {string} message - The message to share
 */
function showShareTripModal(message) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay manual-sms-modal';
    overlay.innerHTML = `
        <div class="modal-content">
            <h3 class="modal-title">Share your trip</h3>
            <p class="modal-description">
                Let someone know where you're going. We'll open your Messages app with this message ready to send.
            </p>
            <div class="sms-preview">
                <div class="sms-preview-label">Message preview:</div>
                <div class="sms-preview-text">${message.replace(/\n/g, '<br>')}</div>
            </div>
            <div class="modal-buttons">
                <button class="btn-secondary modal-skip-btn">Cancel</button>
                <button class="btn-primary modal-send-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                    </svg>
                    Open Messages
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Add event listeners
    const skipBtn = overlay.querySelector('.modal-skip-btn');
    const sendBtn = overlay.querySelector('.modal-send-btn');

    skipBtn.addEventListener('click', () => {
        overlay.remove();
    });

    sendBtn.addEventListener('click', () => {
        // Open SMS app with message
        const encodedMessage = encodeURIComponent(message);
        window.location.href = `sms:?body=${encodedMessage}`;
        overlay.remove();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

// ========================================
// ALERT CONTACTS
// ========================================

/**
 * Handle alert contacts button - sends a friendly trip notification
 * Works during route preview or active navigation
 */
function handleAlertContacts() {
    // Get destination from navigation or preview context
    let destination = 'my destination';
    let origin = 'my current location';
    let duration = '';
    let eta = '';

    // Try to get info from active navigation first
    if (isNavigating && currentRouteData) {
        destination = document.getElementById('main-destination')?.value ||
            document.getElementById('destination-input')?.value ||
            'my destination';
        origin = document.getElementById('main-start-location')?.value ||
            document.getElementById('start-input')?.value ||
            'my current location';
        duration = currentRouteData.durationText || currentRouteData.duration || '';

        if (currentRouteData.durationValue) {
            const arrivalTime = new Date(Date.now() + currentRouteData.durationValue * 1000);
            eta = arrivalTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }
    } else if (currentRouteData) {
        // Route preview context
        destination = document.getElementById('main-destination')?.value ||
            document.getElementById('destination-input')?.value ||
            'my destination';
        origin = document.getElementById('main-start-location')?.value ||
            document.getElementById('start-input')?.value ||
            'my current location';
        duration = currentRouteData.durationText || currentRouteData.duration || '';

        if (currentRouteData.durationValue) {
            const arrivalTime = new Date(Date.now() + currentRouteData.durationValue * 1000);
            eta = arrivalTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }
    }

    // Build the friendly alert message
    let message = `Hey! I'm using PinkPath to navigate safely.`;

    if (destination !== 'my destination') {
        message += `\n\nI'm heading to ${destination}`;
        if (origin !== 'my current location') {
            message += ` from ${origin}`;
        }
        message += `.`;
    }

    if (eta) {
        message += `\n\nExpected arrival: ${eta}`;
    }
    if (duration) {
        message += `\nWalk time: ${duration}`;
    }

    message += `\n\nI'll update you when I arrive!`;
    message += `\n\n- Sent via PinkPath`;

    // Show the alert modal
    showAlertContactsModal(message);
}

/**
 * Show alert contacts modal with message preview
 * @param {string} message - The message to send
 */
function showAlertContactsModal(message) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay manual-sms-modal';
    overlay.innerHTML = `
        <div class="modal-content">
            <h3 class="modal-title">Alert Your Contacts</h3>
            <p class="modal-description">
                Let someone know about your trip. We'll open your Messages app with this message ready to send.
            </p>
            <div class="sms-preview">
                <div class="sms-preview-label">Message preview:</div>
                <div class="sms-preview-text">${message.replace(/\n/g, '<br>')}</div>
            </div>
            <div class="modal-buttons">
                <button class="btn-secondary modal-skip-btn">Cancel</button>
                <button class="btn-primary modal-send-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                    </svg>
                    Open Messages
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Add event listeners
    const skipBtn = overlay.querySelector('.modal-skip-btn');
    const sendBtn = overlay.querySelector('.modal-send-btn');

    skipBtn.addEventListener('click', () => {
        overlay.remove();
    });

    sendBtn.addEventListener('click', () => {
        // Open SMS app with message
        const encodedMessage = encodeURIComponent(message);
        window.location.href = `sms:?body=${encodedMessage}`;
        overlay.remove();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

// ========================================
// FEATURE UPVOTE MODAL
// ========================================

/**
 * Show feature upvote modal for Coming Soon features
 * @param {string} featureKey - Unique key for the feature (e.g., 'alternative_routes')
 * @param {string} featureTitle - Display title for the feature
 * @param {string} featureDescription - Description of what the feature will do
 */
function showFeatureUpvoteModal(featureKey, featureTitle, featureDescription) {
    // Get current votes from localStorage
    const votesKey = 'pinkpath_feature_votes';
    let votes = JSON.parse(localStorage.getItem(votesKey) || '{}');
    const hasVoted = votes[featureKey]?.voted || false;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay feature-upvote-modal';
    overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <span class="coming-soon-badge">Coming Soon</span>
                <button class="modal-close-btn" aria-label="Close">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
            <h3 class="modal-title">${featureTitle}</h3>
            <p class="modal-description">${featureDescription}</p>
            <div class="upvote-section">
                <p class="upvote-prompt">${hasVoted ? 'Thanks for your vote!' : 'Want this feature? Let us know!'}</p>
                <button class="btn-upvote ${hasVoted ? 'upvoted' : ''}" ${hasVoted ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                        <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" transform="rotate(-90 12 12)"/>
                    </svg>
                    ${hasVoted ? 'Upvoted!' : 'Upvote this feature'}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Add event listeners
    const closeBtn = overlay.querySelector('.modal-close-btn');
    const upvoteBtn = overlay.querySelector('.btn-upvote');

    closeBtn.addEventListener('click', () => {
        overlay.remove();
    });

    if (!hasVoted) {
        upvoteBtn.addEventListener('click', async () => {
            // Record the vote in localStorage
            votes[featureKey] = {
                voted: true,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(votesKey, JSON.stringify(votes));

            // Update button state immediately
            upvoteBtn.classList.add('upvoted');
            upvoteBtn.disabled = true;
            upvoteBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                Upvoted!
            `;
            overlay.querySelector('.upvote-prompt').textContent = 'Thanks for your feedback!';

            console.log(`[Feature Vote] User upvoted: ${featureKey}`);

            // Send vote to server for analytics
            try {
                const sessionId = localStorage.getItem('pinkpath_session_id') || generateSessionId();
                await fetch(`${window.API_BASE_URL || 'http://localhost:3001'}/api/feedback/feature-votes`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(localStorage.getItem('pinkpath_token') && {
                            'Authorization': `Bearer ${localStorage.getItem('pinkpath_token')}`
                        })
                    },
                    body: JSON.stringify({
                        feature_key: featureKey,
                        session_id: sessionId
                    })
                });
            } catch (error) {
                // Don't fail the vote if server is unavailable
                console.warn('[Feature Vote] Failed to send to server:', error);
            }
        });
    }

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

// ========================================
// EMERGENCY ALERT
// ========================================

async function showEmergencyAlert() {
    const { isLoggedIn } = getAuthState();

    // Check if user is logged in
    if (!isLoggedIn) {
        const confirmed = confirm(
            '🚨 EMERGENCY ALERT 🚨\n\n' +
            'You are not signed in.\n\n' +
            'To send automatic alerts to emergency contacts, please sign in first.\n\n' +
            'Press OK to call 911, or Cancel to go back.'
        );
        if (confirmed) {
            window.location.href = 'tel:911';
        }
        return;
    }

    const confirmed = confirm(
        '🚨 EMERGENCY ALERT 🚨\n\n' +
        'This will immediately send your location to your emergency contacts.\n\n' +
        'Press OK to send SOS alert, or Cancel to go back.'
    );

    if (!confirmed) return;

    console.log('🚨 Emergency alert triggered!');

    // Get current position for SOS
    let lat = 0, lng = 0;
    if (currentUserPosition) {
        lat = currentUserPosition.lat;
        lng = currentUserPosition.lng;
    } else {
        // Try to get current position
        try {
            const pos = await getCurrentPosition();
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
        } catch (error) {
            console.error('Failed to get position for SOS:', error);
        }
    }

    // Trigger SOS through trip controller
    const result = await triggerSOS(lat, lng);

    if (result.success) {
        const sentCount = result.notifications?.sent || 0;
        alert(
            '✅ SOS Alert Sent!\n\n' +
            `${sentCount} emergency contact(s) have been notified with your location.`
        );
    } else {
        alert(
            '⚠️ SOS Alert Issue\n\n' +
            'There was a problem sending the alert: ' + (result.error || 'Unknown error') + '\n\n' +
            'Please call 911 directly if you need help.'
        );
    }
}

// ========================================
// PAGE INITIALIZATION HELPERS
// ========================================

function wireButton(id, handler) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('click', handler);
    }
}

function wireModalBackdrop(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.addEventListener('click', (event) => closeModalOnBackdrop(event, modalId));
    }
}

function scrollToFeatures() {
    goToScreen('screen-home');
    setTimeout(() => {
        const featuresSection = document.querySelector('.features-brief');
        if (featuresSection) {
            featuresSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 300);
}

// ========================================
// AUTH UI HELPERS
// ========================================

/**
 * Show a message on the auth screen
 * @param {string} message - Message to display
 * @param {string} type - 'error' or 'success'
 */
function showAuthMessage(message, type) {
    const messageEl = document.getElementById('auth-message');
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.className = `auth-message ${type}`;
        messageEl.style.display = 'block';
    }
}

/**
 * Clear auth messages
 */
function clearAuthMessages() {
    const messageEl = document.getElementById('auth-message');
    if (messageEl) {
        messageEl.textContent = '';
        messageEl.style.display = 'none';
    }
}

// ========================================
// CONTACT MANAGEMENT
// ========================================

// Contact state
let contactsList = [];
let contactToDelete = null;

/**
 * Fetch user's contacts from the API
 */
async function fetchContacts() {
    const loadingEl = document.getElementById('contacts-loading');
    const emptyEl = document.getElementById('contacts-empty');
    const listEl = document.getElementById('contacts-list');

    // Show loading state
    if (loadingEl) loadingEl.style.display = 'flex';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
        const response = await authFetch('/api/users/contacts');
        const data = await response.json();

        if (response.ok) {
            contactsList = data.contacts || [];
            renderContacts();
        } else {
            console.error('[Contacts] Failed to fetch:', data.error);
            showContactsError('Failed to load contacts');
        }
    } catch (error) {
        console.error('[Contacts] Fetch error:', error);
        showContactsError('Network error. Please try again.');
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

/**
 * Render contacts list to the DOM
 */
function renderContacts() {
    const listEl = document.getElementById('contacts-list');
    const emptyEl = document.getElementById('contacts-empty');
    const loadingEl = document.getElementById('contacts-loading');
    const limitNotice = document.getElementById('contacts-limit-notice');

    if (!listEl) return;

    // Hide loading
    if (loadingEl) loadingEl.style.display = 'none';

    // Clear existing contact cards (but keep loading and empty elements)
    const existingCards = listEl.querySelectorAll('.contact-card');
    existingCards.forEach(card => card.remove());

    if (contactsList.length === 0) {
        // Show empty state
        if (emptyEl) emptyEl.style.display = 'block';
        if (limitNotice) limitNotice.style.display = 'none';
    } else {
        // Hide empty state
        if (emptyEl) emptyEl.style.display = 'none';

        // Render contact cards
        contactsList.forEach(contact => {
            const card = createContactCard(contact);
            listEl.appendChild(card);
        });

        // Show limit notice for free tier (1 contact max)
        const user = getCurrentUser();
        if (user && user.subscription_level === 'free' && contactsList.length >= 1) {
            if (limitNotice) limitNotice.style.display = 'flex';
        } else {
            if (limitNotice) limitNotice.style.display = 'none';
        }
    }
}

/**
 * Create a contact card element
 * @param {object} contact - Contact data
 * @returns {HTMLElement} Contact card element
 */
function createContactCard(contact) {
    const card = document.createElement('div');
    card.className = 'contact-card';
    card.dataset.contactId = contact.id;

    const initial = (contact.name || 'U').charAt(0).toUpperCase();

    card.innerHTML = `
        <div class="contact-avatar">${initial}</div>
        <div class="contact-details">
            <div class="contact-name-row">
                <span class="contact-name">${escapeHtml(contact.name)}</span>
                ${contact.is_primary ? '<span class="contact-primary-badge">Primary</span>' : ''}
            </div>
            <p class="contact-phone">${escapeHtml(contact.phone_number)}</p>
            ${contact.relationship ? `<p class="contact-relationship">${escapeHtml(contact.relationship)}</p>` : ''}
        </div>
        <div class="contact-actions">
            <button class="contact-delete-btn" data-contact-id="${contact.id}" data-contact-name="${escapeHtml(contact.name)}" title="Remove contact">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
            </button>
        </div>
    `;

    // Wire up delete button
    const deleteBtn = card.querySelector('.contact-delete-btn');
    deleteBtn.addEventListener('click', () => {
        showDeleteConfirmation(contact.id, contact.name);
    });

    return card;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

/**
 * Show error message in contacts section
 */
function showContactsError(message) {
    const listEl = document.getElementById('contacts-list');
    const emptyEl = document.getElementById('contacts-empty');

    if (emptyEl) {
        emptyEl.style.display = 'block';
        const emptyTitle = emptyEl.querySelector('h4');
        const emptyDesc = emptyEl.querySelector('p');
        if (emptyTitle) emptyTitle.textContent = 'Error loading contacts';
        if (emptyDesc) emptyDesc.textContent = message;
    }
}

/**
 * Handle add contact form submission
 */
async function handleAddContact(e) {
    e.preventDefault();

    const nameInput = document.getElementById('contact-name');
    const phoneInput = document.getElementById('contact-phone');
    const relationshipInput = document.getElementById('contact-relationship');
    const isPrimaryInput = document.getElementById('contact-is-primary');
    const submitBtn = document.getElementById('save-contact-btn');
    const messageEl = document.getElementById('contact-form-message');

    const name = nameInput.value.trim();
    const phoneNumber = phoneInput.value.trim();
    const relationship = relationshipInput.value.trim();
    const isPrimary = isPrimaryInput.checked;

    // Validation
    if (!name || !phoneNumber) {
        showFormMessage(messageEl, 'Please fill in all required fields', 'error');
        return;
    }

    // Basic phone validation (allow digits, spaces, dashes, parentheses, plus)
    const phoneRegex = /^[\d\s\-\(\)\+]+$/;
    if (!phoneRegex.test(phoneNumber) || phoneNumber.replace(/\D/g, '').length < 10) {
        showFormMessage(messageEl, 'Please enter a valid phone number', 'error');
        return;
    }

    // Show loading state
    submitBtn.classList.add('btn-loading');
    submitBtn.disabled = true;

    try {
        const response = await authFetch('/api/users/contacts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                phoneNumber,
                relationship: relationship || null,
                isPrimary
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Success - close modal and refresh contacts
            closeModal('add-contact-modal');
            resetAddContactForm();
            await fetchContacts();
        } else if (response.status === 403 && data.code === 'AUTH_003') {
            // Contact limit reached
            showFormMessage(messageEl, data.message || 'Contact limit reached. Upgrade to add more.', 'error');
        } else {
            showFormMessage(messageEl, data.error || 'Failed to add contact', 'error');
        }
    } catch (error) {
        console.error('[Contacts] Add error:', error);
        showFormMessage(messageEl, 'Network error. Please try again.', 'error');
    } finally {
        submitBtn.classList.remove('btn-loading');
        submitBtn.disabled = false;
    }
}

/**
 * Show delete confirmation modal
 */
function showDeleteConfirmation(contactId, contactName) {
    contactToDelete = contactId;

    const nameEl = document.getElementById('delete-contact-name');
    if (nameEl) nameEl.textContent = contactName;

    openModal('delete-contact-modal');
}

/**
 * Handle contact deletion
 */
async function handleDeleteContact() {
    if (!contactToDelete) return;

    const confirmBtn = document.getElementById('confirm-delete-btn');
    confirmBtn.classList.add('btn-loading');
    confirmBtn.disabled = true;

    try {
        const response = await authFetch(`/api/users/contacts/${contactToDelete}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Success - close modal and refresh contacts
            closeModal('delete-contact-modal');
            contactToDelete = null;
            await fetchContacts();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to delete contact');
        }
    } catch (error) {
        console.error('[Contacts] Delete error:', error);
        alert('Network error. Please try again.');
    } finally {
        confirmBtn.classList.remove('btn-loading');
        confirmBtn.disabled = false;
    }
}

/**
 * Reset add contact form
 */
function resetAddContactForm() {
    const form = document.getElementById('add-contact-form');
    if (form) form.reset();

    const messageEl = document.getElementById('contact-form-message');
    if (messageEl) messageEl.style.display = 'none';
}

/**
 * Handle save trip sharing settings
 */
async function handleSaveTripSettings() {
    const saveBtn = document.getElementById('save-trip-settings-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    const result = await saveTripSharingSettings();

    if (saveBtn) {
        saveBtn.disabled = false;
        if (result.success) {
            saveBtn.textContent = 'Saved!';
            setTimeout(() => {
                saveBtn.textContent = 'Save Settings';
            }, 2000);
        } else {
            saveBtn.textContent = 'Save Settings';
            alert(result.error || 'Failed to save settings');
        }
    }
}

/**
 * Show form message
 */
function showFormMessage(el, message, type) {
    if (!el) return;
    el.textContent = message;
    el.className = `form-message ${type}`;
    el.style.display = 'block';
}

/**
 * Update account screen with user data
 */
function updateAccountScreen(user) {
    if (!user) return;

    const avatarEl = document.getElementById('account-avatar');
    const usernameEl = document.getElementById('account-username');
    const emailEl = document.getElementById('account-email');

    const displayName = user.username || user.email.split('@')[0];
    const initial = displayName.charAt(0).toUpperCase();

    if (avatarEl) avatarEl.textContent = initial;
    if (usernameEl) usernameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = user.email;
}

/**
 * Update UI based on auth state
 * @param {boolean} isLoggedIn
 * @param {object|null} user
 */
function updateAuthUI(isLoggedIn, user) {
    // Desktop nav
    const signinBtn = document.getElementById('nav-signin-btn');
    const userMenu = document.getElementById('nav-user-menu');

    // Mobile nav
    const mobileSigninBtn = document.getElementById('mobile-nav-signin-btn');
    const mobileUserMenu = document.getElementById('mobile-nav-user-menu');

    if (isLoggedIn && user) {
        // Show user menu, hide sign in button
        if (signinBtn) signinBtn.style.display = 'none';
        if (userMenu) {
            userMenu.style.display = 'flex';
            const usernameEl = userMenu.querySelector('.user-name');
            if (usernameEl) {
                usernameEl.textContent = user.username || user.email.split('@')[0];
            }
        }

        if (mobileSigninBtn) mobileSigninBtn.style.display = 'none';
        if (mobileUserMenu) {
            mobileUserMenu.style.display = 'block';
            const mobileUsernameEl = mobileUserMenu.querySelector('.user-name');
            if (mobileUsernameEl) {
                mobileUsernameEl.textContent = user.username || user.email.split('@')[0];
            }
        }

        // Update account settings screen
        updateAccountScreen(user);

        console.log('[Auth] UI updated for logged in user:', user.email);
    } else {
        // Show sign in button, hide user menu
        if (signinBtn) signinBtn.style.display = 'block';
        if (userMenu) userMenu.style.display = 'none';

        if (mobileSigninBtn) mobileSigninBtn.style.display = 'block';
        if (mobileUserMenu) mobileUserMenu.style.display = 'none';

        console.log('[Auth] UI updated for logged out state');
    }
}

/**
 * Handle user logout
 */
function handleLogout() {
    logout();
    updateAuthUI(false, null);
    goToScreen('screen-home');
}

// ========================================
// PAGE INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Init] PinkPath starting (Google Maps version)...');

    try {

    // ========================================
    // OFFLINE HANDLING INITIALIZATION
    // ========================================
    initOfflineHandling();
    console.log('[Init] Offline handling initialized');

    // ========================================
    // MAP THEME TOGGLE INITIALIZATION
    // ========================================
    initMapTheme();
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn && currentMode === 'dark') {
        themeToggleBtn.classList.add('map-dark');
    }

    // ========================================
    // SESSION EXPIRATION HANDLING
    // ========================================
    window.addEventListener('auth-expired', handleSessionExpired);

    // ========================================
    // SCREEN INITIALIZATION
    // ========================================
    goToScreen('screen-home');

    // ========================================
    // ROUTE PLANNER COMPONENT INITIALIZATION
    // ========================================
    console.log('[Init] Initializing RoutePlanner components...');

    function syncLocationSelection(sourceInstance, type, location) {
        if (type === 'start') {
            selectedStart = location;
        } else if (type === 'destination') {
            selectedDestination = location;
        }

        const targetInstance = sourceInstance === 'main' ? homeRoutePlanner : mainRoutePlanner;
        if (targetInstance) {
            const values = {};
            values[type] = location.name || '';
            targetInstance.setValues(values);
            console.log(`[Sync] ${sourceInstance} → ${sourceInstance === 'main' ? 'home' : 'main'}: ${type} = "${location.name}"`);
        }
    }

    const mainPlannerContainer = document.getElementById('route-planner-main');
    if (mainPlannerContainer) {
        mainRoutePlanner = new RoutePlanner(mainPlannerContainer, {
            instanceId: 'main',
            showPreferences: true,
            showShareButton: false, // Removed for beta - share option moved to route preview
            getCurrentLocation: () => currentUserLocation,
            onLocationSelected: (type, location) => {
                syncLocationSelection('main', type, location);
            },
            getUserLocation: (inputId, onLocationSelected) => getUserLocationForInput(inputId, onLocationSelected),
            onRouteRequest: (values, prefs) => findRoute(values, prefs)
        });
        mainRoutePlanner.init();
        console.log('[Init] Main RoutePlanner initialized');
    }

    const homePlannerContainer = document.getElementById('route-planner-home');
    if (homePlannerContainer) {
        homeRoutePlanner = new RoutePlanner(homePlannerContainer, {
            instanceId: 'home',
            showPreferences: false,
            showShareButton: false,
            getCurrentLocation: () => currentUserLocation,
            onLocationSelected: (type, location) => {
                syncLocationSelection('home', type, location);
            },
            getUserLocation: (inputId, onLocationSelected) => getUserLocationForInput(inputId, onLocationSelected),
            onRouteRequest: (values, prefs) => findRoute(values, prefs)
        });
        homeRoutePlanner.init();
        console.log('[Init] Home RoutePlanner initialized');
    }

    // ========================================
    // HEADER & DESKTOP NAVIGATION
    // ========================================
    console.log('[Init] Wiring navigation...');
    wireButton('logo-btn', () => goToScreen('screen-home'));
    wireButton('nav-home-btn', () => goToScreen('screen-home'));
    wireButton('nav-plan-route-btn', () => goToScreen('screen-plan-route'));
    wireButton('nav-features-btn', scrollToFeatures);
    wireButton('nav-signin-btn', () => goToScreen('screen-auth'));
    wireButton('theme-toggle-btn', toggleMapTheme);

    // ========================================
    // MOBILE MENU
    // ========================================
    wireButton('mobile-menu-toggle-btn', toggleMobileMenu);
    wireButton('mobile-nav-home-btn', () => { goToScreen('screen-home'); closeMobileMenu(); });
    wireButton('mobile-nav-plan-route-btn', () => { goToScreen('screen-plan-route'); closeMobileMenu(); });
    wireButton('mobile-nav-features-btn', () => { scrollToFeatures(); closeMobileMenu(); });
    wireButton('mobile-nav-signin-btn', () => { goToScreen('screen-auth'); closeMobileMenu(); });

    // ========================================
    // HOME SCREEN BUTTONS
    // ========================================
    console.log('[Init] Wiring home screen...');
    wireButton('hero-get-started-btn', () => goToScreen('screen-plan-route'));
    wireButton('hero-learn-more-btn', () => openModal('features-modal'));
    wireButton('home-back-to-top-btn', scrollToTop);

    // ========================================
    // ROUTE RESULTS SCREEN BUTTONS
    // ========================================
    console.log('[Init] Wiring route results screen...');
    wireButton('back-to-planning-btn', () => goToScreen('screen-plan-route'));
    wireButton('view-crime-details-btn', () => openCrimeDetailsModal(() => currentRouteData, openModal));
    wireButton('start-navigation-btn', startNavigation);
    wireButton('share-trip-btn', handleShareTripFromPreview);
    wireButton('alternative-routes-btn', () => showFeatureUpvoteModal('alternative_routes', 'Alternative Routes', 'Compare multiple route options with different safety vs. speed trade-offs.'));

    // Initialize Show More toggle for detailed metrics
    initShowMoreToggle();

    // ========================================
    // ACTIVE NAVIGATION SCREEN BUTTONS
    // ========================================
    console.log('[Init] Wiring navigation screen...');
    wireButton('end-navigation-btn', endNavigation);
    wireButton('btn-prev-step', previousStep);
    wireButton('btn-next-step', nextStep);
    wireButton('emergency-sos-btn', showEmergencyAlert);
    wireButton('call-911-btn', () => alert('Calling 911...'));
    wireButton('alert-contacts-btn', handleAlertContacts);
    wireButton('share-live-location-btn', () => showFeatureUpvoteModal('live_location', 'Live Location Sharing', 'Share your real-time location with trusted contacts during your trip.'));
    wireButton('back-to-top-btn', scrollToTop);

    // Trip sharing action buttons
    wireButton('check-in-btn', handleCheckIn);
    wireButton('arrived-btn', handleArrived);

    // ========================================
    // FEATURES MODAL
    // ========================================
    console.log('[Init] Setting up modals...');
    wireModalBackdrop('features-modal');
    wireButton('features-modal-close-btn', () => closeModal('features-modal'));
    wireButton('features-modal-get-started-btn', () => {
        closeModal('features-modal');
        goToScreen('screen-plan-route');
    });

    // View Tutorial button (in footer)
    wireButton('view-tutorial-btn', showTutorialAgain);

    // ========================================
    // AUTH SCREEN
    // ========================================
    console.log('[Init] Setting up auth...');

    // Initialize auth state from localStorage (also handles OAuth callback)
    const authState = initAuth();

    // Handle OAuth callback result
    if (authState.oauthResult) {
        if (authState.oauthResult.success) {
            // OAuth successful - will update UI when user info is fetched
            console.log('[Init] OAuth login in progress...');
            goToScreen('screen-home');
        } else if (authState.oauthResult.error) {
            // OAuth failed - show error on auth screen
            goToScreen('screen-auth');
            setTimeout(() => {
                showAuthMessage(authState.oauthResult.error, 'error');
            }, 100);
        }
    } else if (authState.user) {
        console.log('[Init] User already logged in:', authState.user.email);
        updateAuthUI(true, authState.user);
    }

    // Listen for auth-login events (from OAuth callback)
    window.addEventListener('auth-login', (event) => {
        console.log('[Auth] OAuth login complete:', event.detail.user.email);
        updateAuthUI(true, event.detail.user);
        goToScreen('screen-home');
    });

    // Listen for auth expiration events
    window.addEventListener('auth-expired', () => {
        console.log('[Auth] Token expired, logging out');
        updateAuthUI(false, null);
        goToScreen('screen-auth');
    });

    // Google Sign-In button
    wireButton('google-signin-btn', () => {
        console.log('[Auth] Starting Google Sign-In...');
        startGoogleSignIn();
    });

    // Auth tab switching
    const authTabs = document.querySelectorAll('.auth-tab');
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetForm = tab.dataset.tab;

            // Update active tab
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide forms
            document.getElementById('signup-form').style.display = targetForm === 'signup' ? 'block' : 'none';
            document.getElementById('signin-form').style.display = targetForm === 'signin' ? 'block' : 'none';

            // Clear messages
            clearAuthMessages();
        });
    });

    // Signup form submission
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value;
            const confirmPassword = document.getElementById('signup-confirm-password').value;

            // Validation
            if (!email || !password) {
                showAuthMessage('Please fill in all required fields', 'error');
                return;
            }

            if (password !== confirmPassword) {
                showAuthMessage('Passwords do not match', 'error');
                return;
            }

            if (password.length < 8) {
                showAuthMessage('Password must be at least 8 characters', 'error');
                return;
            }

            // Show loading state
            const submitBtn = signupForm.querySelector('button[type="submit"]');
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;

            // Call register API
            const result = await register(email, password, null);

            // Hide loading state
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;

            if (result.success) {
                showAuthMessage('Account created successfully! Welcome to PinkPath.', 'success');
                updateAuthUI(true, result.user);

                // Navigate to home after short delay
                setTimeout(() => {
                    goToScreen('screen-home');
                }, 1500);
            } else {
                showAuthMessage(result.error || 'Registration failed', 'error');
            }
        });
    }

    // Signin form submission
    const signinForm = document.getElementById('signin-form');
    if (signinForm) {
        signinForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('signin-email').value.trim();
            const password = document.getElementById('signin-password').value;

            // Validation
            if (!email || !password) {
                showAuthMessage('Please enter your email and password', 'error');
                return;
            }

            // Show loading state
            const submitBtn = signinForm.querySelector('button[type="submit"]');
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;

            // Call login API
            const result = await login(email, password);

            // Hide loading state
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;

            if (result.success) {
                showAuthMessage('Welcome back!', 'success');
                updateAuthUI(true, result.user);

                // Navigate to home after short delay
                setTimeout(() => {
                    goToScreen('screen-home');
                }, 1000);
            } else {
                showAuthMessage(result.error || 'Login failed', 'error');
            }
        });
    }

    // Back to home button on auth screen
    wireButton('auth-back-btn', () => goToScreen('screen-home'));

    // Logout buttons
    wireButton('nav-logout-btn', handleLogout);
    wireButton('mobile-nav-logout-btn', () => { handleLogout(); closeMobileMenu(); });

    // Account buttons (navigate to account settings)
    wireButton('nav-account-btn', () => {
        goToScreen('screen-account-settings');
        fetchContacts();
    });
    wireButton('mobile-nav-account-btn', () => {
        goToScreen('screen-account-settings');
        fetchContacts();
        closeMobileMenu();
    });

    // ========================================
    // ACCOUNT SETTINGS SCREEN
    // ========================================
    console.log('[Init] Setting up account settings...');
    wireButton('account-back-btn', () => goToScreen('screen-home'));
    wireButton('account-logout-btn', handleLogout);

    // Add contact modal
    wireButton('add-contact-btn', () => {
        resetAddContactForm();
        openModal('add-contact-modal');
    });
    wireModalBackdrop('add-contact-modal');
    wireButton('add-contact-modal-close-btn', () => closeModal('add-contact-modal'));

    // Add contact form submission
    const addContactForm = document.getElementById('add-contact-form');
    if (addContactForm) {
        addContactForm.addEventListener('submit', handleAddContact);
    }

    // Delete contact modal
    wireModalBackdrop('delete-contact-modal');
    wireButton('delete-contact-modal-close-btn', () => {
        closeModal('delete-contact-modal');
        contactToDelete = null;
    });
    wireButton('cancel-delete-btn', () => {
        closeModal('delete-contact-modal');
        contactToDelete = null;
    });
    wireButton('confirm-delete-btn', handleDeleteContact);

    // Trip sharing settings
    wireButton('save-trip-settings-btn', handleSaveTripSettings);

    // Delay threshold slider - update display value
    const delaySlider = document.getElementById('setting-delay-threshold');
    const delayValue = document.getElementById('delay-threshold-value');
    if (delaySlider && delayValue) {
        delaySlider.addEventListener('input', () => {
            delayValue.textContent = `${delaySlider.value} min`;
        });
    }

    // ========================================
    // CRIME DETAILS MODAL
    // ========================================
    wireModalBackdrop('crime-details-modal');
    wireButton('crime-modal-close-btn', () => closeModal('crime-details-modal'));
    wireButton('more-info-btn', toggleCrimeDetails);
    wireButton('crime-modal-close-footer-btn', () => closeModal('crime-details-modal'));

    // ========================================
    // ROUTE RATING MODAL
    // ========================================
    console.log('[Init] Setting up rating modal...');
    wireModalBackdrop('route-rating-modal');
    wireButton('rating-modal-close-btn', closeRatingModal);
    wireButton('rating-skip-btn', closeRatingModal);
    wireButton('rating-done-btn', closeRatingModal);
    wireButton('rating-sign-in-btn', () => {
        closeModal('route-rating-modal');
        goToScreen('screen-auth');
    });

    // Arrival celebration buttons
    wireButton('rate-route-btn', showRatingForm);
    wireButton('skip-rating-btn', () => {
        closeRatingModal();
        goToScreen('screen-route-results');
    });

    // 5-star rating buttons
    document.querySelectorAll('.star-btn').forEach(starBtn => {
        starBtn.addEventListener('click', () => handleStarRating(starBtn));
        starBtn.addEventListener('mouseenter', () => handleStarHover(starBtn, true));
        starBtn.addEventListener('mouseleave', () => handleStarHover(starBtn, false));
    });

    // Rating option selection
    document.querySelectorAll('.rating-option').forEach(option => {
        option.addEventListener('click', () => handleRatingSelection(option));
    });

    // Comment character counter
    const commentInput = document.getElementById('rating-comment-input');
    if (commentInput) {
        commentInput.addEventListener('input', updateCommentCharCount);
    }

    // Submit rating button
    wireButton('submit-rating-btn', handleRatingSubmit);

    // Load rating categories on startup
    loadRatingCategories().then(() => {
        console.log('[Init] Rating categories loaded');
    });

    // ========================================
    // SEGMENT PIN PANEL
    // ========================================
    console.log('[Init] Setting up segment pin panel...');
    wireButton('add-safety-note-btn', enterHazardSelectionMode);
    wireButton('close-pin-panel-btn', closePinPanel);
    wireButton('clear-pin-location-btn', clearPinLocation);
    wireButton('submit-pin-btn', handlePinSubmit);

    // Preview mode rate route button
    wireButton('rate-route-preview-btn', showRatingModal);

    // ========================================
    // HAZARD SELECTION MODE
    // ========================================
    console.log('[Init] Setting up hazard selection mode...');
    wireButton('hazard-selection-cancel-btn', exitHazardSelectionMode);

    // ========================================
    // HAZARD REPORTING MODAL
    // ========================================
    console.log('[Init] Setting up hazard reporting modal...');
    wireModalBackdrop('report-hazard-modal');
    wireButton('report-hazard-btn', enterHazardSelectionMode);
    wireButton('report-modal-close-btn', closeReportModal);
    wireButton('report-sign-in-btn', () => {
        closeReportModal();
        goToScreen('screen-auth');
    });
    wireButton('report-skip-btn', closeReportModal);
    wireButton('clear-report-location-btn', clearReportLocation);
    wireButton('submit-report-btn', handleReportSubmit);
    wireButton('report-done-btn', closeReportModal);

    // Report scope radio buttons
    document.querySelectorAll('input[name="report-scope"]').forEach(radio => {
        radio.addEventListener('change', handleReportScopeChange);
    });

    // Report comment character counter
    const reportCommentInput = document.getElementById('report-comment-input');
    if (reportCommentInput) {
        reportCommentInput.addEventListener('input', updateReportCommentCharCount);
    }

    // Load hazard categories on startup
    loadHazardCategories().then(() => {
        console.log('[Init] Hazard categories loaded');
    });

    // ========================================
    // WELCOME TUTORIAL
    // ========================================
    console.log('[Init] Setting up welcome tutorial...');
    initWelcomeTutorial();

    // ========================================
    // INITIALIZATION COMPLETE
    // ========================================
    console.log('[Init] PinkPath ready (Google Maps version)!');

    } catch (error) {
        console.error('[Init] FATAL ERROR during initialization:', error);
        alert('PinkPath failed to initialize: ' + error.message);
    }
});

// ========================================
// WELCOME TUTORIAL
// ========================================

const TUTORIAL_STORAGE_KEY = 'pinkpath_tutorial_completed';
const TUTORIAL_TOTAL_STEPS = 5;
let tutorialCurrentStep = 1;

/**
 * Initialize the welcome tutorial system
 * Checks for reset param, localStorage, and shows tutorial if first visit
 */
function initWelcomeTutorial() {
    // Check for reset parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset_tutorial') === 'true') {
        localStorage.removeItem(TUTORIAL_STORAGE_KEY);
        console.log('[Tutorial] Reset via URL parameter');
        // Clean up URL without reload
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    // Check if tutorial has been completed
    const tutorialCompleted = localStorage.getItem(TUTORIAL_STORAGE_KEY);

    if (!tutorialCompleted) {
        console.log('[Tutorial] First-time user detected, showing tutorial');
        // Slight delay to ensure page is fully rendered
        setTimeout(() => showWelcomeTutorial(), 500);
    } else {
        console.log('[Tutorial] Returning user, skipping tutorial');
    }

    // Wire tutorial buttons
    wireButton('tutorial-skip-btn', skipTutorial);
    wireButton('tutorial-prev-btn', tutorialPrevStep);
    wireButton('tutorial-next-btn', tutorialNextStep);
    wireButton('tutorial-signin-btn', tutorialGoToSignIn);

    // Wire progress dots for direct navigation
    const progressDots = document.querySelectorAll('.progress-dot');
    progressDots.forEach(dot => {
        dot.addEventListener('click', () => {
            const step = parseInt(dot.dataset.step);
            if (step && step <= tutorialCurrentStep) {
                goToTutorialStep(step);
            }
        });
    });

    // Wire backdrop click to close (optional - user must complete or skip)
    wireModalBackdrop('welcome-tutorial-modal');
}

/**
 * Show the welcome tutorial modal
 */
function showWelcomeTutorial() {
    tutorialCurrentStep = 1;
    updateTutorialUI();
    openModal('welcome-tutorial-modal');
    console.log('[Tutorial] Tutorial opened');
}

/**
 * Go to a specific tutorial step
 */
function goToTutorialStep(step) {
    if (step < 1 || step > TUTORIAL_TOTAL_STEPS) return;

    tutorialCurrentStep = step;
    updateTutorialUI();
}

/**
 * Go to the previous tutorial step
 */
function tutorialPrevStep() {
    if (tutorialCurrentStep > 1) {
        tutorialCurrentStep--;
        updateTutorialUI();
    }
}

/**
 * Go to the next tutorial step or complete the tutorial
 */
function tutorialNextStep() {
    if (tutorialCurrentStep < TUTORIAL_TOTAL_STEPS) {
        tutorialCurrentStep++;
        updateTutorialUI();
    } else {
        completeTutorial();
    }
}

/**
 * Update the tutorial UI based on current step
 */
function updateTutorialUI() {
    // Update step indicator text
    const stepIndicator = document.getElementById('tutorial-current-step');
    if (stepIndicator) {
        stepIndicator.textContent = tutorialCurrentStep;
    }

    // Update progress dots
    const progressDots = document.querySelectorAll('.progress-dot');
    progressDots.forEach(dot => {
        const dotStep = parseInt(dot.dataset.step);
        dot.classList.remove('active', 'completed');

        if (dotStep === tutorialCurrentStep) {
            dot.classList.add('active');
        } else if (dotStep < tutorialCurrentStep) {
            dot.classList.add('completed');
        }
    });

    // Show/hide tutorial steps
    const tutorialSteps = document.querySelectorAll('.tutorial-step');
    tutorialSteps.forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.remove('active');
        if (stepNum === tutorialCurrentStep) {
            step.classList.add('active');
        }
    });

    // Update Previous button visibility
    const prevBtn = document.getElementById('tutorial-prev-btn');
    if (prevBtn) {
        prevBtn.style.visibility = tutorialCurrentStep > 1 ? 'visible' : 'hidden';
    }

    // Update Next button text
    const nextBtn = document.getElementById('tutorial-next-btn');
    if (nextBtn) {
        if (tutorialCurrentStep === TUTORIAL_TOTAL_STEPS) {
            nextBtn.textContent = 'Get Started';
        } else {
            nextBtn.textContent = 'Next';
        }
    }

    console.log(`[Tutorial] Step ${tutorialCurrentStep} of ${TUTORIAL_TOTAL_STEPS}`);
}

/**
 * Skip the tutorial (marks as completed)
 */
function skipTutorial() {
    markTutorialComplete();
    closeModal('welcome-tutorial-modal');
    console.log('[Tutorial] Skipped by user');
}

/**
 * Complete the tutorial
 */
function completeTutorial() {
    markTutorialComplete();
    closeModal('welcome-tutorial-modal');

    // Navigate to plan route screen
    goToScreen('screen-plan-route');
    console.log('[Tutorial] Completed, navigating to plan route');
}

/**
 * Go to sign-in screen from tutorial
 */
function tutorialGoToSignIn() {
    markTutorialComplete();
    closeModal('welcome-tutorial-modal');
    goToScreen('screen-auth');
    console.log('[Tutorial] Navigating to sign in');
}

/**
 * Mark the tutorial as completed in localStorage
 */
function markTutorialComplete() {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, new Date().toISOString());
}

/**
 * Reset the tutorial (for testing)
 * Can be called from browser console: resetTutorial()
 */
function resetTutorial() {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
    console.log('[Tutorial] Reset. Refresh the page to see the tutorial again.');
    console.log('[Tutorial] Or add ?reset_tutorial=true to the URL');
}

/**
 * Show tutorial again (for "View Tutorial" link)
 */
function showTutorialAgain() {
    tutorialCurrentStep = 1;
    updateTutorialUI();
    openModal('welcome-tutorial-modal');
}

// Expose reset function globally for testing
window.resetTutorial = resetTutorial;
window.showTutorialAgain = showTutorialAgain;

// ========================================
// UTILITY FUNCTIONS
// ========================================

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
