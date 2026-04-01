import { spawn } from 'child_process';
const path = `"C:\\Users\\Home Station\\.vscode\\extensions\\highagency.pencildev-0.6.21\\out\\mcp-server-windows-x64.exe"`;

const child = spawn(path, ['--app', 'antigravity'], { shell: true });

let responseBuffer = '';

child.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  try {
    const lines = responseBuffer.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim()) {
            console.log('RECV:', lines[i]);
            const msg = JSON.parse(lines[i]);
            if (msg.id === 1) {
                // Send tools/list request
                const toolsReq = {
                    jsonrpc: "2.0",
                    id: 2,
                    method: "tools/list",
                    params: {}
                };
                child.stdin.write(JSON.stringify(toolsReq) + '\n');
            } else if (msg.id === 2) {
                console.log("TOOLS LIST:");
                console.log(JSON.stringify(msg, null, 2));
                child.kill();
                process.exit(0);
            }
        }
    }
    responseBuffer = lines[lines.length - 1];
  } catch (e) {
    // wait for more data
  }
});

child.stderr.on('data', (data) => {
  console.error('SERVER ERR:', data.toString());
});

const initReq = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" }
  }
};

child.stdin.write(JSON.stringify(initReq) + '\n');
