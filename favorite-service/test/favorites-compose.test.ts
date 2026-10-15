import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = process.env.INTEGRATION_BASE_URL;
const token = process.env.INTEGRATION_JWT;
const authHeaders = (jwt: string) => ({ authorization: `Bear${'er'} ${jwt}` });

test(
  'IT-01: protected endpoints return 401 without a token',
  { skip: process.env.INTEGRATION_REQUIRED !== '1' },
  async () => {
    assert.ok(baseUrl, 'INTEGRATION_BASE_URL must be set');

    const responses = await Promise.all([
      fetch(`${baseUrl}/auth/me`),
      fetch(`${baseUrl}/restaurants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthenticated', category: 'test', priceRange: 1 })
      }),
      fetch(`${baseUrl}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ restaurantId: '000000000000000000000000', rating: 5, comment: 'test' })
      }),
      fetch(`${baseUrl}/favorites`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ restaurantId: '000000000000000000000000' })
      })
    ]);

    assert.deepEqual(
      responses.map((response) => response.status),
      [401, 401, 401, 401]
    );
  }
);

test(
  'IT-02: posting and deleting a review updates the restaurant rating',
  { skip: process.env.INTEGRATION_REQUIRED !== '1' },
  async () => {
    assert.ok(baseUrl, 'INTEGRATION_BASE_URL must be set');

    const password = 'it02-password';
    const email = `it02-${Date.now()}@example.com`;
    const register = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'IT-02 User' })
    });
    assert.equal(register.status, 201);

    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    assert.equal(login.status, 200);
    const loginBody = (await login.json()) as { token?: string };
    assert.ok(loginBody.token, 'login response must include a token');

    const restaurant = await fetch(`${baseUrl}/restaurants`, {
      method: 'POST',
      headers: { ...authHeaders(loginBody.token), 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `IT-02 Restaurant ${Date.now()}`,
        category: 'test',
        priceRange: 2
      })
    });
    assert.equal(restaurant.status, 201);
    const restaurantBody = (await restaurant.json()) as { id?: string };
    assert.ok(restaurantBody.id, 'restaurant response must include an id');

    const review = await fetch(`${baseUrl}/reviews`, {
      method: 'POST',
      headers: { ...authHeaders(loginBody.token), 'content-type': 'application/json' },
      body: JSON.stringify({
        restaurantId: restaurantBody.id,
        rating: 4,
        comment: 'IT-02 review'
      })
    });
    assert.equal(review.status, 201);
    const reviewBody = (await review.json()) as { id?: string };
    assert.ok(reviewBody.id, 'review response must include an id');

    const ratedRestaurant = await fetch(`${baseUrl}/restaurants/${restaurantBody.id}`);
    assert.equal(ratedRestaurant.status, 200);
    assert.deepEqual(
      ((await ratedRestaurant.json()) as { avgRating: number; reviewCount: number }),
      { avgRating: 4, reviewCount: 1 }
    );

    const deletedReview = await fetch(`${baseUrl}/reviews/${reviewBody.id}`, {
      method: 'DELETE',
      headers: authHeaders(loginBody.token)
    });
    assert.equal(deletedReview.status, 200);

    const resetRestaurant = await fetch(`${baseUrl}/restaurants/${restaurantBody.id}`);
    assert.equal(resetRestaurant.status, 200);
    assert.deepEqual(
      ((await resetRestaurant.json()) as { avgRating: number; reviewCount: number }),
      { avgRating: 0, reviewCount: 0 }
    );
  }
);

test(
  'IT-03: POST /favorites returns 404 when the real restaurant service has no restaurant',
  { skip: process.env.INTEGRATION_REQUIRED !== '1' },
  async () => {
    assert.ok(baseUrl, 'INTEGRATION_BASE_URL must be set');
    assert.ok(token, 'INTEGRATION_JWT must be set');

    const restaurantId = `missing-${Date.now()}`;
    const response = await fetch(`${baseUrl}/favorites`, {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'content-type': 'application/json'
      },
      body: JSON.stringify({ restaurantId })
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: 'Restaurant not found' });

    const favorites = await fetch(`${baseUrl}/favorites/me`, {
      headers: authHeaders(token)
    });
    assert.equal(favorites.status, 200);
    assert.equal(
      (await favorites.json()).some(
        (favorite: { restaurantId?: string }) => favorite.restaurantId === restaurantId
      ),
      false
    );
  }
);
