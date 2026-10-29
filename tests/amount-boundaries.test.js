import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCreatePaymentPayload, validateRefundRequest } from '../src/routes/shared.js';
import { performRefund } from '../src/refunds.js';

test('payment and refund boundaries reject minor-unit amounts outside exact integer precision', async () => {
  const payment = {
    status: 'settled',
    amountMinor: 1e18,
    refundedAmountMinor: 0,
    refunds: [],
    providerRef: 'synthetic',
  };
  const input = {
    idempotencyKey: 'synthetic',
    amountMinor: 1e18,
    providerId: 'mock',
    currency: 'ZAR',
  };
  assert.equal(parseCreatePaymentPayload(input, { allowLegacyAmount: false }).ok, false);
  assert.equal(validateRefundRequest(payment, input.amountMinor).ok, false);
  let called = false;
  await assert.rejects(
    performRefund({ persist: async () => {} }, payment, input, {
      refund: async () => {
        called = true;
      },
    }),
    /safe integer/,
  );
  assert.equal(called, false);
  assert.equal(payment.refunds.length, 0);
  assert.equal(payment.refundedAmountMinor, 0);
  assert.equal(
    parseCreatePaymentPayload(
      { ...input, amountMinor: Number.MAX_SAFE_INTEGER },
      { allowLegacyAmount: false },
    ).ok,
    true,
  );
});
