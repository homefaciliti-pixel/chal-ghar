const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const { ok } = require('../utils/http');

// GET /api/meta/languages
router.get('/languages', (req, res) =>
  ok(res, {
    languages: [
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'हिन्दी' },
      { code: 'as', name: 'অসমীয়া' }
    ]
  })
);

// GET /api/meta/cancel-reasons
router.get('/cancel-reasons', auth, (req, res) =>
  ok(res, {
    reasons: [
      { reason_id: 'cr_01', text: 'Driver is taking too long' },
      { reason_id: 'cr_02', text: 'Changed my plan' },
      { reason_id: 'cr_03', text: 'Booked by mistake' },
      { reason_id: 'cr_04', text: 'Driver asked to cancel' },
      { reason_id: 'cr_05', text: 'Other' }
    ]
  })
);

// GET /api/meta/privacy-policy
router.get('/privacy-policy', (req, res) => {
  return ok(res, {
    title: 'Privacy Policy',
    app_name: 'Chal Ghar / NE CAB',
    last_updated: '2026-10-28',
    url: 'https://chal-ghar.onrender.com/privacy-policy',
    contact_email: 'support@chalghar.com',
    sections: [
      {
        heading: '1. Information We Collect',
        content:
          'We collect information you provide directly to us when creating an account, updating your profile, booking rides, or contacting customer support. This includes your name, mobile number, email address, profile photo, and location data.'
      },
      {
        heading: '2. Location Information',
        content:
          'To provide ride-hailing services, enable pickup/drop navigation, fare estimation, and driver dispatch, we collect real-time geolocation data from your device with your permission.'
      },
      {
        heading: '3. How We Use Your Information',
        content:
          'Your information is used to match you with nearby drivers, process rides, calculate accurate fares, facilitate payments, send transaction notifications, and provide emergency SOS assistance.'
      },
      {
        heading: '4. Information Sharing & Disclosure',
        content:
          'When you request a ride, your pickup and drop location, first name, and rating are shared with the assigned driver. In case of an SOS alert, your live location is transmitted to your designated emergency contacts.'
      },
      {
        heading: '5. Data Security & Retention',
        content:
          'We implement industry-standard encryption and security measures. You can request account deletion at any time via Profile Settings, which removes or anonymizes your personal information.'
      },
      {
        heading: '6. Contact Us',
        content:
          'If you have any questions or concerns about this Privacy Policy, please reach out to us at support@chalghar.com.'
      }
    ]
  });
});

// GET /api/meta/terms
router.get('/terms', (req, res) => {
  return ok(res, {
    title: 'Terms and Conditions',
    app_name: 'Chal Ghar / NE CAB',
    last_updated: '2026-10-28',
    url: 'https://chal-ghar.onrender.com/terms',
    contact_email: 'support@chalghar.com',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        content:
          'By creating an account or using our cab booking services, you agree to comply with and be bound by these terms.'
      },
      {
        heading: '2. User Accounts',
        content:
          'You are responsible for safeguarding your login credentials and maintaining the accuracy of your profile information.'
      },
      {
        heading: '3. Booking and Cancellation',
        content:
          'Fares are calculated based on distance, time, and vehicle tier. Cancellations made after driver arrival may incur a nominal cancellation fee.'
      },
      {
        heading: '4. Code of Conduct',
        content:
          'Users and drivers must treat each other with respect. Unlawful behavior or harassment will result in immediate account suspension.'
      }
    ]
  });
});

module.exports = router;
