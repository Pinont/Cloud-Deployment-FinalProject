// Restaurant page: details, reviews, average rating, review form and a favourites button.
const $ = (id) => document.getElementById(id);
const restaurantId = new URLSearchParams(location.search).get('id');
const idPath = restaurantId ? encodeURIComponent(restaurantId) : '';

function showSessionExpired() {
  clearToken();
  $('review-form').hidden = true;
  $('login-hint').hidden = false;
}

function reviewItem(review) {
  const item = el('li', undefined, 'card');
  item.appendChild(el('p', `${stars(review.rating)} ${review.rating}/5`, 'rating'));
  if (review.comment) item.appendChild(el('p', review.comment));
  const when = review.createdAt ? new Date(review.createdAt).toLocaleDateString() : '';
  item.appendChild(el('p', [when, review.likes ? `${review.likes} likes` : ''].filter(Boolean).join(' · '), 'meta'));
  return item;
}

async function loadRestaurant() {
  const res = await api(`/restaurants/${idPath}`);
  if (!res.ok) {
    $('status').textContent = res.status === 404 ? 'Restaurant not found.' : errorText(res, 'Could not load the restaurant.');
    return false;
  }
  const r = res.body;
  document.title = r.name;
  $('name').textContent = r.name;
  $('meta').textContent = [r.category, priceText(r.priceRange), r.address].filter(Boolean).join(' · ');
  $('rating').textContent = ratingText(r);
  $('status').textContent = '';
  $('details').hidden = false;
  return true;
}

async function loadReviews() {
  const res = await api(`/reviews/restaurant/${idPath}`);
  const list = $('reviews');
  list.replaceChildren();
  if (!res.ok) {
    list.appendChild(el('li', errorText(res, 'Could not load reviews.')));
    return;
  }
  if (!Array.isArray(res.body) || res.body.length === 0) {
    list.appendChild(el('li', 'No reviews yet.'));
    return;
  }
  res.body.forEach((review) => list.appendChild(reviewItem(review)));
}

$('review-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  // One request at a time: a double-click would otherwise send a second one that the server rejects (409).
  const button = e.target.querySelector('button[type=submit]');
  if (button.disabled) return;
  button.disabled = true;
  try {
    $('review-error').textContent = '';
    const data = new FormData(e.target);
    const res = await api('/reviews', {
      method: 'POST',
      body: JSON.stringify({
        restaurantId,
        rating: Number(data.get('rating')),
        comment: String(data.get('comment') || '').trim(),
      }),
    });
    if (res.status === 401) {
      showSessionExpired();
      return;
    }
    if (!res.ok) {
      $('review-error').textContent = errorText(res, 'Could not post the review.');
      return;
    }
    e.target.reset();
    await Promise.all([loadReviews(), loadRestaurant()]);
  } finally {
    button.disabled = false;
  }
});

$('favorite').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  if (button.disabled) return;
  const out = $('favorite-status');
  if (!getToken()) {
    out.textContent = 'Log in to save restaurants.';
    return;
  }
  button.disabled = true;
  try {
    const res = await api('/favorites', { method: 'POST', body: JSON.stringify({ restaurantId }) });
    if (res.status === 401) {
      showSessionExpired();
      out.textContent = 'Your session expired. Log in again.';
    } else if (res.status === 409) {
      out.textContent = 'Already in your favourites.';
    } else if (!res.ok) {
      out.textContent = errorText(res, 'Could not save this restaurant.');
    } else {
      out.textContent = 'Saved to your favourites.';
    }
  } finally {
    button.disabled = false;
  }
});

async function init() {
  if (!restaurantId) {
    $('status').textContent = 'No restaurant selected.';
    return;
  }
  $('status').textContent = 'Loading…';
  if (!(await loadRestaurant())) return;
  $('reviews-section').hidden = false;
  const loggedIn = Boolean(getToken());
  $('review-form').hidden = !loggedIn;
  $('login-hint').hidden = loggedIn;
  await loadReviews();
}

init();
