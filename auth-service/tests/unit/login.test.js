const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const User = require('../../src/models/User');

const SECRET = 'test-secret';
const credentials = { email: 'diner@example.com', password: 'password123' };
let mongo;

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => request(app).post('/auth/register').send({ ...credentials, name: 'Diner' }));
afterEach(() => User.deleteMany({}));

describe('POST /auth/login', () => {
  test('AU-01 logs in with correct credentials and returns a 1h HS256 token', async () => {
    const res = await request(app).post('/auth/login').send(credentials);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: credentials.email, name: 'Diner', role: 'user' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);

    const { header, payload } = jwt.verify(res.body.token, SECRET, { algorithms: ['HS256'], complete: true });
    expect(header.alg).toBe('HS256');
    expect(payload).toMatchObject({ sub: String(res.body.user.id), email: credentials.email, role: 'user' });
    expect(payload.exp - payload.iat).toBe(3600);
  });

  test('accepts the email in a different case', async () => {
    const res = await request(app).post('/auth/login').send({ ...credentials, email: 'DINER@Example.com' });
    expect(res.status).toBe(200);
  });

  test('AU-02 rejects a wrong password with 401', async () => {
    const res = await request(app).post('/auth/login').send({ ...credentials, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('returns the same 401 body for an unknown email and a wrong password', async () => {
    const unknown = await request(app).post('/auth/login').send({ email: 'nobody@example.com', password: 'password123' });
    const wrong = await request(app).post('/auth/login').send({ ...credentials, password: 'wrong-password' });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  test.each([
    ['missing body', undefined],
    ['missing password', { email: credentials.email }],
    ['missing email', { password: credentials.password }],
    ['non-string values', { email: { $ne: '' }, password: { $ne: '' } }],
  ])('rejects %s with 401', async (_label, body) => {
    const res = await request(app).post('/auth/login').send(body);
    expect(res.status).toBe(401);
  });
});
