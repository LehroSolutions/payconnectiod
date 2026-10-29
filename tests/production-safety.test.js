import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeJsonAtomic } from '../src/persistence.js';
import { reserveIdempotencyKey, cleanupExpiredIdempotency } from '../src/idempotency.js';
import { performRefund } from '../src/refunds.js';
import { createAppServer } from '../app/server.js';
import { startTestServer } from './helpers/server.js';

test('reserved payment keys cannot race or expire before reconciliation', () => {
  const records = [];
  const input = { key: 'same', payloadHash: 'hash', nowMs: 0, ttlHours: 1 };
  assert.equal(reserveIdempotencyKey(records, input).accepted, true);
  assert.equal(reserveIdempotencyKey(records, input).reason, 'in-progress');
  cleanupExpiredIdempotency(records, 7200000);
  assert.equal(records.length, 1);
});

test('concurrent refunds reserve the balance before the provider and replay safely', async () => {
  const payment = {
    status: 'settled',
    amountMinor: 1000,
    refundedAmountMinor: 0,
    providerRef: 'provider',
    refunds: [],
  };
  let release;
  let calls = 0;
  const adapter = {
    refund: async () => {
      calls++;
      await new Promise((resolve) => {
        release = resolve;
      });
      return { status: 'pending' };
    },
  };
  const runtime = { persist: async () => {} };
  const first = performRefund(
    runtime,
    payment,
    { amountMinor: 600, idempotencyKey: 'first' },
    adapter,
  );
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    performRefund(runtime, payment, { amountMinor: 600, idempotencyKey: 'first' }, adapter),
    { code: 'REFUND_RECONCILIATION_REQUIRED' },
  );
  await assert.rejects(
    performRefund(runtime, payment, { amountMinor: 600, idempotencyKey: 'second' }, adapter),
    { code: 'REFUND_EXCEEDS_REMAINING' },
  );
  release();
  await first;
  const replay = await performRefund(
    runtime,
    payment,
    { amountMinor: 600, idempotencyKey: 'first' },
    adapter,
  );
  assert.equal(replay.replay, true);
  assert.equal(calls, 1);
  assert.equal(payment.refundedAmountMinor, 600);
});

test('unknown provider outcomes retain refund reservations and block duplicate attempts', async () => {
  const payment = {
    status: 'settled',
    amountMinor: 1000,
    refundedAmountMinor: 0,
    providerRef: 'provider',
    refunds: [],
  };
  const runtime = { persist: async () => {} };
  const adapter = {
    refund: async () => {
      throw new Error('connection lost');
    },
  };
  await assert.rejects(performRefund(runtime, payment, { idempotencyKey: 'refund' }, adapter), {
    statusCode: 502,
  });
  assert.equal(payment.refunds[0].status, 'unknown');
  assert.equal(payment.refundedAmountMinor, 1000);
  await assert.rejects(performRefund(runtime, payment, { idempotencyKey: 'refund' }, adapter), {
    statusCode: 409,
  });
});

test('concurrent JSON snapshots remain parseable and corrupt state fails closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'payconnectoid-durable-'));
  const file = join(dir, 'data.json');
  try {
    await Promise.all(
      Array.from({ length: 20 }, (_, version) =>
        writeJsonAtomic(file, { version, values: Array(version).fill('entry') }),
      ),
    );
    assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 19);
    await writeFile(file, '{broken');
    await assert.rejects(
      createAppServer({ dataFilePath: file, preferSqlite: false, logEnabled: false }),
      /Cannot read payment state/,
    );
    assert.equal(await readFile(file, 'utf8'), '{broken');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('JSON scalar and array bodies return a client error without crashing the API', async () => {
  const app = await startTestServer();
  try {
    for (const body of ['null', '[]', '1', '"text"']) {
      const response = await fetch(`${app.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      assert.equal(response.status, 400);
    }
    assert.equal((await fetch(`${app.baseUrl}/api/health`)).status, 200);
  } finally {
    await app.close();
  }
});

test('concurrent payment HTTP calls dispatch once and persist the provider reference before dispatch', async () => {
  const app = await startTestServer();
  let release;
  let entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  app.runtime.adapterRegistry.register('paystack', () => ({
    initiate: async (payment) => {
      calls++;
      const saved = JSON.parse(await readFile(app.config.dataFilePath, 'utf8'));
      const reservation = saved.idempotencyRecords.find(
        (record) => record.key === 'concurrent-payment',
      );
      assert.equal(reservation.status, 'reserved');
      assert.equal(reservation.paymentId, payment.paymentId);
      entered();
      await new Promise((resolve) => {
        release = resolve;
      });
      return { providerRef: payment.paymentId, status: 'initiated' };
    },
  }));
  try {
    const login = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const token = (await login.json()).token;
    const create = () =>
      fetch(`${app.baseUrl}/api/v2/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'concurrent-payment',
          providerId: 'paystack',
          recipientRef: 'test',
          currency: 'ZAR',
          amountMinor: 1000,
        }),
      });
    const first = create();
    await waiting;
    assert.equal((await create()).status, 409);
    release();
    assert.equal((await first).status, 201);
    assert.equal((await create()).status, 200);
    assert.equal(calls, 1);
  } finally {
    release?.();
    await app.close();
  }
});
