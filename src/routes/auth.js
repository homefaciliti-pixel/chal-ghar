
require('dotenv').config();

const router = require('express').Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const otpService = require('../services/otp.service');
const auth = require('../middleware/auth');
const { ok, fail, id, asyncHandler } = require('../utils/http');

const mockStore = require('../services/mock.store');

const mockMode = process.env.MOCK_MODE === 'true';

const validMobile = (value) =>
  typeof value === 'string' &&
  /^\+?[0-9]{10,15}$/.test(value);

const validEmail = (value) =>
  typeof value === 'string' &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Calculate token_expires_in in seconds from JWT_EXPIRES_IN env var
function jwtExpirySeconds() {
  const raw = process.env.JWT_EXPIRES_IN || '365d';
  if (/^\d+$/.test(raw)) return Number(raw);
  const units = { s: 1, m: 60, h: 3600, d: 86400, y: 31536000 };
  const match = raw.match(/^(\d+)([smhdy])$/);
  return match ? Number(match[1]) * (units[match[2]] || 31536000) : 31536000;
}

const tokenFor = (user) => {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === 'replace_with_a_long_random_secret'
  ) {
    throw new Error('Set a strong JWT_SECRET in .env');
  }

  // Token valid for 100 years so it practically never expires
  return jwt.sign(
    {
      sub: user.id,
      user_id: user.user_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '36500d' }
  );
};

function findMockUser(mobile) {
  return mockStore.getUserByMobile(mobile);
}

function createMockUser(mobile, name = 'Test User', extra = {}) {
  return mockStore.createMockUser(mobile, name, extra);
}

// ==========================================
// LOGIN: SEND OTP
// POST /api/auth/login/send-otp
// ==========================================

router.post(
  '/login/send-otp',
  asyncHandler(async (req, res) => {
    const { mobile_number } = req.body || {};

    if (!validMobile(mobile_number)) {
      return fail(
        res, 422,
        'Valid mobile_number is required',
        'VALIDATION_ERROR'
      );
    }

    if (mockMode) {
      // Do NOT auto-create user — login requires prior registration
      if (!findMockUser(mobile_number)) {
        return fail(
          res, 404,
          'Mobile number is not registered. Please register first.',
          'USER_NOT_FOUND'
        );
      }

      // Reject login for deleted/inactive accounts
      const existingUser = findMockUser(mobile_number);
      if (existingUser && !existingUser.is_active) {
        return fail(
          res, 403,
          'This account has been deleted. Please register again.',
          'ACCOUNT_DELETED'
        );
      }

      const result = await otpService.sendOtp(
        mobile_number,
        'LOGIN'
      );

      return ok(res, result, 'Development OTP sent');
    }

    const [users] = await db.query(
      `SELECT id, is_active, deletion_status FROM users
       WHERE mobile_number = ?
       LIMIT 1`,
      [mobile_number]
    );

    if (!users.length) {
      return fail(
        res, 404,
        'Mobile number is not registered. Please register first.',
        'USER_NOT_FOUND'
      );
    }

    if (!users[0].is_active || users[0].deletion_status === 'COMPLETED') {
      return fail(
        res, 403,
        'This account has been deleted. Please register again.',
        'ACCOUNT_DELETED'
      );
    }

    const result = await otpService.sendOtp(
      mobile_number,
      'LOGIN'
    );

    return ok(res, result, 'OTP sent successfully');
  })
);

// ==========================================
// LOGIN: VERIFY OTP
// POST /api/auth/login/verify-otp
// ==========================================

router.post(
  '/login/verify-otp',
  asyncHandler(async (req, res) => {
    const {
      mobile_number,
      otp_session_id,
      otp: code,
      fcm_token,
    } = req.body || {};

    if (
      !validMobile(mobile_number) ||
      !otp_session_id ||
      !code
    ) {
      return fail(
        res, 422,
        'mobile_number, otp_session_id and otp are required',
        'VALIDATION_ERROR'
      );
    }

    await otpService.verifyOtp(
      otp_session_id,
      mobile_number,
      'LOGIN',
      code
    );

    let user;

    if (mockMode) {
      user = findMockUser(mobile_number);

      if (!user) {
        return fail(
          res, 404,
          'User not found. Please register first.',
          'USER_NOT_FOUND'
        );
      }

      if (!user.is_active) {
        return fail(
          res, 403,
          'This account has been deleted.',
          'ACCOUNT_DELETED'
        );
      }

      if (fcm_token) {
        user.fcm_token = fcm_token.trim();
      }
    } else {
      const [users] = await db.query(
        `SELECT * FROM users
         WHERE mobile_number = ? AND is_active = TRUE
         LIMIT 1`,
        [mobile_number]
      );

      if (!users.length) {
        return fail(
          res, 404,
          'User not found or account is inactive.',
          'USER_NOT_FOUND'
        );
      }

      user = users[0];

      if (fcm_token) {
        try {
          await db.query('UPDATE users SET fcm_token = ? WHERE id = ?', [fcm_token.trim(), user.id]);
          user.fcm_token = fcm_token.trim();
        } catch (e) {
          // ignore column missing
        }
      }
    }

    const access_token = tokenFor(user);

    return ok(
      res,
      {
        user_id: user.user_id,
        name: user.name,
        mobile_number: user.mobile_number,
        profile_completed: Boolean(user.profile_completed),
        access_token,
        token_expires_in: jwtExpirySeconds(),
      },
      'Login successful'
    );
  })
);

// ==========================================
// REGISTER: SEND OTP
// POST /api/auth/register/send-otp
// ==========================================

router.post(
  '/register/send-otp',
  asyncHandler(async (req, res) => {
    const { mobile_number } = req.body || {};

    if (!validMobile(mobile_number)) {
      return fail(
        res, 422,
        'Valid mobile_number is required',
        'VALIDATION_ERROR'
      );
    }

    if (mockMode) {
      const existing = findMockUser(mobile_number);
      if (existing && existing.is_active) {
        return fail(
          res, 409,
          'Mobile number already registered',
          'MOBILE_ALREADY_EXISTS'
        );
      }

      const result = await otpService.sendOtp(
        mobile_number,
        'REGISTER'
      );

      return ok(res, result, 'Development OTP sent');
    }

    const [users] = await db.query(
      'SELECT id FROM users WHERE mobile_number = ? AND is_active = TRUE LIMIT 1',
      [mobile_number]
    );

    if (users.length) {
      return fail(
        res, 409,
        'Mobile number already registered',
        'MOBILE_ALREADY_EXISTS'
      );
    }

    const result = await otpService.sendOtp(
      mobile_number,
      'REGISTER'
    );

    return ok(res, result, 'OTP sent successfully');
  })
);

// ==========================================
// REGISTER: VERIFY OTP
// POST /api/auth/register/verify-otp
// ==========================================

router.post(
  '/register/verify-otp',
  asyncHandler(async (req, res) => {
    const {
      mobile_number,
      otp_session_id,
      otp: code,
    } = req.body || {};

    if (
      !validMobile(mobile_number) ||
      !otp_session_id ||
      !code
    ) {
      return fail(
        res, 422,
        'mobile_number, otp_session_id and otp are required',
        'VALIDATION_ERROR'
      );
    }

    await otpService.verifyOtp(
      otp_session_id,
      mobile_number,
      'REGISTER',
      code
    );

    const verificationToken =
      await otpService.createVerificationToken(otp_session_id);

    return ok(
      res,
      {
        token: verificationToken,
        verification_token_expires_in: 1800,
      },
      'Phone verified'
    );
  })
);

// ==========================================
// REGISTER USER
// POST /api/auth/register
// ==========================================

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const {
      token,
      mobile_number,
      name,
      email,
      gender,
      referral_code,
      terms_accepted,
      fcm_token,
    } = req.body || {};

    // Validate required fields
    if (!token || !mobile_number || !name || terms_accepted !== true) {
      return fail(
        res, 422,
        'token, mobile_number, name and terms_accepted=true are required',
        'VALIDATION_ERROR'
      );
    }

    if (!validMobile(mobile_number) || !name.trim()) {
      return fail(
        res, 422,
        'Valid mobile number and name are required',
        'VALIDATION_ERROR'
      );
    }

    if (email && !validEmail(email)) {
      return fail(
        res, 422,
        'Invalid email address format',
        'VALIDATION_ERROR'
      );
    }

    if (name.trim().length < 2 || name.trim().length > 120) {
      return fail(
        res, 422,
        'Name must be between 2 and 120 characters',
        'VALIDATION_ERROR'
      );
    }

    const session = await otpService.checkVerificationToken(
      token,
      mobile_number
    );

    if (
      !session ||
      session.purpose !== 'REGISTER' ||
      new Date(session.expires_at).getTime() < Date.now()
    ) {
      return fail(
        res, 401,
        'Invalid or expired verification token. Please verify your OTP again.',
        'INVALID_VERIFICATION_TOKEN'
      );
    }

    let user;

    if (mockMode) {
      const existing = findMockUser(mobile_number);
      if (existing && existing.is_active) {
        return fail(
          res, 409,
          'Mobile number already registered',
          'MOBILE_ALREADY_EXISTS'
        );
      }

      // Check email uniqueness in mock store
      if (email) {
        const emailConflict = mockStore.getUserByEmail(email);
        if (emailConflict && emailConflict.is_active) {
          return fail(
            res, 409,
            'Email address is already registered',
            'EMAIL_ALREADY_EXISTS'
          );
        }
      }

      user = createMockUser(mobile_number, name.trim(), {
        email: email || null,
        gender: gender || null,
        fcm_token: fcm_token || null,
      });
      user.email = email || null;
      user.gender = gender || null;
      user.fcm_token = fcm_token || null;
      user.referral_code = id('ref').slice(0, 12).toUpperCase();
      user.referred_by = referral_code || null;
      user.profile_completed = true;
      user.terms_accepted = true;
    } else {
      const [existingMobile] = await db.query(
        'SELECT id FROM users WHERE mobile_number = ? AND is_active = TRUE LIMIT 1',
        [mobile_number]
      );

      if (existingMobile.length) {
        return fail(
          res, 409,
          'Mobile number already registered',
          'MOBILE_ALREADY_EXISTS'
        );
      }

      // Check email uniqueness
      if (email) {
        const [existingEmail] = await db.query(
          'SELECT id FROM users WHERE email = ? AND is_active = TRUE LIMIT 1',
          [email]
        );
        if (existingEmail.length) {
          return fail(
            res, 409,
            'Email address is already registered',
            'EMAIL_ALREADY_EXISTS'
          );
        }
      }

      const userId = id('usr');
      const referral = id('ref').slice(0, 12).toUpperCase();

      const [result] = await db.query(
        `INSERT INTO users (
          user_id, name, mobile_number, email, gender,
          phone_verified, profile_completed, referral_code,
          referred_by, terms_accepted
        ) VALUES (?, ?, ?, ?, ?, TRUE, TRUE, ?, ?, TRUE)`,
        [
          userId,
          name.trim(),
          mobile_number,
          email || null,
          gender || null,
          referral,
          referral_code || null,
        ]
      );

      user = {
        id: result.insertId,
        user_id: userId,
      };

      // Consume the verification token
      await db.query(
        `UPDATE otp_sessions
         SET verification_token_hash = NULL
         WHERE session_id = ?`,
        [session.session_id]
      );
    }

    const access_token = tokenFor(user);

    return ok(
      res,
      {
        user_id: user.user_id,
        access_token,
        token_expires_in: jwtExpirySeconds(),
      },
      'Registration successful',
      201
    );
  })
);

// ==========================================
// LOGOUT
// POST /api/auth/logout
// ==========================================

router.post(
  '/logout',
  auth,
  asyncHandler(async (req, res) => {
    // For stateless JWTs, instruct client to discard the token.
    // If token blacklisting is needed, store token jti in Redis/DB here.
    return ok(res, {}, 'Logout successful. Please discard your access token.');
  })
);

module.exports = router;
