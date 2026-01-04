// ========================================
// MAP CONTROLLER
// Handles map utilities: location markers, style toggle
// ========================================

// No imports needed - Leaflet (L) is available globally

/**
 * Show user's current location on map with blue pulsing dot
 *
 * @param {L.Map} map - The Leaflet map instance
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} accuracy - GPS accuracy in meters
 * @param {Object} markerState - State callbacks for location marker
 * @param {Function} markerState.getMarker - Returns current location marker
 * @param {Function} markerState.setMarker - Sets location marker
 */
export function showCurrentLocationOnMap(map, lat, lng, accuracy, markerState) {

    // Remove existing location marker if any
    const existingMarker = markerState.getMarker();
    if (existingMarker) {
        map.removeLayer(existingMarker);
    }

    // Create blue pulsing marker
    const blueIcon = L.divIcon({
        className: 'current-location-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    // Add marker
    const newMarker = L.marker([lat, lng], { icon: blueIcon })
        .addTo(map)
        .bindPopup('You are here');

    // Store marker reference via callback
    markerState.setMarker(newMarker);

    // Optional: Add accuracy circle
    if (accuracy) {
        L.circle([lat, lng], {
            radius: accuracy,
            color: '#4285f4',
            fillColor: '#4285f4',
            fillOpacity: 0.1,
            weight: 1
        }).addTo(map);
    }

    // Center map on location
    map.setView([lat, lng], 15);
}

/**
 * Add light/dark mode toggle button to map
 *
 * @param {L.Map} map - The Leaflet map instance
 * @param {L.TileLayer|null} lightLayer - Light tile layer (or null to use default)
 * @param {L.TileLayer|null} darkLayer - Dark tile layer (or null to use default)
 * @param {Object} modeState - State callbacks for mode management
 * @param {Function} modeState.getMode - Returns current mode ('light' or 'dark')
 * @param {Function} modeState.setMode - Sets current mode
 * @param {Function} modeState.getDefaultLayers - Returns { light, dark } default layers
 */
export function addMapStyleToggle(map, lightLayer, darkLayer, modeState) {

    // Create custom control
    const MapStyleControl = L.Control.extend({
        options: {
            position: 'topright'
        },

        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'map-style-toggle');

            container.innerHTML = `
                <button class="style-toggle-btn" id="style-toggle-${map._leaflet_id}">
                    <span class="toggle-option active">Light</span>
                    <span class="toggle-divider">|</span>
                    <span class="toggle-option">Dark</span>
                </button>
            `;

            // Prevent map clicks when clicking the button
            L.DomEvent.disableClickPropagation(container);

            // Add click handler
            container.querySelector('.style-toggle-btn').addEventListener('click', function() {
                toggleMapStyle(map, lightLayer, darkLayer, this, modeState);
            });

            return container;
        }
    });

    map.addControl(new MapStyleControl());
}

/**
 * Toggle between light and dark map styles - internal function
 */
function toggleMapStyle(map, lightLayer, darkLayer, button, modeState) {

    // Get layers - use provided or fall back to defaults
    const defaults = modeState.getDefaultLayers();
    const light = lightLayer || defaults.light;
    const dark = darkLayer || defaults.dark;

    const currentMode = modeState.getMode();

    if (currentMode === 'light') {
        // Switch to dark
        if (map.hasLayer(light)) {
            map.removeLayer(light);
        }
        dark.addTo(map);
        modeState.setMode('dark');

        // Update button UI
        const options = button.querySelectorAll('.toggle-option');
        options[0].classList.remove('active');
        options[1].classList.add('active');

        console.log('🌙 Switched to dark mode');
    } else {
        // Switch to light
        if (map.hasLayer(dark)) {
            map.removeLayer(dark);
        }
        light.addTo(map);
        modeState.setMode('light');

        // Update button UI
        const options = button.querySelectorAll('.toggle-option');
        options[1].classList.remove('active');
        options[0].classList.add('active');

        console.log('☀️ Switched to light mode');
    }
}
