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
import { filterRecentViolentCrimes } from './modules/services/crimeService.js';

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
    updateMarkerPosition
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
    getCurrentUser
} from './modules/controllers/authController.js';

console.log('[PinkPath] All imports loaded successfully');

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

    // Show the target screen
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        console.log(`Navigated to: ${screenId}`);

        // Close mobile menu if open
        closeMobileMenu();

        // Initialize map when showing route results
        if (screenId === 'screen-route-results') {
            setTimeout(initializeRouteMap, 100);
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
 * Wait for Google Maps to be ready
 * @returns {Promise<void>}
 */
function waitForGoogleMaps() {
    return new Promise((resolve) => {
        if (window.google && window.google.maps) {
            resolve();
        } else {
            window.addEventListener('google-maps-ready', resolve, { once: true });
        }
    });
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

    // Wait for Google Maps API
    await waitForGoogleMaps();

    try {
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

    // Wait for Google Maps API
    await waitForGoogleMaps();

    try {
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
    console.log('From:', start.name);
    console.log('To:', end.name);

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

        // Update UI
        updateRouteDisplay();
        updateSafetyDisplay(() => currentRouteData);
        updateRouteComparisonUI();

        // Add crime markers
        if (currentRouteData.rawCrimeData && currentRouteData.rawCrimeData.length > 0) {
            const recentCrimes = filterRecentViolentCrimes(currentRouteData.rawCrimeData);
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
 * @param {Object} routes - Routes from backend {safest, fastest, balanced}
 * @returns {Array} Processed route options
 */
function processBackendRoutes(routes) {
    const routeArray = [];
    const routeTypes = ['safest', 'fastest', 'balanced'];

    routeTypes.forEach((type, index) => {
        const route = routes[type];
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
            type: type,
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
 */
function drawRoutesOnMap(map, routes, selectedIdx) {
    // Clear existing routes
    removePolylines(ombreRoutePolylines);
    removePolylines(alternativeRoutePolylines);

    // Draw selected route first (bottom layer)
    routes.forEach((routeOption, idx) => {
        if (idx === selectedIdx) {
            if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                ombreRoutePolylines = drawOmbreRoute(
                    map,
                    routeOption.coordinates,
                    routeOption.crimeSamples,
                    0.8,
                    false
                );
            } else {
                ombreRoutePolylines = drawBasicRoute(
                    map,
                    routeOption.coordinates,
                    0.8,
                    false,
                    '#4285f4'
                );
            }
        }
    });

    // Draw alternative routes (top layer, dashed)
    routes.forEach((routeOption, idx) => {
        if (idx !== selectedIdx) {
            if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                alternativeRoutePolylines = drawOmbreRoute(
                    map,
                    routeOption.coordinates,
                    routeOption.crimeSamples,
                    0.4,
                    true
                );
            } else {
                alternativeRoutePolylines = drawBasicRoute(
                    map,
                    routeOption.coordinates,
                    0.4,
                    true,
                    '#4285f4'
                );
            }
        }
    });
}

/**
 * Update loading state on route results screen
 */
function updateRouteLoadingState(isLoading) {
    const loadingEl = document.getElementById('route-loading');
    const resultsEl = document.getElementById('route-results-content');

    if (loadingEl) {
        loadingEl.style.display = isLoading ? 'flex' : 'none';
    }
    if (resultsEl) {
        resultsEl.style.display = isLoading ? 'none' : 'block';
    }
}

// ========================================
// ROUTE COMPARISON UI
// ========================================

/**
 * Build and display the route comparison cards
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

    // Create card for each route option
    routeOptions.forEach((routeOption, index) => {
        const isSelected = (index === selectedRouteIndex);
        const typeLabels = { safest: 'Safest', fastest: 'Fastest', balanced: 'Balanced' };

        const card = document.createElement('div');
        card.className = `route-card ${isSelected ? 'selected' : ''}`;
        card.dataset.routeIndex = index;

        card.innerHTML = `
            <div class="route-card-header">
                <h3>${typeLabels[routeOption.type] || 'Route ' + (index + 1)} ${isSelected ? '(Selected)' : ''}</h3>
                <div class="safety-badge" style="background-color: ${routeOption.safetyColor}20; color: ${routeOption.safetyColor};">
                    ${routeOption.safetyLabel}
                </div>
            </div>
            <div class="route-card-body">
                <div class="route-stat">
                    <span class="route-stat-label">Distance:</span>
                    <span class="route-stat-value">${routeOption.distanceText}</span>
                </div>
                <div class="route-stat">
                    <span class="route-stat-label">Duration:</span>
                    <span class="route-stat-value">${routeOption.durationText}</span>
                </div>
                <div class="route-stat">
                    <span class="route-stat-label">Safety Score:</span>
                    <span class="route-stat-value">${Math.round(routeOption.safetyScore)}/100</span>
                </div>
                <div class="route-stat">
                    <span class="route-stat-label">Crime Count:</span>
                    <span class="route-stat-value">${routeOption.crimeCount}</span>
                </div>
            </div>
            <button class="select-route-btn ${isSelected ? 'selected' : ''}" data-route-index="${index}">
                ${isSelected ? 'Selected' : 'Select Route'}
            </button>
        `;

        comparisonContainer.appendChild(card);
    });

    // Add click handlers to select buttons
    const selectButtons = comparisonContainer.querySelectorAll('.select-route-btn');
    selectButtons.forEach(button => {
        button.addEventListener('click', function() {
            const newIndex = parseInt(this.dataset.routeIndex);
            selectRoute(newIndex);
        });
    });
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
        const recentCrimes = filterRecentViolentCrimes(selectedRoute.rawCrimeData);
        if (recentCrimes.length > 0) {
            crimeMarkersData = addCrimeMarkersToMap(routeMap, recentCrimes, { coordinates: routeCoordinates });
        }
    }
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

    // Detect if user is at start point
    const atStartPoint = await checkIfAtStartPoint();
    isPreviewMode = !atStartPoint;

    console.log(`📋 Mode: ${isPreviewMode ? 'PREVIEW' : 'LIVE'}`);

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
    routeSteps = currentRoute.steps || currentRoute.instructions || [];

    // Draw routes
    routeOptions.forEach((routeOption, idx) => {
        const isSelected = (idx === selectedRouteIndex);

        if (isSelected) {
            if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                navOmbreRoutePolylines = drawOmbreRoute(
                    navigationMap,
                    routeOption.coordinates,
                    routeOption.crimeSamples,
                    0.8,
                    false
                );
            } else {
                navOmbreRoutePolylines = drawBasicRoute(
                    navigationMap,
                    routeOption.coordinates,
                    0.8,
                    false,
                    '#4285f4'
                );
            }
        } else {
            if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                navAlternativeRoutePolylines = drawOmbreRoute(
                    navigationMap,
                    routeOption.coordinates,
                    routeOption.crimeSamples,
                    0.4,
                    true
                );
            } else {
                navAlternativeRoutePolylines = drawBasicRoute(
                    navigationMap,
                    routeOption.coordinates,
                    0.4,
                    true,
                    '#4285f4'
                );
            }
        }
    });

    // Add crime markers
    if (currentRouteData.rawCrimeData && currentRouteData.rawCrimeData.length > 0) {
        const recentCrimes = filterRecentViolentCrimes(currentRouteData.rawCrimeData);
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
    if (routeSteps.length === 0) {
        // Create simple steps from coordinates if none provided
        routeSteps = [{
            text: 'Head toward your destination',
            distance: currentRouteData.distance * 1609.34
        }];
    }

    console.log(`📋 Route has ${routeSteps.length} steps`);

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
    if (!isPreviewMode) return;

    if (currentStepIndex < routeSteps.length - 1) {
        currentStepIndex++;
        console.log(`➡️ Next step: ${currentStepIndex + 1}/${routeSteps.length}`);
        updateNavigationUI();
    }
}

function previousStep() {
    if (!isPreviewMode) return;

    if (currentStepIndex > 0) {
        currentStepIndex--;
        console.log(`⬅️ Previous step: ${currentStepIndex + 1}/${routeSteps.length}`);
        updateNavigationUI();
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
    console.log('🎉 Arrived at destination!');

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

    setTimeout(() => {
        alert('🎉 You have arrived at your destination!\n\nThank you for using PinkPath.');
        endNavigation();
    }, 1000);
}

function endNavigation() {
    console.log('🛑 Ending navigation...');

    if (navigationWatchId) {
        navigator.geolocation.clearWatch(navigationWatchId);
        navigationWatchId = null;
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
// EMERGENCY ALERT
// ========================================

function showEmergencyAlert() {
    const confirmed = confirm(
        '🚨 EMERGENCY ALERT 🚨\n\n' +
        'This will immediately:\n' +
        '• Send your location to emergency contacts\n' +
        '• Start recording audio/video (if enabled)\n' +
        '• Notify local authorities (if configured)\n\n' +
        'Press OK to confirm, or Cancel to go back.'
    );

    if (confirmed) {
        console.log('🚨 Emergency alert triggered!');
        alert(
            '✅ Emergency Alert Sent!\n\n' +
            'Your emergency contacts have been notified with your current location.\n\n' +
            '(This will be fully functional in future updates)'
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
            showShareButton: true,
            getCurrentLocation: () => currentUserLocation,
            onLocationSelected: (type, location) => {
                syncLocationSelection('main', type, location);
            },
            getUserLocation: (inputId, onLocationSelected) => getUserLocationForInput(inputId, onLocationSelected),
            onRouteRequest: (values, prefs) => findRoute(values, prefs),
            onShareTrip: () => alert('Share Trip feature coming soon!')
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
    wireButton('alternative-routes-btn', () => alert('Alternative routes coming soon!'));

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
    wireButton('alert-contacts-btn', () => alert('Alerting contacts...'));
    wireButton('share-live-location-btn', () => alert('Share Live Location feature coming in Phase 7!'));
    wireButton('back-to-top-btn', scrollToTop);

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

    // ========================================
    // AUTH SCREEN
    // ========================================
    console.log('[Init] Setting up auth...');

    // Initialize auth state from localStorage
    const authState = initAuth();
    if (authState.user) {
        console.log('[Init] User already logged in:', authState.user.email);
        updateAuthUI(true, authState.user);
    }

    // Listen for auth expiration events
    window.addEventListener('auth-expired', () => {
        console.log('[Auth] Token expired, logging out');
        updateAuthUI(false, null);
        goToScreen('screen-auth');
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
            const username = document.getElementById('signup-username').value.trim();
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
            submitBtn.classList.add('btn-loading');
            submitBtn.disabled = true;

            // Call register API
            const result = await register(email, password, username || null);

            // Hide loading state
            submitBtn.classList.remove('btn-loading');
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
            submitBtn.classList.add('btn-loading');
            submitBtn.disabled = true;

            // Call login API
            const result = await login(email, password);

            // Hide loading state
            submitBtn.classList.remove('btn-loading');
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

    // ========================================
    // CRIME DETAILS MODAL
    // ========================================
    wireModalBackdrop('crime-details-modal');
    wireButton('crime-modal-close-btn', () => closeModal('crime-details-modal'));
    wireButton('more-info-btn', toggleCrimeDetails);
    wireButton('crime-modal-close-footer-btn', () => closeModal('crime-details-modal'));

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
// UTILITY FUNCTIONS
// ========================================

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
