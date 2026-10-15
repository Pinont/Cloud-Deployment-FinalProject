// Shared helpers for the restaurant pages. Talks to the gateway: /api/<service>/...
// The login token is kept in localStorage under the same key as the login page (app.js).
const TOKEN_KEY = 'token';

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}

// Never throws: a network failure comes back as status 0 so callers can show a message.
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`/api${path}`, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body };
  } catch {
    return { status: 0, ok: false, body: { error: 'Cannot reach the server. Please try again.' } };
  }
}

// The services answer errors as { error } or { message }.
function errorText(res, fallback) {
  return (res.body && (res.body.error || res.body.message)) || fallback;
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function stars(rating) {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function ratingText(restaurant) {
  if (!restaurant.reviewCount) return 'No reviews yet';
  return `${stars(restaurant.avgRating)} ${Number(restaurant.avgRating).toFixed(1)} (${restaurant.reviewCount})`;
}

function priceText(priceRange) {
  return '$'.repeat(Number(priceRange) || 0);
}
