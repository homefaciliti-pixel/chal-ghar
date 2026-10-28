const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const mockStore = require('../services/mock.store');
const firebaseService = require('../services/firebase.service');
const { ok, fail, id, asyncHandler } = require('../utils/http');

const mockMode = process.env.MOCK_MODE === 'true';

// In-memory notifications store for mock mode
const mockNotifications = new Map();

// Helper to get or init notification list for a user
function getUserNotifications(userId) {
  const uid = Number(userId);
  if (!mockNotifications.has(uid)) {
    mockNotifications.set(uid, [
      {
        notification_id: 'notif_01',
        title: 'Welcome to Chal Ghar!',
        body: 'Book your first ride and get up to 50% discount with promo code NECAB50.',
        type: 'PROMO',
        data: { promo_code: 'NECAB50' },
        is_read: false,
        created_at: new Date(Date.now() - 3600000).toISOString()
      }
    ]);
  }
  return mockNotifications.get(uid);
}

// ==========================================
// 1. GET /api/notifications
// List user's notifications
// ==========================================
router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    if (mockMode) {
      const list = getUserNotifications(req.user.id);
      const unread = list.filter((n) => !n.is_read).length;
      return ok(
        res,
        {
          unread_count: unread,
          notifications: list
        },
        'Notifications fetched successfully'
      );
    }

    try {
      const [rows] = await db.query(
        'SELECT notification_id, title, body, type, data, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50',
        [req.user.id]
      );
      const [[{ unread }]] = await db.query(
        'SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND is_read = FALSE',
        [req.user.id]
      );

      return ok(res, {
        unread_count: unread,
        notifications: rows.map((r) => ({
          ...r,
          is_read: Boolean(r.is_read),
          data: r.data ? (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) : {}
        }))
      });
    } catch (e) {
      // If notifications table not created yet in DB
      return ok(res, {
        unread_count: 0,
        notifications: []
      });
    }
  })
);

// ==========================================
// 2. PATCH /api/notifications/mark-read
// Mark notifications as read
// ==========================================
router.patch(
  '/mark-read',
  auth,
  asyncHandler(async (req, res) => {
    const { notification_id, mark_all = false } = req.body || {};

    if (mockMode) {
      const list = getUserNotifications(req.user.id);
      if (mark_all) {
        list.forEach((n) => (n.is_read = true));
      } else if (notification_id) {
        const item = list.find((n) => n.notification_id === notification_id);
        if (item) item.is_read = true;
      }
      return ok(res, { success: true }, 'Notifications marked as read');
    }

    try {
      if (mark_all) {
        await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id]);
      } else if (notification_id) {
        await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND notification_id = ?', [
          req.user.id,
          notification_id
        ]);
      }
    } catch (e) {
      // ignore table missing
    }

    return ok(res, { success: true }, 'Notifications marked as read');
  })
);

// ==========================================
// 3. POST /api/notifications/send-test
// Send a test push notification to the logged-in user via Firebase
// ==========================================
router.post(
  '/send-test',
  auth,
  asyncHandler(async (req, res) => {
    const { title = 'Chal Ghar Test Notification', body = 'Your push notifications are working perfectly! 🚕', data = {} } =
      req.body || {};

    let targetFcm = req.user.fcm_token;

    if (!targetFcm) {
      if (mockMode) {
        const u = mockStore.getUserById(req.user.id);
        targetFcm = u?.fcm_token;
      } else {
        const [users] = await db.query('SELECT fcm_token FROM users WHERE id = ?', [req.user.id]);
        targetFcm = users[0]?.fcm_token;
      }
    }

    if (!targetFcm) {
      return fail(
        res,
        400,
        'No FCM token registered for this user. Please call /api/profile/fcm-token or login with fcm_token first.',
        'FCM_TOKEN_NOT_FOUND'
      );
    }

    const result = await firebaseService.sendToDevice(targetFcm, {
      title,
      body,
      data: {
        type: 'TEST_ALERT',
        timestamp: new Date().toISOString(),
        ...data
      }
    });

    // Also save in user's in-app notification inbox
    const notifItem = {
      notification_id: id('notif'),
      title,
      body,
      type: 'ALERT',
      data,
      is_read: false,
      created_at: new Date().toISOString()
    };

    if (mockMode) {
      getUserNotifications(req.user.id).unshift(notifItem);
    } else {
      try {
        await db.query(
          'INSERT INTO notifications (notification_id, user_id, title, body, type, data) VALUES (?, ?, ?, ?, ?, ?)',
          [notifItem.notification_id, req.user.id, title, body, 'ALERT', JSON.stringify(data)]
        );
      } catch (e) {}
    }

    return ok(
      res,
      {
        delivery_result: result,
        notification: notifItem
      },
      result.success ? 'Push notification dispatched' : 'Notification dispatch failed'
    );
  })
);

// ==========================================
// 4. POST /api/notifications/send-to-token
// Direct dispatch to any FCM token
// ==========================================
router.post(
  '/send-to-token',
  asyncHandler(async (req, res) => {
    const { fcm_token, title, body, data = {} } = req.body || {};

    if (!fcm_token || !title || !body) {
      return fail(res, 422, 'fcm_token, title and body are required', 'VALIDATION_ERROR');
    }

    const result = await firebaseService.sendToDevice(fcm_token, {
      title,
      body,
      data
    });

    return ok(res, result, result.success ? 'Notification sent successfully' : 'Failed to send notification');
  })
);

module.exports = router;
