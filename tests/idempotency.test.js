import test from "node:test";
import assert from "node:assert/strict";
import { reserveIdempotencyKey, markIdempotencyComplete } from "../src/idempotency.js";

test("reserves new key and replays completed identical payload", () => {
  const records = [];
  const first = reserveIdempotencyKey(records, { key: "k1", payloadHash: "abc", ttlHours: 24, nowMs: 0 });
  assert.equal(first.accepted, true);
  assert.equal(first.replay, false);

  markIdempotencyComplete(records, "k1", { id: "pay-1" }, 1);

  const replay = reserveIdempotencyKey(records, { key: "k1", payloadHash: "abc", ttlHours: 24, nowMs: 2 });
  assert.equal(replay.accepted, true);
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.record.result, { id: "pay-1" });
});

test("rejects mismatched payload for same key", () => {
  const records = [];
  reserveIdempotencyKey(records, { key: "k1", payloadHash: "abc", ttlHours: 24, nowMs: 0 });
  const conflict = reserveIdempotencyKey(records, { key: "k1", payloadHash: "xyz", ttlHours: 24, nowMs: 1 });
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.reason, "payload-mismatch");
});
