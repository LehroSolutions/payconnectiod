import { Router } from '../router.js';
import { registerAuthRoutes } from './auth.js';
import { registerDocsRoutes } from './docs.js';
import { registerHealthRoutes } from './health.js';
import { registerLegacyRoutes } from './legacy.js';
import { registerMcpRoutes } from './mcp.js';
import { registerRiskRoutes } from './risk.js';
import { registerRootRoutes } from './root.js';
import { registerV2Routes } from './v2.js';
import { registerWebhookRoutes } from './webhooks.js';

function buildRouter() {
  const router = new Router();
  registerHealthRoutes(router);
  registerAuthRoutes(router);
  registerLegacyRoutes(router);
  registerDocsRoutes(router);
  registerMcpRoutes(router);
  registerWebhookRoutes(router);
  registerV2Routes(router);
  registerRiskRoutes(router);
  registerRootRoutes(router);
  return router;
}

export { buildRouter };
