const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'test-secret';
const app = require('../../src/app');
const Restaurant = require('../../src/models/restaurant');

let mongod;

const token = (sub = 'owner-1') => `Bearer ${jwt.sign({ sub }, process.env.JWT_SECRET)}`;

// Searching from Siam, Bangkok (13.7456, 100.5341).
const SIAM = 'lat=13.7456&lng=100.5341';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

beforeEach(() =>
  Restaurant.create([
    // ~6.3 km from Siam
    { name: 'Chatuchak', category: 'thai', priceRange: 1, ownerId: 'u1', lat: 13.7999, lng: 100.55, avgRating: 5 },
    // ~1.9 km
    { name: 'Silom', category: 'thai', priceRange: 2, ownerId: 'u1', lat: 13.7286, lng: 100.534, avgRating: 3 },
    // ~0.1 km
    { name: 'Siam Square', category: 'cafe', priceRange: 2, ownerId: 'u1', lat: 13.7451, lng: 100.5333, avgRating: 4 },
    // ~580 km
    { name: 'Chiang Mai', category: 'thai', priceRange: 2, ownerId: 'u1', lat: 18.7883, lng: 98.9853, avgRating: 5 },
    { name: 'No Location', category: 'thai', priceRange: 2, ownerId: 'u1' },
  ]),
);

afterEach(async () => {
  await Restaurant.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('GET /restaurants?lat=&lng=&radius=', () => {
  test('returns restaurants within the radius, nearest first, with distanceKm', async () => {
    const res = await request(app).get(`/restaurants?${SIAM}&radius=10`);

    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.name)).toEqual(['Siam Square', 'Silom', 'Chatuchak']);
    expect(res.body[1].distanceKm).toBeCloseTo(1.89, 1);
    expect(res.body[0].id).toBeDefined();
  });

  test('default radius is 5 km', async () => {
    const res = await request(app).get(`/restaurants?${SIAM}`);
    expect(res.body.map((r) => r.name)).toEqual(['Siam Square', 'Silom']);
  });

  test('small radius leaves out farther places', async () => {
    const res = await request(app).get(`/restaurants?${SIAM}&radius=1`);
    expect(res.body.map((r) => r.name)).toEqual(['Siam Square']);
  });

  test('restaurants without coordinates are left out', async () => {
    const res = await request(app).get(`/restaurants?${SIAM}&radius=50`);
    expect(res.body.map((r) => r.name)).not.toContain('No Location');
  });

  test('works with category and price filters', async () => {
    const res = await request(app).get(`/restaurants?${SIAM}&radius=10&category=thai&price=2`);
    expect(res.body.map((r) => r.name)).toEqual(['Silom']);
  });

  test('sort=rating orders the nearby results by rating instead', async () => {
    const res = await request(app).get(`/restaurants?${SIAM}&radius=10&sort=rating`);
    expect(res.body.map((r) => r.name)).toEqual(['Chatuchak', 'Siam Square', 'Silom']);
  });

  test('without coordinates → normal list, no distanceKm', async () => {
    const res = await request(app).get('/restaurants');
    expect(res.body).toHaveLength(5);
    expect(res.body[0].distanceKm).toBeUndefined();
  });

  test.each([
    ['only lat', 'lat=13.7'],
    ['only lng', 'lng=100.5'],
    ['empty lat', 'lat=&lng=100.5'],
    ['lat not a number', 'lat=abc&lng=100.5'],
    ['lat out of range', 'lat=91&lng=100.5'],
    ['lng out of range', 'lat=13.7&lng=181'],
    ['radius without coordinates', 'radius=5'],
    ['radius 0', `${SIAM}&radius=0`],
    ['radius negative', `${SIAM}&radius=-1`],
    ['radius too large', `${SIAM}&radius=51`],
    ['radius not a number', `${SIAM}&radius=far`],
  ])('%s → 400', async (_, query) => {
    const res = await request(app).get(`/restaurants?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('coordinates on POST / PUT', () => {
  test('POST stores lat and lng', async () => {
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', token())
      .send({ name: 'New', priceRange: 1, lat: 13.75, lng: 100.5 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ lat: 13.75, lng: 100.5 });
  });

  test.each([
    ['only lat', { lat: 13.75 }],
    ['only lng', { lng: 100.5 }],
    ['lat out of range', { lat: 100, lng: 100.5 }],
    ['lng out of range', { lat: 13.75, lng: 200 }],
    ['lat not a number', { lat: 'abc', lng: 100.5 }],
  ])('POST with %s → 400', async (_, body) => {
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', token())
      .send({ name: 'X', priceRange: 1, ...body });

    expect(res.status).toBe(400);
  });

  test('owner moves the restaurant with PUT', async () => {
    const silom = await Restaurant.findOne({ name: 'Silom' });
    const res = await request(app)
      .put(`/restaurants/${silom.id}`)
      .set('Authorization', token('u1'))
      .send({ lat: 13.7457, lng: 100.5342 });

    expect(res.status).toBe(200);
    const near = await request(app).get(`/restaurants?${SIAM}&radius=0.5`);
    expect(near.body.map((r) => r.name)).toContain('Silom');
  });
});
