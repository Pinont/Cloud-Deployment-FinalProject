const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'test-secret';
const app = require('../../src/app');
const Restaurant = require('../../src/models/restaurant');

let mongod;
let restaurant;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

beforeEach(async () => {
  restaurant = await Restaurant.create({
    name: 'Shabu House',
    category: 'shabu',
    priceRange: 2,
    ownerId: 'owner-1',
    avgRating: 4,
    reviewCount: 3,
  });
});

afterEach(async () => {
  await Restaurant.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const patch = (id, body) => request(app).patch(`/restaurants/${id}/rating`).send(body);

describe('PATCH /restaurants/:id/rating', () => {
  test('stores avgRating and reviewCount → 200', async () => {
    const res = await patch(restaurant.id, { avgRating: 4.3, reviewCount: 4 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: restaurant.id, avgRating: 4.3, reviewCount: 4 });
    const stored = await Restaurant.findById(restaurant.id);
    expect(stored.avgRating).toBe(4.3);
    expect(stored.reviewCount).toBe(4);
  });

  test('last review deleted: avgRating 0 and reviewCount 0 → 200', async () => {
    const res = await patch(restaurant.id, { avgRating: 0, reviewCount: 0 });

    expect(res.status).toBe(200);
    const stored = await Restaurant.findById(restaurant.id);
    expect(stored.avgRating).toBe(0);
    expect(stored.reviewCount).toBe(0);
  });

  test('only changes the rating fields', async () => {
    await patch(restaurant.id, { avgRating: 5, reviewCount: 1, name: 'Hacked', ownerId: 'x' });

    const stored = await Restaurant.findById(restaurant.id);
    expect(stored.name).toBe('Shabu House');
    expect(stored.ownerId).toBe('owner-1');
  });

  test('the new rating shows up in GET /restaurants?sort=rating', async () => {
    const other = await Restaurant.create({
      name: 'Other', priceRange: 1, ownerId: 'u2', avgRating: 4.5, reviewCount: 2,
    });
    await patch(restaurant.id, { avgRating: 4.9, reviewCount: 10 });

    const res = await request(app).get('/restaurants?sort=rating');
    expect(res.body.map((r) => r.id)).toEqual([restaurant.id, other.id]);
  });

  test('unknown id → 404', async () => {
    const res = await patch(new mongoose.Types.ObjectId(), { avgRating: 4, reviewCount: 1 });
    expect(res.status).toBe(404);
  });

  test('malformed id → 404', async () => {
    const res = await patch('not-an-id', { avgRating: 4, reviewCount: 1 });
    expect(res.status).toBe(404);
  });

  test.each([
    ['avgRating missing', { reviewCount: 1 }],
    ['reviewCount missing', { avgRating: 4 }],
    ['avgRating above 5', { avgRating: 5.1, reviewCount: 1 }],
    ['avgRating negative', { avgRating: -1, reviewCount: 1 }],
    ['avgRating as string', { avgRating: '4', reviewCount: 1 }],
    ['avgRating below 1 with reviews', { avgRating: 0.5, reviewCount: 2 }],
    ['avgRating not 0 with no reviews', { avgRating: 4, reviewCount: 0 }],
    ['reviewCount negative', { avgRating: 4, reviewCount: -1 }],
    ['reviewCount not an integer', { avgRating: 4, reviewCount: 1.5 }],
  ])('%s → 400, nothing stored', async (_, body) => {
    const res = await patch(restaurant.id, body);

    expect(res.status).toBe(400);
    const stored = await Restaurant.findById(restaurant.id);
    expect(stored.avgRating).toBe(4);
    expect(stored.reviewCount).toBe(3);
  });

  test('database failure → 500', async () => {
    const spy = jest
      .spyOn(Restaurant, 'findByIdAndUpdate')
      .mockRejectedValueOnce(new Error('db down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await patch(restaurant.id, { avgRating: 4, reviewCount: 1 });

    expect(res.status).toBe(500);
    spy.mockRestore();
    consoleSpy.mockRestore();
  });
});
