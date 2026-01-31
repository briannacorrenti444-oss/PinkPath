/**
 * @fileoverview Backend Configuration
 * Centralized configuration for all backend services
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../../../.env' });

// ==============================================
// SERVER CONFIGURATION
// ==============================================

export const serverConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3001',
};

// ==============================================
// DATABASE CONFIGURATION
// ==============================================

export const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'pinkpath',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

// ==============================================
// AUTHENTICATION CONFIGURATION
// ==============================================

export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
  jwtExpiresIn: '7d',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret',

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: `${serverConfig.backendUrl}/api/auth/google/callback`,
  },

  bcryptRounds: 12,
};

// ==============================================
// EXTERNAL API CONFIGURATION
// ==============================================

export const apiConfig = {
  // Google APIs
  google: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY,
    routesUrl: 'https://routes.googleapis.com/directions/v2:computeRoutes',
    placesUrl: 'https://places.googleapis.com/v1/places',
    geocodeUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
  },

  // San Francisco Open Data
  dataSF: {
    baseUrl: 'https://data.sfgov.org/resource',
    appToken: process.env.DATASF_APP_TOKEN || 'HAsCpzT6ovtq42o9dY9OHqtmD',
    datasets: {
      crime: 'wg3w-h783',
      cad: 'gnap-fj3t',
      streetlights: '6tt8-ugnj',
      transitStops: 'i28k-ysrd', // SFMTA GTFS stops
    },
  },

  // Sunrise/Sunset API (free, no key required)
  sunsetApi: {
    baseUrl: process.env.SUNRISE_SUNSET_API_URL || 'https://api.sunrise-sunset.org/json',
  },

  // SFMTA Transit Data
  sfmta: {
    gtfsUrl: process.env.SFMTA_GTFS_URL || 'https://gtfs.sfmta.com/transitdata/google_transit.zip',
  },
};

// ==============================================
// TWILIO CONFIGURATION
// ==============================================

export const twilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  enabled: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
};

// ==============================================
// RATE LIMITING CONFIGURATION
// ==============================================

export const rateLimitConfig = {
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
};

// ==============================================
// CACHE CONFIGURATION
// ==============================================

export const cacheConfig = {
  // Cache durations in milliseconds
  crime: 6 * 60 * 60 * 1000,         // 6 hours
  cad: 5 * 60 * 1000,                // 5 minutes
  streetlights: 24 * 60 * 60 * 1000, // 24 hours
  sunset: 7 * 24 * 60 * 60 * 1000,   // 7 days
  transit: 30 * 24 * 60 * 60 * 1000, // 30 days
  places: 24 * 60 * 60 * 1000,       // 24 hours
  geocoding: 30 * 24 * 60 * 60 * 1000, // 30 days (addresses don't change)
};

// ==============================================
// VALIDATION
// ==============================================

/**
 * Validate required configuration
 * Logs warnings for missing optional config, throws for required
 */
export function validateConfig() {
  const warnings = [];
  const errors = [];

  // Check Google API key
  if (!apiConfig.google.apiKey) {
    warnings.push('GOOGLE_MAPS_API_KEY not set - routing will not work');
  }

  // Check Google OAuth
  if (!authConfig.google.clientId || !authConfig.google.clientSecret) {
    warnings.push('Google OAuth credentials not set - Google login will not work');
  }

  // Check JWT secret in production
  if (!serverConfig.isDev && authConfig.jwtSecret === 'dev-jwt-secret') {
    errors.push('JWT_SECRET must be set in production');
  }

  // Check database
  if (!dbConfig.connectionString && !dbConfig.password) {
    warnings.push('Database credentials not fully configured');
  }

  // Log warnings
  warnings.forEach(w => console.warn(`[Config Warning] ${w}`));

  // Throw on errors
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

// Validate on import in production
if (process.env.NODE_ENV === 'production') {
  validateConfig();
}

export default {
  server: serverConfig,
  db: dbConfig,
  auth: authConfig,
  api: apiConfig,
  twilio: twilioConfig,
  rateLimit: rateLimitConfig,
  cache: cacheConfig,
};
