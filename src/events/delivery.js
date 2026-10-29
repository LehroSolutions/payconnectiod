import { createHmac, randomUUID } from 'node:crypto';
import { assertSafeWebhookTarget } from '../net/url-guard.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function signPayload(payloadText, secret) {
  return createHmac('sha256', secret).update(payloadText).digest('hex');
}

function buildSubscriptionEvent(payment, previousStatus, eventType) {
  return {
    id: randomUUID(),
    event: eventType,
    timestamp: new Date().toISOString(),
    data: {
      payment,
      previousStatus: previousStatus ?? null,
      newStatus: payment.status,
    },
  };
}

function snapshotPayment(payment) {
  return JSON.parse(JSON.stringify(payment));
}

function normalizeQueueState(runtime) {
  if (!runtime.state.webhookQueue || typeof runtime.state.webhookQueue !== 'object') {
    runtime.state.webhookQueue = { jobs: [] };
  }
  if (!Array.isArray(runtime.state.webhookQueue.jobs)) {
    runtime.state.webhookQueue.jobs = [];
  }
  return runtime.state.webhookQueue.jobs;
}

function normalizeDeadLetterState(runtime) {
  if (!Array.isArray(runtime.state.webhookDeadLetters)) {
    runtime.state.webhookDeadLetters = [];
  }
  return runtime.state.webhookDeadLetters;
}

function pushDeadLetter(runtime, task, details = {}) {
  const deadLetters = normalizeDeadLetterState(runtime);
  const payload = task?.payload ?? null;
  deadLetters.unshift({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    subscriptionId: String(task?.subscriptionId ?? ''),
    event: String(payload?.event ?? details.event ?? 'unknown'),
    payload,
    attempts: Number(details.attempts ?? 0),
    reason: String(details.reason ?? 'delivery_failed'),
    lastError: details.lastError ? String(details.lastError) : null,
    lastDeliveryId: details.lastDeliveryId ? String(details.lastDeliveryId) : null,
  });
}

async function deliverWebhook(runtime, subscription, eventPayload) {
  const payloadText = JSON.stringify(eventPayload);
  const delays = runtime.config.webhookRetryDelaysMs ?? [0, 25, 100];
  const record = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    subscriptionId: subscription.id,
    event: eventPayload.event,
    status: 'failed',
    attempts: 0,
    lastAttemptAt: null,
    responseCode: null,
    error: null,
  };

  const target = await assertSafeWebhookTarget(subscription.url, {
    allowPrivateTargets: runtime.config.webhookAllowPrivateTargets === true,
  });
  if (!target.ok) {
    record.error = `Blocked unsafe delivery target: ${target.reason}`;
    subscription.consecutiveFailures = Number(subscription.consecutiveFailures ?? 0) + 1;
    if (subscription.consecutiveFailures >= 10) {
      subscription.active = false;
    }
    runtime.state.webhookDeliveries.unshift(record);
    return record;
  }

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await sleep(delays[attempt]);
    }

    record.attempts += 1;
    record.lastAttemptAt = new Date().toISOString();

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      runtime.config.webhookDeliveryTimeoutMs ?? 5000,
    );
    try {
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signPayload(payloadText, subscription.secret),
          'x-webhook-event': eventPayload.event,
        },
        body: payloadText,
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timeout);

      record.responseCode = response.status;
      if (response.ok) {
        record.status = 'delivered';
        record.error = null;
        subscription.consecutiveFailures = 0;
        break;
      }

      record.error = `HTTP ${response.status}`;
    } catch (error) {
      clearTimeout(timeout);
      record.error = error.message || String(error);
    }
  }

  if (record.status !== 'delivered') {
    subscription.consecutiveFailures = Number(subscription.consecutiveFailures ?? 0) + 1;
    if (subscription.consecutiveFailures >= 10) {
      subscription.active = false;
    }
  }

  runtime.state.webhookDeliveries.unshift(record);
  return record;
}

async function deliverPaymentEventNow(runtime, payment, previousStatus, saveState) {
  const activeSubscriptions = runtime.state.webhookSubscriptions.filter(
    (subscription) => subscription.active !== false,
  );
  if (activeSubscriptions.length === 0) return [];

  const genericEvent = previousStatus ? 'payment.updated' : 'payment.created';
  const statusEvent = `payment.${payment.status}`;
  const deliveries = [];

  for (const subscription of activeSubscriptions) {
    const subscribedEvents = Array.isArray(subscription.events) ? subscription.events : [];
    const shouldSend =
      subscribedEvents.includes('*') ||
      subscribedEvents.includes(genericEvent) ||
      subscribedEvents.includes(statusEvent);
    if (!shouldSend) continue;

    const eventType = subscribedEvents.includes(statusEvent) ? statusEvent : genericEvent;
    const payload = buildSubscriptionEvent(payment, previousStatus, eventType);
    deliveries.push(await deliverWebhook(runtime, subscription, payload));
  }

  if (deliveries.length > 0) {
    await saveState(runtime);
  }

  return deliveries;
}

function createWebhookDeliveryQueue({ runtime, saveState }) {
  const pending = normalizeQueueState(runtime);
  normalizeDeadLetterState(runtime);
  const idleResolvers = [];
  let processing = false;

  function resolveIdleIfNeeded() {
    if (processing || pending.length > 0) return;
    while (idleResolvers.length > 0) {
      idleResolvers.shift()();
    }
  }

  async function processLoop() {
    if (processing) return;
    processing = true;

    try {
      while (pending.length > 0) {
        const task = pending[0];
        const subscription = runtime.state.webhookSubscriptions.find(
          (item) => item.id === task.subscriptionId,
        );
        if (!subscription || subscription.active === false) {
          pushDeadLetter(runtime, task, {
            reason: 'subscription_unavailable',
            lastError: 'Subscription is missing or inactive.',
          });
          pending.shift();
          await saveState(runtime);
          continue;
        }

        const record = await deliverWebhook(runtime, subscription, task.payload);
        if (record.status !== 'delivered') {
          pushDeadLetter(runtime, task, {
            attempts: record.attempts,
            reason: 'delivery_failed',
            lastError: record.error,
            lastDeliveryId: record.id,
            event: record.event,
          });
        }
        pending.shift();
        await saveState(runtime);
      }
    } finally {
      processing = false;
      resolveIdleIfNeeded();
    }
  }

  function safeStart() {
    processLoop().catch((error) => {
      pushDeadLetter(
        runtime,
        { payload: { event: 'queue.error' } },
        {
          reason: 'queue_crashed',
          lastError: `Webhook delivery queue stopped: ${error?.message || String(error)}`,
        },
      );
    });
  }

  async function enqueuePaymentEvent(payment, previousStatus) {
    const activeSubscriptions = runtime.state.webhookSubscriptions.filter(
      (subscription) => subscription.active !== false,
    );
    if (activeSubscriptions.length === 0) return [];

    const genericEvent = previousStatus ? 'payment.updated' : 'payment.created';
    const statusEvent = `payment.${payment.status}`;
    const enqueued = [];

    for (const subscription of activeSubscriptions) {
      const subscribedEvents = Array.isArray(subscription.events) ? subscription.events : [];
      const shouldSend =
        subscribedEvents.includes('*') ||
        subscribedEvents.includes(genericEvent) ||
        subscribedEvents.includes(statusEvent);
      if (!shouldSend) continue;

      const eventType = subscribedEvents.includes(statusEvent) ? statusEvent : genericEvent;
      const payload = buildSubscriptionEvent(snapshotPayment(payment), previousStatus, eventType);
      pending.push({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        subscriptionId: subscription.id,
        payload,
      });
      enqueued.push({ subscriptionId: subscription.id, event: eventType });
    }

    await saveState(runtime);
    if (runtime.config.webhookQueueAutoStart !== false) {
      safeStart();
    }
    return enqueued;
  }

  function getStats() {
    return {
      pending: pending.length,
      processing,
      active: processing ? 1 : 0,
      deadLetters: runtime.state.webhookDeadLetters.length,
    };
  }

  function onIdle() {
    if (!processing && pending.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      idleResolvers.push(resolve);
    });
  }

  return {
    enqueuePaymentEvent,
    getStats,
    onIdle,
    start: () => {
      safeStart();
    },
  };
}

async function notifyPaymentEvent(runtime, payment, previousStatus, saveState) {
  if (runtime.deliveryQueue) {
    return runtime.deliveryQueue.enqueuePaymentEvent(payment, previousStatus);
  }

  return deliverPaymentEventNow(runtime, payment, previousStatus, saveState);
}

export { createWebhookDeliveryQueue, notifyPaymentEvent, signPayload };
