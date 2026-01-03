// ========================================
// PINKPATH - MODERN RESPONSIVE WEB APP
// Complete JavaScript Functionality
// OpenStreetMap + Leaflet Implementation
// ========================================

console.log("PinkPath loaded successfully! 🛡️");
console.log("=====================================");
console.log("Using OpenStreetMap + Leaflet");
console.log("No API keys required!");
console.log("=====================================");

// ========================================
// LEAFLET MAP VARIABLES
// ========================================

let routeMap = null;
let navigationMap = null;
let routingControl = null;
let currentRoute = null;
let startMarker = null;
let destinationMarker = null;
let crimeMarkerClusterGroup = null; // Crime markers on route map
let navCrimeMarkerClusterGroup = null; // Crime markers on navigation map
let ombreRouteLayer = null; // Ombre-colored route on route map
let navOmbreRouteLayer = null; // Ombre-colored route on navigation map
let navAlternativeOmbreLayer = null; // Alternative ombre route on navigation map

// Tile layers for light/dark mode
let lightTileLayer = null;
let darkTileLayer = null;
let currentMode = 'light'; // Default to light mode

// Selected locations from autocomplete
let selectedStart = null;
let selectedDestination = null;

// Current user location
let currentUserLocation = null;
let locationMarker = null;

// Current route data (populated when route is calculated)
let currentRouteData = {
    distance: null,         // in miles
    duration: null,         // in minutes
    distanceText: null,     // formatted string
    durationText: null,     // formatted string
    safetyScore: null,      // 0-10 scale
    safetyLabel: null,      // "Excellent", "Good", "Fair", "Caution"
    safetyColor: null,      // CSS class name
    safetyBreakdown: null,  // Object with individual scores
    rawCrimeData: null      // Store raw crime array for detailed analysis
};

// Alternative routes (for route comparison feature)
let routeOptions = [];     // Array of route data objects
let selectedRouteIndex = 0; // Index of currently selected route
let alternativeOmbreLayer = null; // Ombre layer for alternative route

// Navigation state (Phase 3)
let isNavigating = false;
let navigationWatchId = null;
let currentStepIndex = 0;
let routeSteps = [];
let routeCoordinates = [];
let currentUserPosition = null;
let destinationLocation = null;
let navigationMarker = null;
let isRecalculating = false;
let isPreviewMode = false; // Preview mode (far from start) vs Live mode (at start with GPS)

// Default location (New York City - will be replaced with user's location)
const defaultLocation = { lat: 40.7128, lng: -74.0060 };

// ========================================
// CRIME DATA API CONFIGURATION (PHASE 2B)
// ========================================

// San Francisco Open Data - Crime API
const CRIME_API = {
    baseUrl: 'https://data.sfgov.org/resource/wg3w-h783.json',
    appToken: 'HAsCpzT6ovtq42o9dY9OHqtmD',
    radiusMeters: 500, // ~0.3 miles radius for crime queries
    daysBack: 90, // Look back 90 days for recent crime trends
    sampleInterval: 0.15 // Query crimes every 0.15 miles along route (optimized from 0.1)
};

// Crime cache (24-hour cache to reduce API calls)
const crimeCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Sunrise-Sunset API Configuration
const SUNSET_API = {
    baseUrl: 'https://api.sunrise-sunset.org/json',
    cache: new Map(), // Cache sunset/sunrise data
    cacheDuration: CACHE_DURATION
};

// San Francisco bounding box (to detect if route is in SF)
const SF_BOUNDS = {
    north: 37.8324,
    south: 37.7039,
    east: -122.3482,
    west: -122.5155
};

// Crime severity weights for scoring
const CRIME_WEIGHTS = {
    // High severity (violent crimes)
    'Homicide': 5.0,
    'Robbery': 3.0,
    'Assault': 3.0,
    'Sex Offense': 4.0,
    'Human Trafficking': 4.0,

    // Medium severity (property crimes)
    'Burglary': 2.0,
    'Motor Vehicle Theft': 2.0,
    'Arson': 2.5,
    'Weapon Offense': 2.5,

    // Low severity (common crimes)
    'Larceny Theft': 1.0,
    'Vandalism': 1.0,
    'Drug Offense': 1.0,
    'Fraud': 0.8,

    // Excluded categories (return 0)
    'Traffic Violation': 0,
    'Non-Criminal': 0,
    'Lost Property': 0,
    'Miscellaneous': 0
};

// Pink marker icon
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
// SCREEN NAVIGATION
// ========================================

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
// NOMINATIM GEOCODING (Address Autocomplete)
// ========================================

let autocompleteTimeout = null;

// Parse Nominatim result into cleaner format
function parseNominatimResult(result) {
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
        category: result.class
    };
}

// Get icon for location type
function getLocationIcon(parsedResult) {
    if (!parsedResult.isPlace) {
        return '📍'; // Regular address
    }

    const category = parsedResult.category;
    const type = parsedResult.type;

    // Category-based icons
    if (category === 'amenity') {
        if (type === 'restaurant' || type === 'fast_food' || type === 'cafe') return '🍽️';
        if (type === 'bar' || type === 'pub') return '🍺';
        if (type === 'hospital' || type === 'clinic' || type === 'pharmacy') return '🏥';
        if (type === 'school' || type === 'university' || type === 'college') return '🎓';
        if (type === 'bank' || type === 'atm') return '🏦';
        if (type === 'fuel') return '⛽';
        if (type === 'parking') return '🅿️';
        if (type === 'police') return '👮';
        if (type === 'post_office') return '📮';
        if (type === 'library') return '📚';
        return '🏢';
    }

    if (category === 'shop') {
        if (type === 'supermarket' || type === 'convenience') return '🛒';
        if (type === 'mall' || type === 'department_store') return '🏬';
        if (type === 'clothes' || type === 'fashion') return '👔';
        if (type === 'bakery') return '🥖';
        if (type === 'coffee') return '☕';
        return '🏪';
    }

    if (category === 'tourism') {
        if (type === 'hotel' || type === 'motel') return '🏨';
        if (type === 'museum') return '🏛️';
        if (type === 'attraction') return '🎡';
        return '🗺️';
    }

    if (category === 'building') {
        return '🏢';
    }

    return '📍'; // Default
}

function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.display = 'none';
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(dropdown);

    // Add input listener
    input.addEventListener('input', function() {
        const query = input.value.trim();

        if (query.length < 3) {
            dropdown.style.display = 'none';
            return;
        }

        // Debounce requests
        clearTimeout(autocompleteTimeout);
        autocompleteTimeout = setTimeout(() => {
            searchAddress(query, dropdown, input, inputId);
        }, 300);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
        if (!input.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });
}

function searchAddress(query, dropdown, input, inputId) {
    dropdown.innerHTML = '<div class="autocomplete-loading">Searching...</div>';
    dropdown.style.display = 'block';

    // Build URL with optional bounding box
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=20&addressdetails=1`;

    // Add bounding box if we have user location (prioritize nearby results)
    if (currentUserLocation) {
        const bbox = createBoundingBox(currentUserLocation.lat, currentUserLocation.lng, 50); // 50km radius
        url += `&viewbox=${bbox.left},${bbox.bottom},${bbox.right},${bbox.top}&bounded=1`;
        console.log('🔍 Searching with bounding box around user location');
    } else {
        console.log('🔍 Searching globally (no user location available)');
    }

    fetch(url, {
        headers: {
            'User-Agent': 'PinkPath Safety Navigation App'
        }
    })
    .then(response => response.json())
    .then(results => {
        dropdown.innerHTML = '';

        if (results.length === 0) {
            dropdown.innerHTML = '<div class="autocomplete-loading">No results found</div>';
            return;
        }

        // Calculate distance for each result if we have user location
        if (currentUserLocation) {
            results.forEach(result => {
                const distance = calculateDistance(
                    currentUserLocation.lat,
                    currentUserLocation.lng,
                    parseFloat(result.lat),
                    parseFloat(result.lon)
                );
                result.distance = distance;
            });

            // Sort by distance (closest first)
            results.sort((a, b) => a.distance - b.distance);
            console.log('✅ Results sorted by distance');
        }

        // Display top 5 results
        const topResults = results.slice(0, 5);

        topResults.forEach(result => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';

            // Parse result for better formatting
            const parsed = parseNominatimResult(result);
            const icon = getLocationIcon(parsed);

            // Format distance if available
            let distanceHTML = '';
            if (result.distance !== undefined) {
                distanceHTML = `<span class="autocomplete-distance">${formatDistance(result.distance)}</span>`;
            }

            // Build HTML based on whether it's a place or address
            if (parsed.isPlace && parsed.primaryName) {
                // POI/Place with name + address
                item.innerHTML = `
                    <span class="autocomplete-icon">${icon}</span>
                    <div class="autocomplete-content">
                        <div class="autocomplete-primary">${parsed.primaryName}</div>
                        <div class="autocomplete-secondary">${parsed.secondaryAddress}</div>
                        ${distanceHTML}
                    </div>
                `;
            } else {
                // Regular address
                item.innerHTML = `
                    <span class="autocomplete-icon">${icon}</span>
                    <div class="autocomplete-content">
                        <div class="autocomplete-text">${parsed.secondaryAddress}</div>
                        ${distanceHTML}
                    </div>
                `;
            }

            item.addEventListener('click', function() {
                // For POIs, use the primary name; for addresses, use full display name
                if (parsed.isPlace && parsed.primaryName) {
                    input.value = `${parsed.primaryName}, ${parsed.secondaryAddress}`;
                } else {
                    input.value = result.display_name;
                }
                dropdown.style.display = 'none';

                // Store the selected location
                const location = {
                    lat: parseFloat(result.lat),
                    lng: parseFloat(result.lon),
                    name: result.display_name
                };

                if (inputId === 'start-location') {
                    selectedStart = location;
                    console.log('Start location selected:', location);
                } else if (inputId === 'destination') {
                    selectedDestination = location;
                    console.log('Destination selected:', location);
                }
            });

            dropdown.appendChild(item);
        });
    })
    .catch(error => {
        console.error('Geocoding error:', error);
        dropdown.innerHTML = '<div class="autocomplete-loading">Error searching addresses</div>';
    });
}

// ========================================
// ROUTE FINDING
// ========================================

async function findRoute() {
    console.log('🔍 findRoute() called');

    const startLocation = document.getElementById('start-location').value.trim();
    const destination = document.getElementById('destination').value.trim();

    console.log('📍 Start:', startLocation);
    console.log('📍 Destination:', destination);

    // Validate inputs
    if (!startLocation) {
        alert('⚠️ Please enter your starting point');
        document.getElementById('start-location').focus();
        return;
    }

    if (!destination) {
        alert('⚠️ Please enter your destination');
        document.getElementById('destination').focus();
        return;
    }

    // Get safety preferences
    const preferences = {
        wellLit: document.getElementById('well-lit')?.checked || false,
        busyAreas: document.getElementById('busy-areas')?.checked || false,
        avoidConstruction: document.getElementById('avoid-construction')?.checked || false
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

    console.log('✅ Locations ready! Using OpenStreetMap + Leaflet (no API key needed!)');

    // Navigate to results screen
    goToScreen('screen-route-results');
}

// Helper function to geocode an address
async function geocodeAddress(address) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'PinkPath Safety Navigation App' }
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
        console.error('Geocoding error:', error);
        return null;
    }
}

// ========================================
// REAL-TIME LOCATION (PHASE 1)
// ========================================

async function getUserLocation() {
    console.log('📍 Requesting user location...');

    const btn = document.getElementById('use-location-btn');
    const startInput = document.getElementById('start-location');

    // Check if geolocation is supported
    if (!navigator.geolocation) {
        alert('⚠️ Geolocation is not supported by your browser.');
        return;
    }

    // Show loading state
    btn.classList.add('loading');
    btn.disabled = true;
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

                // Show success state
                btn.classList.remove('loading');
                btn.classList.add('active');
                btn.title = 'Location acquired';
                startInput.placeholder = 'Current location';

                // Show location on map if visible
                if (routeMap) {
                    showCurrentLocationOnMap(routeMap, lat, lng, accuracy);
                }
            } else {
                // Failed to get address
                alert('⚠️ Found your location but could not determine the address. Please type it manually.');
                btn.classList.remove('loading');
                startInput.placeholder = 'Enter your current location';
            }

            btn.disabled = false;
        },
        // Error callback
        function(error) {
            console.error('❌ Location error:', error);
            btn.classList.remove('loading');
            btn.disabled = false;
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

// Reverse geocode coordinates to address
async function reverseGeocode(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'PinkPath Safety Navigation App' }
        });
        const result = await response.json();

        if (result && result.display_name) {
            return result.display_name;
        }
        return null;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return null;
    }
}

// Show current location on map with blue pulsing dot
function showCurrentLocationOnMap(map, lat, lng, accuracy) {
    console.log('🗺️ Showing location on map');

    // Remove existing location marker if any
    if (locationMarker) {
        map.removeLayer(locationMarker);
    }

    // Create blue pulsing marker
    const blueIcon = L.divIcon({
        className: 'current-location-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    // Add marker
    locationMarker = L.marker([lat, lng], { icon: blueIcon })
        .addTo(map)
        .bindPopup('You are here');

    // Optional: Add accuracy circle
    if (accuracy) {
        L.circle([lat, lng], {
            radius: accuracy,
            color: '#4285f4',
            fillColor: '#4285f4',
            fillOpacity: 0.1,
            weight: 1
        }).addTo(map);
    }

    // Center map on location
    map.setView([lat, lng], 15);
}

// ========================================
// LEAFLET MAP INITIALIZATION
// ========================================

function initializeRouteMap() {
    console.log('🗺️ Initializing route map with Leaflet...');

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
        addMapStyleToggle(routeMap);

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

        console.log('✅ Route map initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing route map:', error);
    }
}

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
        addMapStyleToggle(navigationMap, navLightTileLayer, navDarkTileLayer);

        // Force Leaflet to recalculate map size after container is rendered
        setTimeout(() => {
            if (navigationMap) {
                navigationMap.invalidateSize();
            }
        }, 100);

        console.log('✅ Navigation map initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Error initializing navigation map:', error);
        return false;
    }
}

// Display route on navigation map (for turn-by-turn navigation)
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

        console.log('✅ Route displayed on navigation map');
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
            if (isSelected && routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                navOmbreRouteLayer = drawOmbreRoute(
                    navigationMap,
                    routeOption.route.coordinates,
                    routeOption.crimeSamples,
                    0.8,  // opacity: selected
                    null  // dashArray: solid
                );
            }
        });

        // Second pass: Draw the alternative route (on top)
        routeOptions.forEach((routeOption, idx) => {
            const isSelected = (idx === selectedRouteIndex);
            if (!isSelected && routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                navAlternativeOmbreLayer = drawOmbreRoute(
                    navigationMap,
                    routeOption.route.coordinates,
                    routeOption.crimeSamples,
                    0.4,  // opacity: alternative
                    '10, 10'  // dashArray: dashed
                );
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
// MAP STYLE TOGGLE
// ========================================

function addMapStyleToggle(map, lightLayer = null, darkLayer = null) {
    // Create custom control
    const MapStyleControl = L.Control.extend({
        options: {
            position: 'topright'
        },

        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'map-style-toggle');

            container.innerHTML = `
                <button class="style-toggle-btn" id="style-toggle-${map._leaflet_id}">
                    <span class="toggle-option active">Light</span>
                    <span class="toggle-divider">|</span>
                    <span class="toggle-option">Dark</span>
                </button>
            `;

            // Prevent map clicks when clicking the button
            L.DomEvent.disableClickPropagation(container);

            // Add click handler
            container.querySelector('.style-toggle-btn').addEventListener('click', function() {
                toggleMapStyle(map, lightLayer, darkLayer, this);
            });

            return container;
        }
    });

    map.addControl(new MapStyleControl());
}

function toggleMapStyle(map, lightLayer = null, darkLayer = null, button) {
    const light = lightLayer || lightTileLayer;
    const dark = darkLayer || darkTileLayer;

    if (currentMode === 'light') {
        // Switch to dark
        if (map.hasLayer(light)) {
            map.removeLayer(light);
        }
        dark.addTo(map);
        currentMode = 'dark';

        // Update button UI
        const options = button.querySelectorAll('.toggle-option');
        options[0].classList.remove('active');
        options[1].classList.add('active');

        console.log('🌙 Switched to dark mode');
    } else {
        // Switch to light
        if (map.hasLayer(dark)) {
            map.removeLayer(dark);
        }
        light.addTo(map);
        currentMode = 'light';

        // Update button UI
        const options = button.querySelectorAll('.toggle-option');
        options[1].classList.remove('active');
        options[0].classList.add('active');

        console.log('☀️ Switched to light mode');
    }
}

// ========================================
// ROUTE CALCULATION WITH OSRM
// ========================================

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
            const safetyData = await calculateSafetyScore(route, start, end);

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

        // Auto-select the safer route (higher safety score)
        selectedRouteIndex = 0;
        if (routeOptions.length > 1) {
            // Find route with highest safety score
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

        console.log('✅ Route(s) calculated successfully!');
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
        updateSafetyDisplay();

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
            if (isSelected && routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                const ombreLayer = drawOmbreRoute(
                    map,
                    routeOption.route.coordinates,
                    routeOption.crimeSamples,
                    0.8,  // opacity: selected
                    null  // dashArray: solid
                );
                ombreRouteLayer = ombreLayer;
            }
        });

        // Second pass: Draw the alternative route (on top)
        routeOptions.forEach((routeOption, idx) => {
            const isSelected = (idx === selectedRouteIndex);
            if (!isSelected && routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
                const ombreLayer = drawOmbreRoute(
                    map,
                    routeOption.route.coordinates,
                    routeOption.crimeSamples,
                    0.4,  // opacity: alternative
                    '10, 10'  // dashArray: dashed
                );
                alternativeOmbreLayer = ombreLayer;
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
        if (isSelected && routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
            const opacity = 0.8;
            const dashArray = null;

            console.log(`  - Route ${idx + 1}: SELECTED (opacity: ${opacity}, dashArray: ${dashArray}) [BOTTOM LAYER]`);

            const ombreLayer = drawOmbreRoute(
                routeMap,
                routeOption.route.coordinates,
                routeOption.crimeSamples,
                opacity,
                dashArray
            );

            ombreRouteLayer = ombreLayer;
            console.log('    ✓ Stored as ombreRouteLayer (selected)');
        }
    });

    // Second pass: Draw the alternative route (on top)
    routeOptions.forEach((routeOption, idx) => {
        const isSelected = (idx === selectedRouteIndex);
        if (!isSelected && routeOption.crimeSamples && routeOption.crimeSamples.length > 0) {
            const opacity = 0.4;
            const dashArray = '10, 10';

            console.log(`  - Route ${idx + 1}: alternative (opacity: ${opacity}, dashArray: ${dashArray}) [TOP LAYER]`);

            const ombreLayer = drawOmbreRoute(
                routeMap,
                routeOption.route.coordinates,
                routeOption.crimeSamples,
                opacity,
                dashArray
            );

            alternativeOmbreLayer = ombreLayer;
            console.log('    ✓ Stored as alternativeOmbreLayer (alternative)');
        }
    });
    console.log('✅ Route redraw complete');

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
// GEOGRAPHIC UTILITIES
// ========================================

// Calculate distance between two points using Haversine formula
// Returns distance in miles
function calculateDistance(lat1, lng1, lat2, lng2) {
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

// Convert degrees to radians
function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

// Create a bounding box around a point
// radius is in kilometers
function createBoundingBox(lat, lng, radiusKm = 50) {
    // Earth's radius in km
    const R = 6371;

    // Convert radius to degrees
    const latDelta = (radiusKm / R) * (180 / Math.PI);
    const lngDelta = (radiusKm / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

    return {
        left: lng - lngDelta,
        bottom: lat - latDelta,
        right: lng + lngDelta,
        top: lat + latDelta
    };
}

// ========================================
// UNIT CONVERSION & FORMATTING
// ========================================

// Convert meters to miles
function metersToMiles(meters) {
    return meters / 1609.34;
}

// Convert seconds to minutes
function secondsToMinutes(seconds) {
    return seconds / 60;
}

// Format distance for display
function formatDistance(miles) {
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

// Format duration for display
function formatDuration(minutes) {
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

// Update route display with real data
function updateRouteDisplay() {
    console.log('📊 Updating route display with real data');

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

    console.log('✅ Route display updated');
}

// Update safety score display (UPDATED FOR PHASE 2B)
function updateSafetyDisplay() {
    console.log('🛡️ Updating safety display');

    if (!currentRouteData.safetyScore) {
        console.log('No safety data available');
        return;
    }

    // Show the safety score display (was hidden initially)
    const safetyScoreDisplay = document.getElementById('safety-score-display');
    if (safetyScoreDisplay) {
        safetyScoreDisplay.style.display = 'flex';
    }

    // Update score number
    const scoreNumber = document.querySelector('.score-number');
    if (scoreNumber) {
        scoreNumber.textContent = currentRouteData.safetyScore.toFixed(1);
        scoreNumber.className = `score-number score-${currentRouteData.safetyColor}`;
    }

    // Update label
    const scoreSubLabel = document.querySelector('.score-sublabel');
    if (scoreSubLabel) {
        scoreSubLabel.textContent = currentRouteData.safetyLabel;
    }

    // Update breakdown
    const breakdown = currentRouteData.safetyBreakdown;
    if (breakdown) {
        // Bars 1-4 are always the same
        updateBreakdownItem('breakdown-length', 'Route Length', breakdown.routeLength.score);
        updateBreakdownItem('breakdown-time', 'Time of Day', breakdown.timeOfDay.score);
        updateBreakdownItem('breakdown-complexity', 'Route Simplicity', breakdown.complexity.score);
        updateBreakdownItem('breakdown-road', 'Road Type', breakdown.roadType.score);

        // Bar 5 changes based on crime data availability
        if (breakdown.crimeData) {
            // PHASE 2B: Show crime data in bar 5 (replaces Area Type)
            updateBreakdownItem('breakdown-density', 'SF Crime Data (90 days)', breakdown.crimeData.score);
        } else {
            // PHASE 2A: Show area type in bar 5 (original)
            updateBreakdownItem('breakdown-density', 'Area Type', breakdown.density.score);
        }
    }

    // PHASE 2C: Update disclaimer and show/hide crime details button
    const disclaimer = document.getElementById('safety-disclaimer');
    const crimeDetailsBtn = document.getElementById('crime-details-btn-container');

    if (currentRouteData.usingCrimeData) {
        // Using real SF crime data
        if (disclaimer) {
            disclaimer.textContent = 'Safety score includes real crime data from San Francisco Police Department (last 90 days).';
        }
        // Show crime details button
        if (crimeDetailsBtn) {
            crimeDetailsBtn.style.display = 'block';
        }
    } else if (currentRouteData.inSanFrancisco) {
        // In SF but crime data unavailable
        if (disclaimer) {
            disclaimer.textContent = 'Crime data temporarily unavailable. Score based on route characteristics.';
        }
        // Hide crime details button
        if (crimeDetailsBtn) {
            crimeDetailsBtn.style.display = 'none';
        }
    } else {
        // Outside SF
        if (disclaimer) {
            disclaimer.textContent = 'San Francisco, CA used for testing. Other cities with crime data coming soon.';
        }
        // Hide crime details button
        if (crimeDetailsBtn) {
            crimeDetailsBtn.style.display = 'none';
        }
    }

    // Show/hide nighttime warning banner
    const warningBanner = document.getElementById('nighttime-warning-banner');
    if (warningBanner) {
        if (currentRouteData.showNighttimeWarning) {
            warningBanner.style.display = 'flex';
            console.log('⚠️ Nighttime warning banner displayed');
        } else {
            warningBanner.style.display = 'none';
        }
    }

    console.log('✅ Safety display updated');
}

// Filter crimes to last 30 days for display
function filterCrimesLast30Days(crimes) {
    if (!crimes || crimes.length === 0) return [];

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    return crimes.filter(crime => {
        const crimeDate = new Date(crime.incident_datetime);
        return crimeDate >= thirtyDaysAgo;
    });
}

// Group crimes by type and count occurrences
function groupCrimesByType(crimes) {
    const grouped = {};

    crimes.forEach(crime => {
        const category = crime.incident_category;
        if (!grouped[category]) {
            grouped[category] = 0;
        }
        grouped[category]++;
    });

    // Sort by count (descending)
    return Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
        }, {});
}

// Get severity level for a crime category
function getCrimeSeverity(category) {
    const weight = CRIME_WEIGHTS[category] || 1.0;

    if (weight >= 3.0) return 'high';
    if (weight >= 2.0) return 'medium';
    return 'low';
}

// Toggle crime details expanded section
function toggleCrimeDetails() {
    const expandedSection = document.getElementById('crime-details-expanded');
    const button = document.getElementById('more-info-btn');

    if (expandedSection.style.display === 'none') {
        expandedSection.style.display = 'block';
        button.textContent = 'Less Info ▲';
    } else {
        expandedSection.style.display = 'none';
        button.textContent = 'More Info ▼';
    }
}

// Open crime details modal (PHASE 2C - UPDATED)
function openCrimeDetailsModal() {
    const breakdown = currentRouteData.safetyBreakdown;
    if (!breakdown || !breakdown.crimeData) {
        alert('Crime data not available');
        return;
    }

    const crimeData = breakdown.crimeData;
    const rawCrimes = currentRouteData.rawCrimeData || [];

    // Filter to last 30 days for display
    const last30DaysCrimes = filterCrimesLast30Days(rawCrimes);

    // Group crimes by type
    const crimesByType = groupCrimesByType(last30DaysCrimes);

    // Categorize by severity
    const highSeverityCrimes = {};
    const mediumSeverityCrimes = {};
    const lowSeverityCrimes = {};

    let highCount = 0, mediumCount = 0, lowCount = 0;

    Object.entries(crimesByType).forEach(([category, count]) => {
        const severity = getCrimeSeverity(category);

        if (severity === 'high') {
            highSeverityCrimes[category] = count;
            highCount += count;
        } else if (severity === 'medium') {
            mediumSeverityCrimes[category] = count;
            mediumCount += count;
        } else {
            lowSeverityCrimes[category] = count;
            lowCount += count;
        }
    });

    // Update comparison text
    const comparisonText = document.getElementById('crime-comparison-text');
    if (comparisonText) {
        comparisonText.textContent = crimeData.comparisonText;
    }

    // Update severity counts (30-day filtered data)
    document.getElementById('high-severity-count').textContent = highCount;
    document.getElementById('medium-severity-count').textContent = mediumCount;
    document.getElementById('low-severity-count').textContent = lowCount;
    document.getElementById('total-crimes-count').textContent = last30DaysCrimes.length;

    // Update severity details (basic descriptions)
    const highDetails = document.getElementById('high-severity-details');
    const mediumDetails = document.getElementById('medium-severity-details');
    const lowDetails = document.getElementById('low-severity-details');

    if (highCount === 0) {
        highDetails.textContent = 'No high-severity crimes found (last 30 days)';
    } else {
        highDetails.textContent = `Includes violent crimes (robbery, assault, homicide, etc.) - last 30 days`;
    }

    if (mediumCount === 0) {
        mediumDetails.textContent = 'No medium-severity crimes found (last 30 days)';
    } else {
        mediumDetails.textContent = `Includes property crimes (burglary, vehicle theft, arson, etc.) - last 30 days`;
    }

    if (lowCount === 0) {
        lowDetails.textContent = 'No low-severity crimes found (last 30 days)';
    } else {
        lowDetails.textContent = `Includes theft, vandalism, drug offenses, etc. - last 30 days`;
    }

    // Populate detailed breakdown by type
    populateCrimeTypeBreakdown('high-severity-types', highSeverityCrimes);
    populateCrimeTypeBreakdown('medium-severity-types', mediumSeverityCrimes);
    populateCrimeTypeBreakdown('low-severity-types', lowSeverityCrimes);

    // Reset expanded section to collapsed
    document.getElementById('crime-details-expanded').style.display = 'none';
    document.getElementById('more-info-btn').textContent = 'More Info ▼';

    // Open the modal
    openModal('crime-details-modal');
}

// Populate crime type breakdown section
function populateCrimeTypeBreakdown(elementId, crimesObj) {
    const container = document.getElementById(elementId);

    if (!crimesObj || Object.keys(crimesObj).length === 0) {
        container.innerHTML = '<div style="color: var(--gray-medium); font-style: italic;">No incidents in this category</div>';
        return;
    }

    let html = '';
    Object.entries(crimesObj).forEach(([category, count]) => {
        html += `
            <div class="crime-type-item">
                <span class="crime-type-name">${category}</span>
                <span class="crime-type-count">${count} incident${count > 1 ? 's' : ''}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Update individual breakdown item
function updateBreakdownItem(id, label, score) {
    const element = document.getElementById(id);
    if (!element) return;

    const labelElement = element.querySelector('.breakdown-label');
    const fill = element.querySelector('.breakdown-fill');
    const scoreDisplay = element.querySelector('.breakdown-score');

    if (labelElement) {
        labelElement.textContent = label;
    }

    if (fill) {
        fill.style.width = `${score}%`;
        // Color based on score
        if (score >= 85) {
            fill.className = 'breakdown-fill fill-excellent';
        } else if (score >= 70) {
            fill.className = 'breakdown-fill fill-good';
        } else if (score >= 50) {
            fill.className = 'breakdown-fill fill-fair';
        } else {
            fill.className = 'breakdown-fill fill-caution';
        }
    }

    if (scoreDisplay) {
        scoreDisplay.textContent = Math.round(score);
    }
}

// ========================================
// CRIME DATA FUNCTIONS (PHASE 2B)
// ========================================

// Check if a location is within San Francisco bounds
function isInSanFrancisco(lat, lng) {
    return lat >= SF_BOUNDS.south &&
           lat <= SF_BOUNDS.north &&
           lng >= SF_BOUNDS.west &&
           lng <= SF_BOUNDS.east;
}

// Check if entire route is in San Francisco
function isRouteInSanFrancisco(startLat, startLng, endLat, endLng) {
    return isInSanFrancisco(startLat, startLng) &&
           isInSanFrancisco(endLat, endLng);
}

// Generate cache key for crime data
function getCrimesCacheKey(lat, lng) {
    // Round to 2 decimal places (~0.7 mile grid)
    // This creates cache zones to reduce API calls
    const roundedLat = lat.toFixed(2);
    const roundedLng = lng.toFixed(2);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `crime_${roundedLat}_${roundedLng}_${today}`;
}

// Get cached crime data
function getCachedCrimes(lat, lng) {
    const key = getCrimesCacheKey(lat, lng);
    const cached = crimeCache.get(key);

    if (!cached) return null;

    // Check if cache is still valid (24 hours)
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_DURATION) {
        crimeCache.delete(key);
        return null;
    }

    return cached.data;
}

// Set cached crime data
function setCachedCrimes(lat, lng, data) {
    const key = getCrimesCacheKey(lat, lng);
    crimeCache.set(key, {
        data: data,
        timestamp: Date.now()
    });
}

// Query crimes near a specific location from SF Open Data API
async function queryCrimesNearLocation(lat, lng, radiusMeters = CRIME_API.radiusMeters) {
    // Check cache first
    const cached = getCachedCrimes(lat, lng);
    if (cached !== null) {
        console.log(`📦 Using cached crime data for ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        return cached;
    }

    try {
        // Calculate date range (last 90 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - CRIME_API.daysBack);

        const startDateStr = startDate.toISOString().split('T')[0];

        // Build API query URL
        // SODA API uses $where with within_circle for geographic queries
        const whereClause = `within_circle(point, ${lat}, ${lng}, ${radiusMeters}) AND incident_datetime > '${startDateStr}'`;
        const selectFields = 'incident_category,incident_datetime,latitude,longitude';

        const url = `${CRIME_API.baseUrl}?` +
                    `$$app_token=${CRIME_API.appToken}&` +
                    `$where=${encodeURIComponent(whereClause)}&` +
                    `$select=${selectFields}&` +
                    `$limit=1000`;

        console.log(`🔍 Querying SF crime data near ${lat.toFixed(4)}, ${lng.toFixed(4)}...`);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Crime API returned ${response.status}`);
        }

        const crimes = await response.json();

        console.log(`✅ Found ${crimes.length} crimes in the last ${CRIME_API.daysBack} days`);

        // Cache the results
        setCachedCrimes(lat, lng, crimes);

        return crimes;

    } catch (error) {
        console.error('❌ Error querying crime data:', error);
        return null; // Return null on error (will trigger fallback)
    }
}

// Query crimes along entire route
async function queryCrimesAlongRoute(routeCoordinates) {
    if (!routeCoordinates || routeCoordinates.length === 0) {
        console.log('⚠️ No route coordinates provided');
        return null;
    }

    console.log('🗺️ Analyzing crime data along route...');

    try {
        // Sample points along the route (every ~0.15 miles - optimized)
        const samplePoints = sampleRoutePoints(routeCoordinates, CRIME_API.sampleInterval);

        console.log(`📍 Sampling ${samplePoints.length} points along route`);

        // Query crimes near each sample point IN PARALLEL (optimized for speed)
        console.log('🚀 Fetching crime data in parallel...');
        const crimePromises = samplePoints.map(point =>
            queryCrimesNearLocation(point.lat, point.lng)
        );

        // Wait for all API calls to complete
        const crimeResults = await Promise.all(crimePromises);

        // Check if any API call failed
        if (crimeResults.some(result => result === null)) {
            console.log('⚠️ One or more crime API calls failed - using fallback');
            return null;
        }

        // Flatten results and remove duplicates
        let allCrimes = [];
        const crimeSets = new Set(); // Use Set to avoid duplicate crimes

        crimeResults.forEach(crimes => {
            crimes.forEach(crime => {
                // Create unique ID from crime data
                const crimeId = `${crime.incident_category}_${crime.incident_datetime}_${crime.latitude}_${crime.longitude}`;
                if (!crimeSets.has(crimeId)) {
                    crimeSets.add(crimeId);
                    allCrimes.push(crime);
                }
            });
        });

        console.log(`✅ Total unique crimes found along route: ${allCrimes.length}`);

        // Combine sample points with their crime data for ombre route coloring
        const crimeSamples = samplePoints.map((point, index) => ({
            lat: point.lat,
            lng: point.lng,
            crimes: crimeResults[index] || []
        }));

        return {
            allCrimes: allCrimes,
            crimeSamples: crimeSamples
        };

    } catch (error) {
        console.error('❌ Error analyzing route crime data:', error);
        return null;
    }
}

// Sample points along route at regular intervals
function sampleRoutePoints(coordinates, intervalMiles) {
    const samplePoints = [];

    // Always include start point
    if (coordinates.length > 0) {
        const start = coordinates[0];
        samplePoints.push({ lat: start.lat, lng: start.lng });
    }

    // Sample intermediate points
    let accumulatedDistance = 0;
    let lastSampleDistance = 0;

    for (let i = 1; i < coordinates.length; i++) {
        const prev = coordinates[i - 1];
        const curr = coordinates[i];

        // Calculate distance between consecutive points
        const segmentDistance = calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
        accumulatedDistance += segmentDistance;

        // Add sample point if we've traveled the interval distance
        if (accumulatedDistance - lastSampleDistance >= intervalMiles) {
            samplePoints.push({ lat: curr.lat, lng: curr.lng });
            lastSampleDistance = accumulatedDistance;
        }
    }

    // Always include end point
    if (coordinates.length > 1) {
        const end = coordinates[coordinates.length - 1];
        samplePoints.push({ lat: end.lat, lng: end.lng });
    }

    return samplePoints;
}

// Calculate area baseline for relative crime scoring (3-mile radius)
async function calculateAreaBaseline(midpointLat, midpointLng) {
    console.log('📊 Calculating area baseline for comparison...');

    try {
        // Query crimes in 3-mile radius (city-wide comparison)
        const radiusMeters = 3 * 1609.34; // 3 miles to meters

        // Check cache first (use larger grid for baseline)
        const cacheKey = `baseline_${midpointLat.toFixed(1)}_${midpointLng.toFixed(1)}`;
        const cached = crimeCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
            console.log('📦 Using cached baseline data');
            return cached.data;
        }

        // Build API query for baseline area
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - CRIME_API.daysBack);
        const startDateStr = startDate.toISOString().split('T')[0];

        const whereClause = `within_circle(point, ${midpointLat}, ${midpointLng}, ${radiusMeters}) AND incident_datetime > '${startDateStr}'`;
        const selectFields = 'incident_category,incident_datetime';

        const url = `${CRIME_API.baseUrl}?` +
                    `$$app_token=${CRIME_API.appToken}&` +
                    `$where=${encodeURIComponent(whereClause)}&` +
                    `$select=${selectFields}&` +
                    `$limit=5000`; // Higher limit for baseline

        const response = await fetch(url);

        if (!response.ok) {
            console.log('⚠️ Baseline query failed, using absolute scoring');
            return null;
        }

        const crimes = await response.json();

        console.log(`✅ Baseline: ${crimes.length} crimes in 3-mile radius`);

        // Calculate baseline density (crimes per square mile)
        const areaSqMiles = Math.PI * 3 * 3; // π * r²
        const baselineDensity = crimes.length / areaSqMiles;

        // Calculate weighted baseline
        let weightedBaseline = 0;
        crimes.forEach(crime => {
            const weight = CRIME_WEIGHTS[crime.incident_category] || 1.0;
            if (weight > 0) {
                weightedBaseline += weight;
            }
        });

        const baselineWeightedDensity = weightedBaseline / areaSqMiles;

        const baselineData = {
            totalCrimes: crimes.length,
            density: baselineDensity,
            weightedDensity: baselineWeightedDensity
        };

        // Cache the baseline
        crimeCache.set(cacheKey, {
            data: baselineData,
            timestamp: Date.now()
        });

        console.log(`📊 Baseline weighted density: ${baselineWeightedDensity.toFixed(2)} crimes/sq mi`);

        return baselineData;

    } catch (error) {
        console.error('❌ Error calculating baseline:', error);
        return null;
    }
}

// Score crime data with relative scoring (PHASE 2C - Graded Curve)
function scoreCrimeData(crimes, routeLengthMiles, timeOfDay, areaBaseline = null) {
    if (!crimes || crimes.length === 0) {
        console.log('✅ No crimes found - excellent safety score');
        return 100; // No crimes = perfect score
    }

    console.log(`🔍 Scoring ${crimes.length} crimes along route...`);

    // Calculate weighted crime count
    let weightedCrimeCount = 0;
    const hour = timeOfDay || new Date().getHours();
    const isNighttime = hour >= 20 || hour < 6;

    // Count crimes by severity
    let highSeverity = 0, mediumSeverity = 0, lowSeverity = 0;

    crimes.forEach(crime => {
        const category = crime.incident_category;
        const weight = CRIME_WEIGHTS[category] || 1.0; // Default weight if category not in list

        if (weight === 0) return; // Skip excluded categories

        // Time-of-day multiplier
        const crimeHour = new Date(crime.incident_datetime).getHours();
        const crimeAtNight = crimeHour >= 20 || crimeHour < 6;

        let timeMultiplier = 1.0;
        if (isNighttime && crimeAtNight) {
            timeMultiplier = 1.5; // Weight nighttime crimes higher for nighttime routes
        } else if (!isNighttime && !crimeAtNight) {
            timeMultiplier = 1.2; // Weight daytime crimes higher for daytime routes
        }

        const adjustedWeight = weight * timeMultiplier;
        weightedCrimeCount += adjustedWeight;

        // Track severity for breakdown
        if (weight >= 3.0) highSeverity++;
        else if (weight >= 2.0) mediumSeverity++;
        else lowSeverity++;
    });

    console.log(`📊 Crime breakdown: ${highSeverity} high, ${mediumSeverity} medium, ${lowSeverity} low severity`);

    // Calculate crimes per mile (normalize by route length)
    const crimesPerMile = weightedCrimeCount / Math.max(routeLengthMiles, 0.5);

    let score;
    let comparisonText = '';
    let percentDifference = 0;

    // RELATIVE SCORING: Compare to area baseline if available
    if (areaBaseline && areaBaseline.weightedDensity > 0) {
        console.log(`📊 Using relative scoring (graded curve)`);
        console.log(`   Route density: ${crimesPerMile.toFixed(2)} crimes/mile`);
        console.log(`   Area baseline: ${areaBaseline.weightedDensity.toFixed(2)} crimes/sq mi`);

        // Convert route crimes/mile to crimes/sq mile for comparison
        // Approximate: assume route corridor is 0.1 mile wide (528 ft)
        const routeDensitySqMi = crimesPerMile / 0.1;

        // Calculate relative ratio
        const relativeRatio = routeDensitySqMi / areaBaseline.weightedDensity;

        // Calculate percentage difference
        percentDifference = ((areaBaseline.weightedDensity - routeDensitySqMi) / areaBaseline.weightedDensity) * 100;

        // Relative scoring: 100 - (ratio * 50)
        // If route = baseline → ratio = 1.0 → score = 50
        // If route < baseline (safer) → ratio < 1.0 → score > 50
        // If route > baseline (worse) → ratio > 1.0 → score < 50
        score = 100 - (relativeRatio * 50);

        // Clamp to reasonable range
        score = Math.max(10, Math.min(100, score));

        // Generate comparison text
        if (percentDifference > 15) {
            comparisonText = `${Math.abs(percentDifference).toFixed(0)}% safer than area average`;
        } else if (percentDifference < -15) {
            comparisonText = `${Math.abs(percentDifference).toFixed(0)}% higher than area average`;
        } else {
            comparisonText = `Similar to area average`;
        }

        console.log(`🛡️ Relative crime score: ${score.toFixed(1)}/100 (${comparisonText})`);

    } else {
        // ABSOLUTE SCORING: Fallback if no baseline
        console.log(`📊 Using absolute scoring (no baseline available)`);

        if (crimesPerMile <= 5) {
            // Linear scale: 0 crimes = 100, 5 crimes/mile = 70
            score = 100 - (crimesPerMile * 6);
        } else if (crimesPerMile <= 15) {
            // Linear scale: 5 crimes/mile = 70, 15 crimes/mile = 40
            score = 70 - ((crimesPerMile - 5) * 3);
        } else {
            // Logarithmic decline for very high crime
            score = Math.max(20, 40 - Math.log10(crimesPerMile - 14) * 15);
        }

        score = Math.max(0, Math.min(100, score));
        comparisonText = 'Absolute scoring (no baseline)';

        console.log(`🛡️ Crime score: ${score.toFixed(1)}/100 (${crimesPerMile.toFixed(1)} weighted crimes/mile)`);
    }

    // Return detailed breakdown
    return {
        score: score,
        totalCrimes: crimes.length,
        highSeverity: highSeverity,
        mediumSeverity: mediumSeverity,
        lowSeverity: lowSeverity,
        comparisonText: comparisonText,
        percentDifference: percentDifference
    };
}

// Analyze day vs night crime rates
function analyzeDayNightCrimes(crimes, sunData) {
    if (!crimes || crimes.length === 0 || !sunData) {
        return {
            daytimeCrimes: 0,
            nighttimeCrimes: 0,
            nighttimeIncreasePercent: 0
        };
    }

    let daytimeCrimes = 0;
    let nighttimeCrimes = 0;

    // Get sunrise/sunset hours once (not per crime)
    const sunriseHour = sunData.sunrise.getHours();
    const sunsetHour = sunData.sunset.getHours();

    crimes.forEach(crime => {
        const crimeTime = new Date(crime.incident_datetime);
        const crimeHour = crimeTime.getHours();

        // Check if crime occurred at night (after sunset or before sunrise)
        if (crimeHour >= sunsetHour || crimeHour < sunriseHour) {
            nighttimeCrimes++;
        } else {
            daytimeCrimes++;
        }
    });

    // Calculate percentage increase
    let nighttimeIncreasePercent = 0;
    if (daytimeCrimes > 0) {
        // Normalize by hours (day vs night have different durations)
        const dayHours = sunsetHour - sunriseHour;
        const nightHours = 24 - dayHours;

        const daytimeRate = daytimeCrimes / dayHours;
        const nighttimeRate = nighttimeCrimes / nightHours;

        nighttimeIncreasePercent = ((nighttimeRate - daytimeRate) / daytimeRate) * 100;
    }

    console.log(`📊 Day/Night Crime Analysis: ${daytimeCrimes} day, ${nighttimeCrimes} night (${nighttimeIncreasePercent.toFixed(0)}% increase at night)`);

    return {
        daytimeCrimes,
        nighttimeCrimes,
        nighttimeIncreasePercent
    };
}

// Filter crimes to last 7 days and violent/theft categories only
function filterRecentViolentCrimes(crimes) {
    if (!crimes || crimes.length === 0) return [];

    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    // Violent crime categories (red markers)
    const violentCategories = [
        'Homicide',
        'Robbery',
        'Assault',
        'Sex Offense',
        'Human Trafficking',
        'Weapon Offense'
    ];

    // Theft crime categories (orange markers)
    const theftCategories = [
        'Burglary',
        'Motor Vehicle Theft',
        'Larceny Theft'
    ];

    const targetCategories = [...violentCategories, ...theftCategories];

    return crimes.filter(crime => {
        // Check date (last 7 days)
        const crimeDate = new Date(crime.incident_datetime);
        if (crimeDate < sevenDaysAgo) return false;

        // Check category (violent or theft)
        return targetCategories.includes(crime.incident_category);
    }).map(crime => ({
        ...crime,
        isViolent: violentCategories.includes(crime.incident_category)
    }));
}

// Add crime markers to map with clustering
function addCrimeMarkersToMap(map, crimes, route) {
    if (!map || !crimes || crimes.length === 0) {
        console.log('ℹ️ No recent violent crimes to display');
        return null;
    }

    console.log(`🔴 Adding ${crimes.length} recent crime markers to map...`);

    // Create marker cluster group
    const crimeClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();

            // Determine size-based dimensions
            let outerSize, innerSize, fontSize;
            if (count > 10) {
                outerSize = 50;
                innerSize = 44;
                fontSize = 16;
            } else if (count > 5) {
                outerSize = 40;
                innerSize = 34;
                fontSize = 14;
            } else {
                outerSize = 30;
                innerSize = 24;
                fontSize = 12;
            }

            return L.divIcon({
                html: `
                    <div style="
                        width: ${outerSize}px;
                        height: ${outerSize}px;
                        background-color: rgba(255, 20, 147, 0.3);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                        <div style="
                            width: ${innerSize}px;
                            height: ${innerSize}px;
                            background-color: #dc143c;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        ">
                            <span style="
                                color: white;
                                font-weight: 700;
                                font-size: ${fontSize}px;
                                text-align: center;
                            ">${count}</span>
                        </div>
                    </div>
                `,
                className: 'crime-marker-cluster-custom',
                iconSize: L.point(outerSize, outerSize)
            });
        }
    });

    // Get route coordinates for distance calculation
    const routeCoords = route.coordinates || [];

    crimes.forEach(crime => {
        const lat = parseFloat(crime.latitude);
        const lng = parseFloat(crime.longitude);

        if (!lat || !lng) return;

        // Calculate distance from route (find closest point)
        let minDistance = Infinity;
        routeCoords.forEach(coord => {
            const dist = calculateDistance(lat, lng, coord.lat, coord.lng);
            if (dist < minDistance) minDistance = dist;
        });

        // Create crime marker
        const isViolent = crime.isViolent;
        const markerColor = isViolent ? '#dc143c' : '#ed8936'; // Red for violent, orange for theft

        const crimeIcon = L.divIcon({
            className: 'crime-marker',
            html: `<div style="background-color: ${markerColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        const marker = L.marker([lat, lng], { icon: crimeIcon });

        // Create popup content
        const crimeDate = new Date(crime.incident_datetime);
        const dateStr = crimeDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        const distanceStr = minDistance < 0.1
            ? `${Math.round(minDistance * 5280)} ft from route`
            : `${minDistance.toFixed(2)} mi from route`;

        const popupContent = `
            <div style="min-width: 150px;">
                <strong style="color: ${markerColor};">${crime.incident_category}</strong><br>
                <span style="font-size: 12px; color: #666;">${dateStr}</span><br>
                <span style="font-size: 11px; color: #999;">${distanceStr}</span>
            </div>
        `;

        marker.bindPopup(popupContent);
        crimeClusterGroup.addLayer(marker);
    });

    map.addLayer(crimeClusterGroup);
    console.log(`✅ Added ${crimes.length} crime markers with clustering`);

    return crimeClusterGroup;
}

// Get color for route segment based on crime density
function getSegmentColor(crimeCount) {
    // Absolute scale: crimes per 0.15 mile segment
    if (crimeCount === 0) return '#48bb78'; // Green - no crimes
    if (crimeCount <= 2) return '#68d391'; // Light green - very few crimes
    if (crimeCount <= 5) return '#ed8936'; // Orange - moderate crimes
    if (crimeCount <= 10) return '#f56565'; // Light red - many crimes
    return '#dc143c'; // Dark red - very high crime
}

// Draw ombre-colored route based on crime density
function drawOmbreRoute(map, routeCoordinates, crimeSamples, opacity = 0.8, dashArray = null) {
    if (!map || !routeCoordinates || routeCoordinates.length === 0) {
        console.log('ℹ️ Cannot draw ombre route: missing data');
        return null;
    }

    const routeType = dashArray ? 'alternative' : 'main';
    console.log(`🎨 Drawing ${routeType} ombre route with ${crimeSamples.length} crime samples...`);
    console.log(`   Parameters: opacity=${opacity}, dashArray=${dashArray}`);

    const ombreLayerGroup = L.layerGroup();

    // Create segments between sample points
    for (let i = 0; i < crimeSamples.length - 1; i++) {
        const currentSample = crimeSamples[i];
        const nextSample = crimeSamples[i + 1];

        // Get crime count for this segment
        const crimeCount = currentSample.crimes ? currentSample.crimes.length : 0;
        const segmentColor = getSegmentColor(crimeCount);

        // Find route coordinates between these two sample points
        const segmentCoords = [];
        let startFound = false;

        for (let j = 0; j < routeCoordinates.length; j++) {
            const coord = routeCoordinates[j];
            const distToCurrent = calculateDistance(
                coord.lat, coord.lng,
                currentSample.lat, currentSample.lng
            );
            const distToNext = calculateDistance(
                coord.lat, coord.lng,
                nextSample.lat, nextSample.lng
            );

            // Include points close to current sample or between current and next
            if (distToCurrent < 0.01 || (startFound && distToNext > 0.01)) {
                segmentCoords.push([coord.lat, coord.lng]);
                if (!startFound) startFound = true;
            }

            // Stop when we reach the next sample
            if (distToNext < 0.01) {
                segmentCoords.push([coord.lat, coord.lng]);
                break;
            }
        }

        // If we didn't find route coords, just draw a line between samples
        if (segmentCoords.length < 2) {
            segmentCoords.push([currentSample.lat, currentSample.lng]);
            segmentCoords.push([nextSample.lat, nextSample.lng]);
        }

        // Create polyline for this segment
        const polylineOptions = {
            color: segmentColor,
            weight: 6,
            opacity: opacity,  // Use parameter
            lineJoin: 'round',
            lineCap: 'round'
        };

        if (dashArray) {
            polylineOptions.dashArray = dashArray;  // Add if provided
        }

        const polyline = L.polyline(segmentCoords, polylineOptions);

        ombreLayerGroup.addLayer(polyline);
    }

    ombreLayerGroup.addTo(map);
    console.log(`✅ Ombre route drawn with ${crimeSamples.length - 1} colored segments`);

    return ombreLayerGroup;
}

// ========================================
// SAFETY SCORING ALGORITHM (PHASE 2)
// ========================================

// Main safety scoring function (UPDATED FOR PHASE 2B)
async function calculateSafetyScore(route, startLocation, endLocation) {
    console.log('🛡️ Calculating safety score...');

    const distanceMiles = metersToMiles(route.summary.totalDistance);
    const hour = new Date().getHours();

    // Check if route is in San Francisco
    const inSF = isRouteInSanFrancisco(
        startLocation.lat, startLocation.lng,
        endLocation.lat, endLocation.lng
    );

    let crimeScore = null;
    let crimeData = null;
    let crimeBreakdown = null;
    let areaBaseline = null;
    let usingCrimeData = false;
    let crimeSamples = null; // Crime samples for ombre route coloring

    // PHASE 2C: Try to get real crime data if in San Francisco
    if (inSF) {
        console.log('📍 Route is in San Francisco - querying crime data...');

        try {
            const crimeResult = await queryCrimesAlongRoute(route.coordinates);

            if (crimeResult !== null) {
                crimeData = crimeResult.allCrimes; // Extract allCrimes array
                crimeSamples = crimeResult.crimeSamples; // Extract crime samples for ombre route

                // Calculate route midpoint for baseline
                const midLat = (startLocation.lat + endLocation.lat) / 2;
                const midLng = (startLocation.lng + endLocation.lng) / 2;

                // Get area baseline for relative scoring
                areaBaseline = await calculateAreaBaseline(midLat, midLng);

                // Score crime data with baseline
                crimeBreakdown = scoreCrimeData(crimeData, distanceMiles, hour, areaBaseline);
                crimeScore = crimeBreakdown.score;
                usingCrimeData = true;
                console.log('✅ Using real SF crime data for scoring');
            } else {
                console.log('⚠️ Crime API unavailable - using fallback algorithm');
            }
        } catch (error) {
            console.error('❌ Error getting crime data:', error);
            console.log('⚠️ Falling back to Phase 2A algorithm');
        }
    } else {
        console.log('ℹ️ Route outside San Francisco - using standard algorithm');
    }

    // Determine location for sunset/sunrise (priority: user location → start location)
    const locationForSunset = currentUserLocation || startLocation;

    // Get sunset/sunrise data for nighttime warning
    let sunData = null;
    let showNighttimeWarning = false;

    if (locationForSunset) {
        sunData = await getSunriseSunset(locationForSunset.lat, locationForSunset.lng);
    }

    // Calculate other factor scores (0-100)
    const lengthScore = scoreRouteLength(distanceMiles);
    const timeScore = await scoreTimeOfDay(locationForSunset); // Now async with location
    const complexityScore = scoreRouteComplexity(route);
    const roadTypeScore = scoreRoadType(route);

    // Analyze day/night crimes and check if warning should be shown
    if (usingCrimeData && crimeData && sunData) {
        const dayNightAnalysis = analyzeDayNightCrimes(crimeData, sunData);
        const now = new Date();
        const isNighttime = isAfterSunset(now, sunData.sunset);

        // Show warning if: currently nighttime AND 25%+ crime increase at night
        if (isNighttime && dayNightAnalysis.nighttimeIncreasePercent >= 25) {
            showNighttimeWarning = true;
            console.log(`⚠️ Nighttime warning triggered: ${dayNightAnalysis.nighttimeIncreasePercent.toFixed(0)}% crime increase at night`);
        }
    }

    let totalScore;
    let breakdown;

    if (usingCrimeData) {
        // PHASE 2B: New weighted formula with crime data
        totalScore = (crimeScore * 0.50) +           // Crime data - 50%
                     (timeScore * 0.20) +            // Time of day - 20%
                     (lengthScore * 0.10) +          // Route length - 10%
                     (complexityScore * 0.10) +      // Complexity - 10%
                     (roadTypeScore * 0.10);         // Road type - 10%

        breakdown = {
            crimeData: {
                score: crimeScore,
                weight: 50,
                count: crimeData.length,
                highSeverity: crimeBreakdown.highSeverity,
                mediumSeverity: crimeBreakdown.mediumSeverity,
                lowSeverity: crimeBreakdown.lowSeverity,
                comparisonText: crimeBreakdown.comparisonText,
                percentDifference: crimeBreakdown.percentDifference
            },
            timeOfDay: { score: timeScore, weight: 20 },
            routeLength: { score: lengthScore, weight: 10 },
            complexity: { score: complexityScore, weight: 10 },
            roadType: { score: roadTypeScore, weight: 10 }
        };
    } else {
        // PHASE 2A: Fallback to original algorithm (no crime data)
        const densityScore = scorePopulationDensity(startLocation, endLocation);

        totalScore = (lengthScore * 0.30) +
                     (timeScore * 0.25) +
                     (complexityScore * 0.20) +
                     (roadTypeScore * 0.15) +
                     (densityScore * 0.10);

        breakdown = {
            routeLength: { score: lengthScore, weight: 30 },
            timeOfDay: { score: timeScore, weight: 25 },
            complexity: { score: complexityScore, weight: 20 },
            roadType: { score: roadTypeScore, weight: 15 },
            density: { score: densityScore, weight: 10 }
        };
    }

    // Convert to 0-10 scale
    const finalScore = (totalScore / 10).toFixed(1);

    console.log(`✅ Safety score calculated: ${finalScore}/10 (${getSafetyLabel(finalScore)})`);

    return {
        score: parseFloat(finalScore),
        label: getSafetyLabel(finalScore),
        color: getSafetyColor(finalScore),
        breakdown: breakdown,
        usingCrimeData: usingCrimeData,
        inSanFrancisco: inSF,
        rawCrimeData: crimeData, // Store raw crime array for detailed analysis
        crimeSamples: crimeSamples, // Crime samples for ombre route coloring
        showNighttimeWarning: showNighttimeWarning // Nighttime warning flag
    };
}

// ========================================
// SUNSET/SUNRISE API FUNCTIONS
// ========================================

// Get cache key for sunset data
function getSunsetCacheKey(lat, lng) {
    const roundedLat = lat.toFixed(2);
    const roundedLng = lng.toFixed(2);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `sunset_${roundedLat}_${roundedLng}_${today}`;
}

// Fetch sunset/sunrise times for a location
async function getSunriseSunset(lat, lng) {
    // Check cache first
    const cacheKey = getSunsetCacheKey(lat, lng);
    const cached = SUNSET_API.cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < SUNSET_API.cacheDuration)) {
        console.log(`📦 Using cached sunset data for ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        return cached.data;
    }

    try {
        const url = `${SUNSET_API.baseUrl}?lat=${lat}&lng=${lng}&date=today&formatted=0`;
        console.log(`🌅 Fetching sunset/sunrise times for ${lat.toFixed(4)}, ${lng.toFixed(4)}...`);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Sunset API returned ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== 'OK') {
            throw new Error('Sunset API error');
        }

        // Parse times (API returns ISO 8601 UTC times)
        const sunData = {
            sunrise: new Date(data.results.sunrise),
            sunset: new Date(data.results.sunset),
            solarNoon: new Date(data.results.solar_noon)
        };

        // Cache the results
        SUNSET_API.cache.set(cacheKey, {
            data: sunData,
            timestamp: Date.now()
        });

        console.log(`✅ Sunset: ${sunData.sunset.toLocaleTimeString()}, Sunrise: ${sunData.sunrise.toLocaleTimeString()}`);

        return sunData;

    } catch (error) {
        console.error('❌ Error fetching sunset data:', error);
        return null; // Return null to trigger fallback
    }
}

// Check if current time is after sunset
function isAfterSunset(currentTime, sunset) {
    return currentTime >= sunset;
}

// Check if current time is before sunrise
function isBeforeSunrise(currentTime, sunrise) {
    return currentTime < sunrise;
}

// Check if within X hours of sunset (for dusk detection)
function isNearSunset(currentTime, sunset, hours = 2) {
    const timeDiff = currentTime - sunset;
    const hoursDiff = timeDiff / (1000 * 60 * 60); // Convert ms to hours
    return hoursDiff >= 0 && hoursDiff <= hours;
}

// ========================================
// SAFETY SCORING FUNCTIONS
// ========================================

// Score based on route length (shorter is safer)
function scoreRouteLength(miles) {
    if (miles < 0.5) return 100;
    if (miles < 1.0) return 90;
    if (miles < 2.0) return 75;
    if (miles < 5.0) return 50;
    return 30;
}

// Score based on time of day (daylight is safer) - UPDATED with dynamic sunset/sunrise
async function scoreTimeOfDay(location) {
    const now = new Date();

    // Try to get dynamic sunset/sunrise times
    if (location && location.lat && location.lng) {
        try {
            const sunData = await getSunriseSunset(location.lat, location.lng);

            if (sunData) {
                // Successfully got sunset data - use dynamic scoring
                const afterSunset = isAfterSunset(now, sunData.sunset);
                const beforeSunrise = isBeforeSunrise(now, sunData.sunrise);
                const nearSunset = isNearSunset(now, sunData.sunset, 2);

                if ((afterSunset && beforeSunrise) || beforeSunrise) {
                    // Nighttime (after sunset or before sunrise)
                    return 40;
                } else if (nearSunset) {
                    // Dusk (within 2 hours after sunset)
                    return 70;
                } else {
                    // Daytime
                    return 100;
                }
            }
        } catch (error) {
            console.log('⚠️ Sunset API unavailable, using fallback hours');
        }
    }

    // FALLBACK: Use hardcoded hours (6am-8pm = day)
    const hour = now.getHours();

    if (hour >= 6 && hour < 20) return 100;  // 6am - 8pm: Daylight
    if (hour >= 20 && hour < 22) return 70;  // 8pm - 10pm: Dusk
    return 40;  // 10pm - 6am: Night
}

// Score based on route complexity (fewer turns is safer)
function scoreRouteComplexity(route) {
    const instructions = route.instructions || [];
    const turnCount = instructions.filter(inst => {
        const type = inst.type;
        // Count actual turns, not "continue straight"
        return type !== 'Head' && type !== 'Continue' && type !== 'Arrive';
    }).length;

    if (turnCount <= 3) return 100;
    if (turnCount <= 7) return 80;
    if (turnCount <= 12) return 60;
    return 40;
}

// Score based on road types (major roads safer than alleys)
function scoreRoadType(route) {
    // OSRM doesn't always provide detailed road classification
    // Use heuristic based on road names
    const instructions = route.instructions || [];
    let majorRoadCount = 0;
    let totalRoads = instructions.length || 1;

    instructions.forEach(inst => {
        const roadName = inst.road || inst.name || '';

        // Heuristic: Major roads often have these keywords or patterns
        if (roadName.match(/(Avenue|Boulevard|Highway|Street|Road|Drive|Way|Parkway)/i)) {
            majorRoadCount++;
        }
    });

    const majorRoadPercentage = (majorRoadCount / totalRoads) * 100;

    if (majorRoadPercentage >= 80) return 100;
    if (majorRoadPercentage >= 60) return 85;
    if (majorRoadPercentage >= 40) return 70;
    return 50;
}

// Score based on population density (urban is safer - more people)
function scorePopulationDensity(startLocation, endLocation) {
    // Analyze address components to determine area type
    const checkAddress = (location) => {
        if (!location || !location.name) return 'suburban';

        const address = location.name.toLowerCase();

        // Urban indicators
        if (address.match(/(downtown|city center|central|metro|manhattan|brooklyn|bronx)/i)) {
            return 'urban';
        }

        // Suburban indicators
        if (address.match(/(suburb|residential|neighborhood)/i)) {
            return 'suburban';
        }

        // Rural indicators
        if (address.match(/(rural|country|village|farm|remote)/i)) {
            return 'rural';
        }

        return 'suburban'; // Default
    };

    const startType = checkAddress(startLocation);
    const endType = checkAddress(endLocation);

    // Use the lower score of the two
    const scores = { urban: 100, suburban: 70, rural: 50 };
    return Math.min(scores[startType], scores[endType]);
}

// Get safety label from score
function getSafetyLabel(score) {
    score = parseFloat(score);
    if (score >= 8.5) return 'Excellent';
    if (score >= 7.0) return 'Good';
    if (score >= 5.0) return 'Fair';
    return 'Caution';
}

// Get color class from score
function getSafetyColor(score) {
    score = parseFloat(score);
    if (score >= 8.5) return 'excellent';
    if (score >= 7.0) return 'good';
    if (score >= 5.0) return 'fair';
    return 'caution';
}

// ========================================
// TURN-BY-TURN NAVIGATION (PHASE 3)
// ========================================

// Check if user is at the start point (for preview vs live mode detection)
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

// Start navigation mode
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

// Initialize navigation in proper sequence
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

// Start GPS tracking after map is ready
function startNavigationAfterMapReady() {
    console.log('✅ Map ready...');

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

    console.log('✅ Navigation started successfully');
}

// Start GPS tracking with watchPosition
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

    console.log('✅ GPS tracking started');
}

// Update navigation position (called on each GPS update)
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

// Advance to next navigation step
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

// Manual step navigation for Preview Mode
function nextStep() {
    if (!isPreviewMode) return; // Only works in preview mode

    if (currentStepIndex < routeSteps.length - 1) {
        currentStepIndex++;
        console.log(`➡️ Next step: ${currentStepIndex + 1}/${routeSteps.length}`);
        updateNavigationUI();
    }
}

function previousStep() {
    if (!isPreviewMode) return; // Only works in preview mode

    if (currentStepIndex > 0) {
        currentStepIndex--;
        console.log(`⬅️ Previous step: ${currentStepIndex + 1}/${routeSteps.length}`);
        updateNavigationUI();
    }
}

// Check if user is off-route
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

// Recalculate route from current position
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

        console.log('✅ Route recalculated successfully');
    });

    routingControl.on('routingerror', function(e) {
        console.error('❌ Recalculation failed:', e.error);
        isRecalculating = false;
        updateNavigationStatus('Recalculation failed', false);
    });
}

// Update navigation map with current position
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

// Update navigation UI elements
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

// Update navigation stats (remaining distance/time)
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

// Update navigation status indicator
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

// Handle arrival at destination
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

// End navigation and return to route results
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

    console.log('✅ Navigation ended');
}

// Calculate distance from point to polyline (route)
function calculateDistanceToPolyline(lat, lng, polylineCoords) {
    if (!polylineCoords || polylineCoords.length === 0) {
        return Infinity;
    }

    let minDistance = Infinity;

    // Check distance to each segment of the polyline
    for (let i = 0; i < polylineCoords.length - 1; i++) {
        const p1 = polylineCoords[i];
        const p2 = polylineCoords[i + 1];

        const distance = distanceToSegment(
            { lat: lat, lng: lng },
            { lat: p1.lat, lng: p1.lng },
            { lat: p2.lat, lng: p2.lng }
        );

        minDistance = Math.min(minDistance, distance);
    }

    return minDistance;
}

// Calculate distance from point to line segment
function distanceToSegment(point, segmentStart, segmentEnd) {
    // Convert to simple x/y coordinates
    const px = point.lng;
    const py = point.lat;
    const sx1 = segmentStart.lng;
    const sy1 = segmentStart.lat;
    const sx2 = segmentEnd.lng;
    const sy2 = segmentEnd.lat;

    // Calculate closest point on segment
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;

    if (dx === 0 && dy === 0) {
        // Segment is a point
        return calculateDistance(py, px, sy1, sx1);
    }

    const t = Math.max(0, Math.min(1, ((px - sx1) * dx + (py - sy1) * dy) / (dx * dx + dy * dy)));
    const closestX = sx1 + t * dx;
    const closestY = sy1 + t * dy;

    return calculateDistance(py, px, closestY, closestX);
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
// PAGE INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🎉 PinkPath initialized!');
    console.log('🗺️ Using OpenStreetMap + Leaflet');
    console.log('🆓 No API keys required!');
    console.log('====================================');

    // Ensure home screen is showing
    goToScreen('screen-home');

    // Initialize address autocomplete
    setupAutocomplete('start-location');
    setupAutocomplete('destination');

    // Add Enter key support for route inputs
    const startInput = document.getElementById('start-location');
    const destInput = document.getElementById('destination');

    if (startInput) {
        startInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                destInput?.focus();
            }
        });
    }

    if (destInput) {
        destInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                findRoute();
            }
        });
    }

    console.log('====================================');
    console.log('📊 FEATURES:');
    console.log('✅ OpenStreetMap Integration');
    console.log('✅ Nominatim Address Autocomplete (Free!)');
    console.log('✅ OSRM Route Calculation (Free!)');
    console.log('✅ Pink Custom Styling');
    console.log('✅ No API Keys Needed');
    console.log('✅ No Usage Limits');
    console.log('✅ 100% Free Forever');
    console.log('====================================');
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

window.addEventListener('resize', function() {
    console.log(`Window resized: ${window.innerWidth}x${window.innerHeight}`);
    console.log(`Device type: ${isMobile() ? 'Mobile' : 'Desktop/Tablet'}`);
});

console.log('📱 PinkPath is ready to use!');
console.log('👉 Try navigating between screens using the header menu');
console.log('👉 Click "Features" to learn about safety features');
console.log('👉 Go to "Plan Route" to test the route planning with real addresses!');
