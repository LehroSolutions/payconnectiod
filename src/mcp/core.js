const RESOURCE_SCHEME = 'payconnectoid://';
const LEGACY_RESOURCE_SCHEME = 'paywithafricakit://';
const MCP_SERVER_NAME = 'payconnectoid-mcp';

class PayconnectoidMcpClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl ?? 'http://127.0.0.1:4106';
    this.username = config.username ?? 'admin';
    this.password = config.password ?? 'admin123';
    this.token = config.accessToken ?? null;
  }

  async login() {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });

    if (!response.ok) {
      throw new Error(`Authentication failed with status ${response.status}.`);
    }

    const body = await response.json();
    this.token = body.token;
    return this.token;
  }

  async request(method, path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };

    if (options.auth !== false) {
      if (!this.token) {
        await this.login();
      }
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401 && options.auth !== false && !options.disableRetry) {
      this.token = null;
      await this.login();
      return this.request(method, path, { ...options, disableRetry: true });
    }

    return response;
  }
}

const toolDefinitions = [
  {
    name: 'list_payments',
    description: 'List payments with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        limit: { type: 'integer' },
        status: { type: 'string' },
        currency: { type: 'string' },
        providerId: { type: 'string' },
        recipientRef: { type: 'string' },
      },
    },
  },
  {
    name: 'get_payment',
    description: 'Fetch a single payment by id.',
    inputSchema: {
      type: 'object',
      required: ['paymentId'],
      properties: {
        paymentId: { type: 'string' },
      },
    },
  },
  {
    name: 'create_payment',
    description: 'Create a new payment.',
    inputSchema: {
      type: 'object',
      required: ['idempotencyKey', 'amountMinor', 'currency', 'providerId'],
      properties: {
        idempotencyKey: { type: 'string' },
        amountMinor: { type: 'integer' },
        currency: { type: 'string' },
        providerId: { type: 'string' },
        recipientRef: { type: 'string' },
        providerStatus: { type: 'string' },
      },
    },
  },
  {
    name: 'verify_payment',
    description: 'Verify a payment with its provider adapter.',
    inputSchema: {
      type: 'object',
      required: ['paymentId'],
      properties: {
        paymentId: { type: 'string' },
        providerRef: { type: 'string' },
      },
    },
  },
  {
    name: 'refund_payment',
    description: 'Issue a refund for a payment through its provider adapter.',
    inputSchema: {
      type: 'object',
      required: ['paymentId'],
      properties: {
        paymentId: { type: 'string' },
        amountMinor: { type: 'integer' },
      },
    },
  },
  {
    name: 'list_refunds',
    description: 'List refunds with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        limit: { type: 'integer' },
        status: { type: 'string' },
        providerId: { type: 'string' },
        paymentId: { type: 'string' },
        currency: { type: 'string' },
      },
    },
  },
  {
    name: 'get_reconciliation',
    description: 'Fetch the reconciliation summary.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_refund_analytics',
    description: 'Fetch refund analytics grouped by provider, currency, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        window: { type: 'string' },
        bucket: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        providerId: { type: 'string' },
        currency: { type: 'string' },
        status: { type: 'string' },
      },
    },
  },
  {
    name: 'get_delivery_analytics',
    description: 'Fetch webhook delivery analytics grouped by status and event.',
    inputSchema: {
      type: 'object',
      properties: {
        window: { type: 'string' },
        bucket: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        status: { type: 'string' },
        event: { type: 'string' },
        subscriptionId: { type: 'string' },
      },
    },
  },
  {
    name: 'list_providers',
    description: 'List configured providers.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_webhook_subscriptions',
    description: 'List outbound webhook subscriptions.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_webhook_subscription',
    description: 'Create an outbound webhook subscription.',
    inputSchema: {
      type: 'object',
      required: ['url', 'events'],
      properties: {
        url: { type: 'string' },
        events: { type: 'array', items: { type: 'string' } },
        active: { type: 'boolean' },
      },
    },
  },
  {
    name: 'list_webhook_deliveries',
    description: 'List outbound webhook deliveries and queue state.',
    inputSchema: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string' },
      },
    },
  },
  {
    name: 'list_webhook_dead_letters',
    description: 'List dead-lettered webhook jobs.',
    inputSchema: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string' },
      },
    },
  },
  {
    name: 'requeue_webhook_dead_letter',
    description: 'Requeue a dead-lettered webhook job.',
    inputSchema: {
      type: 'object',
      required: ['deadLetterId'],
      properties: {
        deadLetterId: { type: 'string' },
      },
    },
  },
];

const resourceDefinitions = [
  { uri: `${RESOURCE_SCHEME}payments`, name: 'payments', description: 'Payment ledger snapshot' },
  { uri: `${RESOURCE_SCHEME}refunds`, name: 'refunds', description: 'Refund ledger snapshot' },
  {
    uri: `${RESOURCE_SCHEME}refund-analytics`,
    name: 'refund-analytics',
    description: 'Refund analytics snapshot',
  },
  {
    uri: `${RESOURCE_SCHEME}delivery-analytics`,
    name: 'delivery-analytics',
    description: 'Webhook delivery analytics snapshot',
  },
  { uri: `${RESOURCE_SCHEME}providers`, name: 'providers', description: 'Configured providers' },
  {
    uri: `${RESOURCE_SCHEME}reconciliation`,
    name: 'reconciliation',
    description: 'Reconciliation summary',
  },
  {
    uri: `${RESOURCE_SCHEME}webhook-subscriptions`,
    name: 'webhook-subscriptions',
    description: 'Outbound webhook subscriptions',
  },
  {
    uri: `${RESOURCE_SCHEME}webhook-deliveries`,
    name: 'webhook-deliveries',
    description: 'Outbound webhook deliveries and queue state',
  },
  {
    uri: `${RESOURCE_SCHEME}webhook-dead-letters`,
    name: 'webhook-dead-letters',
    description: 'Dead-lettered webhook jobs',
  },
];

const promptDefinitions = [
  {
    name: 'daily_reconciliation',
    description:
      'Guide a user through checking reconciliation totals, pending payments, and mismatches.',
  },
  {
    name: 'investigate_mismatch',
    description: 'Help investigate a payment mismatch using payment and reconciliation data.',
  },
];

function toJsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function toJsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function toTextContent(payload) {
  return [{ type: 'text', text: JSON.stringify(payload, null, 2) }];
}

function buildQuery(args = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

async function handleToolCall(client, name, args = {}) {
  switch (name) {
    case 'list_payments': {
      const response = await client.request('GET', `/api/v2/payments${buildQuery(args)}`);
      return response.json();
    }
    case 'get_payment': {
      const response = await client.request(
        'GET',
        `/api/v2/payments/${encodeURIComponent(args.paymentId)}`,
      );
      return response.json();
    }
    case 'create_payment': {
      const response = await client.request('POST', '/api/v2/payments', { body: args });
      return response.json();
    }
    case 'verify_payment': {
      const response = await client.request(
        'POST',
        `/api/v2/payments/${encodeURIComponent(args.paymentId)}/verify`,
        {
          body: args.providerRef ? { providerRef: args.providerRef } : {},
        },
      );
      return response.json();
    }
    case 'refund_payment': {
      const response = await client.request(
        'POST',
        `/api/v2/payments/${encodeURIComponent(args.paymentId)}/refund`,
        {
          body: args.amountMinor ? { amountMinor: args.amountMinor } : {},
        },
      );
      return response.json();
    }
    case 'list_refunds': {
      const response = await client.request('GET', `/api/v2/refunds${buildQuery(args)}`);
      return response.json();
    }
    case 'get_reconciliation': {
      const response = await client.request('GET', '/api/v2/reconciliation');
      return response.json();
    }
    case 'get_refund_analytics': {
      const response = await client.request('GET', `/api/v2/analytics/refunds${buildQuery(args)}`);
      return response.json();
    }
    case 'get_delivery_analytics': {
      const response = await client.request(
        'GET',
        `/api/v2/analytics/webhook-deliveries${buildQuery(args)}`,
      );
      return response.json();
    }
    case 'list_providers': {
      const response = await client.request('GET', '/api/v2/providers');
      return response.json();
    }
    case 'list_webhook_subscriptions': {
      const response = await client.request('GET', '/api/v2/webhook-subscriptions');
      return response.json();
    }
    case 'create_webhook_subscription': {
      const response = await client.request('POST', '/api/v2/webhook-subscriptions', {
        body: args,
      });
      return response.json();
    }
    case 'list_webhook_deliveries': {
      const response = await client.request('GET', `/api/v2/webhook-deliveries${buildQuery(args)}`);
      return response.json();
    }
    case 'list_webhook_dead_letters': {
      const response = await client.request(
        'GET',
        `/api/v2/webhook-dead-letters${buildQuery(args)}`,
      );
      return response.json();
    }
    case 'requeue_webhook_dead_letter': {
      const response = await client.request(
        'POST',
        `/api/v2/webhook-dead-letters/${encodeURIComponent(args.deadLetterId)}/requeue`,
        { body: {} },
      );
      return response.json();
    }
    default:
      throw new Error(`Unknown tool '${name}'.`);
  }
}

async function handleResourceRead(client, uri) {
  const parsedUri = new URL(uri);
  const resourceUri = `${parsedUri.protocol}//${parsedUri.hostname}${parsedUri.pathname}`;
  const normalizedResourceUri = resourceUri.startsWith(LEGACY_RESOURCE_SCHEME)
    ? `${RESOURCE_SCHEME}${resourceUri.slice(LEGACY_RESOURCE_SCHEME.length)}`
    : resourceUri;

  switch (normalizedResourceUri) {
    case `${RESOURCE_SCHEME}payments`: {
      const response = await client.request('GET', `/api/v2/payments${parsedUri.search}`);
      return response.json();
    }
    case `${RESOURCE_SCHEME}refunds`: {
      const response = await client.request('GET', `/api/v2/refunds${parsedUri.search}`);
      return response.json();
    }
    case `${RESOURCE_SCHEME}refund-analytics`: {
      const response = await client.request('GET', `/api/v2/analytics/refunds${parsedUri.search}`);
      return response.json();
    }
    case `${RESOURCE_SCHEME}delivery-analytics`: {
      const response = await client.request(
        'GET',
        `/api/v2/analytics/webhook-deliveries${parsedUri.search}`,
      );
      return response.json();
    }
    case `${RESOURCE_SCHEME}providers`: {
      const response = await client.request('GET', '/api/v2/providers');
      return response.json();
    }
    case `${RESOURCE_SCHEME}reconciliation`: {
      const response = await client.request('GET', '/api/v2/reconciliation');
      return response.json();
    }
    case `${RESOURCE_SCHEME}webhook-subscriptions`: {
      const response = await client.request('GET', '/api/v2/webhook-subscriptions');
      return response.json();
    }
    case `${RESOURCE_SCHEME}webhook-deliveries`: {
      const response = await client.request('GET', `/api/v2/webhook-deliveries${parsedUri.search}`);
      return response.json();
    }
    case `${RESOURCE_SCHEME}webhook-dead-letters`: {
      const response = await client.request(
        'GET',
        `/api/v2/webhook-dead-letters${parsedUri.search}`,
      );
      return response.json();
    }
    default:
      throw new Error(`Unknown resource '${uri}'.`);
  }
}

function createMessageHandler(config = {}) {
  const client = new PayconnectoidMcpClient(config);

  return async (message) => {
    try {
      switch (message.method) {
        case 'initialize':
          return toJsonRpcResult(message.id, {
            protocolVersion: '2025-03-26',
            serverInfo: { name: MCP_SERVER_NAME, version: '0.1.0' },
            capabilities: { tools: {}, resources: {}, prompts: {} },
          });
        case 'notifications/initialized':
          return null;
        case 'tools/list':
          return toJsonRpcResult(message.id, { tools: toolDefinitions });
        case 'tools/call': {
          const result = await handleToolCall(
            client,
            message.params?.name,
            message.params?.arguments ?? {},
          );
          return toJsonRpcResult(message.id, { content: toTextContent(result) });
        }
        case 'resources/list':
          return toJsonRpcResult(message.id, { resources: resourceDefinitions });
        case 'resources/read': {
          const payload = await handleResourceRead(client, message.params?.uri);
          return toJsonRpcResult(message.id, {
            contents: [
              {
                uri: message.params?.uri,
                mimeType: 'application/json',
                text: JSON.stringify(payload, null, 2),
              },
            ],
          });
        }
        case 'prompts/list':
          return toJsonRpcResult(message.id, { prompts: promptDefinitions });
        case 'prompts/get': {
          const prompt = promptDefinitions.find((item) => item.name === message.params?.name);
          if (!prompt) {
            return toJsonRpcError(
              message.id ?? null,
              -32000,
              `Unknown prompt '${message.params?.name}'.`,
            );
          }
          const content =
            prompt.name === 'daily_reconciliation'
              ? 'Review the reconciliation summary, list pending payments, inspect mismatches, and propose follow-up actions.'
              : 'Inspect the mismatch, fetch the related payment, compare provider and ledger status, and propose remediation steps.';
          return toJsonRpcResult(message.id, {
            description: prompt.description,
            messages: [{ role: 'user', content: toTextContent({ prompt: prompt.name, content }) }],
          });
        }
        default:
          return toJsonRpcError(message.id ?? null, -32601, `Method not found: ${message.method}`);
      }
    } catch (error) {
      return toJsonRpcError(message.id ?? null, -32000, error.message || String(error));
    }
  };
}

export {
  buildQuery,
  createMessageHandler,
  promptDefinitions,
  resourceDefinitions,
  toolDefinitions,
};
