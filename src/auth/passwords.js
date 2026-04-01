import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const KEY_LENGTH = 64;

function toBuffer(value) {
  return Buffer.from(String(value), "utf8");
}

function secureEqual(left, right) {
  const leftBuffer = toBuffer(left);
  const rightBuffer = toBuffer(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function legacyHashPassword(legacySalt, password) {
  return createHash("sha256").update(`${legacySalt}:${password}`).digest("hex");
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const digest = scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${digest}`;
}

function verifyScryptHash(storedHash, password) {
  const parts = String(storedHash).split("$");
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) return false;

  const [, salt, digest] = parts;
  const candidate = scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return secureEqual(candidate, digest);
}

function verifyPassword(storedHash, password, options = {}) {
  const value = String(storedHash ?? "");
  const legacySalt = String(options.legacySalt ?? "");

  if (!value) {
    return { ok: false, nextHash: null, migrated: false };
  }

  if (value.startsWith(`${SCRYPT_PREFIX}$`)) {
    return {
      ok: verifyScryptHash(value, password),
      nextHash: null,
      migrated: false
    };
  }

  const legacyCandidate = legacyHashPassword(legacySalt, password);
  const ok = secureEqual(value, legacyCandidate);
  return {
    ok,
    nextHash: ok ? hashPassword(password) : null,
    migrated: ok
  };
}

export { hashPassword, verifyPassword };
