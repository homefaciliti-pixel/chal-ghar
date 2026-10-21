
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { fail } = require('../utils/http');

const mockMode = process.env.MOCK_MODE === 'true';

module.exports = async function auth(req, res, next) {
  try {
    // 1. Read Bearer token
    const authorization = req.headers.authorization || '';

    if (!authorization.startsWith('Bearer ')) {
      return fail(
        res,
        401,
        'Authentication token required',
        'AUTH_REQUIRED'
      );
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return fail(
        res,
        401,
        'Authentication token required',
        'AUTH_REQUIRED'
      );
    }

    // 2. Check JWT configuration
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is missing in .env');

      return fail(
        res,
        500,
        'JWT configuration is missing',
        'JWT_CONFIG_ERROR'
      );
    }

    // 3. Verify JWT signature and expiration
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (!payload.sub || !payload.user_id) {
      return fail(
        res,
        401,
        'Invalid token payload',
        'INVALID_TOKEN'
      );
    }

    // 4. Mock authentication for local development only
    if (mockMode) {
      req.user = {
        id: payload.sub,
        user_id: payload.user_id,
        mobile_number: null,
        is_active: true,
      };

      return next();
    }

    // 5. Normal database-backed authentication
    const [users] = await db.query(
      `SELECT id, user_id, mobile_number, is_active
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [payload.sub]
    );

    if (!users.length || !users[0].is_active) {
      return fail(
        res,
        401,
        'User not found or inactive',
        'INVALID_TOKEN'
      );
    }

    req.user = users[0];

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return fail(
        res,
        401,
        'Token expired. Please log in again.',
        'TOKEN_EXPIRED'
      );
    }

    if (error.name === 'JsonWebTokenError') {
      return fail(
        res,
        401,
        'Invalid token. Please log in again.',
        'INVALID_TOKEN'
      );
    }

    console.error('Auth middleware error:', error.message);

    return fail(
      res,
      401,
      'Authentication failed',
      'INVALID_TOKEN'
    );
  }
};
