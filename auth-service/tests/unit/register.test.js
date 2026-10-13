const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const User = require('../../src/models/User');

let mongo;
const valid = { email: 'Diner@Example.com', password: 'password123', name: 'Diner' };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(() => User.deleteMany({}));

describe('POST /auth/register', () => {
  test('returns 201 without passwordHash and stores a bcrypt hash', async () => {
    const res = await request(app).post('/auth/register').send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'diner@example.com', name: 'Diner', role: 'user' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    const stored = await User.findOne({ email: 'diner@example.com' });
    expect(stored.passwordHash).not.toBe(valid.password);
    expect(await bcrypt.compare(valid.password, stored.passwordHash)).toBe(true);
  });

  test('AU-03 rejects duplicate email with 409', async () => {
    await request(app).post('/auth/register').send(valid);
    const res = await request(app).post('/auth/register').send({ ...valid, email: 'diner@example.com' });
    expect(res.status).toBe(409);
    expect(await User.countDocuments()).toBe(1);
  });

  test('AU-04 rejects password shorter than 8 characters with 400', async () => {
    const res = await request(app).post('/auth/register').send({ ...valid, password: 'short12' });
    expect(res.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  test.each([
    ['invalid email', { email: 'not-an-email' }],
    ['missing email', { email: undefined }],
    ['empty name', { name: '   ' }],
    ['missing name', { name: undefined }],
    ['missing password', { password: undefined }],
  ])('rejects %s with 400', async (_label, override) => {
    const res = await request(app).post('/auth/register').send({ ...valid, ...override });
    expect(res.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  test('ignores a client-supplied role', async () => {
    const res = await request(app).post('/auth/register').send({ ...valid, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('user');
    expect((await User.findOne({})).role).toBe('user');
  });

  test('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
  });
});
