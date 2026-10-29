const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'payconnectoid API',
    version: '0.1.0',
    description: 'Payment orchestration API contract used for MCP tooling and SDK generation.',
  },
  servers: [{ url: 'http://127.0.0.1:4106' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Opaque',
      },
    },
    schemas: {
      Envelope: {
        type: 'object',
        properties: {
          requestId: { type: 'string' },
          ok: { type: 'boolean' },
          data: { type: ['object', 'null'] },
          error: { type: ['object', 'null'] },
        },
        required: ['requestId', 'ok', 'data', 'error'],
      },
      PaymentCreateRequest: {
        type: 'object',
        required: ['idempotencyKey', 'amountMinor', 'currency', 'providerId'],
        properties: {
          idempotencyKey: { type: 'string' },
          amountMinor: { type: 'integer', minimum: 1 },
          currency: { type: 'string', pattern: '^[A-Z]{3}$' },
          providerId: { type: 'string' },
          recipientRef: { type: ['string', 'null'] },
          providerStatus: { type: ['string', 'null'] },
          metadata: { type: ['object', 'null'] },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1 },
          total: { type: 'integer', minimum: 0 },
          pages: { type: 'integer', minimum: 1 },
        },
        required: ['page', 'limit', 'total', 'pages'],
      },
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          amountMinor: { type: 'integer' },
          currency: { type: 'string' },
          providerId: { type: ['string', 'null'] },
          recipientRef: { type: ['string', 'null'] },
          status: { type: 'string' },
          replay: { type: 'boolean' },
          metadata: { type: ['object', 'null'] },
          providerRef: { type: ['string', 'null'] },
          redirectUrl: { type: ['string', 'null'] },
          providerResponse: { type: ['object', 'null'] },
          refunds: { type: 'array', items: { type: 'object' } },
          refundedAmountMinor: { type: 'integer' },
        },
        required: ['id', 'createdAt', 'amountMinor', 'currency', 'status', 'replay'],
      },
      RefundListResponse: {
        type: 'object',
        properties: {
          refunds: { type: 'array', items: { type: 'object' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
          filters: {
            type: 'object',
            properties: {
              status: { type: ['string', 'null'] },
              providerId: { type: ['string', 'null'] },
              paymentId: { type: ['string', 'null'] },
              currency: { type: ['string', 'null'] },
            },
          },
          summary: {
            type: 'object',
            properties: {
              refundCount: { type: 'integer' },
              totalRefundedMinor: { type: 'integer' },
              pendingRefundedMinor: { type: 'integer' },
            },
          },
        },
        required: ['refunds', 'pagination', 'filters', 'summary'],
      },
      RefundAnalyticsResponse: {
        type: 'object',
        properties: {
          summary: {
            type: 'object',
            properties: {
              refundCount: { type: 'integer' },
              totalRefundedMinor: { type: 'integer' },
              pendingRefundedMinor: { type: 'integer' },
            },
            required: ['refundCount', 'totalRefundedMinor', 'pendingRefundedMinor'],
          },
          byProvider: { type: 'object', additionalProperties: { type: 'integer' } },
          byCurrency: { type: 'object', additionalProperties: { type: 'integer' } },
          byStatus: { type: 'object', additionalProperties: { type: 'integer' } },
        },
        required: ['summary', 'byProvider', 'byCurrency', 'byStatus'],
      },
      ProviderVerificationResponse: {
        type: 'object',
        properties: {
          providerRef: { type: ['string', 'null'] },
          status: { type: ['string', 'null'] },
          rawResponse: { type: ['object', 'null'] },
        },
      },
      PaymentListResponse: {
        type: 'object',
        properties: {
          payments: {
            type: 'array',
            items: { $ref: '#/components/schemas/Payment' },
          },
          pagination: { $ref: '#/components/schemas/Pagination' },
          filters: {
            type: 'object',
            properties: {
              status: { type: ['string', 'null'] },
              currency: { type: ['string', 'null'] },
              providerId: { type: ['string', 'null'] },
              recipientRef: { type: ['string', 'null'] },
              from: { type: ['string', 'null'] },
              to: { type: ['string', 'null'] },
              sort: { type: 'string' },
              order: { type: 'string', enum: ['asc', 'desc'] },
            },
            required: ['sort', 'order'],
          },
        },
        required: ['payments', 'pagination', 'filters'],
      },
      RiskScoreRequest: {
        type: 'object',
        properties: {
          amountMinor: { type: 'integer' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          provider: { type: 'string' },
          providerId: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check',
        responses: { 200: { description: 'Application is healthy' } },
      },
    },
    '/api/ready': {
      get: {
        summary: 'Readiness check',
        responses: { 200: { description: 'Application is ready' } },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Login and issue access tokens',
        responses: {
          200: { description: 'Login succeeded' },
          401: { description: 'Login failed' },
        },
      },
    },
    '/api/v2/openapi.json': {
      get: {
        summary: 'Fetch the OpenAPI contract',
        responses: { 200: { description: 'OpenAPI document' } },
      },
    },
    '/api/v2/payments': {
      get: {
        summary: 'List payments',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'currency', in: 'query', schema: { type: 'string' } },
          { name: 'providerId', in: 'query', schema: { type: 'string' } },
          { name: 'recipientRef', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          {
            name: 'sort',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['createdAt', 'amountMinor', 'currency', 'status', 'providerId'],
            },
          },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: {
          200: {
            description: 'Payment list',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Envelope' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/PaymentListResponse' },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Create payment',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaymentCreateRequest' },
            },
          },
        },
        responses: {
          201: { description: 'Payment created' },
          409: { description: 'Idempotency conflict' },
        },
      },
    },
    '/api/v2/payments/{paymentId}': {
      get: {
        summary: 'Get a single payment',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Payment found' },
          404: { description: 'Payment not found' },
        },
      },
      patch: {
        summary: 'Update payment status',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Payment updated' },
          422: { description: 'Invalid state transition' },
        },
      },
    },
    '/api/v2/payments/{paymentId}/verify': {
      post: {
        summary: 'Verify a payment with its provider adapter',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  providerRef: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Verification completed' },
          404: { description: 'Payment or adapter not found' },
        },
      },
    },
    '/api/v2/payments/{paymentId}/refund': {
      post: {
        summary: 'Refund a payment with its provider adapter',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idempotencyKey'],
                properties: {
                  amountMinor: { type: 'integer', minimum: 1 },
                  idempotencyKey: { type: 'string', minLength: 1, maxLength: 200 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Refund created or replayed' },
          400: { description: 'Invalid amount or missing idempotency key' },
          409: { description: 'Conflict, insufficient balance, or reconciliation required' },
          502: { description: 'Unknown provider outcome; reserved amount retained' },
          404: { description: 'Payment or adapter not found' },
        },
      },
    },
    '/api/v2/refunds': {
      get: {
        summary: 'List refunds',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'providerId', in: 'query', schema: { type: 'string' } },
          { name: 'paymentId', in: 'query', schema: { type: 'string' } },
          { name: 'currency', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Refund list' } },
      },
    },
    '/api/v2/analytics/refunds': {
      get: {
        summary: 'Fetch refund analytics',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'window',
            in: 'query',
            schema: { type: 'string', enum: ['24h', '7d', '30d', '90d'] },
          },
          { name: 'bucket', in: 'query', schema: { type: 'string', enum: ['hour', 'day'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'providerId', in: 'query', schema: { type: 'string' } },
          { name: 'currency', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Refund analytics' } },
      },
    },
    '/api/v2/analytics/webhook-deliveries': {
      get: {
        summary: 'Fetch webhook delivery analytics',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'window',
            in: 'query',
            schema: { type: 'string', enum: ['24h', '7d', '30d', '90d'] },
          },
          { name: 'bucket', in: 'query', schema: { type: 'string', enum: ['hour', 'day'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'event', in: 'query', schema: { type: 'string' } },
          { name: 'subscriptionId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Webhook delivery analytics' } },
      },
    },
    '/api/mcp': {
      post: {
        summary: 'Send a JSON-RPC MCP request over HTTP',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'MCP JSON-RPC response' } },
      },
    },
    '/api/mcp/sse': {
      get: {
        summary: 'Open an MCP SSE session',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'MCP SSE session established' } },
      },
    },
    '/api/mcp/messages/{sessionId}': {
      post: {
        summary: 'Send a JSON-RPC MCP request to an active SSE session',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 202: { description: 'MCP message acknowledged' } },
      },
    },
    '/api/mcp/sessions/{sessionId}': {
      delete: {
        summary: 'Close an active MCP SSE session',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          204: { description: 'Session closed' },
          404: { description: 'Session not found' },
        },
      },
    },
    '/api/v2/webhook-dead-letters': {
      get: {
        summary: 'List dead-lettered webhook jobs',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'subscriptionId', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Dead-letter list' } },
      },
    },
    '/api/v2/webhook-dead-letters/{deadLetterId}/requeue': {
      post: {
        summary: 'Requeue a dead-lettered webhook job',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'deadLetterId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          202: { description: 'Dead letter requeued' },
          404: { description: 'Dead letter not found' },
        },
      },
    },
    '/api/v2/webhook-dead-letters/{deadLetterId}': {
      delete: {
        summary: 'Discard a dead-lettered webhook job',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'deadLetterId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Dead letter discarded' },
          404: { description: 'Dead letter not found' },
        },
      },
    },
    '/api/v2/providers': {
      get: {
        summary: 'List providers',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Provider list' } },
      },
      post: {
        summary: 'Create provider',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Provider created' } },
      },
    },
    '/api/v2/providers/{providerId}': {
      patch: {
        summary: 'Update a provider',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'providerId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Provider updated' },
          404: { description: 'Provider not found' },
        },
      },
      delete: {
        summary: 'Soft delete a provider',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'providerId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Provider marked inactive' },
          404: { description: 'Provider not found' },
        },
      },
    },
    '/api/v2/mismatches': {
      get: {
        summary: 'List mismatches',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Mismatch list' } },
      },
      post: {
        summary: 'Create mismatch',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Mismatch created' } },
      },
    },
    '/api/v2/mismatches/{mismatchId}': {
      patch: {
        summary: 'Update mismatch',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'mismatchId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Mismatch updated' } },
      },
    },
    '/api/v2/reconciliation': {
      get: {
        summary: 'Fetch reconciliation summary',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Reconciliation summary' } },
      },
    },
    '/api/v2/analytics': {
      get: {
        summary: 'Fetch analytics summary',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Analytics summary' } },
      },
    },
    '/api/v2/settlements': {
      get: {
        summary: 'List settled payments',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Settlement list' } },
      },
    },
    '/api/v2/webhook': {
      post: {
        summary: 'Receive provider webhook',
        responses: {
          200: { description: 'Webhook accepted' },
          401: { description: 'Invalid signature' },
        },
      },
    },
    '/api/v2/webhook-traces': {
      get: {
        summary: 'List webhook traces',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Webhook traces' } },
      },
      post: {
        summary: 'Create webhook trace',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Webhook trace created' } },
      },
    },
    '/api/v2/webhook-subscriptions': {
      get: {
        summary: 'List outbound webhook subscriptions',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Webhook subscriptions' } },
      },
      post: {
        summary: 'Create an outbound webhook subscription',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Webhook subscription created' } },
      },
    },
    '/api/v2/webhook-subscriptions/{subscriptionId}': {
      patch: {
        summary: 'Update an outbound webhook subscription',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'subscriptionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Webhook subscription updated' } },
      },
      delete: {
        summary: 'Disable an outbound webhook subscription',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'subscriptionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Webhook subscription disabled' } },
      },
    },
    '/api/v2/webhook-deliveries': {
      get: {
        summary: 'List outbound webhook deliveries and queue state',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'subscriptionId', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Webhook deliveries' } },
      },
    },
    '/api/auth/refresh': {
      post: {
        summary: 'Exchange a refresh token for a new access token',
        responses: {
          200: { description: 'Refresh succeeded' },
          401: { description: 'Refresh failed' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        summary: 'Invalidate the current session tokens',
        responses: { 200: { description: 'Logout succeeded' } },
      },
    },
    '/api/payments': {
      get: {
        summary: 'List payments via the deprecated v1 compatibility route',
        deprecated: true,
        responses: { 200: { description: 'Legacy payment list' } },
      },
      post: {
        summary: 'Create payments via the deprecated v1 compatibility route',
        deprecated: true,
        responses: {
          200: { description: 'Legacy payment created or replayed' },
          201: { description: 'Legacy payment created' },
        },
      },
    },
    '/api/ai/risk-score': {
      post: {
        summary: 'Score transaction risk',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RiskScoreRequest' },
            },
          },
        },
        responses: { 200: { description: 'Risk score generated' } },
      },
    },
  },
};

export { openApiDocument };
