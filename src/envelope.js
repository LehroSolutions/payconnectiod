function envelope(requestId, ok, data = null, error = null) {
  return { requestId, ok, data, error };
}

function sendJson(response, code, payload, headers = {}) {
  response.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendEnvelope(response, requestId, code, options) {
  sendJson(
    response,
    code,
    envelope(requestId, options.ok, options.data ?? null, options.error ?? null),
    {
      "x-request-id": requestId,
      ...(options.headers ?? {})
    }
  );
}

function sendV1Json(response, code, payload, headers = {}) {
  sendJson(response, code, payload, headers);
}

export { envelope, sendEnvelope, sendJson, sendV1Json };
