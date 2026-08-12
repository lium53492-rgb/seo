import "./load-env.mjs";

import {
  atomicEnrichResearchFile,
  collectGoogleTrendsBigQuery,
  googleTrendsBigQueryStatus,
  readResearchDocument,
  researchCandidateKeywords,
  trendSignalsFromCollection,
} from "./lib/google-trends-bigquery.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/collect-google-trends.mjs --check",
    "  node scripts/collect-google-trends.mjs [--stdout] [--candidate <keyword> ...] [--as-of YYYY-MM-DD]",
    "  node scripts/collect-google-trends.mjs --research <data/research/YYYY-MM-DD.json> [--as-of YYYY-MM-DD]",
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    check: false,
    stdout: false,
    researchPath: null,
    candidates: [],
    asOfDate: undefined,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--stdout") options.stdout = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (["--research", "--candidate", "--as-of"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      index += 1;
      if (argument === "--research") {
        if (options.researchPath) {
          throw new Error("--research can be supplied only once");
        }
        options.researchPath = value;
      } else if (argument === "--candidate") {
        options.candidates.push(value);
      } else {
        if (options.asOfDate) {
          throw new Error("--as-of can be supplied only once");
        }
        options.asOfDate = value;
      }
    } else {
      throw new Error(`Unknown Google Trends option: ${argument}`);
    }
  }
  if (options.check && (options.researchPath || options.candidates.length || options.asOfDate)) {
    throw new Error("--check cannot be combined with collection options");
  }
  if (options.researchPath && options.candidates.length) {
    throw new Error("--research cannot be combined with --candidate");
  }
  if (options.researchPath && options.stdout) {
    throw new Error("--research and --stdout are separate output modes");
  }
  return options;
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Invalid arguments"}\n${usage()}\n`);
  process.exitCode = 1;
}

if (options?.help) {
  process.stdout.write(`${usage()}\n`);
} else if (options?.check) {
  const status = googleTrendsBigQueryStatus();
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  if (!status.configured) process.exitCode = 2;
} else if (options) {
  let candidates = options.candidates;
  if (options.researchPath) {
    const { research } = readResearchDocument(options.researchPath);
    const researchDate = String(research?.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(researchDate)) {
      throw new Error("Research document date must be YYYY-MM-DD");
    }
    if (options.asOfDate && options.asOfDate !== researchDate) {
      throw new Error("--as-of must match the research document date");
    }
    options.asOfDate = researchDate;
    candidates = researchCandidateKeywords(research);
  }
  const trendCollection = await collectGoogleTrendsBigQuery({
    candidates,
    asOfDate: options.asOfDate,
  });
  const trendSignals = trendSignalsFromCollection(
    trendCollection,
    candidates,
  );
  if (options.researchPath) {
    if (trendCollection.state === "observed") {
      const result = atomicEnrichResearchFile(
        options.researchPath,
        trendCollection,
      );
      process.stdout.write(`${result.absolutePath}\n`);
    } else {
      process.stdout.write(`${JSON.stringify({ trendCollection, trendSignals }, null, 2)}\n`);
    }
  } else {
    process.stdout.write(`${JSON.stringify({ trendCollection, trendSignals }, null, 2)}\n`);
  }
  if (trendCollection.state !== "observed") process.exitCode = 2;
}
