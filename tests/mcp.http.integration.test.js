import test from "node:test";
import assert from "node:assert/strict";
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

async function readSseEvent(reader) {
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return null;
    buffer += new TextDecoder().decode(value, { stream: true });
    const delimiterIndex = buffer.indexOf("\n\n");
    if (delimiterIndex === -1) continue;
    const rawEvent = buffer.slice(0, delimiterIndex);
    buffer = buffer.slice(delimiterIndex + 2);
    const lines = rawEvent.split("\n");
    const event = lines.find((line) => line.startsWith("event:"))?.slice("event:".length).trim() ?? "message";
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice("data:".length).trim()).join("\n");
    if (!data) continue;
    return { event, data: JSON.parse(data) };
  }
}

test("mcp http and sse transport supports remote json-rpc calls", async () => {
  const app = await startTestServer();
  const sseAbort = new AbortController();

  try {
    const token = await login(app.baseUrl);
    const direct = await fetch(`${app.baseUrl}/api/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    assert.equal(direct.status, 200);
    const directBody = await direct.json();
    assert.ok(Array.isArray(directBody.result.tools));

    const sseResponse = await fetch(`${app.baseUrl}/api/mcp/sse`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: sseAbort.signal
    });
    assert.equal(sseResponse.status, 200);
    const reader = sseResponse.body.getReader();

    const sessionEvent = await readSseEvent(reader);
    assert.equal(sessionEvent.event, "session");
    const sessionId = sessionEvent.data.sessionId;
    assert.equal(typeof sessionId, "string");
    assert.equal(typeof sessionEvent.data.closePath, "string");

    const posted = await fetch(`${app.baseUrl}${sessionEvent.data.postPath}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/list", params: {} })
    });
    assert.equal(posted.status, 202);

    const messageEvent = await readSseEvent(reader);
    assert.equal(messageEvent.event, "message");
    assert.ok(Array.isArray(messageEvent.data.result.resources));

    const closed = await fetch(`${app.baseUrl}${sessionEvent.data.closePath}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(closed.status, 204);

    const afterClose = await fetch(`${app.baseUrl}${sessionEvent.data.postPath}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} })
    });
    assert.equal(afterClose.status, 404);

    await reader.cancel();
    sseAbort.abort();
  } finally {
    sseAbort.abort();
    await app.close();
  }
});