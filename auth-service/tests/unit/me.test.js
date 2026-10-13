const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const User = require('../../src/models/User');

const SECRET = 'test-secret';
const credentials = { email: 'diner@example.com', password: 'password123' };
let mongo;
let token;

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

beforeEach(async () => {
  await request(app).post('/auth/register').send({ ...credentials, name: 'Diner' });
  token = (await request(app).post('/auth/login').send(credentials)).body.token;
});
afterEach(() => User.deleteMany({}));

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe('JWT middleware', () => {
  test('IT-01 no token → 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('malformed header → 401', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', token);
    expect(res.status).toBe(401);
  });

  test('invalid token → 401', async () => {
    const res = await request(app).get('/auth/me').set(bearer('not.a.token'));
    expect(res.status).toBe(401);
  });

  test('token signed with another secret → 401', async () => {
    const forged = jwt.sign({ sub: 'x' }, 'other-secret', { algorithm: 'HS256' });
    const res = await request(app).get('/auth/me').set(bearer(forged));
    expect(res.status).toBe(401);
  });

  test('token signed with another algorithm (HS384) → 401', async () => {
    // Existing user's sub and the right secret: only the algorithm differs.
    const { sub, email, role } = jwt.decode(token);
    const other = jwt.sign({ sub, email, role }, SECRET, { algorithm: 'HS384' });
    const res = await request(app).get('/auth/me').set(bearer(other));
    expect(res.status).toBe(401);
  });

  test('expired token → 401', async () => {
    const expired = jwt.sign({ sub: 'x' }, SECRET, { algorithm: 'HS256', expiresIn: -10 });
    const res = await request(app).get('/auth/me').set(bearer(expired));
    expect(res.status).toBe(401);
  });

  test('valid token for a deleted user → 401', async () => {
    await User.deleteMany({});
    const res = await request(app).get('/auth/me').set(bearer(token));
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  test('returns the user without passwordHash', async () => {
    const res = await request(app).get('/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: credentials.email, name: 'Diner', role: 'user' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });
});

describe('PUT /auth/me', () => {
  test('updates the name', async () => {
    const res = await request(app).put('/auth/me').set(bearer(token)).send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    const me = await request(app).get('/auth/me').set(bearer(token));
    expect(me.body.name).toBe('New Name');
  });

  test('ignores email and role in the body', async () => {
    const res = await request(app)
      .put('/auth/me')
      .set(bearer(token))
      .send({ name: 'Diner', email: 'evil@example.com', role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: credentials.email, role: 'user' });
  });

  test.each([[{ name: '' }], [{ name: '   ' }], [{}], [{ name: 5 }]])('rejects %j with 400', async (body) => {
    const res = await request(app).put('/auth/me').set(bearer(token)).send(body);
    expect(res.status).toBe(400);
  });

  test('without a token → 401', async () => {
    const res = await request(app).put('/auth/me').send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});
