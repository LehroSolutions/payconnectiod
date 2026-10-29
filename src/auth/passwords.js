import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SCRYPT_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

function toBuffer(value) {
  return Buffer.from(String(value), 'utf8');
}

function secureEqual(left, right) {
  const leftBuffer = toBuffer(left);
  const rightBuffer = toBuffer(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function legacyHashPassword(legacySalt, password) {
  return createHash('sha256').update(`${legacySalt}:${password}`).digest('hex');
}

async function deriveScryptHex(password, salt) {
  const derived = await scryptAsync(String(password), salt, KEY_LENGTH);
  return Buffer.from(derived).toString('hex');
}

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const digest = await deriveScryptHex(password, salt);
  return `${SCRYPT_PREFIX}$${salt}$${digest}`;
}

async function verifyScryptHash(storedHash, password) {
  const parts = String(storedHash).split('$');
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) return false;

  const [, salt, digest] = parts;
  const candidate = await deriveScryptHex(password, salt);
  return secureEqual(candidate, digest);
}

async function verifyPassword(storedHash, password, options = {}) {
  const value = String(storedHash ?? '');
  const legacySalt = String(options.legacySalt ?? '');

  if (!value) {
    return { ok: false, nextHash: null, migrated: false };
  }

  if (value.startsWith(`${SCRYPT_PREFIX}$`)) {
    return {
      ok: await verifyScryptHash(value, password),
      nextHash: null,
      migrated: false,
    };
  }

  const legacyCandidate = legacyHashPassword(legacySalt, password);
  const ok = secureEqual(value, legacyCandidate);
  return {
    ok,
    nextHash: ok ? await hashPassword(password) : null,
    migrated: ok,
  };
}

async function burnVerificationTime(password) {
  await deriveScryptHex(password, 'payconnectoid-timing-equalizer');
}

export { burnVerificationTime, hashPassword, verifyPassword };
