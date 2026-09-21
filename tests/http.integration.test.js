import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.js';

test('cors preflight responds for configured origins', async () => {
  const app = await startTestServer({
    corsOrigins: ['http://localhost:3000'],
  });

  try {
    const response = await fetch(`${app.baseUrl}/api/v2/payments`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.match(response.headers.get('access-control-allow-methods') || '', /POST/);
  } finally {
    await app.close();
  }
});

test('request body size limit returns 413', async () => {
  const app = await startTestServer({
    bodyLimitBytes: 128,
  });

  try {
    const response = await fetch(`${app.baseUrl}/api/ai/risk-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(512) }),
    });

    assert.equal(response.status, 413);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'PAYLOAD_TOO_LARGE');
  } finally {
    await app.close();
  }
});
