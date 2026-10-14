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

test('RV-04: Author deletes review, recalculates avgRating and reviewCount, and calls updateRestaurantRating', async () => {
  let updatedRestaurantId = '';
  let updatedAvgRating = -1;
  let updatedReviewCount = -1;

  const mockUpdateRating = async (restaurantId: string, avgRating: number, reviewCount: number) => {
    updatedRestaurantId = restaurantId;
    updatedAvgRating = avgRating;
    updatedReviewCount = reviewCount;
  };

  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    updateRestaurantRating: mockUpdateRating
  });

  // Create two reviews for the same restaurant
  const review1 = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-spec',
    rating: 4,
    comment: 'First'
  });

  await Review.create({
    userId: 'author-2',
    restaurantId: 'rest-spec',
    rating: 5,
    comment: 'Second'
  });

  // author-1 deletes their review
  const res = await request(app)
    .delete(`/reviews/${review1._id}`)
    .set('Authorization', `Bearer ${createToken('author-1')}`)
    .expect(200);

  assert.strictEqual(res.body.message, 'Review deleted successfully');

  // Verify review1 is deleted
  const deletedDoc = await Review.findById(review1._id);
  assert.strictEqual(deletedDoc, null);

  // Remaining review has rating 5, count 1
  assert.strictEqual(updatedRestaurantId, 'rest-spec');
  assert.strictEqual(updatedAvgRating, 5);
  assert.strictEqual(updatedReviewCount, 1);
});

test('RV-DEL-01: Deleting the last review sends avgRating: 0 and reviewCount: 0 to restaurant-service', async () => {
  let updatedAvgRating = -1;
  let updatedReviewCount = -1;

  const mockUpdateRating = async (_id: string, avgRating: number, reviewCount: number) => {
    updatedAvgRating = avgRating;
    updatedReviewCount = reviewCount;
  };

  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    updateRestaurantRating: mockUpdateRating
  });

  const review = await Review.create({
    userId: 'author-single',
    restaurantId: 'rest-last',
    rating: 3,
    comment: 'The only review'
  });

  await request(app)
    .delete(`/reviews/${review._id}`)
    .set('Authorization', `Bearer ${createToken('author-single')}`)
    .expect(200);

  assert.strictEqual(updatedAvgRating, 0);
  assert.strictEqual(updatedReviewCount, 0);

  const countInDb = await Review.countDocuments({ restaurantId: 'rest-last' });
  assert.strictEqual(countInDb, 0);
});

test('RV-DEL-02: Non-author cannot delete another user review, returns 403 Forbidden', async () => {
  let updateCalled = false;
  const mockUpdateRating = async () => {
    updateCalled = true;
  };

  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    updateRestaurantRating: mockUpdateRating
  });

  const review = await Review.create({
    userId: 'original-author',
    restaurantId: 'rest-1',
    rating: 4,
    comment: 'My review'
  });

  const res = await request(app)
    .delete(`/reviews/${review._id}`)
    .set('Authorization', `Bearer ${createToken('stranger-user')}`)
    .expect(403);

  assert.strictEqual(res.body.error, 'Forbidden');

  // Verify review still exists in DB
  const doc = await Review.findById(review._id);
  assert.notStrictEqual(doc, null);
  assert.strictEqual(updateCalled, false);
});

test('RV-DEL-03: DELETE /reviews/:id without token returns 401 Unauthorized', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const fakeId = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .delete(`/reviews/${fakeId}`)
    .expect(401);

  assert.strictEqual(res.body.error, 'Unauthorized');
});

test('RV-DEL-04: DELETE /reviews/:id for non-existent review returns 404 Not Found', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const fakeId = new mongoose.Types.ObjectId().toString();

  const res = await request(app)
    .delete(`/reviews/${fakeId}`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(404);

  assert.strictEqual(res.body.error, 'Review not found');
});

test('RV-DEL-05: DELETE /reviews/:id with invalid id format returns 400 Bad Request', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const res = await request(app)
    .delete('/reviews/not-a-valid-object-id')
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(400);

  assert.strictEqual(res.body.error, 'Invalid review id');
});

test('RV-DEL-06: Review is deleted even if restaurant-service rating update fails gracefully', async () => {
  const failingUpdateRating = async () => {
    throw new Error('restaurant-service network error');
  };

  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    updateRestaurantRating: failingUpdateRating
  });

  const review = await Review.create({
    userId: 'author-resilient',
    restaurantId: 'rest-resilient',
    rating: 5,
    comment: 'Resilient test'
  });

  const res = await request(app)
    .delete(`/reviews/${review._id}`)
    .set('Authorization', `Bearer ${createToken('author-resilient')}`)
    .expect(200);

  assert.strictEqual(res.body.message, 'Review deleted successfully');

  const doc = await Review.findById(review._id);
  assert.strictEqual(doc, null);
});

test('RV-DEL-07: Concurrent delete requests for the same restaurant are serialized, final update is 0/0', async () => {
  const updates: Array<{ avgRating: number; reviewCount: number }> = [];
  const mockUpdateRating = async (_id: string, avgRating: number, reviewCount: number) => {
    // Artificial delay to simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 50));
    updates.push({ avgRating, reviewCount });
  };

  const app = createApp({
    jwtSecret: TEST_JWT_SECRET,
    updateRestaurantRating: mockUpdateRating
  });

  const review1 = await Review.create({
    userId: 'author-concurrent-1',
    restaurantId: 'rest-ordered',
    rating: 4,
    comment: 'First concurrent'
  });

  const review2 = await Review.create({
    userId: 'author-concurrent-2',
    restaurantId: 'rest-ordered',
    rating: 5,
    comment: 'Second concurrent'
  });

  // Launch both deletes concurrently
  const [res1, res2] = await Promise.all([
    request(app)
      .delete(`/reviews/${review1._id}`)
      .set('Authorization', `Bearer ${createToken('author-concurrent-1')}`),
    request(app)
      .delete(`/reviews/${review2._id}`)
      .set('Authorization', `Bearer ${createToken('author-concurrent-2')}`)
  ]);

  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res2.status, 200);

  // Both reviews deleted
  const remainingCount = await Review.countDocuments({ restaurantId: 'rest-ordered' });
  assert.strictEqual(remainingCount, 0);

  // The last update received must be the final state (0, 0)
  assert.strictEqual(updates.length, 2);
  const lastUpdate = updates[updates.length - 1];
  assert.strictEqual(lastUpdate.avgRating, 0);
  assert.strictEqual(lastUpdate.reviewCount, 0);
});

test('RV-DEL-08: If rating computation fails before deletion, review is NOT deleted and returns 500 so retry is possible', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const review = await Review.create({
    userId: 'author-fail-compute',
    restaurantId: 'rest-fail-compute',
    rating: 5,
    comment: 'Compute error test'
  });

  // Mock aggregate to throw an error
  const originalAggregate = Review.aggregate;
  Review.aggregate = (() => {
    return Promise.reject(new Error('Mongo aggregation pipeline error'));
  }) as any;

  try {
    const res = await request(app)
      .delete(`/reviews/${review._id}`)
      .set('Authorization', `Bearer ${createToken('author-fail-compute')}`)
      .expect(500);

    assert.strictEqual(res.body.error, 'Internal server error');

    // Verify document was NOT deleted, allowing retry
    const doc = await Review.findById(review._id);
    assert.ok(doc !== null);
    assert.strictEqual(doc?.comment, 'Compute error test');
  } finally {
    Review.aggregate = originalAggregate;
  }
});

test('RV-DEL-09: If findByIdAndDelete rejects with an error, the route returns 500 cleanly without crashing', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const review = await Review.create({
    userId: 'author-db-fail',
    restaurantId: 'rest-db-fail',
    rating: 5,
    comment: 'DB fail test'
  });

  const originalFindByIdAndDelete = Review.findByIdAndDelete;
  Review.findByIdAndDelete = (() => {
    return Promise.reject(new Error('Database write failure'));
  }) as any;

  try {
    const res = await request(app)
      .delete(`/reviews/${review._id}`)
      .set('Authorization', `Bearer ${createToken('author-db-fail')}`)
      .expect(500);

    assert.strictEqual(res.body.error, 'Internal server error');
  } finally {
    Review.findByIdAndDelete = originalFindByIdAndDelete;
  }
});


