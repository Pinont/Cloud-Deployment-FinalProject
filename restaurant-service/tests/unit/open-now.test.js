const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'test-secret';
const app = require('../../src/app');
const Restaurant = require('../../src/models/restaurant');
const hours = require('../../src/utils/hours');

let mongod;

const token = (sub = 'owner-1') => `Bearer ${jwt.sign({ sub }, process.env.JWT_SECRET)}`;
const at = (time) => jest.spyOn(hours, 'currentTime').mockReturnValue(time);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

beforeEach(() =>
  Restaurant.create([
    { name: 'Lunch', priceRange: 1, ownerId: 'u1', openTime: '10:00', closeTime: '15:00', avgRating: 3 },
    { name: 'Night Bar', priceRange: 2, ownerId: 'u1', openTime: '18:00', closeTime: '02:00', avgRating: 5 },
    { name: 'Always', priceRange: 2, ownerId: 'u1', openTime: '00:00', closeTime: '00:00', avgRating: 4 },
    { name: 'No Hours', priceRange: 2, ownerId: 'u1' },
  ]),
);

afterEach(async () => {
  jest.restoreAllMocks();
  await Restaurant.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const names = (res) => res.body.map((r) => r.name).sort();

describe('GET /restaurants?openNow=true', () => {
  test('at 12:00 → lunch place and 24-hour place', async () => {
    at('12:00');
    const res = await request(app).get('/restaurants?openNow=true');

    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Always', 'Lunch']);
  });

  test('after midnight (01:30) → place that closes at 02:00 is still open', async () => {
    at('01:30');
    const res = await request(app).get('/restaurants?openNow=true');
    expect(names(res)).toEqual(['Always', 'Night Bar']);
  });

  test('at closing time (02:00) → no longer open', async () => {
    at('02:00');
    const res = await request(app).get('/restaurants?openNow=true');
    expect(names(res)).toEqual(['Always']);
  });

  test('restaurants without opening hours are left out', async () => {
    at('12:00');
    const res = await request(app).get('/restaurants?openNow=true');
    expect(names(res)).not.toContain('No Hours');
  });

  test('works with other filters and sort', async () => {
    at('23:00');
    const res = await request(app).get('/restaurants?openNow=true&price=2&sort=rating');
    expect(res.body.map((r) => r.name)).toEqual(['Night Bar', 'Always']);
  });

  test('without openNow → all restaurants', async () => {
    const res = await request(app).get('/restaurants');
    expect(res.body).toHaveLength(4);
  });

  test.each(['false', 'yes', ''])('openNow=%s → 400', async (value) => {
    const res = await request(app).get(`/restaurants?openNow=${value}`);
    expect(res.status).toBe(400);
  });
});

describe('opening hours on POST / PUT', () => {
  test('POST stores openTime and closeTime', async () => {
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', token())
      .send({ name: 'Late', priceRange: 2, openTime: '17:00', closeTime: '01:00' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ openTime: '17:00', closeTime: '01:00' });
  });

  test.each([
    ['bad format', { openTime: '9:00', closeTime: '17:00' }],
    ['hour out of range', { openTime: '24:00', closeTime: '17:00' }],
    ['only openTime', { openTime: '09:00' }],
    ['only closeTime', { closeTime: '17:00' }],
  ])('POST with %s → 400', async (_, body) => {
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', token())
      .send({ name: 'X', priceRange: 1, ...body });

    expect(res.status).toBe(400);
  });

  test('owner updates opening hours with PUT', async () => {
    const lunch = await Restaurant.findOne({ name: 'Lunch' });
    const res = await request(app)
      .put(`/restaurants/${lunch.id}`)
      .set('Authorization', token('u1'))
      .send({ openTime: '11:00', closeTime: '16:00' });

    expect(res.status).toBe(200);
    const stored = await Restaurant.findById(lunch.id);
    expect(stored.openTime).toBe('11:00');
    expect(stored.closeTime).toBe('16:00');
  });

  test('PUT with an invalid time → 400, unchanged', async () => {
    const lunch = await Restaurant.findOne({ name: 'Lunch' });
    const res = await request(app)
      .put(`/restaurants/${lunch.id}`)
      .set('Authorization', token('u1'))
      .send({ closeTime: '25:00' });

    expect(res.status).toBe(400);
    const stored = await Restaurant.findById(lunch.id);
    expect(stored.closeTime).toBe('15:00');
  });
});
