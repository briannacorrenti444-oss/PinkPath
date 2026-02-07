// ========================================
// MAP CONTROLLER - Google Maps Version
// Handles map utilities: location markers, route markers
// ========================================

/**
 * Create a Google Maps instance
 * Note: Map styling is controlled via Google Cloud Console when using mapId
 *
 * @param {HTMLElement} container - DOM element to render map into
 * @param {Object} options - Map options
 * @param {number} options.lat - Initial center latitude
 * @param {number} options.lng - Initial center longitude
 * @param {number} options.zoom - Initial zoom level
 * @returns {google.maps.Map} The map instance
 */
export function createMap(container, options = {}) {
    const {
        lat = 37.7749,
        lng = -122.4194,
        zoom = 13
    } = options;

    const map = new google.maps.Map(container, {
        center: { lat, lng },
        zoom,
        mapId: 'pinkpath-map', // Required for AdvancedMarkerElement
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        scaleControl: true,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy'
    });

    return map;
}

/**
 * Show user's current location on map with blue pulsing dot
 *
 * @param {google.maps.Map} map - The Google Maps instance
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} accuracy - GPS accuracy in meters
 * @param {Object} markerState - State callbacks for location marker
 * @param {Function} markerState.getMarker - Returns current location marker
 * @param {Function} markerState.setMarker - Sets location marker
 * @param {Function} markerState.getAccuracyCircle - Returns accuracy circle
 * @param {Function} markerState.setAccuracyCircle - Sets accuracy circle
 */
export function showCurrentLocationOnMap(map, lat, lng, accuracy, markerState) {
    // Remove existing location marker if any
    const existingMarker = markerState.getMarker();
    if (existingMarker) {
        existingMarker.map = null;
    }

    // Remove existing accuracy circle
    const existingCircle = markerState.getAccuracyCircle?.();
    if (existingCircle) {
        existingCircle.setMap(null);
    }

    // Create blue pulsing marker element
    const markerContent = document.createElement('div');
    markerContent.className = 'current-location-marker';
    markerContent.innerHTML = `
        <div class="location-dot"></div>
        <div class="location-pulse"></div>
    `;

    // Create the advanced marker
    const newMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat, lng },
        content: markerContent,
        title: 'You are here'
    });

    // Store marker reference via callback
    markerState.setMarker(newMarker);

    // Optional: Add accuracy circle
    if (accuracy && markerState.setAccuracyCircle) {
        const circle = new google.maps.Circle({
            map,
            center: { lat, lng },
            radius: accuracy,
            strokeColor: '#4285f4',
            strokeOpacity: 0.8,
            strokeWeight: 1,
            fillColor: '#4285f4',
            fillOpacity: 0.1
        });
        markerState.setAccuracyCircle(circle);
    }

    // Center map on location
    map.setCenter({ lat, lng });
    map.setZoom(15);
}

/**
 * Update user location marker position (for navigation)
 *
 * @param {google.maps.marker.AdvancedMarkerElement} marker - The marker to update
 * @param {number} lat - New latitude
 * @param {number} lng - New longitude
 */
export function updateMarkerPosition(marker, lat, lng) {
    if (marker) {
        marker.position = { lat, lng };
    }
}


/**
 * Fit map bounds to show all given points
 *
 * @param {google.maps.Map} map - The map instance
 * @param {Array<{lat: number, lng: number}>} points - Array of coordinates
 * @param {number} padding - Padding in pixels
 */
export function fitBoundsToPoints(map, points, padding = 50) {
    if (!points || points.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    points.forEach(point => {
        bounds.extend(new google.maps.LatLng(point.lat, point.lng));
    });

    map.fitBounds(bounds, padding);
}

/**
 * Create a custom marker with HTML content
 *
 * @param {google.maps.Map} map - The map instance
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} html - HTML content for the marker
 * @param {string} title - Marker title
 * @returns {google.maps.marker.AdvancedMarkerElement}
 */
export function createCustomMarker(map, lat, lng, html, title = '') {
    const content = document.createElement('div');
    content.innerHTML = html;

    return new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat, lng },
        content: content.firstElementChild || content,
        title
    });
}

/**
 * Create start/end location markers
 *
 * @param {google.maps.Map} map - The map instance
 * @param {{lat: number, lng: number}} start - Start coordinates
 * @param {{lat: number, lng: number}} end - End coordinates
 * @returns {{startMarker: AdvancedMarkerElement, endMarker: AdvancedMarkerElement}}
 */
export function createRouteMarkers(map, start, end) {
    // Start marker (green)
    const startContent = document.createElement('div');
    startContent.className = 'route-marker start-marker';
    startContent.innerHTML = `
        <div class="marker-pin" style="background: #48bb78;">
            <span>A</span>
        </div>
    `;

    const startMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: start,
        content: startContent,
        title: 'Start'
    });

    // End marker (pink/red)
    const endContent = document.createElement('div');
    endContent.className = 'route-marker end-marker';
    endContent.innerHTML = `
        <div class="marker-pin" style="background: #ff1493;">
            <span>B</span>
        </div>
    `;

    const endMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: end,
        content: endContent,
        title: 'Destination'
    });

    return { startMarker, endMarker };
}

/**
 * Remove a marker from the map
 *
 * @param {google.maps.marker.AdvancedMarkerElement} marker
 */
export function removeMarker(marker) {
    if (marker) {
        marker.map = null;
    }
}

