const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'test-secret';
const app = require('../../src/app');
const Restaurant = require('../../src/models/restaurant');

let mongod;
let restaurant;

const tokenFor = (sub) =>
  jwt.sign({ sub, email: `${sub}@example.com`, role: 'user' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
const ownerToken = () => tokenFor('owner-1');
const otherToken = () => tokenFor('someone-else');

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

beforeEach(async () => {
  restaurant = await Restaurant.create({
    name: 'Shabu House',
    category: 'shabu',
    priceRange: 2,
    address: 'Bangkok',
    ownerId: 'owner-1',
    avgRating: 4.5,
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

describe('RS-03: a user who is not the owner', () => {
  test('PUT → 403, restaurant unchanged', async () => {
    const res = await request(app)
      .put(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${otherToken()}`)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
    const stored = await Restaurant.findById(restaurant.id);
    expect(stored.name).toBe('Shabu House');
  });

  test('DELETE → 403, restaurant still exists', async () => {
    const res = await request(app)
      .delete(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${otherToken()}`);

    expect(res.status).toBe(403);
    expect(await Restaurant.findById(restaurant.id)).not.toBeNull();
  });
});

describe('PUT /restaurants/:id', () => {
  test('owner updates the given fields → 200, others unchanged', async () => {
    const res = await request(app)
      .put(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Shabu House 2', priceRange: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: restaurant.id,
      name: 'Shabu House 2',
      priceRange: 3,
      category: 'shabu',
      address: 'Bangkok',
    });
    const stored = await Restaurant.findById(restaurant.id);
    expect(stored.name).toBe('Shabu House 2');
    expect(stored.priceRange).toBe(3);
  });

  test('owner updates category and address → 200, saved', async () => {
    const res = await request(app)
      .put(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ category: 'Thai', address: 'Chiang Mai' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ category: 'thai', address: 'Chiang Mai', name: 'Shabu House' });
    const stored = await Restaurant.findById(restaurant.id);
    expect(stored.category).toBe('thai');
    expect(stored.address).toBe('Chiang Mai');
  });

  test('owner cannot change ownerId, avgRating or reviewCount', async () => {
    const res = await request(app)
      .put(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Renamed', ownerId: 'thief', avgRating: 5, reviewCount: 999 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ownerId: 'owner-1', avgRating: 4.5, reviewCount: 3 });
  });

  test('only non-editable fields → 400', async () => {
    const res = await request(app)
      .put(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ ownerId: 'thief' });

    expect(res.status).toBe(400);
  });

  test('empty name → 400', async () => {
    const res = await request(app)
      .put(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: '  ' });

    expect(res.status).toBe(400);
  });

  test.each([0, 5, 2.5, '3'])('priceRange %p → 400', async (priceRange) => {
    const res = await request(app)
      .put(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ priceRange });

    expect(res.status).toBe(400);
    const stored = await Restaurant.findById(restaurant.id);
    expect(stored.priceRange).toBe(2);
  });

  test('no token → 401', async () => {
    const res = await request(app).put(`/restaurants/${restaurant.id}`).send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  test('unknown id → 404', async () => {
    const res = await request(app)
      .put(`/restaurants/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  test('malformed id → 404', async () => {
    const res = await request(app)
      .put('/restaurants/not-an-id')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /restaurants/:id', () => {
  test('owner deletes → 200, restaurant removed', async () => {
    const res = await request(app)
      .delete(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(restaurant.id);
    expect(await Restaurant.findById(restaurant.id)).toBeNull();
  });

  test('no token → 401', async () => {
    const res = await request(app).delete(`/restaurants/${restaurant.id}`);
    expect(res.status).toBe(401);
    expect(await Restaurant.findById(restaurant.id)).not.toBeNull();
  });

  test('unknown id → 404', async () => {
    const res = await request(app)
      .delete(`/restaurants/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(404);
  });

  test('database failure → 500', async () => {
    const spy = jest.spyOn(Restaurant, 'findById').mockRejectedValueOnce(new Error('db down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .delete(`/restaurants/${restaurant.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(500);
    spy.mockRestore();
    consoleSpy.mockRestore();
  });
});
