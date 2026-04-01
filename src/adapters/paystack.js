import { PaymentAdapter } from "./interface.js";

function mapPaystackStatus(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (["success", "successful"].includes(normalized)) return "settled";
  if (["failed", "abandoned", "reversed"].includes(normalized)) return "failed";
  if (["pending", "ongoing", "processing"].includes(normalized)) return "initiated";
  return "initiated";
}

class PaystackAdapter extends PaymentAdapter {
  constructor(config = {}) {
    super({ name: "paystack", capabilities: ["card", "bank_transfer"] });
    this.secretKey = config.secretKey ?? "";
    this.baseUrl = config.baseUrl ?? "https://api.paystack.co";
  }

  assertConfigured() {
    if (!this.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required to use the Paystack adapter.");
    }
  }

  async request(path, body) {
    this.assertConfigured();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json();
    if (!response.ok || payload.status === false) {
      throw new Error(payload.message || `Paystack request failed with status ${response.status}.`);
    }
    return payload;
  }

  async get(path) {
    this.assertConfigured();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json"
      }
    });

    const payload = await response.json();
    if (!response.ok || payload.status === false) {
      throw new Error(payload.message || `Paystack request failed with status ${response.status}.`);
    }
    return payload;
  }

  async initiate(payment) {
    const email = payment.recipientRef ? `${payment.recipientRef}@payconnectoid.local` : "customer@payconnectoid.local";
    const response = await this.request("/transaction/initialize", {
      amount: payment.amountMinor,
      currency: payment.currency,
      email,
      reference: payment.paymentId ?? payment.idempotencyKey,
      metadata: {
        recipientRef: payment.recipientRef ?? null,
        idempotencyKey: payment.idempotencyKey
      }
    });

    return {
      providerRef: response.data?.reference ?? payment.paymentId ?? payment.idempotencyKey,
      redirectUrl: response.data?.authorization_url ?? null,
      status: mapPaystackStatus(response.data?.status),
      rawResponse: {
        adapter: this.name,
        configured: true,
        mode: "live-http",
        payload: response
      }
    };
  }

  async verify(providerRef) {
    const response = await this.get(`/transaction/verify/${encodeURIComponent(providerRef)}`);
    return {
      providerRef: response.data?.reference ?? providerRef,
      status: mapPaystackStatus(response.data?.status),
      rawResponse: {
        adapter: this.name,
        configured: true,
        mode: "live-http",
        payload: response
      }
    };
  }

  async refund(providerRef, amountMinor) {
    const response = await this.request("/refund", {
      transaction: providerRef,
      amount: amountMinor
    });
    return {
      providerRef: response.data?.transaction_reference ?? providerRef,
      amountMinor,
      status: String(response.data?.status ?? "pending"),
      rawResponse: {
        adapter: this.name,
        configured: true,
        mode: "live-http",
        payload: response
      }
    };
  }

  listWebhookEvents() {
    return ["charge.success", "transfer.success", "refund.processed"];
  }

  parseWebhookPayload(rawBody) {
    const payload = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    return {
      provider: this.name,
      eventType: payload.event ?? payload.eventType ?? "unknown",
      providerRef: payload.data?.reference ?? null,
      status: payload.data?.status ?? null,
      raw: payload
    };
  }
}

export { PaystackAdapter };
