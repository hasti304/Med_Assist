/**
 * Haversine formula — great-circle distance between two lat/lng points (km)
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Sort doctors by distance from a user location.
 * @param {Array} doctors  - rows from doctor_profiles JOIN users
 * @param {number} userLat
 * @param {number} userLng
 * @returns {Array} doctors with `distance_km` added, sorted ascending
 */
function sortByDistance(doctors, userLat, userLng) {
  return doctors
    .map(d => ({
      ...d,
      distance_km: parseFloat(
        haversineDistance(userLat, userLng, d.latitude, d.longitude).toFixed(1)
      )
    }))
    .sort((a, b) => a.distance_km - b.distance_km);
}

module.exports = { haversineDistance, sortByDistance };
