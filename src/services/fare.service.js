const db = require('../config/db');
const mockStore = require('./mock.store');
const { id } = require('../utils/http');

const mockMode = process.env.MOCK_MODE === 'true';

// Approximate distance using haversine formula
function haversineKm(aLat, aLng, bLat, bLng) {
  const r = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

async function estimate({ pickup, drop, vehicleTypeId }) {
  let vehicle;

  if (mockMode) {
    vehicle = mockStore.vehicleTypes.find(
      (v) =>
        v.vehicle_type_id === vehicleTypeId ||
        v.vehicle_type_id.toLowerCase() === (vehicleTypeId || '').toLowerCase()
    );
    if (!vehicle) {
      // Default fallback pricing if an unseeded vehicle type is passed
      vehicle = {
        vehicle_type_id: vehicleTypeId,
        base_fare: 40,
        per_km: 12
      };
    }
  } else {
    try {
      const [rows] = await db.query('SELECT * FROM vehicle_types WHERE vehicle_type_id=? AND is_available=TRUE', [vehicleTypeId]);
      if (rows && rows.length) {
        vehicle = rows[0];
      }
    } catch (dbErr) {
      console.warn('DB query in fare.service failed, falling back to mock vehicle types:', dbErr.message);
    }

    if (!vehicle) {
      vehicle = mockStore.vehicleTypes.find(
        (v) =>
          v.vehicle_type_id === vehicleTypeId ||
          v.vehicle_type_id.toLowerCase() === (vehicleTypeId || '').toLowerCase()
      );
    }

    if (!vehicle) {
      throw Object.assign(new Error('Vehicle type unavailable'), { status: 404, code: 'VEHICLE_NOT_FOUND' });
    }
  }

  const pLat = Number(pickup.latitude);
  const pLng = Number(pickup.longitude);
  const dLat = Number(drop.latitude);
  const dLng = Number(drop.longitude);

  const rawKm = haversineKm(pLat, pLng, dLat, dLng);
  // Add 25% road-factor multiplier over straight-line distance
  const km = Math.max(0.5, rawKm * 1.25);
  const baseFare = Number(vehicle.base_fare || 35);
  const perKm = Number(vehicle.per_km || 12);
  const fare = Math.max(baseFare, baseFare + km * perKm);

  return {
    estimate_id: id('est'),
    vehicle_type_id: vehicleTypeId,
    distance_km: Number(km.toFixed(2)),
    duration_minutes: Math.max(2, Math.ceil(km * 3)),
    estimated_fare: Number(fare.toFixed(2)),
    currency: 'INR',
    note: 'Indicative estimate only; configure route-based pricing before production.'
  };
}

module.exports = { estimate };
