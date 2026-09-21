import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_SCOPES = {
  admin: ['read', 'write', 'admin'],
  operator: ['read', 'write'],
  viewer: ['read'],
};

function nowIso() {
  return new Date().toISOString();
}

function getScopes(role) {
  return ROLE_SCOPES[role] ?? ROLE_SCOPES.viewer;
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signTokenPayload(serializedPayload, secret) {
  return createHmac('sha256', secret).update(serializedPayload).digest('base64url');
}

function createSignedToken(payload, secret) {
  const serializedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signTokenPayload(serializedPayload, secret);
  return `${serializedPayload}.${signature}`;
}

function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;

  const [serializedPayload, signature] = token.split('.');
  if (!serializedPayload || !signature) return null;

  const expectedSignature = signTokenPayload(serializedPayload, secret);
  if (!secureEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(serializedPayload, 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseBearer(request) {
  const header = request.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length);
}

function cleanupAuth(state) {
  const now = Date.now();
  state.auth.accessTokens = state.auth.accessTokens.filter((token) => token.expiresAt > now);
  state.auth.refreshTokens = state.auth.refreshTokens.filter((token) => token.expiresAt > now);
}

function issueToken(state, user, type, secret, options = {}) {
  const now = Date.now();
  const accessTtlMs = options.accessTtlMs ?? ACCESS_TTL_MS;
  const refreshTtlMs = options.refreshTtlMs ?? REFRESH_TTL_MS;
  const expiresAt = now + (type === 'access' ? accessTtlMs : refreshTtlMs);
  const scopes = getScopes(user.role);
  const payload = {
    sub: user.id,
    role: user.role,
    scopes,
    type,
    iat: now,
    exp: expiresAt,
  };
  const tokenRecord = {
    id: randomUUID(),
    token: createSignedToken(payload, secret),
    userId: user.id,
    role: user.role,
    scopes,
    createdAt: nowIso(),
    expiresAt,
  };

  if (type === 'access') state.auth.accessTokens.push(tokenRecord);
  else state.auth.refreshTokens.push(tokenRecord);
  return tokenRecord;
}

function authenticate(state, request, requiredScope, secret) {
  cleanupAuth(state);
  const token = parseBearer(request);
  const session = state.auth.accessTokens.find((item) => item.token === token);
  const payload = verifyToken(token, secret);

  if (
    !session ||
    !payload ||
    payload.type !== 'access' ||
    payload.sub !== session.userId ||
    payload.exp !== session.expiresAt
  ) {
    return {
      ok: false,
      code: 401,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token.' },
    };
  }

  if (requiredScope && !session.scopes.includes(requiredScope)) {
    return {
      ok: false,
      code: 403,
      error: { code: 'FORBIDDEN', message: 'Insufficient scope.' },
    };
  }

  return { ok: true, session, payload };
}

export { cleanupAuth, issueToken, authenticate, parseBearer, verifyToken };
