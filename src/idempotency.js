function toEpochMs(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

export function cleanupExpiredIdempotency(records, nowMs = Date.now()) {
  const kept = records.filter((entry) => {
    const expiresAtMs = toEpochMs(entry.expiresAt);
    return expiresAtMs === null || expiresAtMs > nowMs;
  });
  records.length = 0;
  records.push(...kept);
}

export function reserveIdempotencyKey(records, input) {
  const nowMs = input.nowMs ?? Date.now();
  cleanupExpiredIdempotency(records, nowMs);

  const existing = records.find((entry) => entry.key === input.key);
  if (!existing) {
    const ttlHours = input.ttlHours ?? 24;
    const record = {
      key: input.key,
      payloadHash: input.payloadHash,
      status: 'reserved',
      result: null,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + ttlHours * 60 * 60 * 1000).toISOString(),
    };
    records.unshift(record);
    return { accepted: true, replay: false, record };
  }

  if (existing.payloadHash !== input.payloadHash) {
    return { accepted: false, replay: false, reason: 'payload-mismatch', record: existing };
  }

  if (existing.status === 'completed') {
    return { accepted: true, replay: true, record: existing };
  }

  return { accepted: true, replay: false, record: existing };
}

export function markIdempotencyComplete(records, key, result, nowMs = Date.now()) {
  const current = records.find((entry) => entry.key === key);
  if (!current) {
    throw new Error('Idempotency key not reserved.');
  }
  current.status = 'completed';
  current.result = result;
  current.completedAt = new Date(nowMs).toISOString();
}
