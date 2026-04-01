import { randomUUID } from "node:crypto";
import { sendEnvelope } from "../envelope.js";
import { readJsonBody, readRawBody, parseJsonText } from "../http/request.js";
import { notifyPaymentEvent } from "../events/delivery.js";
import { verifyProviderWebhook } from "../webhook.js";
import { nowIso, updatePaymentStatus, webhookSecretForProvider } from "./shared.js";

function registerWebhookRoutes(router) {
  router.register("POST", "/api/v2/webhook", async ({ runtime, request, response, requestId, saveState, logEvent }) => {
    const raw = await readRawBody(request, runtime.config.bodyLimitBytes);
    let payload;
    try {
      payload = parseJsonText(raw.toString("utf8"));
    } catch {
      sendEnvelope(response, requestId, 400, {
        ok: false,
        error: { code: "INVALID_JSON", message: "Webhook body must be valid JSON." }
      });
      return;
    }

    const headerProvider = request.headers["x-provider"];
    const provider = String(payload.provider || headerProvider || "unknown").trim();
    const signatureHeader = request.headers["x-webhook-signature"] || request.headers["x-signature"] || "";
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : String(signatureHeader);
    const secret = webhookSecretForProvider(runtime.config, provider);
    const verified = Boolean(secret) && verifyProviderWebhook(raw.toString("utf8"), signature, secret);

    const trace = {
      id: randomUUID(),
      createdAt: nowIso(),
      provider,
      verified,
      eventType: String(payload.eventType || payload.type || "unknown"),
      retryCount: Number(payload.retryCount || request.headers["x-retry-count"] || 0),
      paymentId: payload.paymentId ? String(payload.paymentId) : null,
      processingError: null
    };

    let payment = null;
    if (verified && trace.paymentId && (payload.providerStatus || payload.status)) {
      const previousStatus = runtime.state.ledger.find((item) => item.id === trace.paymentId)?.status ?? null;
      const statusResult = updatePaymentStatus(runtime, requestId, trace.paymentId, payload.providerStatus || payload.status, logEvent);
      if (statusResult.ok) {
        payment = statusResult.payment;
        await notifyPaymentEvent(runtime, payment, previousStatus, saveState);
      }
      else trace.processingError = statusResult.error.message;
    }

    runtime.state.webhookTraces.unshift(trace);
    await saveState(runtime);

    if (!verified) {
      sendEnvelope(response, requestId, 401, {
        ok: false,
        data: { trace },
        error: { code: "INVALID_SIGNATURE", message: "Webhook signature verification failed." }
      });
      return;
    }

    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: { trace, payment }
    });
  });

  router.register("GET", "/api/v2/webhook-traces", async ({ runtime, response, requestId }) => {
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: { traces: runtime.state.webhookTraces }
    });
  }, { authScope: "read" });

  router.register("POST", "/api/v2/webhook-traces", async ({ runtime, request, response, requestId, saveState }) => {
    const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
    if (typeof payload.provider !== "string" || !payload.provider.trim() || typeof payload.verified !== "boolean") {
      sendEnvelope(response, requestId, 400, {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "provider (string) and verified (boolean) are required."
        }
      });
      return;
    }

    const trace = {
      id: randomUUID(),
      createdAt: nowIso(),
      provider: payload.provider.trim(),
      verified: payload.verified,
      eventType: payload.eventType ? String(payload.eventType) : "unknown",
      retryCount: Number(payload.retryCount || 0),
      paymentId: payload.paymentId ? String(payload.paymentId) : null,
      processingError: payload.processingError ? String(payload.processingError) : null
    };
    runtime.state.webhookTraces.unshift(trace);
    await saveState(runtime);
    sendEnvelope(response, requestId, 201, {
      ok: true,
      data: { trace }
    });
  }, { authScope: "write" });

  router.register("GET", "/api/v2/webhook-subscriptions", async ({ runtime, response, requestId }) => {
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: { subscriptions: runtime.state.webhookSubscriptions }
    });
  }, { authScope: "read" });

  router.register("POST", "/api/v2/webhook-subscriptions", async ({ runtime, request, response, requestId, saveState }) => {
    const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
    if (typeof payload.url !== "string" || !payload.url.trim() || !Array.isArray(payload.events) || payload.events.length === 0) {
      sendEnvelope(response, requestId, 400, {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "url and events[] are required." }
      });
      return;
    }

    const subscription = {
      id: randomUUID(),
      createdAt: nowIso(),
      url: payload.url.trim(),
      events: payload.events.map((item) => String(item)),
      secret: payload.secret ? String(payload.secret) : randomUUID(),
      active: payload.active ?? true,
      consecutiveFailures: 0,
      updatedAt: null
    };
    runtime.state.webhookSubscriptions.unshift(subscription);
    await saveState(runtime);
    sendEnvelope(response, requestId, 201, {
      ok: true,
      data: { subscription }
    });
  }, { authScope: "write" });

  router.register("PATCH", "/api/v2/webhook-subscriptions/:subscriptionId", async ({ runtime, request, response, requestId, params, saveState }) => {
    const subscription = runtime.state.webhookSubscriptions.find((item) => item.id === params.subscriptionId);
    if (!subscription) {
      sendEnvelope(response, requestId, 404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "Webhook subscription not found." }
      });
      return;
    }

    const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
    if (payload.url !== undefined) subscription.url = String(payload.url).trim();
    if (payload.events !== undefined && Array.isArray(payload.events)) subscription.events = payload.events.map((item) => String(item));
    if (payload.active !== undefined) subscription.active = Boolean(payload.active);
    subscription.updatedAt = nowIso();
    await saveState(runtime);
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: { subscription }
    });
  }, { authScope: "write" });

  router.register("DELETE", "/api/v2/webhook-subscriptions/:subscriptionId", async ({ runtime, response, requestId, params, saveState }) => {
    const subscription = runtime.state.webhookSubscriptions.find((item) => item.id === params.subscriptionId);
    if (!subscription) {
      sendEnvelope(response, requestId, 404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "Webhook subscription not found." }
      });
      return;
    }

    subscription.active = false;
    subscription.updatedAt = nowIso();
    await saveState(runtime);
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: { subscription }
    });
  }, { authScope: "write" });

  router.register("GET", "/api/v2/webhook-deliveries", async ({ runtime, response, requestId, url }) => {
    const subscriptionId = url.searchParams.get("subscriptionId");
    const deliveries = subscriptionId
      ? runtime.state.webhookDeliveries.filter((item) => item.subscriptionId === subscriptionId)
      : runtime.state.webhookDeliveries;
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: {
        deliveries,
        queue: runtime.deliveryQueue?.getStats?.() ?? { pending: 0, processing: false, active: 0, deadLetters: 0 }
      }
    });
  }, { authScope: "read" });

  router.register("GET", "/api/v2/webhook-dead-letters", async ({ runtime, response, requestId, url }) => {
    const subscriptionId = url.searchParams.get("subscriptionId");
    const deadLetters = subscriptionId
      ? runtime.state.webhookDeadLetters.filter((item) => item.subscriptionId === subscriptionId)
      : runtime.state.webhookDeadLetters;
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: { deadLetters }
    });
  }, { authScope: "read" });

  router.register("POST", "/api/v2/webhook-dead-letters/:deadLetterId/requeue", async ({ runtime, response, requestId, params, saveState }) => {
    const index = runtime.state.webhookDeadLetters.findIndex((item) => item.id === params.deadLetterId);
    if (index === -1) {
      sendEnvelope(response, requestId, 404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "Webhook dead letter not found." }
      });
      return;
    }

    const [deadLetter] = runtime.state.webhookDeadLetters.splice(index, 1);
    runtime.state.webhookQueue.jobs.push({
      id: randomUUID(),
      createdAt: nowIso(),
      subscriptionId: deadLetter.subscriptionId,
      payload: deadLetter.payload
    });
    await saveState(runtime);
    runtime.deliveryQueue?.start?.();
    sendEnvelope(response, requestId, 202, {
      ok: true,
      data: { requeued: true, deadLetterId: deadLetter.id }
    });
  }, { authScope: "write" });

  router.register("DELETE", "/api/v2/webhook-dead-letters/:deadLetterId", async ({ runtime, response, requestId, params, saveState }) => {
    const index = runtime.state.webhookDeadLetters.findIndex((item) => item.id === params.deadLetterId);
    if (index === -1) {
      sendEnvelope(response, requestId, 404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "Webhook dead letter not found." }
      });
      return;
    }

    const [deadLetter] = runtime.state.webhookDeadLetters.splice(index, 1);
    await saveState(runtime);
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: { discarded: true, deadLetterId: deadLetter.id }
    });
  }, { authScope: "write" });
}

export { registerWebhookRoutes };
