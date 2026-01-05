# PinkPath - Engineer Onboarding Guide

Welcome to PinkPath! This document will bring you fully up to speed on the codebase, architecture, patterns, and current state of development.

**Last Updated:** January 2026

---

## Table of Contents

1. [What Is PinkPath?](#what-is-pinkpath)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [Architecture Overview](#architecture-overview)
5. [Layer Definitions](#layer-definitions)
6. [State Management](#state-management)
7. [Key Patterns & Conventions](#key-patterns--conventions)
8. [Component System](#component-system)
9. [Data Flow](#data-flow)
10. [External APIs](#external-apis)
11. [Current Development Status](#current-development-status)
12. [Planned Features](#planned-features)
13. [Key Technical Decisions](#key-technical-decisions)
14. [Testing Approach](#testing-approach)
15. [Common Tasks](#common-tasks)
16. [Debugging Tips](#debugging-tips)
17. [Related Documentation](#related-documentation)

---

## What Is PinkPath?

PinkPath is a **safety-first pedestrian navigation app** for San Francisco. It helps users find the safest walking route between two locations by analyzing real crime data.

### Core Functionality

1. **Route Planning** - User enters start/destination addresses
2. **Multi-Route Calculation** - Fetches 2+ walking routes via OpenStreetMap/OSRM
3. **Crime Analysis** - Queries SF Open Data API for crimes along each route
4. **Safety Scoring** - Calculates 0-10 safety score based on crime density/severity
5. **Visual Feedback** - Displays "ombre" routes (green=safe, red=dangerous)
6. **Turn-by-Turn Navigation** - GPS-tracked walking directions
7. **Time-Aware Scoring** - Adjusts for nighttime (after sunset)

### Tech Stack

| Technology | Purpose |
|------------|---------|
| HTML/CSS/JavaScript | Core stack (no framework) |
| ES6 Modules | Code organization |
| Leaflet.js | Interactive maps |
| Leaflet Routing Machine | Route calculation |
| OpenStreetMap | Map tiles |
| OSRM | Walking route engine |

**No build step required.** The app runs directly in the browser with a local server.

---

## Quick Start

### Prerequisites

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Python 3.x OR Node.js OR VS Code with Live Server extension
- Text editor (VS Code recommended)

### Running Locally

```bash
# Navigate to project
cd "C:\Users\brian\OneDrive\Desktop\App-PinkPath\App V2"

# Option 1: Python
python -m http.server 8000

# Option 2: Node.js
npx serve

# Option 3: VS Code
# Right-click index.html → "Open with Live Server"
```

Then open: `http://localhost:8000`

**Why a local server?** ES6 modules require HTTP protocol. Opening `index.html` directly (`file://`) causes CORS errors.

### First Test

1. Click "Plan Route" on home screen
2. Enter "Union Square" as start
3. Enter "Ferry Building" as destination
4. Click "Find Safest Route"
5. Verify: Routes display with safety scores

---

## Project Structure

```
App V2/
│
├── index.html                 # Single-page app (all screens as <section>)
├── styles.css                 # All styling (~2000 lines)
├── terms.html                 # Terms of Service page
├── privacy.html               # Privacy Policy page
│
├── README.md                  # Project overview
├── CONTRIBUTING.md            # Code style & testing tiers
├── ARCHITECTURE.md            # Data flow diagrams
├── ONBOARDING.md              # This file
│
└── js/
    ├── script.js              # Main application (~2800 lines)
    │                          #   - State management
    │                          #   - Screen navigation
    │                          #   - Map rendering
    │                          #   - GPS/navigation logic
    │                          #   - Component initialization
    │
    └── modules/
        ├── config.js          # API URLs, weights, constants
        ├── utils.js           # Helper functions (distance, formatting)
        │
        ├── components/        # Reusable UI widgets
        │   └── routePlanner.js    # Route input form component
        │
        ├── controllers/       # UI event handlers for existing DOM
        │   └── searchController.js  # Autocomplete setup
        │
        └── services/          # Pure business logic (no DOM access)
            ├── crimeService.js      # SF crime data API
            ├── sunsetService.js     # Sunrise/sunset times
            ├── safetyService.js     # Safety score calculation
            └── geocodingService.js  # Address → coordinates
```

### File Responsibilities

| File | Lines | Responsibility |
|------|-------|----------------|
| `script.js` | ~2800 | Main orchestrator: state, screens, maps, navigation |
| `config.js` | ~90 | API endpoints, crime weights, map settings |
| `utils.js` | ~130 | Haversine distance, number formatting |
| `routePlanner.js` | ~430 | Self-contained route input form widget |
| `searchController.js` | ~200 | Autocomplete dropdown logic |
| `crimeService.js` | ~650 | Fetches/processes SF crime data |
| `safetyService.js` | ~430 | Calculates weighted safety scores |
| `sunsetService.js` | ~155 | Gets sunrise/sunset for location |
| `geocodingService.js` | ~280 | Converts addresses to lat/lng |

---

## Architecture Overview

PinkPath follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                         index.html                               │
│                  Static structure, all screens                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          script.js                               │
│                     Main Orchestrator                            │
│  • State management (global variables at top)                    │
│  • Screen navigation (goToScreen function)                       │
│  • Map rendering (Leaflet integration)                           │
│  • Initializes components and wires callbacks                    │
│  • Coordinates all modules                                       │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────────┐
│   components/  │   │  controllers/  │   │     services/      │
│                │   │                │   │                    │
│ Self-contained │   │ Wire events to │   │ Pure functions     │
│ UI widgets     │   │ existing DOM   │   │ No DOM access      │
│ Own HTML/state │   │ elements       │   │ API calls & calc   │
└────────────────┘   └────────────────┘   └────────────────────┘
           │                    │                    │
           └────────────────────┴────────────────────┘
                                │
                                ▼
                    ┌────────────────────┐
                    │  config.js         │
                    │  utils.js          │
                    │  (shared tools)    │
                    └────────────────────┘
```

---

## Layer Definitions

Understanding which layer to use is critical for maintaining code quality.

### Components (`modules/components/`)

**Purpose:** Self-contained, reusable UI widgets that generate their own HTML.

**Characteristics:**
- Creates DOM elements dynamically
- Manages internal state
- Communicates via callbacks (not events)
- Can have multiple instances
- Imports from controllers/services as needed

**Example:** `RoutePlanner` - renders the route input form, handles its own autocomplete, exposes callbacks for when user selects location or requests route.

**When to create a component:**
- UI element needs to be reused in multiple places
- UI element has complex internal state
- You need multiple independent instances

```javascript
// Component usage pattern
import { RoutePlanner } from './modules/components/routePlanner.js';

const planner = new RoutePlanner(containerElement, {
    instanceId: 'main',
    onRouteRequest: (values, prefs) => handleRoute(values, prefs),
    onLocationSelected: (type, location) => handleSelection(type, location)
});
planner.init();
```

### Controllers (`modules/controllers/`)

**Purpose:** Wire event handlers to existing DOM elements.

**Characteristics:**
- Does NOT create HTML
- Sets up event listeners on existing elements
- Bridges between DOM and services
- Typically stateless or minimal state

**Example:** `searchController` - sets up autocomplete on an input field that already exists in the DOM.

**When to create a controller:**
- You need to add behavior to existing HTML elements
- You're handling user interactions that don't warrant a full component

```javascript
// Controller usage pattern
import { setupAutocomplete } from './modules/controllers/searchController.js';

setupAutocomplete('input-element-id', getCurrentLocation, onSelectionCallback);
```

### Services (`modules/services/`)

**Purpose:** Pure business logic, API calls, and calculations.

**Characteristics:**
- NO DOM access whatsoever
- Pure functions (input → output)
- Async for API calls
- Highly testable
- Reusable across projects

**Example:** `crimeService` - fetches crime data from SF Open Data, returns structured objects.

**When to create a service:**
- Making API calls to external services
- Complex calculations or data transformations
- Logic that should be testable without a browser

```javascript
// Service usage pattern
import { queryCrimesAlongRoute } from './modules/services/crimeService.js';

const crimes = await queryCrimesAlongRoute(routeCoordinates, bufferMeters);
```

### Decision Matrix

| Scenario | Use |
|----------|-----|
| Reusable UI with own HTML | Component |
| Multiple instances of same UI | Component |
| Adding behavior to existing HTML | Controller |
| API calls | Service |
| Calculations/transformations | Service |
| No DOM needed | Service |

---

## State Management

All application state lives in `script.js` as module-level variables, organized into logical groups.

### State Groups

```javascript
// ========================================
// 1. MAP STATE - Leaflet objects
// ========================================
let routeMap = null;                    // Map on route results screen
let navigationMap = null;               // Map on navigation screen
let ombreRouteLayer = null;             // Colored route polyline
let alternativeRouteLayer = null;       // Dashed alternative route
let crimeMarkerClusterGroup = null;     // Clustered crime markers
let locationMarker = null;              // "You are here" marker

// ========================================
// 2. LOCATION STATE - User selections
// ========================================
let selectedStart = null;               // {lat, lng, name}
let selectedDestination = null;         // {lat, lng, name}
let currentUserLocation = null;         // From "Use My Location" button
let currentUserPosition = null;         // Live GPS during navigation

// ========================================
// 3. ROUTE STATE - Calculated routes
// ========================================
let currentRoute = null;                // Currently selected route object
let routeOptions = [];                  // All route alternatives
let selectedRouteIndex = 0;             // Index of selected route (0, 1, ...)
let currentRouteData = {                // Metadata for selected route
    distance: null,
    duration: null,
    safetyScore: null,
    safetyLabel: null,
    crimeBreakdown: null
};

// ========================================
// 4. NAVIGATION STATE - Turn-by-turn
// ========================================
let isNavigating = false;               // Navigation mode active?
let isPreviewMode = false;              // Preview vs live GPS mode
let currentStepIndex = 0;               // Current instruction index
let routeSteps = [];                    // Turn-by-turn instructions
let watchId = null;                     // GPS watcher ID

// ========================================
// 5. COMPONENT STATE - UI instances
// ========================================
let mainRoutePlanner = null;            // RoutePlanner on Plan Route screen
let homeRoutePlanner = null;            // RoutePlanner on Home CTA section

// ========================================
// 6. UI STATE - Visual settings
// ========================================
let currentMode = 'light';              // Map theme: 'light' or 'dark'
```

### State Update Pattern

```javascript
// 1. Update state variable
selectedRouteIndex = 1;

// 2. Update derived state
currentRoute = routeOptions[selectedRouteIndex];
currentRouteData = extractRouteData(currentRoute);

// 3. Update UI to reflect new state
updateRouteComparisonUI();
updateSafetyDisplay();
redrawRoutes();
```

### State Sync Between Components

When state changes in one place, other UI elements may need updating:

```javascript
function syncLocationSelection(sourceInstance, type, location) {
    // 1. Update shared state
    if (type === 'start') {
        selectedStart = location;
    } else if (type === 'destination') {
        selectedDestination = location;
    }

    // 2. Update the OTHER component instance
    const targetInstance = sourceInstance === 'main'
        ? homeRoutePlanner
        : mainRoutePlanner;

    if (targetInstance) {
        const values = {};
        values[type] = location.name || '';
        targetInstance.setValues(values);
    }
}
```

---

## Key Patterns & Conventions

### 1. Callbacks Over Events

Components communicate via callbacks, not DOM events.

```javascript
// GOOD - Explicit callback
const planner = new RoutePlanner(container, {
    onRouteRequest: (values, prefs) => findRoute(values, prefs)
});

// AVOID - DOM events (hidden coupling)
container.addEventListener('route-request', (e) => findRoute(e.detail));
```

**Why?**
- Explicit data flow
- Easier to debug
- Type-safe parameters
- No event name strings to maintain

### 2. Parameters Over DOM Reads

Functions receive data as parameters rather than reading from DOM.

```javascript
// GOOD - Receives values
async function findRoute(inputValues = {}, safetyPreferences = {}) {
    const startLocation = (inputValues.start || '').trim();
    const destination = (inputValues.destination || '').trim();
    // ...
}

// AVOID - Reads from DOM
async function findRoute() {
    const startLocation = document.getElementById('start-location').value;
    // Breaks if element ID changes or multiple instances exist
}
```

**Why?**
- Works with multiple component instances
- Testable without DOM
- Clear dependencies

### 3. Dynamic Element IDs

Components use instance-prefixed IDs to avoid conflicts.

```javascript
class RoutePlanner {
    constructor(container, options) {
        this.instanceId = options.instanceId || 'default';
    }

    get startInputId() {
        return `${this.instanceId}-start-location`;
        // Results in: 'main-start-location' or 'home-start-location'
    }
}
```

### 4. Null-Safe Wrappers

When passing callbacks that may need to call external functions:

```javascript
// In component initialization
getUserLocation: (inputId, onLocationSelected) =>
    getUserLocationForInput(inputId, onLocationSelected),

// The function handles null callback gracefully
async function getUserLocationForInput(inputId, onLocationSelected = null) {
    // ... do work ...
    if (onLocationSelected) {
        onLocationSelected(result);
    }
}
```

### 5. Console Logging with Emojis

Consistent logging helps trace execution flow:

```javascript
console.log('🗺️ Initializing map...');
console.log('📍 Location found:', location);
console.log('✅ Route calculated successfully');
console.log('⚠️ Warning: No crime data for this area');
console.log('❌ Error:', error.message);
console.log('[RoutePlanner:main] Initialized');  // Component prefix
```

### 6. JSDoc Documentation

All functions should have JSDoc comments:

```javascript
/**
 * Calculate safety score for a route based on crime data
 *
 * @param {Array<{lat: number, lng: number}>} routePoints - Route coordinates
 * @param {Object} options - Scoring options
 * @param {boolean} options.isNighttime - Whether it's after sunset
 * @returns {Promise<{score: number, label: string, breakdown: Object}>}
 */
async function calculateSafetyScore(routePoints, options = {}) {
    // ...
}
```

---

## Component System

### RoutePlanner Component

The `RoutePlanner` is currently the only component. It's a self-contained route input form.

#### Features
- Start location input with autocomplete
- Destination input with autocomplete
- "Use My Location" GPS button
- Safety preferences checkboxes (optional)
- Share trip button (optional)
- Find route button
- Keyboard navigation (Enter to proceed)

#### Configuration Options

```javascript
const planner = new RoutePlanner(containerElement, {
    // Required
    instanceId: 'main',              // Unique ID for element prefixing

    // Optional UI toggles
    showPreferences: true,           // Show safety preferences section
    showShareButton: true,           // Show share trip button

    // Callbacks
    getCurrentLocation: () => currentUserLocation,
    getUserLocation: (inputId, callback) => getUserLocationForInput(inputId, callback),
    onLocationSelected: (type, location) => syncLocationSelection('main', type, location),
    onRouteRequest: (values, prefs) => findRoute(values, prefs),
    onShareTrip: () => handleShareTrip()
});

planner.init();  // Renders HTML and wires events
```

#### Public Methods

| Method | Purpose |
|--------|---------|
| `init()` | Render HTML and set up event handlers |
| `getValues()` | Returns `{start: string, destination: string}` |
| `setValues({start?, destination?})` | Update input values |
| `clear()` | Clear both inputs |
| `getPreferences()` | Returns `{wellLit, busyAreas, avoidConstruction}` |

#### Current Instances

| Instance | Location | Config |
|----------|----------|--------|
| `mainRoutePlanner` | Plan Route screen | Full features |
| `homeRoutePlanner` | Home page CTA section | No preferences, no share button |

---

## Data Flow

### Flow 1: Finding a Route

```
User enters addresses and clicks "Find Safest Route"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  RoutePlanner component                                      │
│  • Collects input values via getValues()                     │
│  • Collects preferences via getPreferences()                 │
│  • Calls onRouteRequest(values, preferences)                 │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  findRoute(inputValues, safetyPreferences)                   │
│  • Validates inputs                                          │
│  • Geocodes addresses if needed                              │
│  • Navigates to results screen                               │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  calculateAndDisplayRoute()                                  │
│  • Calls Leaflet Routing Machine → OSRM                      │
│  • Gets multiple route alternatives                          │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  For each route:                                             │
│  ├── safetyService.calculateSafetyScore()                    │
│  │       ├── crimeService.queryCrimesAlongRoute()            │
│  │       └── sunsetService.getSunriseSunset()                │
│  └── Returns: {score, label, breakdown, crimes}              │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Update state:                                               │
│  • routeOptions = [route1, route2, ...]                      │
│  • selectedRouteIndex = 0 (safest)                           │
│  • currentRoute = routeOptions[0]                            │
│  • currentRouteData = {distance, duration, safetyScore, ...} │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Update UI:                                                  │
│  • drawOmbreRoute() → colored route on map                   │
│  • addCrimeMarkersToMap() → crime location markers           │
│  • updateSafetyDisplay() → safety score badge                │
│  • updateRouteComparisonUI() → route option cards            │
└─────────────────────────────────────────────────────────────┘
```

### Flow 2: Using GPS Location

```
User clicks "Use My Location" button
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  RoutePlanner.wireButtons()                                  │
│  • Calls getUserLocation(inputId, callback)                  │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  getUserLocationForInput(inputId, onLocationSelected)        │
│  • Shows loading state on button                             │
│  • Calls navigator.geolocation.getCurrentPosition()          │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  On GPS success:                                             │
│  • reverseGeocode(lat, lng) → Get address string             │
│  • Fill input field with address                             │
│  • Set selectedStart = {lat, lng, name}                      │
│  • Call onLocationSelected(selectedStart) if provided        │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  syncLocationSelection(sourceInstance, 'start', location)    │
│  • Updates shared state                                      │
│  • Updates OTHER component instance                          │
└─────────────────────────────────────────────────────────────┘
```

### Flow 3: Sync Between Instances

```
User types address in Home screen input
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Autocomplete selection triggers callback                    │
│  homeRoutePlanner.onLocationSelected('start', location)      │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  syncLocationSelection('home', 'start', location)            │
│  • selectedStart = location (shared state)                   │
│  • mainRoutePlanner.setValues({start: location.name})        │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
  User navigates to Plan Route screen
  → Start field already populated with same address
```

---

## External APIs

### API Summary

| API | Purpose | Rate Limit | Auth | Module |
|-----|---------|------------|------|--------|
| OSRM | Walking route calculation | None | None | Leaflet Routing Machine |
| OpenStreetMap | Map tile images | Fair use | None | Leaflet |
| Nominatim | Geocoding | 1 req/sec | None | geocodingService.js |
| SF Open Data | Crime statistics | None | Optional token | crimeService.js |
| sunrise-sunset.org | Sunrise/sunset times | None | None | sunsetService.js |

### SF Open Data (DataSF)

**Endpoint:** `https://data.sfgov.org/resource/wg3w-h783.json`

**Data:** Police incident reports with location, date, category, description.

**Query Example:**
```javascript
const url = `https://data.sfgov.org/resource/wg3w-h783.json?$where=
    incident_date >= '${startDate}' AND
    latitude IS NOT NULL AND
    within_box(point, ${minLat}, ${minLng}, ${maxLat}, ${maxLng})
    &$limit=10000`;
```

### Nominatim (Geocoding)

**Endpoint:** `https://nominatim.openstreetmap.org/search`

**Purpose:** Convert text addresses to coordinates.

**Rate Limit:** Maximum 1 request per second. The app debounces autocomplete.

### sunrise-sunset.org

**Endpoint:** `https://api.sunrise-sunset.org/json`

**Purpose:** Get sunrise/sunset times for any location.

**Response:**
```json
{
    "results": {
        "sunrise": "2:30:00 PM",
        "sunset": "1:30:00 AM",
        "solar_noon": "8:00:00 PM"
    },
    "status": "OK"
}
```

Note: Times are in UTC, must convert to local.

---

## Current Development Status

### Completed Features

| Feature | Status | Notes |
|---------|--------|-------|
| Route planning | Complete | OSRM + Leaflet |
| Address autocomplete | Complete | Nominatim API |
| GPS "Use My Location" | Complete | Geolocation API |
| Crime data integration | Complete | SF Open Data |
| Safety scoring | Complete | Weighted algorithm |
| Ombre route visualization | Complete | Color-coded segments |
| Multiple route comparison | Complete | Up to 3 routes |
| Turn-by-turn navigation | Complete | Preview + live modes |
| Off-route detection | Complete | Auto-recalculates |
| Dark/light map mode | Complete | Toggle in UI |
| Privacy policy | Complete | privacy.html |
| Terms of service | Complete | terms.html |

### Recently Completed

| Feature | Description |
|---------|-------------|
| RoutePlanner component | Reusable route input form widget |
| Dual instance support | Same form on home + plan route screens |
| Bidirectional sync | Addresses sync between instances |
| Parameter-based findRoute | Removed DOM dependencies |

### Known Issues

- None currently tracked

---

## Planned Features

### Street Lighting Integration (In Planning)

**Goal:** Add lighting score to safety calculation during nighttime hours.

**Status:** Data source evaluation in progress.

**Data Source Options:**

| Source | Coverage | Accessibility | Notes |
|--------|----------|---------------|-------|
| SFPUC ArcGIS | SF official data | Unknown | Has interactive map, need to verify REST API |
| OpenStreetMap | Varies (~50-70% SF) | Open, free | `highway=street_lamp` tag via Overpass API |
| DataSF | N/A | N/A | Only has 311 complaints, not locations |

**Proposed Architecture:**
```
js/modules/
├── services/
│   └── lightingService.js      # Core lighting logic
├── utils/
│   └── spatialIndex.js         # Grid-based spatial indexing
└── data/
    └── sf-streetlights.json    # Cached streetlight locations
```

**Integration Logic:**
```javascript
if (isDarkHours()) {
    lightingScore = lightingService.getLightingScore(routePoints);
    safetyScore = weightedAverage(crimeScore * 0.6, lightingScore * 0.4);
} else {
    safetyScore = crimeScore;  // Lighting irrelevant during day
}
```

---

## Key Technical Decisions

### Why Vanilla JavaScript (No Framework)?

- **Simplicity:** No build step, no bundler configuration
- **Performance:** Minimal overhead, fast load times
- **Learning:** Easier for beginners to understand
- **Longevity:** No framework deprecation concerns

### Why ES6 Modules?

- **Organization:** Clear imports/exports
- **Encapsulation:** Module-level scope prevents pollution
- **Browser Support:** Native in modern browsers
- **Future-Proof:** Standard JavaScript feature

### Why Callbacks Over Events for Components?

- **Explicit:** Data flow is visible in code
- **Type-Safe:** Parameters are defined
- **Debuggable:** Easy to set breakpoints
- **Testable:** Can mock callbacks easily

### Why Parameters Over DOM Reads?

- **Multi-Instance:** Works when same component exists twice
- **Testable:** Functions work without browser DOM
- **Maintainable:** No hidden dependencies on element IDs

### Why Grid-Based Spatial Indexing (Planned)?

For street lighting queries:
- **Simple:** Easier to implement than quadtrees
- **Sufficient:** City-scale data (~10k points) doesn't need complex structures
- **Fast:** O(1) average case for proximity queries
- **Debuggable:** Easy to visualize grid cells

---

## Testing Approach

### Tier 1: Smoke Test (After ANY Change)

Run in 30 seconds:

- [ ] App loads without console errors
- [ ] Can type in address fields
- [ ] Autocomplete dropdown appears
- [ ] "Find Safest Route" calculates routes
- [ ] Routes display on map
- [ ] Safety score shows
- [ ] Can start navigation
- [ ] Can exit navigation

### Tier 2: Feature-Specific Tests

Run tests relevant to your change. See `CONTRIBUTING.md` for full checklists.

### Tier 3: Full Regression

Run before releases. Comprehensive checklist in `CONTRIBUTING.md`.

### Browser Testing

Test in:
- Chrome (primary)
- Firefox
- Safari (if available)
- Mobile browser

---

## Common Tasks

### Adding a New Screen

1. Add HTML to `index.html`:
```html
<section id="screen-my-screen" class="screen">
    <!-- Screen content -->
</section>
```

2. Navigate to it:
```javascript
goToScreen('screen-my-screen');
```

3. Add initialization in `goToScreen()` if needed.

### Adding a New Service

1. Create `js/modules/services/myService.js`:
```javascript
/**
 * My service description
 */

export async function myFunction(param) {
    // Pure logic, no DOM
    return result;
}
```

2. Import in `script.js`:
```javascript
import { myFunction } from './modules/services/myService.js';
```

### Adding a New Component

1. Create `js/modules/components/myComponent.js`:
```javascript
class MyComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.instanceId = options.instanceId || 'default';
        // Store callbacks
        this.onSomething = options.onSomething || (() => {});
    }

    getTemplate() {
        return `<div id="${this.instanceId}-element">...</div>`;
    }

    init() {
        this.container.innerHTML = this.getTemplate();
        this.wireEvents();
    }

    wireEvents() {
        // Set up event listeners
    }
}

export { MyComponent };
```

2. Initialize in `script.js`:
```javascript
import { MyComponent } from './modules/components/myComponent.js';

const myComponent = new MyComponent(document.getElementById('container'), {
    instanceId: 'main',
    onSomething: (data) => handleSomething(data)
});
myComponent.init();
```

### Modifying Safety Score Calculation

1. Edit `js/modules/services/safetyService.js`
2. Adjust weights in `config.js` → `CRIME_WEIGHTS`
3. Test with various routes

---

## Debugging Tips

### Console Logging

Open DevTools (F12) → Console tab.

Look for emoji prefixes:
- 🗺️ Map operations
- 📍 Location/GPS
- ✅ Success
- ⚠️ Warning
- ❌ Error
- `[Component:id]` Component-specific logs

### Common Issues

| Problem | Solution |
|---------|----------|
| Map not showing | Check container has CSS height |
| Routes not calculating | Check console for API errors |
| GPS not working | Must be on HTTPS or localhost |
| Autocomplete not appearing | Check network tab for Nominatim calls |
| State not updating | Verify UI update function is called after state change |
| Component not syncing | Check callback is properly wired |

### Network Debugging

1. DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Look for failed requests (red)
4. Check request/response payloads

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview, quick start |
| `CONTRIBUTING.md` | Code style, testing tiers |
| `ARCHITECTURE.md` | Data flow diagrams (may be outdated) |
| `ONBOARDING.md` | This file - comprehensive onboarding |
| `terms.html` | Terms of Service |
| `privacy.html` | Privacy Policy |

---

## Questions?

1. Check existing documentation first
2. Read console logs for error context
3. Look at similar code in the project
4. Search codebase for related patterns

Welcome to the team!
