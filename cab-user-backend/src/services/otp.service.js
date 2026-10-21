
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { id } = require('../utils/http');

const mockMode = process.env.MOCK_MODE === 'true';

// Temporary storage: development only.
const mockSessions = new Map();

const hash = (value) => bcrypt.hash(String(value), 10);
const compare = (value, hashed) =>
  bcrypt.compare(String(value), hashed);

async function sendOtp(mobile, purpose) {
  const ttl = Number(process.env.OTP_TTL_SECONDS || 300);
  const resend = Number(process.env.OTP_RESEND_SECONDS || 30);

  const code =
    process.env.OTP_DEV_FIXED_CODE ||
    String(crypto.randomInt(1000, 10000));

  const sessionId = id('otp_sess');

  if (mockMode) {
    mockSessions.set(sessionId, {
      session_id: sessionId,
      mobile_number: mobile,
      purpose,
      otp_hash: await hash(code),
      expires_at: new Date(Date.now() + ttl * 1000),
      verified: false,
      attempts: 0,
      verification_token_hash: null,
    });

    console.log(`[DEV OTP] ${purpose} ${mobile}: ${code}`);

    return {
      otp_session_id: sessionId,
      otp_expires_in: ttl,
      resend_after: resend,
      ...(process.env.NODE_ENV !== 'production'
        ? { dev_otp: code }
        : {}),
    };
  }

  if (process.env.OTP_DEV_MODE !== 'true') {
    throw Object.assign(
      new Error('SMS provider is not configured'),
      {
        status: 503,
        code: 'SMS_PROVIDER_NOT_CONFIGURED',
      }
    );
  }

  const otpHash = await hash(code);

  await db.query(
    `INSERT INTO otp_sessions
    (session_id, mobile_number, purpose, otp_hash,
     expires_at, resend_after)
    VALUES (?, ?, ?, ?,
      DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
      DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))`,
    [sessionId, mobile, purpose, otpHash, ttl, resend]
  );

  console.log(`[DEV OTP] ${purpose} ${mobile}: ${code}`);

  return {
    otp_session_id: sessionId,
    otp_expires_in: ttl,
    resend_after: resend,
  };
}

async function verifyOtp(sessionId, mobile, purpose, code) {
  if (mockMode) {
    const session = mockSessions.get(sessionId);

    if (
      !session ||
      session.mobile_number !== mobile ||
      session.purpose !== purpose
    ) {
      throw Object.assign(new Error('OTP session not found'), {
        status: 400,
        code: 'OTP_SESSION_NOT_FOUND',
      });
    }

    if (session.verified) {
      throw Object.assign(new Error('OTP already used'), {
        status: 400,
        code: 'OTP_ALREADY_USED',
      });
    }

    if (session.expires_at.getTime() < Date.now()) {
      throw Object.assign(new Error('OTP expired'), {
        status: 400,
        code: 'OTP_EXPIRED',
      });
    }

    if (session.attempts >= 5) {
      throw Object.assign(new Error('Too many OTP attempts'), {
        status: 429,
        code: 'OTP_ATTEMPTS_EXCEEDED',
      });
    }

    if (!(await compare(code, session.otp_hash))) {
      session.attempts++;

      throw Object.assign(new Error('Invalid OTP'), {
        status: 400,
        code: 'INVALID_OTP',
      });
    }

    session.verified = true;
    return session;
  }

  const [rows] = await db.query(
    `SELECT * FROM otp_sessions
     WHERE session_id = ? AND mobile_number = ? AND purpose = ?
     ORDER BY id DESC LIMIT 1`,
    [sessionId, mobile, purpose]
  );

  if (!rows.length) {
    throw Object.assign(new Error('OTP session not found'), {
      status: 400,
      code: 'OTP_SESSION_NOT_FOUND',
    });
  }

  const row = rows[0];

  if (row.verified) {
    throw Object.assign(new Error('OTP already used'), {
      status: 400,
      code: 'OTP_ALREADY_USED',
    });
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error('OTP expired'), {
      status: 400,
      code: 'OTP_EXPIRED',
    });
  }

  if (row.attempts >= 5) {
    throw Object.assign(new Error('Too many OTP attempts'), {
      status: 429,
      code: 'OTP_ATTEMPTS_EXCEEDED',
    });
  }

  if (!(await compare(code, row.otp_hash))) {
    await db.query(
      'UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = ?',
      [row.id]
    );

    throw Object.assign(new Error('Invalid OTP'), {
      status: 400,
      code: 'INVALID_OTP',
    });
  }

  await db.query(
    'UPDATE otp_sessions SET verified = TRUE WHERE id = ?',
    [row.id]
  );

  return row;
}

async function createVerificationToken(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');

  if (mockMode) {
    const session = mockSessions.get(sessionId);

    if (!session || !session.verified) {
      throw Object.assign(new Error('OTP not verified'), {
        status: 400,
        code: 'OTP_NOT_VERIFIED',
      });
    }

    session.verification_token_hash = await hash(token);
    session.expires_at = new Date(Date.now() + 30 * 60 * 1000);

    return token;
  }

  await db.query(
    `UPDATE otp_sessions
     SET verification_token_hash = ?,
         expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)
     WHERE session_id = ?`,
    [await hash(token), sessionId]
  );

  return token;
}

async function checkVerificationToken(token, mobile) {
  if (mockMode) {
    for (const session of mockSessions.values()) {
      if (
        session.mobile_number === mobile &&
        session.verified &&
        session.verification_token_hash &&
        session.expires_at.getTime() >= Date.now() &&
        await compare(token, session.verification_token_hash)
      ) {
        return session;
      }
    }

    return null;
  }

  const [rows] = await db.query(
    `SELECT * FROM otp_sessions
     WHERE mobile_number = ?
       AND verified = TRUE
       AND verification_token_hash IS NOT NULL
     ORDER BY id DESC LIMIT 10`,
    [mobile]
  );

  for (const row of rows) {
    if (await compare(token, row.verification_token_hash)) {
      return row;
    }
  }

  return null;
}

module.exports = {
  sendOtp,
  verifyOtp,
  createVerificationToken,
  checkVerificationToken,
};
