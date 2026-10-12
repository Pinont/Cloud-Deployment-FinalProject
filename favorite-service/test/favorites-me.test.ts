import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../src/app';

const TEST_JWT_SECRET = 'test-secret';

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