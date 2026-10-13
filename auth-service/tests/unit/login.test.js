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

describe('account lockout', () => {
  const wrong = { ...credentials, password: 'wrong-password' };
  const failTimes = async (n) => {
    for (let i = 0; i < n; i += 1) {
      await request(app).post('/auth/login').send(wrong);
    }
  };

  test('failedLogins increments on a wrong password and resets on success', async () => {
    await failTimes(2);
    expect((await User.findOne({ email: credentials.email })).failedLogins).toBe(2);
    const ok = await request(app).post('/auth/login').send(credentials);
    expect(ok.status).toBe(200);
    expect((await User.findOne({ email: credentials.email })).failedLogins).toBe(0);
  });

  test('4 failures do not lock the account', async () => {
    await failTimes(4);
    const res = await request(app).post('/auth/login').send(credentials);
    expect(res.status).toBe(200);
  });

  test('5 failures lock the account even for the right password', async () => {
    await failTimes(5);
    const res = await request(app).post('/auth/login').send(credentials);
    expect(res.status).toBe(423);
    expect(res.body.token).toBeUndefined();
    const user = await User.findOne({ email: credentials.email });
    const msLeft = user.lockUntil.getTime() - Date.now();
    expect(msLeft).toBeGreaterThan(14 * 60 * 1000);
    expect(msLeft).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  test('the account unlocks once the 15 minutes have passed', async () => {
    await failTimes(5);
    await User.updateOne({ email: credentials.email }, { lockUntil: new Date(Date.now() - 1000) });
    const res = await request(app).post('/auth/login').send(credentials);
    expect(res.status).toBe(200);
    const user = await User.findOne({ email: credentials.email });
    expect(user.failedLogins).toBe(0);
    expect(user.lockUntil).toBeNull();
  });

  test('a wrong password after an expired lock starts a fresh count', async () => {
    await failTimes(5);
    await User.updateOne({ email: credentials.email }, { lockUntil: new Date(Date.now() - 1000) });
    await failTimes(1);
    const user = await User.findOne({ email: credentials.email });
    expect(user.failedLogins).toBe(1);
    expect(user.lockUntil).toBeNull();
  });

  describe('parallel logins', () => {
    const attempt = (password) => request(app).post('/auth/login').send({ ...credentials, password });
    const state = async () => User.findOne({ email: credentials.email });

    test('parallel wrong passwords all count and lock the account', async () => {
      await Promise.all(Array.from({ length: 6 }, () => attempt('wrong-password')));
      const user = await state();
      expect(user.failedLogins).toBeGreaterThanOrEqual(5);
      expect(user.lockUntil).not.toBeNull();
    });

    test('parallel wrong passwords after an expired lock still lock the account', async () => {
      await failTimes(5);
      await User.updateOne({ email: credentials.email }, { lockUntil: new Date(Date.now() - 1000) });
      await Promise.all(Array.from({ length: 5 }, () => attempt('wrong-password')));
      const user = await state();
      expect(user.failedLogins).toBe(5);
      expect(user.lockUntil).not.toBeNull();
    });

    test('a correct password gets no token when a parallel failure locks the account after the first lock check', async () => {
      const stale = await state();
      await User.updateOne({ email: credentials.email }, { failedLogins: 5, lockUntil: new Date(Date.now() + 15 * 60 * 1000) });
      const spy = jest.spyOn(User, 'findOne').mockResolvedValueOnce(stale);
      const res = await attempt(credentials.password);
      spy.mockRestore();
      expect(res.status).toBe(423);
      expect(res.body.token).toBeUndefined();
    });

    test('a success overlapping the 5th failure never leaves a lock out of step with the count', async () => {
      await failTimes(4);
      await Promise.all([attempt('wrong-password'), attempt(credentials.password)]);
      const user = await state();
      expect(user.failedLogins >= 5).toBe(user.lockUntil !== null);
    });
  });
});
