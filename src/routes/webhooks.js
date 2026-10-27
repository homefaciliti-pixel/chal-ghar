const router = require('express').Router();
const crypto = require('crypto');
const db = require('../config/db');
const { ok, fail, asyncHandler } = require('../utils/http');

const mockMode = process.env.MOCK_MODE === 'true';

// Set of processed webhook event IDs to prevent duplicate actions (idempotency)
const processedEvents = new Set();

// POST /api/webhooks/razorpay
router.post(
  '/razorpay',
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn('RAZORPAY_WEBHOOK_SECRET not configured. Skipping signature check.');
    } else {
      if (!signature) {
        return fail(res, 400, 'Missing x-razorpay-signature header', 'MISSING_SIGNATURE');
      }

      // Verify signature using rawBody if available, or JSON stringified body
      const payload = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      if (expectedSignature !== signature) {
        return fail(res, 400, 'Invalid webhook signature', 'INVALID_SIGNATURE');
      }
    }

    const { event, payload, id: eventId } = req.body || {};

    if (!event) {
      return fail(res, 400, 'Missing webhook event type', 'INVALID_EVENT');
    }

    // Idempotency check: prevent duplicate event processing
    if (eventId && processedEvents.has(eventId)) {
      return ok(res, { processed: true, duplicate: true }, 'Event already processed');
    }
    if (eventId) {
      processedEvents.add(eventId);
      if (processedEvents.size > 2000) {
        // Prune older events
        const first = processedEvents.values().next().value;
        processedEvents.delete(first);
      }
    }

    console.log(`Processing Webhook Event: ${event} [${eventId || 'no-id'}]`);

    switch (event) {
      case 'payment.captured': {
        const payment = payload?.payment?.entity;
        if (payment) {
          const notes = payment.notes || {};
          const rideId = notes.ride_id;
          const topupUserId = notes.user_id;

          if (!mockMode && rideId) {
            await db.query(
              "UPDATE rides SET payment_status = 'PAID', updated_at = UTC_TIMESTAMP() WHERE ride_id = ?",
              [rideId]
            );
          }
        }
        break;
      }

      case 'payment.failed': {
        const payment = payload?.payment?.entity;
        if (payment && !mockMode && payment.notes?.ride_id) {
          await db.query(
            "UPDATE rides SET payment_status = 'FAILED', updated_at = UTC_TIMESTAMP() WHERE ride_id = ?",
            [payment.notes.ride_id]
          );
        }
        break;
      }

      default:
        // Acknowledge other events gracefully
        break;
    }

    return ok(res, { received: true, event }, 'Webhook processed successfully');
  })
);

module.exports = router;
