import "server-only";

import type { DailySeoReport } from "./types";

type GithubContent = {
  sha?: string;
  content?: string;
  encoding?: string;
  name?: string;
  path?: string;
  type?: string;
};

const DEFAULT_REPORTS_REPO = "lium53492-rgb/seo";

function githubConfig() {
  return {
    token: process.env.GITHUB_REPORTS_TOKEN,
    repository: process.env.GITHUB_REPORTS_REPO || DEFAULT_REPORTS_REPO,
    branch: process.env.GITHUB_REPORTS_BRANCH || "main",
  };
}

function headers(token?: string) {
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchStoredReport(path: string) {
  const { token, repository, branch } = githubConfig();
  const response = await fetch(
    `https://api.github.com/repos/${repository}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: headers(token), cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub report read failed: ${response.status}`);
  const item = (await response.json()) as GithubContent;
  if (!item.content || item.encoding !== "base64") return null;
  const json = Buffer.from(item.content.replace(/\n/g, ""), "base64").toString("utf8");
  return JSON.parse(json) as DailySeoReport;
}

export async function readLatestReport() {
  const { token, repository, branch } = githubConfig();
  const response = await fetch(
    `https://api.github.com/repos/${repository}/contents/data/reports?ref=${encodeURIComponent(branch)}`,
    { headers: headers(token), cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub report list failed: ${response.status}`);
  const items = (await response.json()) as GithubContent[];
  const latest = items
    .filter((item) => item.type === "file" && /^\d{4}-\d{2}-\d{2}\.json$/.test(item.name ?? ""))
    .sort((left, right) => (right.name ?? "").localeCompare(left.name ?? ""))[0];
  return latest?.path ? fetchStoredReport(latest.path) : null;
}

export async function persistReport(report: DailySeoReport) {
  const { token, repository, branch } = githubConfig();
  if (!token) {
    return {
      persisted: false,
      reason: "github_token_not_configured",
      repository,
    };
  }

  const path = `data/reports/${report.date}.json`;
  const endpoint = `https://api.github.com/repos/${repository}/contents/${path}`;
  const requestHeaders = headers(token);
  const existingResponse = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, {
    headers: requestHeaders,
    cache: "no-store",
  });
  let existing: GithubContent = {};
  if (existingResponse.ok) existing = (await existingResponse.json()) as GithubContent;
  if (!existingResponse.ok && existingResponse.status !== 404) {
    throw new Error(`GitHub report lookup failed: ${existingResponse.status}`);
  }

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { ...requestHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: `data: daily SEO report ${report.date}`,
      content: Buffer.from(`${JSON.stringify(report, null, 2)}\n`).toString("base64"),
      branch,
      ...(existing.sha ? { sha: existing.sha } : {}),
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub report write failed: ${response.status}`);
  return {
    persisted: true,
    path,
    repository,
    draftIncluded: Boolean(report.draft),
  };
}
