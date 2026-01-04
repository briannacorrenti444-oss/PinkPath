# PinkPath - Safety Navigation App

A web app that helps you find the **safest walking route** between two locations, using real crime data to score route safety.

---

## What Does This App Do?

PinkPath is like Google Maps, but focused on **safety**. When you enter a start and destination:

1. **Finds multiple walking routes** using OpenStreetMap
2. **Analyzes crime data** along each route (in San Francisco, uses real SF crime data)
3. **Calculates a safety score** (0-10) for each route
4. **Shows a color-coded route** - green segments are safer, red segments have more crime
5. **Recommends the safest option** automatically
6. **Provides turn-by-turn navigation** with GPS tracking

---

## Quick Start

### To Run Locally

**Important:** This app uses ES6 modules, so you need a local server (not just opening index.html directly).

**Option 1: Python (built into Mac/Linux, easy install on Windows)**
```bash
cd "path/to/App V2"
python -m http.server 8000
```
Then open: `http://localhost:8000`

**Option 2: VS Code Live Server**
1. Install the "Live Server" extension in VS Code
2. Right-click `index.html` → "Open with Live Server"

**Option 3: Node.js**
```bash
cd "path/to/App V2"
npx serve
```

**Why a server?** Opening index.html directly (file://) causes CORS errors with ES6 modules. A local server fixes this and enables GPS features.

### To Use the App

1. Click **"Plan Route"** on the home screen
2. Enter your **starting location** (or click "Use My Location")
3. Enter your **destination**
4. Click **"Find Safest Route"**
5. Review the route options and safety scores
6. Click **"Start Navigation"** to begin turn-by-turn directions

---

## Project Structure

```
App V2/
├── index.html          # The main HTML page (all screens are in here)
├── styles.css          # All the styling (colors, layout, animations)
├── README.md           # This file - you're reading it!
│
└── js/
    ├── script.js       # Main application code (UI, maps, navigation)
    │
    └── modules/
        ├── config.js   # Settings and API configuration
        ├── utils.js    # Helper functions (distance, formatting)
        │
        └── services/
            ├── crimeService.js      # Fetches and processes crime data
            ├── sunsetService.js     # Gets sunrise/sunset times
            ├── safetyService.js     # Calculates safety scores
            └── geocodingService.js  # Converts addresses to coordinates
```

---

## How the Code is Organized

### The Main File: `script.js`

This is the "brain" of the app. It handles:
- **Screen navigation** - switching between Home, Plan Route, Results, Navigation screens
- **Map display** - showing the Leaflet maps with routes and markers
- **User interactions** - button clicks, form inputs, GPS tracking
- **Connecting everything** - calling the service modules and updating the UI

### The Service Modules (in `js/modules/services/`)

These are specialized files that each do ONE job:

| File | What It Does |
|------|--------------|
| `crimeService.js` | Fetches crime data from San Francisco's open data API |
| `sunsetService.js` | Gets sunrise/sunset times to know if it's dark outside |
| `safetyService.js` | Takes crime data and calculates a safety score (0-10) |
| `geocodingService.js` | Converts text addresses into latitude/longitude coordinates |

### The Config and Utils (in `js/modules/`)

| File | What It Does |
|------|--------------|
| `config.js` | Stores settings like API URLs, crime weights, map icons |
| `utils.js` | Helper functions for math (distance) and formatting (miles, minutes) |

---

## Key Concepts for Beginners

### What is "State"?

State = the current data the app is working with. For example:
- `selectedStart` - the location the user picked as their starting point
- `currentRoute` - the route currently displayed on the map
- `isNavigating` - whether turn-by-turn navigation is active (true/false)

State is stored in variables at the top of `script.js`.

### What is a "Service"?

A service is a module that talks to an external API or does complex calculations. We keep these separate from the main code so they're:
- **Easier to test** - you can test crime calculations without needing a map
- **Easier to understand** - each file does one thing
- **Reusable** - the geocoding service could be used in other projects

### What is "Geocoding"?

Converting a text address (like "123 Main St") into coordinates (like `{lat: 37.7749, lng: -122.4194}`). We use the free Nominatim service for this.

### What is an "Ombre Route"?

A route line that changes color along its length - green where it's safe, yellow where it's moderate, red where there's more crime. "Ombre" means gradient/fading between colors.

---

## Technologies Used

| Technology | What It's For |
|------------|---------------|
| **HTML/CSS/JavaScript** | The basics - structure, styling, behavior |
| **Leaflet.js** | Shows interactive maps (open-source Google Maps alternative) |
| **Leaflet Routing Machine** | Calculates walking routes using OSRM |
| **OpenStreetMap** | Free map tiles (the actual map images) |
| **Nominatim** | Free geocoding (address to coordinates) |
| **SF Open Data** | Real crime data for San Francisco |
| **Sunrise-Sunset API** | Knows when it's dark outside |

**No API keys required!** All services used are free and open.

---

## Features

- **Address autocomplete** - Start typing and see suggestions
- **GPS location** - Use your current location as the start point
- **Multiple route options** - Compare 2+ routes side by side
- **Safety scoring** - Each route gets a score from 0-10
- **Crime breakdown** - See what types of crimes are in the area
- **Ombre route coloring** - Visual safety indicator on the map
- **Dark/light mode** - Toggle map appearance
- **Turn-by-turn navigation** - Step-by-step directions
- **Off-route detection** - Automatically recalculates if you stray
- **Nighttime warnings** - Extra alerts when walking after dark

---

## For Developers

### Adding Console Logging

Most functions already have `console.log()` statements. Open your browser's Developer Tools (F12) and look at the Console tab to see what's happening.

### Understanding the Data Flow

1. User enters addresses
2. `geocodingService` converts addresses to coordinates
3. Leaflet Routing Machine calculates possible routes
4. `crimeService` fetches crime data along each route
5. `safetyService` calculates safety scores
6. `script.js` displays everything on the map and UI

### State is Organized in Groups

Look at the top of `script.js` - state variables are grouped into:
1. **MAP STATE** - map instances, layers, markers
2. **LOCATION STATE** - start, destination, GPS position
3. **ROUTE STATE** - current route, all options, steps
4. **NAVIGATION STATE** - is navigating, current step, etc.
5. **UI STATE** - dark mode, timers

---

## Troubleshooting

### "Route not found"
- Make sure both addresses are valid
- Try more specific addresses (include city name)
- Check that you have internet connection

### Map not loading
- Refresh the page
- Check browser console for errors (F12 → Console)
- Make sure JavaScript is enabled

### GPS not working
- Allow location permissions when prompted
- Make sure you're on HTTPS or localhost
- Try on a mobile device for better GPS

---

## Credits

Built with love for safer communities.

- Maps: [OpenStreetMap](https://www.openstreetmap.org/)
- Routing: [OSRM](http://project-osrm.org/)
- Crime Data: [SF Open Data](https://datasf.org/)
- Map Library: [Leaflet](https://leafletjs.com/)
