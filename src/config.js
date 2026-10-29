import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4106;
const DEFAULT_APP_NAME = 'payconnectoid';
const DEFAULT_APP_USER = 'admin';
const DEFAULT_APP_PASS = 'admin123';
const DEFAULT_APP_ROLE = 'admin';
const DEFAULT_AUTH_SALT = 'payconnectoid-salt';
const DEFAULT_DATA_FILE = fileURLToPath(new URL('../app/data.json', import.meta.url));
const DEFAULT_DB_FILE = fileURLToPath(new URL('../app/data.sqlite', import.meta.url));
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;

function defaultAppSecret(appName) {
  return `${appName}-dev-secret`;
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveFilePath(pathValue, fallbackPath) {
  if (!pathValue) return fallbackPath;
  if (isAbsolute(pathValue)) return pathValue;
  return resolve(process.cwd(), pathValue);
}

function parseCorsOrigins(value, env) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const raw = value ?? env.CORS_ORIGINS ?? (env.NODE_ENV === 'development' ? '*' : '');
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumberList(value, fallback) {
  if (Array.isArray(value)) {
    const parsed = value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 0);
    return parsed.length > 0 ? parsed : fallback;
  }

  if (typeof value === 'string') {
    const parsed = value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item >= 0);
    return parsed.length > 0 ? parsed : fallback;
  }

  return fallback;
}

function isProductionEnv(env) {
  return String(env.NODE_ENV ?? '').toLowerCase() === 'production';
}

function validateProductionConfig(config) {
  const insecureKeys = [];

  if (!String(config.appPass).trim() || config.appPass === DEFAULT_APP_PASS) {
    insecureKeys.push('APP_PASS');
  }

  if (!String(config.appSecret).trim() || config.appSecret === defaultAppSecret(config.appName)) {
    insecureKeys.push('APP_SECRET');
  }

  if (insecureKeys.length === 0) return;

  const error = new Error(
    `Refusing to start in production with insecure defaults. Set explicit non-default values for ${insecureKeys.join(' and ')}.`,
  );
  error.code = 'INVALID_PRODUCTION_CONFIG';
  throw error;
}

export function createConfig(options = {}) {
  const env = options.env ?? process.env;
  const appName = options.appName ?? env.APP_NAME ?? DEFAULT_APP_NAME;

  const config = {
    env,
    appName,
    host: options.host ?? env.HOST ?? DEFAULT_HOST,
    port: asNumber(options.port ?? env.PORT, DEFAULT_PORT),
    dataFilePath: resolveFilePath(options.dataFilePath ?? env.APP_DATA_FILE, DEFAULT_DATA_FILE),
    dbFilePath: resolveFilePath(options.dbFilePath ?? env.APP_DB_FILE, DEFAULT_DB_FILE),
    preferSqlite: options.preferSqlite ?? true,
    appUser: options.appUser ?? env.APP_USER ?? DEFAULT_APP_USER,
    appPass: options.appPass ?? env.APP_PASS ?? DEFAULT_APP_PASS,
    appRole: options.appRole ?? env.APP_ROLE ?? DEFAULT_APP_ROLE,
    appSecret: options.appSecret ?? env.APP_SECRET ?? defaultAppSecret(appName),
    authSalt: options.authSalt ?? env.AUTH_SALT ?? DEFAULT_AUTH_SALT,
    idempotencyTtlHours: asNumber(options.idempotencyTtlHours ?? env.IDEMPOTENCY_TTL_HOURS, 24),
    webhookDefaultSecret: options.webhookDefaultSecret ?? env.WEBHOOK_SIGNING_SECRET_DEFAULT ?? '',
    webhookAllowPrivateTargets:
      options.webhookAllowPrivateTargets ??
      (env.WEBHOOK_ALLOW_PRIVATE_TARGETS === 'true' ? true : !isProductionEnv(env)),
    paystackBaseUrl: options.paystackBaseUrl ?? env.PAYSTACK_BASE_URL ?? 'https://api.paystack.co',
    webhookRetryDelaysMs: parseNumberList(
      options.webhookRetryDelaysMs ?? env.WEBHOOK_RETRY_DELAYS_MS,
      [0, 25, 100],
    ),
    webhookDeliveryTimeoutMs: asNumber(
      options.webhookDeliveryTimeoutMs ?? env.WEBHOOK_DELIVERY_TIMEOUT_MS,
      5000,
    ),
    webhookQueueAutoStart:
      options.webhookQueueAutoStart ?? env.WEBHOOK_QUEUE_AUTO_START !== 'false',
    logEnabled: options.logEnabled ?? true,
    bodyLimitBytes: asNumber(
      options.bodyLimitBytes ?? env.BODY_LIMIT_BYTES,
      DEFAULT_BODY_LIMIT_BYTES,
    ),
    corsOrigins: parseCorsOrigins(options.corsOrigins, env),
  };

  if (isProductionEnv(env)) {
    validateProductionConfig(config);
  }

  return config;
}
