const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let initialized = false;

function initFirebase() {
  if (initialized) return true;

  try {
    let serviceAccount;

    // 1. Try reading from FIREBASE_SERVICE_ACCOUNT environment variable (JSON string)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      // 2. Try reading from config file
      const configPath = path.join(__dirname, '../config/firebase-service-account.json');
      if (fs.existsSync(configPath)) {
        serviceAccount = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    }

    if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      initialized = true;
      console.log('Firebase Admin initialized successfully for project:', serviceAccount.project_id);
      return true;
    } else {
      console.warn('Firebase Service Account credentials not found. Push notifications will be simulated.');
      return false;
    }
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err.message);
    return false;
  }
}

/**
 * Send push notification to a single FCM device token
 */
async function sendToDevice(fcmToken, { title, body, data = {} }) {
  if (!fcmToken) return { success: false, error: 'No FCM token provided' };

  if (!initFirebase()) {
    return {
      success: true,
      simulated: true,
      message: 'Simulated delivery (Firebase SDK not configured or credentials missing)'
    };
  }

  const message = {
    token: fcmToken,
    notification: {
      title: title || 'Chal Ghar Notification',
      body: body || ''
    },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    ),
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'chal_ghar_alerts'
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default'
        }
      }
    }
  };

  try {
    const response = await admin.messaging().send(message);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('FCM send error:', error.message);
    return { success: false, error: error.message, code: error.code };
  }
}

/**
 * Send multicast notification to multiple tokens
 */
async function sendToMultipleDevices(tokens, { title, body, data = {} }) {
  if (!tokens || !tokens.length) return { success: false, error: 'No tokens provided' };

  if (!initFirebase()) {
    return {
      success: true,
      simulated: true,
      delivered_count: tokens.length
    };
  }

  const message = {
    tokens,
    notification: {
      title,
      body
    },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    )
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  initFirebase,
  sendToDevice,
  sendToMultipleDevices
};
