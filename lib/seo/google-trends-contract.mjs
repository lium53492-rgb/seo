import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signPayload,
  verify as verifyPayload,
} from "node:crypto";

export const GOOGLE_TRENDS_BIGQUERY_PROVIDER =
  "google_trends_bigquery_public_dataset";
export const GOOGLE_TRENDS_BIGQUERY_METHOD = "bigquery_public_dataset";
export const GOOGLE_TRENDS_BIGQUERY_SOURCE_URL =
  "https://support.google.com/trends/answer/12764470?hl=en";
export const GOOGLE_TRENDS_TOP_TERMS_TABLE =
  "bigquery-public-data.google_trends.top_terms";
export const GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE =
  "bigquery-public-data.google_trends.top_rising_terms";
export const GOOGLE_TRENDS_ATTESTATION_ALGORITHM = "RSA-SHA256";
export const GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST =
  "538962e0b1646c7d40a12471e1af3904eda46fea3c0f833e92ee2326a1065a05";
export const GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST =
  "b354b8eae3eb1ebd9a85dac0c56126df6824d2a5cd8a26da6450534438ad580e";

const sha256Pattern = /^[a-f0-9]{64}$/;
const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const legacyDirections = new Set(["rising", "flat", "falling", "unknown"]);
const legacyFields = new Set([
  "keyword",
  "source",
  "sourceUrl",
  "state",
  "relativeInterest",
  "direction",
  "geo",
  "period",
  "collectedAt",
  "detail",
]);
const bigQuerySignalFields = new Set([
  "schemaVersion",
  "keyword",
  "source",
  "collectionMethod",
  "sourceUrl",
  "sourceTable",
  "state",
  "relativeInterest",
  "direction",
  "geo",
  "period",
  "collectedAt",
  "detail",
  "refreshDate",
  "week",
  "bestRank",
  "maxPercentGain",
  "dmaCount",
  "snapshotDigest",
]);
const collectionFields = new Set([
  "schemaVersion",
  "provider",
  "state",
  "collectedAt",
  "sourceUrl",
  "geo",
  "coverage",
  "query",
  "refreshDate",
  "week",
  "results",
  "exactCandidateMatches",
  "discoveryLeads",
  "detail",
  "snapshotDigest",
  "attestation",
]);
const coverageFields = new Set([
  "label",
  "topTermsPerDma",
  "topRisingTermsPerDma",
  "arbitraryQueryCoverage",
  "absenceMeansZero",
]);
const queryFields = new Set([
  "location",
  "useLegacySql",
  "maximumBytesBilled",
  "timeoutMs",
  "asOfDate",
  "refreshDateRule",
  "topTermsSqlDigest",
  "topRisingTermsSqlDigest",
]);
const topTermFields = new Set([
  "term",
  "normalizedTerm",
  "week",
  "bestRank",
  "maxDmaScore",
  "dmaCount",
  "sourceTable",
]);
const risingTermFields = new Set([
  "term",
  "normalizedTerm",
  "week",
  "bestRank",
  "maxPercentGain",
  "dmaCount",
  "sourceTable",
]);
const matchFields = new Set([
  "keyword",
  "normalizedKeyword",
  "topTerm",
  "risingTerm",
]);
const resultsFields = new Set(["topTerms", "topRisingTerms"]);
const resultSummaryFields = new Set(["rowCount", "resultDigest"]);
const attestationFields = new Set([
  "algorithm",
  "clientEmail",
  "keyFingerprint",
  "signature",
]);
const discoveryLeadFields = new Set([
  "term",
  "normalizedTerm",
  "listType",
  "week",
  "bestRank",
  "dmaCount",
  "maxDmaScore",
  "maxPercentGain",
  "sourceTable",
  "googleTrendsGateEligibleOnExactCandidateMatch",
]);
const maximumDiscoveryLeads = 50;
const maximumCollectionBytes = 256 * 1024;
const canonicalBase64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value, fields) {
  return isRecord(value) &&
    Object.keys(value).length === fields.size &&
    Object.keys(value).every((field) => fields.has(field));
}

function assertContract(condition, message) {
  if (!condition) throw new Error(`Google Trends contract failed: ${message}`);
}

function shanghaiCalendarDate(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function previousCalendarDate(value) {
  if (!calendarDatePattern.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function isSunday(value) {
  if (!calendarDatePattern.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.getUTCDay() === 0;
}

function isOfficialTrendsUiUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username && !url.password &&
      url.hostname === "trends.google.com" &&
      url.pathname.startsWith("/trends/");
  } catch {
    return false;
  }
}

function isOfficialTrendsDocumentationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username && !url.password &&
      ((url.hostname === "developers.google.com" &&
        url.pathname.startsWith("/search/apis/trends")) ||
        (url.hostname === "support.google.com" &&
          url.pathname === "/trends/answer/12764470"));
  } catch {
    return false;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function normalizeGoogleTrendsTerm(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

export function computeGoogleTrendsCollectionDigest(collection) {
  assertContract(isRecord(collection), "trendCollection must be an object");
  const { snapshotDigest: _snapshotDigest, ...digestPayload } = collection;
  if (isRecord(digestPayload.attestation)) {
    const { signature: _signature, ...attestationMetadata } =
      digestPayload.attestation;
    digestPayload.attestation = attestationMetadata;
  }
  return createHash("sha256")
    .update(JSON.stringify(stableValue(digestPayload)))
    .digest("hex");
}

export function computeGoogleTrendsResultDigest(rows) {
  assertContract(Array.isArray(rows), "Google Trends result rows must be an array");
  return createHash("sha256")
    .update(JSON.stringify(stableValue(rows)))
    .digest("hex");
}

function publicKeyObject(key) {
  if (key?.type === "public") return key;
  if (key?.type === "private") return createPublicKey(key);
  try {
    return createPublicKey(key);
  } catch {
    try {
      return createPublicKey(createPrivateKey(key));
    } catch {
      throw new Error("Google Trends attestation key is invalid");
    }
  }
}

export function googleTrendsAttestationKeyFingerprint(key) {
  const publicKey = publicKeyObject(key);
  const spki = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spki).digest("hex");
}

export function attestGoogleTrendsCollection(collection, {
  privateKey,
  clientEmail,
}) {
  assertContract(isRecord(collection), "trendCollection must be an object");
  assertContract(typeof clientEmail === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail),
  "Google Trends attestation clientEmail is invalid");
  let signingKey;
  try {
    signingKey = createPrivateKey(privateKey);
  } catch {
    throw new Error("Google Trends attestation private key is invalid");
  }
  const attestation = {
    algorithm: GOOGLE_TRENDS_ATTESTATION_ALGORITHM,
    clientEmail,
    keyFingerprint: googleTrendsAttestationKeyFingerprint(signingKey),
    signature: "",
  };
  const signedCollection = {
    ...collection,
    attestation,
    snapshotDigest: "",
  };
  signedCollection.snapshotDigest =
    computeGoogleTrendsCollectionDigest(signedCollection);
  signedCollection.attestation.signature = signPayload(
    GOOGLE_TRENDS_ATTESTATION_ALGORITHM,
    Buffer.from(signedCollection.snapshotDigest, "utf8"),
    signingKey,
  ).toString("base64");
  return signedCollection;
}

export function verifyGoogleTrendsCollectionAttestation(collection, {
  verificationKey,
  expectedClientEmail,
} = {}) {
  assertContract(isRecord(collection), "trendCollection must be an object");
  const attestation = collection.attestation;
  validateAttestationStructure(attestation, collection.state);
  assertContract(sha256Pattern.test(String(collection.snapshotDigest || "")),
    "trendCollection snapshotDigest is invalid");
  assertContract(typeof verificationKey === "string" && verificationKey.trim(),
    "Google Trends attestation verification key is not configured");
  assertContract(typeof expectedClientEmail === "string" &&
    expectedClientEmail.trim() &&
    attestation.clientEmail === expectedClientEmail.trim(),
  "Google Trends attestation clientEmail does not match the configured identity");
  const publicKey = publicKeyObject(verificationKey);
  assertContract(
    googleTrendsAttestationKeyFingerprint(publicKey) ===
      attestation.keyFingerprint,
    "Google Trends attestation key fingerprint does not match the configured key",
  );
  assertContract(
    computeGoogleTrendsCollectionDigest(collection) ===
      collection.snapshotDigest,
    "trendCollection snapshotDigest does not match its canonical payload",
  );
  let signature;
  try {
    signature = Buffer.from(attestation.signature, "base64");
  } catch {
    assertContract(false, "Google Trends attestation signature is invalid");
  }
  assertContract(verifyPayload(
    GOOGLE_TRENDS_ATTESTATION_ALGORITHM,
    Buffer.from(collection.snapshotDigest, "utf8"),
    publicKey,
    signature,
  ), "Google Trends attestation signature verification failed");
  return true;
}

function validateLegacySignal(signal, candidateKeywords, reportDate) {
  assertContract(hasExactFields(signal, legacyFields),
    "legacy trendSignals must use the exact version 1 field set");
  const keyword = normalizeGoogleTrendsTerm(signal.keyword);
  assertContract(candidateKeywords.has(keyword),
    `Google Trends signal must reference a research candidate: ${keyword || "<empty>"}`);
  assertContract(signal.source === "google_trends",
    `Google Trends signal has an invalid source: ${keyword}`);
  assertContract(typeof signal.sourceUrl === "string" &&
    (isOfficialTrendsUiUrl(signal.sourceUrl) ||
      isOfficialTrendsDocumentationUrl(signal.sourceUrl)),
  `Google Trends sourceUrl must use an official Google Trends URL: ${keyword}`);
  assertContract(typeof signal.geo === "string" &&
    /^(?:Worldwide|[A-Z]{2}(?:-[A-Z0-9]{1,3})?)$/.test(signal.geo),
  `Google Trends signal needs an explicit geo such as Worldwide, US, or US-CA: ${keyword}`);
  assertContract(typeof signal.period === "string" && signal.period.trim().length >= 3,
    `Google Trends signal needs an explicit period: ${keyword}`);
  assertContract(typeof signal.collectedAt === "string" &&
    shanghaiCalendarDate(signal.collectedAt) === reportDate,
  `Google Trends signal must be collected on the report's Shanghai date: ${keyword}`);
  assertContract(typeof signal.detail === "string" && signal.detail.trim().length >= 12,
    `Google Trends signal needs a specific detail: ${keyword}`);
  assertContract(legacyDirections.has(signal.direction),
    `Google Trends signal has an invalid direction: ${keyword}`);
  assertContract(signal.state === "observed" || signal.state === "unavailable",
    `Google Trends signal has an invalid state: ${keyword}`);
  if (signal.state === "observed") {
    assertContract(isOfficialTrendsUiUrl(signal.sourceUrl),
      `Observed Google Trends signals must link to trends.google.com: ${keyword}`);
    assertContract(Number.isInteger(signal.relativeInterest) &&
      signal.relativeInterest >= 0 && signal.relativeInterest <= 100,
    `Observed Google Trends relativeInterest must be an integer from 0 to 100: ${keyword}`);
  } else {
    assertContract(signal.relativeInterest === null && signal.direction === "unknown",
      `Unavailable Google Trends signals must use relativeInterest null and direction unknown: ${keyword}`);
  }
}

function validateTermRow(row, kind, collectionWeek) {
  const isTop = kind === "top";
  const fields = isTop ? topTermFields : risingTermFields;
  const table = isTop ? GOOGLE_TRENDS_TOP_TERMS_TABLE : GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE;
  assertContract(hasExactFields(row, fields), `${kind} row has an invalid field set`);
  assertContract(typeof row.term === "string" && row.term.trim().length > 0,
    `${kind} row needs a term`);
  assertContract(row.normalizedTerm === normalizeGoogleTrendsTerm(row.term),
    `${kind} row normalizedTerm does not match its term`);
  assertContract(row.week === collectionWeek, `${kind} row week does not match the collection`);
  assertContract(Number.isInteger(row.bestRank) && row.bestRank >= 1 && row.bestRank <= 25,
    `${kind} row bestRank must be 1-25`);
  assertContract(Number.isInteger(row.dmaCount) && row.dmaCount >= 1 && row.dmaCount <= 1000,
    `${kind} row dmaCount is invalid`);
  assertContract(row.sourceTable === table, `${kind} row uses an unexpected source table`);
  if (isTop) {
    assertContract(Number.isFinite(row.maxDmaScore) && row.maxDmaScore >= 0 && row.maxDmaScore <= 100,
      "top row maxDmaScore must be a per-DMA 0-100 score");
  } else {
    assertContract(row.maxPercentGain === null ||
      (Number.isFinite(row.maxPercentGain) && row.maxPercentGain >= 0),
    "rising row maxPercentGain is invalid");
  }
}

function validateResultSummary(summary, label, collectionState) {
  assertContract(hasExactFields(summary, resultSummaryFields),
    `trendCollection ${label} result summary is invalid`);
  assertContract(Number.isInteger(summary.rowCount) && summary.rowCount >= 0 &&
    summary.rowCount <= 6000,
  `trendCollection ${label} rowCount is invalid`);
  assertContract(sha256Pattern.test(String(summary.resultDigest || "")),
    `trendCollection ${label} resultDigest is invalid`);
  if (collectionState === "observed") {
    assertContract(summary.rowCount > 0,
      `observed trendCollection ${label} result must not be empty`);
  } else {
    assertContract(summary.rowCount === 0,
      `unavailable trendCollection ${label} result must be empty`);
    assertContract(summary.resultDigest === computeGoogleTrendsResultDigest([]),
      `unavailable trendCollection ${label} resultDigest must represent an empty result`);
  }
}

function validateAttestationStructure(attestation, collectionState) {
  if (attestation === null) {
    assertContract(collectionState === "unavailable",
      "observed trendCollection requires a signed attestation");
    return;
  }
  assertContract(hasExactFields(attestation, attestationFields),
    "trendCollection attestation has an invalid field set");
  assertContract(attestation.algorithm === GOOGLE_TRENDS_ATTESTATION_ALGORITHM,
    "trendCollection attestation uses an unsupported algorithm");
  assertContract(typeof attestation.clientEmail === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attestation.clientEmail),
  "trendCollection attestation clientEmail is invalid");
  assertContract(sha256Pattern.test(String(attestation.keyFingerprint || "")),
    "trendCollection attestation keyFingerprint is invalid");
  assertContract(typeof attestation.signature === "string" &&
    attestation.signature.length >= 172 &&
    attestation.signature.length <= 2048 &&
    canonicalBase64Pattern.test(attestation.signature) &&
    Buffer.from(attestation.signature, "base64").toString("base64") ===
      attestation.signature,
  "trendCollection attestation signature is invalid");
}

function validateDiscoveryLead(lead, collectionWeek) {
  assertContract(hasExactFields(lead, discoveryLeadFields),
    "trendCollection discovery lead has an invalid field set");
  assertContract(lead.listType === "top" || lead.listType === "rising",
    "trendCollection discovery lead has an invalid listType");
  const isTop = lead.listType === "top";
  const expectedTable = isTop
    ? GOOGLE_TRENDS_TOP_TERMS_TABLE
    : GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE;
  assertContract(lead.sourceTable === expectedTable,
    "trendCollection discovery lead uses an unexpected source table");
  assertContract(typeof lead.term === "string" && lead.term.trim().length > 0 &&
    lead.normalizedTerm === normalizeGoogleTrendsTerm(lead.term),
  "trendCollection discovery lead term is invalid");
  assertContract(lead.week === collectionWeek &&
    Number.isInteger(lead.bestRank) && lead.bestRank >= 1 && lead.bestRank <= 25 &&
    Number.isInteger(lead.dmaCount) && lead.dmaCount >= 1 && lead.dmaCount <= 1000,
  "trendCollection discovery lead rank or DMA coverage is invalid");
  assertContract(isTop
    ? Number.isFinite(lead.maxDmaScore) && lead.maxDmaScore >= 0 &&
      lead.maxDmaScore <= 100 && lead.maxPercentGain === null &&
      lead.googleTrendsGateEligibleOnExactCandidateMatch === false
    : lead.maxDmaScore === null &&
      (lead.maxPercentGain === null ||
        (Number.isFinite(lead.maxPercentGain) && lead.maxPercentGain >= 0)) &&
      lead.googleTrendsGateEligibleOnExactCandidateMatch === true,
  "trendCollection discovery lead metrics do not match its listType");
  assertContract(isDndDiscoveryTerm(lead.normalizedTerm),
    "trendCollection discovery lead is outside the deterministic D&D boundary");
}

function compareDiscoveryLeads(left, right) {
  return Number(right.listType === "rising") -
      Number(left.listType === "rising") ||
    left.bestRank - right.bestRank ||
    left.normalizedTerm.localeCompare(right.normalizedTerm, "en-US") ||
    left.term.localeCompare(right.term, "en-US");
}

export function isDndDiscoveryTerm(value) {
  const term = normalizeGoogleTrendsTerm(value);
  return /(?:\bd&d\b|\bdnd\b|\bdungeons?\s+(?:&|and)\s+dragons?\b|\bdungeon\s+master\b|\bttrpg\b|\btabletop\s+rpg\b)/u.test(term);
}

function equalStable(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function validateCollection(collection, candidateKeywords, reportDate) {
  assertContract(hasExactFields(collection, collectionFields),
    "trendCollection has an invalid field set");
  assertContract(Buffer.byteLength(JSON.stringify(collection), "utf8") <=
    maximumCollectionBytes,
  "trendCollection exceeds the 256 KiB compact projection limit");
  assertContract(collection.schemaVersion === 2,
    "trendCollection must use compact attested schemaVersion 2");
  assertContract(collection.provider === GOOGLE_TRENDS_BIGQUERY_PROVIDER,
    "trendCollection uses an unsupported provider");
  assertContract(collection.state === "observed" || collection.state === "unavailable",
    "trendCollection has an invalid state");
  assertContract(typeof collection.collectedAt === "string" &&
    shanghaiCalendarDate(collection.collectedAt) === reportDate,
  "trendCollection must be collected on the report's Shanghai date");
  assertContract(collection.sourceUrl === GOOGLE_TRENDS_BIGQUERY_SOURCE_URL &&
    isOfficialTrendsDocumentationUrl(collection.sourceUrl),
  "trendCollection must reference the official Google Trends BigQuery dataset page");
  assertContract(collection.geo === "US", "trendCollection geo must be US");
  assertContract(hasExactFields(collection.coverage, coverageFields),
    "trendCollection coverage is invalid");
  assertContract(collection.coverage.label ===
    "Top 25 and Top 25 Rising Google Trends terms by US DMA" &&
    collection.coverage.topTermsPerDma === 25 &&
    collection.coverage.topRisingTermsPerDma === 25 &&
    collection.coverage.arbitraryQueryCoverage === false &&
    collection.coverage.absenceMeansZero === false,
  "trendCollection must preserve the public dataset coverage limits");
  assertContract(hasExactFields(collection.query, queryFields),
    "trendCollection query metadata is invalid");
  assertContract(collection.query.location === "US" &&
    collection.query.useLegacySql === false &&
    collection.query.maximumBytesBilled === "104857600" &&
    collection.query.timeoutMs === 15000 &&
    collection.query.asOfDate === reportDate &&
    collection.query.refreshDateRule === "as_of_date_minus_1_day" &&
    collection.query.topTermsSqlDigest === GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST &&
    collection.query.topRisingTermsSqlDigest ===
      GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
  "trendCollection query must be bounded, parameterized, and date-bound");
  assertContract(hasExactFields(collection.results, resultsFields),
    "trendCollection result summaries are invalid");
  validateResultSummary(collection.results.topTerms, "topTerms", collection.state);
  validateResultSummary(collection.results.topRisingTerms, "topRisingTerms", collection.state);
  assertContract(Array.isArray(collection.exactCandidateMatches),
    "trendCollection exactCandidateMatches must be an array");
  assertContract(Array.isArray(collection.discoveryLeads) &&
    collection.discoveryLeads.length <= maximumDiscoveryLeads,
  "trendCollection discoveryLeads must stay within the compact limit");
  assertContract(typeof collection.detail === "string" && collection.detail.trim().length >= 12,
    "trendCollection needs a specific detail");
  assertContract(sha256Pattern.test(String(collection.snapshotDigest || "")) &&
    computeGoogleTrendsCollectionDigest(collection) === collection.snapshotDigest,
  "trendCollection snapshotDigest does not match its canonical payload");
  validateAttestationStructure(collection.attestation, collection.state);

  if (collection.state === "observed") {
    assertContract(calendarDatePattern.test(String(collection.refreshDate || "")) &&
      collection.refreshDate === previousCalendarDate(reportDate),
    "observed trendCollection refreshDate must be the previous calendar date");
    assertContract(calendarDatePattern.test(String(collection.week || "")) &&
      isSunday(collection.week) && collection.week <= collection.refreshDate,
    "observed trendCollection week must be a Sunday on or before refreshDate");
  } else {
    assertContract(collection.refreshDate === null && collection.week === null,
      "unavailable trendCollection must not claim refreshDate or week");
    assertContract(collection.discoveryLeads.length === 0,
      "unavailable trendCollection must not claim discovery leads");
  }

  const discoveryIdentities = new Set();
  for (const lead of collection.discoveryLeads) {
    validateDiscoveryLead(lead, collection.week);
    const identity = `${lead.listType}|${lead.normalizedTerm}`;
    assertContract(!discoveryIdentities.has(identity),
      "trendCollection contains a duplicate discovery lead");
    discoveryIdentities.add(identity);
  }
  assertContract(equalStable(
    collection.discoveryLeads,
    [...collection.discoveryLeads].sort(compareDiscoveryLeads),
  ), "trendCollection discovery leads are not deterministically ordered");

  const matchedCandidates = new Set();
  for (const match of collection.exactCandidateMatches) {
    assertContract(hasExactFields(match, matchFields),
      "trendCollection candidate match has an invalid field set");
    const normalizedKeyword = normalizeGoogleTrendsTerm(match.keyword);
    assertContract(match.normalizedKeyword === normalizedKeyword &&
      candidateKeywords.has(normalizedKeyword),
    "trendCollection candidate match does not reference an exact research candidate");
    assertContract(!matchedCandidates.has(normalizedKeyword),
      "trendCollection contains a duplicate candidate match");
    matchedCandidates.add(normalizedKeyword);
    if (match.topTerm !== null) {
      validateTermRow(match.topTerm, "top", collection.week);
      assertContract(match.topTerm.normalizedTerm === normalizedKeyword,
        "trendCollection topTerm is not an exact normalized candidate match");
    }
    if (match.risingTerm !== null) {
      validateTermRow(match.risingTerm, "rising", collection.week);
      assertContract(match.risingTerm.normalizedTerm === normalizedKeyword,
        "trendCollection risingTerm is not an exact normalized candidate match");
    }
    if (collection.state === "unavailable") {
      assertContract(match.topTerm === null && match.risingTerm === null,
        "unavailable trendCollection must not claim candidate matches");
    }
  }
  assertContract(matchedCandidates.size === candidateKeywords.size &&
    [...candidateKeywords].every((keyword) => matchedCandidates.has(keyword)),
  "trendCollection must bind every research candidate exactly once");
  return collection;
}

function validateBigQuerySignal(signal, collection, match, reportDate) {
  assertContract(hasExactFields(signal, bigQuerySignalFields),
    "BigQuery trend signal has an invalid field set");
  const keyword = normalizeGoogleTrendsTerm(signal.keyword);
  assertContract(signal.schemaVersion === 2 &&
    signal.source === "google_trends" &&
    signal.collectionMethod === GOOGLE_TRENDS_BIGQUERY_METHOD,
  `Google Trends BigQuery signal has invalid provenance: ${keyword}`);
  assertContract(signal.sourceUrl === collection.sourceUrl &&
    signal.sourceTable === GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE &&
    signal.geo === "US" &&
    signal.collectedAt === collection.collectedAt &&
    signal.snapshotDigest === collection.snapshotDigest,
  `Google Trends BigQuery signal is not bound to its collection: ${keyword}`);
  assertContract(typeof signal.detail === "string" && signal.detail.trim().length >= 12,
    `Google Trends signal needs a specific detail: ${keyword}`);
  assertContract(shanghaiCalendarDate(signal.collectedAt) === reportDate,
    `Google Trends signal must be collected on the report's Shanghai date: ${keyword}`);
  assertContract(signal.relativeInterest === null,
    `BigQuery Google Trends signals must not infer nationwide relativeInterest: ${keyword}`);
  assertContract(["observed", "not_observed", "unavailable"].includes(signal.state),
    `Google Trends BigQuery signal has an invalid state: ${keyword}`);

  if (signal.state === "observed") {
    const row = match.risingTerm;
    assertContract(collection.state === "observed" && row &&
      signal.direction === "rising" &&
      signal.refreshDate === collection.refreshDate &&
      signal.week === collection.week &&
      signal.period === `week starting ${collection.week}` &&
      signal.bestRank === row.bestRank &&
      signal.maxPercentGain === row.maxPercentGain &&
      signal.dmaCount === row.dmaCount,
    `Observed BigQuery signal must match an exact top_rising_terms row: ${keyword}`);
  } else if (signal.state === "not_observed") {
    assertContract(collection.state === "observed" && !match.risingTerm &&
      signal.direction === "unknown" &&
      signal.refreshDate === collection.refreshDate &&
      signal.week === collection.week &&
      signal.period === `week starting ${collection.week}` &&
      signal.bestRank === null && signal.maxPercentGain === null && signal.dmaCount === null,
    `not_observed BigQuery signal must represent an exact rising-term miss: ${keyword}`);
  } else {
    assertContract(collection.state === "unavailable" &&
      signal.direction === "unknown" && signal.refreshDate === null && signal.week === null &&
      signal.bestRank === null && signal.maxPercentGain === null && signal.dmaCount === null,
    `unavailable BigQuery signal must not claim an observation: ${keyword}`);
  }
}

export function validateGoogleTrendsEvidence({
  trendSignals,
  trendCollection,
  candidateKeywords,
  reportDate,
  attestationVerificationKey,
  expectedAttestationClientEmail,
  requireVerifiedAttestation = false,
}) {
  assertContract(calendarDatePattern.test(String(reportDate || "")),
    "reportDate must be YYYY-MM-DD");
  assertContract(Array.isArray(trendSignals), "trendSignals must be an array when supplied");
  const candidates = new Set((candidateKeywords || []).map(normalizeGoogleTrendsTerm));
  assertContract(candidates.size > 0 && !candidates.has(""),
    "candidateKeywords must contain non-empty unique terms");
  assertContract(candidates.size === (candidateKeywords || []).length,
    "candidateKeywords must be unique after normalization");

  if (trendCollection === undefined || trendCollection === null) {
    const identities = new Set();
    for (const signal of trendSignals) {
      validateLegacySignal(signal, candidates, reportDate);
      const identity = `${normalizeGoogleTrendsTerm(signal.keyword)}|${signal.geo}|${signal.period.trim()}`;
      assertContract(!identities.has(identity), `Duplicate Google Trends signal: ${identity}`);
      identities.add(identity);
    }
    return {
      trendSignals,
      trendCollection: null,
      attestationVerified: false,
    };
  }

  const collection = validateCollection(trendCollection, candidates, reportDate);
  let attestationVerified = false;
  if (collection.state === "observed" &&
    (requireVerifiedAttestation || attestationVerificationKey !== undefined ||
      expectedAttestationClientEmail !== undefined)) {
    verifyGoogleTrendsCollectionAttestation(collection, {
      verificationKey: attestationVerificationKey,
      expectedClientEmail: expectedAttestationClientEmail,
    });
    attestationVerified = true;
  }
  assertContract(trendSignals.length === collection.exactCandidateMatches.length,
    "BigQuery trendSignals must bind every candidate match");
  const signalsByKeyword = new Map();
  for (const signal of trendSignals) {
    const keyword = normalizeGoogleTrendsTerm(signal?.keyword);
    assertContract(candidates.has(keyword),
      `Google Trends signal must reference a research candidate: ${keyword || "<empty>"}`);
    assertContract(!signalsByKeyword.has(keyword),
      `Duplicate Google Trends BigQuery signal: ${keyword}`);
    const match = collection.exactCandidateMatches.find((item) =>
      item.normalizedKeyword === keyword);
    assertContract(Boolean(match), `BigQuery signal has no candidate match: ${keyword}`);
    validateBigQuerySignal(signal, collection, match, reportDate);
    signalsByKeyword.set(keyword, signal);
  }
  assertContract(signalsByKeyword.size === candidates.size,
    "BigQuery trendSignals must cover every research candidate");
  return { trendSignals, trendCollection: collection, attestationVerified };
}

export function isQualifyingGoogleTrendsSignal(signal, {
  selectedKeyword,
  reportDate,
  trendCollection = null,
  requireBigQuery = false,
  attestationVerificationKey,
  expectedAttestationClientEmail,
} = {}) {
  const keyword = normalizeGoogleTrendsTerm(selectedKeyword);
  if (normalizeGoogleTrendsTerm(signal?.keyword) !== keyword ||
    shanghaiCalendarDate(signal?.collectedAt) !== reportDate) return false;
  if (signal?.schemaVersion === 2) {
    if (!trendCollection || signal.state !== "observed" || signal.direction !== "rising") {
      return false;
    }
    try {
      if (requireBigQuery) {
        verifyGoogleTrendsCollectionAttestation(trendCollection, {
          verificationKey: attestationVerificationKey,
          expectedClientEmail: expectedAttestationClientEmail,
        });
      }
      const match = trendCollection.exactCandidateMatches?.find((item) =>
        item.normalizedKeyword === keyword);
      validateBigQuerySignal(signal, trendCollection, match, reportDate);
      return true;
    } catch {
      return false;
    }
  }
  if (requireBigQuery) return false;
  return signal?.source === "google_trends" &&
    signal?.state === "observed" &&
    isOfficialTrendsUiUrl(signal.sourceUrl) &&
    Number.isInteger(signal.relativeInterest) &&
    signal.relativeInterest >= 0 && signal.relativeInterest <= 100 &&
    (signal.direction === "rising" || signal.relativeInterest >= 50);
}

export function summarizeGoogleTrendsEvidence({
  trendSignals,
  trendCollection,
  reportDate,
  requireBigQuery = false,
  attestationVerificationKey,
  expectedAttestationClientEmail,
}) {
  const signals = Array.isArray(trendSignals) ? trendSignals : [];
  return {
    providerState: trendCollection?.state || (signals.length ? "legacy" : "absent"),
    recorded: signals.length,
    observed: signals.filter((signal) => signal?.state === "observed").length,
    notObserved: signals.filter((signal) => signal?.state === "not_observed").length,
    unavailable: signals.filter((signal) => signal?.state === "unavailable").length,
    qualifying: signals.filter((signal) => isQualifyingGoogleTrendsSignal(signal, {
      selectedKeyword: signal?.keyword,
      reportDate,
      trendCollection,
      requireBigQuery,
      attestationVerificationKey,
      expectedAttestationClientEmail,
    })).length,
  };
}
