import { sendEnvelope } from '../envelope.js';
import { readJsonBody } from '../http/request.js';
import { amountToMinor, createRiskAssessment } from './shared.js';

function resolveRiskAmountMinor(payload) {
  if (payload.amountMinor !== undefined && payload.amountMinor !== null) {
    const amountMinor = Number(payload.amountMinor);
    return Number.isInteger(amountMinor) ? { ok: true, amountMinor } : { ok: false };
  }
  if (payload.amount !== undefined && payload.amount !== null) {
    const amountMinor = amountToMinor(payload.amount);
    return amountMinor === null ? { ok: false } : { ok: true, amountMinor };
  }
  return { ok: true, amountMinor: 0 };
}

function registerRiskRoutes(router) {
  router.register(
    'POST',
    '/api/ai/risk-score',
    async ({ runtime, request, response, requestId }) => {
      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      const amount = resolveRiskAmountMinor(payload);

      if (!amount.ok || amount.amountMinor < 0) {
        sendEnvelope(response, requestId, 400, {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'amountMinor must be a non-negative integer minor-unit amount, or amount a decimal with at most 2 places.',
          },
        });
        return;
      }

      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: createRiskAssessment({ ...payload, amountMinor: amount.amountMinor }),
      });
    },
  );
}

export { registerRiskRoutes };
