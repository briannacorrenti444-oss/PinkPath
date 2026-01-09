# PinkPath Architecture Guide

This document explains how the PinkPath codebase is organized and how data flows through the app.

---

## Table of Contents

1. [The Big Picture](#the-big-picture)
2. [Monorepo Structure](#monorepo-structure)
3. [Backend Architecture](#backend-architecture)
4. [Frontend Architecture](#frontend-architecture)
5. [Data Flow](#data-flow)
6. [The Path Algorithm](#the-path-algorithm)
7. [External APIs](#external-apis)
8. [Configuration](#configuration)

---

## The Big Picture

PinkPath is a **safety-focused navigation app** for pedestrians in San Francisco. It calculates walking routes and scores them based on:
- Historical crime data
- Real-time police dispatch (CAD) data
- Street lighting conditions
- Foot traffic estimates
- Time of day

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                │
│              (Google Maps, User Interface)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          BACKEND                                 │
│                    (Node.js/Fastify)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Routes    │  │  Services   │  │    Integration Layer    │  │
│  │  (/api/*)   │  │ (data fetch)│  │   (path algorithm)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │  PostgreSQL  │   │  Google APIs │   │  DataSF APIs │
    │  (database)  │   │  (routing)   │   │  (crime/CAD) │
    └──────────────┘   └──────────────┘   └──────────────┘
```

---

## Monorepo Structure

The project uses npm workspaces to organize code:

```
pinkpath/
│
├── package.json              # Root package.json (workspaces)
├── .env.example              # Environment template
├── ARCHITECTURE.md           # This file
├── CLAUDE.md                 # AI assistant guidelines
├── todo.md                   # Remaining work tracker
│
├── frontend/                 # @pinkpath/frontend
│   ├── package.json
│   ├── index.html            # Single-page app
│   ├── styles.css            # All styling
│   ├── privacy.html          # Privacy policy
│   ├── terms.html            # Terms of service
│   └── js/
│       ├── script.js         # Main app logic
│       └── modules/
│           ├── config.js     # Frontend config
│           ├── utils.js      # Helper functions
│           ├── services/     # API client services
│           ├── controllers/  # UI controllers
│           └── components/   # Reusable components
│
├── backend/                  # @pinkpath/backend
│   ├── package.json
│   └── src/
│       ├── server.js         # Fastify server entry
│       ├── config/           # Configuration
│       │   └── index.js      # Centralized config
│       ├── db/               # Database layer
│       │   └── connection.js # PostgreSQL + schema
│       ├── routes/           # API endpoints
│       │   ├── auth.js       # Authentication
│       │   ├── routes.js     # Route calculation
│       │   ├── users.js      # User management
│       │   └── safety.js     # Safety data
│       └── services/         # Business logic
│           ├── integration/
│           │   └── pathAlgorithm.js  # Core 6 functions
│           ├── googleRoutesService.js
│           ├── crimeService.js
│           ├── lightingService.js
│           ├── sunsetService.js
│           ├── footTrafficService.js
│           └── geocodingService.js
│
└── shared/                   # @pinkpath/shared
    ├── package.json
    ├── weights.js            # Safety scoring weights
    └── constants.js          # Shared constants
```

---

## Backend Architecture

### Server (`backend/src/server.js`)

Fastify server with:
- CORS for frontend communication
- JWT authentication
- Route registration
- Error handling
- Graceful shutdown

### Routes Layer (`backend/src/routes/`)

| Route File | Prefix | Purpose |
|------------|--------|---------|
| `auth.js` | `/api/auth` | Login, register, OAuth |
| `routes.js` | `/api/routes` | Route calculation, history |
| `users.js` | `/api/users` | Profile, preferences, contacts |
| `safety.js` | `/api/safety` | Crime, lighting, safety scores |

### Services Layer (`backend/src/services/`)

Each service handles one data domain:

| Service | Data Source | Purpose |
|---------|-------------|---------|
| `googleRoutesService.js` | Google Routes API | Get walking routes |
| `crimeService.js` | DataSF (wg3w-h783, gnap-fj3t) | Crime + CAD data |
| `lightingService.js` | DataSF (6tt8-ugnj) | Streetlight complaints |
| `sunsetService.js` | sunrise-sunset.org | Time of day context |
| `footTrafficService.js` | DataSF + Google Places | Pedestrian activity |
| `geocodingService.js` | Google Geocoding API | Address conversion |

### Integration Layer (`backend/src/services/integration/`)

The `pathAlgorithm.js` contains the core 6 functions:

```
calculateSafeRoutes()
    │
    ├── 1. getGoogleRoutePaths()      → Get 8 route options
    ├── 2. appendCrimeData()          → Add crime to segments
    ├── 3. appendLightingAndTraffic() → Add lighting + foot traffic
    ├── 4. getSunsetSunriseData()     → Get time context
    ├── 5. scorePaths()               → Calculate safety scores
    └── 6. selectPaths()              → Pick Safest, Fastest, Happy Medium
```

### Database Layer (`backend/src/db/`)

PostgreSQL with tables:
- `users` - User accounts (bcrypt passwords)
- `contacts` - Emergency contacts
- `safety_preferences` - User safety settings
- `crime_data_cache` - Cached crime data
- `streetlight_cache` - Cached lighting data
- `transit_stops` - SFMTA transit stops
- `route_history` - Saved routes

---

## Frontend Architecture

### Current State

The frontend currently uses **Leaflet + OpenStreetMap** for maps.

**Pending migration to:**
- Google Maps JavaScript API
- Backend API integration

### Screens (in index.html)

1. **Home Screen** - Welcome, start route planning
2. **Route Planning** - Enter origin/destination
3. **Route Results** - View routes on map, safety scores
4. **Navigation** - Turn-by-turn directions
5. **Settings** - User preferences

### JavaScript Modules

```
frontend/js/
├── script.js              # Main entry, state management
└── modules/
    ├── config.js          # API URLs, map settings
    ├── utils.js           # Distance calc, formatting
    ├── services/
    │   ├── crimeService.js     # (will call backend)
    │   ├── geocodingService.js # (will call backend)
    │   ├── safetyService.js    # Safety score display
    │   └── sunsetService.js    # (will call backend)
    ├── controllers/
    │   ├── mapController.js    # Map interactions
    │   ├── routeController.js  # Route logic
    │   ├── searchController.js # Address search
    │   └── safetyController.js # Safety display
    └── components/
        └── routePlanner.js     # Route planning UI
```

---

## Data Flow

### Route Calculation Flow

```
User: "Navigate from A to B"
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│  Frontend                                                     │
│  POST /api/routes/calculate { start, destination }           │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend: pathAlgorithm.calculateSafeRoutes()                │
│                                                               │
│  1. getGoogleRoutePaths()                                    │
│     └── Google Routes API → 8 walking routes                 │
│                                                               │
│  2. appendCrimeData()                                        │
│     └── DataSF Crime API → crime stats per segment           │
│                                                               │
│  3. appendLightingAndTraffic()                               │
│     ├── DataSF 311 API → streetlight complaints              │
│     └── DataSF Transit API → transit stop proximity          │
│                                                               │
│  4. getSunsetSunriseData()                                   │
│     └── sunrise-sunset.org → is it dark?                     │
│                                                               │
│  5. scorePaths()                                             │
│     └── Weighted algorithm → safety score 0-100              │
│                                                               │
│  6. selectPaths()                                            │
│     └── Pick: Safest, Fastest, Happy Medium                  │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
Response: {
  safest: { route, score: 87, ... },
  fastest: { route, score: 72, ... },
  balanced: { route, score: 81, ... }
}
```

### Safety Score Calculation

```
Safety Score = Σ(weight × factor_score) × time_modifier

Factors and Weights (configurable in shared/weights.js):
┌─────────────────────┬────────┬─────────────────────────────────┐
│ Factor              │ Weight │ What It Measures                │
├─────────────────────┼────────┼─────────────────────────────────┤
│ Historical Crime    │ 0.35   │ Past 90 days crime nearby       │
│ Real-time CAD       │ 0.15   │ Current police activity         │
│ Street Lighting     │ 0.20   │ 311 complaints + time of day    │
│ Foot Traffic        │ 0.15   │ Transit proximity, place activity│
│ Time of Day         │ 0.15   │ Daylight vs night modifier      │
└─────────────────────┴────────┴─────────────────────────────────┘

Time Modifiers:
- Daylight:   1.0 (no penalty)
- Twilight:   0.95
- Night:      0.85
- Late Night: 0.75 (midnight-5am)

Score Curve: Applied to normalize distribution (like school grades)
```

---

## The Path Algorithm

### The 6 Core Functions

#### 1. `getGoogleRoutePaths(start, destination)`
- Calls Google Routes API
- Requests up to 8 walking routes
- Returns array of route objects with polylines

#### 2. `appendCrimeData(paths)`
- For each route segment, query nearby crimes
- Calculate crime density per 100m
- Tag violent vs property crimes
- Returns paths with crime metadata

#### 3. `appendLightingAndTraffic(paths, sunData)`
- Query streetlight 311 complaints near route
- Query transit stops for foot traffic proxy
- Apply time-of-day adjustments
- Returns paths with lighting/traffic scores

#### 4. `getSunsetSunriseData(lat, lng)`
- Get current sunrise/sunset times
- Determine time period (day/twilight/night/lateNight)
- Calculate minutes until dark
- Returns sun context object

#### 5. `scorePaths(paths, sunData)`
- Apply weighted algorithm from shared/weights.js
- Calculate score for each path
- Apply score curve for distribution
- Returns paths with safety scores

#### 6. `selectPaths(scoredPaths)`
- Sort by safety score → pick safest
- Sort by duration → pick fastest
- Calculate balanced score → pick happy medium
- Returns { safest, fastest, balanced }

---

## External APIs

### Google APIs (requires API key)

| API | Purpose | Endpoint |
|-----|---------|----------|
| Routes API | Walking directions | routes.googleapis.com |
| Geocoding API | Address → coordinates | maps.googleapis.com/geocode |
| Places API | Autocomplete, place details | maps.googleapis.com/place |

### DataSF APIs (free, app token recommended)

| Dataset | ID | Purpose |
|---------|-----|---------|
| Police Incidents | wg3w-h783 | Historical crime (90 days) |
| CAD Dispatch | gnap-fj3t | Real-time police activity |
| 311 Cases | 6tt8-ugnj | Streetlight complaints |
| Transit Stops | i28k-ysrd | SFMTA bus/rail stops |

### Other APIs

| API | Purpose | Cost |
|-----|---------|------|
| sunrise-sunset.org | Sun times | Free |

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Required
GOOGLE_MAPS_API_KEY=your_key    # Get from Google Cloud Console
DATABASE_URL=postgres://...      # PostgreSQL connection
JWT_SECRET=random_string         # For authentication

# Optional (has defaults)
DATASF_APP_TOKEN=your_token     # Higher rate limits
PORT=3001                        # Backend port
```

### Weights Configuration

Edit `shared/weights.js` to adjust scoring:

```javascript
export const SAFETY_WEIGHTS = {
  crime: 0.35,        // Historical crime importance
  realtimeCrime: 0.15, // Current CAD importance
  lighting: 0.20,      // Street lighting importance
  footTraffic: 0.15,   // Foot traffic importance
  timeOfDay: 0.15,     // Time modifier importance
};
```

---

## Development Workflow

### Starting the Backend

```bash
# From root
npm install
cd backend
npm run dev
# Server at http://localhost:3001
```

### Starting the Frontend

```bash
# From root
cd frontend
npm run dev
# Serves at http://localhost:3000
```

### Running Both

```bash
# From root
npm run dev
# Uses concurrently to run both
```

---

## Quick Reference

### Where to Find Things

| I want to... | Look in... |
|--------------|------------|
| Change safety weights | `shared/weights.js` |
| Add an API endpoint | `backend/src/routes/*.js` |
| Modify path algorithm | `backend/src/services/integration/pathAlgorithm.js` |
| Change API config | `backend/src/config/index.js` |
| Update database schema | `backend/src/db/connection.js` |
| Modify frontend UI | `frontend/index.html` + `frontend/js/script.js` |

### Common Patterns

**Calling a backend service:**
```javascript
// In a route handler
import { getCrimeData } from '../services/crimeService.js';
const crimes = await getCrimeData(lat, lng, radius);
```

**Adding a new API endpoint:**
```javascript
// In routes/*.js
fastify.get('/new-endpoint', {
  schema: { querystring: { type: 'object', properties: {...} } }
}, async (request, reply) => {
  // Handler logic
  return reply.send({ success: true, data: ... });
});
```

---

Last updated: January 2026
