import { stdin, stdout, stderr, exit } from "node:process";
import { createMessageHandler } from "./core.js";

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
      exit(0);
    });
  }

  async processBuffer() {
    while (true) {
      if (this.expectedLength === null) {
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;

        const headerText = this.buffer.slice(0, headerEnd).toString("utf8");
        const contentLengthLine = headerText
          .split("\r\n")
          .find((line) => line.toLowerCase().startsWith("content-length:"));

        if (!contentLengthLine) {
          throw new Error("Missing Content-Length header.");
        }

        this.expectedLength = Number.parseInt(contentLengthLine.split(":")[1].trim(), 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      if (this.buffer.length < this.expectedLength) return;

      const bodyBuffer = this.buffer.slice(0, this.expectedLength);
      this.buffer = this.buffer.slice(this.expectedLength);
      this.expectedLength = null;

      const message = JSON.parse(bodyBuffer.toString("utf8"));
      const response = await this.handler(message);
      if (response) {
        this.writeMessage(response);
      }
    }
  }

  writeMessage(payload) {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
    stdout.write(body);
  }
}

function startStdioMcpServer() {
  const handler = createMessageHandler({
    baseUrl: process.env.PAYCONNECTOID_BASE_URL ?? process.env.PAYWITHAFRICAKIT_BASE_URL,
    username: process.env.PAYCONNECTOID_USER ?? process.env.PAYWITHAFRICAKIT_USER,
    password: process.env.PAYCONNECTOID_PASS ?? process.env.PAYWITHAFRICAKIT_PASS
  });
  new StdioJsonRpcServer(handler).start();
}

export { startStdioMcpServer };
