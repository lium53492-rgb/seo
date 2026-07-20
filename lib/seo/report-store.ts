import "server-only";

import type { DailySeoReport } from "./types";

type GithubContent = { sha?: string };

export async function persistReport(report: DailySeoReport) {
  const token = process.env.GITHUB_REPORTS_TOKEN;
  const repository = process.env.GITHUB_REPORTS_REPO;
  if (!token || !repository) return { persisted: false, reason: "github_not_configured" };

  const branch = process.env.GITHUB_REPORTS_BRANCH || "main";
  const path = `data/reports/${report.date}.json`;
  const endpoint = `https://api.github.com/repos/${repository}/contents/${path}`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  };

  const existingResponse = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, {
    headers,
    cache: "no-store",
  });
  let existing: GithubContent = {};
  if (existingResponse.ok) existing = (await existingResponse.json()) as GithubContent;
  if (!existingResponse.ok && existingResponse.status !== 404) {
    throw new Error(`GitHub report lookup failed: ${existingResponse.status}`);
  }

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      message: `data: daily SEO report ${report.date}`,
      content: Buffer.from(`${JSON.stringify(report, null, 2)}\n`).toString("base64"),
      branch,
      ...(existing.sha ? { sha: existing.sha } : {}),
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub report write failed: ${response.status}`);
  return { persisted: true, path };
}
