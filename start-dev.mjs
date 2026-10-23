import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];

function start(label, args, relativeCwd) {
  const cwd = resolve(projectRoot, relativeCwd);
  console.log(`[${label}] starting in ${cwd}`);
  const child = spawn(npm, args, {
    cwd,
    stdio: "inherit",
    // Windows needs a shell to execute npm.cmd. On Unix, avoid a shell.
    shell: process.platform === "win32",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  child.on("error", (error) => {
    console.error(`[${label}] failed to start: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    if (code && !signal) console.error(`[${label}] exited with code ${code}`);
  });
  children.push(child);
  return child;
}

async function waitForBackend(backendProcess) {
  const url = "http://127.0.0.1:4000/api/health";
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    if (backendProcess.exitCode !== null || backendProcess.signalCode !== null) {
      console.error(`[backend] Process exited before the health check (code: ${backendProcess.exitCode}, signal: ${backendProcess.signalCode}).`);
      return false;
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log("[backend] API health check passed.");
        return true;
      }
    } catch {
      // The backend is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  return false;
}

console.log("\n==========================================");
console.log("        REACTORPLAN DEVELOPMENT");
console.log("==========================================\n");

const backendProcess = start("backend", ["run", "dev"], "backend");
const ready = await waitForBackend(backendProcess);
if (!ready) {
  console.error("[backend] Could not reach http://127.0.0.1:4000/api/health.");
  console.error("Check backend dependencies and the backend terminal output.");
  process.exitCode = 1;
  for (const child of children) {
    if (!child.killed && child.exitCode === null) child.kill();
  }
} else {
  start("frontend", ["run", "dev"], "frontend");
}

function shutdown(signal) {
  console.log(`\nStopping ReactorPlan (${signal})...`);
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
