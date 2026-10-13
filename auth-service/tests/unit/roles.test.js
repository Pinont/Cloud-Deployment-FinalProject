const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const User = require('../../src/models/User');

const SECRET = 'test-secret';
const password = 'password123';
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

afterEach(() => User.deleteMany({}));

// Registers a user, optionally sets its role directly in the database, and logs in.
async function makeUser(email, role = 'user') {
  await request(app).post('/auth/register').send({ email, password, name: email });
  await User.updateOne({ email }, { role });
  const { body } = await request(app).post('/auth/login').send({ email, password });
  return { id: String(body.user.id), token: body.token, email };
}

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const setRole = (caller, targetId, role) => request(app)
  .put(`/auth/users/${targetId}/role`)
  .set(bearer(caller.token))
  .send({ role });

describe('PUT /auth/users/:id/role', () => {
  test('an admin can make a user an owner, and their next token carries the role', async () => {
    const admin = await makeUser('admin@example.com', 'admin');
    const diner = await makeUser('diner@example.com');
    const res = await setRole(admin, diner.id, 'owner');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: diner.email, role: 'owner' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);

    const login = await request(app).post('/auth/login').send({ email: diner.email, password });
    expect(jwt.verify(login.body.token, SECRET).role).toBe('owner');
  });

  test('an admin can make a user an admin and demote an owner back to user', async () => {
    const admin = await makeUser('admin@example.com', 'admin');
    const owner = await makeUser('owner@example.com', 'owner');
    expect((await setRole(admin, owner.id, 'admin')).body.role).toBe('admin');
    expect((await setRole(admin, owner.id, 'user')).body.role).toBe('user');
  });

  test.each(['user', 'owner'])('a %s cannot change roles → 403', async (role) => {
    const caller = await makeUser(`${role}@example.com`, role);
    const target = await makeUser('target@example.com');
    const res = await setRole(caller, target.id, 'admin');
    expect(res.status).toBe(403);
    expect((await User.findById(target.id)).role).toBe('user');
  });

  test('without a token → 401', async () => {
    const target = await makeUser('target@example.com');
    const res = await request(app).put(`/auth/users/${target.id}/role`).send({ role: 'admin' });
    expect(res.status).toBe(401);
  });

  test('an admin demoted in the database loses access even with an older admin token → 403', async () => {
    const admin = await makeUser('admin@example.com', 'admin');
    const target = await makeUser('target@example.com');
    await User.updateOne({ email: admin.email }, { role: 'user' });
    const res = await setRole(admin, target.id, 'owner');
    expect(res.status).toBe(403);
    expect((await User.findById(target.id)).role).toBe('user');
  });

  test.each([['superuser'], [''], [undefined], [5]])('invalid role %j → 400', async (role) => {
    const admin = await makeUser('admin@example.com', 'admin');
    const target = await makeUser('target@example.com');
    const res = await setRole(admin, target.id, role);
    expect(res.status).toBe(400);
  });

  test('malformed user id → 400', async () => {
    const admin = await makeUser('admin@example.com', 'admin');
    const res = await setRole(admin, 'not-an-id', 'owner');
    expect(res.status).toBe(400);
  });

  test('unknown user id → 404', async () => {
    const admin = await makeUser('admin@example.com', 'admin');
    const res = await setRole(admin, String(new mongoose.Types.ObjectId()), 'owner');
    expect(res.status).toBe(404);
  });

  test('an admin cannot change their own role → 400', async () => {
    const admin = await makeUser('admin@example.com', 'admin');
    const res = await setRole(admin, admin.id, 'user');
    expect(res.status).toBe(400);
    expect((await User.findById(admin.id)).role).toBe('admin');
  });

  test('role cannot be changed through PUT /auth/me', async () => {
    const diner = await makeUser('diner@example.com');
    await request(app).put('/auth/me').set(bearer(diner.token)).send({ name: 'Diner', role: 'admin' });
    expect((await User.findById(diner.id)).role).toBe('user');
  });
});
