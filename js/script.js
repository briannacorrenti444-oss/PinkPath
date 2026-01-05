// ========================================
// PINKPATH - MODERN RESPONSIVE WEB APP
// Main Application Script
// OpenStreetMap + Leaflet Implementation
// ========================================

// Import configuration and utilities
import {
    defaultLocation,
    CRIME_API,
    CACHE_DURATION,
    SUNSET_API,
    SF_BOUNDS,
    CRIME_WEIGHTS,
    NOMINATIM_API
} from './modules/config.js';

import {
    calculateDistance,
    toRadians,
    createBoundingBox,
    metersToMiles,
    secondsToMinutes,
    formatDistance,
    formatDuration
} from './modules/utils.js';

// Import crime service (PHASE 2A: Service Layer Extraction)
// Note: filterCrimesLast30Days, groupCrimesByType, getCrimeSeverity moved to safetyController.js
import {
    isInSanFrancisco,
    isRouteInSanFrancisco,
    queryCrimesNearLocation,
    queryCrimesAlongRoute,
    calculateAreaBaseline,
    scoreCrimeData,
    analyzeDayNightCrimes,
    filterRecentViolentCrimes
} from './modules/services/crimeService.js';

// Import sunset service (PHASE 2B: Service Layer Extraction)
import {
    getSunsetCacheKey,
    getSunriseSunset,
    isAfterSunset,
    isBeforeSunrise,
    isNearSunset
} from './modules/services/sunsetService.js';

// Import safety service (PHASE 2C: Service Layer Extraction)
import {
    calculateSafetyScore,
    scoreRouteLength,
    scoreTimeOfDay,
    scoreRouteComplexity,
    scoreRoadType,
    scorePopulationDensity,
    getSafetyLabel,
    getSafetyColor
} from './modules/services/safetyService.js';

// Import geocoding service (PHASE 2D: Service Layer Extraction)
import {
    parseNominatimResult,
    getLocationIcon,
    geocodeAddress,
    reverseGeocode,
    searchAddresses
} from './modules/services/geocodingService.js';

// Import search controller (PHASE 3: Controller Extraction)
import { setupAutocomplete } from './modules/controllers/searchController.js';

// Import map controller (PHASE 3: Controller Extraction)
import { showCurrentLocationOnMap, addMapStyleToggle } from './modules/controllers/mapController.js';

// Import safety controller (PHASE 3: Controller Extraction)
import {
    updateSafetyDisplay,
    openCrimeDetailsModal,
    toggleCrimeDetails
} from './modules/controllers/safetyController.js';

// Import route controller (PHASE 3: Controller Extraction)
import {
    sampleRoutePoints,
    getSegmentColor,
    drawOmbreRoute,
    drawBasicRoute,
    addCrimeMarkersToMap,
    calculateDistanceToPolyline,
    distanceToSegment
} from './modules/controllers/routeController.js';

// Import RoutePlanner component (PHASE 4: Component Extraction)
import { RoutePlanner } from './modules/components/routePlanner.js';

// ========================================
// MAP ICONS (browser-only, not in config.js)
// ========================================

const pinkIcon = L.icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
            <path fill="#ff1493" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
    `),
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

// ========================================
// APPLICATION STATE
// ========================================
//
// STATE ARCHITECTURE OVERVIEW:
// ---------------------------
// This app uses module-level state organized into logical groups:
//
// 1. MAP STATE - Leaflet map instances and layers
//    - Modified by: initializeRouteMap(), initializeNavigationMap(), selectRoute()
//    - Read by: All map rendering functions
//
// 2. LOCATION STATE - User's selected/current locations
//    - Modified by: handleAddressSearch(), getUserLocation(), GPS callbacks
//    - Read by: calculateAndDisplayRoute(), navigation functions
//
// 3. ROUTE STATE - Calculated routes and selection
//    - Modified by: routesfound event, selectRoute()
//    - Read by: UI display functions, navigation functions
//
// 4. NAVIGATION STATE - Turn-by-turn navigation status
//    - Modified by: startNavigation(), GPS tracking, stopNavigation()
//    - Read by: updateNavigationUI(), position tracking functions
//
// 5. UI STATE - Visual preferences
//    - Modified by: toggleMapStyle(), user interactions
//    - Read by: Map rendering functions
//
// ========================================

// ----------------------------------------
// 1. MAP STATE
// Leaflet map instances, layers, and markers
// ----------------------------------------

// Map instances (one per screen)
let routeMap = null;                    // Map on route results screen
let navigationMap = null;               // Map on navigation screen
let routingControl = null;              // Leaflet Routing Machine control

// Route visualization layers (route results screen)
let ombreRouteLayer = null;             // Selected route's colored line
let alternativeOmbreLayer = null;       // Alternative route's colored line (dashed)
let crimeMarkerClusterGroup = null;     // Crime markers cluster

// Route visualization layers (navigation screen)
let navOmbreRouteLayer = null;          // Route line on navigation map
let navAlternativeOmbreLayer = null;    // Alternative route on navigation map
let navCrimeMarkerClusterGroup = null;  // Crime markers on navigation map

// Location markers
let startMarker = null;                 // Green pin at start location
let destinationMarker = null;           // Red pin at destination
let locationMarker = null;              // Blue dot showing initial "you are here"
let navigationMarker = null;            // Blue dot during active navigation

// Tile layers for light/dark mode toggle
let lightTileLayer = null;
let darkTileLayer = null;

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

// GPS locations (different lifecycles!)
let currentUserLocation = null;         // {lat, lng, accuracy} - One-time fix from "Use My Location" button
                                        // Used for: route planning, bounding box searches
                                        // Set by: getUserLocation() success callback

let currentUserPosition = null;         // {lat, lng, accuracy, heading} - Live GPS during navigation
                                        // Used for: real-time position tracking, off-route detection
                                        // Set by: GPS watchPosition callback during navigation

let destinationLocation = null;         // {lat, lng} - Destination during active navigation

// ----------------------------------------
// 3. ROUTE STATE
// Calculated routes, selection, and route data
// ----------------------------------------

// The currently selected route object (from Leaflet Routing Machine)
let currentRoute = null;                // Leaflet route object with coordinates, instructions

// Processed route data for UI display
let currentRouteData = {
    distance: null,                     // Distance in miles
    duration: null,                     // Duration in minutes
    distanceText: null,                 // Formatted: "1.2 mi"
    durationText: null,                 // Formatted: "25 min"
    safetyScore: null,                  // 0-10 scale
    safetyLabel: null,                  // "Excellent", "Good", "Fair", "Caution"
    safetyColor: null,                  // CSS class: "excellent", "good", "fair", "caution"
    safetyBreakdown: null,              // Object with individual factor scores
    usingCrimeData: null,               // Boolean: true if real crime data was used
    inSanFrancisco: null,               // Boolean: true if route is in SF
    crimeCount: null,                   // Number of crimes found along route
    rawCrimeData: null,                 // Array of crime objects for detailed analysis
    crimeSamples: null,                 // Crime samples for ombre coloring
    showNighttimeWarning: null          // Boolean: show nighttime safety warning
};

// Route comparison (when multiple routes are available)
let routeOptions = [];                  // Array of route data objects (all calculated routes)
let selectedRouteIndex = 0;             // Index of currently selected route in routeOptions

// Route geometry for navigation
let routeSteps = [];                    // Array of turn-by-turn instruction objects
let routeCoordinates = [];              // Array of [lat, lng] points along route

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
// Visual preferences and UI timers
// ----------------------------------------

let currentMode = 'light';              // Map color mode: 'light' or 'dark'

// ----------------------------------------
// MIGRATED STATE (now in service modules)
// ----------------------------------------
// crimeCache - moved to crimeService.js
// sunsetCache - moved to sunsetService.js

// ========================================
// SCREEN NAVIGATION
// ========================================

/**
 * Navigate to a different screen in the single-page app
 *
 * WHAT IT DOES:
 * Hides all screens and shows the target screen. This is how the app
 * switches between Home, Plan Route, Route Results, and Navigation views.
 *
 * SIDE EFFECTS:
 * - Scrolls to top of page
 * - Closes mobile menu if open
 * - Initializes route map when showing route results screen
 *
 * @param {string} screenId - The HTML id of the screen to show (e.g., 'screen-home')
 *
 * SCREENS:
 * - 'screen-home': Landing page
 * - 'screen-plan-route': Address input form
 * - 'screen-route-results': Map with route options
 * - 'screen-active-navigation': Turn-by-turn navigation
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
        // Navigation map is initialized manually in startNavigation() sequence
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

/**
 * Toggle the mobile navigation menu open/closed
 */
function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    mobileMenu.classList.toggle('active');
}

/**
 * Close the mobile navigation menu
 * Called when navigating to a new screen or clicking outside menu
 */
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
    if (!startLocation) {
        alert('⚠️ Please enter your starting point');
        return;
    }

    if (!destination) {
        alert('⚠️ Please enter your destination');
        return;
    }

    // Safety preferences with defaults
    const preferences = {
        wellLit: safetyPreferences.wellLit || false,
        busyAreas: safetyPreferences.busyAreas || false,
        avoidConstruction: safetyPreferences.avoidConstruction || false
    };

    console.log('⚙️ Preferences:', preferences);

    // Auto-geocode if user didn't select from dropdown
    if (!selectedStart) {
        console.log('🔍 Auto-geocoding start location...');
        selectedStart = await geocodeAddress(startLocation);
        if (!selectedStart) {
            alert('⚠️ Could not find starting location. Please try a different address.');
            return;
        }
    }

    if (!selectedDestination) {
        console.log('🔍 Auto-geocoding destination...');
        selectedDestination = await geocodeAddress(destination);
        if (!selectedDestination) {
            alert('⚠️ Could not find destination. Please try a different address.');
            return;
        }
    }


    // Navigate to results screen
    goToScreen('screen-route-results');
}

// ========================================
// REAL-TIME LOCATION (PHASE 1)
// ========================================

async function getUserLocationForInput(inputId, onLocationSelected = null) {
    console.log('📍 Requesting user location for input:', inputId);

    // Derive button ID from input ID (e.g., 'main-start-location' -> 'main-use-location-btn')
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

            // Reverse geocode to get address
            const address = await reverseGeocode(lat, lng);

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
                        setMarker: (m) => { locationMarker = m; }
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
// LEAFLET MAP INITIALIZATION
// ========================================

/**
 * Initialize the route results map (shown after finding a route)
 *
 * WHAT IT DOES:
 * Creates the Leaflet map on the route results screen where users
 * see their calculated routes and safety scores.
 *
 * MAP SETUP:
 * 1. Creates Leaflet map in 'route-map' container
 * 2. Sets up light and dark tile layers (CARTO basemaps)
 * 3. Adds light/dark mode toggle button
 * 4. If route data exists, calculates and displays route
 * 5. Otherwise shows a default marker
 *
 * STATE CHANGES:
 * - routeMap = new Leaflet map instance
 * - lightTileLayer = light mode tiles
 * - darkTileLayer = dark mode tiles
 *
 * CALLED BY: goToScreen() when navigating to 'screen-route-results'
 */
function initializeRouteMap() {

    const mapElement = document.getElementById('route-map');
    if (!mapElement) {
        console.error('❌ Route map element not found');
        return;
    }

    try {
        // Create the map
        routeMap = L.map('route-map').setView([defaultLocation.lat, defaultLocation.lng], 13);

        // Set up tile layers
        lightTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 19
        });

        darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 19
        });

        // Add default layer (light mode)
        lightTileLayer.addTo(routeMap);

        // Add toggle button
        addMapStyleToggle(routeMap, null, null, {
            getMode: () => currentMode,
            setMode: (m) => { currentMode = m; },
            getDefaultLayers: () => ({ light: lightTileLayer, dark: darkTileLayer })
        });

        // If we have selected locations, calculate route
        if (selectedStart && selectedDestination) {
            calculateAndDisplayRoute(selectedStart, selectedDestination);
        } else {
            // Show default marker
            L.marker([defaultLocation.lat, defaultLocation.lng], { icon: pinkIcon })
                .addTo(routeMap)
                .bindPopup('Default Location')
                .openPopup();
        }

    } catch (error) {
        console.error('❌ Error initializing route map:', error);
    }
}

/**
 * Initialize the navigation map (for turn-by-turn directions)
 *
 * WHAT IT DOES:
 * Creates the Leaflet map on the navigation screen. This map shows
 * the user's live position and turn-by-turn route during navigation.
 *
 * DIFFERENCES FROM ROUTE MAP:
 * - Higher default zoom (15 vs 13) for walking-level detail
 * - Destroys and recreates if called multiple times
 * - Inherits current light/dark mode setting
 * - Calls invalidateSize() to fix container sizing issues
 *
 * MAP SETUP:
 * 1. Removes existing navigation map if present
 * 2. Creates new Leaflet map in 'navigation-map' container
 * 3. Applies current mode (light/dark) from route results screen
 * 4. Adds toggle button for switching modes
 * 5. Triggers resize after 100ms for proper rendering
 *
 * STATE CHANGES:
 * - navigationMap = new Leaflet map instance
 *
 * CALLED BY: initializeNavigationSequence() when starting navigation
 *
 * @returns {boolean} True if map initialized successfully, false on error
 */
function initializeNavigationMap() {
    console.log('🧭 Initializing navigation map with Leaflet...');

    const mapElement = document.getElementById('navigation-map');
    if (!mapElement) {
        console.error('❌ Navigation map element not found');
        return false;
    }

    try {
        // Remove existing map if any
        if (navigationMap) {
            navigationMap.remove();
            navigationMap = null;
        }

        // Create the map
        navigationMap = L.map('navigation-map').setView([defaultLocation.lat, defaultLocation.lng], 15);

        // Set up tile layers
        const navLightTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 19
        });

        const navDarkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 19
        });

        // Add layer based on current mode
        if (currentMode === 'light') {
            navLightTileLayer.addTo(navigationMap);
        } else {
            navDarkTileLayer.addTo(navigationMap);
        }

        // Add toggle button
        addMapStyleToggle(navigationMap, navLightTileLayer, navDarkTileLayer, {
            getMode: () => currentMode,
            setMode: (m) => { currentMode = m; },
            getDefaultLayers: () => ({ light: lightTileLayer, dark: darkTileLayer })
        });

        // Force Leaflet to recalculate map size after container is rendered
        setTimeout(() => {
            if (navigationMap) {
                navigationMap.invalidateSize();
            }
        }, 100);

        return true;
    } catch (error) {
        console.error('❌ Error initializing navigation map:', error);
        return false;
    }
}

/**
 * Display the selected route on the navigation map
 *
 * WHAT IT DOES:
 * Sets up the route display for turn-by-turn navigation. This is different
 * from the route preview - it shows the route the user will actually walk,
 * with crime markers and both route options visible.
 *
 * KEY BEHAVIOR:
 * - Uses the ALREADY SELECTED route (currentRoute), not OSRM's first result
 * - This preserves the user's Route 1 vs Route 2 choice from the preview screen
 * - Draws both routes: selected (solid, bright) and alternative (dashed, faded)
 *
 * VISUAL ELEMENTS ADDED:
 * 1. Ombre-colored route line (selected route - solid)
 * 2. Alternative route line (dashed, 40% opacity)
 * 3. Crime markers clustered on the map
 * 4. No waypoint markers (user's position shown as blue dot instead)
 *
 * HOW IT WORKS:
 * 1. Creates Leaflet Routing control (but hides its default lines)
 * 2. On 'routesfound': extracts steps/coordinates from currentRoute
 * 3. Draws ombre routes for both route options
 * 4. Adds crime markers from currentRouteData.rawCrimeData
 *
 * STATE DEPENDENCIES:
 * - navigationMap must be initialized
 * - selectedStart, selectedDestination must be set
 * - currentRoute must be set (from user's route selection)
 * - routeOptions array with crime samples
 *
 * STATE CHANGES:
 * - routeSteps = instructions from currentRoute
 * - routeCoordinates = coordinates from currentRoute
 * - navOmbreRouteLayer = selected route polyline
 * - navAlternativeOmbreLayer = alternative route polyline
 * - navCrimeMarkerClusterGroup = crime markers
 *
 * CALLED BY: initializeNavigationSequence() after map is ready
 *
 * @returns {boolean} True if route display started, false on error
 */
function displayRouteOnNavigationMap() {
    console.log('🗺️ Displaying route on navigation map...');

    if (!navigationMap) {
        console.error('❌ Navigation map not initialized');
        return false;
    }

    if (!selectedStart || !selectedDestination) {
        console.error('❌ No route data available');
        return false;
    }

    // Remove existing routing control if any
    if (routingControl && navigationMap.hasLayer(routingControl)) {
        navigationMap.removeControl(routingControl);
    }

    // Adjust route color based on current mode
    const routeColor = currentMode === 'dark' ? '#ff69b4' : '#ff1493';
    const routeOpacity = currentMode === 'dark' ? 1.0 : 0.8;

    // Create routing control with NO markers (we'll use our own blue dot)
    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(selectedStart.lat, selectedStart.lng),
            L.latLng(selectedDestination.lat, selectedDestination.lng)
        ],
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'foot'
        }),
        lineOptions: {
            styles: [],  // Empty array = no lines drawn (we draw ombre routes instead)
            extendToWaypoints: false,
            missingRouteTolerance: 0
        },
        createMarker: function() {
            return null; // No markers - we'll show blue position dot instead
        },
        show: false,
        addWaypoints: false,
        routeWhileDragging: false,
        fitSelectedRoutes: true,
        showAlternatives: false
    }).addTo(navigationMap);

    // Listen for route found
    routingControl.on('routesfound', function(e) {
        // DON'T overwrite currentRoute - use the already-selected route from preview!
        // currentRoute was already set when user selected Route 1 or Route 2
        // e.routes[0] would always give us the first route, ignoring user's selection

        // Extract navigation data from the already-selected route
        routeSteps = currentRoute.instructions || [];
        routeCoordinates = currentRoute.coordinates || [];

        console.log(`📋 ${routeSteps.length} navigation steps ready`);

        // Add crime markers to navigation map
        if (currentRouteData.rawCrimeData && currentRouteData.rawCrimeData.length > 0) {
            // Remove existing crime markers if any
            if (navCrimeMarkerClusterGroup && navigationMap) {
                navigationMap.removeLayer(navCrimeMarkerClusterGroup);
            }

            // Filter to recent violent crimes
            const recentCrimes = filterRecentViolentCrimes(currentRouteData.rawCrimeData);

            if (recentCrimes.length > 0) {
                navCrimeMarkerClusterGroup = addCrimeMarkersToMap(navigationMap, recentCrimes, currentRoute);
            }
        }

        // Draw ALL routes on navigation map with visual distinction
        // Remove existing ombre routes
        if (navOmbreRouteLayer && navigationMap) {
            navigationMap.removeLayer(navOmbreRouteLayer);
        }
        if (navAlternativeOmbreLayer && navigationMap) {
            navigationMap.removeLayer(navAlternativeOmbreLayer);
        }

        // Draw routes in correct order: selected first (bottom), then alternative (top)
        // First pass: Draw the selected route
        routeOptions.forEach((routeOption, idx) => {
            const isSelected = (idx === selectedRouteIndex);
            if (isSelected) {
                if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                    // Draw ombre route with crime data
                    navOmbreRouteLayer = drawOmbreRoute(
                        navigationMap,
                        routeOption.route.coordinates,
                        routeOption.crimeSamples,
                        0.8,  // opacity: selected
                        null  // dashArray: solid
                    );
                } else {
                    // Draw basic route (no crime data available)
                    navOmbreRouteLayer = drawBasicRoute(
                        navigationMap,
                        routeOption.route.coordinates,
                        0.8,  // opacity: selected
                        null,  // dashArray: solid
                        '#4285f4'  // color: blue
                    );
                }
            }
        });

        // Second pass: Draw the alternative route (on top)
        routeOptions.forEach((routeOption, idx) => {
            const isSelected = (idx === selectedRouteIndex);
            if (!isSelected) {
                if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                    // Draw ombre route with crime data
                    navAlternativeOmbreLayer = drawOmbreRoute(
                        navigationMap,
                        routeOption.route.coordinates,
                        routeOption.crimeSamples,
                        0.4,  // opacity: alternative
                        '10, 10'  // dashArray: dashed
                    );
                } else {
                    // Draw basic route (no crime data available)
                    navAlternativeOmbreLayer = drawBasicRoute(
                        navigationMap,
                        routeOption.route.coordinates,
                        0.4,  // opacity: alternative (faded)
                        '10, 10',  // dashArray: dashed
                        '#4285f4'  // color: blue
                    );
                }
            }
        });

        // No need to hide routing control lines - we disabled them with styles: []

        // Ensure map is properly sized after route is added
        setTimeout(() => {
            if (navigationMap) {
                navigationMap.invalidateSize();
            }
        }, 200);
    });

    return true;
}

// ========================================
// ROUTE CALCULATION WITH OSRM
// ========================================

/**
 * The main function that calculates walking routes and displays them on the map.
 * This is the "heart" of the routing system - it connects all the pieces together.
 *
 * WHAT IT DOES (in order):
 * 1. Creates a Leaflet Routing Machine control to calculate routes
 * 2. Sends request to OSRM (Open Source Routing Machine) for walking directions
 * 3. When routes are found, for EACH route:
 *    - Calculates distance and walking time
 *    - Fetches crime data along the route (via safetyService)
 *    - Calculates a safety score (0-10)
 * 4. Auto-selects the safest route
 * 5. Updates global state (currentRoute, currentRouteData, routeOptions)
 * 6. Draws the ombre-colored routes on the map
 * 7. Adds crime markers to the map
 * 8. Updates the UI (route comparison cards, safety display)
 *
 * IMPORTANT CONCEPTS:
 * - OSRM = Open Source Routing Machine (free routing API, like Google Directions)
 * - The function is ASYNC because it waits for:
 *   a) Routes from OSRM
 *   b) Crime data from SF Open Data API
 *   c) Sunset times from sunrise-sunset API
 *
 * STATE CHANGES:
 * This function modifies these global variables:
 * - routingControl (the Leaflet routing control)
 * - routeOptions (array of all calculated routes)
 * - selectedRouteIndex (which route is selected)
 * - currentRoute (the selected route object)
 * - currentRouteData (distance, duration, safety score, etc.)
 * - ombreRouteLayer (the colored route line)
 * - alternativeOmbreLayer (the dashed alternative route)
 * - crimeMarkerClusterGroup (crime markers on map)
 *
 * @param {Object} start - The starting location
 * @param {number} start.lat - Starting latitude (e.g., 37.7749)
 * @param {number} start.lng - Starting longitude (e.g., -122.4194)
 * @param {string} start.name - Display name (e.g., "Union Square, San Francisco")
 * @param {Object} end - The destination location (same structure as start)
 * @param {L.Map|null} [targetMap=null] - Which map to draw on. If null, uses routeMap.
 * @returns {void} This function doesn't return anything - it updates global state and UI
 *
 * @example
 * // Called when user clicks "Find Safest Route" button:
 * calculateAndDisplayRoute(
 *   { lat: 37.7749, lng: -122.4194, name: "Union Square" },
 *   { lat: 37.8077, lng: -122.4177, name: "Fisherman's Wharf" }
 * );
 *
 * @fires routesfound - Leaflet event when OSRM returns routes
 * @fires routingerror - Leaflet event if routing fails
 *
 * @called-by initializeRouteMap() - when map is ready and locations are set
 * @calls calculateSafetyScore() - for each route found
 * @calls drawOmbreRoute() - to draw colored route lines
 * @calls addCrimeMarkersToMap() - to show crime locations
 * @calls updateRouteDisplay() - to update distance/time in UI
 * @calls updateSafetyDisplay() - to update safety score in UI
 * @calls updateRouteComparisonUI() - to build route comparison cards
 */
function calculateAndDisplayRoute(start, end, targetMap = null) {
    console.log('🔍 Calculating route with OSRM...');
    console.log('From:', start.name);
    console.log('To:', end.name);

    const map = targetMap || routeMap;

    if (!map) {
        console.error('❌ Map not initialized');
        return;
    }

    // Remove existing routing control if any
    if (routingControl) {
        map.removeControl(routingControl);
    }

    // Adjust route color based on current mode
    const routeColor = currentMode === 'dark' ? '#ff69b4' : '#ff1493';
    const routeOpacity = currentMode === 'dark' ? 1.0 : 0.8;

    // Create routing control with custom styling
    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(start.lat, start.lng),
            L.latLng(end.lat, end.lng)
        ],
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'foot', // Walking mode
            alternatives: true // Request alternative routes
        }),
        lineOptions: {
            styles: [],  // Empty array = no lines drawn (we use ombre routes instead)
            extendToWaypoints: false,
            missingRouteTolerance: 0
        },
        createMarker: function(i, waypoint, n) {
            return L.marker(waypoint.latLng, {
                icon: pinkIcon,
                draggable: false
            }).bindPopup(i === 0 ? 'Start' : 'Destination');
        },
        show: false, // Hide the routing instructions panel
        addWaypoints: false,
        routeWhileDragging: false,
        fitSelectedRoutes: true,
        showAlternatives: false // We handle alternatives manually for better control
    }).addTo(map);

    // Listen for route found
    routingControl.on('routesfound', async function(e) {
        const routes = e.routes;
        console.log(`🗺️ Found ${routes.length} route(s)`);

        // Clear previous route options
        routeOptions = [];

        // Process all routes in parallel
        const routePromises = routes.map(async (route, index) => {
            // Extract distance and time from OSRM
            const distanceMeters = route.summary.totalDistance;
            const timeSeconds = route.summary.totalTime;

            // Convert to imperial units
            const distanceMiles = metersToMiles(distanceMeters);

            // MVP WORKAROUND: Calculate walking time manually
            const durationMinutes = (distanceMiles / 3.5) * 60;

            // Format for display
            const distanceText = formatDistance(distanceMiles);
            const durationText = formatDuration(durationMinutes);

            // Calculate safety score (ASYNC for Phase 2B)
            // PHASE 2C: Pass currentUserLocation and sampleRoutePoints function
            const safetyData = await calculateSafetyScore(route, start, end, currentUserLocation, sampleRoutePoints);

            return {
                route: route,
                index: index,
                distance: distanceMiles,
                duration: durationMinutes,
                distanceText: distanceText,
                durationText: durationText,
                safetyScore: safetyData.score,
                safetyLabel: safetyData.label,
                safetyColor: safetyData.color,
                safetyBreakdown: safetyData.breakdown,
                usingCrimeData: safetyData.usingCrimeData,
                inSanFrancisco: safetyData.inSanFrancisco,
                crimeCount: safetyData.breakdown.crimeData?.count || 0,
                rawCrimeData: safetyData.rawCrimeData,
                crimeSamples: safetyData.crimeSamples,
                showNighttimeWarning: safetyData.showNighttimeWarning
            };
        });

        // Wait for all routes to be processed
        routeOptions = await Promise.all(routePromises);

        // AUTO-SELECT SAFEST ROUTE
        // When multiple routes are available, automatically select the one
        // with the highest safety score. This is a key UX feature - users
        // see the safest option first, but can switch to alternatives.
        selectedRouteIndex = 0;
        if (routeOptions.length > 1) {
            // Using reduce to find the index of the route with max safety score
            // reduce(callback, initialValue) - starts at index 0, compares each route
            const safestIndex = routeOptions.reduce((maxIdx, route, idx, arr) =>
                route.safetyScore > arr[maxIdx].safetyScore ? idx : maxIdx, 0
            );
            selectedRouteIndex = safestIndex;
            console.log(`🎯 Auto-selected Route ${safestIndex + 1} (safer option)`);
        }

        // Set current route data to selected route
        const selectedRoute = routeOptions[selectedRouteIndex];

        // Store route data from selected route
        currentRouteData = {
            distance: selectedRoute.distance,
            duration: selectedRoute.duration,
            distanceText: selectedRoute.distanceText,
            durationText: selectedRoute.durationText,
            safetyScore: selectedRoute.safetyScore,
            safetyLabel: selectedRoute.safetyLabel,
            safetyColor: selectedRoute.safetyColor,
            safetyBreakdown: selectedRoute.safetyBreakdown,
            usingCrimeData: selectedRoute.usingCrimeData,
            inSanFrancisco: selectedRoute.inSanFrancisco,
            crimeCount: selectedRoute.crimeCount,
            rawCrimeData: selectedRoute.rawCrimeData,
            crimeSamples: selectedRoute.crimeSamples,
            showNighttimeWarning: selectedRoute.showNighttimeWarning
        };

        console.log(`📏 Distance: ${selectedRoute.distanceText}`);
        console.log(`⏱️ Duration: ${selectedRoute.durationText}`);
        console.log(`🛡️ Safety Score: ${selectedRoute.safetyScore}/10 (${selectedRoute.safetyLabel})`);
        if (selectedRoute.usingCrimeData) {
            console.log(`🚨 Crime Data: ${selectedRoute.crimeCount} incidents (last 90 days)`);
        }

        // Store current route (selected route)
        currentRoute = selectedRoute.route;

        // Update UI with real data
        updateRouteDisplay();
        updateSafetyDisplay(() => currentRouteData);

        // Add crime markers to map for SELECTED route only
        if (selectedRoute.rawCrimeData && selectedRoute.rawCrimeData.length > 0) {
            // Remove existing crime markers if any
            if (crimeMarkerClusterGroup && map) {
                map.removeLayer(crimeMarkerClusterGroup);
            }

            // Filter to recent violent crimes
            const recentCrimes = filterRecentViolentCrimes(selectedRoute.rawCrimeData);

            if (recentCrimes.length > 0) {
                crimeMarkerClusterGroup = addCrimeMarkersToMap(map, recentCrimes, selectedRoute.route);
            } else {
                console.log('ℹ️ No recent violent/theft crimes in last 7 days');
            }
        }

        // Draw ALL routes with ombre coloring
        // Remove existing ombre routes
        if (ombreRouteLayer && map) {
            map.removeLayer(ombreRouteLayer);
        }
        if (alternativeOmbreLayer && map) {
            map.removeLayer(alternativeOmbreLayer);
        }

        // Draw routes in correct order: selected first (bottom), then alternative (top)
        // This ensures the alternative route (dashed/faded) is visible on top

        // First pass: Draw the selected route
        routeOptions.forEach((routeOption, idx) => {
            const isSelected = (idx === selectedRouteIndex);
            if (isSelected) {
                if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                    // Draw ombre route with crime data
                    const ombreLayer = drawOmbreRoute(
                        map,
                        routeOption.route.coordinates,
                        routeOption.crimeSamples,
                        0.8,  // opacity: selected
                        null  // dashArray: solid
                    );
                    ombreRouteLayer = ombreLayer;
                } else {
                    // Draw basic route (no crime data available)
                    const basicLayer = drawBasicRoute(
                        map,
                        routeOption.route.coordinates,
                        0.8,  // opacity: selected
                        null,  // dashArray: solid
                        '#4285f4'  // color: blue
                    );
                    ombreRouteLayer = basicLayer;
                }
            }
        });

        // Second pass: Draw the alternative route (on top)
        routeOptions.forEach((routeOption, idx) => {
            const isSelected = (idx === selectedRouteIndex);
            if (!isSelected) {
                if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                    // Draw ombre route with crime data
                    const ombreLayer = drawOmbreRoute(
                        map,
                        routeOption.route.coordinates,
                        routeOption.crimeSamples,
                        0.4,  // opacity: alternative
                        '10, 10'  // dashArray: dashed
                    );
                    alternativeOmbreLayer = ombreLayer;
                } else {
                    // Draw basic route (no crime data available)
                    const basicLayer = drawBasicRoute(
                        map,
                        routeOption.route.coordinates,
                        0.4,  // opacity: alternative (faded)
                        '10, 10',  // dashArray: dashed
                        '#4285f4'  // color: blue
                    );
                    alternativeOmbreLayer = basicLayer;
                }
            }
        });

        // No need to hide routing control lines - we disabled them with styles: []

        // Update route comparison UI
        updateRouteComparisonUI();
    });

    // Listen for routing errors
    routingControl.on('routingerror', function(e) {
        console.error('❌ Routing error:', e.error);
        alert('⚠️ Could not calculate route. Please try different addresses.');
    });
}

// ========================================
// ROUTE COMPARISON UI
// ========================================

/**
 * Build and display the route comparison cards
 *
 * WHAT IT DOES:
 * Creates the side-by-side route comparison cards that let users
 * choose between Route 1 and Route 2. Each card shows distance,
 * duration, safety score, and crime count.
 *
 * UI STRUCTURE:
 * - Clears existing cards
 * - Creates a card for each route in routeOptions[]
 * - Highlights the currently selected route
 * - Adds "Select Route" button click handlers
 *
 * DATA SOURCE: routeOptions array (populated by calculateAndDisplayRoute)
 *
 * CALLED BY: calculateAndDisplayRoute() after both routes are scored
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

        const card = document.createElement('div');
        card.className = `route-card ${isSelected ? 'selected' : ''}`;
        card.dataset.routeIndex = index;

        card.innerHTML = `
            <div class="route-card-header">
                <h3>Route ${index + 1} ${isSelected ? '(Selected)' : ''}</h3>
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
                    <span class="route-stat-value">${routeOption.safetyScore}/100</span>
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
 * Switches the selected route when user clicks on a different route option.
 * This is called when user clicks "Route 1" or "Route 2" in the comparison cards.
 *
 * WHAT IT DOES:
 * 1. Updates the selectedRouteIndex to the new route
 * 2. Redraws both routes on the map:
 *    - Selected route: solid line, full opacity (0.8)
 *    - Alternative route: dashed line, faded opacity (0.4)
 * 3. Updates all the global state (currentRoute, currentRouteData)
 * 4. Updates all UI elements:
 *    - Route comparison cards (highlights selected)
 *    - Route info panel (distance, duration)
 *    - Safety display (score, breakdown)
 * 5. Updates crime markers to show crimes for the newly selected route
 *
 * VISUAL CHANGES:
 * Before: Route 1 = solid, Route 2 = dashed
 * After clicking Route 2: Route 2 = solid, Route 1 = dashed
 *
 * LAYER ORDER MATTERS:
 * We draw the selected route FIRST (bottom layer), then the alternative SECOND (top layer).
 * This ensures the dashed alternative line is visible on top of the solid selected line.
 *
 * STATE CHANGES:
 * This function modifies these global variables:
 * - selectedRouteIndex (which route is selected: 0 or 1)
 * - currentRoute (the Leaflet route object)
 * - currentRouteData (distance, duration, safety score, etc.)
 * - ombreRouteLayer (the selected route's colored line)
 * - alternativeOmbreLayer (the alternative route's dashed line)
 * - crimeMarkerClusterGroup (crime markers for selected route)
 *
 * @param {number} newIndex - The index of the route to select (0 = first route, 1 = second route)
 * @returns {void} Returns early if the route is already selected
 *
 * @example
 * // User clicks on "Route 2" card:
 * selectRoute(1);  // Switches from Route 1 to Route 2
 *
 * // User clicks on already-selected route:
 * selectRoute(0);  // Returns early, does nothing
 *
 * @called-by updateRouteComparisonUI() - click event listener on route cards
 * @calls drawOmbreRoute() - to redraw route with new styling
 * @calls drawBasicRoute() - fallback if no crime data
 * @calls updateRouteComparisonUI() - to update card highlighting
 * @calls updateRouteInfo() - to update route info panel
 * @calls updateRouteDisplay() - to update distance/duration display
 * @calls updateSafetyDisplay() - to update safety score display
 * @calls addCrimeMarkersToMap() - to show crimes for new route
 */
function selectRoute(newIndex) {
    if (newIndex === selectedRouteIndex) {
        return; // Already selected
    }

    selectedRouteIndex = newIndex;
    console.log(`🎯 User selected Route ${newIndex + 1}`);

    // Redraw routes with new visual distinction
    // Ensure old layers are fully removed before redrawing
    console.log('🧹 Removing old route layers...');
    if (ombreRouteLayer && routeMap) {
        console.log('  - Removing ombreRouteLayer');
        routeMap.removeLayer(ombreRouteLayer);
        ombreRouteLayer = null;  // Reset to null to ensure clean state
    }
    if (alternativeOmbreLayer && routeMap) {
        console.log('  - Removing alternativeOmbreLayer');
        routeMap.removeLayer(alternativeOmbreLayer);
        alternativeOmbreLayer = null;  // Reset to null to ensure clean state
    }

    console.log(`🎨 Redrawing ${routeOptions.length} routes with new styling...`);

    // IMPORTANT: Draw in reverse order so alternative route appears on top
    // 1. Draw SELECTED route first (bottom layer)
    // 2. Draw ALTERNATIVE route second (top layer - dashed/faded will be visible)

    // First pass: Draw the selected route
    routeOptions.forEach((routeOption, idx) => {
        const isSelected = (idx === selectedRouteIndex);
        if (isSelected) {
            const opacity = 0.8;
            const dashArray = null;

            console.log(`  - Route ${idx + 1}: SELECTED (opacity: ${opacity}, dashArray: ${dashArray}) [BOTTOM LAYER]`);

            if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                // Draw ombre route with crime data
                const ombreLayer = drawOmbreRoute(
                    routeMap,
                    routeOption.route.coordinates,
                    routeOption.crimeSamples,
                    opacity,
                    dashArray
                );
                ombreRouteLayer = ombreLayer;
            } else {
                // Draw basic route (no crime data available)
                const basicLayer = drawBasicRoute(
                    routeMap,
                    routeOption.route.coordinates,
                    opacity,
                    dashArray,
                    '#4285f4'
                );
                ombreRouteLayer = basicLayer;
            }
            console.log('    ✓ Stored as ombreRouteLayer (selected)');
        }
    });

    // Second pass: Draw the alternative route (on top)
    routeOptions.forEach((routeOption, idx) => {
        const isSelected = (idx === selectedRouteIndex);
        if (!isSelected) {
            const opacity = 0.4;
            const dashArray = '10, 10';

            console.log(`  - Route ${idx + 1}: alternative (opacity: ${opacity}, dashArray: ${dashArray}) [TOP LAYER]`);

            if (routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                // Draw ombre route with crime data
                const ombreLayer = drawOmbreRoute(
                    routeMap,
                    routeOption.route.coordinates,
                    routeOption.crimeSamples,
                    opacity,
                    dashArray
                );
                alternativeOmbreLayer = ombreLayer;
            } else {
                // Draw basic route (no crime data available)
                const basicLayer = drawBasicRoute(
                    routeMap,
                    routeOption.route.coordinates,
                    opacity,
                    dashArray,
                    '#4285f4'
                );
                alternativeOmbreLayer = basicLayer;
            }
            console.log('    ✓ Stored as alternativeOmbreLayer (alternative)');
        }
    });

    // No need to hide routing control lines - we disabled them with styles: []

    // Update UI to reflect selection
    updateRouteComparisonUI();

    // Update main route info panel with selected route data
    const selectedRoute = routeOptions[selectedRouteIndex];
    updateRouteInfo(selectedRoute);

    // Update currentRoute and currentRouteData for navigation
    currentRoute = selectedRoute.route;
    currentRouteData = {
        distance: selectedRoute.distance,
        duration: selectedRoute.duration,
        distanceText: selectedRoute.distanceText,
        durationText: selectedRoute.durationText,
        safetyScore: selectedRoute.safetyScore,
        safetyLabel: selectedRoute.safetyLabel,
        safetyColor: selectedRoute.safetyColor,
        safetyBreakdown: selectedRoute.safetyBreakdown,
        usingCrimeData: selectedRoute.usingCrimeData,
        inSanFrancisco: selectedRoute.inSanFrancisco,
        crimeCount: selectedRoute.crimeCount,
        rawCrimeData: selectedRoute.rawCrimeData,
        crimeSamples: selectedRoute.crimeSamples,
        showNighttimeWarning: selectedRoute.showNighttimeWarning
    };

    // Update all safety score displays with new route data
    updateRouteDisplay();
    updateSafetyDisplay(() => currentRouteData);

    // Update crime markers on map for newly selected route
    if (selectedRoute.rawCrimeData && selectedRoute.rawCrimeData.length > 0) {
        // Remove existing crime markers if any
        if (crimeMarkerClusterGroup && routeMap) {
            routeMap.removeLayer(crimeMarkerClusterGroup);
        }

        // Add new crime markers for selected route
        // Filter to recent violent crimes (last 7 days)
        const recentCrimes = filterRecentViolentCrimes(selectedRoute.rawCrimeData);
        if (recentCrimes.length > 0) {
            crimeMarkerClusterGroup = addCrimeMarkersToMap(routeMap, recentCrimes, selectedRoute.route);
        }
    } else if (crimeMarkerClusterGroup && routeMap) {
        // Remove crime markers if new route has no crime data
        routeMap.removeLayer(crimeMarkerClusterGroup);
    }
}

function updateRouteInfo(routeData) {
    // Update the main route info panel (Phase 1 UI)
    const routeInfoPanel = document.getElementById('route-info');
    const distanceSpan = document.getElementById('distance');
    const durationSpan = document.getElementById('duration');
    const safetyScoreSpan = document.getElementById('safety-score');
    const safetyLabelSpan = document.getElementById('safety-label');

    if (distanceSpan) distanceSpan.textContent = routeData.distanceText;
    if (durationSpan) durationSpan.textContent = routeData.durationText;
    if (safetyScoreSpan) safetyScoreSpan.textContent = `${routeData.safetyScore}/100`;
    if (safetyLabelSpan) {
        safetyLabelSpan.textContent = routeData.safetyLabel;
        safetyLabelSpan.style.backgroundColor = routeData.safetyColor + '20';
        safetyLabelSpan.style.color = routeData.safetyColor;
    }

    // Update nighttime warning
    const nighttimeWarning = document.getElementById('nighttime-warning');
    if (nighttimeWarning) {
        nighttimeWarning.style.display = routeData.showNighttimeWarning ? 'flex' : 'none';
    }

    // Update "View Crime Details" button data
    const viewCrimeDetailsBtn = document.getElementById('view-crime-details');
    if (viewCrimeDetailsBtn) {
        viewCrimeDetailsBtn.onclick = () => showCrimeBreakdown(routeData.safetyBreakdown);
    }
}

// ========================================
// GEOGRAPHIC UTILITIES & FORMATTING
// Note: Core utilities imported from utils.js
// ========================================

/**
 * Update route information displays with current route data
 *
 * WHAT IT DOES:
 * Syncs the UI elements (distance, duration, safety score) with the
 * values stored in currentRouteData. Called whenever the selected
 * route changes.
 *
 * ELEMENTS UPDATED:
 * - #route-duration: Walking time on route results screen
 * - #nav-distance: Distance on navigation screen
 * - #nav-duration: Duration on navigation screen
 * - #nav-safety-score: Safety score badge on navigation screen
 *
 * CALLED BY: selectRoute(), after route calculation completes
 */
function updateRouteDisplay() {

    // Update route results screen (time)
    const routeDurationElement = document.getElementById('route-duration');
    if (routeDurationElement && currentRouteData.durationText) {
        routeDurationElement.textContent = currentRouteData.durationText;
        console.log(`Updated route duration: ${currentRouteData.durationText}`);
    }

    // Update navigation screen (distance and time)
    const navDistanceElement = document.getElementById('nav-distance');
    if (navDistanceElement && currentRouteData.distanceText) {
        navDistanceElement.textContent = currentRouteData.distanceText;
        console.log(`Updated nav distance: ${currentRouteData.distanceText}`);
    }

    const navDurationElement = document.getElementById('nav-duration');
    if (navDurationElement && currentRouteData.durationText) {
        navDurationElement.textContent = currentRouteData.durationText;
        console.log(`Updated nav duration: ${currentRouteData.durationText}`);
    }

    // Update navigation screen safety score
    const navSafetyScoreElement = document.getElementById('nav-safety-score');
    if (navSafetyScoreElement && currentRouteData.safetyScore) {
        navSafetyScoreElement.textContent = currentRouteData.safetyScore.toFixed(1);
        // Apply color class based on safety score
        const colorClass = getSafetyColor(currentRouteData.safetyScore);
        navSafetyScoreElement.className = 'stat-value ' + colorClass;
        console.log(`Updated nav safety score: ${currentRouteData.safetyScore.toFixed(1)} (${colorClass})`);
    }

}

// ========================================
// TURN-BY-TURN NAVIGATION (PHASE 3)
// ========================================

// Check if user is at the start point (for preview vs live mode detection)
/**
 * Check if user is at the route's starting point
 *
 * WHAT IT DOES:
 * Uses GPS to check if the user is physically near the starting location.
 * This determines whether to use "Live Mode" (real GPS tracking) or
 * "Preview Mode" (manual step navigation).
 *
 * HOW IT WORKS:
 * 1. Requests user's current GPS position
 * 2. Calculates distance to the selected start point
 * 3. If within 100 feet: returns true (Live Mode)
 * 4. If farther away: returns false (Preview Mode)
 *
 * CALLED BY: startNavigation()
 *
 * @returns {Promise<boolean>} True if user is at start point (within 100 feet)
 *
 * @example
 * // User clicks "Start Navigation"
 * const atStart = await checkIfAtStartPoint();
 * if (atStart) {
 *     // Enable GPS tracking (Live Mode)
 * } else {
 *     // Use manual step buttons (Preview Mode)
 * }
 */
async function checkIfAtStartPoint() {
    return new Promise((resolve) => {
        // Check if geolocation is supported
        if (!navigator.geolocation) {
            console.log('ℹ️ No GPS available - defaulting to Preview Mode');
            resolve(false);
            return;
        }

        // Try to get current position
        navigator.geolocation.getCurrentPosition(
            // Success
            function(position) {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                const startLat = selectedStart.lat;
                const startLng = selectedStart.lng;

                const distance = calculateDistance(userLat, userLng, startLat, startLng);
                const distanceFeet = distance * 5280;

                console.log(`📍 Distance to start point: ${distanceFeet.toFixed(0)} ft`);

                // Within 100 feet = at start point
                if (distanceFeet <= 100) {
                    console.log('✅ User is at start point - Live Mode');
                    resolve(true);
                } else {
                    console.log(`ℹ️ User is ${distanceFeet.toFixed(0)} ft from start - Preview Mode`);
                    resolve(false);
                }
            },
            // Error
            function(error) {
                console.log('⚠️ GPS permission denied or unavailable - Preview Mode');
                resolve(false);
            },
            // Options
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    });
}

/**
 * Start turn-by-turn navigation mode
 *
 * WHAT IT DOES:
 * This is the main entry point for navigation. When the user clicks
 * "Start Navigation", this function sets up everything needed for
 * turn-by-turn directions.
 *
 * NAVIGATION MODES:
 * - LIVE MODE: User is at the start point → GPS tracking is active
 * - PREVIEW MODE: User is far from start → Manual "Next/Previous" buttons
 *
 * HOW IT WORKS:
 * 1. Checks if a route exists (shows error if not)
 * 2. Detects if user is at start point (determines mode)
 * 3. Sets up navigation state variables
 * 4. Navigates to the navigation screen
 * 5. Triggers map initialization sequence
 *
 * STATE CHANGES:
 * - isNavigating = true
 * - isPreviewMode = true/false (based on location)
 * - currentStepIndex = 0
 * - destinationLocation = selectedDestination
 *
 * CALLED WHEN: User clicks "Start Navigation" button on route results screen
 *
 * @async
 * @returns {Promise<void>}
 */
async function startNavigation() {
    console.log('🧭 Starting navigation...');

    if (!currentRoute || !selectedStart || !selectedDestination) {
        alert('⚠️ No route calculated. Please plan a route first.');
        return;
    }

    // Detect if user is at start point (Preview vs Live mode)
    const atStartPoint = await checkIfAtStartPoint();
    isPreviewMode = !atStartPoint;

    console.log(`📋 Mode: ${isPreviewMode ? 'PREVIEW' : 'LIVE'}`);

    // Set navigation state
    destinationLocation = selectedDestination;
    currentStepIndex = 0;
    isNavigating = true;
    isRecalculating = false;

    console.log('📋 Initializing navigation mode...');

    // Navigate to navigation screen FIRST
    goToScreen('screen-active-navigation');

    // Wait for screen transition, then initialize everything
    setTimeout(() => {
        initializeNavigationSequence();
    }, 300); // Give screen time to render and DOM to update
}

/**
 * Initialize navigation components in the correct order
 *
 * WHAT IT DOES:
 * Sets up the navigation map and route display in a careful sequence
 * to ensure everything loads properly. Uses timeouts to wait for
 * DOM and map tiles to be ready.
 *
 * SEQUENCE:
 * 1. Initialize the navigation map (creates Leaflet map)
 * 2. Wait 400ms for map container to stabilize
 * 3. Display the route on the navigation map
 * 4. Wait 800ms for route to be calculated
 * 5. Start GPS tracking (if in Live Mode)
 *
 * WHY THE DELAYS:
 * - Maps need their container fully rendered before initialization
 * - OSRM route calculation is asynchronous and takes time
 * - Rushing causes "Map container not found" errors
 *
 * CALLED BY: startNavigation() after screen transition
 */
function initializeNavigationSequence() {
    console.log('🔄 Initializing navigation sequence...');

    // Step 1: Initialize the navigation map
    const mapInitialized = initializeNavigationMap();

    if (!mapInitialized) {
        alert('⚠️ Failed to initialize navigation map. Please try again.');
        goToScreen('screen-route-results');
        return;
    }

    // Step 2: Wait for map to be fully ready, then display route
    setTimeout(() => {
        const routeDisplayed = displayRouteOnNavigationMap();

        if (!routeDisplayed) {
            alert('⚠️ Failed to display route. Please try again.');
            goToScreen('screen-route-results');
            return;
        }

        // Step 3: Wait for route to be calculated, then start GPS
        // The routesfound event will populate routeSteps and routeCoordinates
        // We need to wait a bit for OSRM to return the route
        setTimeout(() => {
            if (routeSteps.length === 0) {
                console.log('⏳ Waiting for route calculation...');
                // Wait a bit longer if route isn't ready yet
                setTimeout(startNavigationAfterMapReady, 1500);
            } else {
                startNavigationAfterMapReady();
            }
        }, 800);

    }, 400); // Wait for map tiles to load and container to stabilize
}

/**
 * Complete navigation setup after the map is ready
 *
 * WHAT IT DOES:
 * Final step in navigation initialization. Verifies that route steps
 * are available, starts GPS tracking (if in Live Mode), and shows
 * the first turn-by-turn instruction.
 *
 * PRECONDITIONS:
 * - Navigation map must be initialized
 * - Route must be displayed and calculated
 * - routeSteps array should be populated by OSRM
 *
 * ACTIONS:
 * 1. Verifies routeSteps are available (shows error if not)
 * 2. Starts GPS tracking in Live Mode (skips in Preview Mode)
 * 3. Updates navigation UI with first instruction
 *
 * CALLED BY: initializeNavigationSequence() via setTimeout
 */
function startNavigationAfterMapReady() {

    if (routeSteps.length === 0) {
        console.error('❌ Route steps not available');
        alert('⚠️ Navigation data not ready. Please try again.');
        goToScreen('screen-route-results');
        return;
    }

    console.log(`📋 Route has ${routeSteps.length} steps`);

    // Start GPS tracking ONLY in Live Mode
    if (!isPreviewMode) {
        console.log('🔴 Live Mode: Starting GPS tracking...');
        startGPSTracking();
    } else {
        console.log('🔵 Preview Mode: No GPS tracking');
    }

    // Update UI with first instruction
    updateNavigationUI();

}

/**
 * Start continuous GPS tracking for live navigation
 *
 * WHAT IT DOES:
 * Uses the browser's geolocation API to continuously track the user's
 * position. Each position update triggers navigation updates.
 *
 * HOW IT WORKS:
 * - Uses navigator.geolocation.watchPosition() for continuous updates
 * - Each GPS update triggers updateNavigationPosition()
 * - Stores the watch ID in navigationWatchId for later cleanup
 *
 * GPS OPTIONS:
 * - enableHighAccuracy: true (uses GPS, not just WiFi)
 * - timeout: 10000ms (10 seconds to get a fix)
 * - maximumAge: 0 (always get fresh position, no caching)
 *
 * ERROR HANDLING:
 * - Permission denied: Ends navigation with alert
 * - Position unavailable: Shows status message
 * - Timeout: Shows status message
 *
 * STATE CHANGES:
 * - navigationWatchId = watch ID (for cleanup)
 * - currentUserPosition = updated on each GPS fix
 *
 * CALLED BY: startNavigationAfterMapReady() (only in Live Mode)
 */
function startGPSTracking() {
    console.log('📍 Starting GPS tracking...');

    // Request high-accuracy position updates
    navigationWatchId = navigator.geolocation.watchPosition(
        // Success callback
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const heading = position.coords.heading; // May be null

            currentUserPosition = {
                lat: lat,
                lng: lng,
                heading: heading,
                accuracy: position.coords.accuracy
            };

            console.log(`📍 Position update: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

            // Update navigation
            updateNavigationPosition();
        },
        // Error callback
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
        // Options
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0 // Always get fresh position
        }
    );

}

/**
 * Handle GPS position updates during navigation
 *
 * WHAT IT DOES:
 * This is called every time the GPS reports a new position. It updates
 * the map, checks if the user has reached the next turn, and detects
 * if the user has gone off-route.
 *
 * ACTIONS ON EACH GPS UPDATE:
 * 1. Updates the user's position marker on the map
 * 2. Calculates distance to the next turn/step
 * 3. If within 50 feet of next step → advances to next instruction
 * 4. Checks if user is off-route (>150 feet from route)
 * 5. Updates the navigation UI with current instruction
 *
 * CALLED BY: GPS watchPosition callback (on each position update)
 */
function updateNavigationPosition() {
    if (!isNavigating || !currentUserPosition) return;

    // Update map with current position
    updateNavigationMap();

    // Check if we've reached the current step
    if (currentStepIndex < routeSteps.length) {
        const currentStep = routeSteps[currentStepIndex];
        const stepLocation = currentStep.latLng || { lat: currentStep.lat, lng: currentStep.lng };

        if (stepLocation && stepLocation.lat && stepLocation.lng) {
            const distanceToStep = calculateDistance(
                currentUserPosition.lat,
                currentUserPosition.lng,
                stepLocation.lat,
                stepLocation.lng
            );

            console.log(`📏 Distance to next step: ${(distanceToStep * 5280).toFixed(0)} ft`);

            // If within 50 feet of the next step, advance
            if (distanceToStep < 0.01) { // ~50 feet
                advanceToNextStep();
            }
        }
    }

    // Check if off-route (unless currently recalculating)
    if (!isRecalculating) {
        checkIfOffRoute();
    }

    // Update UI
    updateNavigationUI();
}

/**
 * Move to the next turn-by-turn instruction
 *
 * WHAT IT DOES:
 * Increments the current step counter and updates the UI. If this was
 * the last step, triggers the arrival celebration.
 *
 * CALLED BY:
 * - updateNavigationPosition() when user reaches a waypoint
 * - nextStep() for manual navigation in Preview Mode
 *
 * STATE CHANGES:
 * - currentStepIndex++ (moves to next instruction)
 */
function advanceToNextStep() {
    currentStepIndex++;

    if (currentStepIndex >= routeSteps.length) {
        // Arrived at destination!
        console.log('🎉 Arrived at destination!');
        handleArrival();
        return;
    }

    console.log(`➡️ Advanced to step ${currentStepIndex + 1}/${routeSteps.length}`);
    updateNavigationUI();
}

/**
 * Manual "Next Step" button for Preview Mode
 *
 * WHAT IT DOES:
 * Allows users to manually step through navigation instructions when
 * they're not physically at the route (Preview Mode). Only works in
 * Preview Mode - does nothing in Live Mode.
 *
 * CALLED WHEN: User clicks "Next" button in navigation screen (Preview Mode only)
 */
function nextStep() {
    if (!isPreviewMode) return; // Only works in preview mode

    if (currentStepIndex < routeSteps.length - 1) {
        currentStepIndex++;
        console.log(`➡️ Next step: ${currentStepIndex + 1}/${routeSteps.length}`);
        updateNavigationUI();
    }
}

/**
 * Manual "Previous Step" button for Preview Mode
 *
 * WHAT IT DOES:
 * Allows users to go back to a previous instruction when previewing
 * the route. Only works in Preview Mode - does nothing in Live Mode.
 *
 * CALLED WHEN: User clicks "Previous" button in navigation screen (Preview Mode only)
 */
function previousStep() {
    if (!isPreviewMode) return; // Only works in preview mode

    if (currentStepIndex > 0) {
        currentStepIndex--;
        console.log(`⬅️ Previous step: ${currentStepIndex + 1}/${routeSteps.length}`);
        updateNavigationUI();
    }
}

/**
 * Detect if user has strayed too far from the route
 *
 * WHAT IT DOES:
 * Calculates the user's distance from the route line. If they've
 * wandered more than 150 feet away, triggers route recalculation.
 *
 * HOW IT WORKS:
 * 1. Uses calculateDistanceToPolyline() to find nearest point on route
 * 2. If distance > 150 feet, calls recalculateRoute()
 *
 * OFF-ROUTE THRESHOLD: 150 feet
 *
 * CALLED BY: updateNavigationPosition() on each GPS update
 */
function checkIfOffRoute() {
    if (!currentUserPosition || !routeCoordinates || routeCoordinates.length === 0) {
        return;
    }

    // Calculate distance to route
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

/**
 * Recalculate the route from the user's current position
 *
 * WHAT IT DOES:
 * When the user goes off-route, this creates a new route from their
 * current GPS position to the original destination. Shows "Recalculating..."
 * status while working.
 *
 * HOW IT WORKS:
 * 1. Sets isRecalculating = true to prevent multiple calls
 * 2. Creates new start waypoint from currentUserPosition
 * 3. Removes old routing control from map
 * 4. Creates new Leaflet Routing control to destination
 * 5. On route found: updates routeSteps, resets currentStepIndex
 *
 * GUARDS:
 * - Returns immediately if already recalculating
 * - Uses isRecalculating flag to prevent duplicate calls
 *
 * STATE CHANGES:
 * - isRecalculating = true (then false when done)
 * - currentRoute = new route
 * - routeSteps = new steps
 * - currentStepIndex = 0
 *
 * CALLED BY: checkIfOffRoute() when user is >150 feet from route
 */
function recalculateRoute() {
    if (isRecalculating) return;

    isRecalculating = true;
    updateNavigationStatus('Recalculating...', true);

    console.log('🔄 Recalculating route...');

    // Create new start point from current position
    const newStart = {
        lat: currentUserPosition.lat,
        lng: currentUserPosition.lng,
        name: 'Current Position'
    };

    // Remove existing routing control
    if (routingControl && navigationMap) {
        navigationMap.removeControl(routingControl);
    }

    // Calculate new route
    const routeColor = currentMode === 'dark' ? '#ff69b4' : '#ff1493';
    const routeOpacity = currentMode === 'dark' ? 1.0 : 0.8;

    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(newStart.lat, newStart.lng),
            L.latLng(destinationLocation.lat, destinationLocation.lng)
        ],
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'foot'
        }),
        lineOptions: {
            styles: [{ color: routeColor, opacity: routeOpacity, weight: 6 }]
        },
        createMarker: function() { return null; }, // No markers during navigation
        show: false,
        addWaypoints: false,
        routeWhileDragging: false,
        fitSelectedRoutes: false
    }).addTo(navigationMap);

    routingControl.on('routesfound', function(e) {
        const route = e.routes[0];

        // Update route data
        currentRoute = route;
        routeSteps = route.instructions || [];
        routeCoordinates = route.coordinates || [];
        currentStepIndex = 0;

        // Update distance/time
        const distanceMeters = route.summary.totalDistance;
        const timeSeconds = route.summary.totalTime;
        currentRouteData.distance = metersToMiles(distanceMeters);

        // MVP WORKAROUND: Calculate walking time manually (same as initial calculation)
        // TODO: Remove when migrating to Google Maps API
        currentRouteData.duration = (currentRouteData.distance / 3.5) * 60; // 3.5 mph walking speed

        currentRouteData.distanceText = formatDistance(currentRouteData.distance);
        currentRouteData.durationText = formatDuration(currentRouteData.duration);

        isRecalculating = false;
        updateNavigationStatus('ACTIVE ROUTE', true);
        updateNavigationUI();

    });

    routingControl.on('routingerror', function(e) {
        console.error('❌ Recalculation failed:', e.error);
        isRecalculating = false;
        updateNavigationStatus('Recalculation failed', false);
    });
}

/**
 * Update the navigation map with user's current GPS position
 *
 * WHAT IT DOES:
 * Moves the blue position marker to the user's current location and
 * optionally rotates the map based on compass heading.
 *
 * VISUAL UPDATES:
 * 1. Removes old position marker
 * 2. Creates new blue pulsing marker at current position
 * 3. Rotates map pane if heading data available
 * 4. Pans map to keep user centered (without zoom change)
 *
 * DATA SOURCE: currentUserPosition (from GPS watchPosition)
 *
 * CALLED BY: updateNavigationPosition() on each GPS update
 */
function updateNavigationMap() {
    if (!navigationMap || !currentUserPosition) return;

    // Remove existing navigation marker
    if (navigationMarker) {
        navigationMap.removeLayer(navigationMarker);
    }

    // Create blue pulsing marker
    const blueIcon = L.divIcon({
        className: 'current-location-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    // Add navigation marker
    navigationMarker = L.marker([currentUserPosition.lat, currentUserPosition.lng], { icon: blueIcon })
        .addTo(navigationMap);

    // Rotate map if we have heading
    if (currentUserPosition.heading !== null && currentUserPosition.heading !== undefined) {
        const heading = currentUserPosition.heading;

        // Rotate map container
        const mapPane = navigationMap.getPane('mapPane');
        if (mapPane) {
            mapPane.style.transform = `rotate(${-heading}deg)`;
        }
    }

    // Center map on user (but don't zoom, to avoid jarring movement)
    navigationMap.panTo([currentUserPosition.lat, currentUserPosition.lng]);
}

/**
 * Update all navigation screen UI elements
 *
 * WHAT IT DOES:
 * Updates the turn-by-turn instruction display, step counter,
 * distance to next turn, and preview mode buttons.
 *
 * MODE-SPECIFIC BEHAVIOR:
 * - PREVIEW MODE: Shows step counter and prev/next buttons
 * - LIVE MODE: Shows distance calculated from GPS, hides buttons
 *
 * ELEMENTS UPDATED:
 * - #nav-status-text: "ROUTE PREVIEW" or "ACTIVE ROUTE"
 * - #step-counter: "Step 3 of 12" (preview mode only)
 * - #btn-prev-step, #btn-next-step: Visible in preview mode
 * - #instruction-distance: Distance to next turn
 * - #instruction-current: Current instruction text
 * - #instruction-next: Upcoming instruction text
 *
 * DATA SOURCE: routeSteps[], currentStepIndex, currentUserPosition
 *
 * CALLED BY: GPS updates, nextStep(), previousStep(), advanceToNextStep()
 */
function updateNavigationUI() {
    if (!isNavigating) return;

    // Update banner based on mode
    const statusText = document.getElementById('nav-status-text');
    if (statusText) {
        statusText.textContent = isPreviewMode ? 'ROUTE PREVIEW' : 'ACTIVE ROUTE';
    }

    // Update step counter (for preview mode)
    const stepCounter = document.getElementById('step-counter');
    if (stepCounter) {
        stepCounter.textContent = `Step ${currentStepIndex + 1} of ${routeSteps.length}`;
        stepCounter.style.display = isPreviewMode ? 'block' : 'none';
    }

    // Show/hide preview navigation buttons
    const prevBtn = document.getElementById('btn-prev-step');
    const nextBtn = document.getElementById('btn-next-step');
    if (prevBtn && nextBtn) {
        prevBtn.style.display = isPreviewMode ? 'inline-block' : 'none';
        nextBtn.style.display = isPreviewMode ? 'inline-block' : 'none';

        // Disable buttons at boundaries
        prevBtn.disabled = currentStepIndex === 0;
        nextBtn.disabled = currentStepIndex >= routeSteps.length - 1;
    }

    // Get current step
    const currentStep = routeSteps[currentStepIndex];
    const nextStep = currentStepIndex + 1 < routeSteps.length ? routeSteps[currentStepIndex + 1] : null;

    if (currentStep) {
        // Update distance display (LIVE MODE ONLY)
        const distanceElement = document.getElementById('instruction-distance');
        if (distanceElement) {
            if (isPreviewMode) {
                // Preview mode: Show step distance from route data
                const stepDistance = currentStep.distance || 0;
                const stepDistanceMiles = stepDistance / 1609.34; // meters to miles
                if (stepDistanceMiles < 0.1) {
                    const feet = Math.round(stepDistanceMiles * 5280);
                    distanceElement.textContent = `${feet} ft`;
                } else {
                    distanceElement.textContent = `${stepDistanceMiles.toFixed(1)} mi`;
                }
            } else {
                // Live mode: Calculate distance from current position
                let distanceToNext = 0;
                if (currentUserPosition && currentStep.latLng) {
                    distanceToNext = calculateDistance(
                        currentUserPosition.lat,
                        currentUserPosition.lng,
                        currentStep.latLng.lat,
                        currentStep.latLng.lng
                    );
                }

                if (distanceToNext < 0.1) {
                    const feet = Math.round(distanceToNext * 5280);
                    distanceElement.textContent = `in ${feet} ft`;
                } else {
                    distanceElement.textContent = `in ${distanceToNext.toFixed(1)} mi`;
                }
            }
        }

        // Update current instruction
        const currentInstruction = document.getElementById('instruction-current');
        if (currentInstruction) {
            currentInstruction.textContent = currentStep.text || currentStep.instruction || 'Continue';
        }

        // Update next instruction
        const nextInstruction = document.getElementById('instruction-next');
        if (nextInstruction && nextStep) {
            nextInstruction.textContent = `Then ${nextStep.text || nextStep.instruction || 'continue'}`;
        } else if (nextInstruction) {
            nextInstruction.textContent = 'Destination ahead';
        }
    }

    // Update remaining distance/time
    updateNavigationStats();
}

/**
 * Update remaining distance and time estimates during navigation
 *
 * WHAT IT DOES:
 * Calculates straight-line distance from current position to destination
 * and estimates remaining walking time at 3 mph.
 *
 * NOTE: Uses straight-line distance, not route distance. This is a
 * simplification - actual remaining route distance would be more accurate.
 *
 * ELEMENTS UPDATED:
 * - #nav-distance: Remaining distance (e.g., "0.3 mi")
 * - #nav-duration: Estimated time (e.g., "6 min")
 *
 * CALLED BY: updateNavigationUI()
 */
function updateNavigationStats() {
    // Calculate remaining distance from current position to destination
    if (currentUserPosition && destinationLocation) {
        const remainingDistance = calculateDistance(
            currentUserPosition.lat,
            currentUserPosition.lng,
            destinationLocation.lat,
            destinationLocation.lng
        );

        // Estimate remaining time (assuming 3 mph walking speed)
        const walkingSpeedMph = 3;
        const remainingTimeHours = remainingDistance / walkingSpeedMph;
        const remainingTimeMinutes = remainingTimeHours * 60;

        // Update UI
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

/**
 * Update the navigation status banner text and indicator
 *
 * WHAT IT DOES:
 * Changes the status text (e.g., "Recalculating...", "ARRIVED")
 * and toggles the pulsing dot indicator.
 *
 * @param {string} text - Status message to display
 * @param {boolean} isActive - Whether to show the pulsing active indicator
 *
 * CALLED BY: recalculateRoute(), handleArrival(), GPS error handlers
 */
function updateNavigationStatus(text, isActive) {
    const statusText = document.getElementById('nav-status-text');
    if (statusText) {
        statusText.textContent = text;
    }

    const statusDot = document.getElementById('nav-status-dot');
    if (statusDot) {
        if (isActive) {
            statusDot.classList.add('active');
        } else {
            statusDot.classList.remove('active');
        }
    }
}

/**
 * Handle successful arrival at the destination
 *
 * WHAT IT DOES:
 * Called when the user reaches the final waypoint. Stops GPS tracking,
 * updates the UI to show "ARRIVED", and displays a celebration message.
 *
 * ACTIONS:
 * 1. Stops GPS tracking (clears the watch)
 * 2. Sets isNavigating = false
 * 3. Updates status display to "ARRIVED"
 * 4. Shows instruction "You have reached your destination"
 * 5. After 1 second: shows celebration alert
 * 6. Calls endNavigation() to clean up and return to route results
 *
 * CALLED BY: advanceToNextStep() when currentStepIndex >= routeSteps.length
 */
function handleArrival() {
    console.log('🎉 Arrived at destination!');

    // Stop GPS tracking
    if (navigationWatchId) {
        navigator.geolocation.clearWatch(navigationWatchId);
        navigationWatchId = null;
    }

    isNavigating = false;

    // Update UI
    updateNavigationStatus('ARRIVED', true);
    document.getElementById('instruction-distance').textContent = 'Arrived!';
    document.getElementById('instruction-current').textContent = 'You have reached your destination';
    document.getElementById('instruction-next').textContent = '';

    // Show celebration alert
    setTimeout(() => {
        alert('🎉 You have arrived at your destination!\n\nThank you for using PinkPath.');
        endNavigation();
    }, 1000);
}

/**
 * End navigation and clean up all resources
 *
 * WHAT IT DOES:
 * Completely shuts down navigation mode. Stops GPS, removes markers,
 * destroys the navigation map, and returns to the route results screen.
 *
 * CLEANUP ACTIONS:
 * 1. Stops GPS tracking (clears watchPosition)
 * 2. Resets all navigation state variables
 * 3. Removes navigation marker from map
 * 4. Resets map rotation (if heading-based rotation was used)
 * 5. Destroys the navigation map instance
 * 6. Navigates back to route results screen
 *
 * STATE RESET:
 * - isNavigating = false
 * - isPreviewMode = false
 * - currentStepIndex = 0
 * - currentUserPosition = null
 * - isRecalculating = false
 * - navigationMarker = null
 * - navigationMap = null
 *
 * CALLED BY:
 * - handleArrival() after user arrives
 * - User clicking "Exit Navigation" button
 * - GPS permission denied error
 */
function endNavigation() {
    console.log('🛑 Ending navigation...');

    // Stop GPS tracking
    if (navigationWatchId) {
        navigator.geolocation.clearWatch(navigationWatchId);
        navigationWatchId = null;
    }

    // Reset navigation state
    isNavigating = false;
    isPreviewMode = false;
    currentStepIndex = 0;
    currentUserPosition = null;
    isRecalculating = false;

    // Remove navigation marker
    if (navigationMarker && navigationMap) {
        navigationMap.removeLayer(navigationMarker);
        navigationMarker = null;
    }

    // Reset map rotation
    if (navigationMap) {
        const mapPane = navigationMap.getPane('mapPane');
        if (mapPane) {
            mapPane.style.transform = '';
        }
    }

    // Clean up navigation map
    if (navigationMap) {
        navigationMap.remove();
        navigationMap = null;
    }

    // Return to route results screen
    goToScreen('screen-route-results');

}

// ========================================
// EMERGENCY ALERT
// ========================================

/**
 * Show the emergency alert confirmation dialog
 *
 * WHAT IT DOES:
 * Displays a confirmation dialog for triggering an emergency alert.
 * Currently a placeholder - will send location to contacts in future.
 *
 * FUTURE FUNCTIONALITY:
 * - Send GPS location to emergency contacts
 * - Start audio/video recording
 * - Notify local authorities
 *
 * CALLED BY: Emergency button in navigation screen
 */
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
        console.log('Location:', 'Mock GPS: 40.7128° N, 74.0060° W');
        console.log('Time:', new Date().toISOString());

        alert(
            '✅ Emergency Alert Sent!\n\n' +
            'Your emergency contacts have been notified with your current location.\n\n' +
            '(This will be fully functional in future updates)'
        );
    } else {
        console.log('Emergency alert cancelled by user');
    }
}

// ========================================
// PAGE INITIALIZATION HELPERS
// ========================================

/**
 * Wire a button click to a handler (reduces repetitive code)
 * @param {string} id - Button element ID
 * @param {Function} handler - Click handler function
 */
function wireButton(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
}

/**
 * Wire a modal backdrop click to close the modal
 * @param {string} modalId - Modal element ID
 */
function wireModalBackdrop(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.addEventListener('click', (event) => closeModalOnBackdrop(event, modalId));
    }
}

/**
 * Scroll to features section on home screen
 */
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
// PAGE INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Init] PinkPath starting...');

    // ========================================
    // SCREEN INITIALIZATION
    // ========================================
    goToScreen('screen-home');

    // ========================================
    // ROUTE PLANNER COMPONENT INITIALIZATION
    // ========================================
    console.log('[Init] Initializing RoutePlanner components...');

    /**
     * Sync location selection between route planner instances
     * Updates global state and syncs input values to the other instance
     * @param {string} sourceInstance - 'main' or 'home'
     * @param {string} type - 'start' or 'destination'
     * @param {Object} location - {lat, lng, name}
     */
    function syncLocationSelection(sourceInstance, type, location) {
        // Update global state
        if (type === 'start') {
            selectedStart = location;
        } else if (type === 'destination') {
            selectedDestination = location;
        }

        // Sync to the other instance
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
    } else {
        console.error('[Init] Could not find #route-planner-main container');
    }

    // Home screen route planner (simplified - no preferences, no share button)
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
            onRouteRequest: (values, prefs) => findRoute(values, prefs),
            onShareTrip: () => {} // Not used, but required by interface
        });
        homeRoutePlanner.init();
        console.log('[Init] Home RoutePlanner initialized');
    } else {
        console.error('[Init] Could not find #route-planner-home container');
    }

    // ========================================
    // HEADER & DESKTOP NAVIGATION
    // ========================================
    console.log('[Init] Wiring navigation...');
    wireButton('logo-btn', () => goToScreen('screen-home'));
    wireButton('nav-home-btn', () => goToScreen('screen-home'));
    wireButton('nav-plan-route-btn', () => goToScreen('screen-plan-route'));
    wireButton('nav-features-btn', scrollToFeatures);

    // ========================================
    // MOBILE MENU
    // ========================================
    wireButton('mobile-menu-toggle-btn', toggleMobileMenu);
    wireButton('mobile-nav-home-btn', () => { goToScreen('screen-home'); closeMobileMenu(); });
    wireButton('mobile-nav-plan-route-btn', () => { goToScreen('screen-plan-route'); closeMobileMenu(); });
    wireButton('mobile-nav-features-btn', () => { scrollToFeatures(); closeMobileMenu(); });

    // ========================================
    // HOME SCREEN BUTTONS
    // ========================================
    console.log('[Init] Wiring home screen...');
    wireButton('hero-get-started-btn', () => goToScreen('screen-plan-route'));
    wireButton('hero-learn-more-btn', () => openModal('features-modal'));

    // ========================================
    // PLAN ROUTE SCREEN BUTTONS
    // (Now handled by RoutePlanner component - see ROUTE PLANNER COMPONENT INITIALIZATION)
    // ========================================

    // ========================================
    // ROUTE RESULTS SCREEN BUTTONS
    // ========================================
    console.log('[Init] Wiring route results screen...');
    wireButton('back-to-planning-btn', () => goToScreen('screen-plan-route'));
    wireButton('view-crime-details-btn', () => openCrimeDetailsModal(() => currentRouteData, openModal));
    wireButton('start-navigation-btn', startNavigation);
    wireButton('alternative-routes-btn', () => alert('Alternative routes coming soon!'));

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
    // CRIME DETAILS MODAL
    // ========================================
    wireModalBackdrop('crime-details-modal');
    wireButton('crime-modal-close-btn', () => closeModal('crime-details-modal'));
    wireButton('more-info-btn', toggleCrimeDetails);
    wireButton('crime-modal-close-footer-btn', () => closeModal('crime-details-modal'));

    // ========================================
    // INITIALIZATION COMPLETE
    // ========================================
    console.log('[Init] PinkPath ready!');
});

// ========================================
// UTILITY FUNCTIONS
// ========================================

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function isMobile() {
    return window.innerWidth < 768;
}

