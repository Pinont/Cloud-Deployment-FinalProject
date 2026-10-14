import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp, type Favorite, type ShareLink } from '../src/app';

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

test('FV-02.3: POST /favorites allows the same restaurant in different lists', async () => {
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
    .send({ restaurantId: 'rest-1', listName: 'คาเฟ่อยากไป' })
    .expect(201);

  const response = await request(app)
    .post('/favorites')
    .auth(token, { type: 'bearer' })
    .send({ restaurantId: 'rest-1', listName: 'ร้านที่เคยไป' })
    .expect(201);

  assert.equal(response.body.listName, 'ร้านที่เคยไป');
  assert.equal(favorites.length, 2);
});

test('FV-03.1: GET /favorites/me filters by list name', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites: [
      { userId: 'user-1', restaurantId: 'rest-1', listName: 'คาเฟ่อยากไป' },
      { userId: 'user-1', restaurantId: 'rest-2', listName: 'ร้านที่เคยไป' },
      { userId: 'user-2', restaurantId: 'rest-3', listName: 'คาเฟ่อยากไป' }
    ]
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const response = await request(app)
    .get('/favorites/me')
    .query({ listName: 'คาเฟ่อยากไป' })
    .auth(token, { type: 'bearer' })
    .expect(200);

  assert.deepEqual(response.body, [
    { userId: 'user-1', restaurantId: 'rest-1', listName: 'คาเฟ่อยากไป' }
  ]);
});

test('FV-SHARE-01: owner can create a read-only link for a list', async () => {
  const sharedLinks: ShareLink[] = [];
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites: [
      { userId: 'user-1', restaurantId: 'rest-1', listName: 'คาเฟ่อยากไป' },
      { userId: 'user-1', restaurantId: 'rest-2', listName: 'ร้านที่เคยไป' }
    ],
    sharedLinks
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, { algorithm: 'HS256' });

  const response = await request(app)
    .post('/favorites/share')
    .auth(token, { type: 'bearer' })
    .send({ listName: 'คาเฟ่อยากไป' })
    .expect(201);

  assert.match(response.body.token, /^[a-f0-9]{64}$/);
  assert.equal(response.body.listName, 'คาเฟ่อยากไป');
  assert.equal(response.body.url, `/favorites/shared/${response.body.token}`);
  assert.deepEqual(sharedLinks, [
    { token: response.body.token, ownerId: 'user-1', listName: 'คาเฟ่อยากไป' }
  ]);
});

test('FV-SHARE-02: anyone with a link can read the list without the owner id', async () => {
  const sharedLinks = [{ token: 'share-token', ownerId: 'user-1', listName: 'คาเฟ่อยากไป' }];
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites: [
      { userId: 'user-1', restaurantId: 'rest-1', listName: 'คาเฟ่อยากไป' },
      { userId: 'user-2', restaurantId: 'rest-2', listName: 'คาเฟ่อยากไป' }
    ],
    sharedLinks
  });

  const response = await request(app).get('/favorites/shared/share-token').expect(200);

  assert.deepEqual(response.body, {
    listName: 'คาเฟ่อยากไป',
    favorites: [{ restaurantId: 'rest-1', listName: 'คาเฟ่อยากไป' }]
  });
});

test('FV-SHARE-03: owner can revoke a link and it becomes unreadable', async () => {
  const sharedLinks = [{ token: 'share-token', ownerId: 'user-1', listName: 'ร้านโปรด' }];
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    sharedLinks,
    favorites: [{ userId: 'user-1', restaurantId: 'rest-1' }]
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, { algorithm: 'HS256' });

  await request(app)
    .delete('/favorites/share')
    .auth(token, { type: 'bearer' })
    .expect(204);

  await request(app).get('/favorites/shared/share-token').expect(404);
});

test('FV-SHARE-04: another user cannot revoke a shared list', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    sharedLinks: [{ token: 'share-token', ownerId: 'user-1', listName: 'ร้านโปรด' }]
  });
  const token = jwt.sign({ sub: 'user-2' }, TEST_JWT_SECRET, { algorithm: 'HS256' });

  const response = await request(app)
    .delete('/favorites/share')
    .auth(token, { type: 'bearer' })
    .expect(404);

  assert.deepEqual(response.body, { message: 'Shared favorite list not found' });
});

test('FV-02.1: POST /favorites rejects overlapping duplicate saves for the same user', async () => {
  const favorites: Favorite[] = [];
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites,
    checkRestaurantExists: async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return true;
    }
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const [responseA, responseB] = await Promise.all([
    request(app).post('/favorites').auth(token, { type: 'bearer' }).send({ restaurantId: 'rest-1' }),
    request(app).post('/favorites').auth(token, { type: 'bearer' }).send({ restaurantId: 'rest-1' })
  ]);
  const statuses = [responseA.status, responseB.status].sort((a, b) => a - b);

  assert.deepEqual(statuses, [201, 409]);
  assert.equal(favorites.length, 1);
});

test('FV-02.2: POST /favorites returns 409 when persistence rejects a duplicate', async () => {
  const favorites: Favorite[] = [];
  const duplicateError = Object.assign(new Error('duplicate key'), { code: 11000 });
  let persistCalls = 0;
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites,
    checkRestaurantExists: async () => true,
    persistFavorite: async () => {
      persistCalls += 1;
      if (persistCalls === 2) {
        throw duplicateError;
      }
    }
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const [firstResponse, secondResponse] = await Promise.all([
    request(app).post('/favorites').auth(token, { type: 'bearer' }).send({ restaurantId: 'rest-1' }),
    request(app).post('/favorites').auth(token, { type: 'bearer' }).send({ restaurantId: 'rest-1' })
  ]);
  const statuses = [firstResponse.status, secondResponse.status].sort((a, b) => a - b);

  assert.deepEqual(statuses, [201, 409]);
  assert.equal(favorites.length, 1);
});

test('FV-POST-404: POST /favorites returns 404 when the restaurant does not exist', async () => {
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

test('FV-DEL-01: DELETE /favorites/:restaurantId removes only the current user favorite', async () => {
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

test('FV-DEL-06: DELETE /favorites/:restaurantId removes only the selected list', async () => {
  const favorites = [
    { userId: 'user-1', restaurantId: 'rest-1', listName: 'คาเฟ่อยากไป' },
    { userId: 'user-1', restaurantId: 'rest-1', listName: 'ร้านที่เคยไป' }
  ];
  const app = createApp({ jwtSecret: TEST_JWT_SECRET, favorites });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  await request(app)
    .delete('/favorites/rest-1')
    .query({ listName: 'ร้านที่เคยไป' })
    .auth(token, { type: 'bearer' })
    .expect(204);

  assert.deepEqual(favorites, [
    { userId: 'user-1', restaurantId: 'rest-1', listName: 'คาเฟ่อยากไป' }
  ]);
});

test('FV-DEL-04: DELETE /favorites/:restaurantId does not remove the next favorite during overlap', async () => {
  const favorites = [
    { userId: 'user-1', restaurantId: 'rest-1' },
    { userId: 'user-2', restaurantId: 'rest-2' }
  ];
  let deleteCalls = 0;
  let releaseDelete: (() => void) | undefined;
  const bothDeletesStarted = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites,
    deleteFavorite: async () => {
      deleteCalls += 1;
      if (deleteCalls === 2) {
        releaseDelete!();
      }
      await bothDeletesStarted;
    }
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const [responseA, responseB] = await Promise.all([
    request(app).delete('/favorites/rest-1').auth(token, { type: 'bearer' }),
    request(app).delete('/favorites/rest-1').auth(token, { type: 'bearer' })
  ]);
  const statuses = [responseA.status, responseB.status].sort((a, b) => a - b);

  assert.deepEqual(statuses, [204, 404]);
  assert.deepEqual(favorites, [{ userId: 'user-2', restaurantId: 'rest-2' }]);
});

test('FV-DEL-05: DELETE /favorites/:restaurantId returns 503 when persistence delete fails', async () => {
  const favorites = [{ userId: 'user-1', restaurantId: 'rest-1' }];
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites,
    deleteFavorite: async () => {
      throw new Error('db unavailable');
    }
  });
  const token = jwt.sign({ sub: 'user-1' }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });

  const response = await request(app)
    .delete('/favorites/rest-1')
    .auth(token, { type: 'bearer' })
    .expect(503);

  assert.deepEqual(response.body, { message: 'Favorite service unavailable' });
  assert.deepEqual(favorites, [{ userId: 'user-1', restaurantId: 'rest-1' }]);
});

test('FV-DEL-02: DELETE /favorites/:restaurantId without token returns 401', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    favorites: [{ userId: 'user-1', restaurantId: 'rest-1' }]
  });

  const response = await request(app)
    .delete('/favorites/rest-1')
    .expect(401);

  assert.deepEqual(response.body, { message: 'Unauthorized' });
});

test('FV-DEL-03: DELETE /favorites/:restaurantId returns 404 when the current user has not saved it', async () => {
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