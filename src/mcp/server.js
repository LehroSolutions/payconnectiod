import { stdin, stdout, stderr, exit } from "node:process";

function logError(message) {
  stderr.write(`${message}\n`);
}

class StdioJsonRpcServer {
  constructor(handler) {
    this.handler = handler;
    this.buffer = Buffer.alloc(0);
    this.expectedLength = null;
  }

  start() {
    stdin.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processBuffer().catch((error) => {
        logError(error?.stack || String(error));
      });
    });

    stdin.on("end", () => {
      import { startStdioMcpServer } from "./stdio.js";

      startStdioMcpServer();

