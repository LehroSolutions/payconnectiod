import { PaystackAdapter } from './paystack.js';

class AdapterRegistry {
  constructor(config = {}) {
    this.config = config;
    this.factories = new Map();
  }

  register(name, factory) {
    this.factories.set(String(name).toLowerCase(), factory);
  }

  has(name) {
    return this.factories.has(String(name).toLowerCase());
  }

  get(name) {
    const factory = this.factories.get(String(name).toLowerCase());
    if (!factory) return null;
    return factory();
  }

  list() {
    return Array.from(this.factories.keys()).sort();
  }
}

function createAdapterRegistry(config = {}) {
  const registry = new AdapterRegistry(config);
  registry.register(
    'paystack',
    () =>
      new PaystackAdapter({
        secretKey: config.env?.PAYSTACK_SECRET_KEY,
        baseUrl: config.paystackBaseUrl,
      }),
  );
  return registry;
}

export { AdapterRegistry, createAdapterRegistry };
