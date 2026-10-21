
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

const tokenFor = (user) => {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === 'replace_with_a_long_random_secret'
  ) {
    throw new Error('Set a strong JWT_SECRET in .env');
  }

  return jwt.sign(
    {
      sub: user.id,
      user_id: user.user_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
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
      // Create a temporary test user if one does not exist.
      if (!findMockUser(mobile_number)) {
        createMockUser(mobile_number);
      }

      const result = await otpService.sendOtp(
        mobile_number,
        'LOGIN'
      );

      return ok(res, result, 'Development OTP sent');
    }

    const [users] = await db.query(
      `SELECT id FROM users
       WHERE mobile_number = ? AND is_active = TRUE
       LIMIT 1`,
      [mobile_number]
    );

    if (!users.length) {
      return fail(
        res, 404,
        'Mobile number is not registered',
        'USER_NOT_FOUND'
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
          'Test user not found. Send OTP again.',
          'USER_NOT_FOUND'
        );
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
          'User not found',
          'USER_NOT_FOUND'
        );
      }

      user = users[0];
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
        token_expires_in: 3600,
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
      if (findMockUser(mobile_number)) {
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
      'SELECT id FROM users WHERE mobile_number = ? LIMIT 1',
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
    } = req.body || {};

    if (
      !token ||
      !mobile_number ||
      !name ||
      terms_accepted !== true
    ) {
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
        'Invalid or expired verification token',
        'INVALID_VERIFICATION_TOKEN'
      );
    }

    let user;

    if (mockMode) {
      if (findMockUser(mobile_number)) {
        return fail(
          res, 409,
          'Mobile number already registered',
          'MOBILE_ALREADY_EXISTS'
        );
      }

      user = createMockUser(mobile_number, name.trim());
      user.email = email || null;
      user.gender = gender || null;
      user.referral_code = id('ref').slice(0, 12).toUpperCase();
      user.referred_by = referral_code || null;
      user.profile_completed = true;
    } else {
      const [existing] = await db.query(
        'SELECT id FROM users WHERE mobile_number = ? LIMIT 1',
        [mobile_number]
      );

      if (existing.length) {
        return fail(
          res, 409,
          'Mobile number already registered',
          'MOBILE_ALREADY_EXISTS'
        );
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

      // Consume the verification token.
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
        token_expires_in: 3600,
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
    return ok(res, {}, 'Logout successful');
  })
);

module.exports = router;
