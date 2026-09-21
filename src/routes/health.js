import { sendEnvelope } from '../envelope.js';
import { nowIso } from './shared.js';

function registerHealthRoutes(router) {
  router.register('GET', '/api/health', async ({ runtime, response, requestId }) => {
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: { app: runtime.config.appName, status: 'ok', time: nowIso() },
    });
  });

  router.register('GET', '/api/ready', async ({ runtime, response, requestId }) => {
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: { ready: true, storage: runtime.storageBackend },
    });
  });
}

export { registerHealthRoutes };
