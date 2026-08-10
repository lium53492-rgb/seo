import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readDailyLease } from "./lib/daily-coordination.mjs";
import { readDailyRunState, shanghaiDate } from "./lib/daily-run-state.mjs";

const date = process.argv[2] || shanghaiDate();
const coordinationRoot = resolve(execFileSync("git", ["rev-parse", "--git-common-dir"], {
  cwd: process.cwd(),
  encoding: "utf8",
}).trim());
const lease = readDailyLease({ coordinationRoot, date });
const state = readDailyRunState({ date, noPublishReceipt: lease?.noPublishReceipt ?? null });
process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
if (state.state === "conflict") process.exitCode = 2;
