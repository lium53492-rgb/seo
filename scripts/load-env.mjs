import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {
  basename,
  dirname,
  join,
  normalize,
  resolve,
} from "node:path";
import { parseEnv } from "node:util";

import nextEnv from "@next/env";

const MAX_GIT_METADATA_BYTES = 4 * 1024;
const MAX_SHARED_ENV_BYTES = 256 * 1024;

// Only project configuration used by repository-owned automation may cross the
// linked-worktree boundary. Runtime state and arbitrary variables stay local.
const SHARED_WORKTREE_ENV_KEYS = Object.freeze([
  "NEXT_PUBLIC_SITE_URL",
  "NOVELAI_DESTINATION_URL",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
  "WORKBENCH_PASSWORD",
  "SEO_AUTOMATION_TOKEN",
  "ATTRIBUTION_SECRET",
  "CRON_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "VERCEL_ANALYTICS_TOKEN",
  "VERCEL_ANALYTICS_PROJECT_ID",
  "VERCEL_ANALYTICS_TEAM_ID",
  "VERCEL_TOKEN",
  "VERCEL_PROJECT_ID",
  "VERCEL_TEAM_ID",
  "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL",
  "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY",
  "GOOGLE_SEARCH_CONSOLE_SITE_URL",
  "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID",
  "GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL",
  "GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY",
  "ATTRIBUTION_SINK_URL",
  "ATTRIBUTION_SINK_TOKEN",
  "SEO_REPORT_SITE_URL",
  "GITHUB_REPORTS_TOKEN",
  "GITHUB_REPORTS_REPO",
  "GITHUB_REPORTS_BRANCH",
]);

function samePath(left, right) {
  const normalizeForComparison = (value) => {
    const normalized = normalize(resolve(value));
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  return normalizeForComparison(left) === normalizeForComparison(right);
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs;
}

function safeDirectory(path) {
  try {
    const resolvedPath = resolve(path);
    const info = lstatSync(resolvedPath);
    if (!info.isDirectory() || info.isSymbolicLink()) return null;
    const realPath = realpathSync.native(resolvedPath);
    if (!samePath(realPath, resolvedPath)) return null;
    return realPath;
  } catch {
    return null;
  }
}

function readSafeRegularFile(path, maximumBytes) {
  let descriptor;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > maximumBytes) {
      return null;
    }
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size > maximumBytes) return null;
    const contents = readFileSync(descriptor, "utf8");
    const after = lstatSync(path);
    if (after.isSymbolicLink() || !sameFileIdentity(opened, after)) return null;
    const parent = safeDirectory(dirname(path));
    if (!parent) return null;
    const expectedRealPath = join(parent, basename(path));
    if (!samePath(realpathSync.native(path), expectedRealPath)) return null;
    return contents;
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function singleMetadataValue(contents, prefix = "") {
  if (typeof contents !== "string" || contents.includes("\0")) return null;
  const lines = contents.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== 1 || !lines[0].startsWith(prefix)) return null;
  const value = lines[0].slice(prefix.length).trim();
  return value && value === lines[0].slice(prefix.length) ? value : null;
}

function linkedWorktreeCommonRoot(cwd) {
  const cwdRoot = safeDirectory(cwd);
  if (!cwdRoot) return null;

  const dotGitPath = join(cwdRoot, ".git");
  const dotGitContents = readSafeRegularFile(dotGitPath, MAX_GIT_METADATA_BYTES);
  const gitDirValue = singleMetadataValue(dotGitContents, "gitdir: ");
  if (!gitDirValue) return null;

  const gitDirPath = resolve(cwdRoot, gitDirValue);
  const gitDir = safeDirectory(gitDirPath);
  if (!gitDir) return null;

  const commonDirContents = readSafeRegularFile(
    join(gitDir, "commondir"),
    MAX_GIT_METADATA_BYTES,
  );
  const commonDirValue = singleMetadataValue(commonDirContents);
  if (!commonDirValue) return null;

  const commonDir = safeDirectory(resolve(gitDir, commonDirValue));
  if (!commonDir || basename(commonDir) !== ".git") return null;

  const worktreesDirectory = safeDirectory(dirname(gitDir));
  if (!worktreesDirectory || basename(worktreesDirectory) !== "worktrees") return null;
  if (!samePath(dirname(worktreesDirectory), commonDir)) return null;

  const commonRoot = safeDirectory(dirname(commonDir));
  if (!commonRoot || samePath(commonRoot, cwdRoot)) return null;
  if (!samePath(join(commonRoot, ".git"), commonDir)) return null;

  const backLinkContents = readSafeRegularFile(
    join(gitDir, "gitdir"),
    MAX_GIT_METADATA_BYTES,
  );
  const backLinkValue = singleMetadataValue(backLinkContents);
  if (!backLinkValue) return null;
  const backLinkPath = resolve(gitDir, backLinkValue);
  const backLinkRealPath = readSafeRegularFile(
    backLinkPath,
    MAX_GIT_METADATA_BYTES,
  ) === null
    ? null
    : realpathSync.native(backLinkPath);
  if (!backLinkRealPath || !samePath(backLinkRealPath, dotGitPath)) return null;

  return commonRoot;
}

function configured(value) {
  return typeof value === "string" && value.trim() !== "";
}

function loadLinkedWorktreeSharedEnv(cwd) {
  const missingKeys = SHARED_WORKTREE_ENV_KEYS.filter(
    (key) => !configured(process.env[key]),
  );
  if (missingKeys.length === 0) return;

  const commonRoot = linkedWorktreeCommonRoot(cwd);
  if (!commonRoot) return;

  const sharedEnvContents = readSafeRegularFile(
    join(commonRoot, ".env.local"),
    MAX_SHARED_ENV_BYTES,
  );
  if (sharedEnvContents === null) return;

  let sharedEnv;
  try {
    sharedEnv = parseEnv(sharedEnvContents);
  } catch {
    return;
  }

  for (const key of missingKeys) {
    const value = sharedEnv[key];
    if (configured(value) && !configured(process.env[key])) {
      process.env[key] = value;
    }
  }
}

const cwd = process.cwd();
nextEnv.loadEnvConfig(cwd);
loadLinkedWorktreeSharedEnv(cwd);
