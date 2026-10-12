const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { createApp, DEFAULT_JWT_SECRET } = require('../src/app');

test('FV-03: GET /favorites/me returns only current user favorites', async () => {
  const app = createApp({
    favorites: [
      { userId: 'user-1', restaurantId: 'rest-1' },
      { userId: 'user-2', restaurantId: 'rest-2' },
      { userId: 'user-1', restaurantId: 'rest-3' }
    ]
  });

  const token = jwt.sign({ sub: 'user-1', email: 'a@example.com', role: 'user' }, DEFAULT_JWT_SECRET, {
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
    favorites: [{ userId: 'user-1', restaurantId: 'rest-1' }]
  });

  const response = await request(app)
    .get('/favorites/me')
    .expect(401);

  assert.deepEqual(response.body, { message: 'Unauthorized' });
});
