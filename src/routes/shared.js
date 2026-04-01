import { createHash, randomUUID } from "node:crypto";
import { reserveIdempotencyKey, markIdempotencyComplete } from "../idempotency.js";
import { canTransition, normalizeProviderStatus } from "../lifecycle.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeCurrency(input) {
  return String(input ?? "ZAR").trim().toUpperCase();
}

function amountToMinor(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeSortField(value, allowedFields, fallback) {
  const candidate = String(value ?? "").trim();
  return allowedFields.has(candidate) ? candidate : fallback;
}

function normalizeSortOrder(value) {
  return String(value ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
}

function filterPayments(payments, searchParams) {
  const status = String(searchParams.get("status") ?? "").trim().toLowerCase();
  const currency = String(searchParams.get("currency") ?? "").trim().toUpperCase();
  const providerId = String(searchParams.get("providerId") ?? "").trim().toLowerCase();
  const recipientRef = String(searchParams.get("recipientRef") ?? "").trim().toLowerCase();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const fromMs = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
  const toMs = to ? Date.parse(to) : Number.POSITIVE_INFINITY;

  return payments.filter((payment) => {
    const createdAtMs = Date.parse(payment.createdAt);
    if (status && String(payment.status).toLowerCase() !== status) return false;
    if (currency && String(payment.currency).toUpperCase() !== currency) return false;
    if (providerId && String(payment.providerId ?? "").toLowerCase() !== providerId) return false;
    if (recipientRef && !String(payment.recipientRef ?? "").toLowerCase().includes(recipientRef)) return false;
    if (Number.isFinite(fromMs) && createdAtMs < fromMs) return false;
    if (Number.isFinite(toMs) && createdAtMs > toMs) return false;
    return true;
  });
}

function sortPayments(payments, sortField, order) {
  const direction = order === "asc" ? 1 : -1;
  const sorted = [...payments];
  sorted.sort((left, right) => {
    const leftValue = sortField === "createdAt" ? Date.parse(left.createdAt) : left[sortField] ?? "";
    const rightValue = sortField === "createdAt" ? Date.parse(right.createdAt) : right[sortField] ?? "";
    if (leftValue === rightValue) return 0;
    return leftValue > rightValue ? direction : -direction;
  });
  return sorted;
}

function paginateItems(items, searchParams, options = {}) {
  const defaultLimit = options.defaultLimit ?? 25;
  const maxLimit = options.maxLimit ?? 100;
  const page = parsePositiveInteger(searchParams.get("page"), 1);
  const requestedLimit = parsePositiveInteger(searchParams.get("limit"), defaultLimit);
  const limit = Math.min(requestedLimit, maxLimit);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  return {
    items: items.slice(offset, offset + limit),
    pagination: { page, limit, total, pages }
  };
}

const WINDOW_MS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000
};

function resolveAnalyticsRange(searchParams) {
  const now = Date.now();
  const toRaw = searchParams.get("to");
  const fromRaw = searchParams.get("from");
  const windowKey = String(searchParams.get("window") ?? "7d");
  const resolvedTo = Number.isFinite(Date.parse(toRaw ?? "")) ? Date.parse(toRaw) : now;
  const resolvedFrom = Number.isFinite(Date.parse(fromRaw ?? ""))
    ? Date.parse(fromRaw)
    : resolvedTo - (WINDOW_MS[windowKey] ?? WINDOW_MS["7d"]);
  const delta = Math.max(resolvedTo - resolvedFrom, 0);
  const bucket = String(searchParams.get("bucket") ?? (delta <= WINDOW_MS["24h"] * 2 ? "hour" : "day")).toLowerCase() === "hour"
    ? "hour"
    : "day";

  return {
    window: windowKey,
    bucket,
    fromMs: resolvedFrom,
    toMs: resolvedTo,
    from: new Date(resolvedFrom).toISOString(),
    to: new Date(resolvedTo).toISOString()
  };
}

function bucketStart(timestampMs, bucket) {
  const value = new Date(timestampMs);
  if (bucket === "hour") {
    value.setUTCMinutes(0, 0, 0);
  } else {
    value.setUTCHours(0, 0, 0, 0);
  }
  return value.toISOString();
}

function buildTimeSeries(items, range, reducer) {
  const buckets = new Map();

  for (const item of items) {
    const createdAtMs = Date.parse(item.createdAt);
    if (!Number.isFinite(createdAtMs) || createdAtMs < range.fromMs || createdAtMs > range.toMs) continue;
    const key = bucketStart(createdAtMs, range.bucket);
    const current = buckets.get(key) ?? { bucketStart: key };
    reducer(current, item);
    buckets.set(key, current);
  }

  return Array.from(buckets.values()).sort((left, right) => Date.parse(left.bucketStart) - Date.parse(right.bucketStart));
}

function listPayments(state, searchParams) {
  const allowedSortFields = new Set(["createdAt", "amountMinor", "currency", "status", "providerId"]);
  const filtered = filterPayments(state.ledger, searchParams);
  const sort = normalizeSortField(searchParams.get("sort"), allowedSortFields, "createdAt");
  const order = normalizeSortOrder(searchParams.get("order"));
  const sorted = sortPayments(filtered, sort, order);
  const { items, pagination } = paginateItems(sorted, searchParams, { defaultLimit: 25, maxLimit: 100 });
  return {
    payments: items,
    pagination,
    filters: {
      status: searchParams.get("status") ?? null,
      currency: searchParams.get("currency") ?? null,
      providerId: searchParams.get("providerId") ?? null,
      recipientRef: searchParams.get("recipientRef") ?? null,
      from: searchParams.get("from") ?? null,
      to: searchParams.get("to") ?? null,
      sort,
      order
    }
  };
}

function refundableAmount(payment) {
  return Math.max(Number(payment.amountMinor ?? 0) - Number(payment.refundedAmountMinor ?? 0), 0);
}

function validateRefundRequest(payment, amountMinor) {
  if (payment.status !== "settled") {
    return {
      ok: false,
      code: 409,
      error: { code: "PAYMENT_NOT_SETTLED", message: "Only settled payments can be refunded." }
    };
  }

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return {
      ok: false,
      code: 400,
      error: { code: "VALIDATION_ERROR", message: "amountMinor must be a positive integer." }
    };
  }

  const remaining = refundableAmount(payment);
  if (remaining <= 0) {
    return {
      ok: false,
      code: 409,
      error: { code: "REFUND_EXHAUSTED", message: "Payment has no refundable balance remaining." }
    };
  }

  if (amountMinor > remaining) {
    return {
      ok: false,
      code: 409,
      error: {
        code: "REFUND_EXCEEDS_REMAINING",
        message: `Refund amount exceeds remaining refundable balance of ${remaining}.`
      }
    };
  }

  return { ok: true, remaining };
}

function listRefunds(state, searchParams) {
  const refunds = state.ledger.flatMap((payment) => {
    return (payment.refunds ?? []).map((refund) => ({
      ...refund,
      paymentId: payment.id,
      paymentStatus: payment.status,
      currency: payment.currency,
      providerId: payment.providerId,
      recipientRef: payment.recipientRef
    }));
  });

  const status = String(searchParams.get("status") ?? "").trim().toLowerCase();
  const providerId = String(searchParams.get("providerId") ?? "").trim().toLowerCase();
  const paymentId = String(searchParams.get("paymentId") ?? "").trim();
  const currency = String(searchParams.get("currency") ?? "").trim().toUpperCase();

  const filtered = refunds.filter((refund) => {
    if (status && String(refund.status).toLowerCase() !== status) return false;
    if (providerId && String(refund.providerId ?? "").toLowerCase() !== providerId) return false;
    if (paymentId && refund.paymentId !== paymentId) return false;
    if (currency && String(refund.currency ?? "").toUpperCase() !== currency) return false;
    return true;
  });

  const sorted = [...filtered].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const { items, pagination } = paginateItems(sorted, searchParams, { defaultLimit: 25, maxLimit: 100 });
  const totalRefundedMinor = filtered.reduce((sum, refund) => sum + Number(refund.amountMinor ?? 0), 0);
  const pendingRefundedMinor = filtered
    .filter((refund) => String(refund.status).toLowerCase() === "pending")
    .reduce((sum, refund) => sum + Number(refund.amountMinor ?? 0), 0);

  return {
    refunds: items,
    pagination,
    filters: {
      status: searchParams.get("status") ?? null,
      providerId: searchParams.get("providerId") ?? null,
      paymentId: searchParams.get("paymentId") ?? null,
      currency: searchParams.get("currency") ?? null
    },
    summary: {
      refundCount: filtered.length,
      totalRefundedMinor,
      pendingRefundedMinor
    }
  };
}

function collectRefundEntries(state) {
  return state.ledger.flatMap((payment) => {
    return (payment.refunds ?? []).map((refund) => ({
      createdAt: refund.createdAt,
      amountMinor: Number(refund.amountMinor ?? 0),
      status: String(refund.status ?? "pending"),
      providerId: String(payment.providerId ?? "unknown"),
      currency: String(payment.currency ?? "ZAR"),
      paymentId: payment.id
    }));
  });
}

function refundAnalytics(state, searchParams = new URLSearchParams()) {
  const range = resolveAnalyticsRange(searchParams);
  const status = String(searchParams.get("status") ?? "").trim().toLowerCase();
  const providerId = String(searchParams.get("providerId") ?? "").trim().toLowerCase();
  const currency = String(searchParams.get("currency") ?? "").trim().toUpperCase();
  const paymentId = String(searchParams.get("paymentId") ?? "").trim();
  const refunds = collectRefundEntries(state).filter((refund) => {
    const createdAtMs = Date.parse(refund.createdAt);
    if (!Number.isFinite(createdAtMs) || createdAtMs < range.fromMs || createdAtMs > range.toMs) return false;
    if (status && refund.status.toLowerCase() !== status) return false;
    if (providerId && refund.providerId.toLowerCase() !== providerId) return false;
    if (currency && refund.currency.toUpperCase() !== currency) return false;
    if (paymentId && refund.paymentId !== paymentId) return false;
    return true;
  });

  const byProvider = {};
  const byCurrency = {};
  const byStatus = {};

  for (const refund of refunds) {
    byProvider[refund.providerId] = (byProvider[refund.providerId] ?? 0) + refund.amountMinor;
    byCurrency[refund.currency] = (byCurrency[refund.currency] ?? 0) + refund.amountMinor;
    byStatus[refund.status] = (byStatus[refund.status] ?? 0) + 1;
  }

  return {
    range,
    summary: {
      refundCount: refunds.length,
      totalRefundedMinor: refunds.reduce((sum, refund) => sum + refund.amountMinor, 0),
      pendingRefundedMinor: refunds
        .filter((refund) => refund.status.toLowerCase() === "pending")
        .reduce((sum, refund) => sum + refund.amountMinor, 0)
    },
    byProvider,
    byCurrency,
    byStatus,
    timeseries: buildTimeSeries(refunds, range, (bucket, refund) => {
      bucket.refundCount = (bucket.refundCount ?? 0) + 1;
      bucket.totalRefundedMinor = (bucket.totalRefundedMinor ?? 0) + refund.amountMinor;
      if (refund.status.toLowerCase() === "pending") {
        bucket.pendingRefundedMinor = (bucket.pendingRefundedMinor ?? 0) + refund.amountMinor;
      }
    })
  };
}

function deliveryAnalytics(state, searchParams = new URLSearchParams()) {
  const range = resolveAnalyticsRange(searchParams);
  const status = String(searchParams.get("status") ?? "").trim().toLowerCase();
  const event = String(searchParams.get("event") ?? "").trim().toLowerCase();
  const subscriptionId = String(searchParams.get("subscriptionId") ?? "").trim();
  const deliveries = (state.webhookDeliveries ?? []).filter((delivery) => {
    const createdAtMs = Date.parse(delivery.createdAt);
    if (!Number.isFinite(createdAtMs) || createdAtMs < range.fromMs || createdAtMs > range.toMs) return false;
    if (status && String(delivery.status).toLowerCase() !== status) return false;
    if (event && String(delivery.event).toLowerCase() !== event) return false;
    if (subscriptionId && delivery.subscriptionId !== subscriptionId) return false;
    return true;
  });

  const byStatus = {};
  const byEvent = {};
  for (const delivery of deliveries) {
    byStatus[delivery.status] = (byStatus[delivery.status] ?? 0) + 1;
    byEvent[delivery.event] = (byEvent[delivery.event] ?? 0) + 1;
  }

  const successfulCount = byStatus.delivered ?? 0;
  const failedCount = deliveries.length - successfulCount;

  return {
    range,
    summary: {
      deliveryCount: deliveries.length,
      deliveredCount: successfulCount,
      failedCount,
      successRate: deliveries.length === 0 ? 0 : Number((successfulCount / deliveries.length).toFixed(4))
    },
    byStatus,
    byEvent,
    timeseries: buildTimeSeries(deliveries, range, (bucket, delivery) => {
      bucket.deliveryCount = (bucket.deliveryCount ?? 0) + 1;
      if (String(delivery.status).toLowerCase() === "delivered") {
        bucket.deliveredCount = (bucket.deliveredCount ?? 0) + 1;
      } else {
        bucket.failedCount = (bucket.failedCount ?? 0) + 1;
      }
    })
  };
}

function enrichProvidersWithAdapters(providers, adapterRegistry) {
  return providers.map((provider) => {
    const adapterId = String(provider.name ?? provider.id ?? "").trim().toLowerCase();
    const adapter = adapterRegistry?.get(adapterId);
    return {
      ...provider,
      adapter: adapter
        ? {
            id: adapter.name,
            capabilities: adapter.capabilities,
            configured: true
          }
        : null
    };
  });
}

function getPaymentById(state, paymentId) {
  return state.ledger.find((item) => item.id === paymentId) ?? null;
}

function resolveAdapter(runtime, providerId) {
  if (!providerId) return null;
  return runtime.adapterRegistry?.get(String(providerId).trim().toLowerCase()) ?? null;
}

function parseCreatePaymentPayload(payload, { allowLegacyAmount }) {
  const errors = [];
  const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
  if (!idempotencyKey) errors.push("idempotencyKey is required.");

  const amountMinorCandidate = payload.amountMinor ?? (allowLegacyAmount ? amountToMinor(payload.amount) : null);
  const amountMinor = Number(amountMinorCandidate);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    errors.push("amountMinor must be a positive integer minor-unit amount.");
  }

  const currency = normalizeCurrency(payload.currency);
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("currency must be a 3-letter ISO code.");

  const providerCandidate = payload.providerId ?? payload.provider;
  const providerId = typeof providerCandidate === "string" ? providerCandidate.trim() : "";
  if (!providerId) errors.push("providerId is required.");

  const recipientRaw = payload.recipientRef ?? payload.recipient;
  const recipientRef = typeof recipientRaw === "string" && recipientRaw.trim() ? recipientRaw.trim() : null;
  const providerStatus = typeof payload.providerStatus === "string" && payload.providerStatus.trim()
    ? payload.providerStatus.trim()
    : null;

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      idempotencyKey,
      amountMinor,
      currency,
      providerId,
      recipientRef,
      providerStatus,
      metadata: payload.metadata ?? null
    }
  };
}

function idempotencyPayloadHash(paymentInput) {
  return createHash("sha256")
    .update(JSON.stringify({
      amountMinor: paymentInput.amountMinor,
      currency: paymentInput.currency,
      providerId: paymentInput.providerId,
      recipientRef: paymentInput.recipientRef,
      providerStatus: paymentInput.providerStatus,
      metadata: paymentInput.metadata
    }))
    .digest("hex");
}

function transitionAllowed(fromState, toState) {
  return fromState === toState || canTransition(fromState, toState);
}

async function createPaymentFromInput(runtime, requestId, paymentInput, logEvent) {
  const payloadHash = idempotencyPayloadHash(paymentInput);
  const idempotency = reserveIdempotencyKey(runtime.state.idempotencyRecords, {
    key: paymentInput.idempotencyKey,
    payloadHash,
    ttlHours: runtime.config.idempotencyTtlHours
  });

  if (!idempotency.accepted) {
    logEvent(runtime, "warn", "idempotency_conflict", requestId, { key: paymentInput.idempotencyKey });
    return {
      ok: false,
      code: 409,
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message: "Idempotency key conflict.",
        details: ["The idempotency key was reused with a different payload."]
      }
    };
  }

  if (idempotency.replay && idempotency.record?.result) {
    logEvent(runtime, "info", "idempotency_replay", requestId, { key: paymentInput.idempotencyKey });
    return {
      ok: true,
      code: 200,
      replay: true,
      payment: idempotency.record.result
    };
  }

  const targetStatus = normalizeProviderStatus(paymentInput.providerStatus ?? "initiated");
  if (!transitionAllowed("initiated", targetStatus)) {
    logEvent(runtime, "warn", "invalid_transition_on_create", requestId, {
      from: "initiated",
      to: targetStatus
    });
    return {
      ok: false,
      code: 422,
      error: {
        code: "INVALID_TRANSITION",
        message: `Cannot transition payment from initiated to ${targetStatus}.`
      }
    };
  }

  const payment = {
    id: randomUUID(),
    createdAt: nowIso(),
    amountMinor: paymentInput.amountMinor,
    currency: paymentInput.currency,
    providerId: paymentInput.providerId,
    recipientRef: paymentInput.recipientRef,
    status: targetStatus,
    replay: false,
    metadata: paymentInput.metadata,
    providerRef: null,
    redirectUrl: null,
    providerResponse: null,
    refunds: [],
    refundedAmountMinor: 0
  };

  const adapter = resolveAdapter(runtime, payment.providerId);
  if (adapter) {
    const initiation = await adapter.initiate({
      ...paymentInput,
      paymentId: payment.id
    });
    payment.providerRef = initiation.providerRef ?? null;
    payment.redirectUrl = initiation.redirectUrl ?? null;
    payment.providerResponse = initiation.rawResponse ?? null;
    if (initiation.status) {
      const initiatedStatus = normalizeProviderStatus(initiation.status);
      if (transitionAllowed(payment.status, initiatedStatus)) {
        payment.status = initiatedStatus;
      }
    }
  }

  runtime.state.ledger.unshift(payment);
  markIdempotencyComplete(runtime.state.idempotencyRecords, paymentInput.idempotencyKey, payment);
  return { ok: true, code: 201, replay: false, payment };
}

function updatePaymentStatus(runtime, requestId, paymentId, statusRaw, logEvent) {
  const payment = runtime.state.ledger.find((item) => item.id === paymentId);
  if (!payment) {
    return {
      ok: false,
      code: 404,
      error: { code: "NOT_FOUND", message: "Payment not found." }
    };
  }

  const nextStatus = normalizeProviderStatus(statusRaw);
  if (payment.status === "initiated" && nextStatus === "settled") {
    payment.status = "authorized";
  }
  if (!transitionAllowed(payment.status, nextStatus)) {
    logEvent(runtime, "warn", "invalid_transition", requestId, {
      paymentId,
      from: payment.status,
      to: nextStatus
    });
    return {
      ok: false,
      code: 422,
      error: { code: "INVALID_TRANSITION", message: `Cannot transition payment from ${payment.status} to ${nextStatus}.` }
    };
  }

  payment.status = nextStatus;
  payment.updatedAt = nowIso();
  return { ok: true, code: 200, payment };
}

function reconciliationData(state) {
  const byStatus = state.ledger.reduce((acc, payment) => {
    acc[payment.status] = (acc[payment.status] || 0) + 1;
    return acc;
  }, {});

  const totalCount = state.ledger.length;
  const pendingCount = (byStatus.initiated || 0) + (byStatus.authorized || 0);
  const mismatchCount = state.mismatches.length;
  const matchedCount = Math.max((byStatus.settled || 0) - mismatchCount, 0);
  const totalVolumeMinor = state.ledger.reduce((sum, payment) => sum + payment.amountMinor, 0);

  return {
    summary: {
      totalCount,
      matchedCount,
      pendingCount,
      mismatchCount,
      totalVolumeMinor
    },
    byStatus
  };
}

function toLegacyPayment(payment) {
  return {
    id: payment.id,
    createdAt: payment.createdAt,
    amount: Number((payment.amountMinor / 100).toFixed(2)),
    currency: payment.currency,
    provider: payment.providerId,
    recipient: payment.recipientRef,
    status: payment.status,
    replay: payment.replay
  };
}

function webhookSecretForProvider(config, provider) {
  const normalizedProvider = String(provider || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const providerSecretName = normalizedProvider ? `WEBHOOK_SIGNING_SECRET_${normalizedProvider}` : "";
  return (providerSecretName && config.env[providerSecretName]) || config.webhookDefaultSecret || "";
}

function createRiskAssessment(payload) {
  const amountMinor = Number(payload.amountMinor ?? amountToMinor(payload.amount) ?? 0);
  const currency = normalizeCurrency(payload.currency);
  const provider = String(payload.provider || payload.providerId || "unknown").toLowerCase();
  const status = String(payload.status || "pending").toLowerCase();
  const factors = [];
  let score = 0;
  const thresholds = { ZAR: 5000000, USD: 300000, NGN: 500000000, KES: 40000000, GHS: 3000000 };
  const threshold = thresholds[currency] || 1000000;

  if (amountMinor > threshold * 2) {
    score += 35;
    factors.push(`Amount ${amountMinor} minor units exceeds threshold ${threshold} by a large margin.`);
  } else if (amountMinor > threshold) {
    score += 20;
    factors.push(`Amount ${amountMinor} minor units exceeds threshold ${threshold}.`);
  }

  if (!["paystack", "flutterwave", "ozow", "peach", "dpo", "payfast"].includes(provider)) {
    score += 15;
    factors.push(`Unrecognized or unlisted payment provider '${provider}'.`);
  }

  if (status === "failed") {
    score += 20;
    factors.push("Transaction is in a failed state and may indicate retry abuse.");
  }

  if (status === "reversed") {
    score += 25;
    factors.push("Transaction has been reversed and should be checked for chargeback risk.");
  }

  if (amountMinor > 0 && amountMinor % 100000 === 0) {
    score += 5;
    factors.push("Round-number amount pattern detected.");
  }

  const riskScore = Math.min(score, 100);
  const riskLevel = riskScore >= 60 ? "critical" : riskScore >= 40 ? "high" : riskScore >= 20 ? "medium" : "low";
  const recommendation = riskScore >= 60
    ? "Block transaction and send for manual review."
    : riskScore >= 40
    ? "Hold transaction for additional verification."
    : riskScore >= 20
    ? "Proceed with enhanced monitoring."
    : "Risk appears low. Proceed normally.";

  return {
    riskScore,
    riskLevel,
    factors,
    recommendation,
    metadata: { currency, threshold, provider, status }
  };
}

export {
  amountToMinor,
  createPaymentFromInput,
  createRiskAssessment,
  enrichProvidersWithAdapters,
  getPaymentById,
  listPayments,
  listRefunds,
  deliveryAnalytics,
  normalizeCurrency,
  nowIso,
  paginateItems,
  parseCreatePaymentPayload,
  reconciliationData,
  resolveAdapter,
  refundAnalytics,
  refundableAmount,
  toLegacyPayment,
  updatePaymentStatus,
  validateRefundRequest,
  webhookSecretForProvider
};
