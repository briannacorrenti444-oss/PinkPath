/**
 * @fileoverview PostgreSQL Database Connection
 * Handles database connection, initialization, and cleanup
 */

import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables (skip in Docker where env vars are injected)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '../../../.env' });
}

const { Pool } = pg;

// ==============================================
// DATABASE CONFIGURATION
// ==============================================

const isProduction = process.env.NODE_ENV === 'production';

// Allow explicit SSL disable for Docker/local environments
const sslEnabled = process.env.DB_SSL !== 'false' && isProduction;

/**
 * PostgreSQL connection pool configuration
 * SECURITY: SSL required in production to encrypt database connections
 * Set DB_SSL=false to disable SSL (e.g., for Docker environments)
 */
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Fallback to individual params if DATABASE_URL not set
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'pinkpath',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,

  // Pool settings
  max: 20,                // Maximum connections in pool
  idleTimeoutMillis: 30000,    // Close idle clients after 30s
  connectionTimeoutMillis: 5000, // Return error after 5s if can't connect

  // SECURITY: SSL configuration for production
  // Render and most cloud providers require SSL connections
  // Set DB_SSL=false for Docker/local PostgreSQL without SSL
  ssl: sslEnabled ? {
    rejectUnauthorized: false, // Required for Render/Heroku managed certs
  } : false,
};

/**
 * PostgreSQL connection pool
 * @type {pg.Pool}
 */
let pool = null;

// ==============================================
// CONNECTION MANAGEMENT
// ==============================================

/**
 * Initialize database connection and run migrations
 * @returns {Promise<void>}
 */
export async function initializeDatabase() {
  try {
    // Create connection pool
    pool = new Pool(poolConfig);

    // Test connection
    const client = await pool.connect();
    console.log('[DB] Connected to PostgreSQL');

    // Run schema initialization
    await initializeSchema(client);

    client.release();
    console.log('[DB] Database initialized successfully');

  } catch (error) {
    console.error('[DB] Failed to initialize database:', error.message);

    // In development, provide helpful error message
    if (process.env.NODE_ENV !== 'production') {
      console.error('[DB] Make sure PostgreSQL is running and credentials are correct');
      console.error('[DB] Connection string:', process.env.DATABASE_URL || 'Not set');
    }

    throw error;
  }
}

/**
 * Close database connection pool
 * @returns {Promise<void>}
 */
export async function closeDatabase() {
  if (pool) {
    await pool.end();
    console.log('[DB] Database connection closed');
  }
}

/**
 * Get a client from the pool for queries
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool.connect();
}

/**
 * Execute a query using the pool
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params = []) {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }

  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  // Log slow queries in development
  if (process.env.NODE_ENV !== 'production' && duration > 100) {
    console.log(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
  }

  return result;
}

// ==============================================
// SCHEMA INITIALIZATION
// ==============================================

/**
 * Initialize database schema (tables, indexes, etc.)
 * @param {pg.PoolClient} client - Database client
 */
async function initializeSchema(client) {
  console.log('[DB] Initializing schema...');

  // Create tables in order (respecting foreign key dependencies)
  await createUsersTable(client);
  await createContactsTable(client);
  await createSafetyPreferencesTable(client);
  await createCrimeDataCacheTable(client);
  await createStreetlightCacheTable(client);
  await createTransitStopsTable(client);
  await createRouteHistoryTable(client);

  // Rating system tables
  await createRatingCategoriesTable(client);
  await createRouteRatingsTable(client);
  await createSegmentPinsTable(client);

  // Trip sharing tables
  await createTripsTable(client);
  await createTripNotificationsTable(client);
  await addTripSharingPreferences(client);

  // BETA: Share intent logging for analytics
  await createShareIntentsTable(client);

  // BETA: Feature votes for prioritizing development
  await createFeatureVotesTable(client);

  // Hazard reporting system
  await createHazardCategoriesTable(client);
  await createHazardReportsTable(client);

  console.log('[DB] Schema initialization complete');
}

/**
 * Create users table
 */
async function createUsersTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(100) UNIQUE,
      password_hash VARCHAR(255),
      google_id VARCHAR(255) UNIQUE,
      subscription_level VARCHAR(50) DEFAULT 'free',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP WITH TIME ZONE,
      is_active BOOLEAN DEFAULT true
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
  `);
}

/**
 * Create emergency contacts table
 */
async function createContactsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      relationship VARCHAR(50),
      is_primary BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
  `);
}

/**
 * Create safety preferences table
 */
async function createSafetyPreferencesTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS safety_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      crime_weight DECIMAL(3,2) DEFAULT 0.35,
      realtime_crime_weight DECIMAL(3,2) DEFAULT 0.15,
      lighting_weight DECIMAL(3,2) DEFAULT 0.20,
      foot_traffic_weight DECIMAL(3,2) DEFAULT 0.15,
      time_of_day_weight DECIMAL(3,2) DEFAULT 0.15,
      prefer_well_lit BOOLEAN DEFAULT true,
      prefer_busy_areas BOOLEAN DEFAULT true,
      avoid_construction BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_safety_prefs_user_id ON safety_preferences(user_id);
  `);
}

/**
 * Create crime data cache table
 */
async function createCrimeDataCacheTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS crime_data_cache (
      id SERIAL PRIMARY KEY,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      incident_category VARCHAR(100),
      incident_subcategory VARCHAR(100),
      incident_datetime TIMESTAMP WITH TIME ZONE,
      resolution VARCHAR(100),
      police_district VARCHAR(50),
      severity_score INTEGER,
      is_violent BOOLEAN,
      fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_crime_lat_lng ON crime_data_cache(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_crime_datetime ON crime_data_cache(incident_datetime);
    CREATE INDEX IF NOT EXISTS idx_crime_category ON crime_data_cache(incident_category);
  `);
}

/**
 * Create streetlight complaints cache table
 */
async function createStreetlightCacheTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS streetlight_cache (
      id SERIAL PRIMARY KEY,
      case_id VARCHAR(50) UNIQUE,
      latitude DECIMAL(10, 7),
      longitude DECIMAL(10, 7),
      address TEXT,
      neighborhood VARCHAR(100),
      status VARCHAR(50),
      opened_date TIMESTAMP WITH TIME ZONE,
      closed_date TIMESTAMP WITH TIME ZONE,
      request_type VARCHAR(100),
      fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_streetlight_lat_lng ON streetlight_cache(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_streetlight_status ON streetlight_cache(status);
  `);
}

/**
 * Create transit stops table (for foot traffic proxy)
 */
async function createTransitStopsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS transit_stops (
      id SERIAL PRIMARY KEY,
      stop_id VARCHAR(50) UNIQUE NOT NULL,
      stop_name VARCHAR(255) NOT NULL,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      stop_type VARCHAR(50),
      routes TEXT[],
      fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_transit_lat_lng ON transit_stops(latitude, longitude);
  `);
}

/**
 * Create route history table (for analytics and future review system)
 */
async function createRouteHistoryTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS route_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      start_lat DECIMAL(10, 7) NOT NULL,
      start_lng DECIMAL(10, 7) NOT NULL,
      end_lat DECIMAL(10, 7) NOT NULL,
      end_lng DECIMAL(10, 7) NOT NULL,
      start_address TEXT,
      end_address TEXT,
      safety_score INTEGER,
      distance_meters INTEGER,
      duration_seconds INTEGER,
      route_type VARCHAR(20),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_route_history_user_id ON route_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_route_history_created ON route_history(created_at);

    -- Add polyline column if it doesn't exist (for rating correlation)
    ALTER TABLE route_history ADD COLUMN IF NOT EXISTS polyline TEXT;
    ALTER TABLE route_history ADD COLUMN IF NOT EXISTS rating_submitted BOOLEAN DEFAULT false;
  `);
}

/**
 * Create rating categories reference table
 */
async function createRatingCategoriesTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS rating_categories (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      label VARCHAR(100) NOT NULL,
      pin_type VARCHAR(10) NOT NULL CHECK (pin_type IN ('safe', 'caution')),
      is_active BOOLEAN DEFAULT true,
      display_order INTEGER DEFAULT 0
    );

    -- Seed default categories if table is empty
    INSERT INTO rating_categories (code, label, pin_type, display_order)
    SELECT * FROM (VALUES
      ('well_lit', 'Well-lit streets', 'safe', 1),
      ('busy_area', 'Busy area', 'safe', 2),
      ('police_presence', 'Police/security presence', 'safe', 3),
      ('open_businesses', 'Open businesses', 'safe', 4),
      ('good_visibility', 'Good visibility', 'safe', 5),
      ('dark_poorly_lit', 'Dark/poorly lit', 'caution', 1),
      ('isolated_empty', 'Isolated/empty', 'caution', 2),
      ('suspicious_activity', 'Suspicious activity', 'caution', 3),
      ('unsafe_construction', 'Unsafe construction', 'caution', 4),
      ('obstructed_visibility', 'Obstructed visibility', 'caution', 5)
    ) AS v(code, label, pin_type, display_order)
    WHERE NOT EXISTS (SELECT 1 FROM rating_categories LIMIT 1)
    ON CONFLICT (code) DO NOTHING;
  `);
}

/**
 * Create route ratings table (overall route feedback after navigation)
 */
async function createRouteRatingsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS route_ratings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_history_id INTEGER REFERENCES route_history(id) ON DELETE SET NULL,
      start_lat DECIMAL(10, 7) NOT NULL,
      start_lng DECIMAL(10, 7) NOT NULL,
      end_lat DECIMAL(10, 7) NOT NULL,
      end_lng DECIMAL(10, 7) NOT NULL,
      polyline TEXT,
      rating VARCHAR(10) NOT NULL CHECK (rating IN ('unsafe', 'neutral', 'safe')),
      star_rating INTEGER CHECK (star_rating >= 1 AND star_rating <= 5),
      reasons JSONB DEFAULT '[]',
      comment TEXT,
      was_preview_mode BOOLEAN DEFAULT false,
      time_of_day VARCHAR(20),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Add star_rating column if it doesn't exist (for existing databases)
    ALTER TABLE route_ratings ADD COLUMN IF NOT EXISTS star_rating INTEGER CHECK (star_rating >= 1 AND star_rating <= 5);

    CREATE INDEX IF NOT EXISTS idx_route_ratings_user_id ON route_ratings(user_id);
    CREATE INDEX IF NOT EXISTS idx_route_ratings_created ON route_ratings(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_route_ratings_rating ON route_ratings(rating);
    CREATE INDEX IF NOT EXISTS idx_route_ratings_star ON route_ratings(star_rating);
    CREATE INDEX IF NOT EXISTS idx_route_ratings_location ON route_ratings(start_lat, start_lng, end_lat, end_lng);
  `);
}

/**
 * Create segment pins table (location-specific safety reports)
 */
async function createSegmentPinsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS segment_pins (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_rating_id INTEGER REFERENCES route_ratings(id) ON DELETE SET NULL,
      lat DECIMAL(10, 7) NOT NULL,
      lng DECIMAL(10, 7) NOT NULL,
      pin_type VARCHAR(20) NOT NULL CHECK (pin_type IN ('safe', 'caution')),
      category VARCHAR(50) NOT NULL,
      comment TEXT,
      was_preview_mode BOOLEAN DEFAULT false,
      time_of_day VARCHAR(20),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      is_visible BOOLEAN DEFAULT true
    );

    CREATE INDEX IF NOT EXISTS idx_segment_pins_location ON segment_pins(lat, lng);
    CREATE INDEX IF NOT EXISTS idx_segment_pins_user ON segment_pins(user_id);
    CREATE INDEX IF NOT EXISTS idx_segment_pins_type ON segment_pins(pin_type);
    CREATE INDEX IF NOT EXISTS idx_segment_pins_visible ON segment_pins(is_visible) WHERE is_visible = true;
  `);
}

/**
 * Create trips table for tracking active/completed trips
 */
async function createTripsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_history_id INTEGER REFERENCES route_history(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'in_progress', 'arrived', 'cancelled', 'sos')),
      start_lat DECIMAL(10, 7) NOT NULL,
      start_lng DECIMAL(10, 7) NOT NULL,
      end_lat DECIMAL(10, 7) NOT NULL,
      end_lng DECIMAL(10, 7) NOT NULL,
      origin_name TEXT,
      destination_name TEXT,
      estimated_arrival TIMESTAMP WITH TIME ZONE,
      actual_arrival TIMESTAMP WITH TIME ZONE,
      current_lat DECIMAL(10, 7),
      current_lng DECIMAL(10, 7),
      last_location_update TIMESTAMP WITH TIME ZONE,
      sharing_enabled BOOLEAN DEFAULT true,
      delay_notified BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
    CREATE INDEX IF NOT EXISTS idx_trips_created ON trips(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_trips_active ON trips(user_id, status) WHERE status IN ('started', 'in_progress');
  `);
}

/**
 * Create trip notifications table for SMS delivery tracking
 */
async function createTripNotificationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS trip_notifications (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      notification_type VARCHAR(30) NOT NULL CHECK (notification_type IN ('trip_started', 'arrived', 'delayed', 'check_in', 'cancelled', 'sos')),
      delivery_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed')),
      message_content TEXT NOT NULL,
      twilio_sid VARCHAR(50),
      error_message TEXT,
      sent_at TIMESTAMP WITH TIME ZONE,
      delivered_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_trip_notifications_trip ON trip_notifications(trip_id);
    CREATE INDEX IF NOT EXISTS idx_trip_notifications_contact ON trip_notifications(contact_id);
    CREATE INDEX IF NOT EXISTS idx_trip_notifications_status ON trip_notifications(delivery_status);
    CREATE INDEX IF NOT EXISTS idx_trip_notifications_type ON trip_notifications(notification_type);
  `);
}

/**
 * Add trip sharing preference columns to safety_preferences table
 */
async function addTripSharingPreferences(client) {
  await client.query(`
    -- Add trip sharing preference columns if they don't exist
    ALTER TABLE safety_preferences ADD COLUMN IF NOT EXISTS share_trips_default BOOLEAN DEFAULT true;
    ALTER TABLE safety_preferences ADD COLUMN IF NOT EXISTS notify_on_arrival BOOLEAN DEFAULT true;
    ALTER TABLE safety_preferences ADD COLUMN IF NOT EXISTS notify_on_delay BOOLEAN DEFAULT true;
    ALTER TABLE safety_preferences ADD COLUMN IF NOT EXISTS delay_threshold_minutes INTEGER DEFAULT 15;
  `);
}

/**
 * BETA: Create share_intents table for tracking manual SMS attempts
 * Used for analytics to understand user engagement with trip sharing
 */
async function createShareIntentsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS share_intents (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      intent_type VARCHAR(20) NOT NULL CHECK (intent_type IN ('started', 'arrived', 'check_in', 'sos')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_share_intents_user ON share_intents(user_id);
    CREATE INDEX IF NOT EXISTS idx_share_intents_trip ON share_intents(trip_id);
    CREATE INDEX IF NOT EXISTS idx_share_intents_type ON share_intents(intent_type);
    CREATE INDEX IF NOT EXISTS idx_share_intents_created ON share_intents(created_at DESC);
  `);
}

/**
 * BETA: Create feature_votes table for tracking feature interest
 * Used for analytics to prioritize development based on user demand
 */
async function createFeatureVotesTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS feature_votes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      session_id VARCHAR(100),
      feature_key VARCHAR(50) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, feature_key),
      UNIQUE(session_id, feature_key)
    );

    CREATE INDEX IF NOT EXISTS idx_feature_votes_feature ON feature_votes(feature_key);
    CREATE INDEX IF NOT EXISTS idx_feature_votes_created ON feature_votes(created_at DESC);
  `);
}

/**
 * Create hazard categories reference table
 */
async function createHazardCategoriesTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS hazard_categories (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      label VARCHAR(100) NOT NULL,
      icon VARCHAR(10),
      severity_default VARCHAR(10) DEFAULT 'medium' CHECK (severity_default IN ('low', 'medium', 'high')),
      is_active BOOLEAN DEFAULT true,
      display_order INTEGER DEFAULT 0
    );

    -- Seed default hazard categories if table is empty
    INSERT INTO hazard_categories (code, label, icon, severity_default, display_order)
    SELECT * FROM (VALUES
      ('poor_lighting', 'Poor/No Lighting', '💡', 'medium', 1),
      ('broken_sidewalk', 'Broken Sidewalk', '🚧', 'low', 2),
      ('construction', 'Construction Zone', '🔨', 'low', 3),
      ('encampment', 'Encampment', '🏕️', 'medium', 4),
      ('suspicious_activity', 'Suspicious Activity', '👁️', 'high', 5),
      ('harassment', 'Harassment/Catcalling', '🚨', 'high', 6),
      ('no_sidewalk', 'No Sidewalk', '🚶', 'medium', 7),
      ('heavy_traffic', 'Heavy Traffic', '🚗', 'medium', 8),
      ('isolated_area', 'Isolated/Deserted', '🏚️', 'high', 9),
      ('obstructed_path', 'Obstructed Path', '⛔', 'low', 10),
      ('poor_visibility', 'Poor Visibility', '🌫️', 'medium', 11),
      ('aggressive_dogs', 'Aggressive Animals', '🐕', 'medium', 12)
    ) AS v(code, label, icon, severity_default, display_order)
    WHERE NOT EXISTS (SELECT 1 FROM hazard_categories LIMIT 1)
    ON CONFLICT (code) DO NOTHING;
  `);
}

/**
 * Create hazard reports table
 * Supports both spot reports (single location) and route-wide reports
 */
async function createHazardReportsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS hazard_reports (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_scope VARCHAR(10) NOT NULL CHECK (report_scope IN ('spot', 'route')),

      -- For spot reports: specific location
      lat DECIMAL(10, 7),
      lng DECIMAL(10, 7),

      -- For route reports: route bounds
      start_lat DECIMAL(10, 7),
      start_lng DECIMAL(10, 7),
      end_lat DECIMAL(10, 7),
      end_lng DECIMAL(10, 7),
      polyline TEXT,

      -- Hazard details (JSONB array allows multiple selections)
      hazard_types JSONB NOT NULL DEFAULT '[]',
      severity VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
      comment TEXT,

      -- Metadata
      time_of_day VARCHAR(20),
      was_preview_mode BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      resolved_at TIMESTAMP WITH TIME ZONE,

      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_hazard_reports_user ON hazard_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_hazard_reports_location ON hazard_reports(lat, lng) WHERE report_scope = 'spot';
    CREATE INDEX IF NOT EXISTS idx_hazard_reports_scope ON hazard_reports(report_scope);
    CREATE INDEX IF NOT EXISTS idx_hazard_reports_active ON hazard_reports(is_active) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_hazard_reports_created ON hazard_reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hazard_reports_severity ON hazard_reports(severity);
  `);
}

export { pool };
