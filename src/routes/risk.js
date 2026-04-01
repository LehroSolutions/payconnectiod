import { sendEnvelope } from "../envelope.js";
import { readJsonBody } from "../http/request.js";
import { createRiskAssessment } from "./shared.js";

function registerRiskRoutes(router) {
  router.register("POST", "/api/ai/risk-score", async ({ runtime, request, response, requestId }) => {
    const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
    sendEnvelope(response, requestId, 200, {
      ok: true,
      data: createRiskAssessment(payload)
    });
  });
}

export { registerRiskRoutes };
