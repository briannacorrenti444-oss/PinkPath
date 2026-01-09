/**
 * @fileoverview Shared constants for PinkPath application
 * Used by both frontend and backend
 */

// ==============================================
// API ENDPOINTS
// ==============================================

/**
 * San Francisco Open Data (DataSF) API endpoints
 */
export const DATASF_API = {
  /** Base URL for all DataSF SODA API calls */
  baseUrl: 'https://data.sfgov.org/resource',

  /** Crime incident reports (historical - past 90 days) */
  crimeDataset: 'wg3w-h783',

  /** Real-time CAD dispatch calls */
  cadDataset: 'gnap-fj3t',

  /** Streetlight 311 service requests */
  streetlightDataset: '6tt8-ugnj',

  /**
   * Build full API URL for a dataset
   * @param {string} dataset - Dataset ID
   * @returns {string} Full API URL
   */
  getUrl(dataset) {
    return `${this.baseUrl}/${dataset}.json`;
  },
};

/**
 * Sunrise/Sunset API configuration
 */
export const SUNRISE_SUNSET_API = {
  baseUrl: 'https://api.sunrise-sunset.org/json',

  /**
   * Build API URL for a location
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {string} Full API URL
   */
  getUrl(lat, lng) {
    return `${this.baseUrl}?lat=${lat}&lng=${lng}&formatted=0`;
  },
};

/**
 * Google Maps/Routes API configuration
 */
export const GOOGLE_API = {
  /** Routes API for alternative route calculation */
  routesUrl: 'https://routes.googleapis.com/directions/v2:computeRoutes',

  /** Places API for Popular Times */
  placesUrl: 'https://places.googleapis.com/v1/places',

  /** Geocoding API */
  geocodeUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
};

// ==============================================
// SAN FRANCISCO BOUNDS
// ==============================================

/**
 * San Francisco city boundaries
 * Used to validate that routes are within service area
 */
export const SF_BOUNDS = {
  north: 37.8324,
  south: 37.6398,
  east: -122.3280,
  west: -122.5277,

  /**
   * Check if a point is within San Francisco
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {boolean} True if within SF bounds
   */
  contains(lat, lng) {
    return (
      lat >= this.south &&
      lat <= this.north &&
      lng >= this.west &&
      lng <= this.east
    );
  },

  /** Center point of San Francisco */
  center: {
    lat: 37.7749,
    lng: -122.4194,
  },
};

// ==============================================
// CRIME CATEGORIES
// ==============================================

/**
 * Crime category mappings
 * Maps DataSF incident categories to our severity levels
 */
export const CRIME_CATEGORIES = {
  violent: [
    'Homicide',
    'Assault',
    'Robbery',
    'Rape',
    'Sex Offense',
    'Kidnapping',
    'Human Trafficking',
    'Weapons Carrying',
    'Weapons Offense',
  ],

  property: [
    'Larceny Theft',
    'Burglary',
    'Motor Vehicle Theft',
    'Stolen Property',
    'Arson',
    'Vandalism',
  ],

  other: [
    'Drug Offense',
    'Drug Violation',
    'Fraud',
    'Forgery And Counterfeiting',
    'Embezzlement',
  ],

  /**
   * Check if a crime category is violent
   * @param {string} category - Crime category from DataSF
   * @returns {boolean}
   */
  isViolent(category) {
    return this.violent.some(c =>
      category.toLowerCase().includes(c.toLowerCase())
    );
  },

  /**
   * Check if a crime category is property crime
   * @param {string} category - Crime category from DataSF
   * @returns {boolean}
   */
  isProperty(category) {
    return this.property.some(c =>
      category.toLowerCase().includes(c.toLowerCase())
    );
  },
};

// ==============================================
// CAD CALL TYPES
// ==============================================

/**
 * CAD (Computer Aided Dispatch) call type mappings
 * Used to classify real-time police dispatch calls
 */
export const CAD_CALL_TYPES = {
  /** High priority - active danger */
  highPriority: [
    'SHOOTING',
    'STABBING',
    'ROBBERY',
    'ASSAULT',
    'FIGHT',
    'SHOTS FIRED',
    'PERSON WITH GUN',
    'PERSON WITH KNIFE',
  ],

  /** Medium priority - potential danger */
  mediumPriority: [
    'SUSPICIOUS PERSON',
    'SUSPICIOUS VEHICLE',
    'THEFT',
    'BURGLARY',
    'PROWLER',
    'DISTURBANCE',
  ],

  /** Low priority - minimal immediate danger */
  lowPriority: [
    'NOISE COMPLAINT',
    'PARKING VIOLATION',
    'TRESPASSER',
    'VANDALISM',
  ],

  /**
   * Get priority level for a call type
   * @param {string} callType - Call type from CAD data
   * @returns {'high'|'medium'|'low'|'unknown'}
   */
  getPriority(callType) {
    const upper = callType.toUpperCase();
    if (this.highPriority.some(t => upper.includes(t))) return 'high';
    if (this.mediumPriority.some(t => upper.includes(t))) return 'medium';
    if (this.lowPriority.some(t => upper.includes(t))) return 'low';
    return 'unknown';
  },
};

// ==============================================
// API RATE LIMITS & CACHING
// ==============================================

/**
 * Cache durations for different data types (in milliseconds)
 */
export const CACHE_DURATION = {
  /** Crime data - refresh every 6 hours */
  crimeData: 6 * 60 * 60 * 1000,

  /** CAD real-time data - refresh every 5 minutes */
  cadData: 5 * 60 * 1000,

  /** Streetlight data - refresh daily */
  streetlightData: 24 * 60 * 60 * 1000,

  /** Sunrise/sunset - refresh weekly */
  sunsetData: 7 * 24 * 60 * 60 * 1000,

  /** Google Routes - no cache (always fresh) */
  routeData: 0,

  /** Transit stops - refresh monthly */
  transitData: 30 * 24 * 60 * 60 * 1000,
};

/**
 * API request limits
 */
export const API_LIMITS = {
  /** Max crimes to fetch per query */
  maxCrimesPerQuery: 1000,

  /** Max CAD calls to fetch */
  maxCadCalls: 200,

  /** Max streetlight complaints to fetch */
  maxStreetlightComplaints: 500,

  /** Request timeout in milliseconds */
  requestTimeout: 30000,
};

// ==============================================
// USER SUBSCRIPTION LEVELS
// ==============================================

/**
 * Subscription tier definitions
 */
export const SUBSCRIPTION_LEVELS = {
  free: {
    id: 'free',
    name: 'Free',
    routesPerDay: 10,
    canCustomizeWeights: false,
    canShareTrip: false,
    canAddContacts: 1,
    features: ['Basic routing', 'Safety scores', '1 emergency contact'],
  },

  basic: {
    id: 'basic',
    name: 'Basic',
    routesPerDay: 50,
    canCustomizeWeights: true,
    canShareTrip: true,
    canAddContacts: 5,
    features: [
      'Unlimited routing',
      'Custom safety preferences',
      'Trip sharing',
      '5 emergency contacts',
    ],
  },

  premium: {
    id: 'premium',
    name: 'Premium',
    routesPerDay: Infinity,
    canCustomizeWeights: true,
    canShareTrip: true,
    canAddContacts: Infinity,
    features: [
      'Everything in Basic',
      'Real-time incident alerts',
      'Unlimited emergency contacts',
      'Priority support',
    ],
  },
};

// ==============================================
// HTTP STATUS CODES
// ==============================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// ==============================================
// ERROR CODES
// ==============================================

/**
 * Application-specific error codes
 */
export const ERROR_CODES = {
  // Auth errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',
  AUTH_TOKEN_EXPIRED: 'AUTH_002',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_003',

  // Route errors
  ROUTE_NOT_IN_SERVICE_AREA: 'ROUTE_001',
  ROUTE_CALCULATION_FAILED: 'ROUTE_002',
  ROUTE_TOO_LONG: 'ROUTE_003',

  // API errors
  API_EXTERNAL_FAILURE: 'API_001',
  API_RATE_LIMITED: 'API_002',
  API_INVALID_RESPONSE: 'API_003',

  // User errors
  USER_NOT_FOUND: 'USER_001',
  USER_ALREADY_EXISTS: 'USER_002',
  USER_INVALID_INPUT: 'USER_003',

  // Database errors
  DB_CONNECTION_FAILED: 'DB_001',
  DB_QUERY_FAILED: 'DB_002',
};

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

/**
 * Earth's radius in different units
 */
export const EARTH_RADIUS = {
  miles: 3959,
  kilometers: 6371,
  meters: 6371000,
};

/**
 * Convert meters to miles
 * @param {number} meters
 * @returns {number} Miles
 */
export function metersToMiles(meters) {
  return meters / 1609.34;
}

/**
 * Convert miles to meters
 * @param {number} miles
 * @returns {number} Meters
 */
export function milesToMeters(miles) {
  return miles * 1609.34;
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lng1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lng2 - Second point longitude
 * @param {string} unit - 'miles', 'kilometers', or 'meters'
 * @returns {number} Distance in specified unit
 */
export function calculateDistance(lat1, lng1, lat2, lng2, unit = 'meters') {
  const R = EARTH_RADIUS[unit] || EARTH_RADIUS.meters;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 * @param {number} degrees
 * @returns {number} Radians
 */
export function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}
