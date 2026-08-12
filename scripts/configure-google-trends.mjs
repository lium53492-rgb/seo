import {
  configureGoogleTrendsCredentials,
} from "./lib/google-trends-credentials.mjs";

function usage() {
  return [
    "Usage:",
    "  npm run trends:configure -- <service-account.json>",
    "  npm run trends:configure -- <service-account.json> --force",
    "",
    "The command updates only GOOGLE_TRENDS_BIGQUERY_* in this worktree's .env.local.",
    "It never prints the private key. Existing non-empty values require explicit --force.",
  ].join("\n");
}

function parseArguments(argv) {
  let credentialPath = null;
  let force = false;
  let help = false;
  for (const argument of argv) {
    if (argument === "--force") force = true;
    else if (argument === "--help" || argument === "-h") help = true;
    else if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
    else if (credentialPath) throw new Error("Supply exactly one service-account JSON path");
    else credentialPath = argument;
  }
  if (!help && !credentialPath) throw new Error("A service-account JSON path is required");
  return { credentialPath, force, help };
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
  } else {
    const result = configureGoogleTrendsCredentials(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Credential configuration failed"}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}
