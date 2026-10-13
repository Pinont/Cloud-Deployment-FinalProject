const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const User = require('../../src/models/User');

const SECRET = 'test-secret';
const refreshKey = crypto.createHmac('sha256', SECRET).update('refresh').digest('hex');
const credentials = { email: 'diner@example.com', password: 'password123' };
let mongo;
let login;

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
  login = (await request(app).post('/auth/login').send(credentials)).body;
});
afterEach(() => User.deleteMany({}));

const refresh = (body) => request(app).post('/auth/refresh').send(body);

describe('POST /auth/refresh', () => {
  test('login also returns a refresh token', () => {
    expect(typeof login.refreshToken).toBe('string');
    const payload = jwt.verify(login.refreshToken, refreshKey, { algorithms: ['HS256'] });
    expect(payload.sub).toBe(String(login.user.id));
    expect(payload.exp - payload.iat).toBe(604800);
  });

  test('the refresh token is not accepted as an access token', () => {
    expect(() => jwt.verify(login.refreshToken, SECRET)).toThrow();
  });

  test('exchanges a valid refresh token for a new 1h access token', async () => {
    const res = await refresh({ refreshToken: login.refreshToken });
    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, SECRET, { algorithms: ['HS256'] });
    expect(payload).toMatchObject({ sub: String(login.user.id), email: credentials.email, role: 'user' });
    expect(payload.exp - payload.iat).toBe(3600);
  });

  test('an access token is not accepted as a refresh token', async () => {
    const res = await refresh({ refreshToken: login.token });
    expect(res.status).toBe(401);
  });

  test('expired refresh token → 401', async () => {
    const expired = jwt.sign({ sub: login.user.id }, refreshKey, { algorithm: 'HS256', expiresIn: -10 });
    const res = await refresh({ refreshToken: expired });
    expect(res.status).toBe(401);
  });

  test.each([[{}], [{ refreshToken: 'not.a.token' }], [{ refreshToken: 5 }]])('invalid body %j → 401', async (body) => {
    const res = await refresh(body);
    expect(res.status).toBe(401);
  });

  test('refresh token for a deleted user → 401', async () => {
    await User.deleteMany({});
    const res = await refresh({ refreshToken: login.refreshToken });
    expect(res.status).toBe(401);
  });
});
