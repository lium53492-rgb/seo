import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type FeedbackEntry = {
  id: string;
  createdAt: string;
  message: string;
  source: "workbench";
  kind: "content_guidance";
};

type GithubContent = { content?: string; encoding?: string; sha?: string };
const githubRequestTimeoutMs = 5_000;

function githubFetch(input: string, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(githubRequestTimeoutMs),
  });
}

function shanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function githubConfig() {
  return {
    token: process.env.GITHUB_REPORTS_TOKEN,
    repository: process.env.GITHUB_REPORTS_REPO || "lium53492-rgb/seo",
    branch: process.env.GITHUB_REPORTS_BRANCH || "main",
  };
}

function githubHeaders(token: string) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  };
}

async function readEntries(path: string) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { entries?: FeedbackEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function persistWorkbenchFeedback(message: string) {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length < 4 || trimmed.length > 2_000) {
    throw new Error("反馈需为 4–2000 个字符。");
  }

  const entry: FeedbackEntry = {
    id: `feedback-${Date.now()}`,
    createdAt: new Date().toISOString(),
    message: trimmed,
    source: "workbench",
    kind: "content_guidance",
  };
  const date = shanghaiDate();
  const relativePath = `data/seo-feedback/inbox/${date}.json`;

  if (process.env.NODE_ENV !== "production") {
    const path = resolve(process.cwd(), relativePath);
    const entries = await readEntries(path);
    await mkdir(resolve(process.cwd(), "data/seo-feedback/inbox"), { recursive: true });
    await writeFile(path, `${JSON.stringify({ date, entries: [...entries, entry] }, null, 2)}\n`, "utf8");
    return { persisted: true, path: relativePath, destination: "local" as const };
  }

  const { token, repository, branch } = githubConfig();
  if (!token) {
    throw new Error("工作台反馈存储未配置：需要 GITHUB_REPORTS_TOKEN 才能写入下一次生产输入。");
  }
  const endpoint = `https://api.github.com/repos/${repository}/contents/${relativePath}`;
  const headers = githubHeaders(token);
  const current = await githubFetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, {
    headers,
    cache: "no-store",
  });
  let existing: GithubContent = {};
  let entries: FeedbackEntry[] = [];
  if (current.ok) {
    existing = (await current.json()) as GithubContent;
    if (existing.content && existing.encoding === "base64") {
      const decoded = Buffer.from(existing.content.replace(/\n/g, ""), "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as { entries?: FeedbackEntry[] };
      entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    }
  } else if (current.status !== 404) {
    throw new Error(`反馈文件读取失败：GitHub ${current.status}`);
  }
  const body = JSON.stringify({ date, entries: [...entries, entry] }, null, 2) + "\n";
  const saved = await githubFetch(endpoint, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      message: `data: add SEO feedback ${date}`,
      content: Buffer.from(body).toString("base64"),
      branch,
      ...(existing.sha ? { sha: existing.sha } : {}),
    }),
    cache: "no-store",
  });
  if (!saved.ok) throw new Error(`反馈文件写入失败：GitHub ${saved.status}`);
  return { persisted: true, path: relativePath, destination: "github" as const };
}
