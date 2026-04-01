import test from "node:test";
import assert from "node:assert/strict";
import { createMessageHandler } from "../src/mcp/core.js";
import { startTestServer } from "./helpers/server.js";

test("mcp core lists tools and can query payments", async () => {
  const app = await startTestServer({
    env: { ...process.env, PAYSTACK_SECRET_KEY: "sk_test_paystack" }
  });
  const handler = createMessageHandler({
    baseUrl: app.baseUrl,
    username: "admin",
    password: "admin123"
  });

  try {
    const initialized = await handler({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    assert.equal(initialized.result.serverInfo.name, "payconnectoid-mcp");

    const tools = await handler({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    assert.ok(Array.isArray(tools.result.tools));
    assert.ok(tools.result.tools.find((tool) => tool.name === "create_payment"));
    assert.ok(tools.result.tools.find((tool) => tool.name === "create_webhook_subscription"));
    assert.ok(tools.result.tools.find((tool) => tool.name === "refund_payment"));
    assert.ok(tools.result.tools.find((tool) => tool.name === "get_refund_analytics"));
    assert.ok(tools.result.tools.find((tool) => tool.name === "list_webhook_deliveries"));
    assert.ok(tools.result.tools.find((tool) => tool.name === "get_delivery_analytics"));
    assert.ok(tools.result.tools.find((tool) => tool.name === "list_webhook_dead_letters"));
    assert.ok(tools.result.tools.find((tool) => tool.name === "requeue_webhook_dead_letter"));

    const created = await handler({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "create_payment",
        arguments: {
          idempotencyKey: "mcp-tool-key",
          amountMinor: 999,
          currency: "ZAR",
          providerId: "ozow",
          recipientRef: "mcp-ref"
        }
      }
    });
    const createdPayload = JSON.parse(created.result.content[0].text);
    assert.equal(createdPayload.ok, true);
    assert.equal(createdPayload.data.payment.providerId, "ozow");

    const resources = await handler({ jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: "payconnectoid://payments?limit=1&page=1&providerId=ozow" } });
    const resourcePayload = JSON.parse(resources.result.contents[0].text);
    assert.equal(resourcePayload.ok, true);
    assert.ok(Array.isArray(resourcePayload.data.payments));
    assert.equal(resourcePayload.data.pagination.limit, 1);
    assert.equal(resourcePayload.data.filters.providerId, "ozow");

    const refunded = await handler({
      jsonrpc: "2.0",
      id: 4.5,
      method: "tools/call",
      params: {
        name: "refund_payment",
        arguments: {
          paymentId: createdPayload.data.payment.id,
          amountMinor: 500
        }
      }
    });
    const refundedPayload = JSON.parse(refunded.result.content[0].text);
    assert.equal(refundedPayload.ok, false);

    const createdSubscription = await handler({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "create_webhook_subscription",
        arguments: {
          url: `${app.baseUrl}/noop`,
          events: ["payment.created"]
        }
      }
    });
    const createdSubscriptionPayload = JSON.parse(createdSubscription.result.content[0].text);
    assert.equal(createdSubscriptionPayload.ok, true);

    const prompts = await handler({ jsonrpc: "2.0", id: 6, method: "prompts/list", params: {} });
    assert.ok(Array.isArray(prompts.result.prompts));
    assert.ok(prompts.result.prompts.find((prompt) => prompt.name === "daily_reconciliation"));

    const subscriptionResource = await handler({ jsonrpc: "2.0", id: 7, method: "resources/read", params: { uri: "payconnectoid://webhook-subscriptions" } });
    const subscriptionResourcePayload = JSON.parse(subscriptionResource.result.contents[0].text);
    assert.equal(subscriptionResourcePayload.ok, true);
    assert.ok(Array.isArray(subscriptionResourcePayload.data.subscriptions));

    const refunds = await handler({ jsonrpc: "2.0", id: 7.5, method: "tools/call", params: { name: "list_refunds", arguments: { status: "pending" } } });
    const refundsPayload = JSON.parse(refunds.result.content[0].text);
    assert.equal(refundsPayload.ok, true);
    assert.ok(Array.isArray(refundsPayload.data.refunds));

    const refundResource = await handler({ jsonrpc: "2.0", id: 7.6, method: "resources/read", params: { uri: "payconnectoid://refunds?status=pending&limit=5" } });
    const refundResourcePayload = JSON.parse(refundResource.result.contents[0].text);
    assert.equal(refundResourcePayload.ok, true);
    assert.ok(Array.isArray(refundResourcePayload.data.refunds));

    const refundAnalytics = await handler({ jsonrpc: "2.0", id: 7.7, method: "tools/call", params: { name: "get_refund_analytics", arguments: {} } });
    const refundAnalyticsPayload = JSON.parse(refundAnalytics.result.content[0].text);
    assert.equal(refundAnalyticsPayload.ok, true);
    assert.equal(typeof refundAnalyticsPayload.data.summary.refundCount, "number");

    const refundAnalyticsResource = await handler({ jsonrpc: "2.0", id: 7.8, method: "resources/read", params: { uri: "payconnectoid://refund-analytics" } });
    const refundAnalyticsResourcePayload = JSON.parse(refundAnalyticsResource.result.contents[0].text);
    assert.equal(refundAnalyticsResourcePayload.ok, true);
    assert.equal(typeof refundAnalyticsResourcePayload.data.summary.totalRefundedMinor, "number");

    const deliveryAnalytics = await handler({ jsonrpc: "2.0", id: 7.85, method: "tools/call", params: { name: "get_delivery_analytics", arguments: { window: "24h", bucket: "hour" } } });
    const deliveryAnalyticsPayload = JSON.parse(deliveryAnalytics.result.content[0].text);
    assert.equal(deliveryAnalyticsPayload.ok, true);
    assert.equal(typeof deliveryAnalyticsPayload.data.summary.deliveryCount, "number");

    const deliveries = await handler({ jsonrpc: "2.0", id: 7.9, method: "tools/call", params: { name: "list_webhook_deliveries", arguments: {} } });
    const deliveriesPayload = JSON.parse(deliveries.result.content[0].text);
    assert.equal(deliveriesPayload.ok, true);
    assert.equal(typeof deliveriesPayload.data.queue.pending, "number");

    const deliveryResource = await handler({ jsonrpc: "2.0", id: 8, method: "resources/read", params: { uri: "payconnectoid://webhook-deliveries" } });
    const deliveryResourcePayload = JSON.parse(deliveryResource.result.contents[0].text);
    assert.equal(deliveryResourcePayload.ok, true);
    assert.equal(typeof deliveryResourcePayload.data.queue.processing, "boolean");

    const deliveryAnalyticsResource = await handler({ jsonrpc: "2.0", id: 8.1, method: "resources/read", params: { uri: "payconnectoid://delivery-analytics?window=24h&bucket=hour" } });
    const deliveryAnalyticsResourcePayload = JSON.parse(deliveryAnalyticsResource.result.contents[0].text);
    assert.equal(deliveryAnalyticsResourcePayload.ok, true);
    assert.equal(typeof deliveryAnalyticsResourcePayload.data.summary.successRate, "number");

    const deadLettersResource = await handler({ jsonrpc: "2.0", id: 8.2, method: "resources/read", params: { uri: "payconnectoid://webhook-dead-letters" } });
    const deadLettersResourcePayload = JSON.parse(deadLettersResource.result.contents[0].text);
    assert.equal(deadLettersResourcePayload.ok, true);
    assert.ok(Array.isArray(deadLettersResourcePayload.data.deadLetters));
  } finally {
    await app.close();
  }
});
