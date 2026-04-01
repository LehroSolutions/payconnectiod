import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { startTestServer } from "./helpers/server.js";

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" })
  });
  const body = await response.json();
  return body.token;
}

function startReceiver() {
  const received = [];
  let statusCode = 200;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({
      headers: request.headers,
      body: Buffer.concat(chunks).toString("utf8")
    });
    response.writeHead(statusCode, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        received,
        url: `http://127.0.0.1:${address.port}/webhook`,
        setStatusCode(value) {
          statusCode = value;
        }
      });
    });
  });
}

test("outbound webhook subscriptions receive signed payment events and deliveries are stored", async () => {
  const receiver = await startReceiver();
  const app = await startTestServer({
    webhookRetryDelaysMs: [0, 0, 0]
  });

  try {
    const token = await login(app.baseUrl);
    const createSubscription = await fetch(`${app.baseUrl}/api/v2/webhook-subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: receiver.url, events: ["payment.created", "payment.settled"] })
    });
    assert.equal(createSubscription.status, 201);
    const subscriptionBody = await createSubscription.json();
    const subscription = subscriptionBody.data.subscription;

    const createPayment = await fetch(`${app.baseUrl}/api/v2/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "sub-key",
        amountMinor: 1500,
        currency: "ZAR",
        providerId: "ozow",
        recipientRef: "webhook-sub",
        providerStatus: "approved"
      })
    });
    assert.equal(createPayment.status, 201);
    const createPaymentBody = await createPayment.json();
    const paymentId = createPaymentBody.data.payment.id;

    const patchPayment = await fetch(`${app.baseUrl}/api/v2/payments/${paymentId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "settled" })
    });
    assert.equal(patchPayment.status, 200);

    await app.waitForBackgroundWork();

    assert.ok(receiver.received.length >= 1);
    const firstPayload = JSON.parse(receiver.received[0].body);
    const firstSignature = receiver.received[0].headers["x-webhook-signature"];
    const expectedSignature = createHmac("sha256", subscription.secret).update(receiver.received[0].body).digest("hex");
    assert.equal(firstSignature, expectedSignature);
    assert.ok(firstPayload.event === "payment.created" || firstPayload.event === "payment.settled");

    const deliveries = await fetch(`${app.baseUrl}/api/v2/webhook-deliveries?subscriptionId=${subscription.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(deliveries.status, 200);
    const deliveriesBody = await deliveries.json();
    assert.ok(Array.isArray(deliveriesBody.data.deliveries));
    assert.ok(deliveriesBody.data.deliveries.length >= 1);
    assert.equal(deliveriesBody.data.deliveries[0].subscriptionId, subscription.id);
    assert.equal(typeof deliveriesBody.data.queue.pending, "number");
    assert.equal(deliveriesBody.data.queue.pending, 0);

    const analytics = await fetch(`${app.baseUrl}/api/v2/analytics/webhook-deliveries?window=24h&bucket=hour&subscriptionId=${subscription.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(analytics.status, 200);
    const analyticsBody = await analytics.json();
    assert.equal(analyticsBody.ok, true);
    assert.ok(analyticsBody.data.summary.deliveryCount >= 1);
    assert.equal(typeof analyticsBody.data.summary.successRate, "number");
    assert.ok(Array.isArray(analyticsBody.data.timeseries));
  } finally {
    await app.close();
    await new Promise((resolve) => receiver.server.close(resolve));
  }
});

test("failed webhook deliveries move to dead letters and can be requeued", async () => {
  const receiver = await startReceiver();
  receiver.setStatusCode(500);
  const app = await startTestServer({
    webhookRetryDelaysMs: [0, 0, 0]
  });

  try {
    const token = await login(app.baseUrl);
    const createSubscription = await fetch(`${app.baseUrl}/api/v2/webhook-subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: receiver.url, events: ["payment.created"] })
    });
    assert.equal(createSubscription.status, 201);

    const createPayment = await fetch(`${app.baseUrl}/api/v2/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "dead-letter-key",
        amountMinor: 1200,
        currency: "ZAR",
        providerId: "ozow",
        recipientRef: "dead-letter"
      })
    });
    assert.equal(createPayment.status, 201);

    await app.waitForBackgroundWork();

    const deadLettersResponse = await fetch(`${app.baseUrl}/api/v2/webhook-dead-letters`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(deadLettersResponse.status, 200);
    const deadLettersBody = await deadLettersResponse.json();
    assert.equal(deadLettersBody.data.deadLetters.length, 1);

    receiver.setStatusCode(200);
    const deadLetterId = deadLettersBody.data.deadLetters[0].id;
    const requeueResponse = await fetch(`${app.baseUrl}/api/v2/webhook-dead-letters/${deadLetterId}/requeue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(requeueResponse.status, 202);

    await app.waitForBackgroundWork();

    const deadLettersAfterResponse = await fetch(`${app.baseUrl}/api/v2/webhook-dead-letters`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const deadLettersAfterBody = await deadLettersAfterResponse.json();
    assert.equal(deadLettersAfterBody.data.deadLetters.length, 0);

    const deliveriesResponse = await fetch(`${app.baseUrl}/api/v2/webhook-deliveries`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const deliveriesBody = await deliveriesResponse.json();
    assert.ok(deliveriesBody.data.deliveries.some((item) => item.status === "delivered"));
  } finally {
    await app.close();
    await new Promise((resolve) => receiver.server.close(resolve));
  }
});
