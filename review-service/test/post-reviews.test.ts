import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { Review } from '../src/model';

const TEST_JWT_SECRET = 'test-jwt-secret';

let mongoServer: MongoMemoryServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await Review.init(); // ensure unique indexes are built
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Review.deleteMany({});
});

function createToken(sub: string = 'user-1', email: string = 'user1@example.com', role: string = 'user'): string {
  return jwt.sign({ sub, email, role }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });
}

test('RV-01: POST /reviews with rating 6 returns 400', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });
  const token = createToken('user-1');

  const res = await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({
      restaurantId: 'rest-1',
      rating: 6,
      comment: 'Super great!'
    })
    .expect(400);

  assert.deepEqual(res.body, { error: 'Rating must be between 1 and 5' });
});

test('RV-01 (edge cases): rating 0, negative, string, or missing returns 400', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });
  const token = createToken('user-1');

  const invalidRatings = [0, -1, '5', null, undefined];
  for (const rating of invalidRatings) {
    const res = await request(app)
      .post('/reviews')
      .auth(token, { type: 'bearer' })
      .send({
        restaurantId: 'rest-1',
        rating,
        comment: 'test'
      })
      .expect(400);

    assert.equal(typeof res.body.error, 'string');
  }
});

test('POST /reviews without restaurantId returns 400', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });
  const token = createToken('user-1');

  const res = await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({
      rating: 4,
      comment: 'Missing restaurant id'
    })
    .expect(400);

  assert.deepEqual(res.body, { error: 'restaurantId is required' });
});

test('POST /reviews with non-string comment returns 400', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });
  const token = createToken('user-1');

  const res = await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({
      restaurantId: 'rest-1',
      rating: 4,
      comment: 12345
    })
    .expect(400);

  assert.deepEqual(res.body, { error: 'Comment must be a string' });
});

test('POST /reviews without JWT token returns 401', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });

  const res = await request(app)
    .post('/reviews')
    .send({
      restaurantId: 'rest-1',
      rating: 5,
      comment: 'No token'
    })
    .expect(401);

  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('POST /reviews with invalid JWT token returns 401', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });

  const res = await request(app)
    .post('/reviews')
    .auth('invalid-token', { type: 'bearer' })
    .send({
      restaurantId: 'rest-1',
      rating: 5
    })
    .expect(401);

  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('POST /reviews when restaurant does not exist returns 404', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => false
  });
  const token = createToken('user-1');

  const res = await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({
      restaurantId: 'non-existing-rest',
      rating: 4,
      comment: 'Ghost restaurant'
    })
    .expect(404);

  assert.deepEqual(res.body, { error: 'Restaurant not found' });
});

test('POST /reviews successfully creates review with rating 5 and comment', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async (id) => id === 'rest-1'
  });
  const token = createToken('user-1');

  const res = await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({
      restaurantId: 'rest-1',
      rating: 5,
      comment: 'Delicious soup!'
    })
    .expect(201);

  assert.equal(res.body.userId, 'user-1');
  assert.equal(res.body.restaurantId, 'rest-1');
  assert.equal(res.body.rating, 5);
  assert.equal(res.body.comment, 'Delicious soup!');
  assert.ok(res.body._id);

  const saved = await Review.findOne({ userId: 'user-1', restaurantId: 'rest-1' });
  assert.ok(saved);
  assert.equal(saved?.rating, 5);
});

test('POST /reviews accepts decimal rating (4.5) and omitted comment', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });
  const token = createToken('user-2');

  const res = await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({
      restaurantId: 'rest-2',
      rating: 4.5
    })
    .expect(201);

  assert.equal(res.body.rating, 4.5);
  assert.equal(res.body.comment, '');
});

test('RV-03: POST /reviews returns 409 when user reviews the same restaurant twice', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });
  const token = createToken('user-1');

  // First review succeeds
  await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({
      restaurantId: 'rest-1',
      rating: 4,
      comment: 'First time'
    })
    .expect(201);

  // Second review for same restaurant by same user fails with 409
  const res = await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({
      restaurantId: 'rest-1',
      rating: 5,
      comment: 'Second time should fail'
    })
    .expect(409);

  assert.deepEqual(res.body, { error: 'User has already reviewed this restaurant' });
});

test('Allowed reviews: same user different restaurant and different user same restaurant succeed', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });
  const token1 = createToken('user-1');
  const token2 = createToken('user-2');

  // user-1 reviews rest-1
  await request(app)
    .post('/reviews')
    .auth(token1, { type: 'bearer' })
    .send({ restaurantId: 'rest-1', rating: 4 })
    .expect(201);

  // user-1 reviews rest-2 -> allowed
  await request(app)
    .post('/reviews')
    .auth(token1, { type: 'bearer' })
    .send({ restaurantId: 'rest-2', rating: 5 })
    .expect(201);

  // user-2 reviews rest-1 -> allowed
  await request(app)
    .post('/reviews')
    .auth(token2, { type: 'bearer' })
    .send({ restaurantId: 'rest-1', rating: 3 })
    .expect(201);
});

test('POST /api/reviews works through gateway path alias', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true
  });
  const token = createToken('user-1');

  await request(app)
    .post('/api/reviews')
    .auth(token, { type: 'bearer' })
    .send({ restaurantId: 'rest-gateway', rating: 5 })
    .expect(201);
});

test('createApp throws error if JWT_SECRET is not provided', () => {
  assert.throws(() => {
    createApp({ jwtSecret: '' });
  }, /JWT_SECRET must be set/);
});
