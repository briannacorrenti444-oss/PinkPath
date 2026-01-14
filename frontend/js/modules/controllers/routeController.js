// ========================================
// ROUTE CONTROLLER - Google Maps Version
// Handles route drawing and crime markers
// ========================================

import { calculateDistance } from '../utils.js';

/**
 * Gets the color for a route segment based on crime count
 * Internal helper function for ombre route drawing
 *
 * @param {number} crimeCount - Number of crimes in segment
 * @returns {string} Hex color code
 */
function getSegmentColor(crimeCount) {
    // Absolute scale: crimes per 0.15 mile segment
    if (crimeCount === 0) return '#48bb78'; // Green - no crimes
    if (crimeCount <= 2) return '#68d391'; // Light green - very few crimes
    if (crimeCount <= 5) return '#ed8936'; // Orange - moderate crimes
    if (crimeCount <= 10) return '#f56565'; // Light red - many crimes
    return '#dc143c'; // Dark red - very high crime
}

/**
 * Draws a color-coded "ombre" route on the map
 *
 * @param {google.maps.Map} map - The Google Maps instance
 * @param {Array<{lat: number, lng: number}>} routeCoordinates - All points along route
 * @param {Array<{lat: number, lng: number, crimes: Array}>} crimeSamples - Sample points with crime data
 * @param {number} [opacity=0.8] - Line opacity
 * @param {boolean} [isDashed=false] - Whether to use dashed line for alternative routes
 * @returns {Array<google.maps.Polyline>|null} Array of polylines or null
 */
export function drawOmbreRoute(map, routeCoordinates, crimeSamples, opacity = 0.8, isDashed = false) {
    if (!map || !routeCoordinates || routeCoordinates.length === 0) {
        console.log('ℹ️ Cannot draw ombre route: missing data');
        return null;
    }

    const routeType = isDashed ? 'alternative' : 'main';
    console.log(`🎨 Drawing ${routeType} ombre route with ${crimeSamples.length} crime samples...`);

    const polylines = [];

    // Create segments between sample points
    for (let i = 0; i < crimeSamples.length - 1; i++) {
        const currentSample = crimeSamples[i];
        const nextSample = crimeSamples[i + 1];

        // Get crime count for this segment
        const crimeCount = currentSample.crimes ? currentSample.crimes.length : 0;
        const segmentColor = getSegmentColor(crimeCount);

        // Find route coordinates between these two sample points
        const segmentCoords = [];
        let startFound = false;

        for (let j = 0; j < routeCoordinates.length; j++) {
            const coord = routeCoordinates[j];
            const distToCurrent = calculateDistance(
                coord.lat, coord.lng,
                currentSample.lat, currentSample.lng
            );
            const distToNext = calculateDistance(
                coord.lat, coord.lng,
                nextSample.lat, nextSample.lng
            );

            // Include points close to current sample or between current and next
            if (distToCurrent < 0.01 || (startFound && distToNext > 0.01)) {
                segmentCoords.push({ lat: coord.lat, lng: coord.lng });
                if (!startFound) startFound = true;
            }

            // Stop when we reach the next sample
            if (distToNext < 0.01) {
                segmentCoords.push({ lat: coord.lat, lng: coord.lng });
                break;
            }
        }

        // If we didn't find route coords, just draw a line between samples
        if (segmentCoords.length < 2) {
            segmentCoords.push({ lat: currentSample.lat, lng: currentSample.lng });
            segmentCoords.push({ lat: nextSample.lat, lng: nextSample.lng });
        }

        // Create polyline for this segment
        const polylineOptions = {
            path: segmentCoords,
            strokeColor: segmentColor,
            strokeWeight: 6,
            strokeOpacity: opacity,
            map: map
        };

        // Add dashed pattern for alternative routes
        if (isDashed) {
            polylineOptions.strokeOpacity = 0;
            polylineOptions.icons = [{
                icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: opacity,
                    strokeColor: segmentColor,
                    scale: 3
                },
                offset: '0',
                repeat: '15px'
            }];
        }

        const polyline = new google.maps.Polyline(polylineOptions);
        polylines.push(polyline);
    }

    console.log(`✅ Ombre route drawn with ${crimeSamples.length - 1} colored segments`);
    return polylines;
}

/**
 * Draw basic route without crime data (fallback for non-SF routes)
 *
 * @param {google.maps.Map} map - The Google Maps instance
 * @param {Array<{lat: number, lng: number}>} routeCoordinates - Route coordinates
 * @param {number} [opacity=0.8] - Line opacity
 * @param {boolean} [isDashed=false] - Whether to use dashed line
 * @param {string} [color='#4285f4'] - Line color
 * @returns {google.maps.Polyline|null} The polyline or null
 */
export function drawBasicRoute(map, routeCoordinates, opacity = 0.8, isDashed = false, color = '#4285f4') {
    if (!map || !routeCoordinates || routeCoordinates.length === 0) {
        console.log('ℹ️ Cannot draw basic route: missing data');
        return null;
    }

    const routeType = isDashed ? 'alternative' : 'main';
    console.log(`🗺️ Drawing ${routeType} basic route (no crime data available)...`);

    const polylineOptions = {
        path: routeCoordinates,
        strokeColor: color,
        strokeWeight: 6,
        strokeOpacity: opacity,
        map: map
    };

    // Add dashed pattern for alternative routes
    if (isDashed) {
        polylineOptions.strokeOpacity = 0;
        polylineOptions.icons = [{
            icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: opacity,
                strokeColor: color,
                scale: 3
            },
            offset: '0',
            repeat: '15px'
        }];
    }

    const polyline = new google.maps.Polyline(polylineOptions);
    console.log(`✅ Basic route drawn with ${routeCoordinates.length} coordinates`);

    return polyline;
}

/**
 * Remove polylines from the map
 *
 * @param {Array<google.maps.Polyline>|google.maps.Polyline} polylines
 */
export function removePolylines(polylines) {
    if (!polylines) return;

    if (Array.isArray(polylines)) {
        polylines.forEach(p => p.setMap(null));
    } else {
        polylines.setMap(null);
    }
}

/**
 * Add crime markers to a map with clustering
 *
 * @param {google.maps.Map} map - Google Maps instance
 * @param {Array} crimes - Array of crime objects
 * @param {Object} route - Route object with coordinates array
 * @returns {{markers: Array, clusterer: MarkerClusterer}|null} Markers and clusterer or null
 */
export function addCrimeMarkersToMap(map, crimes, route) {
    if (!map || !crimes || crimes.length === 0) {
        console.log('ℹ️ No recent violent crimes to display');
        return null;
    }

    console.log(`🔴 Adding ${crimes.length} recent crime markers to map...`);

    // Get route coordinates for distance calculation
    const routeCoords = route.coordinates || [];
    const markers = [];
    const infoWindow = new google.maps.InfoWindow();

    crimes.forEach(crime => {
        const lat = parseFloat(crime.latitude);
        const lng = parseFloat(crime.longitude);

        if (!lat || !lng) return;

        // Calculate distance from route (find closest point)
        let minDistance = Infinity;
        routeCoords.forEach(coord => {
            const dist = calculateDistance(lat, lng, coord.lat, coord.lng);
            if (dist < minDistance) minDistance = dist;
        });

        // Create crime marker
        const isViolent = crime.isViolent;
        const markerColor = isViolent ? '#dc143c' : '#ed8936'; // Red for violent, orange for theft

        // Create marker content
        const markerContent = document.createElement('div');
        markerContent.className = 'crime-marker';
        markerContent.style.cssText = `
            background-color: ${markerColor};
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            cursor: pointer;
        `;

        const marker = new google.maps.marker.AdvancedMarkerElement({
            map: null, // Will be set by clusterer
            position: { lat, lng },
            content: markerContent,
            title: crime.incident_category
        });

        // Create popup content
        const crimeDate = new Date(crime.incident_datetime);
        const dateStr = crimeDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        const distanceStr = minDistance < 0.1
            ? `${Math.round(minDistance * 5280)} ft from route`
            : `${minDistance.toFixed(2)} mi from route`;

        // Add click listener for info window
        marker.addListener('click', () => {
            infoWindow.setContent(`
                <div style="min-width: 150px; padding: 8px;">
                    <strong style="color: ${markerColor};">${crime.incident_category}</strong><br>
                    <span style="font-size: 12px; color: #666;">${dateStr}</span><br>
                    <span style="font-size: 11px; color: #999;">${distanceStr}</span>
                </div>
            `);
            infoWindow.open(map, marker);
        });

        markers.push(marker);
    });

    // Create marker clusterer using the globally loaded library
    let clusterer = null;
    if (window.markerClusterer && markers.length > 0) {
        clusterer = new markerClusterer.MarkerClusterer({
            map,
            markers,
            renderer: {
                render: ({ count, position }) => {
                    // Determine size based on count
                    let outerSize, innerSize, fontSize;
                    if (count > 10) {
                        outerSize = 50;
                        innerSize = 44;
                        fontSize = 16;
                    } else if (count > 5) {
                        outerSize = 40;
                        innerSize = 34;
                        fontSize = 14;
                    } else {
                        outerSize = 30;
                        innerSize = 24;
                        fontSize = 12;
                    }

                    const content = document.createElement('div');
                    content.innerHTML = `
                        <div style="
                            width: ${outerSize}px;
                            height: ${outerSize}px;
                            background-color: rgba(255, 20, 147, 0.3);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: pointer;
                        ">
                            <div style="
                                width: ${innerSize}px;
                                height: ${innerSize}px;
                                background-color: #dc143c;
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ">
                                <span style="
                                    color: white;
                                    font-weight: 700;
                                    font-size: ${fontSize}px;
                                ">${count}</span>
                            </div>
                        </div>
                    `;

                    return new google.maps.marker.AdvancedMarkerElement({
                        position,
                        content
                    });
                }
            }
        });
    }

    console.log(`✅ Added ${crimes.length} crime markers with clustering`);
    return { markers, clusterer };
}

/**
 * Remove crime markers from the map
 *
 * @param {{markers: Array, clusterer: MarkerClusterer}} crimeMarkers
 */
export function removeCrimeMarkers(crimeMarkers) {
    if (!crimeMarkers) return;

    if (crimeMarkers.clusterer) {
        crimeMarkers.clusterer.clearMarkers();
    }

    if (crimeMarkers.markers) {
        crimeMarkers.markers.forEach(marker => {
            marker.map = null;
        });
    }
}

/**
 * Calculate the shortest distance from a point to a polyline (route)
 *
 * @param {number} lat - Latitude of the point
 * @param {number} lng - Longitude of the point
 * @param {Array<{lat: number, lng: number}>} polylineCoords - Route coordinates
 * @returns {number} Distance in miles to nearest point on route
 */
export function calculateDistanceToPolyline(lat, lng, polylineCoords) {
    if (!polylineCoords || polylineCoords.length === 0) {
        return Infinity;
    }

    let minDistance = Infinity;

    // Check distance to each segment of the polyline
    for (let i = 0; i < polylineCoords.length - 1; i++) {
        const p1 = polylineCoords[i];
        const p2 = polylineCoords[i + 1];

        const distance = distanceToSegment(
            { lat: lat, lng: lng },
            { lat: p1.lat, lng: p1.lng },
            { lat: p2.lat, lng: p2.lng }
        );

        minDistance = Math.min(minDistance, distance);
    }

    return minDistance;
}

/**
 * Calculate perpendicular distance from a point to a line segment
 *
 * @param {{lat: number, lng: number}} point - The point to measure from
 * @param {{lat: number, lng: number}} segmentStart - Start of line segment
 * @param {{lat: number, lng: number}} segmentEnd - End of line segment
 * @returns {number} Distance in miles to the closest point on the segment
 */
export function distanceToSegment(point, segmentStart, segmentEnd) {
    // Convert to simple x/y coordinates (lng = x, lat = y)
    const px = point.lng;
    const py = point.lat;
    const sx1 = segmentStart.lng;
    const sy1 = segmentStart.lat;
    const sx2 = segmentEnd.lng;
    const sy2 = segmentEnd.lat;

    // Calculate the segment vector (direction and length)
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;

    // Edge case: segment has zero length (start == end)
    if (dx === 0 && dy === 0) {
        return calculateDistance(py, px, sy1, sx1);
    }

    // Vector projection: t represents how far along the segment the closest point is
    const t = Math.max(0, Math.min(1, ((px - sx1) * dx + (py - sy1) * dy) / (dx * dx + dy * dy)));

    // Calculate the actual closest point coordinates
    const closestX = sx1 + t * dx;
    const closestY = sy1 + t * dy;

    // Return distance from the original point to the closest point on segment
    return calculateDistance(py, px, closestY, closestX);
}

/**
 * Decode a Google Maps encoded polyline string
 *
 * @param {string} encoded - Encoded polyline string
 * @returns {Array<{lat: number, lng: number}>} Decoded coordinates
 */
export function decodePolyline(encoded) {
    if (!encoded) return [];

    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let shift = 0;
        let result = 0;
        let byte;

        // Decode latitude
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += dlat;

        shift = 0;
        result = 0;

        // Decode longitude
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += dlng;

        points.push({
            lat: lat / 1e5,
            lng: lng / 1e5
        });
    }

    return points;
}
