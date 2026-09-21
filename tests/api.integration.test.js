import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { startTestServer } from './helpers/server.js';

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.token);
  return body.token;
}

function startPaystackMock() {
  const server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/transaction/initialize') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          status: true,
          data: {
            reference: 'paystack-api-ref',
            authorization_url: 'https://checkout.paystack.mock/redirect',
            status: 'pending',
          },
        }),
      );
      return;
    }

    if (request.method === 'GET' && request.url === '/transaction/verify/paystack-api-ref') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          status: true,
          data: {
            reference: 'paystack-api-ref',
            status: 'success',
          },
        }),
      );
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: false, message: 'Not found' }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

test('v2 returns canonical envelope and enforces auth', async () => {
  const app = await startTestServer();
  try {
    const docs = await fetch(`${app.baseUrl}/api/v2/openapi.json`);
    assert.equal(docs.status, 200);
    const docsBody = await docs.json();
    assert.equal(docsBody.openapi, '3.1.0');
    assert.ok(docsBody.paths['/api/v2/payments']);

    const unauthorized = await fetch(`${app.baseUrl}/api/v2/payments`);
    assert.equal(unauthorized.status, 401);
    const unauthorizedBody = await unauthorized.json();
    assert.equal(unauthorizedBody.ok, false);

    const token = await login(app.baseUrl);
    const requestId = 'req-v2-envelope';
    const providers = await fetch(`${app.baseUrl}/api/v2/providers`, {
      headers: { Authorization: `Bearer ${token}`, 'x-request-id': requestId },
    });
    assert.equal(providers.status, 200);
    const providersBody = await providers.json();
    assert.equal(providersBody.ok, true);
    assert.equal(providersBody.requestId, requestId);
    assert.ok(Array.isArray(providersBody.data.providers));
  } finally {
    await app.close();
  }
});

test('v2 payment create, replay, conflict and reconciliation summary', async () => {
  const app = await startTestServer();
  try {
    const token = await login(app.baseUrl);

    const payload = {
      idempotencyKey: 'k-replay',
      amountMinor: 1050,
      currency: 'ZAR',
      providerId: 'ozow',
      recipientRef: 'recipient-1',
      providerStatus: 'approved',
    };

    const created = await fetch(`${app.baseUrl}/api/v2/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.ok, true);
    assert.equal(createdBody.data.replay, false);
    assert.equal(createdBody.data.payment.status, 'authorized');

    const replay = await fetch(`${app.baseUrl}/api/v2/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.equal(replayBody.data.replay, true);
    assert.equal(replayBody.data.payment.id, createdBody.data.payment.id);

    const conflict = await fetch(`${app.baseUrl}/api/v2/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, amountMinor: 2050 }),
    });
    assert.equal(conflict.status, 409);
    const conflictBody = await conflict.json();
    assert.equal(conflictBody.ok, false);
    assert.equal(conflictBody.error.code, 'IDEMPOTENCY_CONFLICT');

    const mismatch = await fetch(`${app.baseUrl}/api/v2/mismatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: createdBody.data.payment.id, reason: 'bank mismatch' }),
    });
    assert.equal(mismatch.status, 201);

    const reconciliation = await fetch(`${app.baseUrl}/api/v2/reconciliation`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(reconciliation.status, 200);
    const reconciliationBody = await reconciliation.json();
    assert.equal(reconciliationBody.ok, true);
    assert.equal(typeof reconciliationBody.data.summary.totalCount, 'number');
    assert.equal(typeof reconciliationBody.data.summary.totalVolumeMinor, 'number');
    assert.equal(reconciliationBody.data.summary.mismatchCount, 1);
  } finally {
    await app.close();
  }
});

test('v2 payments supports pagination, sorting and filtering', async () => {
  const app = await startTestServer();
  try {
    const token = await login(app.baseUrl);

    const payloads = [
      {
        idempotencyKey: 'page-1',
        amountMinor: 1000,
        currency: 'ZAR',
        providerId: 'ozow',
        recipientRef: 'alpha-a',
        providerStatus: 'approved',
      },
      {
        idempotencyKey: 'page-2',
        amountMinor: 3000,
        currency: 'USD',
        providerId: 'ozow',
        recipientRef: 'beta-b',
        providerStatus: 'approved',
      },
      {
        idempotencyKey: 'page-3',
        amountMinor: 2000,
        currency: 'ZAR',
        providerId: 'payfast',
        recipientRef: 'alpha-c',
        providerStatus: 'failed',
      },
    ];

    for (const payload of payloads) {
      const response = await fetch(`${app.baseUrl}/api/v2/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status === 201 || response.status === 200, true);
    }

    const listBeforePatch = await fetch(
      `${app.baseUrl}/api/v2/payments?providerId=ozow&currency=USD`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    assert.equal(listBeforePatch.status, 200);
    const listBeforePatchBody = await listBeforePatch.json();
    const settledCandidate = listBeforePatchBody.data.payments.find(
      (item) => item.recipientRef === 'beta-b',
    );
    assert.ok(settledCandidate);

    const patchSettled = await fetch(`${app.baseUrl}/api/v2/payments/${settledCandidate.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'settled' }),
    });
    assert.equal(patchSettled.status, 200);

    const filtered = await fetch(
      `${app.baseUrl}/api/v2/payments?status=settled&sort=amountMinor&order=asc&page=1&limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    assert.equal(filtered.status, 200);
    const filteredBody = await filtered.json();
    assert.equal(filteredBody.ok, true);
    assert.equal(filteredBody.data.pagination.page, 1);
    assert.equal(filteredBody.data.pagination.limit, 1);
    assert.equal(filteredBody.data.pagination.total, 1);
    assert.equal(filteredBody.data.payments.length, 1);
    assert.equal(filteredBody.data.payments[0].status, 'settled');
    assert.equal(filteredBody.data.filters.sort, 'amountMinor');
    assert.equal(filteredBody.data.filters.order, 'asc');

    const recipientFiltered = await fetch(
      `${app.baseUrl}/api/v2/payments?currency=ZAR&recipientRef=alpha`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    assert.equal(recipientFiltered.status, 200);
    const recipientFilteredBody = await recipientFiltered.json();
    assert.equal(recipientFilteredBody.ok, true);
    assert.ok(recipientFilteredBody.data.payments.length >= 2);
    assert.ok(recipientFilteredBody.data.payments.every((item) => item.currency === 'ZAR'));

    const providers = await fetch(`${app.baseUrl}/api/v2/providers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Paystack', capabilities: ['card', 'bank_transfer'] }),
    });
    assert.equal(providers.status, 201);
    const createdProviderBody = await providers.json();
    assert.equal(createdProviderBody.ok, true);
    assert.equal(createdProviderBody.data.provider.adapter.id, 'paystack');

    const providerList = await fetch(`${app.baseUrl}/api/v2/providers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(providerList.status, 200);
    const providersBody = await providerList.json();
    const paystackProvider = providersBody.data.providers.find((item) => item.name === 'Paystack');
    assert.ok(Array.isArray(providersBody.data.providers));
    assert.ok(Object.prototype.hasOwnProperty.call(providersBody.data.providers[0], 'adapter'));
    assert.equal(paystackProvider.adapter.id, 'paystack');
  } finally {
    await app.close();
  }
});

test('v1 compatibility routes include deprecation headers', async () => {
  const app = await startTestServer();
  try {
    const v1Create = await fetch(`${app.baseUrl}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'v1-key',
        amount: 12.5,
        currency: 'ZAR',
        provider: 'payfast',
        recipient: 'legacy-user',
      }),
    });
    assert.equal(v1Create.status, 201);
    assert.equal(v1Create.headers.get('deprecation'), 'true');
    assert.equal(v1Create.headers.get('sunset'), 'Tue, 30 Jun 2026 23:59:59 GMT');
    assert.equal(v1Create.headers.get('link'), '</api/v2/payments>; rel="successor-version"');
    const v1CreateBody = await v1Create.json();
    assert.ok(v1CreateBody.item.id);

    const v1List = await fetch(`${app.baseUrl}/api/payments`);
    assert.equal(v1List.status, 200);
    assert.equal(v1List.headers.get('deprecation'), 'true');
    const v1ListBody = await v1List.json();
    assert.ok(Array.isArray(v1ListBody.ledger));

    const token = await login(app.baseUrl);
    const v2List = await fetch(`${app.baseUrl}/api/v2/payments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const v2Body = await v2List.json();
    assert.ok(v2Body.data.payments.find((item) => item.id === v1CreateBody.item.id));
  } finally {
    await app.close();
  }
});

test('webhook verification path stores traces and ai route is healthy', async () => {
  const secret = 'test-secret-ozow';
  const app = await startTestServer({
    env: { ...process.env, WEBHOOK_SIGNING_SECRET_OZOW: secret },
  });

  try {
    const token = await login(app.baseUrl);

    const createResponse = await fetch(`${app.baseUrl}/api/v2/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'hook-key',
        amountMinor: 3000,
        currency: 'ZAR',
        providerId: 'ozow',
        providerStatus: 'approved',
      }),
    });
    const createBody = await createResponse.json();
    const paymentId = createBody.data.payment.id;
    assert.equal(createBody.data.payment.status, 'authorized');

    const webhookPayload = JSON.stringify({
      provider: 'ozow',
      eventType: 'payment.settled',
      paymentId,
      providerStatus: 'settled',
    });
    const signature = createHmac('sha256', secret).update(webhookPayload).digest('hex');

    const webhookResponse = await fetch(`${app.baseUrl}/api/v2/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature },
      body: webhookPayload,
    });
    assert.equal(webhookResponse.status, 200);
    const webhookBody = await webhookResponse.json();
    assert.equal(webhookBody.ok, true);
    assert.equal(webhookBody.data.trace.verified, true);
    assert.equal(webhookBody.data.payment.status, 'settled');

    const traces = await fetch(`${app.baseUrl}/api/v2/webhook-traces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(traces.status, 200);
    const tracesBody = await traces.json();
    assert.equal(tracesBody.ok, true);
    assert.ok(Array.isArray(tracesBody.data.traces));
    assert.ok(tracesBody.data.traces.length > 0);

    const ai = await fetch(`${app.baseUrl}/api/ai/risk-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1000,
        currency: 'ZAR',
        provider: 'ozow',
        status: 'pending',
      }),
    });
    assert.equal(ai.status, 200);
    const aiBody = await ai.json();
    assert.equal(aiBody.ok, true);
    assert.equal(typeof aiBody.data.riskScore, 'number');
    assert.equal(typeof aiBody.data.riskLevel, 'string');
  } finally {
    await app.close();
  }
});

test('adapter-backed payment lookup and verify flow works for paystack scaffold', async () => {
  const paystack = await startPaystackMock();
  const app = await startTestServer({
    env: {
      ...process.env,
      PAYSTACK_SECRET_KEY: 'sk_test_paystack',
      PAYSTACK_BASE_URL: paystack.baseUrl,
    },
  });

  try {
    const token = await login(app.baseUrl);

    const create = await fetch(`${app.baseUrl}/api/v2/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'paystack-verify-key',
        amountMinor: 4500,
        currency: 'ZAR',
        providerId: 'paystack',
        recipientRef: 'merchant-ref-1',
      }),
    });
    assert.equal(create.status, 201);
    const createBody = await create.json();
    assert.equal(createBody.ok, true);
    assert.equal(typeof createBody.data.payment.providerRef, 'string');
    assert.equal(createBody.data.payment.providerResponse.adapter, 'paystack');

    const paymentId = createBody.data.payment.id;
    const getPayment = await fetch(`${app.baseUrl}/api/v2/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(getPayment.status, 200);
    const getPaymentBody = await getPayment.json();
    assert.equal(getPaymentBody.ok, true);
    assert.equal(getPaymentBody.data.payment.id, paymentId);

    const verify = await fetch(`${app.baseUrl}/api/v2/payments/${paymentId}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(verify.status, 200);
    const verifyBody = await verify.json();
    assert.equal(verifyBody.ok, true);
    assert.equal(verifyBody.data.verification.providerRef, createBody.data.payment.providerRef);
    assert.equal(verifyBody.data.payment.providerRef, createBody.data.payment.providerRef);
  } finally {
    await app.close();
    await new Promise((resolve) => paystack.server.close(resolve));
  }
});

test('providers support patch and soft delete', async () => {
  const app = await startTestServer();

  try {
    const token = await login(app.baseUrl);

    const created = await fetch(`${app.baseUrl}/api/v2/providers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Custom PSP', capabilities: ['eft'] }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    const providerId = createdBody.data.provider.id;

    const patched = await fetch(`${app.baseUrl}/api/v2/providers/${providerId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Custom PSP Updated',
        capabilities: ['eft', 'card'],
        status: 'maintenance',
      }),
    });
    assert.equal(patched.status, 200);
    const patchedBody = await patched.json();
    assert.equal(patchedBody.data.provider.name, 'Custom PSP Updated');
    assert.deepEqual(patchedBody.data.provider.capabilities, ['eft', 'card']);
    assert.equal(patchedBody.data.provider.status, 'maintenance');

    const deleted = await fetch(`${app.baseUrl}/api/v2/providers/${providerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(deleted.status, 200);
    const deletedBody = await deleted.json();
    assert.equal(deletedBody.data.provider.status, 'inactive');
  } finally {
    await app.close();
  }
});
