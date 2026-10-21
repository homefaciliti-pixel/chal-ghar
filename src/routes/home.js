const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const mockStore = require('../services/mock.store');
const { ok, fail, asyncHandler } = require('../utils/http');

const mockMode = process.env.MOCK_MODE === 'true';
const vehicleQuery = 'SELECT vehicle_type_id,name,icon_url,capacity,nearest_eta_minutes,is_available FROM vehicle_types ORDER BY id';

router.get(
  '/home',
  auth,
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat),
      lng = Number(req.query.long);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail(res, 422, 'lat and long are required', 'VALIDATION_ERROR');
    }

    if (mockMode) {
      const user = mockStore.getUserById(req.user.id);
      const latest = mockStore.getLatestRide(req.user.id);
      const active = mockStore.getActiveRide(req.user.id);
      const mapRide = (r) =>
        r
          ? {
              ride_id: r.ride_id,
              pickup: { address: r.pickup_address },
              drop: { address: r.drop_address },
              vehicle_type: r.vehicle_type_id,
              fare: r.final_fare ?? r.estimated_fare,
              status: r.status,
              created_at: r.created_at
            }
          : null;

      return ok(res, {
        location: { latitude: lat, longitude: lng, address: null, city_id: 'city_01', is_serviceable: true },
        vehicle_types: mockStore.vehicleTypes,
        banners: mockStore.banners,
        latest_ride: mapRide(latest),
        active_ride: active ? { ride_id: active.ride_id, status: active.status } : null,
        unread_notifications: 0,
        wallet_balance: user ? user.wallet_balance : 250
      });
    }

    const [v] = await db.query(vehicleQuery);
    const [city] = await db.query(
      'SELECT * FROM cities WHERE is_active=TRUE AND (min_lat IS NULL OR (? BETWEEN min_lat AND max_lat AND ? BETWEEN min_lng AND max_lng)) LIMIT 1',
      [lat, lng]
    );
    const cityId = city[0]?.city_id || null;
    const [b] = await db.query(
      'SELECT banner_id,image_url,title,redirect_type,redirect_value,sort_order FROM banners WHERE is_active=TRUE AND (city_id IS NULL OR city_id=?) AND (start_date IS NULL OR start_date<=UTC_TIMESTAMP()) AND (end_date IS NULL OR end_date>=UTC_TIMESTAMP()) ORDER BY sort_order',
      [cityId]
    );
    const [latest] = await db.query(
      "SELECT * FROM rides WHERE user_id=? AND status IN ('COMPLETED','CANCELLED_BY_USER','CANCELLED_BY_DRIVER') ORDER BY created_at DESC LIMIT 1",
      [req.user.id]
    );
    const [active] = await db.query(
      "SELECT ride_id,status FROM rides WHERE user_id=? AND status IN ('SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVED','TRIP_STARTED','SCHEDULED') ORDER BY created_at DESC LIMIT 1",
      [req.user.id]
    );
    const [wallet] = await db.query(
      'SELECT COALESCE((SELECT balance_after FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 1),0) AS balance',
      [req.user.id]
    );
    const [unread] = await db.query('SELECT 0 AS count');
    const mapRide = (r) =>
      r
        ? {
            ride_id: r.ride_id,
            pickup: { address: r.pickup_address },
            drop: { address: r.drop_address },
            vehicle_type: r.vehicle_type_id,
            fare: r.final_fare ?? r.estimated_fare,
            status: r.status,
            created_at: r.created_at
          }
        : null;

    return ok(res, {
      location: { latitude: lat, longitude: lng, address: null, city_id: cityId, is_serviceable: !!city.length },
      vehicle_types: v,
      banners: b,
      latest_ride: mapRide(latest[0]),
      active_ride: active[0] || null,
      unread_notifications: unread[0].count,
      wallet_balance: wallet[0].balance
    });
  })
);

router.get(
  '/location/serviceability',
  auth,
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat),
      lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail(res, 422, 'lat and lng are required', 'VALIDATION_ERROR');
    }

    if (mockMode) {
      return ok(res, {
        is_serviceable: true,
        city_id: 'city_01',
        city_name: 'Guwahati',
        message: null
      });
    }

    const [c] = await db.query(
      'SELECT city_id,city_name FROM cities WHERE is_active=TRUE AND min_lat IS NOT NULL AND ? BETWEEN min_lat AND max_lat AND ? BETWEEN min_lng AND max_lng LIMIT 1',
      [lat, lng]
    );
    return ok(res, {
      is_serviceable: !!c.length,
      city_id: c[0]?.city_id || null,
      city_name: c[0]?.city_name || null,
      message: c.length ? null : 'Service not available in this area yet'
    });
  })
);

router.get(
  '/banners',
  auth,
  asyncHandler(async (req, res) => {
    if (mockMode) {
      return ok(res, { banners: mockStore.banners });
    }

    const [b] = await db.query(
      'SELECT banner_id,image_url,title,redirect_type,redirect_value,sort_order FROM banners WHERE is_active=TRUE AND (city_id IS NULL OR city_id=?) AND (start_date IS NULL OR start_date<=UTC_TIMESTAMP()) AND (end_date IS NULL OR end_date>=UTC_TIMESTAMP()) ORDER BY sort_order',
      [req.query.city_id || null]
    );
    return ok(res, { banners: b });
  })
);

router.get(
  '/drivers/nearby',
  auth,
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat),
      lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail(res, 422, 'lat and lng are required', 'VALIDATION_ERROR');
    }

    if (mockMode) {
      let d = [...mockStore.drivers];
      if (req.query.vehicle_type_id) {
        d = d.filter((x) => x.vehicle_type_id === req.query.vehicle_type_id);
      }
      d.sort((a, b) => Math.hypot(a.latitude - lat, a.longitude - lng) - Math.hypot(b.latitude - lat, b.longitude - lng));
      return ok(res, { drivers: d });
    }

    const [d] = await db.query(
      'SELECT driver_id,latitude,longitude FROM drivers WHERE is_available=TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL AND (? IS NULL OR vehicle_type_id=?) LIMIT 10',
      [req.query.vehicle_type_id || null, req.query.vehicle_type_id || null]
    );
    d.sort((a, b) => Math.hypot(a.latitude - lat, a.longitude - lng) - Math.hypot(b.latitude - lat, b.longitude - lng));
    return ok(res, { drivers: d });
  })
);

router.get('/places/autocomplete', auth, async (req, res) =>
  ok(res, { places: [], message: 'Connect Google Places API/provider to enable autocomplete' })
);

module.exports = router;
