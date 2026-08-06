import { spawn } from "node:child_process";
import { resolve } from "node:path";

const [timeoutValue, scriptValue, ...scriptArgs] = process.argv.slice(2);
const timeoutMs = Number(timeoutValue);
if (!Number.isInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 30 * 60_000 || !scriptValue) {
  throw new Error("Usage: node scripts/run-node-supervised.mjs TIMEOUT_MS SCRIPT [...ARGS]");
}

const scriptPath = resolve(scriptValue);
const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

let timedOut = false;
const forceTimer = { value: null };
const timeout = setTimeout(() => {
  timedOut = true;
  process.stderr.write(`Supervised command exceeded ${timeoutMs}ms and was terminated: ${scriptValue}\n`);
  child.kill("SIGTERM");
  forceTimer.value = setTimeout(() => child.kill("SIGKILL"), 5_000);
}, timeoutMs);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  clearTimeout(timeout);
  if (forceTimer.value) clearTimeout(forceTimer.value);
  throw error;
});

child.once("exit", (code, signal) => {
  clearTimeout(timeout);
  if (forceTimer.value) clearTimeout(forceTimer.value);
  process.exitCode = timedOut ? 124 : code ?? (signal ? 1 : 0);
});
