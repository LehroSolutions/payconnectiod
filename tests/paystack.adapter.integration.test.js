import test from "node:test";
import assert from "node:assert/strict";
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

function startPaystackMock() {
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/transaction/initialize") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        status: true,
        message: "Authorization URL created",
        data: {
          reference: "paystack-ref-123",
          authorization_url: "https://checkout.paystack.mock/redirect",
          status: "pending"
        }
      }));
      return;
    }

    if (request.method === "GET" && request.url === "/transaction/verify/paystack-ref-123") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        status: true,
        message: "Verification successful",
        data: {
          reference: "paystack-ref-123",
          status: "success"
        }
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/refund") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        status: true,
        message: "Refund queued",
        data: {
          transaction_reference: "paystack-ref-123",
          status: "pending"
        }
      }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: false, message: "Not found" }));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

test("paystack adapter uses HTTP initialize and verify endpoints", async () => {
  const paystack = await startPaystackMock();
  const app = await startTestServer({
    env: { ...process.env, PAYSTACK_SECRET_KEY: "sk_test_paystack", PAYSTACK_BASE_URL: paystack.baseUrl }
  });

  try {
    const token = await login(app.baseUrl);
    const createResponse = await fetch(`${app.baseUrl}/api/v2/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "paystack-http-key",
        amountMinor: 5000,
        currency: "ZAR",
        providerId: "paystack",
        recipientRef: "adapter-http"
      })
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.data.payment.providerRef, "paystack-ref-123");
    assert.equal(created.data.payment.redirectUrl, "https://checkout.paystack.mock/redirect");
    assert.equal(created.data.payment.providerResponse.mode, "live-http");

    const verifyResponse = await fetch(`${app.baseUrl}/api/v2/payments/${created.data.payment.id}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(verifyResponse.status, 200);
    const verified = await verifyResponse.json();
    assert.equal(verified.data.payment.status, "settled");
    assert.equal(verified.data.verification.providerRef, "paystack-ref-123");

    const refundResponse = await fetch(`${app.baseUrl}/api/v2/payments/${created.data.payment.id}/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amountMinor: 2500 })
    });
    assert.equal(refundResponse.status, 200);
    const refunded = await refundResponse.json();
    assert.equal(refunded.data.refund.amountMinor, 2500);
    assert.equal(refunded.data.payment.refundedAmountMinor, 2500);
    assert.equal(refunded.data.payment.refunds[0].status, "pending");

    const refundsResponse = await fetch(`${app.baseUrl}/api/v2/refunds?providerId=paystack&status=pending`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(refundsResponse.status, 200);
    const refundsBody = await refundsResponse.json();
    assert.equal(refundsBody.ok, true);
    assert.equal(refundsBody.data.summary.refundCount, 1);
    assert.equal(refundsBody.data.summary.totalRefundedMinor, 2500);
    assert.equal(refundsBody.data.refunds[0].paymentId, created.data.payment.id);

    const overRefundResponse = await fetch(`${app.baseUrl}/api/v2/payments/${created.data.payment.id}/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amountMinor: 3000 })
    });
    assert.equal(overRefundResponse.status, 409);
    const overRefundBody = await overRefundResponse.json();
    assert.equal(overRefundBody.error.code, "REFUND_EXCEEDS_REMAINING");

    const analyticsResponse = await fetch(`${app.baseUrl}/api/v2/analytics/refunds`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(analyticsResponse.status, 200);
    const analyticsBody = await analyticsResponse.json();
    assert.equal(analyticsBody.ok, true);
    assert.equal(analyticsBody.data.summary.refundCount, 1);
    assert.equal(analyticsBody.data.summary.totalRefundedMinor, 2500);
    assert.equal(analyticsBody.data.byProvider.paystack, 2500);
    assert.equal(analyticsBody.data.byCurrency.ZAR, 2500);
    assert.equal(analyticsBody.data.byStatus.pending, 1);
    assert.ok(Array.isArray(analyticsBody.data.timeseries));
    assert.equal(analyticsBody.data.range.bucket, "day");
  } finally {
    await app.close();
    await new Promise((resolve) => paystack.server.close(resolve));
  }
});
