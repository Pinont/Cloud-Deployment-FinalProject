import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app';

const TEST_JWT_SECRET = 'test-jwt-secret';

test('RV-APP-01: GET /health returns 200 with status ok', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const res = await request(app)
    .get('/health')
    .expect(200);

  assert.deepStrictEqual(res.body, { status: 'ok' });
});

test('RV-APP-02: Unknown route returns 404 with error Not found', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const res = await request(app)
    .get('/unknown-endpoint')
    .expect(404);

  assert.deepStrictEqual(res.body, { error: 'Not found' });
});

test('RV-APP-03: Invalid JSON body returns 400 with error Invalid JSON body', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const res = await request(app)
    .post('/reviews')
    .set('Content-Type', 'application/json')
    .send('{ invalid-json')
    .expect(400);

  assert.deepStrictEqual(res.body, { error: 'Invalid JSON body' });
});

test('RV-APP-04: createApp throws error if JWT_SECRET is not provided', () => {
  const originalEnv = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;

  try {
    assert.throws(
      () => {
        createApp({ jwtSecret: '' });
      },
      { message: 'JWT_SECRET must be set' }
    );
  } finally {
    process.env.JWT_SECRET = originalEnv;
  }
});

test('RV-APP-05: Payload larger than 100kb returns 413 Payload Too Large', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });
  const largePayload = JSON.stringify({ comment: 'x'.repeat(105 * 1024) });

  const res = await request(app)
    .post('/reviews')
    .set('Content-Type', 'application/json')
    .send(largePayload)
    .expect(413);

  assert.strictEqual(res.status, 413);
  assert.ok(res.body.error);
});

test('RV-APP-06: Unsupported content-encoding returns 415 Unsupported Media Type', async () => {
  const app = createApp({ jwtSecret: TEST_JWT_SECRET });

  const res = await request(app)
    .post('/reviews')
    .set('Content-Type', 'application/json')
    .set('Content-Encoding', 'invalid-encoding')
    .send('{"comment": "test"}')
    .expect(415);

  assert.strictEqual(res.status, 415);
  assert.ok(res.body.error);
});

