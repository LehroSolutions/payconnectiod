import { randomUUID } from "node:crypto";
import { sendJson } from "../envelope.js";
import { readJsonBody } from "../http/request.js";
import { verifyPassword } from "../auth/passwords.js";
import { cleanupAuth, issueToken, parseBearer, verifyToken } from "../auth/tokens.js";
import { nowIso } from "./shared.js";

function registerAuthRoutes(router) {
  router.register("POST", "/api/auth/login", async ({ runtime, request, response, saveState }) => {
    const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
    const username = typeof payload.username === "string" ? payload.username : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    if (!username || !password) {
      sendJson(response, 400, { error: "Missing fields: username, password" });
      return;
    }

    const user = runtime.state.users.find((entry) => entry.username === username);
    const verification = user
      ? verifyPassword(user.passwordHash, password, { legacySalt: runtime.config.authSalt })
      : { ok: false, nextHash: null };
    const success = Boolean(user && verification.ok);

    runtime.state.auth.audit.unshift({
      id: randomUUID(),
      at: nowIso(),
      event: "login",
      username,
      success,
      ip: request.socket.remoteAddress || "unknown"
    });

    if (!success) {
      await saveState(runtime);
      sendJson(response, 401, { error: "Invalid username or password." });
      return;
    }

    if (verification.nextHash) {
      user.passwordHash = verification.nextHash;
    }

    const access = issueToken(runtime.state, user, "access", runtime.config.appSecret);
    const refresh = issueToken(runtime.state, user, "refresh", runtime.config.appSecret);
    await saveState(runtime);
    sendJson(response, 200, {
      token: access.token,
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresAt: access.expiresAt,
      role: access.role,
      scopes: access.scopes
    });
  });

  router.register("POST", "/api/auth/refresh", async ({ runtime, request, response, saveState }) => {
    const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
    const refreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken : "";
    if (!refreshToken) {
      sendJson(response, 400, { error: "refreshToken is required." });
      return;
    }

    cleanupAuth(runtime.state);
    const refresh = runtime.state.auth.refreshTokens.find((entry) => entry.token === refreshToken);
    const refreshPayload = refresh ? verifyToken(refreshToken, runtime.config.appSecret) : null;
    if (!refresh || !refreshPayload || refreshPayload.type !== "refresh" || refreshPayload.sub !== refresh.userId || refreshPayload.exp !== refresh.expiresAt) {
      sendJson(response, 401, { error: "Refresh token is invalid or expired." });
      return;
    }

    const user = runtime.state.users.find((entry) => entry.id === refresh.userId);
    const access = issueToken(runtime.state, user, "access", runtime.config.appSecret);
    runtime.state.auth.audit.unshift({
      id: randomUUID(),
      at: nowIso(),
      event: "refresh",
      username: user.username,
      success: true
    });

    await saveState(runtime);
    sendJson(response, 200, {
      token: access.token,
      accessToken: access.token,
      expiresAt: access.expiresAt,
      scopes: access.scopes
    });
  });

  router.register("POST", "/api/auth/logout", async ({ runtime, request, response, saveState }) => {
    const payload = await readJsonBody(request, runtime.config.bodyLimitBytes);
    const accessToken = parseBearer(request);
    runtime.state.auth.accessTokens = runtime.state.auth.accessTokens.filter((item) => item.token !== accessToken);
    if (payload.refreshToken) {
      runtime.state.auth.refreshTokens = runtime.state.auth.refreshTokens.filter((item) => item.token !== payload.refreshToken);
    }

    runtime.state.auth.audit.unshift({ id: randomUUID(), at: nowIso(), event: "logout", success: true });
    await saveState(runtime);
    sendJson(response, 200, { loggedOut: true });
  });
}

export { registerAuthRoutes };
