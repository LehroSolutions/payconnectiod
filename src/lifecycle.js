const STATE_TRANSITIONS = {
  initiated: ["authorized", "failed"],
  authorized: ["settled", "failed"],
  settled: [],
  failed: []
};

export function canTransition(fromState, toState) {
  return (STATE_TRANSITIONS[fromState] ?? []).includes(toState);
}

export function normalizeProviderStatus(status) {
  switch ((status ?? "").toLowerCase()) {
    case "initiated":
    case "pending":
      return "initiated";
    case "authorized":
    case "approved":
    case "authorised":
      return "authorized";
    case "captured":
    case "settled":
      return "settled";
    case "declined":
    case "failed":
      return "failed";
    default:
      return "initiated";
  }
}

