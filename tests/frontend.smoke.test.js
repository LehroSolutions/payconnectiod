import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.js";

test("frontend shell references stabilized v2 contract", async () => {
  const app = await startTestServer();
  try {
    const page = await fetch(`${app.baseUrl}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes("/api/v2/payments"));
    assert.ok(html.includes("amountMinor"));
    assert.ok(html.includes("idempotencyKey"));
    assert.ok(html.includes("AI Risk Scorer"));
  } finally {
    await app.close();
  }
});
