import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyProviderWebhook(rawBody, signature, secret) {
  const normalizedSignature = String(signature ?? "").replace(/^sha256=/i, "").trim();
  if (!normalizedSignature || !/^[a-fA-F0-9]+$/.test(normalizedSignature)) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(normalizedSignature, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

