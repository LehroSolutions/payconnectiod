import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyProviderWebhook } from '../src/webhook.js';

test('verifies valid signatures', () => {
  const body = JSON.stringify({ event: 'payment.settled', id: 'evt-1' });
  const secret = 'top-secret';
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyProviderWebhook(body, signature, secret), true);
  assert.equal(verifyProviderWebhook(body, `sha256=${signature}`, secret), true);
});

test('rejects invalid signatures', () => {
  const body = JSON.stringify({ event: 'payment.failed', id: 'evt-2' });
  assert.equal(verifyProviderWebhook(body, '1234', 'top-secret'), false);
});
