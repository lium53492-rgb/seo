import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  configureGoogleTrendsCredentials,
  validateGoogleServiceAccount,
} from "../scripts/lib/google-trends-credentials.mjs";

const cliPath = fileURLToPath(new URL("../scripts/configure-google-trends.mjs", import.meta.url));
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function fixture(overrides = {}) {
  return {
    type: "service_account",
    project_id: "lorelens-trends-123",
    client_email: "trends-reader@lorelens-trends-123.iam.gserviceaccount.com",
    private_key: privateKey,
    ...overrides,
  };
}

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "trends-credentials-"));
  writeFileSync(join(root, "package.json"), "{}\n");
  return root;
}

test("validates service-account type, project, email binding, and real RSA PEM", () => {
  assert.equal(validateGoogleServiceAccount(fixture()).projectId, "lorelens-trends-123");
  assert.throws(() => validateGoogleServiceAccount(fixture({ type: "authorized_user" })),
    /type must be service_account/);
  assert.throws(() => validateGoogleServiceAccount(fixture({ project_id: "INVALID PROJECT" })),
    /project_id is invalid/);
  assert.throws(() => validateGoogleServiceAccount(fixture({
    client_email: "reader@another-project.iam.gserviceaccount.com",
  })), /does not belong to project_id/);
  assert.throws(() => validateGoogleServiceAccount(fixture({
    private_key: "-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----",
  })), /not a valid PEM private key/);
});

test("atomically creates .env.local while preserving unrelated content", () => {
  const root = workspace();
  try {
    const credentials = join(root, "service-account.json");
    writeFileSync(credentials, `${JSON.stringify(fixture())}\n`);
    writeFileSync(join(root, ".env.local"), "KEEP_ME=value\nGOOGLE_TRENDS_BIGQUERY_PROJECT_ID=\n");
    const result = configureGoogleTrendsCredentials({ credentialPath: credentials, workspaceRoot: root });
    const env = readFileSync(join(root, ".env.local"), "utf8");
    assert.equal(result.status, "configured");
    assert.match(env, /^KEEP_ME=value$/m);
    assert.match(env, /^GOOGLE_TRENDS_BIGQUERY_PROJECT_ID=lorelens-trends-123$/m);
    assert.match(env, /^GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL=trends-reader@/m);
    assert.match(env, /^GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\n/m);
    assert.equal(env.includes("\nMII"), false, "PEM must stay on one escaped env line");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses non-empty Trends values without changing the file", () => {
  const root = workspace();
  try {
    const credentials = join(root, "service-account.json");
    writeFileSync(credentials, `${JSON.stringify(fixture())}\n`);
    const envPath = join(root, ".env.local");
    const original = "KEEP_ME=value\nGOOGLE_TRENDS_BIGQUERY_PROJECT_ID=existing-project\n";
    writeFileSync(envPath, original);
    assert.throws(
      () => configureGoogleTrendsCredentials({ credentialPath: credentials, workspaceRoot: root }),
      /refusing to overwrite non-empty GOOGLE_TRENDS_BIGQUERY_PROJECT_ID/,
    );
    assert.equal(readFileSync(envPath, "utf8"), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI output never contains service-account secrets", () => {
  const root = workspace();
  try {
    const credentials = join(root, "service-account.json");
    writeFileSync(credentials, `${JSON.stringify(fixture())}\n`);
    const result = spawnSync(process.execPath, [cliPath, credentials], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"status": "configured"/);
    assert.equal(result.stdout.includes("BEGIN PRIVATE KEY"), false);
    assert.equal(result.stdout.includes(privateKey.split("\n")[1]), false);
    assert.equal(result.stdout.includes("trends-reader@"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
