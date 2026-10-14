import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { Review } from '../src/model';

const TEST_JWT_SECRET = 'test-jwt-secret';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await Review.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Review.deleteMany({});
});

test('GET /reviews/restaurant/:id/rating returns avgRating 4 and reviewCount 3 for ratings 4, 5 and 3', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  await Review.create([
    { userId: 'u1', restaurantId: 'rest-spec', rating: 4, comment: 'Good' },
    { userId: 'u2', restaurantId: 'rest-spec', rating: 5, comment: 'Great' },
    { userId: 'u3', restaurantId: 'rest-spec', rating: 3, comment: 'Average' }
  ]);

  const res = await request(app)
    .get('/reviews/restaurant/rest-spec/rating')
    .expect(200);

  assert.deepEqual(res.body, {
    avgRating: 4,
    reviewCount: 3
  });
});

test('GET /reviews/restaurant/:id/rating returns avgRating 0 and reviewCount 0 when no reviews exist', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const res = await request(app)
    .get('/reviews/restaurant/rest-none/rating')
    .expect(200);

  assert.deepEqual(res.body, {
    avgRating: 0,
    reviewCount: 0
  });
});

test('GET /reviews/restaurant/:id/rating rounds average to 1 decimal place', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  // 4 + 4 + 5 = 13 / 3 = 4.3333... -> 4.3
  await Review.create([
    { userId: 'u1', restaurantId: 'rest-round', rating: 4 },
    { userId: 'u2', restaurantId: 'rest-round', rating: 4 },
    { userId: 'u3', restaurantId: 'rest-round', rating: 5 }
  ]);

  const res = await request(app)
    .get('/reviews/restaurant/rest-round/rating')
    .expect(200);

  assert.deepEqual(res.body, {
    avgRating: 4.3,
    reviewCount: 3
  });
});

test('GET /reviews/restaurant/:id returns all reviews for restaurant sorted newest first without __v', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  await Review.create({
    userId: 'u1',
    restaurantId: 'rest-list',
    rating: 3,
    comment: 'First review',
    createdAt: new Date('2026-01-01T10:00:00Z')
  });

  await Review.create({
    userId: 'u2',
    restaurantId: 'rest-list',
    rating: 5,
    comment: 'Second review',
    createdAt: new Date('2026-01-02T10:00:00Z')
  });

  // Another restaurant's review should not be returned
  await Review.create({
    userId: 'u3',
    restaurantId: 'rest-other',
    rating: 1,
    comment: 'Other'
  });

  const res = await request(app)
    .get('/reviews/restaurant/rest-list')
    .expect(200);

  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].userId, 'u2');
  assert.equal(res.body[1].userId, 'u1');
  assert.equal(res.body[0].comment, 'Second review');
  assert.equal(res.body[1].comment, 'First review');
  assert.equal(res.body[0].__v, undefined);
  assert.equal(res.body[1].__v, undefined);
});

test('GET /reviews/restaurant/:id returns empty array when restaurant has no reviews', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const res = await request(app)
    .get('/reviews/restaurant/rest-empty')
    .expect(200);

  assert.deepEqual(res.body, []);
});

test('GET /reviews/restaurant/:id and :id/rating return 400 when id is only whitespace', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const resList = await request(app)
    .get('/reviews/restaurant/%20%20')
    .expect(400);
  assert.deepEqual(resList.body, { error: 'restaurantId is required' });

  const resRating = await request(app)
    .get('/reviews/restaurant/%20%20/rating')
    .expect(400);
  assert.deepEqual(resRating.body, { error: 'restaurantId is required' });
});

test('GET endpoints are public and work without authorization header', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  await request(app)
    .get('/reviews/restaurant/rest-public')
    .expect(200);

  await request(app)
    .get('/reviews/restaurant/rest-public/rating')
    .expect(200);
});

test('GET endpoints return 500 when database throws an error', async () => {
  const mockReviewModel: any = {
    find: () => {
      throw new Error('DB connection failure');
    },
    aggregate: () => {
      throw new Error('DB aggregation failure');
    }
  };

  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    reviewModel: mockReviewModel
  });

  const resList = await request(app)
    .get('/reviews/restaurant/rest-1')
    .expect(500);
  assert.deepEqual(resList.body, { error: 'Internal server error' });

  const resRating = await request(app)
    .get('/reviews/restaurant/rest-1/rating')
    .expect(500);
  assert.deepEqual(resRating.body, { error: 'Internal server error' });
});
