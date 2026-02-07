// ========================================
// SEARCH CONTROLLER - Google Maps Version
// Handles Google Places Autocomplete for address search
// Uses PlaceAutocompleteElement (new API as of March 2025)
// ========================================

import { SF_BOUNDS, API_BASE_URL } from '../config.js';

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

/**
 * Geocode an address string to coordinates
 * Uses the backend API endpoint for server-side geocoding
 *
 * @param {string} address - The address to geocode
 * @returns {Promise<object|null>} Location object or null
 */
export async function geocodeAddress(address) {
    if (!address || address.trim().length < 5) {
        console.warn('[searchController] Address too short for geocoding');
        return null;
    }

    try {
        console.log('[searchController] Geocoding address:', address);

        const response = await fetch(`${API_BASE_URL}/api/routes/geocode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ address: address.trim() })
        });

        if (!response.ok) {
            const error = await response.json();
            console.warn('[searchController] Geocoding failed:', error.message || 'Unknown error');
            return null;
        }

        const data = await response.json();

        if (data.success && data.location) {
            const location = {
                lat: data.location.lat,
                lng: data.location.lng,
                name: data.location.formatted_address || address,
                formattedAddress: data.location.formatted_address,
                placeId: data.location.place_id || null
            };
            console.log('[searchController] Geocoded successfully:', location);
            return location;
        }

        return null;
    } catch (error) {
        console.error('[searchController] Geocoding error:', error);
        return null;
    }
}

/**
 * Set up paste handler for autocomplete inputs
 * Detects when user pastes text and attempts to geocode it
 *
 * @param {string} inputId - The ID of the autocomplete input
 * @param {Function} onLocationSelected - Called with location object when geocoding succeeds
 */
export function setupPasteHandler(inputId, onLocationSelected) {
    // Get the wrapper or element
    const instance = autocompleteInstances.get(inputId);
    if (!instance) {
        console.warn(`[searchController] No autocomplete instance for: ${inputId}`);
        return;
    }

    const { wrapper, element } = instance;
    const target = wrapper || element;

    // Debounce timer
    let debounceTimer = null;

    // Listen for paste events on the wrapper (captures paste on shadow DOM input)
    target.addEventListener('paste', async (event) => {
        // Clear any pending debounce
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        // Get pasted text
        let pastedText = '';
        if (event.clipboardData) {
            pastedText = event.clipboardData.getData('text');
        }

        if (!pastedText || pastedText.length < 10) {
            // Too short, probably not a full address
            return;
        }

        console.log('[searchController] Paste detected:', pastedText.substring(0, 50) + '...');

        // Debounce to let user finish pasting
        debounceTimer = setTimeout(async () => {
            // Show loading state if possible
            target.style.opacity = '0.7';

            const location = await geocodeAddress(pastedText);

            // Reset loading state
            target.style.opacity = '1';

            if (location) {
                console.log('[searchController] Paste geocoded successfully');
                onLocationSelected(location);

                // Update the input value to show formatted address
                const input = target.querySelector('input') ||
                              (element && element.shadowRoot ? element.shadowRoot.querySelector('input') : null);
                if (input) {
                    input.value = location.formattedAddress || location.name;
                }
            } else {
                console.log('[searchController] Could not geocode pasted address');
                // Don't interrupt user - they can still use dropdown
            }
        }, 500);
    });

    console.log(`[searchController] Paste handler set up for: ${inputId}`);
}

