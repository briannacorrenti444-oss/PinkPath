// ========================================
// TRIP CONTROLLER
// Handles trip sharing, notifications, and trip lifecycle
// BETA: Using manual SMS until Twilio A2P registration is complete
// ========================================

import { API_BASE_URL } from '../config.js';
import { getAuthState, authFetch } from './authController.js';

// Trip state
let activeTrip = null;
let tripSharingEnabled = true;

/**
 * Initialize trip sharing UI
 * BETA: Simplified for manual SMS - no contacts required
 */
export async function initTripSharing() {
    const { isLoggedIn } = getAuthState();

    const tripSharingSection = document.getElementById('trip-sharing-section');
    const tripSharingToggle = document.getElementById('trip-sharing-toggle');
    const sharingContactsPreview = document.getElementById('sharing-contacts-preview');
    const noContactsWarning = document.getElementById('no-contacts-warning');
    const signinForSharing = document.getElementById('signin-for-sharing');
    const betaBanner = document.getElementById('trip-sharing-beta-banner');

    if (!tripSharingSection) return;

    // Show appropriate UI based on auth state
    if (!isLoggedIn) {
        // Not logged in - show sign in prompt
        const toggleContainer = tripSharingSection.querySelector('.trip-sharing-toggle');
        if (toggleContainer) toggleContainer.style.display = 'none';
        if (noContactsWarning) noContactsWarning.style.display = 'none';
        if (signinForSharing) signinForSharing.style.display = 'flex';
        if (betaBanner) betaBanner.style.display = 'none';

        const signinForSharingBtn = document.getElementById('signin-for-sharing-btn');
        if (signinForSharingBtn) {
            signinForSharingBtn.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('navigate', { detail: { screen: 'screen-auth' } }));
            });
        }
        return;
    }

    // User is logged in
    if (signinForSharing) signinForSharing.style.display = 'none';
    if (noContactsWarning) noContactsWarning.style.display = 'none';

    const toggleContainer = tripSharingSection.querySelector('.trip-sharing-toggle');
    if (toggleContainer) toggleContainer.style.display = 'block';

    // BETA: Show beta banner
    if (betaBanner) betaBanner.style.display = 'block';

    // BETA: Update contacts preview for manual mode
    if (sharingContactsPreview) {
        sharingContactsPreview.textContent = 'You\'ll choose who to send to';
    }

    // Load sharing preference
    try {
        const prefs = await loadTripSharingPreferences();
        tripSharingEnabled = prefs.share_trips_default;
        if (tripSharingToggle) tripSharingToggle.checked = tripSharingEnabled;
    } catch (error) {
        console.error('[TripController] Error loading preferences:', error);
    }

    // Toggle event listener
    if (tripSharingToggle) {
        tripSharingToggle.addEventListener('change', (e) => {
            tripSharingEnabled = e.target.checked;
            console.log('[TripController] Trip sharing toggled:', tripSharingEnabled);
        });
    }
}

/**
 * Load trip sharing preferences
 * @returns {Promise<Object>}
 */
async function loadTripSharingPreferences() {
    try {
        const response = await authFetch('/api/trips/preferences');
        if (response.ok) {
            const data = await response.json();
            return data.preferences;
        }
        return { share_trips_default: true };
    } catch (error) {
        console.error('[TripController] Error fetching preferences:', error);
        return { share_trips_default: true };
    }
}

/**
 * Open the device's SMS app with a pre-filled message
 * @param {string} message - The message to pre-fill
 * @returns {boolean} Whether the SMS app was opened
 */
function openSmsApp(message) {
    try {
        // Encode the message for URL
        const encodedMessage = encodeURIComponent(message);

        // Create SMS URL - no recipient, user will add their own
        // Format: sms:?body=message (works on iOS and most Android)
        const smsUrl = `sms:?body=${encodedMessage}`;

        // Open the SMS app
        window.location.href = smsUrl;

        console.log('[TripController] Opened SMS app with message');
        return true;
    } catch (error) {
        console.error('[TripController] Failed to open SMS app:', error);
        return false;
    }
}

/**
 * Show manual SMS modal and handle user response
 * @param {string} title - Modal title
 * @param {string} message - The SMS message content
 * @param {string} type - The intent type for logging
 * @param {number|null} tripId - Trip ID for logging
 * @returns {Promise<boolean>} Whether user chose to send
 */
async function showManualSmsModal(title, message, type, tripId = null) {
    return new Promise((resolve) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay manual-sms-modal';
        overlay.innerHTML = `
            <div class="modal-content">
                <h3 class="modal-title">${title}</h3>
                <p class="modal-description">
                    We'll open your Messages app with a ready-to-send update.
                    Just add your contact and send.
                </p>
                <div class="sms-preview">
                    <div class="sms-preview-label">Message preview:</div>
                    <div class="sms-preview-text">${message}</div>
                </div>
                <div class="modal-buttons">
                    <button class="btn-secondary modal-skip-btn">Skip</button>
                    <button class="btn-primary modal-send-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                        </svg>
                        Open Messages
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Add event listeners
        const skipBtn = overlay.querySelector('.modal-skip-btn');
        const sendBtn = overlay.querySelector('.modal-send-btn');

        skipBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });

        sendBtn.addEventListener('click', async () => {
            // Log the intent
            if (tripId) {
                await logShareIntent(tripId, type);
            } else if (type === 'sos') {
                await logSosIntent();
            }

            // Open SMS app
            openSmsApp(message);

            overlay.remove();
            resolve(true);
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
    });
}

/**
 * Log share intent to backend for analytics
 * @param {number} tripId
 * @param {string} type
 */
async function logShareIntent(tripId, type) {
    try {
        await authFetch(`/api/trips/${tripId}/log-share-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type }),
        });
        console.log('[TripController] Logged share intent:', type);
    } catch (error) {
        console.error('[TripController] Failed to log share intent:', error);
    }
}

/**
 * Log standalone SOS intent
 */
async function logSosIntent() {
    try {
        // Get current position for logging
        const position = await getCurrentPosition();
        await authFetch('/api/trips/log-sos-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat: position?.coords?.latitude || 0,
                lng: position?.coords?.longitude || 0,
            }),
        });
        console.log('[TripController] Logged SOS intent');
    } catch (error) {
        console.error('[TripController] Failed to log SOS intent:', error);
    }
}

/**
 * Get current position (promisified)
 */
function getCurrentPosition() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    });
}

/**
 * Get share message from backend
 * @param {number} tripId
 * @param {string} type
 * @returns {Promise<string|null>}
 */
async function getShareMessage(tripId, type) {
    try {
        const response = await authFetch(`/api/trips/${tripId}/share-message?type=${type}`);
        if (response.ok) {
            const data = await response.json();
            return data.message;
        }
        return null;
    } catch (error) {
        console.error('[TripController] Failed to get share message:', error);
        return null;
    }
}

/**
 * Get SOS message from backend (standalone, no trip)
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{message: string, mapsLink: string}|null>}
 */
async function getSosMessage(lat, lng) {
    try {
        const response = await authFetch(`/api/trips/sos-message?lat=${lat}&lng=${lng}`);
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.error('[TripController] Failed to get SOS message:', error);
        return null;
    }
}

/**
 * Start a trip with optional sharing
 * BETA: Uses manual SMS instead of automatic notifications
 * @param {Object} routeData - Route details
 * @returns {Promise<Object>} Trip data or null if failed
 */
export async function startTrip(routeData) {
    const { isLoggedIn } = getAuthState();

    if (!isLoggedIn) {
        console.log('[TripController] Trip started without sharing (not logged in)');
        return null;
    }

    try {
        // Create trip in backend
        const response = await authFetch('/api/trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startLat: routeData.origin.lat,
                startLng: routeData.origin.lng,
                endLat: routeData.destination.lat,
                endLng: routeData.destination.lng,
                originName: routeData.originName,
                destinationName: routeData.destinationName,
                estimatedArrivalMinutes: routeData.durationMinutes,
                sharingEnabled: tripSharingEnabled,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            activeTrip = data.trip;
            console.log('[TripController] Trip started:', activeTrip.id);

            // BETA: Show manual SMS modal if sharing is enabled
            if (tripSharingEnabled) {
                const message = await getShareMessage(activeTrip.id, 'started');
                if (message) {
                    await showManualSmsModal(
                        'Share your trip?',
                        message,
                        'started',
                        activeTrip.id
                    );
                }
            }

            return data;
        } else {
            const error = await response.json();
            console.error('[TripController] Failed to start trip:', error);
            return null;
        }
    } catch (error) {
        console.error('[TripController] Error starting trip:', error);
        return null;
    }
}

/**
 * Update trip location
 * @param {number} lat
 * @param {number} lng
 */
export async function updateTripLocation(lat, lng) {
    if (!activeTrip) return;

    try {
        const response = await authFetch(`/api/trips/${activeTrip.id}/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng }),
        });

        if (response.ok) {
            const data = await response.json();

            // Check if arrived
            if (data.arrived) {
                console.log('[TripController] Arrived at destination!');

                // BETA: Show manual SMS modal for arrival
                if (activeTrip.sharingEnabled) {
                    const message = await getShareMessage(activeTrip.id, 'arrived');
                    if (message) {
                        await showManualSmsModal(
                            'You arrived safely!',
                            message,
                            'arrived',
                            activeTrip.id
                        );
                    }
                }

                showNotificationToast('You arrived at your destination!');
                activeTrip = null;
            }
        }
    } catch (error) {
        console.error('[TripController] Error updating location:', error);
    }
}

/**
 * End trip with given status
 * @param {'arrived' | 'cancelled'} status
 */
export async function endTrip(status = 'arrived') {
    if (!activeTrip) return;

    const tripId = activeTrip.id;
    const sharingEnabled = activeTrip.sharingEnabled;

    try {
        const response = await authFetch(`/api/trips/${tripId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });

        if (response.ok) {
            console.log(`[TripController] Trip ${status}:`, tripId);

            // BETA: Show manual SMS modal for arrived status
            if (status === 'arrived' && sharingEnabled) {
                const message = await getShareMessage(tripId, 'arrived');
                if (message) {
                    await showManualSmsModal(
                        'Let your contacts know you arrived?',
                        message,
                        'arrived',
                        tripId
                    );
                }
            }

            activeTrip = null;
        }
    } catch (error) {
        console.error('[TripController] Error ending trip:', error);
    }
}

/**
 * Send check-in "I'm OK" notification
 * BETA: Opens SMS app for manual send
 */
export async function sendCheckIn() {
    if (!activeTrip) {
        console.warn('[TripController] No active trip for check-in');
        return false;
    }

    try {
        const message = await getShareMessage(activeTrip.id, 'check_in');
        if (message) {
            await showManualSmsModal(
                'Send check-in?',
                message,
                'check_in',
                activeTrip.id
            );
            return true;
        }
        return false;
    } catch (error) {
        console.error('[TripController] Error sending check-in:', error);
        return false;
    }
}

/**
 * Trigger SOS alert
 * BETA: Opens SMS app directly with SOS message (no extra confirmation after initial)
 * @param {number} lat - Current latitude
 * @param {number} lng - Current longitude
 */
export async function triggerSOS(lat, lng) {
    const { isLoggedIn } = getAuthState();

    if (!isLoggedIn) {
        // Not logged in - just open SMS with basic SOS
        const basicSosMessage = `EMERGENCY: I need help!\nLocation: https://maps.google.com/?q=${lat},${lng}\nTime: ${new Date().toLocaleTimeString()}`;
        openSmsApp(basicSosMessage);
        return { success: true, manual: true };
    }

    try {
        let message;
        let mapsLink;

        if (activeTrip) {
            // SOS with active trip - get message from backend
            const response = await authFetch(`/api/trips/${activeTrip.id}/sos`, {
                method: 'POST',
            });

            message = await getShareMessage(activeTrip.id, 'sos');

            // Log intent
            await logShareIntent(activeTrip.id, 'sos');
        } else {
            // Standalone SOS
            const sosData = await getSosMessage(lat, lng);
            if (sosData) {
                message = sosData.message;
                mapsLink = sosData.mapsLink;
            }

            // Log to backend
            await authFetch('/api/trips/sos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng }),
            });

            await logSosIntent();
        }

        // Fallback message if backend call failed
        if (!message) {
            message = `EMERGENCY: I need help!\nLocation: https://maps.google.com/?q=${lat},${lng}\nTime: ${new Date().toLocaleTimeString()}`;
        }

        // BETA: Open SMS app directly for SOS (no additional modal)
        openSmsApp(message);

        console.log('[TripController] SOS triggered - SMS app opened');
        return { success: true, manual: true };

    } catch (error) {
        console.error('[TripController] Error sending SOS:', error);

        // Fallback - still try to open SMS
        const fallbackMessage = `EMERGENCY: I need help!\nLocation: https://maps.google.com/?q=${lat},${lng}\nTime: ${new Date().toLocaleTimeString()}`;
        openSmsApp(fallbackMessage);

        return { success: true, manual: true, fallback: true };
    }
}

/**
 * Get current active trip
 */
export function getActiveTrip() {
    return activeTrip;
}

/**
 * Check if trip sharing is enabled
 */
export function isTripSharingEnabled() {
    return tripSharingEnabled;
}

/**
 * Show a toast notification
 * @param {string} message
 */
function showNotificationToast(message) {
    // Create or reuse toast element
    let toast = document.getElementById('notification-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'notification-toast';
        toast.className = 'notification-toast';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Load and display trip sharing settings
 * BETA: Hides delay settings (non-functional without Twilio)
 */
export async function loadTripSharingSettings() {
    const { isLoggedIn } = getAuthState();
    if (!isLoggedIn) return;

    try {
        const prefs = await loadTripSharingPreferences();

        // Set toggle states
        const shareDefaultToggle = document.getElementById('setting-share-default');
        const notifyArrivalToggle = document.getElementById('setting-notify-arrival');

        // BETA: Hide delay settings (non-functional)
        const notifyDelayToggle = document.getElementById('setting-notify-delay');
        const delayThresholdSlider = document.getElementById('setting-delay-threshold');
        const delaySettingItems = document.querySelectorAll('.setting-item-delay');

        if (shareDefaultToggle) shareDefaultToggle.checked = prefs.share_trips_default;
        if (notifyArrivalToggle) notifyArrivalToggle.checked = prefs.notify_on_arrival;

        // BETA: Hide delay-related settings
        if (notifyDelayToggle) notifyDelayToggle.closest('.setting-item')?.classList.add('hidden');
        if (delayThresholdSlider) delayThresholdSlider.closest('.setting-item')?.classList.add('hidden');
        delaySettingItems.forEach(item => item.classList.add('hidden'));

        console.log('[TripController] Loaded trip sharing settings (BETA mode)');
    } catch (error) {
        console.error('[TripController] Error loading settings:', error);
    }
}

/**
 * Save trip sharing settings
 */
export async function saveTripSharingSettings() {
    const { isLoggedIn } = getAuthState();
    if (!isLoggedIn) return { success: false, error: 'Not logged in' };

    const shareDefault = document.getElementById('setting-share-default')?.checked ?? true;
    const notifyArrival = document.getElementById('setting-notify-arrival')?.checked ?? true;
    // BETA: These are saved but not used until Twilio is enabled
    const notifyDelay = document.getElementById('setting-notify-delay')?.checked ?? true;
    const delayThreshold = parseInt(document.getElementById('setting-delay-threshold')?.value || '15', 10);

    try {
        const response = await authFetch('/api/trips/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shareTripsDefault: shareDefault,
                notifyOnArrival: notifyArrival,
                notifyOnDelay: notifyDelay,
                delayThresholdMinutes: delayThreshold,
            }),
        });

        if (response.ok) {
            console.log('[TripController] Trip sharing settings saved');
            return { success: true };
        } else {
            const error = await response.json();
            return { success: false, error: error.message };
        }
    } catch (error) {
        console.error('[TripController] Error saving settings:', error);
        return { success: false, error: error.message };
    }
}

export default {
    initTripSharing,
    startTrip,
    updateTripLocation,
    endTrip,
    sendCheckIn,
    triggerSOS,
    getActiveTrip,
    isTripSharingEnabled,
    loadTripSharingSettings,
    saveTripSharingSettings,
};
