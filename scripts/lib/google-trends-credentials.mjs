import { createPrivateKey, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

export const GOOGLE_TRENDS_ENV_KEYS = Object.freeze([
  "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID",
  "GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL",
  "GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY",
]);

const MAX_SERVICE_ACCOUNT_BYTES = 256 * 1024;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const CLIENT_EMAIL_PATTERN =
  /^[a-z0-9][a-z0-9._-]{0,126}@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/i;

function assertCredential(condition, message) {
  if (!condition) throw new Error(`Google Trends credential configuration failed: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedPrivateKey(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

export function validateGoogleServiceAccount(value) {
  assertCredential(isRecord(value), "credential JSON must contain an object");
  assertCredential(value.type === "service_account", "type must be service_account");

  const projectId = typeof value.project_id === "string" ? value.project_id.trim() : "";
  assertCredential(PROJECT_ID_PATTERN.test(projectId), "project_id is invalid");

  const clientEmail = typeof value.client_email === "string"
    ? value.client_email.trim().toLowerCase()
    : "";
  assertCredential(CLIENT_EMAIL_PATTERN.test(clientEmail), "client_email is invalid");
  assertCredential(
    clientEmail.endsWith(`@${projectId}.iam.gserviceaccount.com`),
    "client_email does not belong to project_id",
  );

  const privateKey = normalizedPrivateKey(value.private_key);
  assertCredential(
    privateKey.startsWith("-----BEGIN PRIVATE KEY-----\n") &&
      privateKey.endsWith("\n-----END PRIVATE KEY-----"),
    "private_key must be a PKCS#8 PEM private key",
  );
  try {
    const parsedKey = createPrivateKey(privateKey);
    assertCredential(
      parsedKey.type === "private" && parsedKey.asymmetricKeyType === "rsa",
      "private_key must be an RSA private key",
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Google Trends credential configuration failed:")) {
      throw error;
    }
    throw new Error(
      "Google Trends credential configuration failed: private_key is not a valid PEM private key",
    );
  }

  return { projectId, clientEmail, privateKey };
}

export function readGoogleServiceAccount(path, { workspaceRoot = process.cwd() } = {}) {
  assertCredential(typeof path === "string" && path.trim().length > 0,
    "a service-account JSON path is required");
  const absolutePath = resolve(workspaceRoot, path);
  let file;
  try {
    file = lstatSync(absolutePath);
  } catch {
    throw new Error("Google Trends credential configuration failed: credential JSON file was not found");
  }
  assertCredential(file.isFile() && !file.isSymbolicLink(),
    "credential JSON path must be a regular file");
  assertCredential(file.size > 0 && file.size <= MAX_SERVICE_ACCOUNT_BYTES,
    "credential JSON file size is invalid");

  let parsed;
  try {
    const source = readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "");
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Google Trends credential configuration failed: credential file is not valid JSON");
  }
  return validateGoogleServiceAccount(parsed);
}

function lineEndAfter(content, index) {
  const newline = content.indexOf("\n", index);
  return newline === -1 ? content.length : newline + 1;
}

function hasUnescapedClosingQuote(content, start, quote) {
  for (let index = start; index < content.length; index += 1) {
    if (content[index] !== quote) continue;
    if (quote === "'") return index;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= start && content[cursor] === "\\"; cursor -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}

function assignmentValueIsNonEmpty(rawValue, quoteEnd, quoteStart) {
  const trimmed = rawValue.trimStart();
  if (trimmed.startsWith("\"") || trimmed.startsWith("'")) {
    return quoteEnd > quoteStart + 1;
  }
  return trimmed.replace(/#.*$/u, "").trim().length > 0;
}

function parseTargetAssignments(content) {
  const assignments = new Map();
  let lineStart = 0;
  while (lineStart < content.length) {
    const lineEnd = lineEndAfter(content, lineStart);
    const line = content.slice(lineStart, lineEnd).replace(/(?:\r?\n)$/u, "");
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=([\s\S]*)$/u);
    const key = match?.[1];
    if (!key || !GOOGLE_TRENDS_ENV_KEYS.includes(key)) {
      lineStart = lineEnd;
      continue;
    }
    assertCredential(!assignments.has(key), `duplicate ${key} assignments in .env.local`);

    const equalsOffset = line.indexOf("=", match.index || 0);
    const valueStart = lineStart + equalsOffset + 1;
    const rawValue = content.slice(valueStart, lineEnd).replace(/(?:\r?\n)$/u, "");
    const trimmedOffset = rawValue.length - rawValue.trimStart().length;
    const quote = rawValue[trimmedOffset];
    let spanEnd = lineEnd;
    let quoteEnd = -1;
    let quoteStart = -1;
    if (quote === "\"" || quote === "'") {
      quoteStart = valueStart + trimmedOffset;
      quoteEnd = hasUnescapedClosingQuote(content, quoteStart + 1, quote);
      assertCredential(quoteEnd !== -1, `${key} has an unterminated quoted value in .env.local`);
      spanEnd = lineEndAfter(content, quoteEnd);
    }
    assignments.set(key, {
      start: lineStart,
      end: spanEnd,
      nonEmpty: assignmentValueIsNonEmpty(rawValue, quoteEnd, quoteStart),
    });
    lineStart = spanEnd;
  }
  return assignments;
}

function serializedValues(credentials) {
  return new Map([
    ["GOOGLE_TRENDS_BIGQUERY_PROJECT_ID", credentials.projectId],
    ["GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL", credentials.clientEmail],
    [
      "GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY",
      credentials.privateKey.replace(/\n/g, "\\n"),
    ],
  ]);
}

function replaceEnvValues(original, credentials, { force = false } = {}) {
  const hasBom = original.startsWith("\uFEFF");
  const content = hasBom ? original.slice(1) : original;
  const assignments = parseTargetAssignments(content);
  const conflicting = GOOGLE_TRENDS_ENV_KEYS.filter((key) => assignments.get(key)?.nonEmpty);
  assertCredential(
    force || conflicting.length === 0,
    `refusing to overwrite non-empty ${conflicting.join(", ")}; rerun with --force only if replacement is intended`,
  );

  const values = serializedValues(credentials);
  let updated = content;
  const replacements = GOOGLE_TRENDS_ENV_KEYS
    .filter((key) => assignments.has(key))
    .map((key) => ({ key, ...assignments.get(key) }))
    .sort((left, right) => right.start - left.start);
  for (const replacement of replacements) {
    const previous = content.slice(replacement.start, replacement.end);
    const ending = previous.endsWith("\r\n") ? "\r\n" : previous.endsWith("\n") ? "\n" : "";
    const line = `${replacement.key}=${values.get(replacement.key)}${ending}`;
    updated = `${updated.slice(0, replacement.start)}${line}${updated.slice(replacement.end)}`;
  }

  const missing = GOOGLE_TRENDS_ENV_KEYS.filter((key) => !assignments.has(key));
  if (missing.length) {
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    if (updated.length && !updated.endsWith("\n")) updated += newline;
    updated += missing.map((key) => `${key}=${values.get(key)}`).join(newline) + newline;
  }
  return {
    content: `${hasBom ? "\uFEFF" : ""}${updated}`,
    overwritten: force && conflicting.length > 0,
  };
}

function currentEnvContent(path) {
  if (!existsSync(path)) return null;
  const info = lstatSync(path);
  assertCredential(info.isFile() && !info.isSymbolicLink(), ".env.local must be a regular file");
  return readFileSync(path, "utf8");
}

function atomicWriteEnv(path, expected, content) {
  const lockPath = `${path}.trends-config.lock`;
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let lockDescriptor;
  let ownsLock = false;
  let temporaryDescriptor;
  try {
    try {
      lockDescriptor = openSync(lockPath, "wx", 0o600);
      ownsLock = true;
    } catch {
      throw new Error(
        "Google Trends credential configuration failed: another credential update is in progress",
      );
    }
    const beforeWrite = currentEnvContent(path);
    assertCredential(beforeWrite === expected, ".env.local changed during configuration; retry safely");

    temporaryDescriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(temporaryDescriptor, content, "utf8");
    fsyncSync(temporaryDescriptor);
    closeSync(temporaryDescriptor);
    temporaryDescriptor = undefined;

    const beforeRename = currentEnvContent(path);
    assertCredential(beforeRename === expected, ".env.local changed during configuration; retry safely");
    renameSync(temporaryPath, path);
    if (process.platform !== "win32") chmodSync(path, 0o600);
  } finally {
    if (temporaryDescriptor !== undefined) closeSync(temporaryDescriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    if (lockDescriptor !== undefined) closeSync(lockDescriptor);
    if (ownsLock && existsSync(lockPath)) unlinkSync(lockPath);
  }
}

export function configureGoogleTrendsCredentials({
  credentialPath,
  workspaceRoot = process.cwd(),
  force = false,
} = {}) {
  const root = resolve(workspaceRoot);
  assertCredential(existsSync(resolve(root, "package.json")),
    "run this command from the SEO project worktree");
  const credentials = readGoogleServiceAccount(credentialPath, { workspaceRoot: root });
  const envPath = resolve(root, ".env.local");
  const original = currentEnvContent(envPath);
  const next = replaceEnvValues(original || "", credentials, { force });
  if (next.content !== original) atomicWriteEnv(envPath, original, next.content);
  return {
    status: "configured",
    envFile: ".env.local",
    variables: [...GOOGLE_TRENDS_ENV_KEYS],
    overwritten: next.overwritten,
  };
}
