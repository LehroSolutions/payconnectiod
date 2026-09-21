import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const workspaceRoot = resolve(new URL("..", import.meta.url).pathname);
const specPath = resolve(workspaceRoot, "openapi.yaml");
const outputMap = {
  typescript: resolve(workspaceRoot, "sdks", "typescript"),
  python: resolve(workspaceRoot, "sdks", "python")
};

function runCommand(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: "inherit",
      shell: false
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`));
    });
    child.on("error", rejectRun);
  });
}

async function main() {
  const gidevoCommand = process.env.GIDEVO_COMMAND || "gidevo";
  const gidevoSubcommand = process.env.GIDEVO_SUBCOMMAND || "generate";

  for (const outputPath of Object.values(outputMap)) {
    await mkdir(outputPath, { recursive: true });
  }

  for (const [language, outputPath] of Object.entries(outputMap)) {
    const args = [
      gidevoSubcommand,
      "--input",
      specPath,
      "--language",
      language,
      "--output",
      outputPath
    ];
    await runCommand(gidevoCommand, args);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
