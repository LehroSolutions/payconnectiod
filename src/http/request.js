class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function readRawBody(request, maxBytes = 1024 * 1024) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseJsonText(text) {
  const trimmed = text.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

async function readJsonBody(request, maxBytes) {
  const raw = await readRawBody(request, maxBytes);
  return parseJsonText(raw.toString('utf8'));
}

function appendVary(response, value) {
  const existing = response.getHeader('Vary');
  if (!existing) {
    response.setHeader('Vary', value);
    return;
  }

  const current = Array.isArray(existing) ? existing.join(', ') : String(existing);
  const values = current
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.includes(value)) {
    values.push(value);
    response.setHeader('Vary', values.join(', '));
  }
}

function applyCors(request, response, config) {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
  const allowedOrigins = config.corsOrigins ?? [];
  const allowAnyOrigin = allowedOrigins.includes('*');
  const allowOrigin = allowAnyOrigin
    ? '*'
    : origin && allowedOrigins.includes(origin)
      ? origin
      : '';

  if (origin) appendVary(response, 'Origin');

  if (allowOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowOrigin);
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    response.setHeader('Access-Control-Expose-Headers', 'x-request-id');
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return true;
  }

  return false;
}

export { HttpError, applyCors, parseJsonText, readJsonBody, readRawBody };
