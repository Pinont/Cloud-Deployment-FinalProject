async function loadFavorites() {
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  if (!getToken()) {
    status.textContent = 'Log in to view your favourites.';
    return;
  }

  status.textContent = 'Loading…';
  const response = await api('/favorites/me');
  if (response.status === 401) {
    clearToken();
    status.textContent = 'Log in to view your favourites.';
    return;
  }
  if (!response.ok) {
    status.textContent = errorText(response, 'Could not load your favourites.');
    return;
  }

  const favorites = Array.isArray(response.body) ? response.body : [];
  const restaurants = await Promise.all(
    favorites.map(async (favorite) => {
      const restaurant = await api(`/restaurants/${encodeURIComponent(favorite.restaurantId)}`);
      return restaurant.ok ? restaurant.body : null;
    }),
  );
  results.replaceChildren();
  restaurants.filter(Boolean).forEach((restaurant) => {
    const item = el('li', undefined, 'card');
    const link = el('a', restaurant.name);
    link.href = `restaurant.html?id=${encodeURIComponent(restaurant._id || restaurant.id)}`;
    const title = el('h2');
    title.appendChild(link);
    item.appendChild(title);
    item.appendChild(el('p', [restaurant.category, priceText(restaurant.priceRange), restaurant.address]
      .filter(Boolean).join(' · '), 'meta'));
    results.appendChild(item);
  });
  status.textContent = restaurants.length ? `${restaurants.length} saved` : 'No favourites yet.';
}

loadFavorites();
