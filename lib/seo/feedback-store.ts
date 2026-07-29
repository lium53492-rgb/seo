import "server-only";

import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  MarkWorkbenchFeedbackConsumedInput,
  WorkbenchFeedbackEntry,
  WorkbenchFeedbackQueueSummary,
} from "./types";

type FeedbackDocument = {
  date: string;
  entries: WorkbenchFeedbackEntry[];
  [key: string]: unknown;
};

type GithubContent = {
  content?: string;
  encoding?: string;
  sha?: string;
  name?: string;
  type?: string;
};

type MutationResult = {
  document: FeedbackDocument;
  entry: WorkbenchFeedbackEntry;
  changed: boolean;
};

const feedbackInboxPath = "data/seo-feedback/inbox";
const githubRequestTimeoutMs = 5_000;
const githubMutationAttempts = 4;
const feedbackDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const feedbackIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
let localStorageQueue: Promise<void> = Promise.resolve();

export class FeedbackInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackInputError";
  }
}

export class FeedbackNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackNotFoundError";
  }
}

export class FeedbackConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackConflictError";
  }
}

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

function validateDate(date: string) {
  if (!feedbackDatePattern.test(date)) {
    throw new FeedbackInputError("反馈日期必须使用 YYYY-MM-DD 格式。");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new FeedbackInputError("反馈日期无效。");
  }
  return date;
}

function validateId(id: string) {
  if (!feedbackIdPattern.test(id)) {
    throw new FeedbackInputError("反馈 ID 无效。");
  }
  return id;
}

function validateMessage(message: string) {
  if (typeof message !== "string") {
    throw new FeedbackInputError("反馈内容必须是文本。");
  }
  const meaningfulLength = message.trim().length;
  if (meaningfulLength < 4 || message.length > 2_000) {
    throw new FeedbackInputError("反馈需包含 4–2,000 个有效字符。");
  }
  return message;
}

function validateRationale(rationale: string) {
  if (typeof rationale !== "string") {
    throw new FeedbackInputError("采用或拒绝理由必须是文本。");
  }
  const meaningfulLength = rationale.trim().length;
  if (meaningfulLength < 4 || rationale.length > 2_000) {
    throw new FeedbackInputError("采用或拒绝理由需包含 4–2,000 个有效字符。");
  }
  return rationale;
}

function normalizeConsumedAt(value = new Date().toISOString()) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new FeedbackInputError("consumedAt 必须是有效时间。");
  }
  return date.toISOString();
}

function isFeedbackEntry(value: unknown): value is WorkbenchFeedbackEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<WorkbenchFeedbackEntry>;
  const hasConsumptionField =
    entry.consumedAt !== undefined ||
    entry.decision !== undefined ||
    entry.rationale !== undefined;
  const consumptionFieldsAreValid = !hasConsumptionField || (
    typeof entry.consumedAt === "string" &&
    Number.isFinite(Date.parse(entry.consumedAt)) &&
    (entry.decision === "adopted" || entry.decision === "rejected") &&
    typeof entry.rationale === "string" &&
    entry.rationale.trim().length >= 4
  );
  return (
    typeof entry.id === "string" &&
    typeof entry.createdAt === "string" &&
    Number.isFinite(Date.parse(entry.createdAt)) &&
    typeof entry.message === "string" &&
    entry.message.trim().length > 0 &&
    entry.source === "workbench" &&
    entry.kind === "content_guidance" &&
    consumptionFieldsAreValid
  );
}

function emptyDocument(date: string): FeedbackDocument {
  return { date, entries: [] };
}

function parseDocument(raw: string, expectedDate: string, location: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`反馈文件不是有效 JSON：${location}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`反馈文件结构无效：${location}`);
  }
  const document = parsed as Partial<FeedbackDocument> & Record<string, unknown>;
  if (document.date !== expectedDate || !Array.isArray(document.entries)) {
    throw new Error(`反馈文件日期或 entries 结构无效：${location}`);
  }
  if (!document.entries.every(isFeedbackEntry)) {
    throw new Error(`反馈文件包含无效条目：${location}`);
  }
  const ids = new Set<string>();
  for (const entry of document.entries) {
    if (ids.has(entry.id)) {
      throw new Error(`反馈文件包含重复 ID：${location}`);
    }
    ids.add(entry.id);
  }
  return document as FeedbackDocument;
}

function assertWithin(root: string, target: string) {
  const pathFromRoot = relative(root, target);
  if (
    pathFromRoot === "" ||
    (!isAbsolute(pathFromRoot) &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..\\`) &&
      !pathFromRoot.startsWith("../"))
  ) {
    return;
  }
  throw new Error("反馈存储路径越出项目目录。");
}

function safeLocalInboxRoot() {
  const projectRoot = process.cwd();
  const inboxRoot = resolve(projectRoot, "data", "seo-feedback", "inbox");
  assertWithin(projectRoot, inboxRoot);
  return inboxRoot;
}

function localPathForDate(date: string) {
  const inboxRoot = safeLocalInboxRoot();
  const path = resolve(inboxRoot, `${validateDate(date)}.json`);
  assertWithin(inboxRoot, path);
  return { path };
}

async function readLocalDocument(path: string, date: string) {
  try {
    return parseDocument(await readFile(path, "utf8"), date, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDocument(date);
    throw error;
  }
}

async function atomicWriteLocalDocument(path: string, document: FeedbackDocument) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  assertWithin(dirname(path), temporaryPath);
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(document, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporaryPath, path);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
        throw cleanupError;
      }
    }
    throw error;
  }
}

async function withLocalStorageLock<T>(operation: () => Promise<T>) {
  const previous = localStorageQueue.catch(() => undefined);
  let release = () => {};
  const current = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  localStorageQueue = previous.then(() => current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function githubConfig() {
  const token = process.env.GITHUB_REPORTS_TOKEN;
  const repository = process.env.GITHUB_REPORTS_REPO || "lium53492-rgb/seo";
  const branch = process.env.GITHUB_REPORTS_BRANCH || "main";
  const repositoryParts = repository.split("/");
  const safeSegment = /^[A-Za-z0-9_.-]+$/;
  if (
    repositoryParts.length !== 2 ||
    !repositoryParts.every((part) =>
      safeSegment.test(part) && part !== "." && part !== ".."
    )
  ) {
    throw new Error("GITHUB_REPORTS_REPO 必须是安全的 owner/repository。");
  }
  if (
    !branch ||
    branch.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(branch)
  ) {
    throw new Error("GITHUB_REPORTS_BRANCH 无效。");
  }
  return { token, repository, branch };
}

function githubHeaders(token: string) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  };
}

function githubContentsEndpoint(repository: string, path: string) {
  const [owner, name] = repository.split("/");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodedPath}`;
}

function requireGithubConfig() {
  const config = githubConfig();
  if (!config.token) {
    throw new Error(
      "工作台反馈存储未配置：需要 GITHUB_REPORTS_TOKEN 才能读取或写入生产反馈队列。",
    );
  }
  return { ...config, token: config.token };
}

async function readGithubDocument(
  date: string,
  config: ReturnType<typeof requireGithubConfig>,
) {
  const relativePath = `${feedbackInboxPath}/${validateDate(date)}.json`;
  const endpoint = githubContentsEndpoint(config.repository, relativePath);
  const response = await githubFetch(
    `${endpoint}?ref=${encodeURIComponent(config.branch)}`,
    {
      headers: githubHeaders(config.token),
      cache: "no-store",
    },
  );
  if (response.status === 404) {
    return {
      endpoint,
      relativePath,
      document: emptyDocument(date),
      sha: undefined,
    };
  }
  if (!response.ok) {
    throw new Error(`反馈文件读取失败：GitHub ${response.status}`);
  }
  const content = (await response.json()) as GithubContent;
  if (!content.content || content.encoding !== "base64" || !content.sha) {
    throw new Error(`反馈文件内容无效：${relativePath}`);
  }
  const decoded = Buffer.from(content.content.replace(/\n/g, ""), "base64").toString("utf8");
  return {
    endpoint,
    relativePath,
    document: parseDocument(decoded, date, relativePath),
    sha: content.sha,
  };
}

async function mutateGithubDocument(
  date: string,
  commitMessage: string,
  mutation: (document: FeedbackDocument) => MutationResult,
) {
  const config = requireGithubConfig();
  for (let attempt = 0; attempt < githubMutationAttempts; attempt += 1) {
    const current = await readGithubDocument(date, config);
    const result = mutation(current.document);
    if (!result.changed) {
      return { result, relativePath: current.relativePath };
    }
    const body = `${JSON.stringify(result.document, null, 2)}\n`;
    const response = await githubFetch(current.endpoint, {
      method: "PUT",
      headers: {
        ...githubHeaders(config.token),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(body).toString("base64"),
        branch: config.branch,
        ...(current.sha ? { sha: current.sha } : {}),
      }),
      cache: "no-store",
    });
    if (response.ok) {
      return { result, relativePath: current.relativePath };
    }
    if (
      (response.status === 409 || response.status === 422) &&
      attempt + 1 < githubMutationAttempts
    ) {
      continue;
    }
    throw new Error(`反馈文件写入失败：GitHub ${response.status}`);
  }
  throw new Error("反馈文件写入失败：GitHub 并发更新重试已耗尽。");
}

async function mutateLocalDocument(
  date: string,
  mutation: (document: FeedbackDocument) => MutationResult,
) {
  const { path } = localPathForDate(date);
  return withLocalStorageLock(async () => {
    const result = mutation(await readLocalDocument(path, date));
    if (result.changed) {
      await atomicWriteLocalDocument(path, result.document);
    }
    return {
      result,
      relativePath: `${feedbackInboxPath}/${date}.json`,
    };
  });
}

function appendEntry(entry: WorkbenchFeedbackEntry) {
  return (document: FeedbackDocument): MutationResult => {
    const existing = document.entries.find((item) => item.id === entry.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(entry)) {
        throw new FeedbackConflictError(`反馈 ID 已存在：${entry.id}`);
      }
      return { document, entry: existing, changed: false };
    }
    return {
      document: {
        ...document,
        entries: [...document.entries, entry],
      },
      entry,
      changed: true,
    };
  };
}

function consumeEntry(input: MarkWorkbenchFeedbackConsumedInput) {
  const id = validateId(input.id);
  const decision = input.decision;
  if (decision !== "adopted" && decision !== "rejected") {
    throw new FeedbackInputError("反馈处理结果必须是 adopted 或 rejected。");
  }
  const rationale = validateRationale(input.rationale);
  const requestedConsumedAt = normalizeConsumedAt(input.consumedAt);

  return (document: FeedbackDocument): MutationResult => {
    const index = document.entries.findIndex((entry) => entry.id === id);
    if (index < 0) {
      throw new FeedbackNotFoundError(`未找到反馈：${id}`);
    }
    const existing = document.entries[index];
    if (existing.decision !== undefined && existing.decision !== decision) {
      throw new FeedbackConflictError(`反馈已用不同结果处理：${id}`);
    }
    if (existing.rationale !== undefined && existing.rationale !== rationale) {
      throw new FeedbackConflictError(`反馈已用不同理由处理：${id}`);
    }
    if (
      existing.consumedAt &&
      existing.decision !== undefined &&
      existing.rationale !== undefined
    ) {
      return { document, entry: existing, changed: false };
    }
    const consumed: WorkbenchFeedbackEntry = {
      ...existing,
      consumedAt: existing.consumedAt
        ? normalizeConsumedAt(existing.consumedAt)
        : requestedConsumedAt,
      decision,
      rationale,
    };
    return {
      document: {
        ...document,
        entries: document.entries.map((entry, entryIndex) =>
          entryIndex === index ? consumed : entry
        ),
      },
      entry: consumed,
      changed: true,
    };
  };
}

function pendingEntries(documents: FeedbackDocument[]) {
  return documents
    .flatMap((document) =>
      document.entries
        .filter((entry) => !entry.consumedAt)
        .map((entry) => ({ ...entry, date: document.date }))
    )
    .sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    );
}

async function listLocalDocuments() {
  const inboxRoot = safeLocalInboxRoot();
  return withLocalStorageLock(async () => {
    let names: string[];
    try {
      names = (await readdir(inboxRoot, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return Promise.all(names.map(async (name) => {
      const date = name.slice(0, 10);
      const { path } = localPathForDate(date);
      return readLocalDocument(path, date);
    }));
  });
}

async function listGithubDocuments() {
  const config = requireGithubConfig();
  const endpoint = githubContentsEndpoint(config.repository, feedbackInboxPath);
  const response = await githubFetch(
    `${endpoint}?ref=${encodeURIComponent(config.branch)}`,
    {
      headers: githubHeaders(config.token),
      cache: "no-store",
    },
  );
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`反馈队列读取失败：GitHub ${response.status}`);
  }
  const listing = (await response.json()) as GithubContent[];
  if (!Array.isArray(listing)) {
    throw new Error("反馈队列目录结构无效。");
  }
  const dates = listing
    .filter((item) =>
      item.type === "file" &&
      typeof item.name === "string" &&
      /^\d{4}-\d{2}-\d{2}\.json$/.test(item.name)
    )
    .map((item) => item.name!.slice(0, 10))
    .sort();
  return Promise.all(dates.map(async (date) =>
    (await readGithubDocument(date, config)).document
  ));
}

export async function persistWorkbenchFeedback(message: string) {
  const originalMessage = validateMessage(message);
  const now = new Date();
  const date = shanghaiDate(now);
  const entry: WorkbenchFeedbackEntry = {
    id: `feedback-${Date.now()}-${randomUUID()}`,
    createdAt: now.toISOString(),
    message: originalMessage,
    source: "workbench",
    kind: "content_guidance",
  };
  const commitMessage = `data: add SEO feedback ${date}`;
  const stored = process.env.NODE_ENV === "production"
    ? await mutateGithubDocument(date, commitMessage, appendEntry(entry))
    : await mutateLocalDocument(date, appendEntry(entry));
  return {
    persisted: true,
    path: stored.relativePath,
    destination: process.env.NODE_ENV === "production" ? "github" as const : "local" as const,
    entry: stored.result.entry,
  };
}

export async function listUnconsumedFeedback(): Promise<WorkbenchFeedbackQueueSummary> {
  const destination = process.env.NODE_ENV === "production" ? "github" as const : "local" as const;
  const documents = destination === "github"
    ? await listGithubDocuments()
    : await listLocalDocuments();
  const entries = pendingEntries(documents);
  return {
    pendingCount: entries.length,
    entries,
    destination,
  };
}

export async function markFeedbackConsumed(input: MarkWorkbenchFeedbackConsumedInput) {
  const date = validateDate(input.date);
  const mutation = consumeEntry(input);
  const commitMessage = `data: consume SEO feedback ${input.id}`;
  const stored = process.env.NODE_ENV === "production"
    ? await mutateGithubDocument(date, commitMessage, mutation)
    : await mutateLocalDocument(date, mutation);
  return {
    updated: stored.result.changed,
    path: stored.relativePath,
    destination: process.env.NODE_ENV === "production" ? "github" as const : "local" as const,
    entry: stored.result.entry,
  };
}
