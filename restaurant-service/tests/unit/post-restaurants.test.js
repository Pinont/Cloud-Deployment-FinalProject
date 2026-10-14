const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'test-secret';
const app = require('../../src/app');
const Restaurant = require('../../src/models/restaurant');

let mongod;

const tokenFor = (sub = 'user-1') =>
  jwt.sign({ sub, email: `${sub}@example.com`, role: 'user' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

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

describe('POST /restaurants', () => {
  const valid = { name: 'Shabu House', category: 'shabu', priceRange: 2 };

  test('creates a restaurant owned by the token user → 201', async () => {
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', `Bearer ${tokenFor('owner-42')}`)
      .send(valid);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Shabu House',
      category: 'shabu',
      priceRange: 2,
      ownerId: 'owner-42',
      avgRating: 0,
      reviewCount: 0,
    });
    expect(res.body.id).toBeDefined();
    expect(await Restaurant.countDocuments()).toBe(1);
  });

  test('ignores ownerId sent in the body', async () => {
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', `Bearer ${tokenFor('real-owner')}`)
      .send({ ...valid, ownerId: 'someone-else' });

    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe('real-owner');
  });

  test('RS-01: empty name → 400', async () => {
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ ...valid, name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(await Restaurant.countDocuments()).toBe(0);
  });

  test.each([0, 5, 2.5, '2', undefined])('priceRange %p → 400', async (priceRange) => {
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ ...valid, priceRange });

    expect(res.status).toBe(400);
  });

  test('no token → 401', async () => {
    const res = await request(app).post('/restaurants').send(valid);
    expect(res.status).toBe(401);
  });

  test('invalid token → 401', async () => {
    const bad = jwt.sign({ sub: 'x' }, 'wrong-secret');
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', `Bearer ${bad}`)
      .send(valid);
    expect(res.status).toBe(401);
  });

  test('malformed JSON → 400', async () => {
    const res = await request(app)
      .post('/restaurants')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  test('→ 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
