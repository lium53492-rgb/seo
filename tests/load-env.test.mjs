import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, test } from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const loaderUrl = pathToFileURL(join(repoRoot, "scripts", "load-env.mjs")).href;
const sandbox = mkdtempSync(join(tmpdir(), "lorelens-load-env-"));

after(() => rmSync(sandbox, { recursive: true, force: true }));

function writeRegularFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function linkedFixture(name, { commonEnv, worktreeEnv = "" } = {}) {
  const commonRoot = join(sandbox, name, "repository");
  const commonGit = join(commonRoot, ".git");
  const worktree = join(sandbox, name, "linked-worktree");
  const gitDir = join(commonGit, "worktrees", "fixture");
  mkdirSync(gitDir, { recursive: true });
  mkdirSync(worktree, { recursive: true });
  writeRegularFile(join(worktree, ".git"), `gitdir: ${gitDir}\n`);
  writeRegularFile(join(gitDir, "commondir"), "../..\n");
  writeRegularFile(join(gitDir, "gitdir"), `${join(worktree, ".git")}\n`);
  if (commonEnv !== undefined) {
    writeRegularFile(join(commonRoot, ".env.local"), commonEnv);
  }
  if (worktreeEnv) writeRegularFile(join(worktree, ".env.local"), worktreeEnv);
  return { commonGit, commonRoot, gitDir, worktree };
}

function readLoadedEnv(worktree, keys) {
  const source = [
    `await import(${JSON.stringify(loaderUrl)});`,
    `process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map((key) => [key, process.env[key] ?? null]))));`,
  ].join("\n");
  const env = { ...process.env };
  delete env.__NEXT_PROCESSED_ENV;
  for (const key of keys) delete env[key];
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: worktree,
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("a linked worktree keeps its own env values and fills only missing shared keys", () => {
  const { worktree } = linkedFixture("precedence", {
    commonEnv: [
      "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID=root-project",
      "GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL=root@example.invalid",
      'GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY="line1\\nline2"',
      "UNRELATED_SECRET=must-not-cross",
      "",
    ].join("\n"),
    worktreeEnv: "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID=worktree-project\n",
  });
  const loaded = readLoadedEnv(worktree, [
    "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID",
    "GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL",
    "GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY",
    "UNRELATED_SECRET",
  ]);
  assert.deepEqual(loaded, {
    GOOGLE_TRENDS_BIGQUERY_PROJECT_ID: "worktree-project",
    GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL: "root@example.invalid",
    GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY: "line1\nline2",
    UNRELATED_SECRET: null,
  });
});

test("a normal checkout never imports a parent or sibling env file", () => {
  const parent = join(sandbox, "normal-checkout");
  const checkout = join(parent, "checkout");
  mkdirSync(join(checkout, ".git"), { recursive: true });
  writeRegularFile(
    join(parent, ".env.local"),
    "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID=escaped-parent\n",
  );
  assert.deepEqual(
    readLoadedEnv(checkout, ["GOOGLE_TRENDS_BIGQUERY_PROJECT_ID"]),
    { GOOGLE_TRENDS_BIGQUERY_PROJECT_ID: null },
  );
});

test("forged linked-worktree metadata cannot escape to another repository", () => {
  const fixture = linkedFixture("forged-metadata", {
    commonEnv: "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID=legitimate-root\n",
  });
  const outsideRoot = join(sandbox, "forged-metadata", "outside");
  const outsideGit = join(outsideRoot, ".git");
  mkdirSync(outsideGit, { recursive: true });
  writeRegularFile(
    join(outsideRoot, ".env.local"),
    "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID=escaped-root\n",
  );
  writeRegularFile(
    join(fixture.gitDir, "commondir"),
    `${resolve(outsideGit)}\n`,
  );
  assert.deepEqual(
    readLoadedEnv(fixture.worktree, ["GOOGLE_TRENDS_BIGQUERY_PROJECT_ID"]),
    { GOOGLE_TRENDS_BIGQUERY_PROJECT_ID: null },
  );
});

test("a linked-worktree gitdir cannot cross a symlink or junction", () => {
  const fixture = linkedFixture("junction-gitdir", {
    commonEnv: "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID=must-not-cross-junction\n",
  });
  const aliasGit = join(sandbox, "junction-gitdir", "git-alias");
  symlinkSync(
    fixture.commonGit,
    aliasGit,
    process.platform === "win32" ? "junction" : "dir",
  );
  writeRegularFile(
    join(fixture.worktree, ".git"),
    `gitdir: ${join(aliasGit, "worktrees", "fixture")}\n`,
  );
  assert.deepEqual(
    readLoadedEnv(fixture.worktree, ["GOOGLE_TRENDS_BIGQUERY_PROJECT_ID"]),
    { GOOGLE_TRENDS_BIGQUERY_PROJECT_ID: null },
  );
});

test("a symlinked or junction common-root env path is rejected", () => {
  const fixture = linkedFixture("symlinked-env");
  const outsideEnv = join(sandbox, "symlinked-env", "outside.env");
  writeRegularFile(
    outsideEnv,
    "GOOGLE_TRENDS_BIGQUERY_PROJECT_ID=symlink-secret\n",
  );
  try {
    symlinkSync(outsideEnv, join(fixture.commonRoot, ".env.local"), "file");
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) {
      const outsideDirectory = join(sandbox, "symlinked-env", "outside-directory");
      mkdirSync(outsideDirectory, { recursive: true });
      writeRegularFile(join(outsideDirectory, "secret"), "must-not-be-read\n");
      symlinkSync(
        outsideDirectory,
        join(fixture.commonRoot, ".env.local"),
        "junction",
      );
    } else {
      throw error;
    }
  }
  assert.deepEqual(
    readLoadedEnv(fixture.worktree, ["GOOGLE_TRENDS_BIGQUERY_PROJECT_ID"]),
    { GOOGLE_TRENDS_BIGQUERY_PROJECT_ID: null },
  );
});

test("the shared-env loader does not execute Git or any child process", () => {
  const source = readFileSync(join(repoRoot, "scripts", "load-env.mjs"), "utf8");
  assert.doesNotMatch(source, /node:child_process|\b(?:exec|execFile|spawn)(?:Sync)?\s*\(/);
});
