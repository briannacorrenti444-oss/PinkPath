# PinkPath Architecture Guide

This document explains how the PinkPath codebase is organized and how data flows through the app. It's written for beginners who are new to the project.

---

## Table of Contents

1. [The Big Picture](#the-big-picture)
2. [File Structure](#file-structure)
3. [The Three Layers](#the-three-layers)
4. [Data Flow](#data-flow)
5. [State Management](#state-management)
6. [Key Functions](#key-functions)
7. [External APIs](#external-apis)

---

## The Big Picture

PinkPath is a **single-page web application** (SPA). This means:
- There's only ONE HTML file (`index.html`)
- All "screens" are `<section>` elements that get shown/hidden with JavaScript
- No page reloads when navigating between screens

The app follows a **modular architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                        index.html                           │
│                    (All screens/UI)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        script.js                            │
│              (Main app logic, UI, maps, state)              │
└─────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │  config.js   │   │   utils.js   │   │  services/   │
    │  (settings)  │   │  (helpers)   │   │  (API calls) │
    └──────────────┘   └──────────────┘   └──────────────┘
```

---

## File Structure

```
App V2/
│
├── index.html              # The single HTML page
├── styles.css              # All CSS styling
├── README.md               # Project overview
├── ARCHITECTURE.md         # This file
│
└── js/
    ├── script.js           # Main application (2000+ lines)
    │
    └── modules/
        ├── config.js       # Configuration constants
        ├── utils.js        # Helper functions
        │
        └── services/       # API service modules
            ├── crimeService.js      # SF crime data API
            ├── sunsetService.js     # Sunrise/sunset API
            ├── safetyService.js     # Safety score calculation
            └── geocodingService.js  # Address → coordinates
```

### What Each File Does

| File | Purpose | Lines | Complexity |
|------|---------|-------|------------|
| `script.js` | Main app: UI, maps, navigation, state | ~4000 | High |
| `config.js` | API URLs, weights, icons, settings | ~90 | Low |
| `utils.js` | Math helpers, formatting functions | ~130 | Low |
| `crimeService.js` | Fetches/processes SF crime data | ~650 | Medium |
| `sunsetService.js` | Gets sunrise/sunset times | ~155 | Low |
| `safetyService.js` | Calculates route safety scores | ~430 | Medium |
| `geocodingService.js` | Converts addresses to lat/lng | ~280 | Low |

---

## The Three Layers

The code is organized into three layers:

### Layer 1: UI Layer (`script.js`)
**What it does:** Everything the user sees and interacts with.

- Shows/hides screens
- Handles button clicks and form inputs
- Displays maps using Leaflet
- Updates text, colors, and visual elements
- Manages GPS tracking for navigation

**Think of it as:** The "front desk" that talks to users.

### Layer 2: Service Layer (`services/*.js`)
**What it does:** Talks to external APIs and does complex calculations.

- `crimeService.js` → Fetches crime data from SF Open Data
- `sunsetService.js` → Gets sunrise/sunset times
- `safetyService.js` → Calculates safety scores
- `geocodingService.js` → Converts addresses to coordinates

**Think of it as:** The "specialists" that do specific jobs.

### Layer 3: Foundation Layer (`config.js`, `utils.js`)
**What it does:** Provides settings and helper functions.

- `config.js` → API URLs, crime weights, map icons
- `utils.js` → Distance calculation, number formatting

**Think of it as:** The "toolbox" everyone uses.

### How They Connect

```
User clicks "Find Route"
        │
        ▼
┌─────────────────────────────────────────┐
│  script.js (UI Layer)                   │
│  - Gets input values                    │
│  - Shows loading state                  │
│  - Calls services                       │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  geocodingService.js                    │
│  - Converts "Union Square" → {lat, lng} │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  script.js calls Leaflet Routing        │
│  - Gets walking routes from OSRM        │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  safetyService.js                       │
│  - Calls crimeService for crime data    │
│  - Calls sunsetService for time of day  │
│  - Calculates safety score              │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  script.js (UI Layer)                   │
│  - Draws route on map                   │
│  - Shows safety score                   │
│  - Updates UI elements                  │
└─────────────────────────────────────────┘
```

---

## Data Flow

### Flow 1: Finding a Route

```
1. USER: Types "Starbucks" in destination box
                    │
                    ▼
2. geocodingService.searchAddresses("Starbucks")
   → Returns: [{lat: 37.78, lng: -122.41, name: "Starbucks..."}]
                    │
                    ▼
3. USER: Clicks "Find Safest Route"
                    │
                    ▼
4. script.js → Leaflet Routing Machine → OSRM API
   → Returns: 2 walking routes with coordinates
                    │
                    ▼
5. FOR EACH ROUTE:
   └── safetyService.calculateSafetyScore(route)
       ├── crimeService.queryCrimesAlongRoute(route)
       │   → Returns: [{type: "Robbery", lat: 37.77, ...}, ...]
       ├── sunsetService.getSunriseSunset(lat, lng)
       │   → Returns: {sunrise: "6:30 AM", sunset: "7:45 PM"}
       └── Calculate weighted score
           → Returns: {score: 7.5, label: "Good", ...}
                    │
                    ▼
6. script.js updates state:
   - routeOptions = [route1Data, route2Data]
   - selectedRouteIndex = 0 (safest)
   - currentRouteData = {distance, duration, safetyScore, ...}
                    │
                    ▼
7. script.js updates UI:
   - drawOmbreRoute() → colored route on map
   - updateSafetyDisplay() → safety score badge
   - updateRouteComparisonUI() → route cards
```

### Flow 2: Switching Routes

```
1. USER: Clicks "Route 2" card
                    │
                    ▼
2. selectRoute(1)
   ├── selectedRouteIndex = 1
   ├── Redraw routes (swap solid/dashed)
   ├── Update currentRoute, currentRouteData
   ├── Update crime markers
   └── Update all UI displays
```

### Flow 3: Starting Navigation

```
1. USER: Clicks "Start Navigation"
                    │
                    ▼
2. checkIfAtStartPoint()
   → Are they within 0.25 miles of start?
   → Sets isPreviewMode (true = far away, false = at start)
                    │
                    ▼
3. startNavigation()
   ├── isNavigating = true
   ├── Go to navigation screen
   └── displayRouteOnNavigationMap()
                    │
                    ▼
4. IF not in preview mode:
   └── startGPSTracking()
       └── navigator.geolocation.watchPosition()
           → Continuously updates currentUserPosition
           → Calls updateNavigationPosition() on each update
                    │
                    ▼
5. updateNavigationPosition()
   ├── Update marker position on map
   ├── Check if user reached next step
   ├── Check if user is off-route
   └── Update distance to destination
```

---

## State Management

### What is "State"?

State = the current data the app is working with.

All state is stored as variables at the top of `script.js`, organized into groups:

### State Groups

```javascript
// 1. MAP STATE - Leaflet map objects
let routeMap = null;              // Map on route results screen
let navigationMap = null;         // Map on navigation screen
let ombreRouteLayer = null;       // The colored route line
let crimeMarkerClusterGroup = null; // Crime markers

// 2. LOCATION STATE - Where the user wants to go
let selectedStart = null;         // {lat, lng, name}
let selectedDestination = null;   // {lat, lng, name}
let currentUserLocation = null;   // From "Use My Location"
let currentUserPosition = null;   // Live GPS during navigation

// 3. ROUTE STATE - The calculated routes
let currentRoute = null;          // The selected route object
let routeOptions = [];            // All route options [route1, route2]
let selectedRouteIndex = 0;       // Which route is selected (0 or 1)
let currentRouteData = {          // Details about selected route
    distance: null,
    duration: null,
    safetyScore: null,
    // ... more fields
};

// 4. NAVIGATION STATE - Turn-by-turn status
let isNavigating = false;         // Is navigation active?
let isPreviewMode = false;        // Preview vs live GPS mode
let currentStepIndex = 0;         // Current instruction step
let routeSteps = [];              // Turn-by-turn instructions

// 5. UI STATE - Visual preferences
let currentMode = 'light';        // Light or dark map mode
```

### State Flow Diagram

```
User Action                     State Changes                 UI Updates
───────────────────────────────────────────────────────────────────────────
Select address          →  selectedStart/Destination   →  Input field filled
Click "Find Route"      →  routeOptions, currentRoute  →  Map shows routes
                           currentRouteData               Safety score shown
Click "Route 2"         →  selectedRouteIndex          →  Route 2 highlighted
                           currentRoute, currentRouteData  Map redraws routes
Click "Start Nav"       →  isNavigating = true         →  Navigation screen
GPS update              →  currentUserPosition         →  Marker moves on map
```

---

## Key Functions

### The Most Important Functions

| Function | What It Does | Called When |
|----------|--------------|-------------|
| `calculateAndDisplayRoute()` | Calculates routes, gets safety scores, draws on map | User clicks "Find Route" |
| `selectRoute()` | Switches between route options | User clicks a route card |
| `drawOmbreRoute()` | Draws color-coded route line | After route calculation |
| `startNavigation()` | Begins turn-by-turn navigation | User clicks "Start Navigation" |
| `updateNavigationPosition()` | Handles GPS updates | Every GPS position change |

### Function Call Hierarchy

```
User clicks "Find Safest Route"
    │
    └── findRoute()
            │
            └── calculateAndDisplayRoute()
                    │
                    ├── Leaflet Routing Machine (external)
                    │
                    └── [on routes found]
                            │
                            ├── calculateSafetyScore() ← safetyService
                            │       │
                            │       ├── queryCrimesAlongRoute() ← crimeService
                            │       └── getSunriseSunset() ← sunsetService
                            │
                            ├── drawOmbreRoute()
                            │       │
                            │       └── getSegmentColor()
                            │
                            ├── addCrimeMarkersToMap()
                            │
                            ├── updateRouteDisplay()
                            ├── updateSafetyDisplay()
                            └── updateRouteComparisonUI()
```

---

## External APIs

PinkPath uses these free, open APIs:

| API | What It Does | Module |
|-----|--------------|--------|
| **OSRM** | Calculates walking routes | Leaflet Routing Machine |
| **OpenStreetMap** | Provides map tiles (images) | Leaflet |
| **Nominatim** | Converts addresses to coordinates | geocodingService.js |
| **SF Open Data** | Provides San Francisco crime data | crimeService.js |
| **Sunrise-Sunset API** | Gets sunrise/sunset times | sunsetService.js |

### API Flow Example

```
geocodingService.geocodeAddress("Starbucks, SF")
        │
        ▼
HTTPS Request to: https://nominatim.openstreetmap.org/search?q=Starbucks...
        │
        ▼
Response: [{lat: "37.7749", lon: "-122.4194", display_name: "Starbucks..."}]
        │
        ▼
Return: {lat: 37.7749, lng: -122.4194, name: "Starbucks..."}
```

---

## Quick Reference

### Where to Find Things

| I want to... | Look in... |
|--------------|------------|
| Change API settings | `config.js` |
| Change crime severity weights | `config.js` → `CRIME_WEIGHTS` |
| Change safety score calculation | `safetyService.js` |
| Change route appearance | `drawOmbreRoute()` in `script.js` |
| Change navigation behavior | Navigation functions in `script.js` |
| Add a new screen | `index.html` + `goToScreen()` in `script.js` |

### Common Patterns

**Calling a service:**
```javascript
import { functionName } from './modules/services/serviceName.js';
const result = await functionName(params);
```

**Updating state:**
```javascript
selectedRouteIndex = newValue;
// Then update UI:
updateRouteComparisonUI();
```

**Drawing on map:**
```javascript
const layer = L.polyline(coordinates, options);
layer.addTo(map);
// Save reference to remove later:
myLayerVariable = layer;
```

---

## Next Steps for New Developers

1. **Read README.md** - Get the big picture
2. **Read this file** - Understand the architecture
3. **Open script.js** - Read the STATE section at the top
4. **Try the app** - Open index.html in a browser
5. **Add console.logs** - See how data flows
6. **Make a small change** - Modify a color or text
7. **Break something** - Then fix it (best way to learn!)
