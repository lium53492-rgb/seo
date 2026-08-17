import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  acquireDailyLease,
  acquireDailyReleaseRecoveryLease,
  assertDailyLease,
  completeDailyLease,
  completeDailyNoPublish,
  coordinationOwner,
  heartbeatDailyLease,
  inspectDailyCarryover,
  prepareDailyRelease,
  readDailyLease,
  rebaseDailyRelease,
  restoreDailyCheckpoint,
  saveDailyCheckpoint,
  startDailyRelease,
  supersedeDailyRelease,
  withDailyPublicationGuard,
} from "../scripts/lib/daily-coordination.mjs";
import {
  GOOGLE_TRENDS_BIGQUERY_SOURCE_URL,
  GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
  GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
  GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST,
  attestGoogleTrendsCollection,
} from "../lib/seo/google-trends-contract.mjs";

const sandbox = mkdtempSync(join(tmpdir(), "lorelens-daily-coordination-"));
const trendsTestClientEmail =
  "trends-reader@seo-trends-fixture.iam.gserviceaccount.com";
const { privateKey: trendsTestPrivateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
process.env.GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL = trendsTestClientEmail;
process.env.GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY = trendsTestPrivateKey;
after(() => rmSync(sandbox, { recursive: true, force: true }));

function roots(name) {
  const coordinationRoot = join(sandbox, name, "git-common");
  const worktreeA = join(sandbox, name, "worktree-a");
  const worktreeB = join(sandbox, name, "worktree-b");
  mkdirSync(coordinationRoot, { recursive: true });
  mkdirSync(worktreeA, { recursive: true });
  mkdirSync(worktreeB, { recursive: true });
  return { coordinationRoot, worktreeA, worktreeB };
}

function releaseProof(date, revision, slug) {
  return {
    schemaVersion: 1,
    revision,
    slug,
    observedOriginMainTip: "f".repeat(40),
    baseRevision: "f".repeat(40),
    authorizedReleaseRevision: revision,
    basePageTreeOid: "e".repeat(40),
    pageChanges: [`data/pages/${slug}.json`],
    changedPaths: [
      `data/growth/${date}.json`,
      `data/research/${date}.json`,
      `data/reports/${date}.json`,
      `data/reviews/${date}.json`,
      `data/pages/${slug}.json`,
      `output/pdf/seo-daily-${date}.pdf`,
    ],
    artifactBlobs: Object.fromEntries([
      `data/growth/${date}.json`,
      `data/research/${date}.json`,
      `data/reports/${date}.json`,
      `data/reviews/${date}.json`,
      `data/pages/${slug}.json`,
      `output/pdf/seo-daily-${date}.pdf`,
    ].map((path, index) => [path, String(index + 1).repeat(40)])),
    pageTreeOid: "e".repeat(40),
    singleDailyPageVerified: true,
    verifiedAt: "2026-08-06T12:59:00.000Z",
  };
}

function liveVerification(revision, slug, verifiedAt, productionDate) {
  const origin = "https://lorelens.playworlds.ai";
  return {
    origin,
    revision,
    slug,
    verifiedAt,
    productionDate,
    originMainVerified: true,
    originMainTip: revision,
    detail: JSON.stringify({
      status: "verified",
      origin,
      revision,
      slug,
      verificationPasses: 2,
    }),
  };
}

function prepareAndStartRelease(options) {
  prepareDailyRelease(options);
  return startDailyRelease(options);
}

function writeNoPublishGrowth(worktreeRoot, date, generatedAt) {
  const path = join(worktreeRoot, "data", "growth", `${date}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({
    schemaVersion: 2,
    generatedAt,
    summary: {
      publishedPages: 9,
      collectedPages: 0,
      unavailablePages: 9,
      attributionJoinReady: false,
    },
    entries: Array.from({ length: 9 }, (_, index) => ({
      sourceSlug: `page-${index + 1}`,
      state: "unavailable",
    })),
  }, null, 2)}\n`);
}

function writeNoPublishTrendMiss(worktreeRoot, date) {
  const keyword = "d&d campaign prep";
  let trendCollection = {
    schemaVersion: 2,
    provider: "google_trends_bigquery_public_dataset",
    state: "observed",
    collectedAt: `${date}T09:05:00+08:00`,
    sourceUrl: GOOGLE_TRENDS_BIGQUERY_SOURCE_URL,
    geo: "US",
    coverage: {
      label: "Top 25 and Top 25 Rising Google Trends terms by US DMA",
      topTermsPerDma: 25,
      topRisingTermsPerDma: 25,
      arbitraryQueryCoverage: false,
      absenceMeansZero: false,
    },
    query: {
      location: "US",
      useLegacySql: false,
      maximumBytesBilled: "104857600",
      timeoutMs: 15000,
      asOfDate: date,
      refreshDateRule: "as_of_date_minus_1_day",
      topTermsSqlDigest: GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST,
      topRisingTermsSqlDigest: GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
    },
    refreshDate: "2099-01-09",
    week: "2099-01-04",
    results: {
      topTerms: { rowCount: 1, resultDigest: "c".repeat(64) },
      topRisingTerms: { rowCount: 1, resultDigest: "d".repeat(64) },
    },
    exactCandidateMatches: [{
      keyword,
      normalizedKeyword: keyword,
      topTerm: null,
      risingTerm: null,
    }],
    discoveryLeads: [],
    detail: "Official collection succeeded without an exact rising candidate match.",
    snapshotDigest: "",
    attestation: null,
  };
  trendCollection = attestGoogleTrendsCollection(trendCollection, {
    privateKey: trendsTestPrivateKey,
    clientEmail: trendsTestClientEmail,
  });
  const trendSignals = [{
    schemaVersion: 2,
    keyword,
    source: "google_trends",
    collectionMethod: "bigquery_public_dataset",
    sourceUrl: GOOGLE_TRENDS_BIGQUERY_SOURCE_URL,
    sourceTable: GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
    state: "not_observed",
    relativeInterest: null,
    direction: "unknown",
    geo: "US",
    period: "week starting 2099-01-04",
    collectedAt: trendCollection.collectedAt,
    detail: "The exact term did not appear in Rising 25; this does not mean zero demand.",
    refreshDate: trendCollection.refreshDate,
    week: trendCollection.week,
    bestRank: null,
    maxPercentGain: null,
    dmaCount: null,
    snapshotDigest: trendCollection.snapshotDigest,
  }];
  const path = join(worktreeRoot, "data", "research", `${date}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({
    date,
    candidates: [{ keyword }],
    trendCollection,
    trendSignals,
  }, null, 2)}\n`);
}

const canonicalDailyPagePath = "data/pages/ai-roleplay-first-message.json";
const canonicalDailyPage = {
  schemaVersion: 2,
  slug: "ai-roleplay-first-message",
  status: "published",
  publishedAt: "2026-08-06T02:50:30.000Z",
  generatedFromReport: "seo-2026-08-06",
  draftDigest: "f3beb13d8847ea9c2a3fa912da477ca99e01937101198f42d6489dbdba0c9770",
  editorialReview: {
    reportId: "seo-2026-08-06",
    draftDigest: "f3beb13d8847ea9c2a3fa912da477ca99e01937101198f42d6489dbdba0c9770",
    decision: "approved",
  },
};

function copyDailyCoordinationFixture(worktreeRoot, relativePath) {
  const destination = join(worktreeRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  if (relativePath === canonicalDailyPagePath) {
    writeFileSync(destination, `${JSON.stringify(canonicalDailyPage, null, 2)}\n`);
    return;
  }
  copyFileSync(join(process.cwd(), relativePath), destination);
}

test("a stale daily lease is taken over while a fresh lease blocks a second worktree", () => {
  const date = "2099-01-01";
  const { coordinationRoot, worktreeA, worktreeB } = roots("lease");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  const concurrentOwner = coordinationOwner(worktreeA, "concurrent-run");
  assert.throws(() => coordinationOwner(worktreeA), /stable per-run identifier/);
  assert.notEqual(ownerA, concurrentOwner);
  const acquired = acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerA,
    now: new Date("2099-01-01T01:00:00.000Z"),
    staleAfterMinutes: 60,
  });
  assert.equal(acquired.outcome, "acquired");
  assert.equal(acquireDailyLease({
    coordinationRoot,
    date,
    owner: concurrentOwner,
    now: new Date("2099-01-01T01:15:00.000Z"),
    staleAfterMinutes: 60,
  }).outcome, "busy");
  assert.equal(acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: new Date("2099-01-01T01:30:00.000Z"),
    staleAfterMinutes: 60,
  }).outcome, "busy");
  assert.equal(acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: new Date("2099-01-01T02:01:00.000Z"),
    staleAfterMinutes: 60,
  }).outcome, "acquired");
  assert.throws(() => assertDailyLease({ coordinationRoot, date, owner: ownerA }), /does not own/);
  assert.throws(
    () => saveDailyCheckpoint({ coordinationRoot, worktreeRoot: worktreeA, date, owner: ownerA }),
    /does not own/,
  );
  assert.equal(assertDailyLease({ coordinationRoot, date, owner: ownerB }).owner, ownerB);
});

test("a durable no-publish receipt ends same-day recovery without claiming a publication", () => {
  const date = "2099-01-10";
  const nextDate = "2099-01-11";
  const now = new Date("2099-01-10T01:00:00.000Z");
  const { coordinationRoot, worktreeA, worktreeB } = roots("no-publish");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  acquireDailyLease({ coordinationRoot, date, owner: ownerA, now, staleAfterMinutes: 60 });

  const completion = () => completeDailyNoPublish({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    reasonCode: "growth_unavailable",
    reason: "The protected growth endpoint remained unavailable after the configured retries.",
    now,
  });
  assert.throws(completion, /same-day growth snapshot/);
  writeNoPublishGrowth(worktreeA, date, "2099-01-10T00:55:00.000Z");
  assert.throws(() => completeDailyNoPublish({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    reasonCode: "trends_below_threshold",
    reason: "The observed Google Trends signals remained below the configured release threshold.",
    now,
  }), /requires observed but non-qualifying/);

  const completed = completion();
  assert.equal(completed.status, "completed_no_publish");
  assert.equal(completed.noPublishReceipt.outcome, "no_publish");
  assert.equal(completed.noPublishReceipt.evidenceSummary.growth.unavailablePages, 9);
  assert.equal(completed.noPublishReceipt.artifactDigests[0].path, `data/growth/${date}.json`);
  assert.equal("publishedSlug" in completed.noPublishReceipt, false);
  assert.equal("releaseRevision" in completed.noPublishReceipt, false);
  assert.equal("liveVerification" in completed.noPublishReceipt, false);
  assert.equal(inspectDailyCarryover({ coordinationRoot, date, owner: ownerB, now }).state, "no_publish");
  assert.equal(acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: new Date("2099-01-10T02:00:00.000Z"),
    staleAfterMinutes: 60,
  }).outcome, "no_publish");
  assert.equal(inspectDailyCarryover({
    coordinationRoot,
    date: nextDate,
    owner: ownerB,
    now: new Date("2099-01-11T01:00:00.000Z"),
  }).state, "none");
  assert.throws(() => assertDailyLease({ coordinationRoot, date, owner: ownerA }), /does not own/);
});

test("an exact BigQuery Rising miss closes the day as not observed without claiming zero demand", () => {
  const date = "2099-01-10";
  const now = new Date("2099-01-10T01:00:00.000Z");
  const { coordinationRoot, worktreeA } = roots("no-publish-trends-not-observed");
  const owner = coordinationOwner(worktreeA, "run-a");
  acquireDailyLease({ coordinationRoot, date, owner, now, staleAfterMinutes: 60 });
  writeNoPublishGrowth(worktreeA, date, "2099-01-10T00:55:00.000Z");
  writeNoPublishTrendMiss(worktreeA, date);
  const completed = completeDailyNoPublish({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner,
    reasonCode: "trends_not_observed",
    reason: "The official collection succeeded, but no exact candidate entered the US Rising 25 feed.",
    now,
  });
  assert.equal(completed.status, "completed_no_publish");
  assert.equal(completed.noPublishReceipt.evidenceSummary.trends.providerState, "observed");
  assert.equal(completed.noPublishReceipt.evidenceSummary.trends.notObserved, 1);
  assert.equal(completed.noPublishReceipt.evidenceSummary.trends.qualifying, 0);
});

test("no-publish completion refuses to hide a page already published that day", () => {
  const date = "2099-01-12";
  const now = new Date("2099-01-12T01:00:00.000Z");
  const { coordinationRoot, worktreeA } = roots("no-publish-page-conflict");
  const owner = coordinationOwner(worktreeA, "run-a");
  acquireDailyLease({ coordinationRoot, date, owner, now, staleAfterMinutes: 60 });
  writeNoPublishGrowth(worktreeA, date, "2099-01-12T00:55:00.000Z");
  const pagesDirectory = join(worktreeA, "data", "pages");
  mkdirSync(pagesDirectory, { recursive: true });
  writeFileSync(join(pagesDirectory, "already-published.json"), `${JSON.stringify({
    slug: "already-published",
    status: "published",
    publishedAt: "2099-01-12T00:58:00.000Z",
  }, null, 2)}\n`);
  assert.throws(() => completeDailyNoPublish({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner,
    reasonCode: "visual_quality_failed",
    reason: "The rendered page failed the required desktop and mobile visual review.",
    now,
  }), /cannot coexist with a page published/);
  assert.equal(readDailyLease({ coordinationRoot, date }).status, "active");
});

test("stale crash remnants cannot permanently block coordination", () => {
  const date = "2099-01-03";
  const { coordinationRoot, worktreeA } = roots("crash-remnants");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const stateDirectory = join(coordinationRoot, "codex-daily-seo", date);
  mkdirSync(stateDirectory, { recursive: true });
  const operationLock = join(stateDirectory, "operation.lock");
  writeFileSync(operationLock, "");
  utimesSync(operationLock, new Date("2099-01-03T00:00:00.000Z"), new Date("2099-01-03T00:00:00.000Z"));
  const takeoverLock = join(stateDirectory, "operation.takeover.lock");
  writeFileSync(takeoverLock, "");
  utimesSync(takeoverLock, new Date("2099-01-03T00:00:00.000Z"), new Date("2099-01-03T00:00:00.000Z"));
  const leaseFile = join(stateDirectory, "lease.json");
  writeFileSync(leaseFile, "");
  utimesSync(leaseFile, new Date("2099-01-03T00:00:00.000Z"), new Date("2099-01-03T00:00:00.000Z"));
  const acquired = acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerA,
    now: new Date("2099-01-03T02:00:00.000Z"),
    staleAfterMinutes: 60,
  });
  assert.equal(acquired.outcome, "acquired");
  assert.equal(acquired.lease.owner, ownerA);
});

test("a takeover worktree restores the latest atomic checkpoint without overwriting differences", () => {
  const date = "2099-01-02";
  const { coordinationRoot, worktreeA, worktreeB } = roots("checkpoint");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerA,
    now: new Date("2099-01-02T01:00:00.000Z"),
    staleAfterMinutes: 60,
  });
  const growthPathA = join(worktreeA, "data", "growth", `${date}.json`);
  mkdirSync(join(worktreeA, "data", "growth"), { recursive: true });
  writeFileSync(growthPathA, '{"generatedAt":"2099-01-02T01:01:00.000Z"}\n');
  const manifest = saveDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    now: new Date("2099-01-02T01:05:00.000Z"),
  });
  assert.equal(manifest.state.resumeAt, "research");
  acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: new Date("2099-01-02T02:06:00.000Z"),
    staleAfterMinutes: 60,
  });
  const restored = restoreDailyCheckpoint({ coordinationRoot, worktreeRoot: worktreeB, date, owner: ownerB });
  assert.deepEqual(restored.restored, [`data/growth/${date}.json`]);
  const growthPathB = join(worktreeB, "data", "growth", `${date}.json`);
  assert.equal(readFileSync(growthPathB, "utf8"), readFileSync(growthPathA, "utf8"));
  const originalLease = readDailyLease({ coordinationRoot, date });
  const leasePath = join(
    coordinationRoot,
    "codex-daily-seo",
    date,
    "lease-states",
    `${String(originalLease.stateSequence).padStart(12, "0")}-${originalLease.stateId}.json`,
  );
  writeFileSync(leasePath, `${JSON.stringify({ ...originalLease, checkpointRevision: "../../../outside" }, null, 2)}\n`);
  assert.throws(
    () => restoreDailyCheckpoint({ coordinationRoot, worktreeRoot: worktreeB, date, owner: ownerB }),
    /lease pointer is invalid/,
  );
  writeFileSync(leasePath, `${JSON.stringify(originalLease, null, 2)}\n`);
  writeFileSync(growthPathB, "{}\n");
  assert.throws(
    () => restoreDailyCheckpoint({ coordinationRoot, worktreeRoot: worktreeB, date, owner: ownerB }),
    /would overwrite a different artifact/,
  );
});

test("checkpoint handoff preserves report-bound feedback consumption", () => {
  const date = "2026-08-05";
  const { coordinationRoot, worktreeA, worktreeB } = roots("feedback");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  const feedbackMessage = "Keep this exact editorial direction in the next page.";
  const feedbackId = "feedback-checkpoint-fixture";
  const writeJson = (root, relativePath, value) => {
    const destination = join(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`);
  };
  acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerA,
    now: new Date("2026-08-05T01:00:00.000Z"),
    staleAfterMinutes: 60,
  });
  writeJson(worktreeA, `data/growth/${date}.json`, { generatedAt: "2026-08-05T01:01:00.000Z" });
  writeJson(worktreeA, `data/research/${date}.json`, { date });
  writeJson(worktreeA, `data/reports/${date}.json`, {
    id: `seo-${date}`,
    date,
    generatedAt: "2026-08-05T01:05:00.000Z",
    publication: { status: "not_requested" },
    feedbackDecisions: [{ id: feedbackId, message: feedbackMessage, decision: "adopted" }],
  });
  writeJson(worktreeA, `data/seo-feedback/inbox/${date}.json`, {
    date,
    entries: [{ id: feedbackId, message: feedbackMessage, consumedAt: "2026-08-05T01:06:00.000Z" }],
  });
  saveDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    now: new Date("2026-08-05T01:10:00.000Z"),
  });
  acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: new Date("2026-08-05T02:11:00.000Z"),
    staleAfterMinutes: 60,
  });
  writeJson(worktreeB, `data/seo-feedback/inbox/${date}.json`, {
    date,
    entries: [{ id: feedbackId, message: feedbackMessage }],
  });
  const restored = restoreDailyCheckpoint({ coordinationRoot, worktreeRoot: worktreeB, date, owner: ownerB });
  assert.ok(restored.restored.some((item) => item.endsWith(`#${feedbackId}`)));
  assert.deepEqual(restored.feedbackPaths, [`data/seo-feedback/inbox/${date}.json`]);
  const restoredInbox = JSON.parse(readFileSync(join(worktreeB, `data/seo-feedback/inbox/${date}.json`), "utf8"));
  assert.equal(restoredInbox.entries[0].consumedAt, "2026-08-05T01:06:00.000Z");
});

test("lease heartbeats use immutable append-only states and enforce the Shanghai cutoff", () => {
  const date = "2099-01-04";
  const { coordinationRoot, worktreeA } = roots("immutable-heartbeats");
  const owner = coordinationOwner(worktreeA, "heartbeat-run");
  acquireDailyLease({
    coordinationRoot,
    date,
    owner,
    now: new Date("2099-01-04T01:00:00.000Z"),
    staleAfterMinutes: 60,
  });
  for (let index = 1; index <= 120; index += 1) {
    heartbeatDailyLease({
      coordinationRoot,
      date,
      owner,
      now: new Date(Date.parse("2099-01-04T01:00:00.000Z") + index * 1_000),
    });
  }
  const stateDirectory = join(coordinationRoot, "codex-daily-seo", date, "lease-states");
  assert.equal(readdirSync(stateDirectory).filter((name) => name.endsWith(".json")).length, 121);
  assert.equal(readDailyLease({ coordinationRoot, date }).stateSequence, 121);
  assert.throws(() => heartbeatDailyLease({
    coordinationRoot,
    date,
    owner,
    now: new Date("2099-01-04T15:45:00.000Z"),
  }), /publishing window closed at 23:45/);
});

test("the publication guard is exclusive and clears its reservation", () => {
  const date = "2099-01-05";
  const { coordinationRoot, worktreeA } = roots("publication-guard");
  const owner = coordinationOwner(worktreeA, "publisher-run");
  const now = new Date("2099-01-05T02:00:00.000Z");
  acquireDailyLease({ coordinationRoot, date, owner, now, staleAfterMinutes: 60 });
  const value = withDailyPublicationGuard({
    coordinationRoot,
    date,
    owner,
    slug: "one-safe-page",
    reportId: "seo-2099-01-05",
    now,
  }, () => {
    assert.throws(() => withDailyPublicationGuard({
      coordinationRoot,
      date,
      owner,
      slug: "second-page",
      reportId: "seo-2099-01-05-b",
      now,
    }, () => null), (error) => error?.code === "SEO_COORDINATION_BUSY");
    return "published";
  });
  assert.equal(value, "published");
  assert.equal(readDailyLease({ coordinationRoot, date }).publicationReservation, undefined);
});

test("restore validates the complete checkpoint before writing any missing artifact", () => {
  const date = "2099-01-06";
  const { coordinationRoot, worktreeA, worktreeB } = roots("restore-preflight");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  const writeArtifact = (root, relativePath, value) => {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value)}\n`);
  };
  acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerA,
    now: new Date("2099-01-06T01:00:00.000Z"),
    staleAfterMinutes: 60,
  });
  writeArtifact(worktreeA, `data/growth/${date}.json`, { generatedAt: "2099-01-06T01:01:00.000Z" });
  writeArtifact(worktreeA, `data/research/${date}.json`, { date });
  saveDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    now: new Date("2099-01-06T01:05:00.000Z"),
  });
  acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: new Date("2099-01-06T02:06:00.000Z"),
    staleAfterMinutes: 60,
  });
  writeArtifact(worktreeB, `data/research/${date}.json`, { date, conflict: true });
  assert.throws(() => restoreDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeB,
    date,
    owner: ownerB,
  }), /would overwrite a different artifact/);
  assert.equal(existsSync(join(worktreeB, `data/growth/${date}.json`)), false);
});

test("restore refuses an intermediate symlink or junction outside the worktree", () => {
  const date = "2099-01-07";
  const { coordinationRoot, worktreeA, worktreeB } = roots("restore-reparse");
  const outside = join(sandbox, "restore-reparse-outside");
  mkdirSync(outside, { recursive: true });
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerA,
    now: new Date("2099-01-07T01:00:00.000Z"),
    staleAfterMinutes: 60,
  });
  const source = join(worktreeA, "data", "growth", `${date}.json`);
  mkdirSync(dirname(source), { recursive: true });
  writeFileSync(source, '{"generatedAt":"2099-01-07T01:01:00.000Z"}\n');
  saveDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    now: new Date("2099-01-07T01:05:00.000Z"),
  });
  acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: new Date("2099-01-07T02:06:00.000Z"),
    staleAfterMinutes: 60,
  });
  symlinkSync(outside, join(worktreeB, "data"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => restoreDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeB,
    date,
    owner: ownerB,
  }), /reparse point/);
  assert.equal(existsSync(join(outside, "growth", `${date}.json`)), false);
});

test("completion requires a complete matching local chain and LoreLens receipt", () => {
  const date = "2026-08-06";
  const { coordinationRoot, worktreeA, worktreeB } = roots("complete");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  const completionNow = new Date("2026-08-06T13:00:00.000Z");
  acquireDailyLease({ coordinationRoot, date, owner: ownerA, staleAfterMinutes: 60, now: completionNow });
  for (const relativePath of [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    "data/pages/ai-roleplay-first-message.json",
    `output/pdf/seo-daily-${date}.pdf`,
  ]) {
    copyDailyCoordinationFixture(worktreeA, relativePath);
  }
  const revision = "a".repeat(40);
  const verification = {
    ...liveVerification(
      revision,
      "ai-roleplay-first-message",
      "2026-08-06T13:00:00.000Z",
      date,
    ),
  };
  prepareAndStartRelease({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    revision,
    slug: "ai-roleplay-first-message",
    releaseProof: releaseProof(date, revision, "ai-roleplay-first-message"),
    now: completionNow,
  });
  assert.throws(() => completeDailyLease({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    revision,
    slug: "wrong-slug",
    verification: liveVerification(revision, "wrong-slug", verification.verifiedAt, date),
    now: completionNow,
  }), /release-in-flight marker/);
  const completed = completeDailyLease({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    revision,
    slug: "ai-roleplay-first-message",
    verification,
    now: completionNow,
  });
  assert.equal(completed.status, "completed");
  assert.equal(acquireDailyLease({
    coordinationRoot,
    date,
    owner: ownerB,
    staleAfterMinutes: 60,
    now: completionNow,
  }).outcome, "completed");
});

test("a release verified after midnight occupies the carryover production day", () => {
  const date = "2026-08-06";
  const nextDate = "2026-08-07";
  const { coordinationRoot, worktreeA, worktreeB } = roots("cross-day-release");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  const beforeCutoff = new Date("2026-08-06T15:44:00.000Z");
  acquireDailyLease({ coordinationRoot, date, owner: ownerA, staleAfterMinutes: 60, now: beforeCutoff });
  for (const relativePath of [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    "data/pages/ai-roleplay-first-message.json",
    `output/pdf/seo-daily-${date}.pdf`,
  ]) {
    copyDailyCoordinationFixture(worktreeA, relativePath);
  }
  const revision = "b".repeat(40);
  prepareAndStartRelease({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    revision,
    slug: "ai-roleplay-first-message",
    releaseProof: releaseProof(date, revision, "ai-roleplay-first-message"),
    now: beforeCutoff,
  });
  const afterMidnight = new Date("2026-08-06T16:02:00.000Z");
  heartbeatDailyLease({ coordinationRoot, date, owner: ownerA, now: afterMidnight });
  const completed = completeDailyLease({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    revision,
    slug: "ai-roleplay-first-message",
    verification: liveVerification(
      revision,
      "ai-roleplay-first-message",
      afterMidnight.toISOString(),
      nextDate,
    ),
    now: afterMidnight,
  });
  assert.equal(completed.liveVerification.productionDate, nextDate);
  assert.equal(inspectDailyCarryover({ coordinationRoot, date: nextDate, now: afterMidnight }).state, "occupied");
  const nextDayAcquire = acquireDailyLease({
    coordinationRoot,
    date: nextDate,
    owner: ownerB,
    staleAfterMinutes: 60,
    now: afterMidnight,
  });
  assert.equal(nextDayAcquire.outcome, "completed");
  assert.equal(nextDayAcquire.carryover.state, "occupied");
});

test("an unresolved multi-day release stays fenced and the recovery owner can retry immediately", () => {
  const date = "2026-08-06";
  const currentDate = "2026-08-08";
  const { coordinationRoot, worktreeA, worktreeB } = roots("cross-day-recovery");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  const startedAt = new Date("2026-08-06T13:00:00.000Z");
  acquireDailyLease({ coordinationRoot, date, owner: ownerA, staleAfterMinutes: 60, now: startedAt });
  for (const relativePath of [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    "data/pages/ai-roleplay-first-message.json",
    `output/pdf/seo-daily-${date}.pdf`,
  ]) {
    copyDailyCoordinationFixture(worktreeA, relativePath);
  }
  prepareAndStartRelease({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    revision: "c".repeat(40),
    slug: "ai-roleplay-first-message",
    releaseProof: releaseProof(date, "c".repeat(40), "ai-roleplay-first-message"),
    now: startedAt,
  });
  const recoveryNow = new Date("2026-08-08T02:00:00.000Z");
  const carryover = inspectDailyCarryover({
    coordinationRoot,
    date: currentDate,
    now: recoveryNow,
    staleAfterMinutes: 60,
  });
  assert.equal(carryover.state, "recoverable");
  assert.equal(acquireDailyLease({
    coordinationRoot,
    date: currentDate,
    owner: ownerB,
    now: recoveryNow,
    staleAfterMinutes: 60,
  }).outcome, "busy");
  const recovered = acquireDailyReleaseRecoveryLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: recoveryNow,
    staleAfterMinutes: 60,
  });
  assert.equal(recovered.outcome, "acquired");
  assert.equal(recovered.lease.owner, ownerB);
  assert.equal(recovered.lease.generation, 2);
  assert.equal(recovered.lease.releaseInFlight.revision, "c".repeat(40));
  const retryNow = new Date("2026-08-08T02:00:01.000Z");
  assert.equal(inspectDailyCarryover({
    coordinationRoot,
    date: currentDate,
    owner: ownerB,
    now: retryNow,
    staleAfterMinutes: 60,
  }).state, "recoverable");
  const retried = acquireDailyReleaseRecoveryLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: retryNow,
    staleAfterMinutes: 60,
  });
  assert.equal(retried.outcome, "acquired");
  assert.equal(retried.lease.leaseId, recovered.lease.leaseId);
  assert.equal(retried.lease.generation, recovered.lease.generation);
  assert.ok(retried.lease.stateSequence > recovered.lease.stateSequence);
});

test("a complete checkpoint before pinning is recovered instead of being skipped on the next day", () => {
  const date = "2026-08-06";
  const currentDate = "2026-08-08";
  const slug = "ai-roleplay-first-message";
  const { coordinationRoot, worktreeA, worktreeB } = roots("cross-day-checkpoint-ready");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  const startedAt = new Date("2026-08-06T13:00:00.000Z");
  acquireDailyLease({ coordinationRoot, date, owner: ownerA, staleAfterMinutes: 60, now: startedAt });
  for (const relativePath of [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ]) {
    copyDailyCoordinationFixture(worktreeA, relativePath);
  }
  const checkpoint = saveDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    now: startedAt,
  });
  assert.equal(checkpoint.state.state, "local_publication_complete");

  const recoveryNow = new Date("2026-08-08T02:00:00.000Z");
  const carryover = inspectDailyCarryover({
    coordinationRoot,
    date: currentDate,
    owner: ownerB,
    now: recoveryNow,
    staleAfterMinutes: 60,
  });
  assert.equal(carryover.state, "recoverable");
  assert.equal(carryover.releaseState, "checkpoint_ready");
  assert.equal(carryover.checkpoint.slug, slug);
  const recovered = acquireDailyReleaseRecoveryLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: recoveryNow,
    staleAfterMinutes: 60,
  });
  assert.equal(recovered.outcome, "acquired");
  const restored = restoreDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeB,
    date,
    owner: ownerB,
  });
  assert.equal(restored.state.state, "local_publication_complete");
  assert.equal(restored.restored.includes(`data/pages/${slug}.json`), true);
});

test("a complete checkpoint cannot be saved after the Shanghai cutoff or poison future scans", () => {
  const date = "2026-08-06";
  const slug = "ai-roleplay-first-message";
  const { coordinationRoot, worktreeA } = roots("late-checkpoint-rejected");
  const owner = coordinationOwner(worktreeA, "late-checkpoint-run");
  acquireDailyLease({
    coordinationRoot,
    date,
    owner,
    staleAfterMinutes: 60,
    now: new Date("2026-08-06T15:40:00.000Z"),
  });
  for (const relativePath of [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ]) {
    copyDailyCoordinationFixture(worktreeA, relativePath);
  }
  assert.throws(() => saveDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner,
    now: new Date("2026-08-06T15:46:00.000Z"),
  }), /publishing window closed at 23:45/);
  assert.equal(readDailyLease({ coordinationRoot, date }).checkpointRevision, undefined);
  const carryover = inspectDailyCarryover({
    coordinationRoot,
    date,
    owner,
    now: new Date("2026-08-06T15:47:00.000Z"),
    staleAfterMinutes: 60,
  });
  assert.equal(carryover.state, "none");
});

test("a partial checkpoint saved after cutoff is ignored by release carryover scans", () => {
  const date = "2026-08-06";
  const { coordinationRoot, worktreeA } = roots("late-partial-checkpoint");
  const owner = coordinationOwner(worktreeA, "late-partial-run");
  acquireDailyLease({
    coordinationRoot,
    date,
    owner,
    staleAfterMinutes: 60,
    now: new Date("2026-08-06T15:40:00.000Z"),
  });
  const growthPath = join(worktreeA, `data/growth/${date}.json`);
  mkdirSync(dirname(growthPath), { recursive: true });
  writeFileSync(growthPath, `${JSON.stringify({ generatedAt: "2026-08-06T15:46:00.000Z" })}\n`);
  const checkpoint = saveDailyCheckpoint({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner,
    now: new Date("2026-08-06T15:46:00.000Z"),
  });
  assert.notEqual(checkpoint.state.state, "local_publication_complete");
  const carryover = inspectDailyCarryover({
    coordinationRoot,
    date,
    owner,
    now: new Date("2026-08-06T15:47:00.000Z"),
    staleAfterMinutes: 60,
  });
  assert.equal(carryover.state, "none");
});

test("a durable release preparation survives a cross-day crash before pinning", () => {
  const date = "2026-08-06";
  const currentDate = "2026-08-08";
  const slug = "ai-roleplay-first-message";
  const revision = "d".repeat(40);
  const { coordinationRoot, worktreeA, worktreeB } = roots("cross-day-preparation");
  const ownerA = coordinationOwner(worktreeA, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  const startedAt = new Date("2026-08-06T13:00:00.000Z");
  acquireDailyLease({ coordinationRoot, date, owner: ownerA, staleAfterMinutes: 60, now: startedAt });
  for (const relativePath of [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ]) {
    copyDailyCoordinationFixture(worktreeA, relativePath);
  }
  const proof = releaseProof(date, revision, slug);
  const prepared = prepareDailyRelease({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner: ownerA,
    revision,
    slug,
    releaseProof: proof,
    now: startedAt,
  });
  assert.equal(prepared.releasePreparing.revision, revision);
  assert.equal(prepared.releaseInFlight, undefined);

  const recoveryNow = new Date("2026-08-08T02:00:00.000Z");
  const carryover = inspectDailyCarryover({
    coordinationRoot,
    date: currentDate,
    owner: ownerB,
    now: recoveryNow,
    staleAfterMinutes: 60,
  });
  assert.equal(carryover.state, "recoverable");
  assert.equal(carryover.releaseState, "preparing");
  const recovered = acquireDailyReleaseRecoveryLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: recoveryNow,
    staleAfterMinutes: 60,
  });
  assert.equal(recovered.outcome, "acquired");
  assert.equal(recovered.lease.releasePreparing.revision, revision);

  for (const relativePath of [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ]) {
    copyDailyCoordinationFixture(worktreeB, relativePath);
  }
  const promoted = startDailyRelease({
    coordinationRoot,
    worktreeRoot: worktreeB,
    date,
    owner: ownerB,
    revision,
    slug,
    releaseProof: proof,
    now: new Date("2026-08-08T02:00:01.000Z"),
  });
  assert.equal(promoted.releasePreparing, undefined);
  assert.equal(promoted.releaseInFlight.revision, revision);
});

test("an orphaned recovery pin is discovered and promoted after a cross-day crash", () => {
  const date = "2026-08-06";
  const currentDate = "2026-08-08";
  const slug = "ai-roleplay-first-message";
  const repositoryRoot = join(sandbox, "orphan-pin-calendar", "repository");
  const worktreeB = join(sandbox, "orphan-pin-calendar", "recovery-worktree");
  mkdirSync(repositoryRoot, { recursive: true });
  mkdirSync(worktreeB, { recursive: true });
  const runGit = (args) => execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  runGit(["init", "-b", "main"]);
  runGit(["config", "user.email", "seo-tests@example.com"]);
  runGit(["config", "user.name", "SEO Tests"]);
  writeFileSync(join(repositoryRoot, "README.md"), "base\n");
  runGit(["add", "README.md"]);
  runGit(["commit", "-m", "pinned release"]);
  const revision = runGit(["rev-parse", "HEAD"]);
  const coordinationRoot = join(repositoryRoot, ".git");
  const ownerA = coordinationOwner(repositoryRoot, "run-a");
  const ownerB = coordinationOwner(worktreeB, "run-b");
  const startedAt = new Date("2026-08-06T13:00:00.000Z");
  acquireDailyLease({ coordinationRoot, date, owner: ownerA, staleAfterMinutes: 60, now: startedAt });
  runGit(["update-ref", `refs/codex/daily-releases/${date}`, revision]);

  const recoveryNow = new Date("2026-08-08T02:00:00.000Z");
  const carryover = inspectDailyCarryover({
    coordinationRoot,
    date: currentDate,
    owner: ownerB,
    now: recoveryNow,
    staleAfterMinutes: 60,
  });
  assert.equal(carryover.state, "recoverable");
  assert.equal(carryover.releaseState, "orphan_pin");
  assert.equal(carryover.pinnedRevision, revision);
  const recovered = acquireDailyReleaseRecoveryLease({
    coordinationRoot,
    date,
    owner: ownerB,
    now: recoveryNow,
    staleAfterMinutes: 60,
  });
  assert.equal(recovered.outcome, "acquired");
  assert.equal(recovered.lease.acquiredAt, startedAt.toISOString());
  assert.equal(recovered.lease.recoveredAt, recoveryNow.toISOString());

  for (const relativePath of [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ]) {
    copyDailyCoordinationFixture(worktreeB, relativePath);
  }
  const proof = releaseProof(date, revision, slug);
  const prepared = prepareDailyRelease({
    coordinationRoot,
    worktreeRoot: worktreeB,
    date,
    owner: ownerB,
    revision,
    slug,
    releaseProof: proof,
    recoveryPinnedRevision: revision,
    now: new Date("2026-08-08T02:00:01.000Z"),
  });
  assert.equal(prepared.releasePreparing.startedAt, startedAt.toISOString());
  const promoted = startDailyRelease({
    coordinationRoot,
    worktreeRoot: worktreeB,
    date,
    owner: ownerB,
    revision,
    slug,
    releaseProof: proof,
    now: new Date("2026-08-08T02:00:02.000Z"),
  });
  assert.equal(promoted.releaseInFlight.revision, revision);
});

test("release supersession is append-only and requires equivalent artifact and page-tree proof", () => {
  const date = "2026-08-06";
  const slug = "ai-roleplay-first-message";
  const { coordinationRoot, worktreeA } = roots("release-supersession");
  const owner = coordinationOwner(worktreeA, "run-a");
  const now = new Date("2026-08-06T13:00:00.000Z");
  acquireDailyLease({ coordinationRoot, date, owner, staleAfterMinutes: 60, now });
  for (const relativePath of [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ]) {
    copyDailyCoordinationFixture(worktreeA, relativePath);
  }
  const currentRevision = "a".repeat(40);
  const nextRevision = "b".repeat(40);
  const currentProof = releaseProof(date, currentRevision, slug);
  const started = prepareAndStartRelease({
    coordinationRoot,
    worktreeRoot: worktreeA,
    date,
    owner,
    revision: currentRevision,
    slug,
    releaseProof: currentProof,
    now,
  });
  const nextProof = { ...currentProof, revision: nextRevision, observedOriginMainTip: nextRevision };
  assert.throws(() => supersedeDailyRelease({
    coordinationRoot,
    date,
    owner,
    currentRevision,
    nextRevision,
    slug,
    proof: {
      originMainTip: nextRevision,
      descendantVerified: true,
      dailyArtifactsEquivalent: false,
      singleDailyPageVerified: true,
      releaseProof: nextProof,
      verifiedAt: now.toISOString(),
    },
    now,
  }), /descendant, artifact, page-count/);
  const superseded = supersedeDailyRelease({
    coordinationRoot,
    date,
    owner,
    currentRevision,
    nextRevision,
    slug,
    proof: {
      originMainTip: nextRevision,
      descendantVerified: true,
      dailyArtifactsEquivalent: true,
      singleDailyPageVerified: true,
      releaseProof: nextProof,
      verifiedAt: now.toISOString(),
    },
    now,
  });
  assert.equal(superseded.releaseInFlight.revision, nextRevision);
  assert.equal(superseded.releaseInFlight.startedAt, started.releaseInFlight.startedAt);
  assert.equal(superseded.releaseInFlight.supersededFrom[0].revision, currentRevision);
  assert.ok(superseded.stateSequence > started.stateSequence);

  const rebasedRevision = "c".repeat(40);
  const rebasedBase = "d".repeat(40);
  const rebasedProof = {
    ...nextProof,
    revision: rebasedRevision,
    observedOriginMainTip: rebasedBase,
    baseRevision: rebasedBase,
    authorizedReleaseRevision: rebasedRevision,
  };
  const rebased = rebaseDailyRelease({
    coordinationRoot,
    date,
    owner,
    currentRevision: nextRevision,
    nextRevision: rebasedRevision,
    slug,
    proof: {
      previousRevision: nextRevision,
      originBaseRevision: rebasedBase,
      advancedFromBaseRevision: nextProof.baseRevision,
      baseAdvanceVerified: true,
      dailyArtifactsEquivalent: true,
      pageCorpusEquivalent: true,
      singleDailyPageVerified: true,
      releaseProof: rebasedProof,
      verifiedAt: now.toISOString(),
    },
    now,
  });
  assert.equal(rebased.releaseInFlight.revision, rebasedRevision);
  assert.equal(rebased.releaseInFlight.rebasedFrom[0].revision, nextRevision);
  assert.equal(rebased.releaseInFlight.startedAt, started.releaseInFlight.startedAt);
});
