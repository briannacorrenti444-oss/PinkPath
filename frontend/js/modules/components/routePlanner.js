// ========================================
// ROUTE PLANNER COMPONENT
// Reusable route planning form widget
// ========================================

import { setupAutocomplete } from '../controllers/searchController.js';

/**
 * RoutePlanner - A reusable route planning form component
 *
 * Creates a self-contained route planner with:
 * - Start location input with autocomplete
 * - Destination input with autocomplete
 * - "Use My Location" GPS button
 * - Optional safety preferences section
 * - Optional share trip button
 * - Find route button
 *
 * @example
 * const planner = new RoutePlanner(document.getElementById('container'), {
 *     instanceId: 'main',
 *     showPreferences: true,
 *     showShareButton: true,
 *     onRouteRequest: (start, dest) => { ... },
 *     onLocationSelected: (type, location) => { ... },
 *     getCurrentLocation: () => currentUserLocation,
 *     getUserLocation: () => { ... }
 * });
 */
class RoutePlanner {
    /**
     * Create a RoutePlanner instance
     * @param {HTMLElement} container - The container element to render into
     * @param {Object} options - Configuration options
     * @param {string} options.instanceId - Unique ID for this instance (e.g., 'main', 'home')
     * @param {boolean} options.showPreferences - Show safety preferences section (default: true)
     * @param {boolean} options.showShareButton - Show share trip button (default: true)
     * @param {Function} options.onRouteRequest - Callback when user requests a route
     * @param {Function} options.onLocationSelected - Callback when user selects a location
     * @param {Function} options.getCurrentLocation - Returns current user GPS location
     * @param {Function} options.getUserLocation - Triggers GPS location request
     */
    constructor(container, options = {}) {
        this.container = container;
        this.instanceId = options.instanceId || 'default';
        this.showPreferences = options.showPreferences !== false;
        this.showShareButton = options.showShareButton !== false;

        // Callbacks
        this.onRouteRequest = options.onRouteRequest || (() => {});
        this.onLocationSelected = options.onLocationSelected || (() => {});
        this.onShareTrip = options.onShareTrip || (() => {});
        this.getCurrentLocation = options.getCurrentLocation || (() => null);
        this.getUserLocation = options.getUserLocation || (() => {});

        // Internal state
        this.preferencesExpanded = false;

        // Element references (populated after render)
        this.elements = {};
    }

    // ----------------------------------------
    // ELEMENT ID HELPERS
    // Generate unique IDs for this instance
    // ----------------------------------------

    get startInputId() {
        return `${this.instanceId}-start-location`;
    }

    get destinationInputId() {
        return `${this.instanceId}-destination`;
    }

    get useLocationBtnId() {
        return `${this.instanceId}-use-location-btn`;
    }

    get findRouteBtnId() {
        return `${this.instanceId}-find-route-btn`;
    }

    get shareTripBtnId() {
        return `${this.instanceId}-share-trip-btn`;
    }

    get preferencesToggleBtnId() {
        return `${this.instanceId}-preferences-toggle-btn`;
    }

    get preferencesContentId() {
        return `${this.instanceId}-preferences-content`;
    }

    get preferencesArrowId() {
        return `${this.instanceId}-preferences-arrow`;
    }

    get wellLitCheckboxId() {
        return `${this.instanceId}-well-lit`;
    }

    get busyAreasCheckboxId() {
        return `${this.instanceId}-busy-areas`;
    }

    get avoidConstructionCheckboxId() {
        return `${this.instanceId}-avoid-construction`;
    }

    // ----------------------------------------
    // HTML TEMPLATE
    // ----------------------------------------

    /**
     * Generate the HTML template for the route planner
     * @returns {string} HTML string
     */
    getTemplate() {
        const preferencesSection = this.showPreferences ? `
                    <!-- Safety Preferences - Coming Soon -->
                    <div class="preferences-section preferences-coming-soon">
                        <div class="preferences-header">
                            <span class="preferences-label">
                                <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px; margin-right: 8px;">
                                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                                </svg>
                                Safety Preferences
                            </span>
                            <span class="coming-soon-badge">Coming Soon</span>
                        </div>
                        <div class="preferences-coming-soon-content">
                            <p class="coming-soon-text">Customize your route preferences like well-lit streets and busy areas.</p>
                            <div class="upvote-row">
                                <button class="btn-upvote-small" id="${this.instanceId}-upvote-preferences-btn" type="button">
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                        <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
                                    </svg>
                                    Upvote
                                </button>
                            </div>
                        </div>
                    </div>
        ` : '';

        const shareButton = this.showShareButton ? `
                    <button class="btn-large btn-secondary" id="${this.shareTripBtnId}">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px; margin-right: 8px;">
                            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                        </svg>
                        Share Trip
                    </button>
        ` : '';

        return `
                <div class="card route-planner">
                    <!-- Starting Point -->
                    <div class="input-wrapper">
                        <label class="input-label">
                            <span class="label-icon pink">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                                </svg>
                            </span>
                            Starting Point
                        </label>
                        <div class="input-with-button">
                            <input
                                type="text"
                                id="${this.startInputId}"
                                class="input-field"
                                placeholder="Enter your current location"
                            >
                            <button class="location-btn" id="${this.useLocationBtnId}" title="Use my current location">
                                <svg viewBox="0 0 24 24" fill="currentColor" class="location-icon">
                                    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                                </svg>
                                <span class="location-text">Use My Location</span>
                            </button>
                        </div>
                    </div>

                    <!-- Divider -->
                    <div class="route-divider">
                        <span class="divider-icon">↓</span>
                    </div>

                    <!-- Destination -->
                    <div class="input-wrapper">
                        <label class="input-label">
                            <span class="label-icon pink">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                                </svg>
                            </span>
                            Destination
                        </label>
                        <input
                            type="text"
                            id="${this.destinationInputId}"
                            class="input-field"
                            placeholder="Where are you going?"
                        >
                    </div>
${preferencesSection}
                    <!-- Action Buttons -->
                    <button class="btn-large btn-primary" id="${this.findRouteBtnId}">
                        Find Safest Route
                    </button>
${shareButton}
                </div>
        `;
    }

    // ----------------------------------------
    // INITIALIZATION
    // ----------------------------------------

    /**
     * Initialize the component - render HTML and wire up functionality
     */
    init() {
        // Render HTML into container
        this.container.innerHTML = this.getTemplate();

        // Cache element references
        this.cacheElements();

        // Set up functionality
        this.setupAutocomplete();
        this.wireButtons();
        this.wireKeyboardHandlers();

        console.log(`[RoutePlanner:${this.instanceId}] Initialized`);
    }

    /**
     * Cache references to DOM elements
     */
    cacheElements() {
        this.elements = {
            startInput: document.getElementById(this.startInputId),
            destinationInput: document.getElementById(this.destinationInputId),
            useLocationBtn: document.getElementById(this.useLocationBtnId),
            findRouteBtn: document.getElementById(this.findRouteBtnId),
            shareTripBtn: document.getElementById(this.shareTripBtnId),
            preferencesToggleBtn: document.getElementById(this.preferencesToggleBtnId),
            preferencesContent: document.getElementById(this.preferencesContentId),
            preferencesArrow: document.getElementById(this.preferencesArrowId)
        };
    }

    // ----------------------------------------
    // AUTOCOMPLETE SETUP
    // ----------------------------------------

    /**
     * Set up autocomplete for start and destination inputs
     */
    setupAutocomplete() {
        // Set up autocomplete for start location input
        setupAutocomplete(
            this.startInputId,
            this.getCurrentLocation,
            (location) => {
                this.onLocationSelected('start', location);
                console.log(`[RoutePlanner:${this.instanceId}] Start location selected:`, location.name);
            }
        );

        // Set up autocomplete for destination input
        setupAutocomplete(
            this.destinationInputId,
            this.getCurrentLocation,
            (location) => {
                this.onLocationSelected('destination', location);
                console.log(`[RoutePlanner:${this.instanceId}] Destination selected:`, location.name);
            }
        );

        console.log(`[RoutePlanner:${this.instanceId}] Autocomplete initialized`);
    }

    // ----------------------------------------
    // BUTTON WIRING
    // ----------------------------------------

    /**
     * Wire up button click handlers
     */
    wireButtons() {
        // Wire "Use My Location" button
        if (this.elements.useLocationBtn) {
            this.elements.useLocationBtn.addEventListener('click', () => {
                console.log(`[RoutePlanner:${this.instanceId}] Use My Location clicked`);
                this.getUserLocation(this.startInputId, (location) => {
                    this.onLocationSelected('start', location);
                });
            });
        }

        // Wire "Find Safest Route" button
        if (this.elements.findRouteBtn) {
            this.elements.findRouteBtn.addEventListener('click', () => {
                console.log(`[RoutePlanner:${this.instanceId}] Find Route clicked`);
                this.onRouteRequest(this.getValues(), this.getPreferences());
            });
        }

        // Wire "Share Trip" button (if visible)
        if (this.elements.shareTripBtn) {
            this.elements.shareTripBtn.addEventListener('click', () => {
                console.log(`[RoutePlanner:${this.instanceId}] Share Trip clicked`);
                this.onShareTrip();
            });
        }

        // Wire "Upvote Preferences" button (if visible)
        const upvoteBtn = document.getElementById(`${this.instanceId}-upvote-preferences-btn`);
        if (upvoteBtn) {
            // Check if already voted and update button state
            const votes = JSON.parse(localStorage.getItem('pinkpath_feature_votes') || '{}');
            if (votes.safety_preferences?.voted) {
                upvoteBtn.classList.add('upvoted');
                upvoteBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                    Voted!
                `;
                upvoteBtn.disabled = true;
            }

            upvoteBtn.addEventListener('click', () => {
                console.log(`[RoutePlanner:${this.instanceId}] Upvote preferences clicked`);
                this.handleUpvotePreferences(upvoteBtn);
            });
        }

        console.log(`[RoutePlanner:${this.instanceId}] Buttons wired`);
    }

    /**
     * Wire up keyboard handlers (Enter key)
     */
    wireKeyboardHandlers() {
        const startInput = this.elements.startInput;
        const destInput = this.elements.destinationInput;

        // Enter in start field → focus destination field
        if (startInput) {
            startInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    destInput?.focus();
                }
            });
        }

        // Enter in destination field → trigger find route
        if (destInput) {
            destInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.onRouteRequest();
                }
            });
        }

        console.log(`[RoutePlanner:${this.instanceId}] Keyboard handlers wired`);
    }

    // ----------------------------------------
    // FEATURE UPVOTE
    // ----------------------------------------

    /**
     * Handle upvote button click for preferences feature
     * @param {HTMLElement} button - The upvote button element
     */
    handleUpvotePreferences(button) {
        const votesKey = 'pinkpath_feature_votes';
        const votes = JSON.parse(localStorage.getItem(votesKey) || '{}');

        // Check if already voted
        if (votes.safety_preferences?.voted) {
            return;
        }

        // Visual feedback
        button.classList.add('upvoted');
        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            Voted!
        `;
        button.disabled = true;

        // Store vote in localStorage with consistent format
        votes.safety_preferences = {
            voted: true,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(votesKey, JSON.stringify(votes));

        console.log(`[RoutePlanner:${this.instanceId}] Safety preferences upvoted`);

        // Send vote to server for analytics
        this.sendVoteToServer('safety_preferences');
    }

    /**
     * Send feature vote to server for analytics
     * @param {string} featureKey - The feature key to vote for
     */
    async sendVoteToServer(featureKey) {
        try {
            // Get or generate session ID
            let sessionId = localStorage.getItem('pinkpath_session_id');
            if (!sessionId) {
                sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 15);
                localStorage.setItem('pinkpath_session_id', sessionId);
            }

            const apiUrl = window.API_BASE_URL || 'http://localhost:3001';
            await fetch(`${apiUrl}/api/feedback/feature-votes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(localStorage.getItem('pinkpath_token') && {
                        'Authorization': `Bearer ${localStorage.getItem('pinkpath_token')}`
                    })
                },
                body: JSON.stringify({
                    feature_key: featureKey,
                    session_id: sessionId
                })
            });
        } catch (error) {
            // Don't fail the vote if server is unavailable
            console.warn('[RoutePlanner] Failed to send vote to server:', error);
        }
    }

    // ----------------------------------------
    // VALUE GETTERS/SETTERS
    // ----------------------------------------

    /**
     * Get current input values
     * @returns {Object} { start: string, destination: string }
     */
    getValues() {
        return {
            start: this.elements.startInput?.value.trim() || '',
            destination: this.elements.destinationInput?.value.trim() || ''
        };
    }

    /**
     * Set input values
     * @param {Object} values - { start?: string, destination?: string }
     */
    setValues(values = {}) {
        if (values.start !== undefined && this.elements.startInput) {
            this.elements.startInput.value = values.start;
        }
        if (values.destination !== undefined && this.elements.destinationInput) {
            this.elements.destinationInput.value = values.destination;
        }
    }

    /**
     * Clear both input fields
     */
    clear() {
        this.setValues({ start: '', destination: '' });
    }

    /**
     * Get preference checkbox values
     * @returns {Object} { wellLit: boolean, busyAreas: boolean, avoidConstruction: boolean }
     */
    getPreferences() {
        return {
            wellLit: document.getElementById(this.wellLitCheckboxId)?.checked || false,
            busyAreas: document.getElementById(this.busyAreasCheckboxId)?.checked || false,
            avoidConstruction: document.getElementById(this.avoidConstructionCheckboxId)?.checked || false
        };
    }
}

// Export the component
export { RoutePlanner };
