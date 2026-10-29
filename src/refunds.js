import { randomUUID } from 'node:crypto';
import { HttpError } from './http/request.js';
import { validateRefundRequest } from './routes/shared.js';

export async function performRefund(runtime, payment, payload, adapter) {
  const key = payload.idempotencyKey;
  if (typeof key !== 'string' || !key.trim() || key.length > 200) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'A non-empty idempotencyKey of at most 200 characters is required for refunds.',
    );
  }
  const amountMinor = payload.amountMinor ?? payment.amountMinor;
  const existing = payment.refunds.find((refund) => refund.idempotencyKey === key);
  if (existing) {
    if (existing.amountMinor !== amountMinor)
      throw new HttpError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'Refund key was reused with a different amount.',
      );
    if (['processing', 'unknown'].includes(existing.status))
      throw new HttpError(
        409,
        'REFUND_RECONCILIATION_REQUIRED',
        'Refund is in progress or its provider outcome is unknown. Reconcile before retrying.',
      );
    return { refund: existing, replay: true };
  }
  if (!payment.providerRef)
    throw new HttpError(
      409,
      'MISSING_PROVIDER_REF',
      'Payment has no provider reference to refund.',
    );
  const validation = validateRefundRequest(payment, amountMinor);
  if (!validation.ok)
    throw new HttpError(validation.code, validation.error.code, validation.error.message);

  const refund = {
    id: randomUUID(),
    idempotencyKey: key,
    createdAt: new Date().toISOString(),
    amountMinor,
    providerRef: payment.providerRef,
    status: 'processing',
    rawResponse: null,
  };
  payment.refunds.unshift(refund);
  payment.refundedAmountMinor = Number(payment.refundedAmountMinor ?? 0) + amountMinor;
  payment.updatedAt = new Date().toISOString();
  // Reserve the balance durably before calling the provider; other requests see it immediately.
  await runtime.persist();
  try {
    const result = await adapter.refund(payment.providerRef, amountMinor);
    refund.providerRef = result.providerRef ?? payment.providerRef;
    refund.status = String(result.status ?? 'pending');
    refund.rawResponse = result.rawResponse ?? null;
    await runtime.persist();
    return { refund, replay: false };
  } catch {
    refund.status = 'unknown';
    await runtime.persist();
    throw new HttpError(
      502,
      'REFUND_RECONCILIATION_REQUIRED',
      'Provider outcome is unknown. The reserved amount is retained; reconcile before retrying.',
    );
  }
}
