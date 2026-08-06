import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const repository = process.env.GITHUB_REPORTS_REPO || "lium53492-rgb/seo";
const branch = process.env.GITHUB_REPORTS_BRANCH || "main";
const token = process.env.GITHUB_REPORTS_TOKEN;
const safeRepository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const safeBranch = /^[A-Za-z0-9._/-]+$/;
const inboxPrefix = "data/seo-feedback/inbox";

if (
  !safeRepository.test(repository) ||
  !safeBranch.test(branch) ||
  branch.includes("..")
) {
  throw new Error("GitHub feedback repository or branch configuration is invalid");
}

function githubHeaders() {
  return {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function githubFetch(url) {
  return fetch(url, {
    headers: githubHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function fetchedOriginFeedbackFiles() {
  const originUrl = gitOutput(["remote", "get-url", "origin"]);
  const normalizedOrigin = String(originUrl || "")
    .toLowerCase()
    .replace(/^git@/, "")
    .replace(/:/, "/")
    .replace(/\.git$/, "");
  if (!normalizedOrigin.endsWith(`github.com/${repository.toLowerCase()}`)) return null;
  const ref = `refs/remotes/origin/${branch}`;
  if (!gitOutput(["rev-parse", "--verify", ref])) return null;
  const names = gitOutput(["ls-tree", "-r", "--name-only", ref, "--", inboxPrefix]);
  if (names === null) return null;
  return names
    .split(/\r?\n/)
    .filter((path) => /^data\/seo-feedback\/inbox\/\d{4}-\d{2}-\d{2}\.json$/.test(path))
    .sort()
    .map((path) => {
      const raw = gitOutput(["show", `${ref}:${path}`]);
      if (raw === null) throw new Error(`Fetched origin feedback read failed: ${path}`);
      return { path, raw };
    });
}

function parseDocument(raw, date, source) {
  const document = JSON.parse(raw);
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    document.date !== date ||
    !Array.isArray(document.entries)
  ) {
    throw new Error(`Invalid feedback document: ${source}`);
  }
  const ids = new Set();
  for (const entry of document.entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof entry.id !== "string" ||
      !entry.id ||
      ids.has(entry.id) ||
      typeof entry.createdAt !== "string" ||
      !Number.isFinite(Date.parse(entry.createdAt)) ||
      typeof entry.message !== "string" ||
      !entry.message.trim() ||
      (entry.source !== "workbench" && entry.source !== "codex_chat") ||
      entry.kind !== "content_guidance"
    ) {
      throw new Error(`Invalid feedback entry: ${source}`);
    }
    const hasConsumption =
      entry.consumedAt !== undefined ||
      entry.decision !== undefined ||
      entry.rationale !== undefined;
    if (hasConsumption && !(
      typeof entry.consumedAt === "string" &&
      Number.isFinite(Date.parse(entry.consumedAt)) &&
      (entry.decision === "adopted" || entry.decision === "rejected") &&
      typeof entry.rationale === "string" &&
      entry.rationale.trim().length >= 4
    )) {
      throw new Error(`Invalid feedback consumption record: ${source}`);
    }
    ids.add(entry.id);
  }
  return document;
}

function sameSourceEntry(left, right) {
  return left.id === right.id &&
    left.createdAt === right.createdAt &&
    left.message === right.message &&
    left.source === right.source &&
    left.kind === right.kind;
}

function mergeEntry(local, remote, source) {
  if (!sameSourceEntry(local, remote)) {
    throw new Error(`Conflicting feedback entry identity: ${source}#${remote.id}`);
  }
  const localConsumed = Boolean(local.consumedAt);
  const remoteConsumed = Boolean(remote.consumedAt);
  if (localConsumed && remoteConsumed && (
    local.decision !== remote.decision ||
    local.rationale !== remote.rationale
  )) {
    throw new Error(`Conflicting feedback decision: ${source}#${remote.id}`);
  }
  if (remoteConsumed) return remote;
  if (localConsumed) return local;
  return remote;
}

function mergeDocuments(local, remote, source) {
  const merged = new Map(local.entries.map((entry) => [entry.id, entry]));
  for (const entry of remote.entries) {
    const existing = merged.get(entry.id);
    merged.set(entry.id, existing ? mergeEntry(existing, entry, source) : entry);
  }
  return {
    date: remote.date,
    entries: [...merged.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
    ),
  };
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

const listUrl =
  `https://api.github.com/repos/${repository}/contents/${inboxPrefix}?ref=${encodeURIComponent(branch)}`;
const listingResponse = await githubFetch(listUrl);
if (listingResponse.status === 404) {
  process.stdout.write("Feedback sync complete: remote inbox is empty.\n");
  process.exitCode = 0;
} else {
  if (!listingResponse.ok) {
    const fallbackFiles = listingResponse.status === 403
      ? fetchedOriginFeedbackFiles()
      : null;
    if (fallbackFiles !== null) {
      let remoteEntries = 0;
      let writtenFiles = 0;
      for (const { path, raw } of fallbackFiles) {
        const name = path.slice(path.lastIndexOf("/") + 1);
        const date = name.slice(0, 10);
        const remote = parseDocument(raw, date, path);
        const localPath = resolve("data", "seo-feedback", "inbox", name);
        const local = existsSync(localPath)
          ? parseDocument(readFileSync(localPath, "utf8"), date, localPath)
          : { date, entries: [] };
        const merged = mergeDocuments(local, remote, path);
        remoteEntries += remote.entries.length;
        const nextRaw = `${JSON.stringify(merged, null, 2)}\n`;
        const previousRaw = existsSync(localPath) ? readFileSync(localPath, "utf8") : "";
        if (nextRaw !== previousRaw) {
          writeJsonAtomic(localPath, merged);
          writtenFiles += 1;
        }
      }
      process.stdout.write(
        `Feedback sync complete from fetched origin after GitHub API 403: ${remoteEntries} remote entries, ${writtenFiles} local files updated.\n`,
      );
      process.exit(0);
    }
    throw new Error(`GitHub feedback list failed: ${listingResponse.status}`);
  }
  const listing = await listingResponse.json();
  if (!Array.isArray(listing)) throw new Error("GitHub feedback listing is invalid");

  let remoteEntries = 0;
  let writtenFiles = 0;
  for (const item of listing) {
    if (
      item?.type !== "file" ||
      typeof item.name !== "string" ||
      !/^\d{4}-\d{2}-\d{2}\.json$/.test(item.name) ||
      typeof item.path !== "string" ||
      item.path !== `${inboxPrefix}/${item.name}`
    ) {
      continue;
    }
    const date = item.name.slice(0, 10);
    const contentUrl =
      `https://api.github.com/repos/${repository}/contents/${item.path}?ref=${encodeURIComponent(branch)}`;
    const contentResponse = await githubFetch(contentUrl);
    if (!contentResponse.ok) {
      throw new Error(`GitHub feedback read failed: ${contentResponse.status}`);
    }
    const content = await contentResponse.json();
    if (content?.encoding !== "base64" || typeof content.content !== "string") {
      throw new Error(`GitHub feedback content is invalid: ${item.path}`);
    }
    const remote = parseDocument(
      Buffer.from(content.content.replace(/\n/g, ""), "base64").toString("utf8"),
      date,
      item.path,
    );
    const localPath = resolve("data", "seo-feedback", "inbox", item.name);
    const local = existsSync(localPath)
      ? parseDocument(readFileSync(localPath, "utf8"), date, localPath)
      : { date, entries: [] };
    const merged = mergeDocuments(local, remote, item.path);
    remoteEntries += remote.entries.length;
    const nextRaw = `${JSON.stringify(merged, null, 2)}\n`;
    const previousRaw = existsSync(localPath) ? readFileSync(localPath, "utf8") : "";
    if (nextRaw !== previousRaw) {
      writeJsonAtomic(localPath, merged);
      writtenFiles += 1;
    }
  }
  process.stdout.write(
    `Feedback sync complete: ${remoteEntries} remote entries, ${writtenFiles} local files updated.\n`,
  );
}
