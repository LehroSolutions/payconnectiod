import test from "node:test";
import assert from "node:assert/strict";
import { createConfig } from "../src/config.js";

test("production config rejects insecure auth defaults", () => {
  assert.throws(
    () => createConfig({ env: { NODE_ENV: "production" } }),
    /APP_PASS and APP_SECRET/
  );

  assert.throws(
    () => createConfig({
      env: {
        NODE_ENV: "production",
        APP_PASS: "correct-horse-battery-staple",
        APP_SECRET: ""
      }
    }),
    /APP_SECRET/
  );

  assert.doesNotThrow(() => createConfig({
    env: {
      NODE_ENV: "production",
      APP_PASS: "correct-horse-battery-staple",
      APP_SECRET: "replace-with-a-long-random-signing-secret"
    }
  }));
});