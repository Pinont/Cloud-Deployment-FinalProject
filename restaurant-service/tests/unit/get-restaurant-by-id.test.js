const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'test-secret';
const app = require('../../src/app');
const Restaurant = require('../../src/models/restaurant');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  await Restaurant.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('GET /restaurants/:id', () => {
  test('returns the restaurant document, no token needed', async () => {
    const created = await Restaurant.create({
      name: 'Shabu House',
      category: 'shabu',
      priceRange: 2,
      ownerId: 'owner-1',
      avgRating: 4.5,
      reviewCount: 3,
    });

    const res = await request(app).get(`/restaurants/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.id,
      name: 'Shabu House',
      category: 'shabu',
      priceRange: 2,
      ownerId: 'owner-1',
      avgRating: 4.5,
      reviewCount: 3,
    });
    expect(res.body._id).toBeUndefined();
  });

  test('unknown id → 404', async () => {
    const res = await request(app).get(`/restaurants/${new mongoose.Types.ObjectId()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('malformed id → 404 (callers treat it as "does not exist")', async () => {
    const res = await request(app).get('/restaurants/not-an-id');
    expect(res.status).toBe(404);
  });
});
