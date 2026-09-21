import { randomUUID } from 'node:crypto';
import { parseBearer } from '../auth/tokens.js';
import { createMessageHandler } from '../mcp/core.js';
import { readJsonBody } from '../http/request.js';

function writeSseEvent(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function requestBaseUrl(runtime, request) {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'http';
  return `${protocol}://${request.headers.host || runtime.baseUrl || `${runtime.config.host}:${runtime.config.port}`}`;
}

function registerMcpRoutes(router) {
  router.register(
    'POST',
    '/api/mcp',
    async ({ runtime, request, response }) => {
      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      const handler = createMessageHandler({
        baseUrl: requestBaseUrl(runtime, request),
        accessToken: parseBearer(request),
        username: runtime.config.appUser,
        password: runtime.config.appPass,
      });

      const result = await handler(payload);
      response.writeHead(result ? 200 : 202, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result ?? { acknowledged: true }));
    },
    { authScope: 'write' },
  );

  router.register(
    'GET',
    '/api/mcp/sse',
    async ({ runtime, request, response }) => {
      const sessionId = randomUUID();
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      response.write(': connected\n\n');

      const heartbeat = setInterval(() => {
        response.write(': heartbeat\n\n');
      }, 15000);

      runtime.mcpSseSessions.set(sessionId, {
        response,
        heartbeat,
        baseUrl: requestBaseUrl(runtime, request),
        accessToken: parseBearer(request),
      });
      writeSseEvent(response, 'session', {
        sessionId,
        postPath: `/api/mcp/messages/${sessionId}`,
        closePath: `/api/mcp/sessions/${sessionId}`,
      });

      const cleanup = () => {
        clearInterval(heartbeat);
        runtime.mcpSseSessions.delete(sessionId);
      };

      request.on('close', cleanup);
      response.on('close', cleanup);
    },
    { authScope: 'write' },
  );

  router.register(
    'POST',
    '/api/mcp/messages/:sessionId',
    async ({ runtime, request, response, params }) => {
      const session = runtime.mcpSseSessions.get(params.sessionId);
      if (!session) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'MCP SSE session not found.' }));
        return;
      }

      const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
      const handler = createMessageHandler({
        baseUrl: session.baseUrl,
        accessToken: session.accessToken,
        username: runtime.config.appUser,
        password: runtime.config.appPass,
      });
      const result = await handler(payload);
      if (result) {
        writeSseEvent(session.response, 'message', result);
      }

      response.writeHead(202, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ acknowledged: true, sessionId: params.sessionId }));
    },
    { authScope: 'write' },
  );

  router.register(
    'DELETE',
    '/api/mcp/sessions/:sessionId',
    async ({ runtime, response, params }) => {
      const session = runtime.mcpSseSessions.get(params.sessionId);
      if (!session) {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'MCP SSE session not found.' }));
        return;
      }

      clearInterval(session.heartbeat);
      runtime.mcpSseSessions.delete(params.sessionId);
      session.response.end();
      response.writeHead(204);
      response.end();
    },
    { authScope: 'write' },
  );
}

export { registerMcpRoutes };
