const EARTH_RADIUS_KM = 6371;
const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 50;

const toRadians = (deg) => (deg * Math.PI) / 180;

// Great-circle distance between two points (haversine formula), in kilometres.
function distanceKm(from, to) {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

const isLatitude = (n) => Number.isFinite(n) && n >= -90 && n <= 90;
const isLongitude = (n) => Number.isFinite(n) && n >= -180 && n <= 180;

module.exports = {
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  distanceKm,
  isLatitude,
  isLongitude,
};
