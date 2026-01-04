// ========================================
// SAFETY CONTROLLER
// Handles safety score display and crime details modal
// ========================================

import {
    filterCrimesLast30Days,
    groupCrimesByType,
    getCrimeSeverity
} from '../services/crimeService.js';

/**
 * Update the safety score display panel
 *
 * @param {Function} getRouteData - Returns current route data object
 */
export function updateSafetyDisplay(getRouteData) {

    const routeData = getRouteData();

    if (!routeData.safetyScore) {
        console.log('No safety data available');
        return;
    }

    // Show the safety score display (was hidden initially)
    const safetyScoreDisplay = document.getElementById('safety-score-display');
    if (safetyScoreDisplay) {
        safetyScoreDisplay.style.display = 'flex';
    }

    // Update score number
    const scoreNumber = document.querySelector('.score-number');
    if (scoreNumber) {
        scoreNumber.textContent = routeData.safetyScore.toFixed(1);
        scoreNumber.className = `score-number score-${routeData.safetyColor}`;
    }

    // Update label
    const scoreSubLabel = document.querySelector('.score-sublabel');
    if (scoreSubLabel) {
        scoreSubLabel.textContent = routeData.safetyLabel;
    }

    // Update breakdown
    const breakdown = routeData.safetyBreakdown;
    if (breakdown) {
        // Bars 1-4 are always the same
        updateBreakdownItem('breakdown-length', 'Route Length', breakdown.routeLength.score);
        updateBreakdownItem('breakdown-time', 'Time of Day', breakdown.timeOfDay.score);
        updateBreakdownItem('breakdown-complexity', 'Route Simplicity', breakdown.complexity.score);
        updateBreakdownItem('breakdown-road', 'Road Type', breakdown.roadType.score);

        // Bar 5 changes based on crime data availability
        if (breakdown.crimeData) {
            // PHASE 2B: Show crime data in bar 5 (replaces Area Type)
            updateBreakdownItem('breakdown-density', 'SF Crime Data (90 days)', breakdown.crimeData.score);
        } else {
            // PHASE 2A: Show area type in bar 5 (original)
            updateBreakdownItem('breakdown-density', 'Area Type', breakdown.density.score);
        }
    }

    // PHASE 2C: Update disclaimer and show/hide crime details button
    const disclaimer = document.getElementById('safety-disclaimer');
    const crimeDetailsBtn = document.getElementById('crime-details-btn-container');

    if (routeData.usingCrimeData) {
        // Using real SF crime data
        if (disclaimer) {
            disclaimer.textContent = 'Safety score includes real crime data from San Francisco Police Department (last 90 days).';
        }
        // Show crime details button
        if (crimeDetailsBtn) {
            crimeDetailsBtn.style.display = 'block';
        }
    } else if (routeData.inSanFrancisco) {
        // In SF but crime data unavailable
        if (disclaimer) {
            disclaimer.textContent = 'Crime data temporarily unavailable. Score based on route characteristics.';
        }
        // Hide crime details button
        if (crimeDetailsBtn) {
            crimeDetailsBtn.style.display = 'none';
        }
    } else {
        // Outside SF
        if (disclaimer) {
            disclaimer.textContent = 'San Francisco, CA used for testing. Other cities with crime data coming soon.';
        }
        // Hide crime details button
        if (crimeDetailsBtn) {
            crimeDetailsBtn.style.display = 'none';
        }
    }

    // Show/hide nighttime warning banner
    const warningBanner = document.getElementById('nighttime-warning-banner');
    if (warningBanner) {
        if (routeData.showNighttimeWarning) {
            warningBanner.style.display = 'flex';
            console.log('⚠️ Nighttime warning banner displayed');
        } else {
            warningBanner.style.display = 'none';
        }
    }

}

/**
 * Toggle crime details expanded section
 */
export function toggleCrimeDetails() {

    const expandedSection = document.getElementById('crime-details-expanded');
    const button = document.getElementById('more-info-btn');

    if (expandedSection.style.display === 'none') {
        expandedSection.style.display = 'block';
        button.textContent = 'Less Info ▲';
    } else {
        expandedSection.style.display = 'none';
        button.textContent = 'More Info ▼';
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
    const breakdown = routeData.safetyBreakdown;

    if (!breakdown || !breakdown.crimeData) {
        alert('Crime data not available');
        return;
    }

    const crimeData = breakdown.crimeData;
    const rawCrimes = routeData.rawCrimeData || [];

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
        comparisonText.textContent = crimeData.comparisonText;
    }

    // Update severity counts (30-day filtered data)
    document.getElementById('high-severity-count').textContent = highCount;
    document.getElementById('medium-severity-count').textContent = mediumCount;
    document.getElementById('low-severity-count').textContent = lowCount;
    document.getElementById('total-crimes-count').textContent = last30DaysCrimes.length;

    // Update severity details (basic descriptions)
    const highDetails = document.getElementById('high-severity-details');
    const mediumDetails = document.getElementById('medium-severity-details');
    const lowDetails = document.getElementById('low-severity-details');

    if (highCount === 0) {
        highDetails.textContent = 'No high-severity crimes found (last 30 days)';
    } else {
        highDetails.textContent = `Includes violent crimes (robbery, assault, homicide, etc.) - last 30 days`;
    }

    if (mediumCount === 0) {
        mediumDetails.textContent = 'No medium-severity crimes found (last 30 days)';
    } else {
        mediumDetails.textContent = `Includes property crimes (burglary, vehicle theft, arson, etc.) - last 30 days`;
    }

    if (lowCount === 0) {
        lowDetails.textContent = 'No low-severity crimes found (last 30 days)';
    } else {
        lowDetails.textContent = `Includes theft, vandalism, drug offenses, etc. - last 30 days`;
    }

    // Populate detailed breakdown by type
    populateCrimeTypeBreakdown('high-severity-types', highSeverityCrimes);
    populateCrimeTypeBreakdown('medium-severity-types', mediumSeverityCrimes);
    populateCrimeTypeBreakdown('low-severity-types', lowSeverityCrimes);

    // Reset expanded section to collapsed
    document.getElementById('crime-details-expanded').style.display = 'none';
    document.getElementById('more-info-btn').textContent = 'More Info ▼';

    // Open the modal using provided function
    openModalFn('crime-details-modal');
}

/**
 * Populate crime type breakdown section - internal helper
 */
function populateCrimeTypeBreakdown(elementId, crimesObj) {

    const container = document.getElementById(elementId);

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
 * Update a single breakdown bar in the safety score panel - internal helper
 */
function updateBreakdownItem(id, label, score) {

    const element = document.getElementById(id);
    if (!element) return;

    const labelElement = element.querySelector('.breakdown-label');
    const fill = element.querySelector('.breakdown-fill');
    const scoreDisplay = element.querySelector('.breakdown-score');

    if (labelElement) {
        labelElement.textContent = label;
    }

    if (fill) {
        fill.style.width = `${score}%`;
        // Color based on score
        if (score >= 85) {
            fill.className = 'breakdown-fill fill-excellent';
        } else if (score >= 70) {
            fill.className = 'breakdown-fill fill-good';
        } else if (score >= 50) {
            fill.className = 'breakdown-fill fill-fair';
        } else {
            fill.className = 'breakdown-fill fill-caution';
        }
    }

    if (scoreDisplay) {
        scoreDisplay.textContent = Math.round(score);
    }
}
