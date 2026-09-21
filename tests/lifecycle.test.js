import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, normalizeProviderStatus } from '../src/lifecycle.js';

test('enforces lifecycle transition matrix', () => {
  assert.equal(canTransition('initiated', 'authorized'), true);
  assert.equal(canTransition('authorized', 'settled'), true);
  assert.equal(canTransition('authorized', 'failed'), true);
  assert.equal(canTransition('initiated', 'settled'), false);
});

test('normalizes provider statuses into canonical lifecycle values', () => {
  assert.equal(normalizeProviderStatus('approved'), 'authorized');
  assert.equal(normalizeProviderStatus('authorised'), 'authorized');
  assert.equal(normalizeProviderStatus('authorized'), 'authorized');
  assert.equal(normalizeProviderStatus('captured'), 'settled');
  assert.equal(normalizeProviderStatus('declined'), 'failed');
  assert.equal(normalizeProviderStatus('pending'), 'initiated');
});
