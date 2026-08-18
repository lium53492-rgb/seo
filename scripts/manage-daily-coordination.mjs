import "./load-env.mjs";

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import unattendedPolicy from "../data/config/unattended-publishing.json" with { type: "json" };
import {
  acquireDailyLease,
  acquireDailyReleaseRecoveryLease,
  completeDailyLease,
  completeDailyNoPublish,
  coordinationOwner,
  heartbeatDailyLease,
  inspectDailyCarryover,
  prepareDailyRelease,
  readDailyLease,
  rebaseDailyRelease,
  resumeDailyAfterNoPublish,
  restoreDailyCheckpoint,
  saveDailyCheckpoint,
  startDailyRelease,
  supersedeDailyRelease,
} from "./lib/daily-coordination.mjs";
import {
  assertDailyReleaseRevision,
  assertIntermediateDailyReleaseRebasePin,
  authoritativeOriginMainTip,
  buildDailyReleaseProof,
  confirmDailyReleaseAtOriginMain,
  dailyReleaseRevisionIsAncestor,
  materializeCheckpointDailyRelease,
  orphanedDailyReleasePinIsEquivalent,
  pinDailyReleaseRevision,
  prepareDailyReleaseRevision,
  readPinnedDailyReleaseRevision,
} from "./lib/daily-release-git.mjs";
import { readDailyRunState, shanghaiDate } from "./lib/daily-run-state.mjs";

const [action = "status", requestedDate, revision, slug] = process.argv.slice(2);
const date = requestedDate || shanghaiDate();
const worktreeRoot = process.cwd();
const coordinationRoot = resolve(execFileSync("git", ["rev-parse", "--git-common-dir"], {
  cwd: worktreeRoot,
  encoding: "utf8",
}).trim());
const runId = process.env.CODEX_THREAD_ID || process.env.SEO_DAILY_RUN_ID;
const owner = coordinationOwner(worktreeRoot, runId);
const expectedOriginRepository = unattendedPolicy.releaseVerification.expectedOriginRepository;

function gitText(args) {
  return execFileSync("git", args, {
    cwd: worktreeRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function verifyLiveRelease(releaseRevision, releaseSlug) {
  let lastError = null;
  for (let attempt = 0; attempt < unattendedPolicy.networkAttempts; attempt += 1) {
    try {
      return execFileSync(process.execPath, [
        resolve(worktreeRoot, "scripts", "verify-live-release.mjs"),
        unattendedPolicy.releaseVerification.origin,
        releaseRevision,
        releaseSlug,
      ], { cwd: worktreeRoot, encoding: "utf8" }).trim();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("Playworlds LoreLens live verification failed after all configured attempts", { cause: lastError });
}

function verifyLocalRelease(releaseRevision) {
  if (!/^[a-f0-9]{40}$/.test(String(releaseRevision || ""))) {
    throw new Error("Local release verification requires one exact full Git SHA");
  }
  const npmExecPath = process.env.npm_execpath;
  if (typeof npmExecPath !== "string" || !npmExecPath.trim()) {
    throw new Error("Local release verification requires the npm execution path");
  }
  gitText(["cat-file", "-e", `${releaseRevision}^{commit}`]);
  const repositoryRoot = dirname(coordinationRoot);
  const verificationParent = resolve(repositoryRoot, ".codex-worktrees");
  mkdirSync(verificationParent, { recursive: true });
  const temporaryRoot = mkdtempSync(join(verificationParent, "release-verify-"));
  const detachedWorktree = join(temporaryRoot, "worktree");
  let worktreeAdded = false;
  try {
    execFileSync("git", ["worktree", "add", "--detach", detachedWorktree, releaseRevision], {
      cwd: worktreeRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    worktreeAdded = true;
    const dependencyBin = join(repositoryRoot, "node_modules", ".bin");
    const dependencyRoot = join(repositoryRoot, "node_modules");
    const environment = {
      ...process.env,
      INIT_CWD: detachedWorktree,
      VERCEL: "1",
      VERCEL_GIT_COMMIT_SHA: releaseRevision,
      PATH: [dependencyBin, process.env.PATH].filter(Boolean).join(delimiter),
      NODE_PATH: [dependencyRoot, process.env.NODE_PATH].filter(Boolean).join(delimiter),
    };
    return execFileSync(process.execPath, [npmExecPath, "run", "verify"], {
      cwd: detachedWorktree,
      env: environment,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } finally {
    if (worktreeAdded) {
      execFileSync("git", ["worktree", "remove", "--force", detachedWorktree], {
        cwd: worktreeRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    }
    if (existsSync(temporaryRoot)) rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function applyPreparedRevision(releaseDate, lease, prepared) {
  const inFlight = lease.releaseInFlight;
  if (prepared.revision === inFlight.revision) return lease;
  const pinnedRevision = readPinnedDailyReleaseRevision({ worktreeRoot, date: releaseDate });
  if (pinnedRevision && pinnedRevision !== inFlight.revision && pinnedRevision !== prepared.revision) {
    if (prepared.action === "rebased_equivalent") {
      assertIntermediateDailyReleaseRebasePin({
        worktreeRoot,
        date: releaseDate,
        slug: inFlight.slug,
        markerProof: inFlight.releaseProof,
        pinnedRevision,
        nextProof: prepared.releaseProof,
      });
    } else if (!dailyReleaseRevisionIsAncestor({
      worktreeRoot,
      ancestor: inFlight.revision,
      descendant: pinnedRevision,
    }) || !dailyReleaseRevisionIsAncestor({
      worktreeRoot,
      ancestor: pinnedRevision,
      descendant: prepared.revision,
    })) {
      throw new Error("Pinned release revision is outside the safe marker-to-tip ancestry chain");
    }
  }
  pinDailyReleaseRevision({
    worktreeRoot,
    date: releaseDate,
    revision: prepared.revision,
    expectedRevision: pinnedRevision || inFlight.revision,
  });
  if (prepared.action === "rebased_equivalent") {
    return rebaseDailyRelease({
      coordinationRoot,
      date: releaseDate,
      owner,
      currentRevision: inFlight.revision,
      nextRevision: prepared.revision,
      slug: inFlight.slug,
      proof: prepared.rebaseProof,
    });
  }
  return supersedeDailyRelease({
    coordinationRoot,
    date: releaseDate,
    owner,
    currentRevision: inFlight.revision,
    nextRevision: prepared.revision,
    slug: inFlight.slug,
    proof: prepared.supersessionProof,
  });
}

function promotePreparedRelease(releaseDate, lease) {
  const preparation = lease.releasePreparing;
  if (!preparation || lease.releaseInFlight) return lease;
  assertDailyReleaseRevision({
    worktreeRoot,
    date: releaseDate,
    revision: preparation.revision,
    slug: preparation.slug,
    proof: preparation.releaseProof,
  });
  const pinnedRevision = readPinnedDailyReleaseRevision({ worktreeRoot, date: releaseDate });
  if (pinnedRevision && pinnedRevision !== preparation.revision &&
    !orphanedDailyReleasePinIsEquivalent({
      worktreeRoot,
      date: releaseDate,
      slug: preparation.slug,
      pinnedRevision,
      nextProof: preparation.releaseProof,
    })) {
    throw new Error("Prepared release conflicts with its pinned recovery revision");
  }
  pinDailyReleaseRevision({
    worktreeRoot,
    date: releaseDate,
    revision: preparation.revision,
    expectedRevision: pinnedRevision || null,
  });
  return startDailyRelease({
    coordinationRoot,
    worktreeRoot,
    date: releaseDate,
    owner,
    revision: preparation.revision,
    slug: preparation.slug,
    releaseProof: preparation.releaseProof,
  });
}

function prepareOrphanedPinnedRelease(releaseDate, lease, allowedDirtyPaths = []) {
  if (lease.releasePreparing || lease.releaseInFlight) return lease;
  const materialized = materializeCheckpointDailyRelease({
    worktreeRoot,
    date: releaseDate,
    slug: readDailyRunState({ root: worktreeRoot, date: releaseDate }).publishedSlug,
    allowedDirtyPaths,
    expectedOriginRepository,
  });
  return prepareDailyRelease({
    coordinationRoot,
    worktreeRoot,
    date: releaseDate,
    owner,
    revision: materialized.revision,
    slug: materialized.slug,
    releaseProof: materialized.releaseProof,
    recoveryPinnedRevision: materialized.revision,
  });
}

function settleActiveRelease(releaseDate) {
  let lease = readDailyLease({ coordinationRoot, date: releaseDate });
  const locallyVerifiedRevisions = new Set();
  const ensureLocallyVerified = (releaseRevision) => {
    if (locallyVerifiedRevisions.has(releaseRevision)) return;
    verifyLocalRelease(releaseRevision);
    locallyVerifiedRevisions.add(releaseRevision);
  };
  for (let attempt = 1; attempt <= unattendedPolicy.networkAttempts; attempt += 1) {
    lease = heartbeatDailyLease({ coordinationRoot, date: releaseDate, owner });
    const marker = lease.releaseInFlight;
    if (!marker) throw new Error("The active daily lease has no release-in-flight marker");
    ensureLocallyVerified(marker.revision);
    let prepared;
    try {
      prepared = prepareDailyReleaseRevision({
        worktreeRoot,
        date: releaseDate,
        releaseInFlight: marker,
        expectedOriginRepository,
      });
    } catch (error) {
      if (error?.code === "SEO_ORIGIN_MOVED_DURING_PUSH") continue;
      throw error;
    }
    lease = applyPreparedRevision(releaseDate, lease, prepared);
    const verifiedMarker = lease.releaseInFlight;
    ensureLocallyVerified(verifiedMarker.revision);
    pinDailyReleaseRevision({
      worktreeRoot,
      date: releaseDate,
      revision: verifiedMarker.revision,
      expectedRevision: verifiedMarker.revision,
    });
    const tipBeforeVerification = authoritativeOriginMainTip({ worktreeRoot, expectedOriginRepository });
    if (tipBeforeVerification !== verifiedMarker.revision) continue;

    const verificationOutput = verifyLiveRelease(verifiedMarker.revision, verifiedMarker.slug);
    const afterVerification = prepareDailyReleaseRevision({
      worktreeRoot,
      date: releaseDate,
      releaseInFlight: verifiedMarker,
      expectedOriginRepository,
      allowPush: false,
    });
    if (afterVerification.revision !== verifiedMarker.revision) {
      lease = applyPreparedRevision(releaseDate, lease, afterVerification);
      continue;
    }
    const originMainTip = confirmDailyReleaseAtOriginMain({
      worktreeRoot,
      revision: verifiedMarker.revision,
      expectedOriginRepository,
    });
    if (originMainTip !== verifiedMarker.revision) continue;
    const verifiedAt = new Date().toISOString();
    return completeDailyLease({
      coordinationRoot,
      worktreeRoot,
      date: releaseDate,
      owner,
      revision: verifiedMarker.revision,
      slug: verifiedMarker.slug,
      verification: {
        origin: unattendedPolicy.releaseVerification.origin,
        revision: verifiedMarker.revision,
        slug: verifiedMarker.slug,
        verifiedAt,
        productionDate: shanghaiDate(verifiedAt),
        detail: verificationOutput,
        originMainVerified: true,
        originMainTip,
      },
    });
  }
  throw new Error("origin/main changed repeatedly while the daily release was being verified");
}

function run() {
  let result;
  switch (action) {
    case "settle": {
      const carryover = inspectDailyCarryover({
        coordinationRoot,
        date,
        owner,
        staleAfterMinutes: unattendedPolicy.leaseStaleAfterMinutes,
      });
      if (carryover.state === "none") {
        result = { outcome: "clear", carryover };
        break;
      }
      if (carryover.state === "no_publish") {
        result = { outcome: "no_publish", carryover };
        break;
      }
      if (carryover.state === "guided") {
        process.exitCode = 3;
        result = { outcome: "user_guided_active", carryover };
        break;
      }
      if (carryover.state === "occupied") {
        result = { outcome: "completed", carryover };
        break;
      }
      if (carryover.state === "busy") {
        process.exitCode = 3;
        result = { outcome: "busy", carryover };
        break;
      }
      const recovery = acquireDailyReleaseRecoveryLease({
        coordinationRoot,
        date: carryover.releaseDate,
        owner,
        staleAfterMinutes: unattendedPolicy.leaseStaleAfterMinutes,
      });
      if (recovery.outcome === "busy") {
        process.exitCode = 3;
        result = { outcome: "busy", carryover: { ...carryover, lease: recovery.lease } };
        break;
      }
      const restoration = restoreDailyCheckpoint({
        coordinationRoot,
        worktreeRoot,
        date: carryover.releaseDate,
        owner,
      });
      const recoveredLease = prepareOrphanedPinnedRelease(carryover.releaseDate, readDailyLease({
        coordinationRoot,
        date: carryover.releaseDate,
      }), restoration.feedbackPaths || []);
      promotePreparedRelease(carryover.releaseDate, recoveredLease);
      const completed = settleActiveRelease(carryover.releaseDate);
      result = {
        outcome: "completed",
        carryover: { state: "occupied", releaseDate: carryover.releaseDate, lease: completed },
      };
      break;
    }
    case "acquire":
      result = acquireDailyLease({
        coordinationRoot,
        date,
        owner,
        staleAfterMinutes: unattendedPolicy.leaseStaleAfterMinutes,
      });
      if (result.outcome === "busy") process.exitCode = 3;
      break;
    case "assert":
    case "heartbeat":
      result = {
        outcome: "owned",
        lease: heartbeatDailyLease({ coordinationRoot, date, owner }),
      };
      break;
    case "save":
      result = saveDailyCheckpoint({ coordinationRoot, worktreeRoot, date, owner });
      break;
    case "restore":
      result = restoreDailyCheckpoint({ coordinationRoot, worktreeRoot, date, owner });
      break;
    case "no-publish":
      result = {
        outcome: "no_publish",
        lease: completeDailyNoPublish({
          coordinationRoot,
          worktreeRoot,
          date,
          owner,
          reasonCode: revision,
          reason: slug,
        }),
      };
      break;
    case "guided-resume":
      result = resumeDailyAfterNoPublish({
        coordinationRoot,
        worktreeRoot,
        date,
        owner,
        feedbackId: revision,
        confirmation: slug,
      });
      break;
    case "release-start": {
      if (gitText(["rev-parse", "HEAD"]) !== revision) {
        throw new Error("Release start revision must equal the current Git HEAD");
      }
      const currentLease = readDailyLease({ coordinationRoot, date });
      const persistedRelease = currentLease?.releaseInFlight || currentLease?.releasePreparing;
      if (persistedRelease && (
        persistedRelease.revision !== revision || persistedRelease.slug !== slug
      )) {
        throw new Error("A different daily release is already in flight");
      }
      heartbeatDailyLease({ coordinationRoot, date, owner });
      verifyLocalRelease(revision);
      heartbeatDailyLease({ coordinationRoot, date, owner });
      const releaseProof = persistedRelease
        ? persistedRelease.releaseProof
        : buildDailyReleaseProof({
          worktreeRoot,
          date,
          revision,
          slug,
          expectedOriginRepository,
        });
      if (persistedRelease) {
        assertDailyReleaseRevision({ worktreeRoot, date, revision, slug, proof: releaseProof });
      }
      saveDailyCheckpoint({ coordinationRoot, worktreeRoot, date, owner });
      heartbeatDailyLease({ coordinationRoot, date, owner });
      const pinnedRevision = readPinnedDailyReleaseRevision({ worktreeRoot, date });
      if (!currentLease?.releaseInFlight && pinnedRevision && pinnedRevision !== revision &&
        !dailyReleaseRevisionIsAncestor({ worktreeRoot, ancestor: pinnedRevision, descendant: revision }) &&
        !orphanedDailyReleasePinIsEquivalent({
          worktreeRoot,
          date,
          slug,
          pinnedRevision,
          nextProof: releaseProof,
        })) {
        throw new Error("An orphaned daily release pin cannot safely advance to the requested revision");
      }
      pinDailyReleaseRevision({
        worktreeRoot,
        date,
        revision,
        expectedRevision: pinnedRevision || null,
      });
      if (!persistedRelease) {
        prepareDailyRelease({
          coordinationRoot,
          worktreeRoot,
          date,
          owner,
          revision,
          slug,
          releaseProof,
        });
      }
      result = startDailyRelease({
        coordinationRoot,
        worktreeRoot,
        date,
        owner,
        revision,
        slug,
        releaseProof,
      });
      break;
    }
    case "complete": {
      const lease = readDailyLease({ coordinationRoot, date });
      if (lease?.releaseInFlight?.revision !== revision || lease.releaseInFlight.slug !== slug) {
        throw new Error("Completion arguments must match the persisted release-in-flight marker");
      }
      result = settleActiveRelease(date);
      break;
    }
    case "status":
      result = { owner, lease: readDailyLease({ coordinationRoot, date }) };
      break;
    default:
      throw new Error("Usage: npm run daily:coord -- settle|acquire|guided-resume|restore|save|heartbeat|assert|no-publish|release-start|complete|status [YYYY-MM-DD] [SHA_OR_REASON_CODE_OR_FEEDBACK_ID] [SLUG_OR_REASON_OR_CONFIRMATION]");
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  run();
} catch (error) {
  if (error?.code === "SEO_COORDINATION_BUSY") {
    process.exitCode = 3;
    process.stdout.write(`${JSON.stringify({ outcome: "busy", detail: error.message }, null, 2)}\n`);
  } else {
    throw error;
  }
}
