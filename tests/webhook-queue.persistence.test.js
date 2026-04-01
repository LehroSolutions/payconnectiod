import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { startServer } from "../app/server.js";

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
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push(Buffer.concat(chunks).toString("utf8"));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, received, url: `http://127.0.0.1:${address.port}/webhook` });
    });
  });
}

test("persisted webhook queue jobs replay after restart", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "payconnectoid-queue-"));
  const dataFilePath = join(tempDir, "data.json");
  const dbFilePath = join(tempDir, "data.sqlite");
  const receiver = await startReceiver();

  const app1 = await startServer({
    host: "127.0.0.1",
    port: 0,
    dataFilePath,
    dbFilePath,
    preferSqlite: false,
    logEnabled: false,
    webhookRetryDelaysMs: [0, 0, 0],
    webhookQueueAutoStart: false
  });

  try {
    const token = await login(app1.baseUrl);
    const subscriptionResponse = await fetch(`${app1.baseUrl}/api/v2/webhook-subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: receiver.url, events: ["payment.created"] })
    });
    assert.equal(subscriptionResponse.status, 201);

    const paymentResponse = await fetch(`${app1.baseUrl}/api/v2/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "persist-queue-key",
        amountMinor: 2000,
        currency: "ZAR",
        providerId: "ozow",
        recipientRef: "queue-restart"
      })
    });
    assert.equal(paymentResponse.status, 201);

    const queuedBeforeRestart = await fetch(`${app1.baseUrl}/api/v2/webhook-deliveries`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const queuedBeforeRestartBody = await queuedBeforeRestart.json();
    assert.equal(queuedBeforeRestartBody.data.queue.pending, 1);
    assert.equal(receiver.received.length, 0);
  } finally {
    await new Promise((resolve) => app1.server.close(resolve));
  }

  const app2 = await startServer({
    host: "127.0.0.1",
    port: 0,
    dataFilePath,
    dbFilePath,
    preferSqlite: false,
    logEnabled: false,
    webhookRetryDelaysMs: [0, 0, 0],
    webhookQueueAutoStart: true
  });

  try {
    await app2.waitForBackgroundWork();
    assert.ok(receiver.received.length >= 1);

    const token = await login(app2.baseUrl);
    const queuedAfterRestart = await fetch(`${app2.baseUrl}/api/v2/webhook-deliveries`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const queuedAfterRestartBody = await queuedAfterRestart.json();
    assert.equal(queuedAfterRestartBody.data.queue.pending, 0);
    assert.ok(queuedAfterRestartBody.data.deliveries.length >= 1);
  } finally {
    await new Promise((resolve) => app2.server.close(resolve));
    await new Promise((resolve) => receiver.server.close(resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
});
