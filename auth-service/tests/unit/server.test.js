jest.mock('mongoose', () => ({ connect: jest.fn() }));
jest.mock('../../src/app', () => ({ listen: jest.fn() }));
jest.mock('../../src/models/User', () => ({ init: jest.fn() }));

const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/models/User');

const originalEnv = process.env;
const flushPromises = () => new Promise(setImmediate);

function startServer() {
  jest.isolateModules(() => require('../../src/server'));
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...originalEnv, PORT: '3001', MONGO_URI: 'mongodb://localhost/auth-test', JWT_SECRET: 'test-secret' };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process, 'exit').mockImplementation(() => {});
  mongoose.connect.mockResolvedValue(undefined);
  User.init.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

test('waits for the connection and unique email index before listening', async () => {
  let connected;
  let initialized;
  mongoose.connect.mockReturnValue(new Promise((resolve) => { connected = resolve; }));
  User.init.mockReturnValue(new Promise((resolve) => { initialized = resolve; }));

  startServer();
  expect(mongoose.connect).toHaveBeenCalledWith(process.env.MONGO_URI);
  expect(User.init).not.toHaveBeenCalled();
  expect(app.listen).not.toHaveBeenCalled();

  connected();
  await flushPromises();
  expect(User.init).toHaveBeenCalledTimes(1);
  expect(app.listen).not.toHaveBeenCalled();

  initialized();
  await flushPromises();
  expect(app.listen).toHaveBeenCalledTimes(1);
  expect(app.listen).toHaveBeenCalledWith('3001', expect.any(Function));
  expect(console.log).not.toHaveBeenCalled();
  app.listen.mock.calls[0][1]();
  expect(console.log).toHaveBeenCalledWith('auth-service listening on 3001');
  expect(process.exit).not.toHaveBeenCalled();
});

test.each([
  ['connection', () => mongoose.connect],
  ['index initialization', () => User.init],
])('exits without listening when %s fails', async (_label, getMock) => {
  const error = new Error('Startup failed');
  getMock().mockRejectedValue(error);

  startServer();
  await flushPromises();

  expect(app.listen).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith(error);
  expect(console.log).not.toHaveBeenCalled();
  expect(process.exit).toHaveBeenCalledWith(1);
});

test('exits without logging success when the listener fails', async () => {
  const error = Object.assign(new Error('Port in use'), { code: 'EADDRINUSE' });
  startServer();
  await flushPromises();
  app.listen.mock.calls[0][1](error);

  expect(console.error).toHaveBeenCalledWith(error);
  expect(console.log).not.toHaveBeenCalled();
  expect(process.exit).toHaveBeenCalledWith(1);
});
