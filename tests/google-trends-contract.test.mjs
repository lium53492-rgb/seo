import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  GOOGLE_TRENDS_BIGQUERY_SOURCE_URL,
  GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
  GOOGLE_TRENDS_TOP_TERMS_TABLE,
  GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
  GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST,
  attestGoogleTrendsCollection,
  computeGoogleTrendsCollectionDigest,
  computeGoogleTrendsResultDigest,
  isQualifyingGoogleTrendsSignal,
  summarizeGoogleTrendsEvidence,
  validateGoogleTrendsEvidence,
} from "../lib/seo/google-trends-contract.mjs";

const reportDate = "2026-08-11";
const collectedAt = "2026-08-11T09:15:00+08:00";
const keyword = "d&d campaign prep";
const attestationClientEmail =
  "trends-reader@seo-trends-fixture.iam.gserviceaccount.com";
const { privateKey: attestationPrivateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function collectionFixture({ rising = true } = {}) {
  const topTerm = {
    term: keyword,
    normalizedTerm: keyword,
    week: "2026-08-09",
    bestRank: 9,
    maxDmaScore: 82,
    dmaCount: 4,
    sourceTable: GOOGLE_TRENDS_TOP_TERMS_TABLE,
  };
  const risingTerm = {
    term: keyword,
    normalizedTerm: keyword,
    week: "2026-08-09",
    bestRank: 7,
    maxPercentGain: 240,
    dmaCount: 3,
    sourceTable: GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
  };
  const unrelatedRisingTerm = {
    ...risingTerm,
    term: "unrelated rising fixture",
    normalizedTerm: "unrelated rising fixture",
  };
  const collection = {
    schemaVersion: 2,
    provider: "google_trends_bigquery_public_dataset",
    state: "observed",
    collectedAt,
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
      asOfDate: reportDate,
      refreshDateRule: "as_of_date_minus_1_day",
      topTermsSqlDigest: GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST,
      topRisingTermsSqlDigest: GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
    },
    refreshDate: "2026-08-10",
    week: "2026-08-09",
    results: {
      topTerms: {
        rowCount: 1,
        resultDigest: computeGoogleTrendsResultDigest([topTerm]),
      },
      topRisingTerms: {
        rowCount: 1,
        resultDigest: computeGoogleTrendsResultDigest(
          [rising ? risingTerm : unrelatedRisingTerm],
        ),
      },
    },
    exactCandidateMatches: [{
      keyword,
      normalizedKeyword: keyword,
      topTerm,
      risingTerm: rising ? risingTerm : null,
    }],
    discoveryLeads: [],
    detail: "Official US DMA Top 25 and Top 25 Rising collection completed.",
    snapshotDigest: "",
    attestation: null,
  };
  return attestGoogleTrendsCollection(collection, {
    privateKey: attestationPrivateKey,
    clientEmail: attestationClientEmail,
  });
}

function signalFixture(collection, { observed = true } = {}) {
  const rising = collection.exactCandidateMatches[0].risingTerm;
  return {
    schemaVersion: 2,
    keyword,
    source: "google_trends",
    collectionMethod: "bigquery_public_dataset",
    sourceUrl: GOOGLE_TRENDS_BIGQUERY_SOURCE_URL,
    sourceTable: GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
    state: observed ? "observed" : "not_observed",
    relativeInterest: null,
    direction: observed ? "rising" : "unknown",
    geo: "US",
    period: "week starting 2026-08-09",
    collectedAt,
    detail: observed
      ? "Exact candidate appeared in the official top-rising feed; no nationwide score was inferred."
      : "The query succeeded, but the exact candidate did not appear in the official top-rising feed; this is not zero demand.",
    refreshDate: "2026-08-10",
    week: "2026-08-09",
    bestRank: observed ? rising.bestRank : null,
    maxPercentGain: observed ? rising.maxPercentGain : null,
    dmaCount: observed ? rising.dmaCount : null,
    snapshotDigest: collection.snapshotDigest,
  };
}

test("legacy Explore evidence remains valid and qualifying", () => {
  const signal = {
    keyword,
    source: "google_trends",
    sourceUrl: "https://trends.google.com/trends/explore?geo=US&q=d%26d%20campaign%20prep",
    state: "observed",
    relativeInterest: 61,
    direction: "flat",
    geo: "US",
    period: "past 12 months",
    collectedAt,
    detail: "A human recorded the exact official Explore observation.",
  };
  assert.doesNotThrow(() => validateGoogleTrendsEvidence({
    trendSignals: [signal],
    candidateKeywords: [keyword],
    reportDate,
  }));
  assert.equal(isQualifyingGoogleTrendsSignal(signal, {
    selectedKeyword: keyword,
    reportDate,
  }), true);
  assert.equal(isQualifyingGoogleTrendsSignal(signal, {
    selectedKeyword: keyword,
    reportDate,
    requireBigQuery: true,
  }), false);
});

test("an exact BigQuery top-rising match qualifies without inventing nationwide relative interest", () => {
  const trendCollection = collectionFixture();
  const signal = signalFixture(trendCollection);
  assert.doesNotThrow(() => validateGoogleTrendsEvidence({
    trendSignals: [signal],
    trendCollection,
    candidateKeywords: [keyword],
    reportDate,
    attestationVerificationKey: attestationPrivateKey,
    expectedAttestationClientEmail: attestationClientEmail,
    requireVerifiedAttestation: true,
  }));
  assert.equal(signal.relativeInterest, null);
  assert.equal(isQualifyingGoogleTrendsSignal(signal, {
    selectedKeyword: keyword,
    reportDate,
    trendCollection,
    requireBigQuery: true,
    attestationVerificationKey: attestationPrivateKey,
    expectedAttestationClientEmail: attestationClientEmail,
  }), true);
  assert.deepEqual(summarizeGoogleTrendsEvidence({
    trendSignals: [signal],
    trendCollection,
    reportDate,
  }), {
    providerState: "observed",
    recorded: 1,
    observed: 1,
    notObserved: 0,
    unavailable: 0,
    qualifying: 1,
  });
});

test("a top-only exact term is recorded as not observed in Rising and cannot publish", () => {
  const trendCollection = collectionFixture({ rising: false });
  const signal = signalFixture(trendCollection, { observed: false });
  assert.doesNotThrow(() => validateGoogleTrendsEvidence({
    trendSignals: [signal],
    trendCollection,
    candidateKeywords: [keyword],
    reportDate,
  }));
  assert.equal(isQualifyingGoogleTrendsSignal(signal, {
    selectedKeyword: keyword,
    reportDate,
    trendCollection,
  }), false);
  assert.equal(summarizeGoogleTrendsEvidence({
    trendSignals: [signal],
    trendCollection,
    reportDate,
  }).notObserved, 1);
});

test("digest, provenance, exact keyword, and no-national-score bindings fail closed", () => {
  const trendCollection = collectionFixture();
  const signal = signalFixture(trendCollection);

  const tamperedCollection = structuredClone(trendCollection);
  tamperedCollection.exactCandidateMatches[0].risingTerm.dmaCount = 99;
  assert.throws(() => validateGoogleTrendsEvidence({
    trendSignals: [signal],
    trendCollection: tamperedCollection,
    candidateKeywords: [keyword],
    reportDate,
  }), /snapshotDigest/);

  const inferredNationalScore = { ...signal, relativeInterest: 100 };
  assert.throws(() => validateGoogleTrendsEvidence({
    trendSignals: [inferredNationalScore],
    trendCollection,
    candidateKeywords: [keyword],
    reportDate,
  }), /must not infer nationwide relativeInterest/);

  const expandedKeyword = { ...signal, keyword: `${keyword} guide` };
  assert.throws(() => validateGoogleTrendsEvidence({
    trendSignals: [expandedKeyword],
    trendCollection,
    candidateKeywords: [keyword],
    reportDate,
  }), /must reference a research candidate/);

  const wrongTable = { ...signal, sourceTable: GOOGLE_TRENDS_TOP_TERMS_TABLE };
  assert.throws(() => validateGoogleTrendsEvidence({
    trendSignals: [wrongTable],
    trendCollection,
    candidateKeywords: [keyword],
    reportDate,
  }), /not bound to its collection/);
});

test("a recomputed self-hash cannot replace the configured service-account attestation", () => {
  const trendCollection = collectionFixture();
  const signal = signalFixture(trendCollection);
  const forged = structuredClone(trendCollection);
  forged.detail = "A locally forged payload recomputed its own hash but was not signed.";
  forged.snapshotDigest = computeGoogleTrendsCollectionDigest(forged);
  const forgedSignal = { ...signal, snapshotDigest: forged.snapshotDigest };
  assert.throws(() => validateGoogleTrendsEvidence({
    trendSignals: [forgedSignal],
    trendCollection: forged,
    candidateKeywords: [keyword],
    reportDate,
    attestationVerificationKey: attestationPrivateKey,
    expectedAttestationClientEmail: attestationClientEmail,
    requireVerifiedAttestation: true,
  }), /signature verification failed/);

  const wrongSql = structuredClone(trendCollection);
  wrongSql.query.topTermsSqlDigest = "a".repeat(64);
  wrongSql.snapshotDigest = computeGoogleTrendsCollectionDigest(wrongSql);
  assert.throws(() => validateGoogleTrendsEvidence({
    trendSignals: [{ ...signal, snapshotDigest: wrongSql.snapshotDigest }],
    trendCollection: wrongSql,
    candidateKeywords: [keyword],
    reportDate,
  }), /query must be bounded, parameterized, and date-bound/);
});
