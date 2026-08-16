const status = {
  schemaVersion: 1,
  provider: "playworlds_callback",
  state: "unavailable",
  detail: "The signed Playworlds conversion callback contract has not been implemented or verified.",
};

process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
process.exitCode = 2;
