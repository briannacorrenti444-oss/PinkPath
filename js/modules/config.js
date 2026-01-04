// ========================================
// PINKPATH CONFIGURATION
// Constants, API endpoints, and settings
// ========================================

// Default location (New York City - will be replaced with user's location)
export const defaultLocation = { lat: 40.7128, lng: -74.0060 };

// ========================================
// CRIME DATA API CONFIGURATION
// ========================================

// San Francisco Open Data - Crime API
export const CRIME_API = {
    baseUrl: 'https://data.sfgov.org/resource/wg3w-h783.json',
    appToken: 'HAsCpzT6ovtq42o9dY9OHqtmD',
    radiusMeters: 500, // ~0.3 miles radius for crime queries
    daysBack: 90, // Look back 90 days for recent crime trends
    sampleInterval: 0.15 // Query crimes every 0.15 miles along route (optimized from 0.1)
};

// Crime cache duration (24 hours)
export const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Sunrise-Sunset API Configuration
export const SUNSET_API = {
    baseUrl: 'https://api.sunrise-sunset.org/json'
};

// Nominatim Geocoding API Configuration
export const NOMINATIM_API = {
    baseUrl: 'https://nominatim.openstreetmap.org',
    userAgent: 'PinkPath Safety Navigation App',
    searchLimit: 20,        // Max results from API
    displayLimit: 5,        // Max results to show in dropdown
    debounceMs: 300,        // Debounce delay for autocomplete
    minQueryLength: 3       // Minimum characters before searching
};

// San Francisco bounding box (to detect if route is in SF)
export const SF_BOUNDS = {
    north: 37.8324,
    south: 37.7039,
    east: -122.3482,
    west: -122.5155
};

// Crime severity weights for scoring
export const CRIME_WEIGHTS = {
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

