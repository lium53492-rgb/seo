import { createHash, createPrivateKey, randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";
import {
  GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
  GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST,
  attestGoogleTrendsCollection,
  computeGoogleTrendsCollectionDigest,
  computeGoogleTrendsResultDigest,
  googleTrendsAttestationKeyFingerprint,
  isDndDiscoveryTerm,
} from "../../lib/seo/google-trends-contract.mjs";

export const GOOGLE_TRENDS_PROVIDER =
  "google_trends_bigquery_public_dataset";
export const GOOGLE_TRENDS_SOURCE_URL =
  "https://support.google.com/trends/answer/12764470?hl=en";
export const GOOGLE_TRENDS_TOP_TERMS_TABLE =
  "bigquery-public-data.google_trends.top_terms";
export const GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE =
  "bigquery-public-data.google_trends.top_rising_terms";

const bigQueryScope = "https://www.googleapis.com/auth/bigquery.readonly";
const queryLocation = "US";
const maximumBytesBilled = "104857600";
const queryTimeoutMs = 15_000;
const requestTimeoutMs = 20_000;
const maximumRowsPerTable = 6_000;
const maximumCandidates = 100;
const maximumDiscoveryLeads = 50;
const maximumCollectionBytes = 256 * 1024;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const topTermsSql = `
WITH latest_week AS (
  SELECT MAX(week) AS week
  FROM \`${GOOGLE_TRENDS_TOP_TERMS_TABLE}\`
  WHERE refresh_date = DATE_SUB(@as_of_date, INTERVAL 1 DAY)
)
SELECT
  term,
  CAST(source.week AS STRING) AS week,
  MIN(rank) AS best_rank,
  MAX(score) AS max_dma_score,
  COUNT(DISTINCT dma_id) AS dma_count,
  CAST(source.refresh_date AS STRING) AS refresh_date
FROM \`${GOOGLE_TRENDS_TOP_TERMS_TABLE}\` AS source
CROSS JOIN latest_week
WHERE source.refresh_date = DATE_SUB(@as_of_date, INTERVAL 1 DAY)
  AND source.week = latest_week.week
GROUP BY term, week, refresh_date
ORDER BY best_rank, term
`.trim();

const topRisingTermsSql = `
WITH latest_week AS (
  SELECT MAX(week) AS week
  FROM \`${GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE}\`
  WHERE refresh_date = DATE_SUB(@as_of_date, INTERVAL 1 DAY)
)
SELECT
  term,
  CAST(source.week AS STRING) AS week,
  MIN(rank) AS best_rank,
  MAX(percent_gain) AS max_percent_gain,
  COUNT(DISTINCT dma_id) AS dma_count,
  CAST(source.refresh_date AS STRING) AS refresh_date
FROM \`${GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE}\` AS source
CROSS JOIN latest_week
WHERE source.refresh_date = DATE_SUB(@as_of_date, INTERVAL 1 DAY)
  AND source.week = latest_week.week
GROUP BY term, week, refresh_date
ORDER BY best_rank, term
`.trim();

const queryDefinitions = {
  topTerms: {
    sql: topTermsSql,
    table: GOOGLE_TRENDS_TOP_TERMS_TABLE,
    metricColumn: "max_dma_score",
    metricProperty: "maxDmaScore",
  },
  topRisingTerms: {
    sql: topRisingTermsSql,
    table: GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
    metricColumn: "max_percent_gain",
    metricProperty: "maxPercentGain",
  },
};

if (sha256(topTermsSql) !== GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST ||
  sha256(topRisingTermsSql) !== GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST) {
  throw new Error("Google Trends SQL changed without a contract digest update");
}

let cachedAuth = null;
let cachedAuthIdentity = "";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function computeTrendCollectionDigest(collection) {
  return computeGoogleTrendsCollectionDigest(collection);
}

export function normalizeTrendTerm(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function validProjectId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(value);
}

function validClientEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function credentialState(env) {
  const projectId = String(
    env.GOOGLE_TRENDS_BIGQUERY_PROJECT_ID || "",
  ).trim();
  const clientEmail = String(
    env.GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL || "",
  ).trim();
  const privateKey = normalizePrivateKey(
    env.GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY,
  );
  const missing = [];
  if (!projectId) missing.push("GOOGLE_TRENDS_BIGQUERY_PROJECT_ID");
  if (!clientEmail) missing.push("GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL");
  if (!privateKey) missing.push("GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY");
  const invalid = [];
  if (projectId && !validProjectId(projectId)) {
    invalid.push("GOOGLE_TRENDS_BIGQUERY_PROJECT_ID");
  }
  if (clientEmail && !validClientEmail(clientEmail)) {
    invalid.push("GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL");
  }
  if (
    privateKey &&
    (!privateKey.includes("-----BEGIN PRIVATE KEY-----") ||
      !privateKey.includes("-----END PRIVATE KEY-----"))
  ) {
    invalid.push("GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY");
  } else if (privateKey) {
    try {
      createPrivateKey(privateKey);
      googleTrendsAttestationKeyFingerprint(privateKey);
    } catch {
      invalid.push("GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY");
    }
  }
  return { projectId, clientEmail, privateKey, missing, invalid };
}

export function googleTrendsBigQueryStatus(env = process.env) {
  const state = credentialState(env);
  if (state.missing.length || state.invalid.length) {
    const details = [];
    if (state.missing.length) {
      details.push(`${state.missing.join(", ")} not configured`);
    }
    if (state.invalid.length) {
      details.push(`${state.invalid.join(", ")} invalid`);
    }
    return {
      schemaVersion: 1,
      provider: GOOGLE_TRENDS_PROVIDER,
      configured: false,
      state: "unavailable",
      missing: state.missing,
      invalid: state.invalid,
      detail: `${details.join("; ")}.`,
    };
  }
  return {
    schemaVersion: 1,
    provider: GOOGLE_TRENDS_PROVIDER,
    configured: true,
    state: "configured",
    missing: [],
    invalid: [],
    projectId: state.projectId,
    clientEmail: state.clientEmail,
    keyFingerprint: googleTrendsAttestationKeyFingerprint(state.privateKey),
    location: queryLocation,
    detail:
      "Google Trends BigQuery credentials are configured; no live query was made by this check.",
  };
}

export const googleTrendsStatus = googleTrendsBigQueryStatus;

function configuredCredentials(env) {
  const status = googleTrendsBigQueryStatus(env);
  if (!status.configured) return null;
  const state = credentialState(env);
  return {
    projectId: state.projectId,
    clientEmail: state.clientEmail,
    privateKey: state.privateKey,
  };
}

function authClient(config) {
  const identity = [
    config.projectId,
    config.clientEmail,
    sha256(config.privateKey),
  ].join(":");
  if (!cachedAuth || cachedAuthIdentity !== identity) {
    cachedAuth = new GoogleAuth({
      credentials: {
        client_email: config.clientEmail,
        private_key: config.privateKey,
      },
      scopes: [bigQueryScope],
    });
    cachedAuthIdentity = identity;
  }
  return cachedAuth;
}

function isIsoDate(value) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function previousDate(value) {
  if (!isIsoDate(value)) throw new Error("Google Trends as-of date is invalid");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function isSunday(value) {
  if (!isIsoDate(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).getUTCDay() === 0;
}

function shanghaiDate(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function normalizeCandidates(candidates) {
  if (!Array.isArray(candidates)) {
    throw new Error("Google Trends candidates must be an array");
  }
  if (candidates.length > maximumCandidates) {
    throw new Error(
      `Google Trends cannot evaluate more than ${maximumCandidates} candidates`,
    );
  }
  const normalizedSeen = new Set();
  return candidates.map((candidate, index) => {
    const keyword = String(candidate ?? "").trim();
    const normalizedKeyword = normalizeTrendTerm(keyword);
    if (!keyword || keyword.length > 240 || !normalizedKeyword) {
      throw new Error(`Google Trends candidate ${index + 1} is invalid`);
    }
    if (normalizedSeen.has(normalizedKeyword)) {
      throw new Error(
        `Google Trends candidates contain a duplicate normalized keyword: ${keyword}`,
      );
    }
    normalizedSeen.add(normalizedKeyword);
    return { keyword, normalizedKeyword };
  });
}

function queryMetadata(asOfDate) {
  return {
    location: queryLocation,
    useLegacySql: false,
    maximumBytesBilled,
    timeoutMs: queryTimeoutMs,
    asOfDate,
    refreshDateRule: "as_of_date_minus_1_day",
    topTermsSqlDigest: GOOGLE_TRENDS_TOP_TERMS_SQL_DIGEST,
    topRisingTermsSqlDigest: GOOGLE_TRENDS_TOP_RISING_TERMS_SQL_DIGEST,
  };
}

function coverageMetadata() {
  return {
    label: "Top 25 and Top 25 Rising Google Trends terms by US DMA",
    topTermsPerDma: 25,
    topRisingTermsPerDma: 25,
    arbitraryQueryCoverage: false,
    absenceMeansZero: false,
  };
}

function exactCandidateMatches(candidates, topTerms, topRisingTerms) {
  const topByNormalizedTerm = rowsByNormalizedTerm(topTerms);
  const risingByNormalizedTerm = rowsByNormalizedTerm(topRisingTerms);
  return candidates.map(({ keyword, normalizedKeyword }) => ({
    keyword,
    normalizedKeyword,
    topTerm: topByNormalizedTerm.get(normalizedKeyword) || null,
    risingTerm: risingByNormalizedTerm.get(normalizedKeyword) || null,
  }));
}

function rowsByNormalizedTerm(rows) {
  const result = new Map();
  for (const row of rows) {
    const previous = result.get(row.normalizedTerm);
    if (
      !previous ||
      row.bestRank < previous.bestRank ||
      (row.bestRank === previous.bestRank && row.term < previous.term)
    ) {
      result.set(row.normalizedTerm, row);
    }
  }
  return result;
}

function resultSummary(rows) {
  return {
    rowCount: rows.length,
    resultDigest: computeGoogleTrendsResultDigest(rows),
  };
}

function discoveryLeads(topTerms, topRisingTerms) {
  const leads = [
    ...topRisingTerms.map((row) => ({
      term: row.term,
      normalizedTerm: row.normalizedTerm,
      listType: "rising",
      week: row.week,
      bestRank: row.bestRank,
      dmaCount: row.dmaCount,
      maxDmaScore: null,
      maxPercentGain: row.maxPercentGain,
      sourceTable: row.sourceTable,
      googleTrendsGateEligibleOnExactCandidateMatch: true,
    })),
    ...topTerms.map((row) => ({
      term: row.term,
      normalizedTerm: row.normalizedTerm,
      listType: "top",
      week: row.week,
      bestRank: row.bestRank,
      dmaCount: row.dmaCount,
      maxDmaScore: row.maxDmaScore,
      maxPercentGain: null,
      sourceTable: row.sourceTable,
      googleTrendsGateEligibleOnExactCandidateMatch: false,
    })),
  ];
  return leads
    .filter((lead) => isDndDiscoveryTerm(lead.normalizedTerm))
    .sort((left, right) =>
      Number(right.listType === "rising") - Number(left.listType === "rising") ||
      left.bestRank - right.bestRank ||
      left.normalizedTerm.localeCompare(right.normalizedTerm, "en-US") ||
      left.term.localeCompare(right.term, "en-US"))
    .slice(0, maximumDiscoveryLeads);
}

function finalizeCollection(value, config = null) {
  const collection = { ...value, attestation: null, snapshotDigest: "" };
  if (config) {
    const signedCollection = attestGoogleTrendsCollection(collection, {
      privateKey: config.privateKey,
      clientEmail: config.clientEmail,
    });
    if (Buffer.byteLength(JSON.stringify(signedCollection), "utf8") >
      maximumCollectionBytes) {
      throw new Error("Google Trends compact collection exceeds 256 KiB");
    }
    return signedCollection;
  }
  collection.snapshotDigest = computeTrendCollectionDigest(collection);
  if (Buffer.byteLength(JSON.stringify(collection), "utf8") >
    maximumCollectionBytes) {
    throw new Error("Google Trends compact collection exceeds 256 KiB");
  }
  return collection;
}

function baseCollection({ state, collectedAt, asOfDate, candidates, detail, config = null }) {
  return finalizeCollection({
    schemaVersion: 2,
    provider: GOOGLE_TRENDS_PROVIDER,
    state,
    collectedAt,
    sourceUrl: GOOGLE_TRENDS_SOURCE_URL,
    geo: "US",
    coverage: coverageMetadata(),
    query: queryMetadata(asOfDate),
    refreshDate: null,
    week: null,
    results: {
      topTerms: resultSummary([]),
      topRisingTerms: resultSummary([]),
    },
    exactCandidateMatches: exactCandidateMatches(candidates, [], []),
    discoveryLeads: [],
    detail,
  }, config);
}

function queryRequestBody(sql, asOfDate) {
  return {
    query: sql,
    useLegacySql: false,
    location: queryLocation,
    parameterMode: "NAMED",
    queryParameters: [
      {
        name: "as_of_date",
        parameterType: { type: "DATE" },
        parameterValue: { value: asOfDate },
      },
    ],
    maximumBytesBilled,
    timeoutMs: queryTimeoutMs,
    maxResults: maximumRowsPerTable,
    useQueryCache: true,
  };
}

class SafeQueryError extends Error {}

async function readJsonResponse(response, label) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SafeQueryError(
      `Google Trends ${label} query returned invalid JSON.`,
    );
  }
  if (!isRecord(payload)) {
    throw new SafeQueryError(
      `Google Trends ${label} query returned an invalid response.`,
    );
  }
  return payload;
}

async function authenticatedFetch(fetchImpl, url, init, label) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    throw new SafeQueryError(
      `Google Trends ${label} query failed: ${
        error instanceof Error ? error.name : "network_error"
      }.`,
    );
  }
  if (!response || typeof response.ok !== "boolean") {
    throw new SafeQueryError(
      `Google Trends ${label} query returned an invalid HTTP response.`,
    );
  }
  if (!response.ok) {
    throw new SafeQueryError(
      `Google Trends ${label} query returned HTTP ${response.status}.`,
    );
  }
  return readJsonResponse(response, label);
}

async function runBigQuery({
  config,
  accessToken,
  asOfDate,
  definition,
  label,
  fetchImpl,
}) {
  const queryEndpoint =
    `https://bigquery.googleapis.com/bigquery/v2/projects/${
      encodeURIComponent(config.projectId)
    }/queries`;
  let payload = await authenticatedFetch(
    fetchImpl,
    queryEndpoint,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(queryRequestBody(definition.sql, asOfDate)),
      cache: "no-store",
    },
    label,
  );
  if (Array.isArray(payload.errors) && payload.errors.length) {
    throw new SafeQueryError(
      `Google Trends ${label} query reported a BigQuery job error.`,
    );
  }

  if (payload.jobComplete !== true) {
    const jobId = isRecord(payload.jobReference) &&
        typeof payload.jobReference.jobId === "string"
      ? payload.jobReference.jobId
      : "";
    if (!jobId) {
      throw new SafeQueryError(
        `Google Trends ${label} query did not complete or return a job ID.`,
      );
    }
    const resultEndpoint = new URL(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${
        encodeURIComponent(config.projectId)
      }/queries/${encodeURIComponent(jobId)}`,
    );
    resultEndpoint.searchParams.set("location", queryLocation);
    resultEndpoint.searchParams.set("timeoutMs", String(queryTimeoutMs));
    resultEndpoint.searchParams.set(
      "maxResults",
      String(maximumRowsPerTable),
    );
    payload = await authenticatedFetch(
      fetchImpl,
      resultEndpoint,
      {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
      label,
    );
    if (payload.jobComplete !== true) {
      throw new SafeQueryError(
        `Google Trends ${label} query exceeded its completion timeout.`,
      );
    }
  }

  if (payload.pageToken) {
    throw new SafeQueryError(
      `Google Trends ${label} query exceeded the bounded row limit.`,
    );
  }
  return parseBigQueryRows(payload, definition, label);
}

function parseBigQueryRows(payload, definition, label) {
  const expectedColumns = [
    "term",
    "week",
    "best_rank",
    definition.metricColumn,
    "dma_count",
    "refresh_date",
  ];
  const fields = isRecord(payload.schema) && Array.isArray(payload.schema.fields)
    ? payload.schema.fields
    : null;
  if (
    !fields ||
    fields.length !== expectedColumns.length ||
    fields.some((field, index) =>
      !isRecord(field) || field.name !== expectedColumns[index]
    )
  ) {
    throw new SafeQueryError(
      `Google Trends ${label} query returned an unexpected schema.`,
    );
  }
  const rawRows = payload.rows === undefined ? [] : payload.rows;
  if (!Array.isArray(rawRows) || rawRows.length > maximumRowsPerTable) {
    throw new SafeQueryError(
      `Google Trends ${label} query returned an invalid row count.`,
    );
  }
  const rowsWithPartition = rawRows.map((rawRow, index) => {
    if (!isRecord(rawRow) || !Array.isArray(rawRow.f)) {
      throw new SafeQueryError(
        `Google Trends ${label} row ${index + 1} is invalid.`,
      );
    }
    const values = rawRow.f.map((cell) =>
      isRecord(cell) && Object.hasOwn(cell, "v") ? cell.v : undefined
    );
    if (
      values.length !== expectedColumns.length ||
      values.some((value, valueIndex) =>
        value === undefined ||
        (value === null && !(
          valueIndex === 3 &&
          definition.metricProperty === "maxPercentGain"
        ))
      )
    ) {
      throw new SafeQueryError(
        `Google Trends ${label} row ${index + 1} is incomplete.`,
      );
    }
    const term = String(values[0]).trim();
    const normalizedTerm = normalizeTrendTerm(term);
    const week = String(values[1]);
    const bestRank = Number(values[2]);
    const metric = values[3] === null ? null : Number(values[3]);
    const dmaCount = Number(values[4]);
    const refreshDate = String(values[5]);
    if (
      !term ||
      term.length > 500 ||
      !normalizedTerm ||
      !isIsoDate(week) ||
      !Number.isInteger(bestRank) ||
      bestRank < 1 ||
      bestRank > 25 ||
      (metric !== null && (!Number.isFinite(metric) || metric < 0)) ||
      (definition.metricProperty === "maxDmaScore" &&
        (metric === null || metric > 100)) ||
      !Number.isInteger(dmaCount) ||
      dmaCount < 1 ||
      dmaCount > 1_000 ||
      !isIsoDate(refreshDate)
    ) {
      throw new SafeQueryError(
        `Google Trends ${label} row ${index + 1} has invalid values.`,
      );
    }
    return {
      term,
      normalizedTerm,
      week,
      bestRank,
      [definition.metricProperty]: metric,
      dmaCount,
      sourceTable: definition.table,
      refreshDate,
    };
  });
  if (!rowsWithPartition.length) {
    return { rows: [], refreshDate: null, week: null };
  }
  const refreshDate = commonValue(
    rowsWithPartition,
    "refreshDate",
    `${label} refresh date`,
  );
  const week = commonValue(
    rowsWithPartition,
    "week",
    `${label} weekly period`,
  );
  const rows = deduplicateNormalizedRows(
    rowsWithPartition.map(({ refreshDate: _refreshDate, ...row }) => row),
    definition.metricProperty,
  );
  return {
    rows: rows.sort((left, right) =>
      left.bestRank - right.bestRank || left.term.localeCompare(right.term)
    ),
    refreshDate,
    week,
  };
}

function deduplicateNormalizedRows(rows, metricProperty) {
  const byNormalizedTerm = new Map();
  for (const row of rows) {
    const previous = byNormalizedTerm.get(row.normalizedTerm);
    const rowMetric = row[metricProperty] ?? -1;
    const previousMetric = previous?.[metricProperty] ?? -1;
    if (
      !previous ||
      row.bestRank < previous.bestRank ||
      (row.bestRank === previous.bestRank && rowMetric > previousMetric) ||
      (row.bestRank === previous.bestRank &&
        rowMetric === previousMetric &&
        row.term < previous.term)
    ) {
      byNormalizedTerm.set(row.normalizedTerm, row);
    }
  }
  return [...byNormalizedTerm.values()];
}

function commonValue(rows, property, label) {
  const values = new Set(rows.map((row) => row[property]));
  if (values.size !== 1) {
    throw new SafeQueryError(
      `Google Trends tables did not return one shared ${label}.`,
    );
  }
  return [...values][0];
}

function safeUnavailableDetail(error) {
  if (error instanceof SafeQueryError) return error.message;
  return `Google Trends collection failed: ${
    error instanceof Error ? error.name : "collection_error"
  }.`;
}

export async function collectGoogleTrendsBigQuery(
  {
    candidates = [],
    now = new Date(),
    asOfDate,
    env = process.env,
    fetchImpl = fetch,
    getAccessToken,
  } = {},
) {
  const candidateRecords = normalizeCandidates(candidates);
  const collectedAtDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(collectedAtDate.getTime())) {
    throw new Error("Google Trends collection time is invalid");
  }
  const collectedAt = collectedAtDate.toISOString();
  const effectiveAsOfDate = asOfDate || shanghaiDate(collectedAtDate);
  if (!isIsoDate(effectiveAsOfDate)) {
    throw new Error("Google Trends as-of date is invalid");
  }
  const config = configuredCredentials(env);
  if (!config) {
    return baseCollection({
      state: "unavailable",
      collectedAt,
      asOfDate: effectiveAsOfDate,
      candidates: candidateRecords,
      detail: googleTrendsBigQueryStatus(env).detail,
    });
  }

  let accessToken;
  try {
    accessToken = getAccessToken
      ? await getAccessToken(config)
      : await authClient(config).getAccessToken();
  } catch (error) {
    return baseCollection({
      state: "unavailable",
      collectedAt,
      asOfDate: effectiveAsOfDate,
      candidates: candidateRecords,
      config,
      detail: `Google Trends authorization failed: ${
        error instanceof Error ? error.name : "authentication_error"
      }.`,
    });
  }
  if (!accessToken) {
    return baseCollection({
      state: "unavailable",
      collectedAt,
      asOfDate: effectiveAsOfDate,
      candidates: candidateRecords,
      config,
      detail:
        "Google Trends authorization did not return an access token.",
    });
  }

  let topResult;
  let topRisingResult;
  try {
    [topResult, topRisingResult] = await Promise.all([
      runBigQuery({
        config,
        accessToken,
        asOfDate: effectiveAsOfDate,
        definition: queryDefinitions.topTerms,
        label: "top terms",
        fetchImpl,
      }),
      runBigQuery({
        config,
        accessToken,
        asOfDate: effectiveAsOfDate,
        definition: queryDefinitions.topRisingTerms,
        label: "top rising terms",
        fetchImpl,
      }),
    ]);
    if (!topResult.rows.length || !topRisingResult.rows.length) {
      throw new SafeQueryError(
        "Google Trends expected daily partition returned incomplete Top 25 coverage.",
      );
    }
    const refreshDate = commonValue(
      [topResult, topRisingResult],
      "refreshDate",
      "refresh date",
    );
    const week = commonValue(
      [topResult, topRisingResult],
      "week",
      "weekly period",
    );
    if (refreshDate !== previousDate(effectiveAsOfDate)) {
      throw new SafeQueryError(
        "Google Trends query returned a refresh date outside the requested daily partition.",
      );
    }
    if (!isSunday(week) || week > refreshDate) {
      throw new SafeQueryError(
        "Google Trends query returned an invalid weekly period.",
      );
    }
    return finalizeCollection({
      schemaVersion: 2,
      provider: GOOGLE_TRENDS_PROVIDER,
      state: "observed",
      collectedAt,
      sourceUrl: GOOGLE_TRENDS_SOURCE_URL,
      geo: "US",
      coverage: coverageMetadata(),
      query: queryMetadata(effectiveAsOfDate),
      refreshDate,
      week,
      results: {
        topTerms: resultSummary(topResult.rows),
        topRisingTerms: resultSummary(topRisingResult.rows),
      },
      exactCandidateMatches: exactCandidateMatches(
        candidateRecords,
        topResult.rows,
        topRisingResult.rows,
      ),
      discoveryLeads: discoveryLeads(
        topResult.rows,
        topRisingResult.rows,
      ),
      detail:
        "Observed the official Google Trends public BigQuery Top 25 and Top 25 Rising terms for the latest weekly period in the requested US DMA daily partition. Coverage is not an arbitrary-query interest measurement.",
    }, config);
  } catch (error) {
    return baseCollection({
      state: "unavailable",
      collectedAt,
      asOfDate: effectiveAsOfDate,
      candidates: candidateRecords,
      config,
      detail: safeUnavailableDetail(error),
    });
  }
}

export const collectGoogleTrends = collectGoogleTrendsBigQuery;

function assertCollectionDigest(collection) {
  if (
    !isRecord(collection) ||
    !/^[a-f0-9]{64}$/.test(String(collection.snapshotDigest || "")) ||
    computeTrendCollectionDigest(collection) !== collection.snapshotDigest
  ) {
    throw new Error("Google Trends collection digest is invalid");
  }
}

export function trendSignalsFromCollection(collection, candidates) {
  assertCollectionDigest(collection);
  const candidateRecords = normalizeCandidates(candidates);
  const matches = Array.isArray(collection.exactCandidateMatches)
    ? collection.exactCandidateMatches
    : [];
  if (matches.length !== candidateRecords.length) {
    throw new Error(
      "Google Trends collection does not bind every requested candidate",
    );
  }
  const matchByKeyword = new Map(
    matches.map((match) => [match?.normalizedKeyword, match]),
  );
  return candidateRecords.map(({ keyword, normalizedKeyword }) => {
    const match = matchByKeyword.get(normalizedKeyword);
    if (
      !isRecord(match) ||
      normalizeTrendTerm(match.keyword) !== normalizedKeyword ||
      match.normalizedKeyword !== normalizedKeyword
    ) {
      throw new Error(
        `Google Trends collection is not bound to candidate: ${keyword}`,
      );
    }
    const risingTerm = isRecord(match?.risingTerm)
      ? match.risingTerm
      : null;
    let state = "unavailable";
    let direction = "unknown";
    let detail = collection.detail;
    if (collection.state === "observed" && risingTerm) {
      state = "observed";
      direction = "rising";
      detail =
        "The exact normalized candidate appeared in the official US DMA Top 25 Rising dataset. Rank, percent gain, and DMA count are aggregation provenance; relativeInterest remains null.";
    } else if (collection.state === "observed" && match?.topTerm) {
      state = "not_observed";
      detail =
        "The exact normalized candidate appeared in Top 25 terms but not in Top 25 Rising terms. This restricted-list absence is not zero search interest.";
    } else if (collection.state === "observed") {
      state = "not_observed";
      detail =
        "The exact normalized candidate did not appear in the US DMA Top 25 Rising dataset. This restricted-list absence is not zero search interest.";
    }
    return {
      schemaVersion: 2,
      keyword,
      source: "google_trends",
      collectionMethod: "bigquery_public_dataset",
      sourceUrl: GOOGLE_TRENDS_SOURCE_URL,
      sourceTable: GOOGLE_TRENDS_TOP_RISING_TERMS_TABLE,
      state,
      relativeInterest: null,
      direction,
      geo: "US",
      period: collection.week
        ? `week starting ${collection.week}`
        : `requested refresh date ${previousDate(collection.query.asOfDate)}`,
      collectedAt: collection.collectedAt,
      detail,
      refreshDate: collection.refreshDate,
      week: collection.week,
      bestRank: risingTerm?.bestRank ?? null,
      maxPercentGain: risingTerm?.maxPercentGain ?? null,
      dmaCount: risingTerm?.dmaCount ?? null,
      snapshotDigest: collection.snapshotDigest,
    };
  });
}

export function enrichResearchWithGoogleTrends(research, collection) {
  if (!isRecord(research)) {
    throw new Error("Research document must be an object");
  }
  if (
    Object.hasOwn(research, "trendCollection") ||
    Object.hasOwn(research, "trendSignals")
  ) {
    throw new Error(
      "Refusing to overwrite existing trendCollection or trendSignals",
    );
  }
  if (!Array.isArray(research.candidates)) {
    throw new Error("Research document candidates must be an array");
  }
  const researchDate = String(research.date || "");
  const collectedAt = new Date(collection?.collectedAt || "");
  if (!isIsoDate(researchDate) ||
    collection?.query?.asOfDate !== researchDate ||
    !Number.isFinite(collectedAt.getTime()) ||
    shanghaiDate(collectedAt) !== researchDate) {
    throw new Error(
      "Google Trends collection date must match the research document and collection day",
    );
  }
  const candidates = research.candidates.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.keyword !== "string") {
      throw new Error(`Research candidate ${index + 1} needs a keyword`);
    }
    return candidate.keyword;
  });
  return {
    ...research,
    trendCollection: collection,
    trendSignals: trendSignalsFromCollection(collection, candidates),
  };
}

export function researchCandidateKeywords(research) {
  if (!isRecord(research) || !Array.isArray(research.candidates)) {
    throw new Error("Research document candidates must be an array");
  }
  if (
    Object.hasOwn(research, "trendCollection") ||
    Object.hasOwn(research, "trendSignals")
  ) {
    throw new Error(
      "Refusing to overwrite existing trendCollection or trendSignals",
    );
  }
  return research.candidates.map((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.keyword !== "string") {
      throw new Error(`Research candidate ${index + 1} needs a keyword`);
    }
    return candidate.keyword;
  });
}

export function readResearchDocument(path) {
  const absolutePath = resolve(path);
  if (!absolutePath.toLowerCase().endsWith(".json") || !existsSync(absolutePath)) {
    throw new Error("Research JSON file does not exist");
  }
  let research;
  try {
    research = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    throw new Error("Research JSON file is invalid");
  }
  return { absolutePath, research };
}

export function atomicEnrichResearchFile(path, collection) {
  if (collection?.state !== "observed") {
    throw new Error(
      "Refusing to persist an unavailable Google Trends collection; retry collection after recovery",
    );
  }
  const { absolutePath, research } = readResearchDocument(path);
  const original = readFileSync(absolutePath, "utf8");
  const enriched = enrichResearchWithGoogleTrends(research, collection);
  const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(enriched, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    if (readFileSync(absolutePath, "utf8") !== original) {
      throw new Error(
        "Research JSON changed during Google Trends enrichment",
      );
    }
    renameSync(temporaryPath, absolutePath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return { absolutePath, research: enriched };
}

export const googleTrendsQueryContract = Object.freeze({
  location: queryLocation,
  maximumBytesBilled,
  queryTimeoutMs,
  maximumRowsPerTable,
  topTermsSql,
  topRisingTermsSql,
});
