import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../app/server.js";

export async function startTestServer(options = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), "payconnectoid-"));
  const app = await startServer({
    host: "127.0.0.1",
    port: 0,
    dataFilePath: join(tempDir, "data.json"),
    dbFilePath: join(tempDir, "data.sqlite"),
    preferSqlite: false,
    logEnabled: false,
    ...options
  });

  return {
    ...app,
    tempDir,
    waitForBackgroundWork: app.waitForBackgroundWork,
    async close() {
      await app.waitForBackgroundWork();
      await new Promise((resolveClose) => app.server.close(resolveClose));
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}
