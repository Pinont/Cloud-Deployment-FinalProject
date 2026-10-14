import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp, type Favorite } from '../src/app';

const TEST_JWT_SECRET = 'test-secret';

test('FV-01: POST /favorites saves an existing restaurant with the default list name', async () => {
  const favorites: Favorite[] = [];
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites,
    checkRestaurantExists: async (restaurantId) => restaurantId === 'rest-1'
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const response = await request(app)
    .post('/favorites')
    .auth(token, { type: 'bearer' })
    .send({ restaurantId: ' rest-1 ' })
    .expect(201);

  assert.deepEqual(response.body, {
    userId: 'user-1',
    restaurantId: 'rest-1',
    listName: 'ร้านโปรด'
  });
  assert.deepEqual(favorites, [response.body]);
});

test('FV-02: POST /favorites rejects a duplicate restaurant for the same user', async () => {
  const favorites: Favorite[] = [];
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites,
    checkRestaurantExists: async () => true
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  await request(app)
    .post('/favorites')
    .auth(token, { type: 'bearer' })
    .send({ restaurantId: 'rest-1' })
    .expect(201);

  const response = await request(app)
    .post('/favorites')
    .auth(token, { type: 'bearer' })
    .send({ restaurantId: 'rest-1' })
    .expect(409);

  assert.deepEqual(response.body, { message: 'Restaurant is already in favorites' });
  assert.equal(favorites.length, 1);
});

test('IT-03: POST /favorites returns 404 when the restaurant does not exist', async () => {
  const favorites: Favorite[] = [];
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites,
    checkRestaurantExists: async () => false
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const response = await request(app)
    .post('/favorites')
    .auth(token, { type: 'bearer' })
    .send({ restaurantId: 'missing' })
    .expect(404);

  assert.deepEqual(response.body, { message: 'Restaurant not found' });
  assert.deepEqual(favorites, []);
});

test('FV-03: GET /favorites/me returns only current user favorites', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites: [
      { userId: 'user-1', restaurantId: 'rest-1' },
      { userId: 'user-2', restaurantId: 'rest-2' },
      { userId: 'user-1', restaurantId: 'rest-3' }
    ]
  });

  const token = jwt.sign({ sub: 'user-1', email: 'a@example.com', role: 'user' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const response = await request(app)
    .get('/favorites/me')
    .auth(token, { type: 'bearer' })
    .expect(200);

  assert.deepEqual(response.body, [
    { userId: 'user-1', restaurantId: 'rest-1' },
    { userId: 'user-1', restaurantId: 'rest-3' }
  ]);
});

test('FV-03: GET /favorites/me without token returns 401', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites: [{ userId: 'user-1', restaurantId: 'rest-1' }]
  });

  const response = await request(app)
    .get('/favorites/me')
    .expect(401);

  assert.deepEqual(response.body, { message: 'Unauthorized' });
});

test('DELETE /favorites/:restaurantId removes only the current user favorite', async () => {
  const favorites = [
    { userId: 'user-1', restaurantId: 'rest-1' },
    { userId: 'user-2', restaurantId: 'rest-1' },
    { userId: 'user-1', restaurantId: 'rest-2' }
  ];
  const app = createApp({ jwtSecret: TEST_JWT_SECRET, favorites });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  await request(app)
    .delete('/favorites/rest-1')
    .auth(token, { type: 'bearer' })
    .expect(204);

  assert.deepEqual(favorites, [
    { userId: 'user-2', restaurantId: 'rest-1' },
    { userId: 'user-1', restaurantId: 'rest-2' }
  ]);
});

test('DELETE /favorites/:restaurantId without token returns 401', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites: [{ userId: 'user-1', restaurantId: 'rest-1' }]
  });

  const response = await request(app)
    .delete('/favorites/rest-1')
    .expect(401);

  assert.deepEqual(response.body, { message: 'Unauthorized' });
});

test('DELETE /favorites/:restaurantId returns 404 when the current user has not saved it', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites: [{ userId: 'user-2', restaurantId: 'rest-1' }]
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const response = await request(app)
    .delete('/favorites/rest-1')
    .auth(token, { type: 'bearer' })
    .expect(404);

  assert.deepEqual(response.body, { message: 'Favorite not found' });
});