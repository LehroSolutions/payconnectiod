class PaymentAdapter {
  constructor({ name, capabilities = [] }) {
    this.name = name;
    this.capabilities = capabilities;
  }

  async initiate() {
    throw new Error(`Adapter ${this.name} does not implement initiate().`);
  }

  async verify() {
    throw new Error(`Adapter ${this.name} does not implement verify().`);
  }

  async refund() {
    throw new Error(`Adapter ${this.name} does not implement refund().`);
  }

  listWebhookEvents() {
    return [];
  }

  parseWebhookPayload() {
    throw new Error(`Adapter ${this.name} does not implement parseWebhookPayload().`);
  }
}

export { PaymentAdapter };
