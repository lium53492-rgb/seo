import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readDailyRunState, shanghaiDate } from "./daily-run-state.mjs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ZERO_SHA = "0".repeat(40);

function assertReleaseIdentity(date, revision, slug) {
  if (!DATE_PATTERN.test(String(date || "")) || !SHA_PATTERN.test(String(revision || "")) ||
    !SLUG_PATTERN.test(String(slug || ""))) {
    throw new Error("Daily release Git operations require a date, full Git SHA, and safe slug");
  }
}

function git(root, args, options = {}) {
  return execFileSync("git", args, {
    cwd: resolve(root),
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: options.env ?? process.env,
  });
}

function gitText(root, args, options = {}) {
  return String(git(root, args, options)).trim();
}

function gitPaths(root, args, options = {}) {
  return gitText(root, args, options).split("\0").filter(Boolean);
}

function gitSucceeds(root, args) {
  try {
    git(root, args);
    return true;
  } catch {
    return false;
  }
}

function normalizedGitHubRepository(value) {
  const remote = String(value || "").trim();
  const scpMatch = remote.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (scpMatch) return scpMatch[1].toLowerCase();
  try {
    const url = new URL(remote);
    if (url.hostname.toLowerCase() !== "github.com") return null;
    const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
    return /^[^/]+\/[^/]+$/.test(path) ? path.toLowerCase() : null;
  } catch {
    return null;
  }
}

function assertOriginIdentity(root, expectedOriginRepository) {
  if (expectedOriginRepository === null) return;
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(String(expectedOriginRepository || ""))) {
    throw new Error("Expected origin repository identity is invalid");
  }
  const expected = expectedOriginRepository.toLowerCase();
  const fetchRepositories = gitText(root, ["remote", "get-url", "--all", "origin"])
    .split(/\r?\n/).filter(Boolean).map(normalizedGitHubRepository);
  const pushRepositories = gitText(root, ["remote", "get-url", "--push", "--all", "origin"])
    .split(/\r?\n/).filter(Boolean).map(normalizedGitHubRepository);
  if (fetchRepositories.length !== 1 || pushRepositories.length !== 1 ||
    fetchRepositories[0] !== expected || pushRepositories[0] !== expected) {
    throw new Error(`origin must fetch from and push to the approved repository ${expected}`);
  }
}

export function dailyReleaseArtifactPaths(date, slug) {
  assertReleaseIdentity(date, "0".repeat(40), slug);
  return [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ];
}

function assertCommit(root, revision) {
  if (!SHA_PATTERN.test(String(revision || "")) ||
    !gitSucceeds(root, ["cat-file", "-e", `${revision}^{commit}`])) {
    throw new Error(`Daily release revision is not an available commit: ${revision}`);
  }
}

function blobOid(root, revision, path) {
  const oid = gitText(root, ["rev-parse", "--verify", `${revision}:${path}`]);
  if (!/^[a-f0-9]{40}$/.test(oid) || gitText(root, ["cat-file", "-t", oid]) !== "blob") {
    throw new Error(`Daily release path is not a regular Git blob: ${path}`);
  }
  return oid;
}

function treeOid(root, revision, path) {
  const oid = gitText(root, ["rev-parse", "--verify", `${revision}:${path}`]);
  if (!/^[a-f0-9]{40}$/.test(oid) || gitText(root, ["cat-file", "-t", oid]) !== "tree") {
    throw new Error(`Daily release path is not a Git tree: ${path}`);
  }
  return oid;
}

function treePaths(root, revision) {
  const output = git(root, ["ls-tree", "-r", "--name-only", "-z", revision]);
  return String(output).split("\0").filter(Boolean);
}

function changedPathsBetween(root, baseRevision, revision) {
  const output = git(root, ["diff", "--no-renames", "--name-only", "-z", baseRevision, revision]);
  return String(output).split("\0").filter(Boolean);
}

function assertSafeDescendantDelta(root, baseRevision, revision) {
  const lines = gitText(root, ["rev-list", "--reverse", "--parents", `${baseRevision}..${revision}`])
    .split(/\r?\n/).filter(Boolean);
  const allChangedPaths = new Set();
  for (const line of lines) {
    const [commit, ...parents] = line.split(/\s+/);
    if (parents.length !== 1) {
      throw new Error(`origin/main descendant history contains a merge commit: ${commit}`);
    }
    const changedPaths = changedPathsBetween(root, parents[0], commit);
    const unsafePaths = changedPaths.filter((path) => !(
      /^(?:docs|tests)\//.test(path) || /^(?:README(?:\.(?:md|mdx|txt))?|AGENTS\.md)$/i.test(path)
    ));
    if (unsafePaths.length) {
      throw new Error(`origin/main descendant changes runtime or content paths: ${unsafePaths.join(", ")}`);
    }
    changedPaths.forEach((path) => allChangedPaths.add(path));
  }
  return [...allChangedPaths];
}

function safeInitialPageDelta(root, baseRevision, revision, date, slug) {
  assertCommit(root, baseRevision);
  if (!gitSucceeds(root, ["merge-base", "--is-ancestor", baseRevision, revision])) {
    throw new Error("Daily release proof base is not an ancestor of its revision");
  }
  const revisionLine = gitText(root, ["rev-list", "--parents", "-n", "1", revision]).split(/\s+/);
  if (revisionLine.length !== 2 || revisionLine[1] !== baseRevision) {
    throw new Error("An unpushed daily release must be exactly one non-merge commit above origin/main");
  }
  const changedPaths = changedPathsBetween(root, baseRevision, revision);
  const allowedPaths = new Set(dailyReleaseArtifactPaths(date, slug));
  const unexpectedPaths = changedPaths.filter((path) => !allowedPaths.has(path));
  const missingPaths = [...allowedPaths].filter((path) => !changedPaths.includes(path));
  if (unexpectedPaths.length || missingPaths.length) {
    throw new Error(
      `Daily release commit must change exactly its six-artifact allowlist; ` +
      `unexpected: ${unexpectedPaths.join(", ") || "none"}; missing: ${missingPaths.join(", ") || "none"}`,
    );
  }
  const output = git(root, [
    "diff", "--no-renames", "--name-only", "-z", baseRevision, revision, "--", "data/pages",
  ]);
  const pageChanges = String(output).split("\0").filter(Boolean);
  const targetPath = `data/pages/${slug}.json`;
  if (pageChanges.length !== 1 || pageChanges[0] !== targetPath ||
    gitSucceeds(root, ["cat-file", "-e", `${baseRevision}:${targetPath}`])) {
    throw new Error("Daily release commit must add exactly its one new canonical page data file");
  }
  return {
    baseRevision,
    basePageTreeOid: treeOid(root, baseRevision, "data/pages"),
    pageChanges,
    changedPaths,
  };
}

function assertSingleCanonicalDailyPage(root, revision, date, slug) {
  const pagePaths = [];
  for (const path of treePaths(root, revision)) {
    if (!path.toLowerCase().startsWith("data/pages/")) continue;
    if (!/^data\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(path)) {
      throw new Error(`Release contains a non-canonical page data path: ${path}`);
    }
    pagePaths.push(path);
  }
  const published = [];
  for (const path of pagePaths) {
    let page;
    try {
      page = JSON.parse(gitText(root, ["show", `${revision}:${path}`]));
    } catch (error) {
      throw new Error(`Release page is not valid JSON: ${path}`, { cause: error });
    }
    if (page?.status === "published" && typeof page.publishedAt === "string" &&
      shanghaiDate(page.publishedAt) === date) {
      published.push({ path, slug: page.slug });
    }
  }
  if (published.length !== 1 || published[0].slug !== slug ||
    published[0].path !== `data/pages/${slug}.json`) {
    throw new Error(`Release ${revision} must contain exactly one canonical page for ${date}: ${slug}`);
  }
}

function snapshotReleaseProof(
  root,
  date,
  revision,
  slug,
  observedOriginMainTip,
  baseRevision,
  authorizedReleaseRevision = revision,
) {
  assertReleaseIdentity(date, revision, slug);
  assertCommit(root, revision);
  assertSingleCanonicalDailyPage(root, revision, date, slug);
  const initialDelta = safeInitialPageDelta(root, baseRevision, authorizedReleaseRevision, date, slug);
  const artifactBlobs = Object.fromEntries(
    dailyReleaseArtifactPaths(date, slug).map((path) => [path, blobOid(root, revision, path)]),
  );
  return {
    schemaVersion: 1,
    revision,
    slug,
    observedOriginMainTip,
    baseRevision: initialDelta.baseRevision,
    authorizedReleaseRevision,
    basePageTreeOid: initialDelta.basePageTreeOid,
    pageChanges: initialDelta.pageChanges,
    changedPaths: initialDelta.changedPaths,
    artifactBlobs,
    pageTreeOid: treeOid(root, revision, "data/pages"),
    singleDailyPageVerified: true,
    verifiedAt: new Date().toISOString(),
  };
}

function assertProofMatchesRevision(root, date, revision, slug, proof) {
  if (proof?.schemaVersion !== 1 || proof.revision !== revision || proof.slug !== slug ||
    !SHA_PATTERN.test(String(proof.observedOriginMainTip || "")) ||
    !SHA_PATTERN.test(String(proof.baseRevision || "")) ||
    !SHA_PATTERN.test(String(proof.authorizedReleaseRevision || "")) ||
    !SHA_PATTERN.test(String(proof.basePageTreeOid || "")) || !Array.isArray(proof.pageChanges) ||
    !Array.isArray(proof.changedPaths) ||
    proof.singleDailyPageVerified !== true || !Number.isFinite(Date.parse(proof.verifiedAt || ""))) {
    throw new Error("Persisted daily release Git proof is invalid");
  }
  const actual = snapshotReleaseProof(
    root,
    date,
    revision,
    slug,
    proof.observedOriginMainTip,
    proof.baseRevision,
    proof.authorizedReleaseRevision,
  );
  if (actual.pageTreeOid !== proof.pageTreeOid ||
    actual.basePageTreeOid !== proof.basePageTreeOid ||
    JSON.stringify(actual.pageChanges) !== JSON.stringify(proof.pageChanges) ||
    JSON.stringify(actual.changedPaths) !== JSON.stringify(proof.changedPaths) ||
    JSON.stringify(actual.artifactBlobs) !== JSON.stringify(proof.artifactBlobs)) {
    throw new Error("Persisted daily release Git proof no longer matches its revision");
  }
  return actual;
}

function fetchOriginMain(root, expectedOriginRepository = null) {
  assertOriginIdentity(root, expectedOriginRepository);
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      git(root, [
        "fetch",
        "--quiet",
        "--no-tags",
        "origin",
        "refs/heads/main:refs/remotes/origin/main",
      ]);
      const fetchedTip = gitText(root, ["rev-parse", "--verify", "refs/remotes/origin/main"]);
      const advertised = gitText(root, ["ls-remote", "--exit-code", "origin", "refs/heads/main"])
        .split(/\s+/)[0];
      if (SHA_PATTERN.test(fetchedTip) && fetchedTip === advertised) return fetchedTip;
      lastError = new Error("Fetched and advertised origin/main tips differ");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("Unable to obtain one authoritative origin/main tip after three attempts", { cause: lastError });
}

function pushReleaseFastForward(root, revision, expectedOriginRepository) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      git(root, ["push", "origin", `${revision}:refs/heads/main`]);
    } catch (error) {
      lastError = error;
    }
    try {
      const tip = fetchOriginMain(root, expectedOriginRepository);
      if (tip === revision) return tip;
      if (!gitSucceeds(root, ["merge-base", "--is-ancestor", tip, revision])) {
        const moved = new Error("origin/main changed away from the release fast-forward path");
        moved.code = "SEO_ORIGIN_MOVED_DURING_PUSH";
        throw moved;
      }
    } catch (error) {
      lastError = error;
    }
  }
  const failure = new Error(
    `Unable to fast-forward origin/main to ${revision} after three attempts`,
    { cause: lastError },
  );
  if (lastError?.code === "SEO_ORIGIN_MOVED_DURING_PUSH") failure.code = lastError.code;
  throw failure;
}

function assertWorktreeMatchesRelease(root, date, revision, slug) {
  const paths = dailyReleaseArtifactPaths(date, slug);
  for (const path of paths) {
    const expectedOid = blobOid(root, revision, path);
    const worktreeOid = gitText(root, ["hash-object", `--path=${path}`, path]);
    if (worktreeOid !== expectedOid) {
      throw new Error(`Daily release worktree blob differs from ${revision}: ${path}`);
    }
  }
  const state = readDailyRunState({ root, date });
  if (state.state !== "local_publication_complete" || state.publishedSlug !== slug) {
    throw new Error("Daily release worktree does not contain one complete local chain for the persisted slug");
  }
}

function assertCheckpointRecoveryPaths(actualPaths, expectedPaths, allowedDirtyPaths) {
  const actual = new Set(actualPaths);
  const expected = new Set(expectedPaths);
  const allowed = new Set(allowedDirtyPaths);
  const unexpected = [...actual].filter((path) => !expected.has(path) && !allowed.has(path));
  if (unexpected.length) {
    throw new Error(`Checkpoint recovery worktree contains unrelated paths: ${unexpected.join(", ")}`);
  }
}

function deterministicReleaseIdentity(root, date, slug) {
  let page;
  try {
    page = JSON.parse(readFileSync(resolve(root, `data/pages/${slug}.json`), "utf8"));
  } catch (error) {
    throw new Error("Daily release page must be readable JSON before commit construction", { cause: error });
  }
  if (page?.slug !== slug || page?.status !== "published" ||
    !Number.isFinite(Date.parse(page?.publishedAt || "")) || shanghaiDate(page.publishedAt) !== date) {
    throw new Error("Daily release page must have a stable same-day publication timestamp");
  }
  return {
    ...process.env,
    GIT_AUTHOR_NAME: "Codex SEO Automation",
    GIT_AUTHOR_EMAIL: "seo-automation@users.noreply.github.com",
    GIT_AUTHOR_DATE: page.publishedAt,
    GIT_COMMITTER_NAME: "Codex SEO Automation",
    GIT_COMMITTER_EMAIL: "seo-automation@users.noreply.github.com",
    GIT_COMMITTER_DATE: page.publishedAt,
  };
}

function constructDailyReleaseOnBase(root, date, slug, baseRevision) {
  assertCommit(root, baseRevision);
  const expectedPaths = dailyReleaseArtifactPaths(date, slug);
  const temporaryRoot = mkdtempSync(join(tmpdir(), "lorelens-release-index-"));
  try {
    const indexPath = join(temporaryRoot, "index");
    const indexEnvironment = { ...process.env, GIT_INDEX_FILE: indexPath };
    git(root, ["read-tree", baseRevision], { env: indexEnvironment });
    for (const path of expectedPaths) {
      const oid = gitText(root, ["hash-object", "-w", `--path=${path}`, path]);
      git(root, [
        "update-index", "--add", "--cacheinfo", "100644", oid, path,
      ], { env: indexEnvironment });
    }
    const tree = gitText(root, ["write-tree"], { env: indexEnvironment });
    const revision = gitText(root, [
      "commit-tree", tree, "-p", baseRevision, "-m", `feat(seo): publish ${slug}`,
    ], { env: deterministicReleaseIdentity(root, date, slug) });
    const releaseProof = snapshotReleaseProof(
      root,
      date,
      revision,
      slug,
      baseRevision,
      baseRevision,
      revision,
    );
    assertWorktreeMatchesRelease(root, date, revision, slug);
    return { revision, slug, releaseProof };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function assertPinnedReleaseMatchesCheckpoint(root, date, slug, revision) {
  assertCommit(root, revision);
  const parents = gitText(root, ["rev-list", "--parents", "-n", "1", revision]).split(/\s+/);
  if (parents.length !== 2) throw new Error("Checkpoint recovery pin must name one non-merge daily commit");
  const proof = snapshotReleaseProof(root, date, revision, slug, parents[1], parents[1], revision);
  assertWorktreeMatchesRelease(root, date, revision, slug);
  return proof;
}

function releaseProofContentIsEquivalent(left, right) {
  return left?.basePageTreeOid === right?.basePageTreeOid &&
    left?.pageTreeOid === right?.pageTreeOid &&
    JSON.stringify(left?.pageChanges) === JSON.stringify(right?.pageChanges) &&
    JSON.stringify(left?.changedPaths) === JSON.stringify(right?.changedPaths) &&
    JSON.stringify(left?.artifactBlobs) === JSON.stringify(right?.artifactBlobs);
}

export function materializeCheckpointDailyRelease({
  worktreeRoot,
  date,
  slug,
  allowedDirtyPaths = [],
  expectedOriginRepository = null,
}) {
  assertReleaseIdentity(date, "0".repeat(40), slug);
  const state = readDailyRunState({ root: worktreeRoot, date });
  if (state.state !== "local_publication_complete" || state.publishedSlug !== slug) {
    throw new Error("Checkpoint recovery requires one complete local publication chain");
  }
  if (!Array.isArray(allowedDirtyPaths) || allowedDirtyPaths.some((path) =>
    !/^data\/seo-feedback\/inbox\/[a-z0-9-]+\.json$/.test(String(path || "")))) {
    throw new Error("Checkpoint recovery allowed-dirty paths must be bound feedback inbox files");
  }
  const expectedPaths = dailyReleaseArtifactPaths(date, slug);
  for (const path of expectedPaths) {
    const absolutePath = resolve(worktreeRoot, path);
    const stat = existsSync(absolutePath) ? lstatSync(absolutePath) : null;
    if (!stat?.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Checkpoint recovery artifact must be a regular file: ${path}`);
    }
  }
  const changedPaths = [
    ...gitPaths(worktreeRoot, ["diff", "--cached", "--no-renames", "--name-only", "-z"]),
    ...gitPaths(worktreeRoot, ["diff", "--no-renames", "--name-only", "-z"]),
    ...gitPaths(worktreeRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ];
  assertCheckpointRecoveryPaths(changedPaths, expectedPaths, allowedDirtyPaths);

  let pinnedRevision = readPinnedDailyReleaseRevision({ worktreeRoot, date });
  let pinnedProof = pinnedRevision
    ? assertPinnedReleaseMatchesCheckpoint(worktreeRoot, date, slug, pinnedRevision)
    : null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const originMainTip = fetchOriginMain(worktreeRoot, expectedOriginRepository);
    if (pinnedProof) {
      if (!gitSucceeds(worktreeRoot, [
        "merge-base", "--is-ancestor", pinnedProof.baseRevision, originMainTip,
      ])) {
        throw new Error("Checkpoint recovery origin no longer descends from its pinned release base");
      }
      assertSafeDescendantDelta(worktreeRoot, pinnedProof.baseRevision, originMainTip);
      if (treeOid(worktreeRoot, originMainTip, "data/pages") !== pinnedProof.basePageTreeOid) {
        throw new Error("Checkpoint recovery origin changes the pinned release base page corpus");
      }
    }
    const constructed = constructDailyReleaseOnBase(worktreeRoot, date, slug, originMainTip);
    if (pinnedProof && !releaseProofContentIsEquivalent(pinnedProof, constructed.releaseProof)) {
      throw new Error("Checkpoint recovery rebase changes the pinned daily artifacts or page corpus");
    }
    pinDailyReleaseRevision({
      worktreeRoot,
      date,
      revision: constructed.revision,
      expectedRevision: pinnedRevision,
    });
    pinnedRevision = constructed.revision;
    pinnedProof = constructed.releaseProof;
    if (fetchOriginMain(worktreeRoot, expectedOriginRepository) !== originMainTip) continue;
    return { ...constructed, action: "checkpoint_committed_and_pinned" };
  }
  throw new Error("origin/main changed repeatedly while materializing the checkpoint release");
}

export function assertIntermediateDailyReleaseRebasePin({
  worktreeRoot,
  date,
  slug,
  markerProof,
  pinnedRevision,
  nextProof,
}) {
  assertReleaseIdentity(date, pinnedRevision, slug);
  if (markerProof?.slug !== slug || nextProof?.slug !== slug) {
    throw new Error("Intermediate release pin slug does not match its rebase chain");
  }
  const pinnedProof = assertPinnedReleaseMatchesCheckpoint(worktreeRoot, date, slug, pinnedRevision);
  for (const [ancestor, descendant] of [
    [markerProof.baseRevision, pinnedProof.baseRevision],
    [pinnedProof.baseRevision, nextProof.baseRevision],
  ]) {
    if (!SHA_PATTERN.test(String(ancestor || "")) || !SHA_PATTERN.test(String(descendant || "")) ||
      !gitSucceeds(worktreeRoot, ["merge-base", "--is-ancestor", ancestor, descendant])) {
      throw new Error("Intermediate release pin is outside the safe sibling-rebase base chain");
    }
    assertSafeDescendantDelta(worktreeRoot, ancestor, descendant);
  }
  if (!releaseProofContentIsEquivalent(markerProof, pinnedProof) ||
    !releaseProofContentIsEquivalent(pinnedProof, nextProof)) {
    throw new Error("Intermediate release pin changes the daily artifacts or page corpus");
  }
  return pinnedProof;
}

export function buildDailyReleaseProof({
  worktreeRoot,
  date,
  revision,
  slug,
  expectedOriginRepository = null,
}) {
  assertReleaseIdentity(date, revision, slug);
  assertWorktreeMatchesRelease(worktreeRoot, date, revision, slug);
  const originMainTip = fetchOriginMain(worktreeRoot, expectedOriginRepository);
  if (originMainTip === revision) {
    throw new Error("A new release marker cannot be created after its revision already reached origin/main");
  }
  if (!gitSucceeds(worktreeRoot, ["merge-base", "--is-ancestor", originMainTip, revision])) {
    throw new Error("Release start requires origin/main to be a strict ancestor of the release revision");
  }
  return snapshotReleaseProof(worktreeRoot, date, revision, slug, originMainTip, originMainTip, revision);
}

export function assertDailyReleaseRevision({ worktreeRoot, date, revision, slug, proof }) {
  assertReleaseIdentity(date, revision, slug);
  assertCommit(worktreeRoot, revision);
  assertWorktreeMatchesRelease(worktreeRoot, date, revision, slug);
  return assertProofMatchesRevision(worktreeRoot, date, revision, slug, proof);
}

export function pinDailyReleaseRevision({ worktreeRoot, date, revision, expectedRevision = null }) {
  assertReleaseIdentity(date, revision, "release");
  if (expectedRevision !== null && !SHA_PATTERN.test(String(expectedRevision || ""))) {
    throw new Error("Pinned release expected revision must be a full Git SHA");
  }
  assertCommit(worktreeRoot, revision);
  const ref = `refs/codex/daily-releases/${date}`;
  const existing = gitSucceeds(worktreeRoot, ["show-ref", "--verify", "--quiet", ref])
    ? gitText(worktreeRoot, ["rev-parse", "--verify", ref])
    : null;
  if (existing === revision) return { ref, revision, outcome: "already_pinned" };
  if (existing !== null && existing !== expectedRevision) {
    throw new Error(`Pinned daily release ref conflicts with ${existing}`);
  }
  git(worktreeRoot, ["update-ref", ref, revision, existing || ZERO_SHA]);
  return { ref, revision, outcome: existing ? "superseded" : "pinned" };
}

export function readPinnedDailyReleaseRevision({ worktreeRoot, date }) {
  assertReleaseIdentity(date, "0".repeat(40), "release");
  const ref = `refs/codex/daily-releases/${date}`;
  return gitSucceeds(worktreeRoot, ["show-ref", "--verify", "--quiet", ref])
    ? gitText(worktreeRoot, ["rev-parse", "--verify", ref])
    : null;
}

export function dailyReleaseRevisionIsAncestor({ worktreeRoot, ancestor, descendant }) {
  if (!SHA_PATTERN.test(String(ancestor || "")) || !SHA_PATTERN.test(String(descendant || ""))) {
    throw new Error("Daily release ancestry requires two full Git SHAs");
  }
  assertCommit(worktreeRoot, ancestor);
  assertCommit(worktreeRoot, descendant);
  return gitSucceeds(worktreeRoot, ["merge-base", "--is-ancestor", ancestor, descendant]);
}

export function orphanedDailyReleasePinIsEquivalent({
  worktreeRoot,
  date,
  slug,
  pinnedRevision,
  nextProof,
}) {
  try {
    assertReleaseIdentity(date, pinnedRevision, slug);
    if (nextProof?.revision === pinnedRevision) return true;
    const pinnedProof = snapshotReleaseProof(
      worktreeRoot,
      date,
      pinnedRevision,
      slug,
      nextProof.baseRevision,
      nextProof.baseRevision,
      pinnedRevision,
    );
    return pinnedProof.baseRevision === nextProof.baseRevision &&
      pinnedProof.pageTreeOid === nextProof.pageTreeOid &&
      JSON.stringify(pinnedProof.pageChanges) === JSON.stringify(nextProof.pageChanges) &&
      JSON.stringify(pinnedProof.changedPaths) === JSON.stringify(nextProof.changedPaths) &&
      JSON.stringify(pinnedProof.artifactBlobs) === JSON.stringify(nextProof.artifactBlobs);
  } catch {
    return false;
  }
}

export function prepareDailyReleaseRevision({
  worktreeRoot,
  date,
  releaseInFlight,
  expectedOriginRepository = null,
  allowPush = true,
}) {
  if (typeof allowPush !== "boolean") throw new Error("Daily release allowPush must be boolean");
  const revision = releaseInFlight?.revision;
  const slug = releaseInFlight?.slug;
  const proof = releaseInFlight?.releaseProof;
  assertReleaseIdentity(date, revision, slug);
  assertDailyReleaseRevision({ worktreeRoot, date, revision, slug, proof });
  const originMainTip = fetchOriginMain(worktreeRoot, expectedOriginRepository);
  if (originMainTip === revision) {
    return { action: "already_at_tip", revision, releaseProof: proof };
  }
  if (gitSucceeds(worktreeRoot, ["merge-base", "--is-ancestor", originMainTip, revision])) {
    if (!allowPush) {
      throw new Error("Post-verification confirmation refuses to repush an origin/main rollback");
    }
    const pushedTip = pushReleaseFastForward(worktreeRoot, revision, expectedOriginRepository);
    if (pushedTip !== revision) {
      throw new Error(`Fast-forward release push did not produce the exact origin/main tip ${revision}`);
    }
    return { action: "fast_forward_pushed", revision, releaseProof: proof };
  }
  if (gitSucceeds(worktreeRoot, ["merge-base", "--is-ancestor", revision, originMainTip])) {
    const nextProof = snapshotReleaseProof(
      worktreeRoot,
      date,
      originMainTip,
      slug,
      originMainTip,
      proof.baseRevision,
      proof.authorizedReleaseRevision,
    );
    if (nextProof.pageTreeOid !== proof.pageTreeOid ||
      JSON.stringify(nextProof.artifactBlobs) !== JSON.stringify(proof.artifactBlobs)) {
      throw new Error("origin/main advanced with different daily artifacts or page corpus");
    }
    assertSafeDescendantDelta(worktreeRoot, revision, originMainTip);
    return {
      action: "descendant_equivalent",
      revision: originMainTip,
      releaseProof: nextProof,
      supersessionProof: {
        originMainTip,
        descendantVerified: true,
        dailyArtifactsEquivalent: true,
        singleDailyPageVerified: true,
        releaseProof: nextProof,
        verifiedAt: new Date().toISOString(),
      },
    };
  }
  if (allowPush && gitSucceeds(worktreeRoot, [
    "merge-base", "--is-ancestor", proof.baseRevision, originMainTip,
  ])) {
    assertSafeDescendantDelta(worktreeRoot, proof.baseRevision, originMainTip);
    if (treeOid(worktreeRoot, originMainTip, "data/pages") !== proof.basePageTreeOid) {
      throw new Error("origin/main sibling advance changes the pre-release page corpus");
    }
    const rebased = constructDailyReleaseOnBase(worktreeRoot, date, slug, originMainTip);
    if (rebased.releaseProof.basePageTreeOid !== proof.basePageTreeOid ||
      rebased.releaseProof.pageTreeOid !== proof.pageTreeOid ||
      JSON.stringify(rebased.releaseProof.pageChanges) !== JSON.stringify(proof.pageChanges) ||
      JSON.stringify(rebased.releaseProof.changedPaths) !== JSON.stringify(proof.changedPaths) ||
      JSON.stringify(rebased.releaseProof.artifactBlobs) !== JSON.stringify(proof.artifactBlobs)) {
      throw new Error("origin/main sibling advance cannot preserve the daily artifacts and page corpus");
    }
    return {
      action: "rebased_equivalent",
      revision: rebased.revision,
      releaseProof: rebased.releaseProof,
      rebaseProof: {
        previousRevision: revision,
        originBaseRevision: originMainTip,
        advancedFromBaseRevision: proof.baseRevision,
        baseAdvanceVerified: true,
        dailyArtifactsEquivalent: true,
        pageCorpusEquivalent: true,
        singleDailyPageVerified: true,
        releaseProof: rebased.releaseProof,
        verifiedAt: new Date().toISOString(),
      },
    };
  }
  throw new Error("origin/main diverged from the persisted daily release; automatic recovery is unsafe");
}

export function authoritativeOriginMainTip({ worktreeRoot, expectedOriginRepository = null }) {
  return fetchOriginMain(worktreeRoot, expectedOriginRepository);
}

export function confirmDailyReleaseAtOriginMain({
  worktreeRoot,
  revision,
  expectedOriginRepository = null,
}) {
  if (!SHA_PATTERN.test(String(revision || ""))) {
    throw new Error("Remote release confirmation requires a full Git SHA");
  }
  assertCommit(worktreeRoot, revision);
  const firstTip = fetchOriginMain(worktreeRoot, expectedOriginRepository);
  if (firstTip !== revision) {
    throw new Error(`Release confirmation requires origin/main to remain exactly ${revision}`);
  }
  const secondTip = fetchOriginMain(worktreeRoot, expectedOriginRepository);
  if (secondTip !== revision) {
    throw new Error(`origin/main changed during final release confirmation from ${revision}`);
  }
  return secondTip;
}
