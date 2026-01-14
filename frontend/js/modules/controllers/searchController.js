// ========================================
// SEARCH CONTROLLER - Google Maps Version
// Handles Google Places Autocomplete for address search
// Uses PlaceAutocompleteElement (new API as of March 2025)
// ========================================

import { SF_BOUNDS } from '../config.js';

/**
 * Store for autocomplete instances to clean up later
 */
const autocompleteInstances = new Map();

/**
 * Apply custom styles to the PlaceAutocompleteElement
 * This injects styles into the Shadow DOM to override Google's default dark styling
 *
 * @param {HTMLElement} element - The PlaceAutocompleteElement
 */
function applyAutocompleteStyles(element) {
    // Force light color scheme on the element itself
    element.style.colorScheme = 'light only';

    // Wait for the element to be fully rendered
    requestAnimationFrame(() => {
        // Try to access the shadow root
        const shadowRoot = element.shadowRoot;

        if (shadowRoot) {
            // Inject custom styles into the shadow DOM
            const styleSheet = document.createElement('style');
            styleSheet.textContent = `
                :host {
                    color-scheme: light only !important;
                }
                input {
                    color-scheme: light only !important;
                    background-color: #ffffff !important;
                    color: #2d3748 !important;
                    border: 2px solid #cbd5e0 !important;
                    border-radius: 12px !important;
                    padding: 14px 16px !important;
                    font-size: 16px !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                    transition: all 0.3s ease !important;
                }
                input:focus {
                    border-color: #ff69b4 !important;
                    outline: none !important;
                    box-shadow: 0 0 0 3px rgba(255, 20, 147, 0.1) !important;
                }
                input::placeholder {
                    color: #a0aec0 !important;
                }
            `;
            shadowRoot.appendChild(styleSheet);
            console.log('[searchController] Injected styles into shadow DOM');
        } else {
            // If no shadow root, try to find and style the input directly
            const input = element.querySelector('input');
            if (input) {
                input.style.cssText = `
                    color-scheme: light only !important;
                    background-color: #ffffff !important;
                    color: #2d3748 !important;
                    border: 2px solid #cbd5e0 !important;
                    border-radius: 12px !important;
                    padding: 14px 16px !important;
                    font-size: 16px !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                `;
                console.log('[searchController] Applied inline styles to input');
            } else {
                // Retry after a short delay if element not ready
                setTimeout(() => applyAutocompleteStyles(element), 100);
            }
        }
    });
}

/**
 * Set up Google Places Autocomplete for an address input field
 * Uses the new PlaceAutocompleteElement API (required for new customers after March 2025)
 *
 * @param {string} inputId - The ID of the input element to replace
 * @param {Function} getCurrentLocation - Returns current user location {lat, lng} or null
 * @param {Function} onLocationSelected - Called with location object when user selects an address
 */
export function setupAutocomplete(inputId, getCurrentLocation, onLocationSelected) {
    console.log(`[searchController] Setting up PlaceAutocompleteElement for: ${inputId}`);

    const input = document.getElementById(inputId);
    if (!input) {
        console.error(`[searchController] Input element not found: ${inputId}`);
        return;
    }

    // Wait for Google Maps to be ready
    if (!window.google || !window.google.maps || !window.google.maps.places) {
        console.log('[searchController] Waiting for Google Maps to load...');
        window.addEventListener('google-maps-ready', () => {
            initAutocomplete(inputId, input, getCurrentLocation, onLocationSelected);
        });
        return;
    }

    initAutocomplete(inputId, input, getCurrentLocation, onLocationSelected);
}

/**
 * Initialize autocomplete once Google Maps is ready
 * Uses PlaceAutocompleteElement - the new web component API
 */
async function initAutocomplete(inputId, input, getCurrentLocation, onLocationSelected) {
    try {
        // Import the places library (required for new API)
        await google.maps.importLibrary('places');

        // Create the PlaceAutocompleteElement
        const placeAutocomplete = new google.maps.places.PlaceAutocompleteElement({
            includedRegionCodes: ['us'],
            includedPrimaryTypes: ['geocode', 'establishment']
        });

        // Set location bias toward San Francisco
        placeAutocomplete.locationBias = {
            west: SF_BOUNDS.west,
            east: SF_BOUNDS.east,
            south: SF_BOUNDS.south,
            north: SF_BOUNDS.north
        };

        // Bias toward user's current location if available
        const currentLocation = getCurrentLocation();
        if (currentLocation) {
            placeAutocomplete.locationBias = {
                center: { lat: currentLocation.lat, lng: currentLocation.lng },
                radius: 10000 // 10km radius
            };
        }

        // Style the element to match existing input
        placeAutocomplete.style.width = '100%';
        placeAutocomplete.style.height = '100%';
        placeAutocomplete.id = inputId;

        // Apply inline styles to override Google's default dark styling
        applyAutocompleteStyles(placeAutocomplete);

        // Get the parent container and replace the input
        const parent = input.parentElement;

        // Create a wrapper div to hold the autocomplete element
        const wrapper = document.createElement('div');
        wrapper.className = 'place-autocomplete-wrapper';
        wrapper.style.cssText = 'flex: 1; min-width: 0;';
        wrapper.appendChild(placeAutocomplete);

        // Replace the old input with the new element
        parent.replaceChild(wrapper, input);

        // Store the instance for cleanup
        autocompleteInstances.set(inputId, { element: placeAutocomplete, wrapper });

        // Handle place selection using new gmp-select event
        placeAutocomplete.addEventListener('gmp-select', async (event) => {
            const { placePrediction } = event;

            if (!placePrediction) {
                console.warn('[searchController] No place prediction in selection');
                return;
            }

            try {
                // Convert prediction to Place and fetch required fields
                const place = placePrediction.toPlace();
                await place.fetchFields({
                    fields: ['displayName', 'formattedAddress', 'location', 'id']
                });

                const location = {
                    lat: place.location.lat(),
                    lng: place.location.lng(),
                    name: place.displayName || place.formattedAddress,
                    placeId: place.id,
                    formattedAddress: place.formattedAddress
                };

                console.log(`[searchController] Location selected for ${inputId}:`, location);
                onLocationSelected(location);
            } catch (error) {
                console.error('[searchController] Error fetching place details:', error);
            }
        });

        // Handle errors
        placeAutocomplete.addEventListener('gmp-error', (event) => {
            console.error('[searchController] PlaceAutocomplete error:', event);
        });

        console.log(`[searchController] PlaceAutocompleteElement ready for: ${inputId}`);

    } catch (error) {
        console.error('[searchController] Failed to initialize PlaceAutocompleteElement:', error);
        // Fallback: keep the original input for manual entry
        console.log('[searchController] Falling back to manual address entry');
    }
}

/**
 * Reverse geocode coordinates to address
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string|null>} Formatted address or null
 */
export async function reverseGeocode(lat, lng) {
    if (!window.google || !window.google.maps) {
        console.error('[searchController] Google Maps not loaded');
        return null;
    }

    return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();

        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results[0]) {
                resolve(results[0].formatted_address);
            } else {
                console.warn('[searchController] Reverse geocoding failed:', status);
                resolve(null);
            }
        });
    });
}

