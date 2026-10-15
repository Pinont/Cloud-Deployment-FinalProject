import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import express from 'express';
import { createApp } from '../../src/app';
import { Review } from '../../src/models/review';
import { createReviewRouter } from '../../src/routes/reviews';
import { createRestaurantClient } from '../../src/clients/restaurantClient';

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

function createToken(sub: string = 'user-1', email: string = 'user1@example.com', role: string = 'user'): string {
  return jwt.sign({ sub, email, role }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });
}

test('RV-REPLY-01: POST /reviews/:id/reply returns 401 when unauthenticated', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Delicious food!'
  });

  const res = await request(app)
    .post(`/reviews/${review._id}/reply`)
    .send({ comment: 'Thank you!' })
    .expect(401);

  assert.strictEqual(res.body.error, 'Unauthorized');
});

test('RV-REPLY-02: POST /reviews/:id/reply returns 400 for invalid review id', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const res = await request(app)
    .post('/reviews/invalid-object-id/reply')
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({ comment: 'Thank you!' })
    .expect(400);

  assert.strictEqual(res.body.error, 'Invalid review id');
});

test('RV-REPLY-03: POST /reviews/:id/reply returns 400 when comment is missing or empty', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-1',
    rating: 4,
    comment: 'Good'
  });

  const resMissing = await request(app)
    .post(`/reviews/${review._id}/reply`)
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({})
    .expect(400);

  assert.strictEqual(resMissing.body.error, 'comment is required');

  const resEmpty = await request(app)
    .post(`/reviews/${review._id}/reply`)
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({ comment: '   ' })
    .expect(400);

  assert.strictEqual(resEmpty.body.error, 'comment is required');

  const resNonString = await request(app)
    .post(`/reviews/${review._id}/reply`)
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({ comment: 12345 })
    .expect(400);

  assert.strictEqual(resNonString.body.error, 'comment is required');
});

test('RV-REPLY-04: POST /reviews/:id/reply returns 404 when review is not found', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    getRestaurantOwner: async () => 'owner-1'
  });
  const nonExistentId = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .post(`/reviews/${nonExistentId}/reply`)
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({ comment: 'Thank you for your review!' })
    .expect(404);

  assert.strictEqual(res.body.error, 'Review not found');
});

test('RV-REPLY-05: POST /reviews/:id/reply returns 404 when restaurant does not exist', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    getRestaurantOwner: async () => null
  });
  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-missing',
    rating: 5,
    comment: 'Nice place'
  });

  const res = await request(app)
    .post(`/reviews/${review._id}/reply`)
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({ comment: 'Thank you!' })
    .expect(404);

  assert.strictEqual(res.body.error, 'Restaurant not found');
});

test('RV-REPLY-06: POST /reviews/:id/reply returns 503 when restaurant-service is unavailable', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    getRestaurantOwner: async () => {
      throw new Error('Connection refused');
    }
  });
  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-1',
    rating: 4,
    comment: 'Good'
  });

  const res = await request(app)
    .post(`/reviews/${review._id}/reply`)
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({ comment: 'Thank you!' })
    .expect(503);

  assert.strictEqual(res.body.error, 'Restaurant service unavailable');
});

test('RV-REPLY-07: POST /reviews/:id/reply returns 403 when user is not the restaurant owner', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    getRestaurantOwner: async () => 'real-owner-42'
  });
  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-1',
    rating: 4,
    comment: 'Good service'
  });

  const res = await request(app)
    .post(`/reviews/${review._id}/reply`)
    .set('Authorization', `Bearer ${createToken('imposter-user')}`)
    .send({ comment: 'I am the owner trust me' })
    .expect(403);

  assert.strictEqual(res.body.error, 'Forbidden');
});

test('RV-REPLY-08: POST /reviews/:id/reply allows owner to reply and returns 201 with reply object', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    getRestaurantOwner: async (restId: string) => (restId === 'rest-1' ? 'owner-1' : null)
  });
  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Outstanding food!'
  });

  const res = await request(app)
    .post(`/reviews/${review._id}/reply`)
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({ comment: 'Thank you for your kind words! We hope to see you again soon.' })
    .expect(201);

  assert.strictEqual(res.body.reply.comment, 'Thank you for your kind words! We hope to see you again soon.');
  assert.ok(res.body.reply.createdAt);

  const updated = await Review.findById(review._id);
  assert.strictEqual(updated?.reply?.comment, 'Thank you for your kind words! We hope to see you again soon.');
});

test('RV-REPLY-09: GET /reviews/restaurant/:id includes the owner reply with the review', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    getRestaurantOwner: async () => 'owner-1'
  });
  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-with-reply',
    rating: 5,
    comment: 'Lovely ambiance'
  });

  await request(app)
    .post(`/reviews/${review._id}/reply`)
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({ comment: 'Thanks from the chef!' })
    .expect(201);

  const getRes = await request(app)
    .get('/reviews/restaurant/rest-with-reply')
    .expect(200);

  assert.strictEqual(Array.isArray(getRes.body), true);
  assert.strictEqual(getRes.body.length, 1);
  assert.strictEqual(getRes.body[0].comment, 'Lovely ambiance');
  assert.strictEqual(getRes.body[0].reply?.comment, 'Thanks from the chef!');
});

test('RV-REPLY-10: POST /reviews/:id/reply returns 409 when review already has a reply', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    getRestaurantOwner: async () => 'owner-1'
  });
  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Great dinner',
    reply: {
      comment: 'Initial owner reply',
      createdAt: new Date()
    }
  });

  const res = await request(app)
    .post(`/reviews/${review._id}/reply`)
    .set('Authorization', `Bearer ${createToken('owner-1')}`)
    .send({ comment: 'Second reply' })
    .expect(409);

  assert.strictEqual(res.body.error, 'Review already has a reply');
});

test('RV-REPLY-11: Concurrent reply requests only allow one reply and reject the other with 409', async () => {
  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    getRestaurantOwner: async () => 'owner-1'
  });
  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Super dish'
  });

  const [res1, res2] = await Promise.all([
    request(app)
      .post(`/reviews/${review._id}/reply`)
      .set('Authorization', `Bearer ${createToken('owner-1')}`)
      .send({ comment: 'Reply A' }),
    request(app)
      .post(`/reviews/${review._id}/reply`)
      .set('Authorization', `Bearer ${createToken('owner-1')}`)
      .send({ comment: 'Reply B' })
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.deepStrictEqual(statuses, [201, 409]);

  const updated = await Review.findById(review._id);
  assert.ok(updated?.reply?.comment === 'Reply A' || updated?.reply?.comment === 'Reply B');
});

test('RV-REPLY-12: POST /reviews/:id/reply returns 500 when getRestaurantOwner is not configured', async () => {
  const router = createReviewRouter({
    requireAuth: (req: any, _res: any, next: any) => {
      req.user = { sub: 'owner-1', email: 'owner@example.com', role: 'user' };
      next();
    },
    checkRestaurantExists: async () => true,
    getRestaurantOwner: undefined
  });
  const customApp = express();
  customApp.use(express.json());
  customApp.use('/reviews', router);

  const review = await Review.create({
    userId: 'customer-1',
    restaurantId: 'rest-1',
    rating: 4,
    comment: 'Good'
  });

  const res = await request(customApp)
    .post(`/reviews/${review._id}/reply`)
    .send({ comment: 'Thank you' })
    .expect(500);

  assert.strictEqual(res.body.error, 'Owner verification service not configured');
});

test('RV-REPLY-13: createRestaurantClient behaves correctly with real fetch mocking', async () => {
  const originalFetch = global.fetch;
  try {
    const client = createRestaurantClient('http://mock-restaurant:3002');

    // getRestaurantOwner: 200 OK with ownerId
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ownerId: 'owner-xyz' })
    } as any);
    const ownerId = await client.getRestaurantOwner('rest-123');
    assert.strictEqual(ownerId, 'owner-xyz');

    // getRestaurantOwner: 404 Not Found
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404
    } as any);
    const notFound = await client.getRestaurantOwner('rest-404');
    assert.strictEqual(notFound, null);

    // getRestaurantOwner: 500 Server Error
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500
    } as any);
    await assert.rejects(async () => {
      await client.getRestaurantOwner('rest-500');
    }, /restaurant-service error: 500/);

    // getRestaurantOwner: 200 OK without string ownerId
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    } as any);
    const noOwner = await client.getRestaurantOwner('rest-empty');
    assert.strictEqual(noOwner, null);

    // checkRestaurantExists: 200 OK -> true, 404 -> false, 500 -> throw
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as any);
    assert.strictEqual(await client.checkRestaurantExists('rest-1'), true);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 } as any);
    assert.strictEqual(await client.checkRestaurantExists('rest-missing'), false);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 } as any);
    await assert.rejects(async () => {
      await client.checkRestaurantExists('rest-err');
    }, /restaurant-service error: 502/);

    // updateRestaurantRating: 200 OK -> void, 500 -> throw
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as any);
    await client.updateRestaurantRating('rest-1', 4.5, 10);

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 } as any);
    await assert.rejects(async () => {
      await client.updateRestaurantRating('rest-1', 4.5, 10);
    }, /restaurant-service error: 500/);
  } finally {
    global.fetch = originalFetch;
  }
});
