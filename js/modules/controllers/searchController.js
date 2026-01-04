// ========================================
// SEARCH CONTROLLER
// Handles autocomplete dropdown UI and address selection
// ========================================

import { NOMINATIM_API } from '../config.js';
import { formatDistance } from '../utils.js';
import { searchAddresses } from '../services/geocodingService.js';

// Module-level state (moved from script.js)
let autocompleteTimeout = null;

/**
 * Set up autocomplete for an address input field
 *
 * @param {string} inputId - The ID of the input element
 * @param {Function} getCurrentLocation - Returns current user location {lat, lng} or null
 * @param {Function} onLocationSelected - Called with location object when user selects an address
 */
export function setupAutocomplete(inputId, getCurrentLocation, onLocationSelected) {
    console.log(`[searchController] Setting up autocomplete for: ${inputId}`);

    const input = document.getElementById(inputId);
    if (!input) return;

    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.display = 'none';
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(dropdown);

    // Add input listener
    input.addEventListener('input', function() {
        const query = input.value.trim();

        if (query.length < NOMINATIM_API.minQueryLength) {
            dropdown.style.display = 'none';
            return;
        }

        // Debounce requests using config value
        clearTimeout(autocompleteTimeout);
        autocompleteTimeout = setTimeout(() => {
            handleAddressSearch(query, dropdown, input, inputId, getCurrentLocation, onLocationSelected);
        }, NOMINATIM_API.debounceMs);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
        if (!input.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });

    console.log(`[searchController] Autocomplete ready for: ${inputId}`);
}

/**
 * Handle address search - internal function
 * Fetches results from geocoding service and renders dropdown
 */
async function handleAddressSearch(query, dropdown, input, inputId, getCurrentLocation, onLocationSelected) {
    console.log(`[searchController] Searching: "${query}"`);

    // Show loading state
    dropdown.innerHTML = '<div class="autocomplete-loading">Searching...</div>';
    dropdown.style.display = 'block';

    try {
        // Get current location from callback
        const currentLocation = getCurrentLocation();

        // Call pure geocoding service function
        const results = await searchAddresses(query, currentLocation);

        console.log(`[searchController] Got ${results.length} results`);

        // Clear dropdown
        dropdown.innerHTML = '';

        if (results.length === 0) {
            dropdown.innerHTML = '<div class="autocomplete-loading">No results found</div>';
            console.log(`[searchController] END - no results`);
            return;
        }

        // Render each result
        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';

            // Format distance if available
            let distanceHTML = '';
            if (result.distance !== null) {
                distanceHTML = `<span class="autocomplete-distance">${formatDistance(result.distance)}</span>`;
            }

            // Build HTML based on whether it's a place or address
            if (result.isPlace && result.primaryName) {
                // POI/Place with name + address
                item.innerHTML = `
                    <span class="autocomplete-icon">${result.icon}</span>
                    <div class="autocomplete-content">
                        <div class="autocomplete-primary">${result.primaryName}</div>
                        <div class="autocomplete-secondary">${result.secondaryAddress}</div>
                        ${distanceHTML}
                    </div>
                `;
            } else {
                // Regular address
                item.innerHTML = `
                    <span class="autocomplete-icon">${result.icon}</span>
                    <div class="autocomplete-content">
                        <div class="autocomplete-text">${result.secondaryAddress}</div>
                        ${distanceHTML}
                    </div>
                `;
            }

            // Handle selection
            item.addEventListener('click', function() {
                // For POIs, use the primary name; for addresses, use full display name
                if (result.isPlace && result.primaryName) {
                    input.value = `${result.primaryName}, ${result.secondaryAddress}`;
                } else {
                    input.value = result.displayName;
                }
                dropdown.style.display = 'none';

                // Build location object
                const location = {
                    lat: result.lat,
                    lng: result.lng,
                    name: result.displayName
                };

                // Call the callback to set state in script.js
                onLocationSelected(location);
                console.log(`[searchController] Location selected for ${inputId}:`, location);
            });

            dropdown.appendChild(item);
        });

        console.log(`[searchController] END - rendered ${results.length} items`);

    } catch (error) {
        console.error('[searchController] Error:', error);
        dropdown.innerHTML = '<div class="autocomplete-loading">Error searching addresses</div>';
        console.log(`[searchController] END - error`);
    }
}
