const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'test-secret';
const app = require('../../src/app');
const Restaurant = require('../../src/models/restaurant');

let mongod;

const seed = () =>
  Restaurant.create([
    { name: 'Thai Two', category: 'thai', priceRange: 2, ownerId: 'u1', avgRating: 3.5, reviewCount: 4 },
    { name: 'Thai Two Best', category: 'thai', priceRange: 2, ownerId: 'u1', avgRating: 4.8, reviewCount: 10 },
    { name: 'Thai Cheap', category: 'thai', priceRange: 1, ownerId: 'u2', avgRating: 5, reviewCount: 1 },
    { name: 'Shabu House', category: 'shabu', priceRange: 2, ownerId: 'u2', avgRating: 4.9, reviewCount: 7 },
    { name: 'Thai New', category: 'thai', priceRange: 2, ownerId: 'u3' },
  ]);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

beforeEach(seed);

afterEach(async () => {
  await Restaurant.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('GET /restaurants', () => {
  test('RS-02: category + price + sort=rating → only matches, by avgRating desc', async () => {
    const res = await request(app).get('/restaurants?category=thai&price=2&sort=rating');

    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.name)).toEqual(['Thai Two Best', 'Thai Two', 'Thai New']);
  });

  test('category filter returns only that category', async () => {
    const res = await request(app).get('/restaurants?category=shabu');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'Shabu House', category: 'shabu' });
  });

  test('category filter is case-insensitive', async () => {
    const res = await request(app).get('/restaurants?category=SHABU');
    expect(res.body).toHaveLength(1);
  });

  test('price filter returns only that price range', async () => {
    const res = await request(app).get('/restaurants?price=1');

    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.name)).toEqual(['Thai Cheap']);
  });

  test('sort=rating orders all restaurants by avgRating desc', async () => {
    const res = await request(app).get('/restaurants?sort=rating');
    const ratings = res.body.map((r) => r.avgRating);

    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
    expect(res.body[0].name).toBe('Thai Cheap');
  });

  test('no query → all restaurants, no token needed', async () => {
    const res = await request(app).get('/restaurants');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0].id).toBeDefined();
  });

  test('no sort → newest first', async () => {
    await Restaurant.deleteMany({});
    await Restaurant.create([
      { name: 'Old', priceRange: 1, ownerId: 'u1', createdAt: new Date('2026-01-01') },
      { name: 'Newest', priceRange: 1, ownerId: 'u1', createdAt: new Date('2026-03-01') },
      { name: 'Middle', priceRange: 1, ownerId: 'u1', createdAt: new Date('2026-02-01') },
    ]);

    const res = await request(app).get('/restaurants');
    expect(res.body.map((r) => r.name)).toEqual(['Newest', 'Middle', 'Old']);
  });

  test('sort=rating breaks ties by reviewCount desc', async () => {
    await Restaurant.deleteMany({});
    await Restaurant.create([
      { name: 'Few reviews', priceRange: 1, ownerId: 'u1', avgRating: 4, reviewCount: 2 },
      { name: 'Many reviews', priceRange: 1, ownerId: 'u1', avgRating: 4, reviewCount: 20 },
      { name: 'Top', priceRange: 1, ownerId: 'u1', avgRating: 4.5, reviewCount: 1 },
    ]);

    const res = await request(app).get('/restaurants?sort=rating');
    expect(res.body.map((r) => r.name)).toEqual(['Top', 'Many reviews', 'Few reviews']);
  });

  test('no match → 200 with an empty list', async () => {
    const res = await request(app).get('/restaurants?category=pizza');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test.each(['0', '5', '2.5', 'abc'])('price=%s → 400', async (price) => {
    const res = await request(app).get(`/restaurants?price=${price}`);
    expect(res.status).toBe(400);
  });

  test('empty category → 400', async () => {
    const res = await request(app).get('/restaurants?category=');
    expect(res.status).toBe(400);
  });

  test('unknown sort → 400', async () => {
    const res = await request(app).get('/restaurants?sort=name');
    expect(res.status).toBe(400);
  });
});
