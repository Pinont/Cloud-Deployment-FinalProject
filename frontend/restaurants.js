// Search page: filter by category and price, sort by rating (GET /api/restaurants).
const form = document.getElementById('filters');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

// Only the latest search may update the page, so a slow older request cannot overwrite a newer one.
let latestSearch = 0;

function card(restaurant) {
  const item = el('li', undefined, 'card');
  const link = el('a', restaurant.name);
  link.href = `restaurant.html?id=${encodeURIComponent(restaurant.id)}`;
  const title = el('h2');
  title.appendChild(link);
  item.appendChild(title);

  const meta = [restaurant.category, priceText(restaurant.priceRange), restaurant.address]
    .filter(Boolean)
    .join(' · ');
  item.appendChild(el('p', meta, 'meta'));
  item.appendChild(el('p', ratingText(restaurant), 'rating'));
  return item;
}

async function search() {
  const current = ++latestSearch;
  const data = new FormData(form);
  const params = new URLSearchParams();
  const category = String(data.get('category') || '').trim();
  if (category) params.set('category', category);
  if (data.get('price')) params.set('price', data.get('price'));
  if (data.get('sort')) params.set('sort', 'rating');

  statusEl.textContent = 'Searching…';
  resultsEl.replaceChildren();
  const res = await api(`/restaurants${params.size ? `?${params}` : ''}`);
  if (current !== latestSearch) return;

  if (!res.ok) {
    statusEl.textContent = errorText(res, 'Could not load restaurants.');
    return;
  }
  if (!Array.isArray(res.body) || res.body.length === 0) {
    statusEl.textContent = 'No restaurants found.';
    return;
  }
  statusEl.textContent = `${res.body.length} found`;
  res.body.forEach((restaurant) => resultsEl.appendChild(card(restaurant)));
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  search();
});

search();
