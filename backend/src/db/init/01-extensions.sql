-- ==============================================
-- PinkPath Database Initialization
-- Extensions and initial setup
-- ==============================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'PinkPath database extensions initialized';
END $$;
