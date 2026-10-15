// Opening hours are stored as "HH:mm" (24-hour). Zero-padded strings compare in time order.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const TIME_ZONE = process.env.TIME_ZONE || 'Asia/Bangkok';

// Current wall-clock time in the restaurants' time zone, as "HH:mm".
// The container runs in UTC, so the time zone is applied explicitly.
function currentTime(date = new Date(), timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

// Open from openTime (inclusive) to closeTime (exclusive).
// closeTime earlier than openTime means the restaurant closes after midnight (e.g. 18:00–02:00).
// Equal times mean open 24 hours.
function isOpenAt(openTime, closeTime, time) {
  if (!openTime || !closeTime) return false;
  if (openTime === closeTime) return true;
  if (openTime < closeTime) return openTime <= time && time < closeTime;
  return time >= openTime || time < closeTime;
}

module.exports = { HHMM, TIME_ZONE, currentTime, isOpenAt };
