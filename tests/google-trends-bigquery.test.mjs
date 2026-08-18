import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  GOOGLE_TRENDS_SOURCE_URL,
  GOOGLE_TRENDS_TOP_TERMS_TABLE,
  GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
  atomicEnrichResearchFile,
  collectGoogleTrendsBigQuery,
  computeTrendCollectionDigest,
  googleTrendsBigQueryStatus,
  googleTrendsQueryContract,
  normalizeTrendTerm,
  trendSignalsFromCollection,
} from "../scripts/lib/google-trends-bigquery.mjs";
import {
  GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
  GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST,
  validateGoogleTrendsEvidence,
} from "../lib/seo/google-trends-contract.mjs";

const seoPolicy = JSON.parse(readFileSync(new URL("../data/config/seo-policy.json", import.meta.url), "utf8"));
const { privateKey: fixturePrivateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const configuredEnv = {
  GOOGLE_TRENDS_BIGQUERY_PROJECT_ID: "seo-trends-fixture",
  GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL:
    "trends-reader@seo-trends-fixture.iam.gserviceaccount.com",
  GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY:
    fixturePrivateKey,
};

function queryResponse(kind, rows) {
  const metric = kind === "rising" ? "max_percent_gain" : "max_dma_score";
  return Response.json({
    jobComplete: true,
    schema: {
      fields: [
        { name: "term", type: "STRING" },
        { name: "week", type: "DATE" },
        { name: "best_rank", type: "INTEGER" },
        { name: metric, type: "INTEGER" },
        { name: "dma_count", type: "INTEGER" },
        { name: "refresh_date", type: "DATE" },
      ],
    },
    totalRows: String(rows.length),
    rows: rows.map((row) => ({
      f: [
        { v: row.term },
        { v: row.week || "2026-08-02" },
        { v: String(row.bestRank) },
        { v: String(row.metric) },
        { v: String(row.dmaCount) },
        { v: row.refreshDate || "2026-08-10" },
      ],
    })),
  });
}

async function observedFixture(candidates) {
  const requests = [];
  const collection = await collectGoogleTrendsBigQuery({
    candidates,
    now: new Date("2026-08-11T04:00:00.000Z"),
    env: configuredEnv,
    getAccessToken: async (config) => {
      assert.equal(config.projectId, "seo-trends-fixture");
      return "fixture-access-token";
    },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ url: String(url), init, body });
      const rising = body.query.includes("top_rising_terms");
      return rising
        ? queryResponse("rising", [{
          term: "Dungeon Master Prep",
          bestRank: 4,
          metric: 740,
          dmaCount: 18,
        }])
        : queryResponse("top", [
          {
            term: "Dungeon Master Prep",
            bestRank: 2,
            metric: 96,
            dmaCount: 31,
          },
          {
            term: "Tavern Encounter Ideas",
            bestRank: 13,
            metric: 64,
            dmaCount: 7,
          },
        ]);
    },
  });
  return { collection, requests };
}

test("configuration check keeps Google Trends credentials independent and explicit", () => {
  const missing = googleTrendsBigQueryStatus({});
  assert.equal(missing.configured, false);
  assert.equal(missing.state, "unavailable");
  assert.deepEqual(missing.missing, [
    "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID",
    "GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL",
    "GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY",
  ]);
  const configured = googleTrendsBigQueryStatus(configuredEnv);
  assert.equal(configured.configured, true);
  assert.equal(configured.state, "configured");
  assert.equal(configured.location, "US");
});

test("collector constants remain bound to the versioned SEO policy", () => {
  assert.equal(seoPolicy.googleTrends.collectionMethod, "bigquery_public_dataset");
  assert.equal(seoPolicy.googleTrends.geo, googleTrendsQueryContract.location);
  assert.equal(seoPolicy.googleTrends.sourceUrl, GOOGLE_TRENDS_SOURCE_URL);
  assert.deepEqual(seoPolicy.googleTrends.sourceTables, [
    GOOGLE_TRENDS_TOP_TERMS_TABLE,
    GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
  ]);
  assert.equal(
    seoPolicy.googleTrends.maximumBytesBilled,
    googleTrendsQueryContract.maximumBytesBilled,
  );
  assert.equal(seoPolicy.googleTrends.timeoutMs, googleTrendsQueryContract.queryTimeoutMs);
  assert.equal(seoPolicy.googleTrends.sameDayCollectionRequired, true);
  assert.equal(seoPolicy.googleTrends.notObservedAllowsPublication, true);
  assert.equal(seoPolicy.googleTrends.providerUnavailableAllowsPublication, false);
  assert.equal(seoPolicy.googleTrends.exactCandidateMatchRequired, false);
  assert.equal(seoPolicy.googleTrends.topTermsQualifyForPublication, false);
  assert.equal(seoPolicy.googleTrends.topRisingTermsQualifyForPublication, false);
});

test("normalization is conservative and collection digests use stable recursive key order", () => {
  assert.equal(normalizeTrendTerm("  DUNGEON\tMaster  Prep "), "dungeon master prep");
  assert.notEqual(normalizeTrendTerm("D&D"), normalizeTrendTerm("dnd"));
  const left = {
    schemaVersion: 1,
    nested: { z: 1, a: [{ y: 2, b: 3 }] },
    snapshotDigest: "ignored",
  };
  const right = {
    nested: { a: [{ b: 3, y: 2 }], z: 1 },
    schemaVersion: 1,
  };
  assert.equal(
    computeTrendCollectionDigest(left),
    computeTrendCollectionDigest(right),
  );
});

test("missing credentials return unavailable evidence without fetching or inventing zero", async () => {
  let fetchCalls = 0;
  const collection = await collectGoogleTrendsBigQuery({
    candidates: ["dungeon master prep"],
    now: new Date("2026-08-11T04:00:00.000Z"),
    env: {},
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("must not fetch");
    },
  });
  const [signal] = trendSignalsFromCollection(
    collection,
    ["dungeon master prep"],
  );
  assert.equal(fetchCalls, 0);
  assert.equal(collection.state, "unavailable");
  assert.equal(signal.state, "unavailable");
  assert.equal(signal.relativeInterest, null);
  assert.equal(signal.direction, "unknown");
  assert.equal(signal.period, "requested refresh date 2026-08-10");
  assert.equal(signal.bestRank, null);
  assert.equal(signal.maxPercentGain, null);
});

test("research CLI exits 2 and leaves the file untouched when collection is unavailable", () => {
  const directory = mkdtempSync(join(tmpdir(), "google-trends-cli-retry-"));
  try {
    const path = join(directory, "research.json");
    const original = `${JSON.stringify({
      date: "2026-08-11",
      candidates: [{ keyword: "Dungeon Master Prep" }],
    }, null, 2)}\n`;
    writeFileSync(path, original);
    const env = { ...process.env };
    delete env.GOOGLE_TRENDS_BIGQUERY_PROJECT_ID;
    delete env.GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL;
    delete env.GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY;
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../scripts/collect-google-trends.mjs", import.meta.url)),
      "--research",
      path,
      "--as-of",
      "2026-08-11",
    ], { cwd: directory, env, encoding: "utf8" });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stdout, /"state": "unavailable"/);
    assert.equal(readFileSync(path, "utf8"), original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("research CLI rejects a mismatched as-of date before changing the file", () => {
  const directory = mkdtempSync(join(tmpdir(), "google-trends-cli-date-"));
  try {
    const path = join(directory, "research.json");
    const original = `${JSON.stringify({
      date: "2026-08-11",
      candidates: [{ keyword: "Dungeon Master Prep" }],
    }, null, 2)}\n`;
    writeFileSync(path, original);
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../scripts/collect-google-trends.mjs", import.meta.url)),
      "--research",
      path,
      "--as-of",
      "2026-08-10",
    ], { cwd: directory, env: process.env, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--as-of must match the research document date/);
    assert.equal(readFileSync(path, "utf8"), original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("collector uses bounded parameterized partition queries and emits rising-only observed signals", async () => {
  const { collection, requests } = await observedFixture([
    "  dungeon MASTER prep ",
    "Tavern Encounter Ideas",
    "dnd campaign planner",
  ]);
  assert.equal(collection.state, "observed");
  assert.equal(collection.refreshDate, "2026-08-10");
  assert.equal(collection.week, "2026-08-02");
  assert.equal(collection.coverage.topTermsPerDma, 25);
  assert.equal(collection.coverage.topRisingTermsPerDma, 25);
  assert.equal(collection.coverage.arbitraryQueryCoverage, false);
  assert.equal(collection.coverage.absenceMeansZero, false);
  assert.equal(collection.schemaVersion, 2);
  assert.equal(collection.results.topTerms.rowCount, 2);
  assert.equal(collection.results.topRisingTerms.rowCount, 1);
  assert.equal(collection.query.topTermsSqlDigest,
    GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST);
  assert.equal(collection.query.topRisingTermsSqlDigest,
    GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST);
  assert.equal(Object.hasOwn(collection, "rows"), false);
  assert.equal(collection.attestation.algorithm, "RSA-SHA256");
  assert.equal(collection.attestation.clientEmail,
    configuredEnv.GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL);
  assert.ok(collection.discoveryLeads.some((lead) =>
    lead.normalizedTerm === "dungeon master prep" &&
    lead.listType === "rising" &&
    lead.googleTrendsGateEligibleOnExactCandidateMatch === true));
  assert.ok(Buffer.byteLength(JSON.stringify(collection), "utf8") < 256 * 1024);
  assert.equal(
    computeTrendCollectionDigest(collection),
    collection.snapshotDigest,
  );
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.match(request.url, /bigquery\.googleapis\.com\/bigquery\/v2\/projects\/seo-trends-fixture\/queries$/);
    assert.equal(request.init.headers.authorization, "Bearer fixture-access-token");
    assert.equal(request.body.useLegacySql, false);
    assert.equal(request.body.location, "US");
    assert.equal(
      request.body.maximumBytesBilled,
      googleTrendsQueryContract.maximumBytesBilled,
    );
    assert.equal(
      request.body.timeoutMs,
      googleTrendsQueryContract.queryTimeoutMs,
    );
    assert.equal(request.body.parameterMode, "NAMED");
    assert.deepEqual(request.body.queryParameters, [{
      name: "as_of_date",
      parameterType: { type: "DATE" },
      parameterValue: { value: "2026-08-11" },
    }]);
    assert.match(
      request.body.query,
      /refresh_date = DATE_SUB\(@as_of_date, INTERVAL 1 DAY\)/,
    );
  }

  const signals = trendSignalsFromCollection(collection, [
    "  dungeon MASTER prep ",
    "Tavern Encounter Ideas",
    "dnd campaign planner",
  ]);
  assert.equal(signals[0].schemaVersion, 2);
  assert.equal(signals[0].state, "observed");
  assert.equal(signals[0].direction, "rising");
  assert.equal(signals[0].relativeInterest, null);
  assert.equal(signals[0].period, "week starting 2026-08-02");
  assert.equal(signals[0].bestRank, 4);
  assert.equal(signals[0].maxPercentGain, 740);
  assert.equal(signals[0].dmaCount, 18);
  assert.equal(
    signals[0].sourceTable,
    GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
  );
  assert.equal(signals[0].snapshotDigest, collection.snapshotDigest);

  assert.equal(signals[1].state, "not_observed");
  assert.equal(signals[1].direction, "unknown");
  assert.equal(signals[1].relativeInterest, null);
  assert.equal(signals[1].bestRank, null);
  assert.match(signals[1].detail, /not zero search interest/);

  assert.equal(signals[2].state, "not_observed");
  assert.equal(signals[2].relativeInterest, null);
  assert.match(signals[2].detail, /not zero search interest/);
  assert.equal(
    Object.hasOwn(signals[0], "maxDmaScore"),
    false,
  );
  assert.doesNotThrow(() => validateGoogleTrendsEvidence({
    trendSignals: signals,
    trendCollection: collection,
    candidateKeywords: [
      "  dungeon MASTER prep ",
      "Tavern Encounter Ideas",
      "dnd campaign planner",
    ],
    reportDate: "2026-08-11",
    attestationVerificationKey: fixturePrivateKey,
    expectedAttestationClientEmail:
      configuredEnv.GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL,
    requireVerifiedAttestation: true,
  }));
});

test("an incomplete official partition is unavailable, not a list of zero-interest terms", async () => {
  const collection = await collectGoogleTrendsBigQuery({
    candidates: ["dungeon master prep"],
    now: new Date("2026-08-11T04:00:00.000Z"),
    env: configuredEnv,
    getAccessToken: async () => "fixture-token",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      return body.query.includes("top_rising_terms")
        ? queryResponse("rising", [])
        : queryResponse("top", [{
          term: "Dungeon Master Prep",
          bestRank: 2,
          metric: 96,
          dmaCount: 31,
        }]);
    },
  });
  const [signal] = trendSignalsFromCollection(
    collection,
    ["dungeon master prep"],
  );
  assert.equal(collection.state, "unavailable");
  assert.match(collection.detail, /incomplete Top 25 coverage/);
  assert.equal(signal.state, "unavailable");
  assert.equal(signal.relativeInterest, null);
});

test("the maximum candidate batch stays below the compact 256 KiB artifact limit", async () => {
  const candidates = Array.from({ length: 100 }, (_, index) =>
    `distinct d&d candidate ${index + 1}`);
  const { collection } = await observedFixture(candidates);
  assert.equal(collection.exactCandidateMatches.length, 100);
  assert.ok(Buffer.byteLength(JSON.stringify(collection), "utf8") < 256 * 1024);
  assert.equal(Object.hasOwn(collection, "rows"), false);
});

test("research enrichment is atomic and refuses to replace prior trend fields", async () => {
  const directory = mkdtempSync(join(tmpdir(), "google-trends-research-"));
  try {
    const path = join(directory, "research.json");
    writeFileSync(path, `${JSON.stringify({
      date: "2026-08-11",
      candidates: [
        { keyword: "Dungeon Master Prep" },
        { keyword: "Tavern Encounter Ideas" },
      ],
    }, null, 2)}\n`);
    const original = readFileSync(path, "utf8");
    const unavailable = await collectGoogleTrendsBigQuery({
      candidates: ["Dungeon Master Prep", "Tavern Encounter Ideas"],
      now: new Date("2026-08-11T04:00:00.000Z"),
      env: {},
    });
    assert.throws(
      () => atomicEnrichResearchFile(path, unavailable),
      /Refusing to persist an unavailable Google Trends collection/,
    );
    assert.equal(readFileSync(path, "utf8"), original);

    const { collection } = await observedFixture([
      "Dungeon Master Prep",
      "Tavern Encounter Ideas",
    ]);
    const result = atomicEnrichResearchFile(path, collection);
    assert.equal(result.absolutePath, path);
    const enriched = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(enriched.trendCollection.state, "observed");
    assert.equal(enriched.trendSignals.length, 2);
    assert.equal(enriched.trendSignals[0].state, "observed");
    assert.throws(
      () => atomicEnrichResearchFile(path, collection),
      /Refusing to overwrite existing trendCollection or trendSignals/,
    );
    const afterRefusal = JSON.parse(readFileSync(path, "utf8"));
    assert.deepEqual(afterRefusal, enriched);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("signal generation rejects a tampered snapshot digest", async () => {
  const { collection } = await observedFixture(["Dungeon Master Prep"]);
  const tampered = structuredClone(collection);
  tampered.exactCandidateMatches[0].risingTerm.bestRank = 1;
  assert.throws(
    () => trendSignalsFromCollection(tampered, ["Dungeon Master Prep"]),
    /digest is invalid/,
  );
});
