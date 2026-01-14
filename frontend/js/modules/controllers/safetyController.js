// ========================================
// SAFETY CONTROLLER
// Handles safety score display and crime details modal
// Updated to work with backend's scoreBreakdown format
// ========================================

import {
    filterCrimesLast30Days,
    groupCrimesByType,
    getCrimeSeverity
} from '../services/crimeService.js';

/**
 * Update the safety score display panel
 * Works with backend's data format (scoreBreakdown)
 *
 * @param {Function} getRouteData - Returns current route data object
 */
export function updateSafetyDisplay(getRouteData) {
    const routeData = getRouteData();

    if (!routeData.safetyScore && routeData.safetyScore !== 0) {
        console.log('[safetyController] No safety data available');
        return;
    }

    // Show the safety score display (was hidden initially)
    const safetyScoreDisplay = document.getElementById('safety-score-display');
    if (safetyScoreDisplay) {
        safetyScoreDisplay.style.display = 'flex';
    }

    // Update score number (backend returns 0-100, display as-is or /10)
    const scoreNumber = document.querySelector('.score-number');
    if (scoreNumber) {
        // Display score out of 100
        const displayScore = routeData.safetyScore;
        scoreNumber.textContent = Math.round(displayScore);
        scoreNumber.className = `score-number score-${routeData.safetyColor || getSafetyColor(displayScore)}`;
    }

    // Update label
    const scoreSubLabel = document.querySelector('.score-sublabel');
    if (scoreSubLabel) {
        scoreSubLabel.textContent = routeData.safetyLabel || getSafetyLabel(routeData.safetyScore);
    }

    // Update breakdown - use backend's scoreBreakdown format
    const breakdown = routeData.scoreBreakdown;
    if (breakdown && Object.keys(breakdown).length > 0) {
        // Backend provides: crime, lighting, footTraffic, timeOfDay
        updateBreakdownItem('breakdown-crime', 'Historical Crime', breakdown.crime ?? 50);
        updateBreakdownItem('breakdown-lighting', 'Street Lighting', breakdown.lighting ?? 50);
        updateBreakdownItem('breakdown-traffic', 'Foot Traffic', breakdown.footTraffic ?? 50);
        updateBreakdownItem('breakdown-time', 'Time of Day', breakdown.timeOfDay ?? 50);
    } else {
        console.log('[safetyController] No breakdown data available, using defaults');
        updateBreakdownItem('breakdown-crime', 'Historical Crime', 50);
        updateBreakdownItem('breakdown-lighting', 'Street Lighting', 50);
        updateBreakdownItem('breakdown-traffic', 'Foot Traffic', 50);
        updateBreakdownItem('breakdown-time', 'Time of Day', 50);
    }

    // Update disclaimer
    const disclaimer = document.getElementById('safety-disclaimer');
    if (disclaimer) {
        disclaimer.textContent = 'Safety score calculated using SF crime data, street lighting, foot traffic, and time of day.';
    }

    // Show crime details button if we have crime data
    const crimeDetailsBtn = document.getElementById('crime-details-btn-container');
    if (crimeDetailsBtn) {
        crimeDetailsBtn.style.display = routeData.crimes && routeData.crimes.length > 0 ? 'block' : 'none';
    }

    // Show/hide nighttime warning banner
    const warningBanner = document.getElementById('nighttime-warning-banner');
    if (warningBanner) {
        const isNighttime = breakdown && breakdown.timeOfDay < 50;
        if (isNighttime) {
            warningBanner.style.display = 'flex';
            console.log('[safetyController] Nighttime warning displayed');
        } else {
            warningBanner.style.display = 'none';
        }
    }

    // Update detailed metrics if available
    const detailedMetrics = routeData.detailedMetrics;
    if (detailedMetrics) {
        updateDetailedMetrics(detailedMetrics);
    }

    console.log('[safetyController] Safety display updated');
}

/**
 * Update the detailed metrics expansion section
 * @param {Object} metrics - Detailed metrics from backend
 */
function updateDetailedMetrics(metrics) {
    if (!metrics) return;

    // Crime details
    if (metrics.crime) {
        const crime = metrics.crime;
        setElementText('crime-total-incidents', crime.totalIncidents);
        setElementText('crime-violent-count', crime.violentCount);
        setElementText('crime-property-count', crime.propertyCount);
        setElementText('crime-assessment', crime.assessment);
    }

    // Foot traffic details
    if (metrics.footTraffic) {
        const traffic = metrics.footTraffic;
        setElementText('traffic-transit-stops', traffic.transitStopsNearby);
        setElementText('traffic-places-nearby', traffic.placesNearby);
        setElementText('traffic-current-period', traffic.peakHours?.currentPeriod || 'Unknown');
        setElementText('traffic-assessment', traffic.assessment);

        const peakNote = document.getElementById('traffic-peak-note');
        if (peakNote && traffic.peakHours) {
            peakNote.textContent = `Peak hours: ${traffic.peakHours.peakHours}`;
        }
    }

    // Lighting details
    if (metrics.lighting) {
        const lighting = metrics.lighting;
        setElementText('lighting-conditions', lighting.isDaytime ? 'Daytime' : 'Nighttime');
        setElementText('lighting-open-complaints', lighting.openComplaints);
        setElementText('lighting-assessment', lighting.assessment);
    }

    // Time of day details
    if (metrics.timeOfDay) {
        const time = metrics.timeOfDay;
        setElementText('time-current', time.currentTime);
        setElementText('time-sunrise', formatTime(time.sunrise));
        setElementText('time-sunset', formatTime(time.sunset));
        setElementText('time-period', capitalizeFirst(time.timePeriod));
        setElementText('time-assessment', time.assessment);
    }

    console.log('[safetyController] Detailed metrics updated');
}

/**
 * Helper to set element text content safely
 */
function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text ?? '--';
    }
}

/**
 * Format ISO time string to readable time
 */
function formatTime(isoString) {
    if (!isoString) return '--';
    try {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '--';
    }
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str) {
    if (!str) return '--';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Initialize the Show More button toggle
 * Call this after DOM is ready
 */
export function initShowMoreToggle() {
    const showMoreBtn = document.getElementById('show-more-metrics-btn');
    const expansion = document.getElementById('detailed-metrics-expansion');
    const showMoreText = showMoreBtn?.querySelector('.show-more-text');

    if (showMoreBtn && expansion) {
        showMoreBtn.addEventListener('click', () => {
            const isExpanded = expansion.style.display !== 'none';

            if (isExpanded) {
                expansion.style.display = 'none';
                showMoreBtn.classList.remove('expanded');
                if (showMoreText) showMoreText.textContent = 'Show Details';
            } else {
                expansion.style.display = 'block';
                showMoreBtn.classList.add('expanded');
                if (showMoreText) showMoreText.textContent = 'Hide Details';
            }
        });

        console.log('[safetyController] Show More toggle initialized');
    }
}

/**
 * Get safety label from score (0-100)
 */
export function getSafetyLabel(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Caution';
}

/**
 * Get safety color class from score (0-100)
 */
export function getSafetyColor(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'caution';
}

/**
 * Toggle crime details expanded section
 */
export function toggleCrimeDetails() {
    const expandedSection = document.getElementById('crime-details-expanded');
    const button = document.getElementById('more-info-btn');

    if (!expandedSection || !button) return;

    if (expandedSection.style.display === 'none') {
        expandedSection.style.display = 'block';
        button.textContent = 'Less Info';
    } else {
        expandedSection.style.display = 'none';
        button.textContent = 'More Info';
    }
}

/**
 * Open crime details modal with populated data
 *
 * @param {Function} getRouteData - Returns current route data object
 * @param {Function} openModalFn - Function to open modal by ID
 */
export function openCrimeDetailsModal(getRouteData, openModalFn) {
    const routeData = getRouteData();
    const rawCrimes = routeData.crimes || routeData.rawCrimeData || [];

    if (!rawCrimes || rawCrimes.length === 0) {
        alert('No crime data available for this route');
        return;
    }

    // Filter to last 30 days for display
    const last30DaysCrimes = filterCrimesLast30Days(rawCrimes);

    // Group crimes by type
    const crimesByType = groupCrimesByType(last30DaysCrimes);

    // Categorize by severity
    const highSeverityCrimes = {};
    const mediumSeverityCrimes = {};
    const lowSeverityCrimes = {};

    let highCount = 0, mediumCount = 0, lowCount = 0;

    Object.entries(crimesByType).forEach(([category, count]) => {
        const severity = getCrimeSeverity(category);

        if (severity === 'high') {
            highSeverityCrimes[category] = count;
            highCount += count;
        } else if (severity === 'medium') {
            mediumSeverityCrimes[category] = count;
            mediumCount += count;
        } else {
            lowSeverityCrimes[category] = count;
            lowCount += count;
        }
    });

    // Update comparison text
    const comparisonText = document.getElementById('crime-comparison-text');
    if (comparisonText) {
        comparisonText.textContent = `${rawCrimes.length} incidents found along route (last 90 days)`;
    }

    // Update severity counts (30-day filtered data)
    const highEl = document.getElementById('high-severity-count');
    const medEl = document.getElementById('medium-severity-count');
    const lowEl = document.getElementById('low-severity-count');
    const totalEl = document.getElementById('total-crimes-count');

    if (highEl) highEl.textContent = highCount;
    if (medEl) medEl.textContent = mediumCount;
    if (lowEl) lowEl.textContent = lowCount;
    if (totalEl) totalEl.textContent = last30DaysCrimes.length;

    // Update severity details
    const highDetails = document.getElementById('high-severity-details');
    const mediumDetails = document.getElementById('medium-severity-details');
    const lowDetails = document.getElementById('low-severity-details');

    if (highDetails) {
        highDetails.textContent = highCount === 0
            ? 'No high-severity crimes found (last 30 days)'
            : 'Includes violent crimes (robbery, assault, homicide, etc.)';
    }

    if (mediumDetails) {
        mediumDetails.textContent = mediumCount === 0
            ? 'No medium-severity crimes found (last 30 days)'
            : 'Includes property crimes (burglary, vehicle theft, arson, etc.)';
    }

    if (lowDetails) {
        lowDetails.textContent = lowCount === 0
            ? 'No low-severity crimes found (last 30 days)'
            : 'Includes theft, vandalism, drug offenses, etc.';
    }

    // Populate detailed breakdown by type
    populateCrimeTypeBreakdown('high-severity-types', highSeverityCrimes);
    populateCrimeTypeBreakdown('medium-severity-types', mediumSeverityCrimes);
    populateCrimeTypeBreakdown('low-severity-types', lowSeverityCrimes);

    // Reset expanded section to collapsed
    const expandedSection = document.getElementById('crime-details-expanded');
    const moreInfoBtn = document.getElementById('more-info-btn');
    if (expandedSection) expandedSection.style.display = 'none';
    if (moreInfoBtn) moreInfoBtn.textContent = 'More Info';

    // Open the modal
    openModalFn('crime-details-modal');
}

/**
 * Populate crime type breakdown section
 */
function populateCrimeTypeBreakdown(elementId, crimesObj) {
    const container = document.getElementById(elementId);
    if (!container) return;

    if (!crimesObj || Object.keys(crimesObj).length === 0) {
        container.innerHTML = '<div style="color: var(--gray-medium); font-style: italic;">No incidents in this category</div>';
        return;
    }

    let html = '';
    Object.entries(crimesObj).forEach(([category, count]) => {
        html += `
            <div class="crime-type-item">
                <span class="crime-type-name">${category}</span>
                <span class="crime-type-count">${count} incident${count > 1 ? 's' : ''}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Update a single breakdown bar in the safety score panel
 */
function updateBreakdownItem(id, label, score) {
    const element = document.getElementById(id);
    if (!element) {
        console.log(`[safetyController] Breakdown element not found: ${id}`);
        return;
    }

    // Handle undefined/null scores
    const safeScore = score ?? 50;

    // Ensure minimum visible width of 5% so bar is always visible
    const displayWidth = Math.max(safeScore, 5);

    const labelElement = element.querySelector('.breakdown-label');
    const fill = element.querySelector('.breakdown-fill');
    const scoreDisplay = element.querySelector('.breakdown-score');

    if (labelElement) {
        labelElement.textContent = label;
    }

    if (fill) {
        fill.style.width = `${displayWidth}%`;
        // Color based on score
        if (safeScore >= 80) {
            fill.className = 'breakdown-fill fill-excellent';
        } else if (safeScore >= 60) {
            fill.className = 'breakdown-fill fill-good';
        } else if (safeScore >= 40) {
            fill.className = 'breakdown-fill fill-fair';
        } else {
            fill.className = 'breakdown-fill fill-caution';
        }
    }

    if (scoreDisplay) {
        scoreDisplay.textContent = Math.round(safeScore);
    }
}
