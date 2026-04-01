import { sendV1Json } from "../envelope.js";
import { readJsonBody } from "../http/request.js";
import { parseCreatePaymentPayload, createPaymentFromInput, toLegacyPayment } from "./shared.js";

function registerLegacyRoutes(router) {
  router.register("GET", "/api/payments", async ({ runtime, response, requestId, logEvent, v1Headers }) => {
    logEvent(runtime, "info", "v1_deprecation_route_hit", requestId, { path: "/api/payments" });
    sendV1Json(response, 200, { ledger: runtime.state.ledger.map(toLegacyPayment) }, v1Headers);
  });

  router.register("POST", "/api/payments", async ({ runtime, request, response, requestId, saveState, logEvent, v1Headers }) => {
    logEvent(runtime, "info", "v1_deprecation_route_hit", requestId, { path: "/api/payments" });
    const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
    const parsed = parseCreatePaymentPayload(payload, { allowLegacyAmount: true });
    if (!parsed.ok) {
      sendV1Json(response, 400, { error: parsed.errors.join(" ") }, v1Headers);
      return;
    }

    const created = await createPaymentFromInput(runtime, requestId, parsed.value, logEvent);
    if (!created.ok) {
      sendV1Json(response, created.code, { error: created.error.message }, v1Headers);
      return;
    }

    if (!created.replay) await saveState(runtime);
    sendV1Json(response, created.code, {
      item: toLegacyPayment(created.payment),
      ledger: runtime.state.ledger.map(toLegacyPayment)
    }, v1Headers);
  });
}

export { registerLegacyRoutes };
