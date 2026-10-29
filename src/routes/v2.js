import { performRefund } from '../refunds.js';
import { randomUUID } from 'node:crypto';
import { sendEnvelope } from '../envelope.js';
import { notifyPaymentEvent } from '../events/delivery.js';
import { readJsonBody } from '../http/request.js';
import {
  createPaymentFromInput,
  deliveryAnalytics,
  enrichProvidersWithAdapters,
  getPaymentById,
  listPayments,
  listRefunds,
  nowIso,
  parseCreatePaymentPayload,
  reconciliationData,
  refundAnalytics,
  resolveAdapter,
  updatePaymentStatus,
} from './shared.js';

function registerV2Routes(router) {
  router.register(
    'GET',
    '/api/v2/payments',
    async ({ runtime, response, requestId, url }) => {
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: listPayments(runtime.state, url.searchParams),
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'POST',
    '/api/v2/payments',
    async ({ runtime, request, response, requestId, saveState, logEvent }) => {
      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      const parsed = parseCreatePaymentPayload(payload, { allowLegacyAmount: false });
      if (!parsed.ok) {
        sendEnvelope(response, requestId, 400, {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid payment request.',
            details: parsed.errors,
          },
        });
        return;
      }

      const created = await createPaymentFromInput(runtime, requestId, parsed.value, logEvent);
      if (!created.ok) {
        sendEnvelope(response, requestId, created.code, {
          ok: false,
          error: created.error,
        });
        return;
      }

      if (!created.replay) await saveState(runtime);
      if (!created.replay) {
        await notifyPaymentEvent(runtime, created.payment, null, saveState);
      }
      sendEnvelope(response, requestId, created.code, {
        ok: true,
        data: { payment: created.payment, replay: created.replay },
      });
    },
    { authScope: 'write' },
  );

  router.register(
    'GET',
    '/api/v2/payments/:paymentId',
    async ({ runtime, response, requestId, params }) => {
      const payment = getPaymentById(runtime.state, params.paymentId);
      if (!payment) {
        sendEnvelope(response, requestId, 404, {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Payment not found.' },
        });
        return;
      }

      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: { payment },
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'PATCH',
    '/api/v2/payments/:paymentId',
    async ({ runtime, request, response, requestId, params, saveState, logEvent }) => {
      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      const statusRaw = payload.status || payload.providerStatus;
      const previousStatus = getPaymentById(runtime.state, params.paymentId)?.status ?? null;
      if (!statusRaw) {
        sendEnvelope(response, requestId, 400, {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'status or providerStatus is required.',
          },
        });
        return;
      }

      const updated = updatePaymentStatus(
        runtime,
        requestId,
        params.paymentId,
        statusRaw,
        logEvent,
      );
      if (!updated.ok) {
        sendEnvelope(response, requestId, updated.code, {
          ok: false,
          error: updated.error,
        });
        return;
      }

      await saveState(runtime);
      await notifyPaymentEvent(runtime, updated.payment, previousStatus, saveState);
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: { payment: updated.payment },
      });
    },
    { authScope: 'write' },
  );

  router.register(
    'POST',
    '/api/v2/payments/:paymentId/verify',
    async ({ runtime, request, response, requestId, params, saveState, logEvent }) => {
      const payment = getPaymentById(runtime.state, params.paymentId);
      if (!payment) {
        sendEnvelope(response, requestId, 404, {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Payment not found.' },
        });
        return;
      }

      const adapter = resolveAdapter(runtime, payment.providerId);
      if (!adapter) {
        sendEnvelope(response, requestId, 404, {
          ok: false,
          error: {
            code: 'ADAPTER_NOT_FOUND',
            message: `No adapter is registered for provider '${payment.providerId}'.`,
          },
        });
        return;
      }

      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      const providerRef = payload.providerRef ?? payment.providerRef;
      if (!providerRef) {
        sendEnvelope(response, requestId, 409, {
          ok: false,
          error: {
            code: 'MISSING_PROVIDER_REF',
            message: 'Payment does not have a provider reference to verify.',
          },
        });
        return;
      }

      const verification = await adapter.verify(providerRef);
      const previousStatus = payment.status;
      payment.providerRef = verification.providerRef ?? payment.providerRef;
      payment.providerResponse = verification.rawResponse ?? payment.providerResponse;

      let updatedPayment = payment;
      if (verification.status) {
        const updated = updatePaymentStatus(
          runtime,
          requestId,
          payment.id,
          verification.status,
          logEvent,
        );
        if (!updated.ok) {
          sendEnvelope(response, requestId, updated.code, {
            ok: false,
            error: updated.error,
          });
          return;
        }
        updatedPayment = updated.payment;
      }

      await saveState(runtime);
      await notifyPaymentEvent(runtime, updatedPayment, previousStatus, saveState);
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: { payment: updatedPayment, verification },
      });
    },
    { authScope: 'write' },
  );

  router.register(
    'POST',
    '/api/v2/payments/:paymentId/refund',
    async ({ runtime, request, response, requestId, params, saveState }) => {
      const payment = getPaymentById(runtime.state, params.paymentId);
      if (!payment) {
        sendEnvelope(response, requestId, 404, {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Payment not found.' },
        });
        return;
      }

      const adapter = resolveAdapter(runtime, payment.providerId);
      if (!adapter) {
        sendEnvelope(response, requestId, 404, {
          ok: false,
          error: {
            code: 'ADAPTER_NOT_FOUND',
            message: `No adapter is registered for provider '${payment.providerId}'.`,
          },
        });
        return;
      }

      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      const { refund, replay } = await performRefund(runtime, payment, payload, adapter);
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: { payment, refund, replay },
      });
    },
    { authScope: 'write' },
  );

  router.register(
    'GET',
    '/api/v2/refunds',
    async ({ runtime, response, requestId, url }) => {
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: listRefunds(runtime.state, url.searchParams),
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'GET',
    '/api/v2/reconciliation',
    async ({ runtime, response, requestId }) => {
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: reconciliationData(runtime.state),
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'GET',
    '/api/v2/analytics',
    async ({ runtime, response, requestId }) => {
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: reconciliationData(runtime.state),
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'GET',
    '/api/v2/analytics/refunds',
    async ({ runtime, response, requestId, url }) => {
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: refundAnalytics(runtime.state, url.searchParams),
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'GET',
    '/api/v2/analytics/webhook-deliveries',
    async ({ runtime, response, requestId, url }) => {
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: deliveryAnalytics(runtime.state, url.searchParams),
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'GET',
    '/api/v2/settlements',
    async ({ runtime, response, requestId }) => {
      const settlements = runtime.state.ledger.filter((payment) => payment.status === 'settled');
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: { settlements },
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'GET',
    '/api/v2/providers',
    async ({ runtime, response, requestId }) => {
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: {
          providers: enrichProvidersWithAdapters(runtime.state.providers, runtime.adapterRegistry),
        },
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'POST',
    '/api/v2/providers',
    async ({ runtime, request, response, requestId, saveState }) => {
      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      if (
        typeof payload.name !== 'string' ||
        !payload.name.trim() ||
        !Array.isArray(payload.capabilities)
      ) {
        sendEnvelope(response, requestId, 400, {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'name and capabilities[] are required.',
          },
        });
        return;
      }

      const provider = {
        id: randomUUID(),
        createdAt: nowIso(),
        name: payload.name.trim(),
        capabilities: payload.capabilities.map((item) => String(item)),
        status: payload.status ? String(payload.status) : 'active',
      };
      runtime.state.providers.unshift(provider);
      await saveState(runtime);
      sendEnvelope(response, requestId, 201, {
        ok: true,
        data: {
          provider: enrichProvidersWithAdapters([provider], runtime.adapterRegistry)[0],
        },
      });
    },
    { authScope: 'write' },
  );

  router.register(
    'PATCH',
    '/api/v2/providers/:providerId',
    async ({ runtime, request, response, requestId, params, saveState }) => {
      const provider = runtime.state.providers.find((item) => item.id === params.providerId);
      if (!provider) {
        sendEnvelope(response, requestId, 404, {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Provider not found.' },
        });
        return;
      }

      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      if (payload.name !== undefined) {
        if (typeof payload.name !== 'string' || !payload.name.trim()) {
          sendEnvelope(response, requestId, 400, {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'name must be a non-empty string when provided.',
            },
          });
          return;
        }
        provider.name = payload.name.trim();
      }

      if (payload.capabilities !== undefined) {
        if (!Array.isArray(payload.capabilities)) {
          sendEnvelope(response, requestId, 400, {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'capabilities must be an array when provided.',
            },
          });
          return;
        }
        provider.capabilities = payload.capabilities.map((item) => String(item));
      }

      if (payload.status !== undefined) {
        provider.status = String(payload.status);
      }

      provider.updatedAt = nowIso();
      await saveState(runtime);
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: {
          provider: enrichProvidersWithAdapters([provider], runtime.adapterRegistry)[0],
        },
      });
    },
    { authScope: 'write' },
  );

  router.register(
    'DELETE',
    '/api/v2/providers/:providerId',
    async ({ runtime, response, requestId, params, saveState }) => {
      const provider = runtime.state.providers.find((item) => item.id === params.providerId);
      if (!provider) {
        sendEnvelope(response, requestId, 404, {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Provider not found.' },
        });
        return;
      }

      provider.status = 'inactive';
      provider.updatedAt = nowIso();
      await saveState(runtime);
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: {
          provider: enrichProvidersWithAdapters([provider], runtime.adapterRegistry)[0],
        },
      });
    },
    { authScope: 'write' },
  );

  router.register(
    'GET',
    '/api/v2/mismatches',
    async ({ runtime, response, requestId }) => {
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: { mismatches: runtime.state.mismatches },
      });
    },
    { authScope: 'read' },
  );

  router.register(
    'POST',
    '/api/v2/mismatches',
    async ({ runtime, request, response, requestId, saveState }) => {
      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      const paymentId = typeof payload.paymentId === 'string' ? payload.paymentId.trim() : '';
      const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
      if (!paymentId || !reason) {
        sendEnvelope(response, requestId, 400, {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'paymentId and reason are required.' },
        });
        return;
      }

      const mismatch = {
        id: randomUUID(),
        createdAt: nowIso(),
        paymentId,
        reason,
        disputeState: payload.disputeState ? String(payload.disputeState) : 'open',
        resolution: payload.resolution ?? null,
        updatedAt: null,
      };
      runtime.state.mismatches.unshift(mismatch);
      await saveState(runtime);
      sendEnvelope(response, requestId, 201, {
        ok: true,
        data: { mismatch },
      });
    },
    { authScope: 'write' },
  );

  router.register(
    'PATCH',
    '/api/v2/mismatches/:mismatchId',
    async ({ runtime, request, response, requestId, params, saveState }) => {
      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      const mismatch = runtime.state.mismatches.find((item) => item.id === params.mismatchId);
      if (!mismatch) {
        sendEnvelope(response, requestId, 404, {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Mismatch not found.' },
        });
        return;
      }

      mismatch.disputeState = payload.disputeState
        ? String(payload.disputeState)
        : mismatch.disputeState;
      mismatch.resolution = payload.resolution ?? mismatch.resolution;
      mismatch.updatedAt = nowIso();
      await saveState(runtime);
      sendEnvelope(response, requestId, 200, {
        ok: true,
        data: { mismatch },
      });
    },
    { authScope: 'write' },
  );
}

export { registerV2Routes };
