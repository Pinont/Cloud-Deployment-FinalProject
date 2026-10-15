const { execFile } = require('child_process');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../src/models/User');

const SCRIPT = path.join(__dirname, '../../scripts/set-role.js');
const USAGE = 'Usage: MONGO_URI=... npm run set-role -- <email> <user|owner|admin>';
let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => User.create({ email: 'chef@example.com', passwordHash: 'x', name: 'Chef' }));
afterEach(() => User.deleteMany({}));

// Runs the script as the demo does and resolves with its exit code and output.
function runSetRole(args) {
  return new Promise((resolve) => {
    execFile('node', [SCRIPT, ...args], { env: { ...process.env, MONGO_URI: mongo.getUri() } },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

const storedRole = async () => (await User.findOne({ email: 'chef@example.com' })).role;

describe('set-role script', () => {
  it('AU-05 sets the role of a registered email', async () => {
    const result = await runSetRole(['chef@example.com', 'admin']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('chef@example.com is now admin');
    expect(await storedRole()).toBe('admin');
  });

  it('AU-05 matches the email case-insensitively', async () => {
    const result = await runSetRole(['  Chef@Example.com ', 'owner']);
    expect(result.code).toBe(0);
    expect(await storedRole()).toBe('owner');
  });

  it('AU-05 rejects an unknown email at the lookup, not at argument checking', async () => {
    const result = await runSetRole(['nobody@example.com', 'admin']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No user with email nobody@example.com');
    expect(result.stderr).not.toContain('Usage');
    expect(await storedRole()).toBe('user');
  });

  it('AU-05 rejects a role that does not exist', async () => {
    const result = await runSetRole(['chef@example.com', 'superuser']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(USAGE);
    expect(await storedRole()).toBe('user');
  });

  it('AU-05 prints the usage message when called without arguments', async () => {
    const result = await runSetRole([]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(USAGE);
    expect(await storedRole()).toBe('user');
  });
});
