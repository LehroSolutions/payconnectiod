import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { amountToMinor } from '../src/routes/shared.js';

test('password hash round-trips and rejects wrong passwords', async () => {
  const hash = await hashPassword('correct-horse-battery-staple');
  assert.match(hash, /^scrypt\$/);

  const ok = await verifyPassword(hash, 'correct-horse-battery-staple');
  assert.equal(ok.ok, true);
  assert.equal(ok.migrated, false);

  const bad = await verifyPassword(hash, 'wrong-password');
  assert.equal(bad.ok, false);
});

test('salt reuse still verifies and produces distinct hashes per call', async () => {
  const first = await hashPassword('shared-password');
  const second = await hashPassword('shared-password');
  assert.notEqual(first, second);
  assert.equal((await verifyPassword(first, 'shared-password')).ok, true);
  assert.equal((await verifyPassword(second, 'shared-password')).ok, true);
});

test('legacy sha256 hashes migrate to scrypt on successful login', async () => {
  const { createHash } = await import('node:crypto');
  const salt = 'payconnectoid-salt';
  const legacy = createHash('sha256').update(`${salt}:legacy-password`).digest('hex');

  const migrated = await verifyPassword(legacy, 'legacy-password', { legacySalt: salt });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, true);
  assert.match(migrated.nextHash, /^scrypt\$/);
  assert.equal((await verifyPassword(migrated.nextHash, 'legacy-password')).ok, true);

  const rejected = await verifyPassword(legacy, 'nope', { legacySalt: salt });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.nextHash, null);
});

test('empty stored hash never authenticates', async () => {
  assert.deepEqual(await verifyPassword('', 'anything'), {
    ok: false,
    nextHash: null,
    migrated: false,
  });
  assert.equal((await verifyPassword(null, 'anything')).ok, false);
});

test('decimal string amounts convert to minor units without float drift', () => {
  assert.equal(amountToMinor('10.50'), 1050);
  assert.equal(amountToMinor('0.01'), 1);
  assert.equal(amountToMinor('1234567.89'), 123456789);
  assert.equal(amountToMinor('100'), 10000);
  assert.equal(amountToMinor(' 12.34 '), 1234);
  assert.equal(amountToMinor(10.5), 1050);
  assert.equal(amountToMinor(0.1), 10);
});

test('amounts that are not exactly representable in minor units are rejected', () => {
  // Silent rounding of money is a reconciliation-dispute generator: 8.115 has no
  // exact minor-unit form, so it must fail loudly rather than become 811 or 812.
  assert.equal(amountToMinor('8.115'), null);
  assert.equal(amountToMinor('1.005'), null);
  assert.equal(amountToMinor(8.115), null);
  assert.equal(amountToMinor(1.005), null);
});

test('non-decimal amounts are rejected rather than silently coerced', () => {
  assert.equal(amountToMinor('abc'), null);
  assert.equal(amountToMinor(''), null);
  assert.equal(amountToMinor('   '), null);
  assert.equal(amountToMinor(null), null);
  assert.equal(amountToMinor(undefined), null);
  assert.equal(amountToMinor(Number.NaN), null);
});
