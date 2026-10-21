const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const mockStore = require('../services/mock.store');
const { ok, fail, id, asyncHandler } = require('../utils/http');

const mockMode = process.env.MOCK_MODE === 'true';
const addrFields = ['label', 'name', 'address', 'latitude', 'longitude'];

router.use(auth);

// GET /api/addresses
router.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      return ok(res, { addresses: mockStore.getSavedAddresses(req.user.id) });
    }
    const [rows] = await db.query(
      'SELECT address_id,label,name,address,latitude,longitude FROM saved_addresses WHERE user_id=? ORDER BY id DESC',
      [req.user.id]
    );
    return ok(res, { addresses: rows });
  })
);

// POST /api/addresses
router.post(
  '/addresses',
  asyncHandler(async (req, res) => {
    const { label = 'OTHER', name, address, latitude, longitude } = req.body;
    if (
      !name ||
      !address ||
      !Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude)) ||
      !['HOME', 'WORK', 'OTHER'].includes(label)
    ) {
      return fail(res, 422, 'Valid label, name, address, latitude and longitude are required', 'VALIDATION_ERROR');
    }

    if (mockMode) {
      const item = mockStore.addSavedAddress(req.user.id, { label, name, address, latitude, longitude });
      return ok(res, item, 'Address saved', 201);
    }

    const addressId = id('adr');
    await db.query(
      'INSERT INTO saved_addresses (address_id,user_id,label,name,address,latitude,longitude) VALUES (?,?,?,?,?,?,?)',
      [addressId, req.user.id, label, name, address, latitude, longitude]
    );
    return ok(
      res,
      { address_id: addressId, label, name, address, latitude: Number(latitude), longitude: Number(longitude) },
      'Address saved',
      201
    );
  })
);

// PUT /api/addresses/:address_id
router.put(
  '/addresses/:address_id',
  asyncHandler(async (req, res) => {
    const { label, name, address, latitude, longitude } = req.body;

    if (mockMode) {
      const updated = mockStore.updateSavedAddress(req.user.id, req.params.address_id, {
        label,
        name,
        address,
        latitude,
        longitude
      });
      if (!updated) return fail(res, 404, 'Address not found', 'ADDRESS_NOT_FOUND');
      return ok(res, { address_id: req.params.address_id }, 'Address updated');
    }

    const [old] = await db.query('SELECT id FROM saved_addresses WHERE address_id=? AND user_id=?', [
      req.params.address_id,
      req.user.id
    ]);
    if (!old.length) return fail(res, 404, 'Address not found', 'ADDRESS_NOT_FOUND');
    const fields = { label, name, address, latitude, longitude },
      sets = [],
      values = [];
    for (const k of addrFields) {
      if (fields[k] !== undefined) {
        sets.push(`${k}=?`);
        values.push(fields[k]);
      }
    }
    if (!sets.length) return fail(res, 422, 'No fields to update', 'VALIDATION_ERROR');
    await db.query(`UPDATE saved_addresses SET ${sets.join(',')} WHERE address_id=? AND user_id=?`, [
      ...values,
      req.params.address_id,
      req.user.id
    ]);
    return ok(res, { address_id: req.params.address_id }, 'Address updated');
  })
);

// DELETE /api/addresses/:address_id
router.delete(
  '/addresses/:address_id',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      const deleted = mockStore.deleteSavedAddress(req.user.id, req.params.address_id);
      if (!deleted) return fail(res, 404, 'Address not found', 'ADDRESS_NOT_FOUND');
      return ok(res, {}, 'Address deleted');
    }

    const [r] = await db.query('DELETE FROM saved_addresses WHERE address_id=? AND user_id=?', [
      req.params.address_id,
      req.user.id
    ]);
    if (!r.affectedRows) return fail(res, 404, 'Address not found', 'ADDRESS_NOT_FOUND');
    return ok(res, {}, 'Address deleted');
  })
);

// GET /api/promos
router.get(
  '/promos',
  asyncHandler(async (req, res) => {
    if (mockMode) {
      return ok(res, { promos: mockStore.promos });
    }

    const [rows] = await db.query(
      'SELECT code,title,description,discount_type,discount_value,max_discount,min_fare,valid_till,terms FROM promos WHERE is_active=TRUE AND (valid_till IS NULL OR valid_till>=UTC_TIMESTAMP()) AND (usage_limit IS NULL OR used_count<usage_limit) ORDER BY id DESC'
    );
    return ok(res, { promos: rows });
  })
);

// POST /api/promos/validate
router.post(
  '/promos/validate',
  asyncHandler(async (req, res) => {
    const { promo_code, estimate_id, vehicle_type_id, estimated_fare } = req.body;
    const fare = Number(estimated_fare);
    if (!promo_code || !Number.isFinite(fare) || fare < 0) {
      return fail(res, 422, 'promo_code and estimated_fare are required', 'VALIDATION_ERROR');
    }

    if (mockMode) {
      const p = mockStore.promos.find((x) => x.code === promo_code.toUpperCase());
      if (!p) return fail(res, 400, 'Invalid or expired promo', 'INVALID_PROMO');
      if (fare < Number(p.min_fare)) return fail(res, 400, 'Minimum fare condition not met', 'PROMO_MIN_FARE_NOT_MET');
      let discount = p.discount_type === 'FLAT' ? Number(p.discount_value) : (fare * Number(p.discount_value)) / 100;
      if (p.max_discount != null) discount = Math.min(discount, Number(p.max_discount));
      discount = Math.min(discount, fare);
      return ok(res, {
        valid: true,
        estimate_id: estimate_id || null,
        vehicle_type_id: vehicle_type_id || null,
        discount: Number(discount.toFixed(2)),
        payable: Number((fare - discount).toFixed(2))
      });
    }

    const [p] = await db.query(
      'SELECT * FROM promos WHERE code=? AND is_active=TRUE AND (valid_till IS NULL OR valid_till>=UTC_TIMESTAMP()) AND (usage_limit IS NULL OR used_count<usage_limit) LIMIT 1',
      [promo_code]
    );
    if (!p.length) return fail(res, 400, 'Invalid or expired promo', 'INVALID_PROMO');
    const x = p[0];
    if (fare < Number(x.min_fare)) return fail(res, 400, 'Minimum fare condition not met', 'PROMO_MIN_FARE_NOT_MET');
    let discount = x.discount_type === 'FLAT' ? Number(x.discount_value) : (fare * Number(x.discount_value)) / 100;
    if (x.max_discount != null) discount = Math.min(discount, Number(x.max_discount));
    discount = Math.min(discount, fare);
    return ok(res, {
      valid: true,
      estimate_id: estimate_id || null,
      vehicle_type_id: vehicle_type_id || null,
      discount: Number(discount.toFixed(2)),
      payable: Number((fare - discount).toFixed(2))
    });
  })
);

module.exports = router;
