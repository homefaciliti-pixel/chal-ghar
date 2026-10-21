const db = require('../config/db');
const { id } = require('../utils/http');

// IMPORTANT: The provided PDF says fare is pending discussion.
// This estimate is a configurable placeholder, not a production fare quote.
function haversineKm(aLat, aLng, bLat, bLng) {
  const r = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;
  return 2 * r * Math.asin(Math.sqrt(a));
}
async function estimate({ pickup, drop, vehicleTypeId }) {
  const [rows] = await db.query('SELECT * FROM vehicle_types WHERE vehicle_type_id=? AND is_available=TRUE', [vehicleTypeId]);
  if (!rows.length) throw Object.assign(new Error('Vehicle type unavailable'), { status: 404, code: 'VEHICLE_NOT_FOUND' });
  const vehicle = rows[0];
  const km = haversineKm(Number(pickup.latitude), Number(pickup.longitude), Number(drop.latitude), Number(drop.longitude)) * 1.25;
  const fare = Math.max(Number(vehicle.base_fare), Number(vehicle.base_fare) + km * Number(vehicle.per_km));
  return { estimate_id: id('est'), vehicle_type_id: vehicleTypeId, distance_km: Number(km.toFixed(2)), duration_minutes: Math.ceil(km * 3), estimated_fare: Number(fare.toFixed(2)), currency: 'INR', note: 'Indicative estimate only; configure route-based pricing before production.' };
}
module.exports = { estimate };
