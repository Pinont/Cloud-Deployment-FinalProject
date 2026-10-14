import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../../src/app';
import { Review } from '../../src/models/review';

const TEST_JWT_SECRET = 'test-jwt-secret';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await Review.init(); // ensure unique indexes are built
});

afterAll(async () => {
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
    checkRestaurantExists: async (id) => id === 'rest-1',
    updateRestaurantRating: async () => {}
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
    checkRestaurantExists: async () => true,
    updateRestaurantRating: async () => {}
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
    checkRestaurantExists: async () => true,
    updateRestaurantRating: async () => {}
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
    checkRestaurantExists: async () => true,
    updateRestaurantRating: async () => {}
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


test('POST /reviews returns 503 when restaurant-service throws an outage error', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => {
      throw new Error('restaurant-service network timeout');
    }
  });
  const token = createToken('user-1');

  const res = await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({ restaurantId: 'rest-1', rating: 4 })
    .expect(503);

  assert.deepEqual(res.body, { error: 'Restaurant service unavailable' });
});

test('POST /reviews trims whitespace from restaurantId for existence check and storage', async () => {
  let checkedId = '';
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async (id) => {
      checkedId = id;
      return true;
    },
    updateRestaurantRating: async () => {}
  });
  const token = createToken('user-1');

  const res = await request(app)
    .post('/reviews')
    .auth(token, { type: 'bearer' })
    .send({ restaurantId: '  rest-padded  ', rating: 5 })
    .expect(201);

  assert.equal(checkedId, 'rest-padded');
  assert.equal(res.body.restaurantId, 'rest-padded');
});

test('createApp throws error if JWT_SECRET is not provided', () => {
  assert.throws(() => {
    createApp({ jwtSecret: '' });
  }, /JWT_SECRET must be set/);
});

test('RV-02: Sequential reviews with ratings 4, 5 and 3 result in avgRating 4.0 and reviewCount 3 sent to restaurant-service', async () => {
  const calls: Array<{ restaurantId: string; avgRating: number; reviewCount: number }> = [];
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true,
    updateRestaurantRating: async (restaurantId, avgRating, reviewCount) => {
      calls.push({ restaurantId, avgRating, reviewCount });
    }
  });

  // User 1 posts rating 4
  await request(app)
    .post('/reviews')
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .send({ restaurantId: 'rest-rv-02', rating: 4 })
    .expect(201);

  // User 2 posts rating 5
  await request(app)
    .post('/reviews')
    .set('Authorization', `Bearer ${createToken('user-2')}`)
    .send({ restaurantId: 'rest-rv-02', rating: 5 })
    .expect(201);

  // User 3 posts rating 3
  await request(app)
    .post('/reviews')
    .set('Authorization', `Bearer ${createToken('user-3')}`)
    .send({ restaurantId: 'rest-rv-02', rating: 3 })
    .expect(201);

  assert.strictEqual(calls.length, 3);
  assert.deepStrictEqual(calls[0], { restaurantId: 'rest-rv-02', avgRating: 4.0, reviewCount: 1 });
  assert.deepStrictEqual(calls[1], { restaurantId: 'rest-rv-02', avgRating: 4.5, reviewCount: 2 });
  assert.deepStrictEqual(calls[2], { restaurantId: 'rest-rv-02', avgRating: 4.0, reviewCount: 3 });
});

test('RV-POST-RATE-01: POST /reviews succeeds with 201 even if restaurant-service rating update fails', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true,
    updateRestaurantRating: async () => {
      throw new Error('restaurant-service network error');
    }
  });

  const res = await request(app)
    .post('/reviews')
    .set('Authorization', `Bearer ${createToken('user-fail')}`)
    .send({ restaurantId: 'rest-fail', rating: 5, comment: 'Nice' })
    .expect(201);

  assert.strictEqual(res.body.restaurantId, 'rest-fail');
  assert.strictEqual(res.body.rating, 5);

  // Verify document was stored in DB
  const stored = await Review.findById(res.body._id);
  assert.ok(stored !== null);
  assert.strictEqual(stored?.rating, 5);
});

test('RV-POST-RATE-02: Rating average rounds to 1 decimal place', async () => {
  let lastUpdate: { avgRating: number; reviewCount: number } | null = null;
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    checkRestaurantExists: async () => true,
    updateRestaurantRating: async (_id, avgRating, reviewCount) => {
      lastUpdate = { avgRating, reviewCount };
    }
  });

  await request(app)
    .post('/reviews')
    .set('Authorization', `Bearer ${createToken('user-r1')}`)
    .send({ restaurantId: 'rest-round', rating: 1 })
    .expect(201);

  await request(app)
    .post('/reviews')
    .set('Authorization', `Bearer ${createToken('user-r2')}`)
    .send({ restaurantId: 'rest-round', rating: 2 })
    .expect(201);

  await request(app)
    .post('/reviews')
    .set('Authorization', `Bearer ${createToken('user-r3')}`)
    .send({ restaurantId: 'rest-round', rating: 4 })
    .expect(201);

  assert.ok(lastUpdate);
  // (1 + 2 + 4) / 3 = 7 / 3 = 2.3333... -> rounded to 2.3
  assert.strictEqual((lastUpdate as { avgRating: number; reviewCount: number }).avgRating, 2.3);
  assert.strictEqual((lastUpdate as { avgRating: number; reviewCount: number }).reviewCount, 3);
});

