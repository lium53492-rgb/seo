import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import {
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertIntermediateDailyReleaseRebasePin,
  buildDailyReleaseProof,
  materializeCheckpointDailyRelease,
  orphanedDailyReleasePinIsEquivalent,
  pinDailyReleaseRevision,
  prepareDailyReleaseRevision,
} from "../scripts/lib/daily-release-git.mjs";

const sandbox = mkdtempSync(join(tmpdir(), "lorelens-release-settlement-"));
const sourceRoot = process.cwd();
const date = "2026-08-06";
const slug = "ai-roleplay-first-message";
after(() => rmSync(sandbox, { recursive: true, force: true }));

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function dailyPaths() {
  return [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ];
}

function copyDailyArtifacts(worktree) {
  for (const relativePath of dailyPaths()) {
    const destination = join(worktree, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(sourceRoot, relativePath), destination);
  }
}

function createReleaseRepository(name, { baseRuntimeFile = false, baseFeedbackFile = false } = {}) {
  const root = join(sandbox, name);
  const remote = join(root, "remote.git");
  const worktree = join(root, "worktree");
  mkdirSync(root, { recursive: true });
  git(root, ["init", "--bare", remote]);
  mkdirSync(worktree, { recursive: true });
  git(worktree, ["init", "-b", "main"]);
  git(worktree, ["config", "user.email", "seo-tests@example.com"]);
  git(worktree, ["config", "user.name", "SEO Tests"]);
  git(worktree, ["remote", "add", "origin", remote]);
  writeFileSync(join(worktree, "README.md"), "base\n");
  copyFileSync(join(sourceRoot, ".gitignore"), join(worktree, ".gitignore"));
  const existingPagePath = join(worktree, "data/pages/choose-a-role-ai-story.json");
  mkdirSync(dirname(existingPagePath), { recursive: true });
  copyFileSync(join(sourceRoot, "data/pages/choose-a-role-ai-story.json"), existingPagePath);
  const basePaths = [".gitignore", "README.md", "data/pages/choose-a-role-ai-story.json"];
  if (baseRuntimeFile) {
    mkdirSync(join(worktree, "app"), { recursive: true });
    writeFileSync(join(worktree, "app/runtime.ts"), "export const runtimeValue = true;\n");
    basePaths.push("app/runtime.ts");
  }
  if (baseFeedbackFile) {
    const feedbackPath = join(worktree, "data/seo-feedback/inbox/recovery.json");
    mkdirSync(dirname(feedbackPath), { recursive: true });
    writeFileSync(feedbackPath, `${JSON.stringify({
      entries: [{ id: "feedback-1", message: "Keep this exact feedback", consumedAt: null }],
    }, null, 2)}\n`);
    basePaths.push("data/seo-feedback/inbox/recovery.json");
  }
  git(worktree, ["add", ...basePaths]);
  git(worktree, ["commit", "-m", "base"]);
  const baseRevision = git(worktree, ["rev-parse", "HEAD"]);
  git(worktree, ["push", "-u", "origin", "main"]);
  copyDailyArtifacts(worktree);
  git(worktree, ["add", "-f", "--", ...dailyPaths()]);
  git(worktree, ["commit", "-m", "daily release"]);
  const releaseRevision = git(worktree, ["rev-parse", "HEAD"]);
  const releaseProof = buildDailyReleaseProof({
    worktreeRoot: worktree,
    date,
    revision: releaseRevision,
    slug,
  });
  return { root, remote, worktree, baseRevision, releaseRevision, releaseProof };
}

function marker(repository) {
  return {
    revision: repository.releaseRevision,
    slug,
    startedAt: "2026-08-06T12:00:00.000Z",
    releaseProof: repository.releaseProof,
  };
}

test("a marker whose push crashed is recovered with an explicit non-force fast-forward", () => {
  const repository = createReleaseRepository("push-recovery");
  pinDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    revision: repository.releaseRevision,
  });
  const prepared = prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: marker(repository),
  });
  assert.equal(prepared.action, "fast_forward_pushed");
  assert.equal(prepared.revision, repository.releaseRevision);
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), repository.releaseRevision);
  assert.equal(git(repository.worktree, ["rev-parse", `refs/codex/daily-releases/${date}`]), repository.releaseRevision);
  assert.throws(() => buildDailyReleaseProof({
    worktreeRoot: repository.worktree,
    date,
    revision: repository.releaseRevision,
    slug,
  }), /cannot be created after its revision already reached origin\/main/);
  const implementation = readFileSync(join(sourceRoot, "scripts/lib/daily-release-git.mjs"), "utf8");
  assert.doesNotMatch(implementation, /--force|--force-with-lease|\+\$\{/);
  assert.match(implementation, /`\$\{revision\}:refs\/heads\/main`/);
});

test("post-verification confirmation never repushes a rolled-back origin main", () => {
  const repository = createReleaseRepository("confirmation-no-repush");
  assert.throws(() => prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: marker(repository),
    allowPush: false,
  }), /refuses to repush/);
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), repository.baseRevision);
});

test("a fresh recovery worktree can verify restored untracked artifacts by Git blob hash", () => {
  const repository = createReleaseRepository("fresh-recovery-worktree");
  const recoveryWorktree = join(repository.root, "recovery-worktree");
  git(repository.worktree, ["worktree", "add", "--detach", recoveryWorktree, repository.baseRevision]);
  copyDailyArtifacts(recoveryWorktree);
  const prepared = prepareDailyReleaseRevision({
    worktreeRoot: recoveryWorktree,
    date,
    releaseInFlight: marker(repository),
  });
  assert.equal(prepared.action, "fast_forward_pushed");
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), repository.releaseRevision);
});

test("the recovery pin keeps an unpushed release commit alive through branch cleanup and Git GC", () => {
  const repository = createReleaseRepository("pin-gc-survival");
  pinDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    revision: repository.releaseRevision,
  });
  git(repository.worktree, ["reset", "--hard", repository.baseRevision]);
  git(repository.worktree, ["reflog", "expire", "--expire=now", "--all"]);
  git(repository.worktree, ["gc", "--prune=now"]);
  assert.equal(git(repository.worktree, ["rev-parse", `refs/codex/daily-releases/${date}`]), repository.releaseRevision);
  assert.doesNotThrow(() => git(repository.worktree, ["cat-file", "-e", `${repository.releaseRevision}^{commit}`]));
});

test("a complete restored checkpoint is committed and pinned when release start crashed first", () => {
  const repository = createReleaseRepository("checkpoint-materialization", { baseFeedbackFile: true });
  git(repository.worktree, ["reset", "--mixed", repository.baseRevision]);
  const feedbackPath = join(repository.worktree, "data/seo-feedback/inbox/recovery.json");
  const feedback = JSON.parse(readFileSync(feedbackPath, "utf8"));
  feedback.entries[0].consumedAt = "2026-08-06T12:00:00.000Z";
  writeFileSync(feedbackPath, `${JSON.stringify(feedback, null, 2)}\n`);
  const materialized = materializeCheckpointDailyRelease({
    worktreeRoot: repository.worktree,
    date,
    slug,
    allowedDirtyPaths: ["data/seo-feedback/inbox/recovery.json"],
  });
  assert.equal(materialized.action, "checkpoint_committed_and_pinned");
  assert.equal(materialized.slug, slug);
  assert.equal(git(repository.worktree, ["rev-parse", "HEAD"]), repository.baseRevision);
  assert.equal(
    git(repository.worktree, ["rev-parse", `refs/codex/daily-releases/${date}`]),
    materialized.revision,
  );
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), repository.baseRevision);
  assert.deepEqual(materialized.releaseProof.changedPaths.sort(), dailyPaths().sort());
  assert.equal(
    JSON.parse(git(repository.worktree, ["show", `${materialized.revision}:data/seo-feedback/inbox/recovery.json`]))
      .entries[0].consumedAt,
    null,
  );
  assert.equal(git(repository.worktree, ["diff", "--name-only"]), "data/seo-feedback/inbox/recovery.json");
});

test("checkpoint materialization rebases onto current origin without moving a divergent recovery HEAD", () => {
  const repository = createReleaseRepository("checkpoint-origin-advance");
  const advancingClone = join(repository.root, "advancing-clone");
  git(repository.root, ["clone", "--branch", "main", repository.remote, advancingClone]);
  git(advancingClone, ["config", "user.email", "seo-tests@example.com"]);
  git(advancingClone, ["config", "user.name", "SEO Tests"]);
  writeFileSync(join(advancingClone, "README.md"), "base\napproved docs advance\n");
  git(advancingClone, ["add", "README.md"]);
  git(advancingClone, ["commit", "-m", "docs: advance main"]);
  git(advancingClone, ["push", "origin", "main"]);
  const advancedOrigin = git(advancingClone, ["rev-parse", "HEAD"]);

  const materialized = materializeCheckpointDailyRelease({
    worktreeRoot: repository.worktree,
    date,
    slug,
  });
  assert.equal(git(repository.worktree, ["rev-parse", "HEAD"]), repository.releaseRevision);
  assert.equal(materialized.releaseProof.baseRevision, advancedOrigin);
  assert.equal(git(repository.worktree, ["rev-parse", `${materialized.revision}^`]), advancedOrigin);
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), advancedOrigin);
  assert.equal(
    git(repository.worktree, ["rev-parse", `refs/codex/daily-releases/${date}`]),
    materialized.revision,
  );
});

test("checkpoint materialization self-heals when origin advances inside the pin transaction", () => {
  const repository = createReleaseRepository("checkpoint-pin-race");
  const advancingClone = join(repository.root, "advancing-clone");
  git(repository.root, ["clone", "--branch", "main", repository.remote, advancingClone]);
  git(advancingClone, ["config", "user.email", "seo-tests@example.com"]);
  git(advancingClone, ["config", "user.name", "SEO Tests"]);
  mkdirSync(join(advancingClone, "docs"), { recursive: true });
  writeFileSync(join(advancingClone, "docs/pin-race.md"), "advance during local pin\n");
  git(advancingClone, ["add", "docs/pin-race.md"]);
  git(advancingClone, ["commit", "-m", "docs: race the recovery pin"]);
  const advancedOrigin = git(advancingClone, ["rev-parse", "HEAD"]);

  const hookPath = join(repository.worktree, ".git/hooks/reference-transaction");
  const sentinelPath = join(repository.root, "pin-race-triggered");
  const shellPath = (value) => value.replaceAll("\\", "/").replaceAll("'", "'\\''");
  writeFileSync(hookPath, `#!/bin/sh
updates=$(cat)
case "$1:$updates" in
  prepared:*refs/codex/daily-releases/${date}*)
    if [ ! -f '${shellPath(sentinelPath)}' ]; then
      : > '${shellPath(sentinelPath)}'
      git -C '${shellPath(advancingClone)}' push origin main >/dev/null 2>&1 || exit 1
    fi
    ;;
esac
exit 0
`);
  chmodSync(hookPath, 0o755);

  const materialized = materializeCheckpointDailyRelease({
    worktreeRoot: repository.worktree,
    date,
    slug,
  });
  assert.equal(existsSync(sentinelPath), true);
  assert.equal(materialized.releaseProof.baseRevision, advancedOrigin);
  assert.equal(git(repository.worktree, ["rev-parse", `${materialized.revision}^`]), advancedOrigin);
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), advancedOrigin);
  assert.equal(
    git(repository.worktree, ["rev-parse", `refs/codex/daily-releases/${date}`]),
    materialized.revision,
  );
});

test("an orphaned checkpoint pin is CAS-rebased after a later docs sibling advance", () => {
  const repository = createReleaseRepository("orphan-pin-sibling-rebase");
  const first = materializeCheckpointDailyRelease({
    worktreeRoot: repository.worktree,
    date,
    slug,
  });
  const advancingClone = join(repository.root, "advancing-clone");
  git(repository.root, ["clone", "--branch", "main", repository.remote, advancingClone]);
  git(advancingClone, ["config", "user.email", "seo-tests@example.com"]);
  git(advancingClone, ["config", "user.name", "SEO Tests"]);
  mkdirSync(join(advancingClone, "docs"), { recursive: true });
  writeFileSync(join(advancingClone, "docs/orphan-pin.md"), "advance after pin crash\n");
  git(advancingClone, ["add", "docs/orphan-pin.md"]);
  git(advancingClone, ["commit", "-m", "docs: advance after orphan pin"]);
  git(advancingClone, ["push", "origin", "main"]);
  const advancedOrigin = git(advancingClone, ["rev-parse", "HEAD"]);

  const recovered = materializeCheckpointDailyRelease({
    worktreeRoot: repository.worktree,
    date,
    slug,
  });
  assert.notEqual(recovered.revision, first.revision);
  assert.equal(recovered.releaseProof.baseRevision, advancedOrigin);
  assert.equal(git(repository.worktree, ["rev-parse", `${recovered.revision}^`]), advancedOrigin);
  assert.equal(
    git(repository.worktree, ["rev-parse", `refs/codex/daily-releases/${date}`]),
    recovered.revision,
  );
});

test("an orphaned checkpoint pin rejects an unsafe runtime sibling advance", () => {
  const repository = createReleaseRepository("orphan-pin-unsafe-sibling");
  const pinned = materializeCheckpointDailyRelease({
    worktreeRoot: repository.worktree,
    date,
    slug,
  });
  const advancingClone = join(repository.root, "advancing-clone");
  git(repository.root, ["clone", "--branch", "main", repository.remote, advancingClone]);
  git(advancingClone, ["config", "user.email", "seo-tests@example.com"]);
  git(advancingClone, ["config", "user.name", "SEO Tests"]);
  mkdirSync(join(advancingClone, "app/evil"), { recursive: true });
  writeFileSync(join(advancingClone, "app/evil/page.tsx"), "export default function Evil() { return null; }\n");
  git(advancingClone, ["add", "app/evil/page.tsx"]);
  git(advancingClone, ["commit", "-m", "feat: unsafe runtime advance"]);
  git(advancingClone, ["push", "origin", "main"]);
  assert.throws(() => materializeCheckpointDailyRelease({
    worktreeRoot: repository.worktree,
    date,
    slug,
  }), /runtime or content paths/);
  assert.equal(
    git(repository.worktree, ["rev-parse", `refs/codex/daily-releases/${date}`]),
    pinned.revision,
  );
});

test("an unpushed marker is rebuilt after a docs-only sibling advance", () => {
  const repository = createReleaseRepository("marker-sibling-rebase");
  const advancingClone = join(repository.root, "advancing-clone");
  git(repository.root, ["clone", "--branch", "main", repository.remote, advancingClone]);
  git(advancingClone, ["config", "user.email", "seo-tests@example.com"]);
  git(advancingClone, ["config", "user.name", "SEO Tests"]);
  mkdirSync(join(advancingClone, "docs"), { recursive: true });
  writeFileSync(join(advancingClone, "docs/recovery-note.md"), "approved docs advance\n");
  git(advancingClone, ["add", "docs/recovery-note.md"]);
  git(advancingClone, ["commit", "-m", "docs: advance before daily push"]);
  git(advancingClone, ["push", "origin", "main"]);
  const advancedOrigin = git(advancingClone, ["rev-parse", "HEAD"]);

  const rebased = prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: marker(repository),
  });
  assert.equal(rebased.action, "rebased_equivalent");
  assert.equal(git(repository.worktree, ["rev-parse", `${rebased.revision}^`]), advancedOrigin);
  assert.deepEqual(rebased.releaseProof.artifactBlobs, repository.releaseProof.artifactBlobs);
  assert.equal(rebased.releaseProof.pageTreeOid, repository.releaseProof.pageTreeOid);
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), advancedOrigin);

  const pushed = prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: {
      revision: rebased.revision,
      slug,
      releaseProof: rebased.releaseProof,
    },
  });
  assert.equal(pushed.action, "fast_forward_pushed");
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), rebased.revision);
});

test("a docs advance in the pre-push hook is surfaced for same-run reconciliation", () => {
  const repository = createReleaseRepository("pre-push-origin-race");
  const advancingClone = join(repository.root, "advancing-clone");
  git(repository.root, ["clone", "--branch", "main", repository.remote, advancingClone]);
  git(advancingClone, ["config", "user.email", "seo-tests@example.com"]);
  git(advancingClone, ["config", "user.name", "SEO Tests"]);
  mkdirSync(join(advancingClone, "docs"), { recursive: true });
  writeFileSync(join(advancingClone, "docs/pre-push.md"), "advance immediately before push\n");
  git(advancingClone, ["add", "docs/pre-push.md"]);
  git(advancingClone, ["commit", "-m", "docs: race the daily push"]);
  const advancedOrigin = git(advancingClone, ["rev-parse", "HEAD"]);

  const hookPath = join(repository.worktree, ".git/hooks/pre-push");
  const sentinelPath = join(repository.root, "pre-push-triggered");
  const shellPath = (value) => value.replaceAll("\\", "/").replaceAll("'", "'\\''");
  writeFileSync(hookPath, `#!/bin/sh
if [ ! -f '${shellPath(sentinelPath)}' ]; then
  : > '${shellPath(sentinelPath)}'
  git -C '${shellPath(advancingClone)}' push origin main >/dev/null 2>&1 || exit 1
fi
exit 0
`);
  chmodSync(hookPath, 0o755);

  let pushError;
  try {
    prepareDailyReleaseRevision({
      worktreeRoot: repository.worktree,
      date,
      releaseInFlight: marker(repository),
    });
  } catch (error) {
    pushError = error;
  }
  assert.equal(pushError?.code, "SEO_ORIGIN_MOVED_DURING_PUSH");
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), advancedOrigin);
  const recovered = prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: marker(repository),
  });
  assert.equal(recovered.action, "rebased_equivalent");
  assert.equal(git(repository.worktree, ["rev-parse", `${recovered.revision}^`]), advancedOrigin);
});

test("a marker rebase adopts an equivalent intermediate sibling pin after a crash", () => {
  const repository = createReleaseRepository("marker-intermediate-pin");
  const advancingClone = join(repository.root, "advancing-clone");
  git(repository.root, ["clone", "--branch", "main", repository.remote, advancingClone]);
  git(advancingClone, ["config", "user.email", "seo-tests@example.com"]);
  git(advancingClone, ["config", "user.name", "SEO Tests"]);
  mkdirSync(join(advancingClone, "docs"), { recursive: true });
  writeFileSync(join(advancingClone, "docs/first.md"), "first docs advance\n");
  git(advancingClone, ["add", "docs/first.md"]);
  git(advancingClone, ["commit", "-m", "docs: first advance"]);
  git(advancingClone, ["push", "origin", "main"]);
  const firstRebase = prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: marker(repository),
  });
  pinDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    revision: firstRebase.revision,
  });

  writeFileSync(join(advancingClone, "docs/second.md"), "second docs advance\n");
  git(advancingClone, ["add", "docs/second.md"]);
  git(advancingClone, ["commit", "-m", "docs: second advance"]);
  git(advancingClone, ["push", "origin", "main"]);
  const secondRebase = prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: marker(repository),
  });
  assert.doesNotThrow(() => assertIntermediateDailyReleaseRebasePin({
    worktreeRoot: repository.worktree,
    date,
    slug,
    markerProof: repository.releaseProof,
    pinnedRevision: firstRebase.revision,
    nextProof: secondRebase.releaseProof,
  }));
  assert.equal(pinDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    revision: secondRebase.revision,
    expectedRevision: firstRebase.revision,
  }).outcome, "superseded");
});

test("release proof rejects an unapproved commit path and an unexpected origin repository", () => {
  const repository = createReleaseRepository("release-allowlist");
  assert.throws(() => buildDailyReleaseProof({
    worktreeRoot: repository.worktree,
    date,
    revision: repository.releaseRevision,
    slug,
    expectedOriginRepository: "lium53492-rgb/seo",
  }), /approved repository/);
  writeFileSync(join(repository.worktree, "EXTRA.md"), "not a daily artifact\n");
  git(repository.worktree, ["add", "EXTRA.md"]);
  git(repository.worktree, ["commit", "--amend", "--no-edit"]);
  const revision = git(repository.worktree, ["rev-parse", "HEAD"]);
  assert.throws(() => buildDailyReleaseProof({
    worktreeRoot: repository.worktree,
    date,
    revision,
    slug,
  }), /six-artifact allowlist/);
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), repository.baseRevision);

  const hiddenHistory = createReleaseRepository("hidden-history");
  writeFileSync(join(hiddenHistory.worktree, "SECRET.txt"), "must not enter history\n");
  git(hiddenHistory.worktree, ["add", "SECRET.txt"]);
  git(hiddenHistory.worktree, ["commit", "-m", "add forbidden history"]);
  unlinkSync(join(hiddenHistory.worktree, "SECRET.txt"));
  git(hiddenHistory.worktree, ["add", "-u", "SECRET.txt"]);
  git(hiddenHistory.worktree, ["commit", "-m", "remove forbidden history"]);
  const hiddenRevision = git(hiddenHistory.worktree, ["rev-parse", "HEAD"]);
  assert.throws(() => buildDailyReleaseProof({
    worktreeRoot: hiddenHistory.worktree,
    date,
    revision: hiddenRevision,
    slug,
  }), /exactly one non-merge commit/);

  const multiplePushUrls = createReleaseRepository("multiple-push-urls");
  git(multiplePushUrls.worktree, ["remote", "set-url", "origin", "https://github.com/lium53492-rgb/seo.git"]);
  git(multiplePushUrls.worktree, ["config", "--add", "remote.origin.pushurl", "https://github.com/lium53492-rgb/seo.git"]);
  git(multiplePushUrls.worktree, ["config", "--add", "remote.origin.pushurl", "https://github.com/example/other.git"]);
  assert.throws(() => buildDailyReleaseProof({
    worktreeRoot: multiplePushUrls.worktree,
    date,
    revision: multiplePushUrls.releaseRevision,
    slug,
    expectedOriginRepository: "lium53492-rgb/seo",
  }), /approved repository/);
});

test("a wrapper commit cannot back-sign daily artifacts that already reached origin main", () => {
  const emptyWrapper = createReleaseRepository("empty-wrapper-backsign");
  git(emptyWrapper.worktree, ["push", "origin", "main"]);
  git(emptyWrapper.worktree, ["commit", "--allow-empty", "-m", "empty wrapper"]);
  const emptyRevision = git(emptyWrapper.worktree, ["rev-parse", "HEAD"]);
  assert.throws(() => buildDailyReleaseProof({
    worktreeRoot: emptyWrapper.worktree,
    date,
    revision: emptyRevision,
    slug,
  }), /six-artifact allowlist/);

  const partialWrapper = createReleaseRepository("partial-wrapper-backsign");
  git(partialWrapper.worktree, ["push", "origin", "main"]);
  const growthPath = join(partialWrapper.worktree, `data/growth/${date}.json`);
  writeFileSync(growthPath, `${readFileSync(growthPath, "utf8")}\n`);
  git(partialWrapper.worktree, ["add", `data/growth/${date}.json`]);
  git(partialWrapper.worktree, ["commit", "-m", "partial wrapper"]);
  const partialRevision = git(partialWrapper.worktree, ["rev-parse", "HEAD"]);
  assert.throws(() => buildDailyReleaseProof({
    worktreeRoot: partialWrapper.worktree,
    date,
    revision: partialRevision,
    slug,
  }), /six-artifact allowlist/);
});

test("an orphaned pin may move to a content-equivalent sibling release commit", () => {
  const repository = createReleaseRepository("equivalent-orphan-pin");
  pinDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    revision: repository.releaseRevision,
  });
  git(repository.worktree, ["commit", "--amend", "-m", "equivalent daily release"]);
  const siblingRevision = git(repository.worktree, ["rev-parse", "HEAD"]);
  assert.notEqual(siblingRevision, repository.releaseRevision);
  const siblingProof = buildDailyReleaseProof({
    worktreeRoot: repository.worktree,
    date,
    revision: siblingRevision,
    slug,
  });
  assert.equal(orphanedDailyReleasePinIsEquivalent({
    worktreeRoot: repository.worktree,
    date,
    slug,
    pinnedRevision: repository.releaseRevision,
    nextProof: siblingProof,
  }), true);
  assert.equal(pinDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    revision: siblingRevision,
    expectedRevision: repository.releaseRevision,
  }).outcome, "superseded");
});

test("an equivalent origin/main descendant is supersedable without changing any page data", () => {
  const repository = createReleaseRepository("equivalent-descendant");
  prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: marker(repository),
  });
  mkdirSync(join(repository.worktree, "docs"), { recursive: true });
  writeFileSync(join(repository.worktree, "docs", "release-note.md"), "unrelated\n");
  git(repository.worktree, ["add", "docs/release-note.md"]);
  git(repository.worktree, ["commit", "-m", "unrelated descendant"]);
  const descendant = git(repository.worktree, ["rev-parse", "HEAD"]);
  git(repository.worktree, ["push", "origin", "main"]);
  const prepared = prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: marker(repository),
  });
  assert.equal(prepared.action, "descendant_equivalent");
  assert.equal(prepared.revision, descendant);
  assert.equal(prepared.supersessionProof.descendantVerified, true);
  assert.deepEqual(prepared.releaseProof.artifactBlobs, repository.releaseProof.artifactBlobs);
  assert.equal(prepared.releaseProof.pageTreeOid, repository.releaseProof.pageTreeOid);
});

test("descendant recovery rejects hidden runtime history and rename detection cannot conceal a runtime path", () => {
  const hiddenHistory = createReleaseRepository("descendant-hidden-runtime");
  prepareDailyReleaseRevision({
    worktreeRoot: hiddenHistory.worktree,
    date,
    releaseInFlight: marker(hiddenHistory),
  });
  mkdirSync(join(hiddenHistory.worktree, "app/evil"), { recursive: true });
  writeFileSync(join(hiddenHistory.worktree, "app/evil/page.tsx"), "export default function Evil() { return null; }\n");
  git(hiddenHistory.worktree, ["add", "app/evil/page.tsx"]);
  git(hiddenHistory.worktree, ["commit", "-m", "add hidden runtime"]);
  unlinkSync(join(hiddenHistory.worktree, "app/evil/page.tsx"));
  git(hiddenHistory.worktree, ["add", "-u", "app/evil/page.tsx"]);
  git(hiddenHistory.worktree, ["commit", "-m", "remove hidden runtime"]);
  git(hiddenHistory.worktree, ["push", "origin", "main"]);
  assert.throws(() => prepareDailyReleaseRevision({
    worktreeRoot: hiddenHistory.worktree,
    date,
    releaseInFlight: marker(hiddenHistory),
  }), /runtime or content paths/);

  const renamedRuntime = createReleaseRepository("descendant-runtime-rename", { baseRuntimeFile: true });
  prepareDailyReleaseRevision({
    worktreeRoot: renamedRuntime.worktree,
    date,
    releaseInFlight: marker(renamedRuntime),
  });
  mkdirSync(join(renamedRuntime.worktree, "docs"), { recursive: true });
  git(renamedRuntime.worktree, ["mv", "app/runtime.ts", "docs/runtime.ts"]);
  git(renamedRuntime.worktree, ["commit", "-m", "rename runtime as documentation"]);
  git(renamedRuntime.worktree, ["push", "origin", "main"]);
  assert.throws(() => prepareDailyReleaseRevision({
    worktreeRoot: renamedRuntime.worktree,
    date,
    releaseInFlight: marker(renamedRuntime),
  }), /runtime or content paths/);
});

test("a divergent origin/main is a hard stop and is never rewritten", () => {
  const repository = createReleaseRepository("divergent-tip");
  git(repository.worktree, ["switch", "--detach", repository.baseRevision]);
  writeFileSync(join(repository.worktree, "REMOTE.md"), "different branch\n");
  git(repository.worktree, ["add", "REMOTE.md"]);
  git(repository.worktree, ["commit", "-m", "remote divergence"]);
  const divergentRevision = git(repository.worktree, ["rev-parse", "HEAD"]);
  git(repository.worktree, ["push", "origin", "HEAD:refs/heads/main"]);
  git(repository.worktree, ["switch", "main"]);
  assert.throws(() => prepareDailyReleaseRevision({
    worktreeRoot: repository.worktree,
    date,
    releaseInFlight: marker(repository),
  }), /diverged|runtime or content paths/);
  assert.equal(git(repository.remote, ["rev-parse", "refs/heads/main"]), divergentRevision);
});

test("a descendant that changes a daily artifact or adds a second same-day page is rejected", () => {
  const changedArtifact = createReleaseRepository("changed-artifact");
  prepareDailyReleaseRevision({
    worktreeRoot: changedArtifact.worktree,
    date,
    releaseInFlight: marker(changedArtifact),
  });
  const growthPath = join(changedArtifact.worktree, `data/growth/${date}.json`);
  const originalGrowth = readFileSync(growthPath);
  writeFileSync(growthPath, `${readFileSync(growthPath, "utf8").trim()}\n `);
  git(changedArtifact.worktree, ["add", `data/growth/${date}.json`]);
  git(changedArtifact.worktree, ["commit", "-m", "change daily artifact"]);
  git(changedArtifact.worktree, ["push", "origin", "main"]);
  writeFileSync(growthPath, originalGrowth);
  assert.throws(() => prepareDailyReleaseRevision({
    worktreeRoot: changedArtifact.worktree,
    date,
    releaseInFlight: marker(changedArtifact),
  }), /different daily artifacts or page corpus/);

  const secondPage = createReleaseRepository("second-page");
  prepareDailyReleaseRevision({
    worktreeRoot: secondPage.worktree,
    date,
    releaseInFlight: marker(secondPage),
  });
  const extraPath = join(secondPage.worktree, "data/pages/second-page.json");
  const extraPage = JSON.parse(readFileSync(join(secondPage.worktree, `data/pages/${slug}.json`), "utf8"));
  extraPage.slug = "second-page";
  extraPage.path = "/second-page";
  writeFileSync(extraPath, `${JSON.stringify(extraPage, null, 2)}\n`);
  git(secondPage.worktree, ["add", "data/pages/second-page.json"]);
  git(secondPage.worktree, ["commit", "-m", "add second same-day page"]);
  const secondPageTip = git(secondPage.worktree, ["rev-parse", "HEAD"]);
  git(secondPage.worktree, ["push", "origin", "main"]);
  unlinkSync(extraPath);
  assert.throws(() => prepareDailyReleaseRevision({
    worktreeRoot: secondPage.worktree,
    date,
    releaseInFlight: marker(secondPage),
  }), /exactly one canonical page/);
  assert.equal(git(secondPage.remote, ["rev-parse", "refs/heads/main"]), secondPageTip);

  const routeEntry = createReleaseRepository("route-entry");
  prepareDailyReleaseRevision({
    worktreeRoot: routeEntry.worktree,
    date,
    releaseInFlight: marker(routeEntry),
  });
  const routePath = join(routeEntry.worktree, "app/extra/route.ts");
  mkdirSync(dirname(routePath), { recursive: true });
  writeFileSync(routePath, "export function GET() { return new Response('extra'); }\n");
  git(routeEntry.worktree, ["add", "app/extra/route.ts"]);
  git(routeEntry.worktree, ["commit", "-m", "add hard-coded page route"]);
  git(routeEntry.worktree, ["push", "origin", "main"]);
  assert.throws(() => prepareDailyReleaseRevision({
    worktreeRoot: routeEntry.worktree,
    date,
    releaseInFlight: marker(routeEntry),
  }), /changes runtime or content paths/);
});
