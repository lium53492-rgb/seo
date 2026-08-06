import { readDailyRunState, shanghaiDate } from "./lib/daily-run-state.mjs";

const date = process.argv[2] || shanghaiDate();
const state = readDailyRunState({ date });
process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
if (state.state === "conflict") process.exitCode = 2;
