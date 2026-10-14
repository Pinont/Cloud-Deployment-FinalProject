import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
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

function createToken(sub: string = 'user-1', email: string = 'user1@example.com', role: string = 'user'): string {
  return jwt.sign({ sub, email, role }, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });
}

test('RV-LIKE-01: POST /reviews/:id/like likes a review and returns 200 with liked: true and likes: 1', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Great!'
  });

  const res = await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  assert.strictEqual(res.body.liked, true);
  assert.strictEqual(res.body.likes, 1);

  const updated = await Review.findById(review._id);
  assert.strictEqual(updated?.likes, 1);
});

test('RV-LIKE-02: POST /reviews/:id/like is idempotent when liked again by same user', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Great!'
  });

  // First like
  await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  // Second like (duplicate/retry)
  const res = await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  assert.strictEqual(res.body.liked, true);
  assert.strictEqual(res.body.likes, 1);

  const updated = await Review.findById(review._id).select('+likedBy');
  assert.strictEqual(updated?.likes, 1);
  assert.deepStrictEqual(updated?.likedBy, ['user-1']);
});

test('RV-LIKE-03: DELETE /reviews/:id/like unlikes a review and returns 200 with liked: false and likes: 0', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Great!'
  });

  // First like
  await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  // Then unlike
  const res = await request(app)
    .delete(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  assert.strictEqual(res.body.liked, false);
  assert.strictEqual(res.body.likes, 0);

  const updated = await Review.findById(review._id);
  assert.strictEqual(updated?.likes, 0);
});

test('RV-LIKE-04: DELETE /reviews/:id/like is idempotent when unliked again or unliked when not liked', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Great!'
  });

  // 1. Unlike when never liked
  const res1 = await request(app)
    .delete(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  assert.strictEqual(res1.body.liked, false);
  assert.strictEqual(res1.body.likes, 0);

  // 2. Like the review
  await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  // 3. Unlike
  const res2 = await request(app)
    .delete(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  assert.strictEqual(res2.body.liked, false);
  assert.strictEqual(res2.body.likes, 0);

  // 4. Unlike retry (duplicate delete on already unliked review)
  const res3 = await request(app)
    .delete(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  assert.strictEqual(res3.body.liked, false);
  assert.strictEqual(res3.body.likes, 0);

  const updated = await Review.findById(review._id).select('+likedBy');
  assert.strictEqual(updated?.likes, 0);
  assert.deepStrictEqual(updated?.likedBy, []);
});

test('RV-LIKE-05: Multiple users like and unlike the same review', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Great!'
  });

  // User 1 likes
  await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  // User 2 likes
  const resUser2 = await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-2')}`)
    .expect(200);

  assert.strictEqual(resUser2.body.liked, true);
  assert.strictEqual(resUser2.body.likes, 2);

  // User 1 unlikes
  const resUser1Unlike = await request(app)
    .delete(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  assert.strictEqual(resUser1Unlike.body.liked, false);
  assert.strictEqual(resUser1Unlike.body.likes, 1);

  const updated = await Review.findById(review._id);
  assert.strictEqual(updated?.likes, 1);
});

test('RV-LIKE-06: Author can like their own review', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Great!'
  });

  const res = await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('author-1')}`)
    .expect(200);

  assert.strictEqual(res.body.liked, true);
  assert.strictEqual(res.body.likes, 1);
});

test('RV-LIKE-07: POST /reviews/:id/like and DELETE /reviews/:id/like return 404 for non-existent review', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const fakeId = new mongoose.Types.ObjectId().toString();

  const postRes = await request(app)
    .post(`/reviews/${fakeId}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(404);

  assert.strictEqual(postRes.body.error, 'Review not found');

  const delRes = await request(app)
    .delete(`/reviews/${fakeId}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(404);

  assert.strictEqual(delRes.body.error, 'Review not found');
});

test('RV-LIKE-08: POST and DELETE return 400 for invalid review id format', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const postRes = await request(app)
    .post('/reviews/invalid-id-123/like')
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(400);

  assert.strictEqual(postRes.body.error, 'Invalid review id');

  const delRes = await request(app)
    .delete('/reviews/invalid-id-123/like')
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(400);

  assert.strictEqual(delRes.body.error, 'Invalid review id');
});

test('RV-LIKE-09: POST and DELETE return 401 when no token is provided', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const validId = new mongoose.Types.ObjectId().toString();

  await request(app)
    .post(`/reviews/${validId}/like`)
    .expect(401);

  await request(app)
    .delete(`/reviews/${validId}/like`)
    .expect(401);
});

test('RV-LIKE-10: GET /reviews/restaurant/:id includes likes count and does not expose likedBy array', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-privacy',
    rating: 4,
    comment: 'Privacy check'
  });

  await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  const res = await request(app)
    .get('/reviews/restaurant/rest-privacy')
    .expect(200);

  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].likes, 1);
  assert.strictEqual(res.body[0].likedBy, undefined);
});

test('RV-LIKE-11: Backward compatibility: like legacy review created without likes/likedBy fields', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  // Insert raw document directly to collection without Schema defaults
  const legacyDoc = await Review.collection.insertOne({
    userId: 'legacy-author',
    restaurantId: 'legacy-rest',
    rating: 5,
    comment: 'Old review'
  });

  const res = await request(app)
    .post(`/reviews/${legacyDoc.insertedId}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  assert.strictEqual(res.body.liked, true);
  assert.strictEqual(res.body.likes, 1);

  const updated = await Review.findById(legacyDoc.insertedId);
  assert.strictEqual(updated?.likes, 1);
});

test('RV-LIKE-12: Concurrent duplicate POST /reviews/:id/like requests result in only 1 like increment and 1 likedBy entry', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Great!'
  });

  const [res1, res2] = await Promise.all([
    request(app)
      .post(`/reviews/${review._id}/like`)
      .set('Authorization', `Bearer ${createToken('user-1')}`),
    request(app)
      .post(`/reviews/${review._id}/like`)
      .set('Authorization', `Bearer ${createToken('user-1')}`)
  ]);

  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res1.body.liked, true);
  assert.strictEqual(res2.body.liked, true);
  assert.strictEqual(res1.body.likes, 1);
  assert.strictEqual(res2.body.likes, 1);

  const updated = await Review.findById(review._id).select('+likedBy');
  assert.strictEqual(updated?.likes, 1);
  assert.deepStrictEqual(updated?.likedBy, ['user-1']);
});

test('RV-LIKE-13: Concurrent duplicate DELETE /reviews/:id/like requests result in only 1 like decrement', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const review = await Review.create({
    userId: 'author-1',
    restaurantId: 'rest-1',
    rating: 5,
    comment: 'Great!'
  });

  await request(app)
    .post(`/reviews/${review._id}/like`)
    .set('Authorization', `Bearer ${createToken('user-1')}`)
    .expect(200);

  const [res1, res2] = await Promise.all([
    request(app)
      .delete(`/reviews/${review._id}/like`)
      .set('Authorization', `Bearer ${createToken('user-1')}`),
    request(app)
      .delete(`/reviews/${review._id}/like`)
      .set('Authorization', `Bearer ${createToken('user-1')}`)
  ]);

  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res1.body.liked, false);
  assert.strictEqual(res2.body.liked, false);
  assert.strictEqual(res1.body.likes, 0);
  assert.strictEqual(res2.body.likes, 0);

  const updated = await Review.findById(review._id).select('+likedBy');
  assert.strictEqual(updated?.likes, 0);
  assert.deepStrictEqual(updated?.likedBy, []);
});

