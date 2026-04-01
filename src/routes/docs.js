import { sendJson } from "../envelope.js";
import { openApiDocument } from "../openapi.js";

function registerDocsRoutes(router) {
  router.register("GET", "/api/v2/openapi.json", async ({ response }) => {
    sendJson(response, 200, openApiDocument);
  });
}

export { registerDocsRoutes };
