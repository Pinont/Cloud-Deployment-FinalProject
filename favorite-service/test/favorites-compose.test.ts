import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = process.env.INTEGRATION_BASE_URL;
const token = process.env.INTEGRATION_JWT;

test(
  'IT-03: POST /favorites returns 404 when the real restaurant service has no restaurant',
  { skip: !baseUrl || !token },
  async () => {
    const response = await fetch(`${baseUrl}/favorites`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ restaurantId: `missing-${Date.now()}` })
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: 'Restaurant not found' });
  }
);
