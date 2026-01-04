// ========================================
// ROUTE CONTROLLER
// Handles route drawing, sampling, and crime markers
// ========================================

import { calculateDistance } from '../utils.js';

/**
 * Sample points along a route at regular distance intervals
 *
 * @param {Array<{lat: number, lng: number}>} coordinates - Route coordinates from OSRM
 * @param {number} intervalMiles - Distance between sample points (e.g., 0.15 miles)
 * @returns {Array<{lat: number, lng: number}>} Sampled points along the route
 */
export function sampleRoutePoints(coordinates, intervalMiles) {

    const samplePoints = [];

    // Always include start point
    if (coordinates.length > 0) {
        const start = coordinates[0];
        samplePoints.push({ lat: start.lat, lng: start.lng });
    }

    // Sample intermediate points
    let accumulatedDistance = 0;
    let lastSampleDistance = 0;

    for (let i = 1; i < coordinates.length; i++) {
        const prev = coordinates[i - 1];
        const curr = coordinates[i];

        // Calculate distance between consecutive points
        const segmentDistance = calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
        accumulatedDistance += segmentDistance;

        // Add sample point if we've traveled the interval distance
        if (accumulatedDistance - lastSampleDistance >= intervalMiles) {
            samplePoints.push({ lat: curr.lat, lng: curr.lng });
            lastSampleDistance = accumulatedDistance;
        }
    }

    // Always include end point
    if (coordinates.length > 1) {
        const end = coordinates[coordinates.length - 1];
        samplePoints.push({ lat: end.lat, lng: end.lng });
    }

    return samplePoints;
}

/**
 * Gets the color for a route segment based on crime count
 *
 * @param {number} crimeCount - Number of crimes in segment
 * @returns {string} Hex color code
 */
export function getSegmentColor(crimeCount) {

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
 * @param {L.Map} map - The Leaflet map to draw on
 * @param {Array<{lat: number, lng: number}>} routeCoordinates - All points along route
 * @param {Array<{lat: number, lng: number, crimes: Array}>} crimeSamples - Sample points with crime data
 * @param {number} [opacity=0.8] - Line opacity
 * @param {string|null} [dashArray=null] - Dash pattern for alternative routes
 * @returns {L.LayerGroup|null} The layer group or null
 */
export function drawOmbreRoute(map, routeCoordinates, crimeSamples, opacity = 0.8, dashArray = null) {

    if (!map || !routeCoordinates || routeCoordinates.length === 0) {
        console.log('ℹ️ Cannot draw ombre route: missing data');
        return null;
    }

    const routeType = dashArray ? 'alternative' : 'main';
    console.log(`🎨 Drawing ${routeType} ombre route with ${crimeSamples.length} crime samples...`);
    console.log(`   Parameters: opacity=${opacity}, dashArray=${dashArray}`);

    const ombreLayerGroup = L.layerGroup();

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
                segmentCoords.push([coord.lat, coord.lng]);
                if (!startFound) startFound = true;
            }

            // Stop when we reach the next sample
            if (distToNext < 0.01) {
                segmentCoords.push([coord.lat, coord.lng]);
                break;
            }
        }

        // If we didn't find route coords, just draw a line between samples
        if (segmentCoords.length < 2) {
            segmentCoords.push([currentSample.lat, currentSample.lng]);
            segmentCoords.push([nextSample.lat, nextSample.lng]);
        }

        // Create polyline for this segment
        const polylineOptions = {
            color: segmentColor,
            weight: 6,
            opacity: opacity,
            lineJoin: 'round',
            lineCap: 'round'
        };

        if (dashArray) {
            polylineOptions.dashArray = dashArray;
        }

        const polyline = L.polyline(segmentCoords, polylineOptions);

        ombreLayerGroup.addLayer(polyline);
    }

    ombreLayerGroup.addTo(map);
    console.log(`✅ Ombre route drawn with ${crimeSamples.length - 1} colored segments`);

    return ombreLayerGroup;
}

/**
 * Draw basic route without crime data (fallback for non-SF routes)
 *
 * @param {L.Map} map - The Leaflet map to draw on
 * @param {Array<{lat: number, lng: number}>} routeCoordinates - Route coordinates
 * @param {number} [opacity=0.8] - Line opacity
 * @param {string|null} [dashArray=null] - Dash pattern
 * @param {string} [color='#4285f4'] - Line color
 * @returns {L.Polyline|null} The polyline or null
 */
export function drawBasicRoute(map, routeCoordinates, opacity = 0.8, dashArray = null, color = '#4285f4') {

    if (!map || !routeCoordinates || routeCoordinates.length === 0) {
        console.log('ℹ️ Cannot draw basic route: missing data');
        return null;
    }

    const routeType = dashArray ? 'alternative' : 'main';
    console.log(`🗺️ Drawing ${routeType} basic route (no crime data available)...`);

    // Convert coordinates to Leaflet format [lat, lng]
    const latLngs = routeCoordinates.map(coord => [coord.lat, coord.lng]);

    const polylineOptions = {
        color: color,
        weight: 6,
        opacity: opacity
    };

    if (dashArray) {
        polylineOptions.dashArray = dashArray;
    }

    const polyline = L.polyline(latLngs, polylineOptions);
    polyline.addTo(map);

    console.log(`✅ Basic route drawn with ${routeCoordinates.length} coordinates`);

    return polyline;
}

/**
 * Add crime markers to a map with clustering
 *
 * @param {L.Map} map - Leaflet map instance
 * @param {Array} crimes - Array of crime objects
 * @param {Object} route - Route object with coordinates array
 * @returns {L.MarkerClusterGroup|null} The cluster group or null
 */
export function addCrimeMarkersToMap(map, crimes, route) {

    if (!map || !crimes || crimes.length === 0) {
        console.log('ℹ️ No recent violent crimes to display');
        return null;
    }

    console.log(`🔴 Adding ${crimes.length} recent crime markers to map...`);

    // Create marker cluster group
    const crimeClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();

            // Determine size-based dimensions
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

            return L.divIcon({
                html: `
                    <div style="
                        width: ${outerSize}px;
                        height: ${outerSize}px;
                        background-color: rgba(255, 20, 147, 0.3);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
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
                                text-align: center;
                            ">${count}</span>
                        </div>
                    </div>
                `,
                className: 'crime-marker-cluster-custom',
                iconSize: L.point(outerSize, outerSize)
            });
        }
    });

    // Get route coordinates for distance calculation
    const routeCoords = route.coordinates || [];

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

        const crimeIcon = L.divIcon({
            className: 'crime-marker',
            html: `<div style="background-color: ${markerColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        const marker = L.marker([lat, lng], { icon: crimeIcon });

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

        const popupContent = `
            <div style="min-width: 150px;">
                <strong style="color: ${markerColor};">${crime.incident_category}</strong><br>
                <span style="font-size: 12px; color: #666;">${dateStr}</span><br>
                <span style="font-size: 11px; color: #999;">${distanceStr}</span>
            </div>
        `;

        marker.bindPopup(popupContent);
        crimeClusterGroup.addLayer(marker);
    });

    map.addLayer(crimeClusterGroup);
    console.log(`✅ Added ${crimes.length} crime markers with clustering`);

    return crimeClusterGroup;
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
