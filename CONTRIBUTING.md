# Contributing to PinkPath

Thank you for your interest in contributing to PinkPath! This guide will help you get started.

---

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- A text editor (VS Code recommended)
- Basic knowledge of HTML, CSS, and JavaScript

### Setting Up

1. Clone or download the repository
2. Start a local server (required for ES6 modules):

   **Option A: Python**
   ```bash
   cd "path/to/App V2"
   python -m http.server 8000
   ```
   Then open: `http://localhost:8000`

   **Option B: VS Code Live Server**
   - Install "Live Server" extension
   - Right-click `index.html` → "Open with Live Server"

   **Option C: Node.js**
   ```bash
   npx serve
   ```

**Why a local server?** The app uses ES6 modules (`import`/`export`). Opening `index.html` directly causes CORS errors. A local server also enables GPS features.

---

## Project Structure

```
App V2/
├── index.html              # Single HTML page (all screens)
├── styles.css              # All styling
├── README.md               # Project overview
├── ARCHITECTURE.md         # Technical architecture
├── CONTRIBUTING.md         # This file
│
└── js/
    ├── script.js           # Main application code
    │
    └── modules/
        ├── config.js       # Configuration constants
        ├── utils.js        # Helper functions
        │
        └── services/       # API service modules
            ├── crimeService.js
            ├── sunsetService.js
            ├── safetyService.js
            └── geocodingService.js
```

---

## Code Style Guidelines

### JavaScript

1. **Use ES6 modules** for new code
   ```javascript
   // Good
   import { functionName } from './module.js';
   export function myFunction() { }

   // Avoid
   var globalFunction = function() { };
   ```

2. **Add JSDoc comments** to all functions
   ```javascript
   /**
    * Brief description of what the function does
    *
    * WHAT IT DOES:
    * More detailed explanation for beginners
    *
    * @param {string} paramName - Description of parameter
    * @returns {boolean} Description of return value
    */
   function myFunction(paramName) { }
   ```

3. **Use descriptive variable names**
   ```javascript
   // Good
   const selectedRouteIndex = 0;
   const crimeMarkerClusterGroup = L.markerClusterGroup();

   // Avoid
   const idx = 0;
   const cmcg = L.markerClusterGroup();
   ```

4. **Add console.log for debugging** (with emoji prefixes)
   ```javascript
   console.log('🗺️ Initializing map...');
   console.log('✅ Route calculated successfully');
   console.log('❌ Error:', error);
   console.log('⚠️ Warning: No crime data available');
   ```

### CSS

1. Use the existing color variables in `styles.css`
2. Mobile-first approach (base styles for mobile, `@media` for desktop)
3. Use meaningful class names (`.route-card`, `.safety-badge`)

### HTML

1. All screens are `<section class="screen">` elements in `index.html`
2. Use semantic elements (`<header>`, `<nav>`, `<main>`, `<footer>`)
3. Include `aria-` attributes for accessibility

---

## Making Changes

### Before You Start

1. Read `ARCHITECTURE.md` to understand how the app works
2. Check existing code for similar patterns
3. Test in multiple browsers

### Adding a New Feature

1. **Plan first**: Identify which files need changes
2. **Follow existing patterns**: Look at similar features
3. **Update state properly**: Modify state variables, then update UI
4. **Add documentation**: JSDoc for functions, comments for complex logic

### Modifying Existing Code

1. **Read the function's JSDoc** to understand what it does
2. **Check "CALLED BY"** to see what depends on it
3. **Test the original behavior** before making changes
4. **Test after changes** to ensure nothing broke

---

## Testing

### Tier 1: Smoke Test

*Run after ANY change. 30 seconds.*

- [ ] App loads without console errors
- [ ] Can type in address fields (autocomplete appears)
- [ ] Route calculates and displays on map
- [ ] Safety score shows
- [ ] Can start navigation
- [ ] Can exit navigation back to results

If any fail: Check console, then run relevant Tier 2 tests.

---

### Tier 2: Feature-Specific Tests

*Run only the section relevant to your change.*

**Changed: Address/Autocomplete**

- [ ] Autocomplete dropdown appears after 3+ characters
- [ ] Clicking result fills input
- [ ] "Use My Location" works (on localhost)
- [ ] Can search both start and destination
- [ ] Invalid/empty address shows error

**Changed: Route Calculation**

- [ ] Route line displays on map
- [ ] Start/end markers visible
- [ ] Multiple routes appear (if available)
- [ ] Route switching updates map and scores
- [ ] Routes outside SF still calculate (without crime data)

**Changed: Safety Score**

- [ ] Score displays (0-10 scale)
- [ ] Color matches score (green/yellow/red)
- [ ] All 5 breakdown bars visible
- [ ] Score updates when switching routes
- [ ] SF routes show crime data, non-SF show "Area Type"

**Changed: Ombre Route / Crime Markers**

- [ ] Route shows color gradient (not solid)
- [ ] Green = safe, red = dangerous
- [ ] Crime markers appear (SF routes only)
- [ ] Marker clusters work when zoomed out
- [ ] Marker popups show crime info

**Changed: Navigation**

- [ ] Navigation screen loads with map
- [ ] Instructions display
- [ ] Preview mode: Next/Previous buttons work
- [ ] Exit navigation returns to results
- [ ] State resets properly after exit

**Changed: UI/Styling**

- [ ] All screens display correctly
- [ ] Buttons are clickable
- [ ] Light/dark toggle works
- [ ] Mobile layout works (narrow browser window)
- [ ] No visual glitches or overflow

---

### Tier 3: Full Regression

*Run before releases or after major refactors.*

**Initialization**

- [ ] App loads without errors
- [ ] Home screen displays
- [ ] All navigation links work

**Address Input**

- [ ] Start field autocomplete works
- [ ] Destination field autocomplete works
- [ ] "Use My Location" works
- [ ] Results show icons and addresses
- [ ] Dropdown closes after selection

**Route Calculation**

- [ ] Loading state appears
- [ ] Route(s) display on map
- [ ] Markers at start/end
- [ ] Route comparison cards appear
- [ ] Correct distance/duration shown

**Safety Features**

- [ ] Safety score displays with color
- [ ] Safety label correct (Excellent/Good/Fair/Caution)
- [ ] 5 breakdown bars display
- [ ] Crime markers appear (SF routes)
- [ ] Ombre coloring shows gradient

**Route Selection**

- [ ] Can click to select different route
- [ ] Selected route becomes solid line
- [ ] Alternative becomes dashed
- [ ] All UI updates (score, distance, time)
- [ ] Crime markers update

**Navigation - Preview Mode**

- [ ] Navigation screen loads
- [ ] "ROUTE PREVIEW" banner shows
- [ ] Step counter displays
- [ ] Next/Previous buttons work
- [ ] Instructions update

**Navigation - Live Mode**

- [ ] GPS permission requested
- [ ] Position marker appears
- [ ] Map follows position
- [ ] Instructions advance automatically
- [ ] Off-route triggers recalculation

**Navigation - Exit**

- [ ] Exit button works
- [ ] Returns to route results
- [ ] GPS tracking stops
- [ ] State resets cleanly

**UI/Responsiveness**

- [ ] Light/dark mode toggle works
- [ ] Mobile menu works
- [ ] All screens responsive
- [ ] No console errors throughout

**Browser Testing**

- [ ] Chrome
- [ ] Firefox
- [ ] Safari (if available)
- [ ] Mobile browser

---

## Common Tasks

### Adding a New Screen

1. Add `<section id="screen-my-screen" class="screen">` to `index.html`
2. Use `goToScreen('screen-my-screen')` to navigate to it
3. Add any screen-specific initialization in `goToScreen()`

### Adding a New Service

1. Create `js/modules/services/myService.js`
2. Export pure functions (no DOM manipulation)
3. Import in `script.js`
4. Add configuration to `config.js` if needed

### Modifying Safety Score Calculation

1. Edit `js/modules/services/safetyService.js`
2. Adjust weights in `config.js` → `CRIME_WEIGHTS`
3. Update `updateSafetyDisplay()` if breakdown changes

---

## Debugging Tips

### Console Logging

The app uses emoji-prefixed logging. Open browser DevTools (F12) → Console:
- Look for the flow of emojis to trace execution
- Filter by typing function names

### Common Issues

| Problem | Solution |
|---------|----------|
| Map not showing | Check if container has height in CSS |
| Route not calculating | Check browser console for API errors |
| GPS not working | Ensure HTTPS or localhost |
| State not updating | Check if UI update function is called |

---

## Questions?

- Read the existing documentation first
- Check browser console for error messages
- Look at similar code in the project

---

## Code of Conduct

- Be respectful and constructive
- Write beginner-friendly code and comments
- Test your changes before submitting
- Document new features

Thank you for contributing to safer communities!
