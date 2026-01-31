/**
 * @fileoverview Twilio SMS Service
 * Handles sending SMS notifications to emergency contacts for trip sharing
 */

import { twilioConfig } from '../config/index.js';

// Twilio client - lazy loaded
let twilioClient = null;
let twilioInitialized = false;

/**
 * Initialize Twilio client (async due to dynamic import)
 * @returns {Promise<Object|null>} Twilio client or null if not configured
 */
async function getClient() {
  if (!twilioConfig.enabled) {
    if (!twilioInitialized) {
      console.warn('[Twilio] Not configured - SMS will be simulated');
      twilioInitialized = true;
    }
    return null;
  }

  if (!twilioClient) {
    // Dynamic import to avoid loading Twilio when not configured
    const twilio = await import('twilio');
    twilioClient = twilio.default(twilioConfig.accountSid, twilioConfig.authToken);
    console.log('[Twilio] Client initialized');
  }

  return twilioClient;
}

// ==============================================
// MESSAGE TEMPLATES
// ==============================================

const MESSAGE_TEMPLATES = {
  trip_started: ({ userName, destination, eta }) =>
    `${userName} started walking to ${destination}. ETA: ${eta}. For live location, ask them to share via iMessage or WhatsApp.`,

  arrived: ({ userName, destination }) =>
    `${userName} arrived safely at ${destination}.`,

  delayed: ({ userName, minutes, location }) =>
    `${userName}'s trip is taking longer than expected (${minutes} min over ETA). Last known area: ${location}. Consider checking in with them.`,

  check_in: ({ userName, location }) =>
    `${userName} checked in and says they're OK! Current area: ${location}`,

  cancelled: ({ userName, location }) =>
    `${userName} ended their trip early near ${location}.`,

  sos: ({ userName, location, time, destination }) =>
    `EMERGENCY: ${userName} triggered an SOS alert and may need help! Location: ${location}. Time: ${time}.${destination ? ` They were heading to ${destination}.` : ''} Please call them immediately or contact emergency services.`,
};

/**
 * Format a message using template
 * @param {string} type - Notification type
 * @param {Object} data - Template data
 * @returns {string} Formatted message
 */
export function formatMessage(type, data) {
  const template = MESSAGE_TEMPLATES[type];
  if (!template) {
    throw new Error(`Unknown message type: ${type}`);
  }
  return template(data);
}

// ==============================================
// SMS SENDING
// ==============================================

/**
 * Send an SMS message
 * @param {string} to - Recipient phone number (E.164 format)
 * @param {string} message - Message content
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
export async function sendSMS(to, message) {
  const client = await getClient();

  // Validate phone number format (basic E.164 check)
  if (!to.match(/^\+1\d{10}$/)) {
    console.error('[Twilio] Invalid phone number format:', to);
    return {
      success: false,
      error: 'Invalid phone number format. Must be US number in +1XXXXXXXXXX format.',
    };
  }

  // If Twilio not configured, simulate sending
  if (!client) {
    console.log('[Twilio] SIMULATED SMS to', to, ':', message.substring(0, 50) + '...');
    return {
      success: true,
      sid: `SIM_${Date.now()}`,
      simulated: true,
    };
  }

  try {
    const result = await client.messages.create({
      body: message,
      from: twilioConfig.phoneNumber,
      to: to,
    });

    console.log('[Twilio] SMS sent:', result.sid, 'to', to);
    return {
      success: true,
      sid: result.sid,
    };

  } catch (error) {
    console.error('[Twilio] Failed to send SMS:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send notification to multiple contacts
 * @param {Array<{id: number, phone_number: string, name: string}>} contacts
 * @param {string} type - Notification type
 * @param {Object} data - Template data
 * @returns {Promise<Array<{contactId: number, success: boolean, sid?: string, error?: string}>>}
 */
export async function sendToContacts(contacts, type, data) {
  const message = formatMessage(type, data);
  const results = [];

  for (const contact of contacts) {
    const result = await sendSMS(contact.phone_number, message);
    results.push({
      contactId: contact.id,
      contactName: contact.name,
      message,
      ...result,
    });
  }

  return results;
}

/**
 * Check if Twilio is configured
 * @returns {boolean}
 */
export function isConfigured() {
  return twilioConfig.enabled;
}

/**
 * Format ETA for display
 * @param {Date} eta - Estimated arrival time
 * @returns {string} Formatted time string
 */
export function formatETA(eta) {
  if (!eta) return 'unknown';

  const date = new Date(eta);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format location for display (coordinates to approximate area)
 * @param {number} lat
 * @param {number} lng
 * @param {string} [address] - Optional address if available
 * @returns {string}
 */
export function formatLocation(lat, lng, address = null) {
  if (address) {
    // Shorten address for SMS
    const parts = address.split(',');
    return parts.slice(0, 2).join(',').trim();
  }

  // Fallback to coordinates (rounded for privacy)
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export default {
  sendSMS,
  sendToContacts,
  formatMessage,
  formatETA,
  formatLocation,
  isConfigured,
};
