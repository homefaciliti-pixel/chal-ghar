const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const otp = require('../services/otp.service');
const mockStore = require('../services/mock.store');
const { ok, fail, id, asyncHandler } = require('../utils/http');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png'].includes(file.mimetype))
});

const mockMode = process.env.MOCK_MODE === 'true';

router.use(auth);

// GET /api/profile
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      let u = mockStore.getUserById(req.user.id);
      if (!u) {
        u = mockStore.createMockUser(req.user.mobile_number || '9876543210', req.user.name || 'Rahul Sharma');
      }
      return ok(res, {
        user_id: u.user_id,
        name: u.name,
        email: u.email || 'rahul@example.com',
        mobile_number: u.mobile_number,
        phone_verified: Boolean(u.phone_verified),
        gender: u.gender || 'Male',
        language: u.language || 'en',
        profile_photo_url: u.profile_photo_url || null,
        rating: u.rating || 4.9,
        referral_code: u.referral_code || 'NECAB50',
        created_at: u.created_at || new Date().toISOString(),
        wallet_balance: u.wallet_balance !== undefined ? u.wallet_balance : 250
      });
    }

    const [u] = await db.query(
      'SELECT user_id,name,email,mobile_number,phone_verified,gender,language,profile_photo_url,rating,referral_code,created_at FROM users WHERE id=?',
      [req.user.id]
    );
    if (!u.length) return fail(res, 404, 'User not found', 'USER_NOT_FOUND');
    const [[w]] = await db.query(
      'SELECT COALESCE((SELECT balance_after FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 1),0) balance',
      [req.user.id]
    );
    return ok(res, { ...u[0], wallet_balance: w ? w.balance : 0 });
  })
);

// PUT /api/profile
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const allowed = ['name', 'email', 'gender', 'language'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k] || null;
    }
    if (!Object.keys(updates).length) {
      return fail(res, 422, 'At least one editable field is required', 'VALIDATION_ERROR');
    }
    if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
      return fail(res, 422, 'Invalid email', 'VALIDATION_ERROR');
    }

    if (mockMode) {
      const updated = mockStore.updateUser(req.user.id, updates);
      return ok(
        res,
        {
          user_id: updated.user_id,
          name: updated.name,
          email: updated.email,
          mobile_number: updated.mobile_number,
          gender: updated.gender,
          language: updated.language,
          profile_photo_url: updated.profile_photo_url
        },
        'Profile updated'
      );
    }

    const sets = [],
      values = [];
    for (const [k, v] of Object.entries(updates)) {
      sets.push(`${k}=?`);
      values.push(v);
    }
    try {
      await db.query(`UPDATE users SET ${sets.join(',')} WHERE id=?`, [...values, req.user.id]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return fail(res, 409, 'Email already exists', 'EMAIL_ALREADY_EXISTS');
      throw e;
    }
    const [u] = await db.query(
      'SELECT user_id,name,email,mobile_number,gender,language,profile_photo_url FROM users WHERE id=?',
      [req.user.id]
    );
    return ok(res, u[0], 'Profile updated');
  })
);

// POST /api/profile/photo
router.post(
  '/photo',
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    if (!req.file) return fail(res, 400, 'JPG or PNG photo (max 5 MB) is required', 'INVALID_FILE_TYPE');
    if (mockMode) {
      const mockUrl = `https://chal-ghar.onrender.com/uploads/photo_${Date.now()}.jpg`;
      mockStore.updateUser(req.user.id, { profile_photo_url: mockUrl });
      return ok(res, { profile_photo_url: mockUrl }, 'Photo uploaded successfully');
    }
    return fail(res, 501, 'Connect S3/Cloudinary/object storage to persist the uploaded photo', 'PHOTO_STORAGE_NOT_CONFIGURED');
  })
);

// DELETE /api/profile/photo
router.delete(
  '/photo',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      mockStore.updateUser(req.user.id, { profile_photo_url: null });
      return ok(res, {}, 'Profile photo removed');
    }
    await db.query('UPDATE users SET profile_photo_url=NULL WHERE id=?', [req.user.id]);
    return ok(res, {}, 'Profile photo removed');
  })
);

// POST /api/profile/phone/send-otp
router.post(
  '/phone/send-otp',
  asyncHandler(async (req, res) => {
    const mobile = req.body.new_mobile_number;
    if (!mobile || !/^\+?[0-9]{10,15}$/.test(mobile)) {
      return fail(res, 422, 'Valid new_mobile_number is required', 'VALIDATION_ERROR');
    }
    if (mockMode) {
      return ok(res, await otp.sendOtp(mobile, 'CHANGE_PHONE'), 'OTP sent successfully');
    }
    const [u] = await db.query('SELECT id FROM users WHERE mobile_number=?', [mobile]);
    if (u.length) return fail(res, 409, 'Mobile number already exists', 'MOBILE_ALREADY_EXISTS');
    return ok(res, await otp.sendOtp(mobile, 'CHANGE_PHONE'), 'OTP sent successfully');
  })
);

// POST /api/profile/phone/verify-otp
router.post(
  '/phone/verify-otp',
  asyncHandler(async (req, res) => {
    const { new_mobile_number, mobile_number, otp_session_id, otp: code } = req.body;
    const target = new_mobile_number || mobile_number;
    if (!target || !otp_session_id || !code) {
      return fail(res, 422, 'new_mobile_number, otp_session_id and otp are required', 'VALIDATION_ERROR');
    }
    await otp.verifyOtp(otp_session_id, target, 'CHANGE_PHONE', code);
    if (mockMode) {
      mockStore.updateUser(req.user.id, { mobile_number: target, phone_verified: true });
      return ok(res, { mobile_number: target, phone_verified: true }, 'Phone number updated');
    }
    const [u] = await db.query('SELECT id FROM users WHERE mobile_number=?', [target]);
    if (u.length) return fail(res, 409, 'Mobile number already exists', 'MOBILE_ALREADY_EXISTS');
    await db.query('UPDATE users SET mobile_number=?,phone_verified=TRUE WHERE id=?', [target, req.user.id]);
    return ok(res, { mobile_number: target, phone_verified: true }, 'Phone number updated');
  })
);

// PATCH /api/profile/location
router.patch(
  '/location',
  asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      return fail(res, 422, 'latitude and longitude required', 'VALIDATION_ERROR');
    }
    if (mockMode) {
      mockStore.updateUser(req.user.id, { current_latitude: Number(latitude), current_longitude: Number(longitude) });
      return ok(
        res,
        {
          current_location: {
            latitude: Number(latitude),
            longitude: Number(longitude),
            address: null,
            updated_at: new Date().toISOString()
          }
        },
        'Location updated'
      );
    }
    await db.query('UPDATE users SET current_latitude=?,current_longitude=? WHERE id=?', [latitude, longitude, req.user.id]);
    return ok(
      res,
      {
        current_location: {
          latitude: Number(latitude),
          longitude: Number(longitude),
          address: null,
          updated_at: new Date().toISOString()
        }
      },
      'Location updated'
    );
  })
);

// POST /api/profile/delete-request/send-otp
router.post(
  '/delete-request/send-otp',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      const user = mockStore.getUserById(req.user.id);
      const mobile = user?.mobile_number || '9876543210';
      return ok(res, await otp.sendOtp(mobile, 'DELETE_ACCOUNT'), 'Account deletion OTP sent');
    }
    const [u] = await db.query('SELECT mobile_number FROM users WHERE id=?', [req.user.id]);
    return ok(res, await otp.sendOtp(u[0].mobile_number, 'DELETE_ACCOUNT'), 'Account deletion OTP sent');
  })
);

// POST /api/profile/delete-request
router.post(
  '/delete-request',
  asyncHandler(async (req, res) => {
    const { reason, otp_session_id, otp: code, mobile_number } = req.body;
    if (!reason || !otp_session_id || !code) {
      return fail(res, 422, 'reason, otp_session_id and otp are required', 'VALIDATION_ERROR');
    }
    if (mockMode) {
      const user = mockStore.getUserById(req.user.id);
      const mobile = mobile_number || user?.mobile_number || '9876543210';
      await otp.verifyOtp(otp_session_id, mobile, 'DELETE_ACCOUNT', code);
      const date = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);
      return ok(res, { status: 'SCHEDULED', deletion_date: date }, 'Account deletion scheduled');
    }
    const [u] = await db.query('SELECT mobile_number FROM users WHERE id=?', [req.user.id]);
    await otp.verifyOtp(otp_session_id, mobile_number || u[0].mobile_number, 'DELETE_ACCOUNT', code);
    const [active] = await db.query(
      "SELECT ride_id FROM rides WHERE user_id=? AND status IN ('SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVED','TRIP_STARTED','SCHEDULED') LIMIT 1",
      [req.user.id]
    );
    if (active.length) return fail(res, 409, 'Cannot delete account while an active ride exists', 'ACTIVE_RIDE_EXISTS');
    const date = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);
    await db.query("UPDATE users SET deletion_status='SCHEDULED',deletion_date=? WHERE id=?", [date, req.user.id]);
    return ok(res, { status: 'SCHEDULED', deletion_date: date }, 'Account deletion scheduled');
  })
);

module.exports = router;
