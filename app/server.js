import { writeJsonAtomic } from '../src/persistence.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleanupExpiredIdempotency } from '../src/idempotency.js';
import { normalizeProviderStatus } from '../src/lifecycle.js';
import { createConfig } from '../src/config.js';
import { sendEnvelope } from '../src/envelope.js';
import { hashPassword } from '../src/auth/passwords.js';
import { authenticate } from '../src/auth/tokens.js';
import { applyCors } from '../src/http/request.js';
import { createWebhookDeliveryQueue } from '../src/events/delivery.js';
import { buildRouter } from '../src/routes/index.js';
import { amountToMinor, normalizeCurrency, nowIso } from '../src/routes/shared.js';
import { createAdapterRegistry } from '../src/adapters/registry.js';

const DEFAULT_DATA_FILE = fileURLToPath(new URL('./data.json', import.meta.url));
const DEFAULT_DB_FILE = fileURLToPath(new URL('./data.sqlite', import.meta.url));

const V1_DEPRECATION_HEADERS = {
  Deprecation: 'true',
  Sunset: 'Tue, 30 Jun 2026 23:59:59 GMT',
  Link: '</api/v2/payments>; rel="successor-version"',
};

function normalizeLedgerEntry(entry) {
  const fromMinor = Number.isInteger(entry.amountMinor) ? entry.amountMinor : null;
  const fromAmount = amountToMinor(entry.amount);
  const amountMinor = Number.isInteger(fromMinor)
    ? fromMinor
    : Number.isInteger(fromAmount)
      ? fromAmount
      : 0;

  return {
    id: String(entry.id ?? randomUUID()),
    createdAt: String(entry.createdAt ?? nowIso()),
    amountMinor: Math.max(0, amountMinor),
    currency: normalizeCurrency(entry.currency),
    providerId: entry.providerId
      ? String(entry.providerId)
      : entry.provider
        ? String(entry.provider)
        : null,
    recipientRef: entry.recipientRef
      ? String(entry.recipientRef)
      : entry.recipient
        ? String(entry.recipient)
        : null,
    status: normalizeProviderStatus(entry.status ?? 'initiated'),
    replay: Boolean(entry.replay),
    metadata: entry.metadata ?? null,
    providerRef: entry.providerRef ? String(entry.providerRef) : null,
    redirectUrl: entry.redirectUrl ? String(entry.redirectUrl) : null,
    providerResponse: entry.providerResponse ?? null,
    refunds: Array.isArray(entry.refunds)
      ? entry.refunds.map((refund) => ({
          id: String(refund.id ?? randomUUID()),
          idempotencyKey: refund.idempotencyKey ?? null,
          createdAt: String(refund.createdAt ?? nowIso()),
          amountMinor: Number(refund.amountMinor ?? 0),
          providerRef: refund.providerRef ? String(refund.providerRef) : null,
          status: String(refund.status ?? 'pending'),
          rawResponse: refund.rawResponse ?? null,
        }))
      : [],
    refundedAmountMinor: Number(entry.refundedAmountMinor ?? 0),
    updatedAt: entry.updatedAt ?? null,
  };
}

function normalizeProviderEntry(entry) {
  return {
    id: String(entry.id ?? randomUUID()),
    createdAt: String(entry.createdAt ?? nowIso()),
    name: String(entry.name ?? 'Unknown Provider'),
    capabilities: Array.isArray(entry.capabilities)
      ? entry.capabilities.map((item) => String(item))
      : [],
    status: String(entry.status ?? 'active'),
    updatedAt: entry.updatedAt ?? null,
  };
}

function normalizeMismatch(entry) {
  return {
    id: String(entry.id ?? randomUUID()),
    createdAt: String(entry.createdAt ?? nowIso()),
    paymentId: String(entry.paymentId ?? ''),
    reason: String(entry.reason ?? ''),
    disputeState: String(entry.disputeState ?? 'open'),
    resolution: entry.resolution ?? null,
    updatedAt: entry.updatedAt ?? null,
  };
}

function normalizeWebhookTrace(entry) {
  return {
    id: String(entry.id ?? randomUUID()),
    createdAt: String(entry.createdAt ?? nowIso()),
    provider: String(entry.provider ?? 'unknown'),
    verified: Boolean(entry.verified),
    eventType: String(entry.eventType ?? 'unknown'),
    retryCount: Number(entry.retryCount ?? 0),
    paymentId: entry.paymentId ? String(entry.paymentId) : null,
    processingError: entry.processingError ? String(entry.processingError) : null,
  };
}

function normalizeWebhookSubscription(entry) {
  return {
    id: String(entry.id ?? randomUUID()),
    createdAt: String(entry.createdAt ?? nowIso()),
    url: String(entry.url ?? ''),
    events: Array.isArray(entry.events) ? entry.events.map((item) => String(item)) : [],
    secret: String(entry.secret ?? randomUUID()),
    active: entry.active ?? true,
    consecutiveFailures: Number(entry.consecutiveFailures ?? 0),
    updatedAt: entry.updatedAt ?? null,
  };
}

function normalizeWebhookDelivery(entry) {
  return {
    id: String(entry.id ?? randomUUID()),
    createdAt: String(entry.createdAt ?? nowIso()),
    subscriptionId: String(entry.subscriptionId ?? ''),
    event: String(entry.event ?? 'unknown'),
    status: String(entry.status ?? 'failed'),
    attempts: Number(entry.attempts ?? 0),
    lastAttemptAt: entry.lastAttemptAt ?? null,
    responseCode: entry.responseCode ?? null,
    error: entry.error ? String(entry.error) : null,
  };
}

function normalizeWebhookDeadLetter(entry) {
  return {
    id: String(entry.id ?? randomUUID()),
    createdAt: String(entry.createdAt ?? nowIso()),
    subscriptionId: String(entry.subscriptionId ?? ''),
    event: String(entry.event ?? 'unknown'),
    payload: entry.payload ?? null,
    attempts: Number(entry.attempts ?? 0),
    reason: String(entry.reason ?? 'delivery_failed'),
    lastError: entry.lastError ? String(entry.lastError) : null,
    lastDeliveryId: entry.lastDeliveryId ? String(entry.lastDeliveryId) : null,
  };
}

function normalizeWebhookQueue(entry) {
  return {
    jobs: Array.isArray(entry?.jobs)
      ? entry.jobs.map((job) => ({
          id: String(job.id ?? randomUUID()),
          createdAt: String(job.createdAt ?? nowIso()),
          subscriptionId: String(job.subscriptionId ?? ''),
          payload: job.payload ?? null,
        }))
      : [],
  };
}

function normalizeIdempotencyRecord(entry, ttlHours) {
  const createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date();
  const expiresAt = entry.expiresAt
    ? new Date(entry.expiresAt)
    : new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000);

  return {
    key: String(entry.key ?? ''),
    payloadHash: String(entry.payloadHash ?? ''),
    paymentId: entry.paymentId ?? null,
    status: String(entry.status ?? 'reserved'),
    result: entry.result ?? null,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    completedAt: entry.completedAt ?? null,
  };
}

async function defaultState(config) {
  return {
    users: [
      {
        id: 'u-admin',
        username: config.appUser,
        passwordHash: await hashPassword(config.appPass),
        role: config.appRole,
      },
    ],
    auth: {
      accessTokens: [],
      refreshTokens: [],
      audit: [],
    },
    ledger: [],
    providers: [
      {
        id: 'prov-1',
        createdAt: nowIso(),
        name: 'PayFast',
        capabilities: ['card', 'eft'],
        status: 'active',
      },
      { id: 'prov-2', createdAt: nowIso(), name: 'Ozow', capabilities: ['eft'], status: 'active' },
    ],
    mismatches: [],
    webhookTraces: [],
    webhookSubscriptions: [],
    webhookDeliveries: [],
    webhookDeadLetters: [],
    webhookQueue: { jobs: [] },
    idempotencyRecords: [],
  };
}

async function normalizeState(rawState, config) {
  const fallback = await defaultState(config);
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  const users =
    Array.isArray(source.users) && source.users.length > 0 ? source.users : fallback.users;

  const normalized = {
    users: await Promise.all(
      users.map(async (user, index) => ({
        id: String(user.id ?? `u-${index + 1}`),
        username: String(user.username ?? config.appUser),
        passwordHash: String(user.passwordHash ?? (await hashPassword(config.appPass))),
        role: String(user.role ?? 'viewer'),
      })),
    ),
    auth: {
      accessTokens: Array.isArray(source.auth?.accessTokens) ? source.auth.accessTokens : [],
      refreshTokens: Array.isArray(source.auth?.refreshTokens) ? source.auth.refreshTokens : [],
      audit: Array.isArray(source.auth?.audit) ? source.auth.audit : [],
    },
    ledger: Array.isArray(source.ledger) ? source.ledger.map(normalizeLedgerEntry) : [],
    providers:
      Array.isArray(source.providers) && source.providers.length > 0
        ? source.providers.map(normalizeProviderEntry)
        : fallback.providers,
    mismatches: Array.isArray(source.mismatches) ? source.mismatches.map(normalizeMismatch) : [],
    webhookTraces: Array.isArray(source.webhookTraces)
      ? source.webhookTraces.map(normalizeWebhookTrace)
      : [],
    webhookSubscriptions: Array.isArray(source.webhookSubscriptions)
      ? source.webhookSubscriptions.map(normalizeWebhookSubscription)
      : [],
    webhookDeliveries: Array.isArray(source.webhookDeliveries)
      ? source.webhookDeliveries.map(normalizeWebhookDelivery)
      : [],
    webhookDeadLetters: Array.isArray(source.webhookDeadLetters)
      ? source.webhookDeadLetters.map(normalizeWebhookDeadLetter)
      : [],
    webhookQueue: normalizeWebhookQueue(source.webhookQueue),
    idempotencyRecords: Array.isArray(source.idempotencyRecords)
      ? source.idempotencyRecords
          .map((item) => normalizeIdempotencyRecord(item, config.idempotencyTtlHours))
          .filter((item) => item.key)
      : [],
  };

  cleanupExpiredIdempotency(normalized.idempotencyRecords);
  return normalized;
}

function logEvent(runtime, level, message, requestId, meta = {}) {
  if (!runtime.config.logEnabled) return;
  console.log(
    JSON.stringify({
      timestamp: nowIso(),
      level,
      app: runtime.config.appName,
      requestId,
      message,
      ...meta,
    }),
  );
}

async function ensureDirectory(pathValue) {
  await mkdir(dirname(pathValue), { recursive: true });
}

async function loadJsonState(config) {
  try {
    const raw = await readFile(config.dataFilePath, 'utf8');
    return await normalizeState(JSON.parse(raw), config);
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw new Error('Cannot read payment state; restore a verified backup before starting.', {
        cause: error,
      });
    return await normalizeState(await defaultState(config), config);
  }
}

async function loadState(config) {
  const jsonState = await loadJsonState(config);
  if (!config.preferSqlite) {
    return { state: jsonState, storageBackend: 'json-file', sqliteDb: null };
  }

  try {
    const sqliteModule = await import('node:sqlite');
    if (!sqliteModule?.DatabaseSync) {
      return { state: jsonState, storageBackend: 'json-file', sqliteDb: null };
    }

    const db = new sqliteModule.DatabaseSync(config.dbFilePath);
    db.exec(
      'CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updatedAt TEXT NOT NULL)',
    );
    const row = db.prepare('SELECT payload FROM state WHERE id = 1').get();

    if (row?.payload) {
      return {
        state: await normalizeState(JSON.parse(row.payload), config),
        storageBackend: 'sqlite',
        sqliteDb: db,
      };
    }

    db.prepare(
      'INSERT INTO state (id, payload, updatedAt) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt',
    ).run(JSON.stringify(jsonState), nowIso());
    return { state: jsonState, storageBackend: 'sqlite', sqliteDb: db };
  } catch (error) {
    if (!['ERR_UNKNOWN_BUILTIN_MODULE', 'ERR_MODULE_NOT_FOUND'].includes(error.code)) throw error;
    return { state: jsonState, storageBackend: 'json-file', sqliteDb: null };
  }
}

async function saveState(runtime) {
  cleanupExpiredIdempotency(runtime.state.idempotencyRecords);
  if (runtime.sqliteDb) {
    runtime.sqliteDb
      .prepare(
        'INSERT INTO state (id, payload, updatedAt) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt',
      )
      .run(JSON.stringify(runtime.state), nowIso());
    return;
  }

  await ensureDirectory(runtime.config.dataFilePath);
  await writeJsonAtomic(runtime.config.dataFilePath, runtime.state);
}

function requestIdFromHeader(request) {
  const requestIdHeader = request.headers['x-request-id'];
  if (Array.isArray(requestIdHeader)) return requestIdHeader[0];
  return requestIdHeader || randomUUID();
}

function createRequestHandler(runtime) {
  const router = buildRouter();

  return async (request, response) => {
    const requestId = requestIdFromHeader(request);
    const url = new URL(request.url || '/', `http://${runtime.config.host}:${runtime.config.port}`);
    const path = url.pathname;
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader(
      'content-security-policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );

    if (applyCors(request, response, runtime.config)) {
      return;
    }

    logEvent(runtime, 'info', 'request', requestId, { method: request.method, path });

    try {
      const match = router.match(request.method, path);
      if (match) {
        if (match.route.authScope) {
          const auth = authenticate(
            runtime.state,
            request,
            match.route.authScope,
            runtime.config.appSecret,
          );
          if (!auth.ok) {
            sendEnvelope(response, requestId, auth.code, { ok: false, error: auth.error });
            return;
          }
        }

        await match.route.handler({
          runtime,
          request,
          response,
          requestId,
          url,
          path,
          params: match.params,
          saveState,
          logEvent,
          v1Headers: V1_DEPRECATION_HEADERS,
          readAppHtml: () => readFile(new URL('./index.html', import.meta.url), 'utf8'),
        });
        return;
      }

      sendEnvelope(response, requestId, 404, {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Route not found.' },
      });
    } catch (error) {
      if (error?.statusCode) {
        sendEnvelope(response, requestId, error.statusCode, {
          ok: false,
          error: {
            code: error.code ?? 'BAD_REQUEST',
            message: error.message,
          },
        });
        return;
      }

      if (error instanceof SyntaxError) {
        sendEnvelope(response, requestId, 400, {
          ok: false,
          error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
        });
        return;
      }

      logEvent(runtime, 'error', 'request_failed', requestId, {
        error: String(error?.message || error),
      });
      sendEnvelope(response, requestId, 500, {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' },
      });
    }
  };
}

export async function createAppServer(options = {}) {
  const config = createConfig(options);
  const loaded = await loadState(config);
  const runtime = {
    config,
    state: loaded.state,
    storageBackend: loaded.storageBackend,
    sqliteDb: loaded.sqliteDb,
    adapterRegistry: createAdapterRegistry(config),
    mcpSseSessions: new Map(),
  };
  runtime.persist = () => saveState(runtime);
  runtime.deliveryQueue = createWebhookDeliveryQueue({
    runtime,
    saveState,
  });
  if (runtime.config.webhookQueueAutoStart !== false) {
    runtime.deliveryQueue.start();
  }

  const server = createServer(createRequestHandler(runtime));
  server.on('close', () => {
    for (const session of runtime.mcpSseSessions.values()) {
      session.response.end();
      clearInterval(session.heartbeat);
    }
    if (runtime.sqliteDb?.close) runtime.sqliteDb.close();
  });

  return {
    server,
    runtime,
    config,
    waitForBackgroundWork: () => runtime.deliveryQueue?.onIdle?.() ?? Promise.resolve(),
  };
}

export async function startServer(options = {}) {
  const app = await createAppServer(options);
  const host = options.host ?? app.config.host;
  const requestedPort = options.port ?? app.config.port;

  await new Promise((resolveListen, rejectListen) => {
    app.server.once('error', rejectListen);
    app.server.listen(requestedPort, host, () => {
      app.server.removeListener('error', rejectListen);
      resolveListen();
    });
  });

  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  const baseUrl = `http://${host}:${port}`;
  app.runtime.baseUrl = baseUrl;
  logEvent(app.runtime, 'info', 'server_started', 'startup', { url: baseUrl });

  return { ...app, host, port, baseUrl };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
