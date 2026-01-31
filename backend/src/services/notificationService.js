/**
 * @fileoverview Notification Service
 * Coordinates sending notifications to emergency contacts for trips
 */

import { query } from '../db/connection.js';
import * as twilioService from './twilioService.js';

// ==============================================
// NOTIFICATION SENDING
// ==============================================

/**
 * Get user's emergency contacts
 * @param {number} userId
 * @returns {Promise<Array>}
 */
async function getUserContacts(userId) {
  const result = await query(
    `SELECT id, name, phone_number, relationship, is_primary
     FROM contacts WHERE user_id = $1 ORDER BY is_primary DESC, name`,
    [userId]
  );
  return result.rows;
}

/**
 * Send notifications to all contacts for a trip event
 * @param {number} tripId
 * @param {string} notificationType - 'trip_started', 'arrived', 'delayed', 'check_in', 'cancelled', 'sos'
 * @param {Object} messageData - Data for message template
 * @returns {Promise<{sent: number, failed: number, results: Array}>}
 */
export async function notifyContacts(tripId, notificationType, messageData) {
  // Get trip details
  const tripResult = await query('SELECT * FROM trips WHERE id = $1', [tripId]);
  const trip = tripResult.rows[0];

  if (!trip) {
    throw new Error(`Trip ${tripId} not found`);
  }

  // Get user's contacts
  const contacts = await getUserContacts(trip.user_id);

  if (contacts.length === 0) {
    console.log('[NotificationService] No contacts to notify for trip:', tripId);
    return { sent: 0, failed: 0, results: [] };
  }

  // Get user info for message
  const userResult = await query(
    'SELECT email, username FROM users WHERE id = $1',
    [trip.user_id]
  );
  const user = userResult.rows[0];
  const userName = user.username || user.email.split('@')[0];

  // Build message data
  const fullMessageData = {
    userName,
    destination: trip.destination_name || 'their destination',
    origin: trip.origin_name || 'their location',
    eta: twilioService.formatETA(trip.estimated_arrival),
    location: twilioService.formatLocation(
      trip.current_lat || trip.start_lat,
      trip.current_lng || trip.start_lng
    ),
    time: new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    ...messageData,
  };

  // Format message
  const message = twilioService.formatMessage(notificationType, fullMessageData);

  // Send to all contacts and log results
  const results = [];
  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    // Create notification record (pending)
    const notifResult = await query(
      `INSERT INTO trip_notifications
        (trip_id, contact_id, notification_type, delivery_status, message_content)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id`,
      [tripId, contact.id, notificationType, message]
    );
    const notificationId = notifResult.rows[0].id;

    // Send SMS
    const smsResult = await twilioService.sendSMS(contact.phone_number, message);

    // Update notification record with result
    if (smsResult.success) {
      await query(
        `UPDATE trip_notifications SET
          delivery_status = 'sent',
          twilio_sid = $2,
          sent_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [notificationId, smsResult.sid]
      );
      sent++;
    } else {
      await query(
        `UPDATE trip_notifications SET
          delivery_status = 'failed',
          error_message = $2
         WHERE id = $1`,
        [notificationId, smsResult.error]
      );
      failed++;
    }

    results.push({
      contactId: contact.id,
      contactName: contact.name,
      success: smsResult.success,
      sid: smsResult.sid,
      error: smsResult.error,
      simulated: smsResult.simulated,
    });
  }

  console.log(`[NotificationService] Trip ${tripId} ${notificationType}: sent ${sent}, failed ${failed}`);

  return { sent, failed, results };
}

/**
 * Get notification history for a trip
 * @param {number} tripId
 * @returns {Promise<Array>}
 */
export async function getTripNotifications(tripId) {
  const result = await query(
    `SELECT tn.*, c.name as contact_name, c.phone_number
     FROM trip_notifications tn
     JOIN contacts c ON tn.contact_id = c.id
     WHERE tn.trip_id = $1
     ORDER BY tn.created_at DESC`,
    [tripId]
  );
  return result.rows;
}

/**
 * Update notification delivery status (from Twilio webhook)
 * @param {string} twilioSid
 * @param {string} status - 'delivered' or 'failed'
 * @param {string} errorMessage - Optional error message
 */
export async function updateDeliveryStatus(twilioSid, status, errorMessage = null) {
  const deliveryStatus = status === 'delivered' ? 'delivered' : 'failed';

  await query(
    `UPDATE trip_notifications SET
      delivery_status = $2,
      delivered_at = CASE WHEN $2 = 'delivered' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
      error_message = COALESCE($3, error_message)
     WHERE twilio_sid = $1`,
    [twilioSid, deliveryStatus, errorMessage]
  );
}

// ==============================================
// CONVENIENCE FUNCTIONS
// ==============================================

/**
 * Send trip started notification
 */
export async function notifyTripStarted(tripId) {
  return notifyContacts(tripId, 'trip_started', {});
}

/**
 * Send arrived notification
 */
export async function notifyArrived(tripId) {
  return notifyContacts(tripId, 'arrived', {});
}

/**
 * Send delayed notification
 * @param {number} tripId
 * @param {number} minutesOver - Minutes past ETA
 */
export async function notifyDelayed(tripId, minutesOver) {
  return notifyContacts(tripId, 'delayed', { minutes: minutesOver });
}

/**
 * Send check-in notification
 */
export async function notifyCheckIn(tripId) {
  return notifyContacts(tripId, 'check_in', {});
}

/**
 * Send cancelled notification
 */
export async function notifyCancelled(tripId) {
  return notifyContacts(tripId, 'cancelled', {});
}

/**
 * Send SOS emergency notification
 */
export async function notifySOS(tripId) {
  return notifyContacts(tripId, 'sos', {});
}

/**
 * Send SOS without active trip (standalone emergency)
 * @param {number} userId
 * @param {number} lat
 * @param {number} lng
 */
export async function sendStandaloneSOS(userId, lat, lng) {
  const contacts = await getUserContacts(userId);

  if (contacts.length === 0) {
    return { sent: 0, failed: 0, results: [] };
  }

  // Get user info
  const userResult = await query(
    'SELECT email, username FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  const userName = user.username || user.email.split('@')[0];

  const messageData = {
    userName,
    location: twilioService.formatLocation(lat, lng),
    time: new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    destination: null,
  };

  const message = twilioService.formatMessage('sos', messageData);

  const results = [];
  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const smsResult = await twilioService.sendSMS(contact.phone_number, message);

    if (smsResult.success) {
      sent++;
    } else {
      failed++;
    }

    results.push({
      contactId: contact.id,
      contactName: contact.name,
      success: smsResult.success,
      error: smsResult.error,
    });
  }

  console.log(`[NotificationService] Standalone SOS for user ${userId}: sent ${sent}, failed ${failed}`);

  return { sent, failed, results };
}

export default {
  notifyContacts,
  getTripNotifications,
  updateDeliveryStatus,
  notifyTripStarted,
  notifyArrived,
  notifyDelayed,
  notifyCheckIn,
  notifyCancelled,
  notifySOS,
  sendStandaloneSOS,
};
