// ========================================
// PINKPATH CONFIGURATION
// Constants, API endpoints, and settings
// ========================================

// Backend API base URL (without /api suffix - endpoints add it)
export const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : '';

// Default location (San Francisco - center of the city)
export const defaultLocation = { lat: 37.7749, lng: -122.4194 };

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
