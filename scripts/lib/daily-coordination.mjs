import "../load-env.mjs";

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import unattendedPolicy from "../../data/config/unattended-publishing.json" with { type: "json" };
import seoPolicy from "../../data/config/seo-policy.json" with { type: "json" };
import {
  summarizeGoogleTrendsEvidence,
  validateGoogleTrendsEvidence,
} from "../../lib/seo/google-trends-contract.mjs";
import { isDailyNoPublishReceipt, readDailyRunState, shanghaiDate } from "./daily-run-state.mjs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OWNER_PATTERN = /^[a-f0-9]{16}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REVISION_PATTERN = /^[0-9TZ.-]+-[a-f0-9]{16}-[a-f0-9-]{36}$/;
const ATOMIC_REPLACE_RETRY_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const OPERATION_LOCK_STALE_MS = 5 * 60_000;

function coordinationBusy(message = "Daily coordination state is currently being updated") {
  const error = new Error(message);
  error.code = "SEO_COORDINATION_BUSY";
  return error;
}

function assertDate(date) {
  if (!DATE_PATTERN.test(String(date || ""))) throw new Error("Coordination requires YYYY-MM-DD");
}

function pinnedDailyReleaseRevision(coordinationRoot, date) {
  assertDate(date);
  const refName = `refs/codex/daily-releases/${date}`;
  const looseRefPath = resolve(coordinationRoot, ...refName.split("/"));
  const packedRefsPath = resolve(coordinationRoot, "packed-refs");
  if (!existsSync(looseRefPath)) {
    if (!existsSync(packedRefsPath) ||
      !readFileSync(packedRefsPath, "utf8").split(/\r?\n/).some((line) => line.endsWith(` ${refName}`))) {
      return null;
    }
  }
  try {
    const revision = execFileSync("git", [
      "--git-dir",
      resolve(coordinationRoot),
      "show-ref",
      "--verify",
      "--hash",
      refName,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (!SHA_PATTERN.test(revision)) throw new Error("Pinned daily release ref is not a full Git SHA");
    return revision;
  } catch (error) {
    if (error?.status === 1) return null;
    throw error;
  }
}

function readyReleaseCheckpoint(coordinationRoot, date, lease) {
  const revision = lease?.checkpointRevision;
  if (!revision) return null;
  if (typeof revision !== "string" || !REVISION_PATTERN.test(revision)) {
    throw new Error("Daily checkpoint lease pointer is invalid");
  }
  const dailyRoot = coordinationDirectory(coordinationRoot, date);
  const manifestPath = resolve(dailyRoot, "manifests", `${revision}.json`);
  assertSafePath(dailyRoot, manifestPath);
  if (!existsSync(manifestPath)) throw new Error("Daily checkpoint manifest is missing");
  const stat = lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Daily checkpoint manifest must be a real file");
  const manifest = readJson(manifestPath);
  if (manifest.date !== date || manifest.revision !== revision || !Number.isInteger(manifest.generation) ||
    manifest.generation > lease.generation || !Array.isArray(manifest.files)) {
    throw new Error("Daily checkpoint manifest is invalid or comes from a future lease generation");
  }
  const slug = manifest.state?.state === "local_publication_complete"
    ? manifest.state.publishedSlug
    : null;
  if (slug === null) return null;
  const savedAt = new Date(manifest.savedAt);
  if (!Number.isFinite(savedAt.getTime())) throw new Error("Daily checkpoint savedAt is invalid");
  assertPublishingWindow(date, savedAt);
  if (!SLUG_PATTERN.test(String(slug || ""))) {
    throw new Error("Complete daily checkpoint has an invalid published slug");
  }
  const expectedPaths = [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ];
  const filePaths = manifest.files.map((file) => file?.path);
  if (filePaths.length !== expectedPaths.length || new Set(filePaths).size !== expectedPaths.length ||
    expectedPaths.some((path) => !filePaths.includes(path))) {
    throw new Error("Complete daily checkpoint must contain exactly its six release artifacts");
  }
  return { revision, slug, savedAt: manifest.savedAt };
}

function assertPublishingWindow(date, value) {
  if (shanghaiDate(value) !== date) throw new Error("The requested Shanghai publishing day is no longer active");
  const cutoffMatch = String(unattendedPolicy.publishCutoffLocalTime || "").match(/^(\d{2}):(\d{2})$/);
  if (!cutoffMatch) throw new Error("Unattended publishing cutoff is invalid");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const currentMinute = Number(byType.hour) * 60 + Number(byType.minute);
  const cutoffMinute = Number(cutoffMatch[1]) * 60 + Number(cutoffMatch[2]);
  if (currentMinute >= cutoffMinute) {
    throw new Error(`The ${date} publishing window closed at ${unattendedPolicy.publishCutoffLocalTime} Asia/Shanghai`);
  }
}

function assertReleaseSettlementWindow(date, value, releaseInFlight) {
  const currentDate = shanghaiDate(value);
  const startedAt = Date.parse(releaseInFlight?.startedAt || "");
  const ageMs = value.getTime() - startedAt;
  if (!Number.isFinite(startedAt) || shanghaiDate(startedAt) !== date || ageMs < 0 || currentDate < date) {
    throw new Error(`Release settlement marker for ${date} is invalid or predates its release`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, value);
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        renameSync(temporaryPath, path);
        break;
      } catch (error) {
        if (!ATOMIC_REPLACE_RETRY_CODES.has(error?.code) || attempt >= 24) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(20 + attempt * 5, 100));
      }
    }
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function writeJsonAtomic(path, value) {
  writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function coordinationDirectory(root, date) {
  assertDate(date);
  return resolve(root, "codex-daily-seo", date);
}

function leasePath(root, date) {
  return resolve(coordinationDirectory(root, date), "lease.json");
}

function leaseStatesDirectory(root, date) {
  return resolve(coordinationDirectory(root, date), "lease-states");
}

function operationLockPath(root, date) {
  return resolve(coordinationDirectory(root, date), "operation.lock");
}

function operationTakeoverPath(root, date) {
  return resolve(coordinationDirectory(root, date), "operation.takeover.lock");
}

function assertOwner(owner) {
  if (!OWNER_PATTERN.test(String(owner || ""))) throw new Error("Coordination owner is invalid");
}

function assertReleaseProof(date, revision, slug, proof) {
  const expectedPaths = [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `data/pages/${slug}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ];
  const artifactEntries = Object.entries(proof?.artifactBlobs || {});
  if (proof?.schemaVersion !== 1 || proof.revision !== revision || proof.slug !== slug ||
    !SHA_PATTERN.test(String(proof.observedOriginMainTip || "")) ||
    !SHA_PATTERN.test(String(proof.baseRevision || "")) ||
    !SHA_PATTERN.test(String(proof.authorizedReleaseRevision || "")) ||
    !SHA_PATTERN.test(String(proof.basePageTreeOid || "")) || !Array.isArray(proof.pageChanges) ||
    proof.pageChanges.length !== 1 || proof.pageChanges[0] !== `data/pages/${slug}.json` ||
    !Array.isArray(proof.changedPaths) || proof.changedPaths.length !== expectedPaths.length ||
    new Set(proof.changedPaths).size !== expectedPaths.length ||
    expectedPaths.some((path) => !proof.changedPaths.includes(path)) ||
    !SHA_PATTERN.test(String(proof.pageTreeOid || "")) || proof.singleDailyPageVerified !== true ||
    !Number.isFinite(Date.parse(proof.verifiedAt || "")) || artifactEntries.length !== expectedPaths.length ||
    expectedPaths.some((path) => !SHA_PATTERN.test(String(proof.artifactBlobs?.[path] || "")))) {
    throw new Error("Release marker requires exact Git proof for every daily artifact and the page corpus");
  }
}

function normalizedPath(value) {
  const path = resolve(value);
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function pathIsInside(root, target) {
  const normalizedRoot = normalizedPath(root);
  const normalizedTarget = normalizedPath(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`);
}

function assertSafePath(root, target) {
  const absoluteRoot = resolve(root);
  const absoluteTarget = resolve(target);
  if (!pathIsInside(absoluteRoot, absoluteTarget)) {
    throw new Error(`Coordination path escaped its trusted root: ${absoluteTarget}`);
  }
  if (!existsSync(absoluteRoot)) throw new Error(`Trusted root is missing: ${absoluteRoot}`);
  const rootStat = lstatSync(absoluteRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Trusted root must be a real directory: ${absoluteRoot}`);
  }
  const realRoot = realpathSync.native(absoluteRoot);
  let cursor = absoluteRoot;
  const relativePath = relative(absoluteRoot, absoluteTarget);
  for (const segment of relativePath ? relativePath.split(/[\\/]+/) : []) {
    cursor = resolve(cursor, segment);
    if (!existsSync(cursor)) break;
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`Coordination path contains a reparse point: ${cursor}`);
    const realCursor = realpathSync.native(cursor);
    if (!pathIsInside(realRoot, realCursor)) {
      throw new Error(`Coordination path resolves outside its trusted root: ${cursor}`);
    }
  }
  return absoluteTarget;
}

function readLease(root, date) {
  const statesDirectory = leaseStatesDirectory(root, date);
  if (existsSync(statesDirectory)) {
    assertSafePath(coordinationDirectory(root, date), statesDirectory);
    const states = readdirSync(statesDirectory)
      .filter((name) => /^\d{12}-[a-f0-9-]{36}\.json$/.test(name))
      .map((name) => {
        const path = resolve(statesDirectory, name);
        const state = readJson(path);
        const sequence = Number(name.slice(0, 12));
        if (!Number.isSafeInteger(sequence) || sequence < 1 || state.stateSequence !== sequence ||
          typeof state.stateId !== "string" || !name.endsWith(`${state.stateId}.json`)) {
          throw new Error(`Daily lease state is invalid: ${name}`);
        }
        return state;
      });
    if (states.length) {
      const maximum = Math.max(...states.map((state) => state.stateSequence));
      const latest = states.filter((state) => state.stateSequence === maximum);
      if (latest.length !== 1) throw new Error(`Daily lease has conflicting state sequence ${maximum}`);
      return latest[0];
    }
  }

  const path = leasePath(root, date);
  if (!existsSync(path)) return null;
  try {
    return readJson(path);
  } catch {
    return {
      schemaVersion: 1,
      status: "corrupt",
      owner: null,
      heartbeatAt: lstatSync(path).mtime.toISOString(),
    };
  }
}

function appendLeaseState(root, date, value, expected = null) {
  const current = readLease(root, date);
  if (expected && (!current || current.leaseId !== expected.leaseId ||
    current.generation !== expected.generation || current.stateSequence !== expected.stateSequence)) {
    throw new Error("Daily publishing lease changed before its next immutable state was appended");
  }
  const stateSequence = Number(current?.stateSequence || 0) + 1;
  if (!Number.isSafeInteger(stateSequence) || stateSequence < 1 || stateSequence > 999_999_999_999) {
    throw new Error("Daily lease state sequence is exhausted");
  }
  const state = {
    ...value,
    stateSequence,
    stateId: randomUUID(),
  };
  const path = resolve(
    leaseStatesDirectory(root, date),
    `${String(stateSequence).padStart(12, "0")}-${state.stateId}.json`,
  );
  createLeaseExclusive(path, state);
  return state;
}

export function inspectDailyCarryover({
  coordinationRoot,
  date,
  owner = null,
  now = new Date(),
  staleAfterMinutes = unattendedPolicy.leaseStaleAfterMinutes,
}) {
  assertDate(date);
  if (owner !== null) assertOwner(owner);
  if (shanghaiDate(now) !== date) throw new Error("Carryover inspection date must be the current Shanghai day");
  const dailyRoot = resolve(coordinationRoot, "codex-daily-seo");
  if (!existsSync(dailyRoot)) return { state: "none", releaseDate: null, lease: null };
  assertSafePath(coordinationRoot, dailyRoot);
  const dailyRootStat = lstatSync(dailyRoot);
  if (!dailyRootStat.isDirectory() || dailyRootStat.isSymbolicLink()) {
    throw new Error("Daily coordination calendar must be a real directory");
  }

  const releases = [];
  const occupied = [];
  const noPublishOutcomes = [];
  for (const candidateDate of readdirSync(dailyRoot).filter((name) => DATE_PATTERN.test(name) && name <= date).sort()) {
    const candidateRoot = coordinationDirectory(coordinationRoot, candidateDate);
    assertSafePath(dailyRoot, candidateRoot);
    const candidateStat = lstatSync(candidateRoot);
    if (!candidateStat.isDirectory() || candidateStat.isSymbolicLink()) {
      throw new Error(`Daily coordination date must be a real directory: ${candidateDate}`);
    }
    const lease = readLease(coordinationRoot, candidateDate);
    if (!lease) continue;
    if (lease.status === "completed_no_publish") {
      if (!isDailyNoPublishReceipt(lease.noPublishReceipt, candidateDate)) {
        throw new Error(`Daily coordination found an invalid no-publish receipt for ${candidateDate}`);
      }
      if (candidateDate === date) {
        noPublishOutcomes.push({ releaseDate: candidateDate, lease, productionDate: null });
      }
    }
    const productionDate = lease.liveVerification?.productionDate || (
      Number.isFinite(Date.parse(lease.liveVerification?.verifiedAt || ""))
        ? shanghaiDate(lease.liveVerification.verifiedAt)
        : null
    );
    if (lease.status === "completed" && productionDate === date) {
      occupied.push({ releaseDate: candidateDate, lease, productionDate });
    }
    const persistedRelease = lease.releaseInFlight || lease.releasePreparing;
    const orphanPinnedRevision = lease.status === "active" && !persistedRelease
      ? pinnedDailyReleaseRevision(coordinationRoot, candidateDate)
      : null;
    const checkpointReady = lease.status === "active" && !persistedRelease && !orphanPinnedRevision
      ? readyReleaseCheckpoint(coordinationRoot, candidateDate, lease)
      : null;
    if (lease.status === "active" && (persistedRelease || orphanPinnedRevision || checkpointReady)) {
      assertReleaseSettlementWindow(
        candidateDate,
        now,
        persistedRelease || { startedAt: lease.acquiredAt },
      );
      releases.push({
        releaseDate: candidateDate,
        lease,
        releaseState: lease.releaseInFlight
          ? "in_flight"
          : lease.releasePreparing ? "preparing" : orphanPinnedRevision ? "orphan_pin" : "checkpoint_ready",
        ...(orphanPinnedRevision ? { pinnedRevision: orphanPinnedRevision } : {}),
        ...(checkpointReady ? { checkpoint: checkpointReady } : {}),
      });
    }
  }
  if (releases.length > 1 || occupied.length > 1 || noPublishOutcomes.length > 1 ||
    (releases.length && occupied.length) || (noPublishOutcomes.length && (releases.length || occupied.length))) {
    throw new Error("Daily coordination found conflicting unresolved or production-day releases");
  }
  if (noPublishOutcomes.length === 1) return { state: "no_publish", ...noPublishOutcomes[0] };
  if (occupied.length === 1) return { state: "occupied", ...occupied[0] };
  if (releases.length === 1) {
    const release = releases[0];
    const heartbeatMs = Date.parse(release.lease.heartbeatAt || "");
    const ageMs = now.getTime() - heartbeatMs;
    const state = release.lease.owner === owner || !Number.isFinite(heartbeatMs) ||
      ageMs > staleAfterMinutes * 60_000
      ? "recoverable"
      : "busy";
    return { state, ...release, productionDate: null };
  }
  return { state: "none", releaseDate: null, lease: null };
}

function createLeaseExclusive(path, lease) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.ready`;
  writeFileSync(temporaryPath, `${JSON.stringify(lease, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    linkSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function readLock(path) {
  if (!existsSync(path)) return null;
  try {
    return readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    let modifiedAt;
    try {
      modifiedAt = lstatSync(path).mtime.toISOString();
    } catch (statError) {
      if (statError?.code === "ENOENT") return null;
      throw statError;
    }
    return {
      acquiredAt: modifiedAt,
      token: "corrupt",
      processId: null,
      hostname: null,
    };
  }
}

function processIsAlive(lock) {
  if (lock?.hostname !== hostname() || !Number.isInteger(lock?.processId) || lock.processId <= 0) return false;
  try {
    process.kill(lock.processId, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function acquireOperationLock({ coordinationRoot, date, owner, now }) {
  const path = operationLockPath(coordinationRoot, date);
  const token = randomUUID();
  const timestamp = now.toISOString();
  const lock = {
    schemaVersion: 1,
    owner,
    token,
    processId: process.pid,
    hostname: hostname(),
    acquiredAt: timestamp,
  };
  mkdirSync(dirname(path), { recursive: true });
  try {
    createLeaseExclusive(path, lock);
    return { path, token };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  const takeoverPath = operationTakeoverPath(coordinationRoot, date);
  const takeoverToken = randomUUID();
  try {
    createLeaseExclusive(takeoverPath, {
      schemaVersion: 1,
      owner,
      token: takeoverToken,
      processId: process.pid,
      hostname: hostname(),
      acquiredAt: timestamp,
    });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const observed = readLock(takeoverPath);
    const ageMs = now.getTime() - Date.parse(observed?.acquiredAt);
    if (!observed || processIsAlive(observed) || !Number.isFinite(ageMs) || ageMs <= OPERATION_LOCK_STALE_MS) {
      throw coordinationBusy();
    }
    const staleClaimPath = `${takeoverPath}.stale-${timestamp.replaceAll(":", "-")}-${randomUUID()}`;
    try {
      renameSync(takeoverPath, staleClaimPath);
    } catch (renameError) {
      if (renameError?.code === "ENOENT") throw coordinationBusy();
      throw renameError;
    }
    const moved = readLock(staleClaimPath);
    if (!moved || moved.token !== observed.token) {
      if (!existsSync(takeoverPath) && existsSync(staleClaimPath)) {
        try {
          renameSync(staleClaimPath, takeoverPath);
        } catch {
          // A live claimant won the path while this stale observation was being checked.
        }
      }
      throw coordinationBusy();
    }
    try {
      createLeaseExclusive(takeoverPath, {
        schemaVersion: 1,
        owner,
        token: takeoverToken,
        processId: process.pid,
        hostname: hostname(),
        acquiredAt: timestamp,
      });
    } catch (claimError) {
      if (claimError?.code === "EEXIST") throw coordinationBusy();
      throw claimError;
    }
  }

  try {
    const assertTakeover = () => {
      const claim = readLock(takeoverPath);
      if (!claim || claim.token !== takeoverToken) throw coordinationBusy("Daily coordination takeover claim was superseded");
    };
    const current = readLock(path);
    if (!current) {
      assertTakeover();
      try {
        createLeaseExclusive(path, lock);
        return { path, token };
      } catch (error) {
        if (error?.code === "EEXIST") throw coordinationBusy();
        throw error;
      }
    }
    const ageMs = now.getTime() - Date.parse(current.acquiredAt);
    if (processIsAlive(current) || !Number.isFinite(ageMs) || ageMs <= OPERATION_LOCK_STALE_MS) {
      throw coordinationBusy();
    }
    assertTakeover();
    const archivePath = `${path}.stale-${timestamp.replaceAll(":", "-")}-${current.token || "unknown"}`;
    renameSync(path, archivePath);
    const archived = readLock(archivePath);
    if (!archived || archived.token !== current.token) {
      throw new Error("Daily coordination stale-lock claim changed during takeover");
    }
    assertTakeover();
    try {
      createLeaseExclusive(path, lock);
      return { path, token };
    } catch (error) {
      if (error?.code === "EEXIST") throw coordinationBusy();
      throw error;
    }
  } finally {
    const takeover = readLock(takeoverPath);
    if (takeover?.token === takeoverToken) unlinkSync(takeoverPath);
  }
}

function withCoordinationLock({ coordinationRoot, date, owner, now = new Date() }, action) {
  const { path, token } = acquireOperationLock({ coordinationRoot, date, owner, now });
  const assertLock = () => {
    const current = readLock(path);
    if (!current || current.token !== token) throw new Error("Daily coordination fencing token is no longer active");
  };
  try {
    return action(assertLock);
  } finally {
    const current = readLock(path);
    if (current?.token === token) unlinkSync(path);
  }
}

export function coordinationOwner(worktreeRoot, runId) {
  if (typeof runId !== "string" || runId.trim().length < 4) {
    throw new Error("Daily coordination requires a stable per-run identifier");
  }
  return sha256(`${resolve(worktreeRoot)}\0${runId.trim()}`).slice(0, 16);
}

export function acquireDailyLease({
  coordinationRoot,
  date,
  owner,
  now = new Date(),
  staleAfterMinutes = 60,
}) {
  assertDate(date);
  assertOwner(owner);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(staleAfterMinutes) || staleAfterMinutes < 15) {
    throw new Error("Lease timing configuration is invalid");
  }
  const carryover = inspectDailyCarryover({ coordinationRoot, date, owner, now, staleAfterMinutes });
  if (carryover.state === "no_publish") {
    return { outcome: "no_publish", lease: carryover.lease, carryover };
  }
  if (carryover.state === "occupied") {
    return { outcome: "completed", lease: carryover.lease, carryover };
  }
  if (["busy", "recoverable"].includes(carryover.state)) {
    return { outcome: "busy", lease: carryover.lease, carryover };
  }
  assertPublishingWindow(date, now);
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const timestamp = now.toISOString();
    const current = readLease(coordinationRoot, date);
    if (current?.status === "completed_no_publish") {
      if (!isDailyNoPublishReceipt(current.noPublishReceipt, date)) {
        throw new Error("The persisted no-publish receipt is invalid");
      }
      return { outcome: "no_publish", lease: current };
    }
    if (current?.status === "completed") return { outcome: "completed", lease: current };
    if (current?.owner === owner) {
      const lease = {
        ...current,
        leaseId: typeof current.leaseId === "string" ? current.leaseId : randomUUID(),
        generation: Number.isInteger(current.generation) ? current.generation : 1,
        heartbeatAt: timestamp,
      };
      assertLock();
      const appended = appendLeaseState(coordinationRoot, date, lease, current);
      return { outcome: "acquired", lease: appended };
    }
    if (current) {
      const heartbeatMs = Date.parse(current.heartbeatAt);
      const ageMs = now.getTime() - heartbeatMs;
      if (Number.isFinite(heartbeatMs) && ageMs <= staleAfterMinutes * 60_000) {
        return { outcome: "busy", lease: current };
      }
    }
    const lease = {
      schemaVersion: 1,
      date,
      status: "active",
      owner,
      leaseId: randomUUID(),
      generation: Number(current?.generation || 0) + 1,
      acquiredAt: timestamp,
      heartbeatAt: timestamp,
      ...(typeof current?.checkpointRevision === "string"
        ? { checkpointRevision: current.checkpointRevision }
        : {}),
    };
    assertLock();
    const appended = appendLeaseState(coordinationRoot, date, lease, current);
    return { outcome: "acquired", lease: appended };
  });
}

export function assertDailyLease({ coordinationRoot, date, owner }) {
  assertDate(date);
  assertOwner(owner);
  const lease = readLease(coordinationRoot, date);
  if (!lease || lease.status !== "active" || lease.owner !== owner ||
    typeof lease.leaseId !== "string" || !Number.isInteger(lease.generation)) {
    throw new Error("This worktree does not own the active daily publishing lease");
  }
  return lease;
}

export function heartbeatDailyLease({ coordinationRoot, date, owner, now = new Date() }) {
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    if (lease.releaseInFlight || lease.releasePreparing) {
      assertReleaseSettlementWindow(date, now, lease.releaseInFlight || lease.releasePreparing);
    }
    else assertPublishingWindow(date, now);
    const current = readLease(coordinationRoot, date);
    if (current.leaseId !== lease.leaseId || current.generation !== lease.generation) {
      throw new Error("Daily publishing lease generation changed before heartbeat");
    }
    const updated = { ...lease, heartbeatAt: now.toISOString() };
    assertLock();
    return appendLeaseState(coordinationRoot, date, updated, current);
  });
}

export function prepareDailyRelease({
  coordinationRoot,
  worktreeRoot,
  date,
  owner,
  revision,
  slug,
  releaseProof,
  recoveryPinnedRevision = null,
  now = new Date(),
}) {
  if (!SHA_PATTERN.test(String(revision || "")) || !SLUG_PATTERN.test(String(slug || ""))) {
    throw new Error("Release preparation requires a full Git SHA and safe published slug");
  }
  if (recoveryPinnedRevision !== null && recoveryPinnedRevision !== revision) {
    throw new Error("Release preparation recovery must match its pinned revision");
  }
  assertReleaseProof(date, revision, slug, releaseProof);
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    if (recoveryPinnedRevision === null) {
      assertPublishingWindow(date, now);
    } else {
      if (pinnedDailyReleaseRevision(coordinationRoot, date) !== recoveryPinnedRevision) {
        throw new Error("Release preparation recovery lost its pinned Git revision");
      }
      assertReleaseSettlementWindow(date, now, { startedAt: lease.acquiredAt });
    }
    const existing = lease.releaseInFlight || lease.releasePreparing;
    if (existing && (existing.revision !== revision || existing.slug !== slug)) {
      throw new Error("A different daily release is already prepared or in flight");
    }
    const state = readDailyRunState({ root: worktreeRoot, date });
    if (state.state !== "local_publication_complete" || state.publishedSlug !== slug) {
      throw new Error("Release preparation requires the complete local daily chain for the same slug");
    }
    if (existing) {
      assertReleaseProof(date, revision, slug, existing.releaseProof);
      if (existing.releaseProof.pageTreeOid !== releaseProof.pageTreeOid ||
        JSON.stringify(existing.releaseProof.artifactBlobs) !== JSON.stringify(releaseProof.artifactBlobs)) {
        throw new Error("The persisted daily release proof differs from the requested preparation proof");
      }
    }
    const prepared = {
      ...lease,
      heartbeatAt: now.toISOString(),
      ...(!lease.releaseInFlight ? {
        releasePreparing: lease.releasePreparing || {
          revision,
          slug,
          startedAt: recoveryPinnedRevision === null ? now.toISOString() : lease.acquiredAt,
          releaseProof: { ...releaseProof },
        },
      } : {}),
    };
    assertLock();
    return appendLeaseState(coordinationRoot, date, prepared, lease);
  });
}

export function startDailyRelease({
  coordinationRoot,
  worktreeRoot,
  date,
  owner,
  revision,
  slug,
  releaseProof,
  now = new Date(),
}) {
  if (!SHA_PATTERN.test(String(revision || "")) || !SLUG_PATTERN.test(String(slug || ""))) {
    throw new Error("Release start requires a full Git SHA and safe published slug");
  }
  assertReleaseProof(date, revision, slug, releaseProof);
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    const preparation = lease.releasePreparing;
    if (!preparation && !lease.releaseInFlight) {
      throw new Error("Release start requires a durable release preparation");
    }
    if (preparation) assertReleaseSettlementWindow(date, now, preparation);
    else if (lease.releaseInFlight) assertReleaseSettlementWindow(date, now, lease.releaseInFlight);
    else assertPublishingWindow(date, now);
    const state = readDailyRunState({ root: worktreeRoot, date });
    if (state.state !== "local_publication_complete" || state.publishedSlug !== slug) {
      throw new Error("Release start requires the complete local daily chain for the same slug");
    }
    if (lease.releaseInFlight && (
      lease.releaseInFlight.revision !== revision || lease.releaseInFlight.slug !== slug
    )) {
      throw new Error("A different daily release is already in flight");
    }
    if (preparation && (preparation.revision !== revision || preparation.slug !== slug)) {
      throw new Error("Release start does not match the persisted release preparation");
    }
    const persistedRelease = lease.releaseInFlight || preparation;
    if (persistedRelease) {
      assertReleaseProof(date, revision, slug, persistedRelease.releaseProof);
      if (persistedRelease.releaseProof.pageTreeOid !== releaseProof.pageTreeOid ||
        JSON.stringify(persistedRelease.releaseProof.artifactBlobs) !==
          JSON.stringify(releaseProof.artifactBlobs)) {
        throw new Error("The persisted daily release proof differs from the requested marker proof");
      }
    }
    const { releasePreparing, ...settledPreparation } = lease;
    const started = {
      ...settledPreparation,
      heartbeatAt: now.toISOString(),
      releaseInFlight: lease.releaseInFlight || preparation,
    };
    assertLock();
    return appendLeaseState(coordinationRoot, date, started, lease);
  });
}

export function supersedeDailyRelease({
  coordinationRoot,
  date,
  owner,
  currentRevision,
  nextRevision,
  slug,
  proof,
  now = new Date(),
}) {
  if (!SHA_PATTERN.test(String(currentRevision || "")) || !SHA_PATTERN.test(String(nextRevision || "")) ||
    currentRevision === nextRevision || !SLUG_PATTERN.test(String(slug || ""))) {
    throw new Error("Release supersession requires two distinct full Git SHAs and a safe slug");
  }
  if (proof?.originMainTip !== nextRevision || proof.descendantVerified !== true ||
    proof.dailyArtifactsEquivalent !== true || proof.singleDailyPageVerified !== true ||
    !Number.isFinite(Date.parse(proof.verifiedAt || ""))) {
    throw new Error("Release supersession requires descendant, artifact, page-count, and origin/main proof");
  }
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    if (lease.releaseInFlight?.revision !== currentRevision || lease.releaseInFlight?.slug !== slug) {
      throw new Error("Release supersession does not match the active release-in-flight marker");
    }
    assertReleaseProof(date, currentRevision, slug, lease.releaseInFlight.releaseProof);
    assertReleaseProof(date, nextRevision, slug, proof.releaseProof);
    if (lease.releaseInFlight.releaseProof.pageTreeOid !== proof.releaseProof.pageTreeOid ||
      lease.releaseInFlight.releaseProof.baseRevision !== proof.releaseProof.baseRevision ||
      lease.releaseInFlight.releaseProof.authorizedReleaseRevision !==
        proof.releaseProof.authorizedReleaseRevision ||
      lease.releaseInFlight.releaseProof.basePageTreeOid !== proof.releaseProof.basePageTreeOid ||
      JSON.stringify(lease.releaseInFlight.releaseProof.pageChanges) !==
        JSON.stringify(proof.releaseProof.pageChanges) ||
      JSON.stringify(lease.releaseInFlight.releaseProof.changedPaths) !==
        JSON.stringify(proof.releaseProof.changedPaths) ||
      JSON.stringify(lease.releaseInFlight.releaseProof.artifactBlobs) !==
        JSON.stringify(proof.releaseProof.artifactBlobs)) {
      throw new Error("Release supersession proof changes the daily artifacts or page corpus");
    }
    assertReleaseSettlementWindow(date, now, lease.releaseInFlight);
    const superseded = {
      ...lease,
      heartbeatAt: now.toISOString(),
      releaseInFlight: {
        ...lease.releaseInFlight,
        revision: nextRevision,
        releaseProof: { ...proof.releaseProof },
        supersededAt: now.toISOString(),
        supersededFrom: [
          ...(Array.isArray(lease.releaseInFlight.supersededFrom)
            ? lease.releaseInFlight.supersededFrom
            : []),
          {
            revision: currentRevision,
            supersededAt: now.toISOString(),
            proof: { ...proof },
          },
        ],
      },
    };
    assertLock();
    return appendLeaseState(coordinationRoot, date, superseded, lease);
  });
}

export function rebaseDailyRelease({
  coordinationRoot,
  date,
  owner,
  currentRevision,
  nextRevision,
  slug,
  proof,
  now = new Date(),
}) {
  if (!SHA_PATTERN.test(String(currentRevision || "")) || !SHA_PATTERN.test(String(nextRevision || "")) ||
    currentRevision === nextRevision || !SLUG_PATTERN.test(String(slug || ""))) {
    throw new Error("Release rebase requires two distinct full Git SHAs and a safe slug");
  }
  if (proof?.previousRevision !== currentRevision ||
    proof?.originBaseRevision !== proof?.releaseProof?.baseRevision ||
    proof?.advancedFromBaseRevision === proof?.releaseProof?.baseRevision ||
    proof?.baseAdvanceVerified !== true || proof?.dailyArtifactsEquivalent !== true ||
    proof?.pageCorpusEquivalent !== true || proof?.singleDailyPageVerified !== true ||
    !Number.isFinite(Date.parse(proof?.verifiedAt || ""))) {
    throw new Error("Release rebase requires safe base-advance, artifact, and page-corpus proof");
  }
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    if (lease.releaseInFlight?.revision !== currentRevision || lease.releaseInFlight?.slug !== slug) {
      throw new Error("Release rebase does not match the active release-in-flight marker");
    }
    const currentProof = lease.releaseInFlight.releaseProof;
    assertReleaseProof(date, currentRevision, slug, currentProof);
    assertReleaseProof(date, nextRevision, slug, proof.releaseProof);
    if (proof.advancedFromBaseRevision !== currentProof.baseRevision ||
      currentProof.basePageTreeOid !== proof.releaseProof.basePageTreeOid ||
      currentProof.pageTreeOid !== proof.releaseProof.pageTreeOid ||
      JSON.stringify(currentProof.pageChanges) !== JSON.stringify(proof.releaseProof.pageChanges) ||
      JSON.stringify(currentProof.changedPaths) !== JSON.stringify(proof.releaseProof.changedPaths) ||
      JSON.stringify(currentProof.artifactBlobs) !== JSON.stringify(proof.releaseProof.artifactBlobs)) {
      throw new Error("Release rebase proof changes the daily artifacts or page corpus");
    }
    assertReleaseSettlementWindow(date, now, lease.releaseInFlight);
    const rebased = {
      ...lease,
      heartbeatAt: now.toISOString(),
      releaseInFlight: {
        ...lease.releaseInFlight,
        revision: nextRevision,
        releaseProof: { ...proof.releaseProof },
        rebasedAt: now.toISOString(),
        rebasedFrom: [
          ...(Array.isArray(lease.releaseInFlight.rebasedFrom)
            ? lease.releaseInFlight.rebasedFrom
            : []),
          {
            revision: currentRevision,
            rebasedAt: now.toISOString(),
            proof: { ...proof },
          },
        ],
      },
    };
    assertLock();
    return appendLeaseState(coordinationRoot, date, rebased, lease);
  });
}

export function acquireDailyReleaseRecoveryLease({
  coordinationRoot,
  date,
  owner,
  now = new Date(),
  staleAfterMinutes = unattendedPolicy.leaseStaleAfterMinutes,
}) {
  assertDate(date);
  assertOwner(owner);
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const current = readLease(coordinationRoot, date);
    const persistedRelease = current?.releaseInFlight || current?.releasePreparing;
    const orphanPinnedRevision = current?.status === "active" && !persistedRelease
      ? pinnedDailyReleaseRevision(coordinationRoot, date)
      : null;
    const checkpointReady = current?.status === "active" && !persistedRelease && !orphanPinnedRevision
      ? readyReleaseCheckpoint(coordinationRoot, date, current)
      : null;
    if (!current || current.status !== "active" ||
      (!persistedRelease && !orphanPinnedRevision && !checkpointReady)) {
      throw new Error(
        "No active release checkpoint, preparation, marker, or pinned release is available for carryover recovery",
      );
    }
    assertReleaseSettlementWindow(date, now, persistedRelease || { startedAt: current.acquiredAt });
    const heartbeatMs = Date.parse(current.heartbeatAt || "");
    const ageMs = now.getTime() - heartbeatMs;
    if (current.owner !== owner && Number.isFinite(heartbeatMs) && ageMs <= staleAfterMinutes * 60_000) {
      return { outcome: "busy", lease: current };
    }
    const recovered = {
      ...current,
      status: "active",
      owner,
      leaseId: current.owner === owner ? current.leaseId : randomUUID(),
      generation: current.owner === owner ? current.generation : Number(current.generation || 0) + 1,
      acquiredAt: current.acquiredAt,
      ...(current.owner === owner ? {} : { recoveredAt: now.toISOString() }),
      heartbeatAt: now.toISOString(),
    };
    assertLock();
    return {
      outcome: "acquired",
      lease: appendLeaseState(coordinationRoot, date, recovered, current),
    };
  });
}

export function withDailyPublicationGuard({
  coordinationRoot,
  date,
  owner,
  slug,
  reportId,
  now = new Date(),
}, action) {
  assertDate(date);
  assertOwner(owner);
  if (!SLUG_PATTERN.test(String(slug || "")) || typeof reportId !== "string" || !reportId.trim()) {
    throw new Error("Daily publication guard requires a safe slug and report ID");
  }
  if (typeof action !== "function") throw new Error("Daily publication guard requires a synchronous action");
  assertPublishingWindow(date, now);
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    const guardedLease = {
      ...lease,
      heartbeatAt: now.toISOString(),
      publicationReservation: {
        slug,
        reportId,
        reservedAt: now.toISOString(),
        processId: process.pid,
        hostname: hostname(),
      },
    };
    assertLock();
    const reservedLease = appendLeaseState(coordinationRoot, date, guardedLease, lease);
    const assertGuard = (value = new Date()) => {
      assertPublishingWindow(date, value);
      assertLock();
      const current = assertDailyLease({ coordinationRoot, date, owner });
      if (current.leaseId !== reservedLease.leaseId || current.generation !== reservedLease.generation ||
        current.publicationReservation?.slug !== slug || current.publicationReservation?.reportId !== reportId) {
        throw new Error("Daily publication reservation is no longer active");
      }
    };
    try {
      return action(assertGuard);
    } finally {
      assertLock();
      const current = assertDailyLease({ coordinationRoot, date, owner });
      if (current.leaseId === reservedLease.leaseId && current.generation === reservedLease.generation &&
        current.publicationReservation?.slug === slug && current.publicationReservation?.reportId === reportId) {
        const { publicationReservation, ...released } = current;
        appendLeaseState(coordinationRoot, date, released, current);
      }
    }
  });
}

function dailyArtifactPaths(worktreeRoot, date) {
  const relativePaths = [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
    `output/pdf/seo-daily-${date}.pdf`,
  ];
  for (const bindingPath of [`data/reports/${date}.json`, `data/reviews/${date}.json`]) {
    const absolutePath = resolve(worktreeRoot, bindingPath);
    if (!existsSync(absolutePath)) continue;
    assertSafePath(worktreeRoot, absolutePath);
    const binding = readJson(absolutePath);
    const slug = bindingPath.includes("reports")
      ? binding?.publication?.slug ?? binding?.draft?.slug
      : binding?.slug;
    const normalizedSlug = typeof slug === "string" ? slug.replace(/^\//, "") : "";
    if (SLUG_PATTERN.test(normalizedSlug)) relativePaths.push(`data/pages/${normalizedSlug}.json`);
  }
  return [...new Set(relativePaths)];
}

function checkedFile(path, trustedRoot = dirname(path)) {
  assertSafePath(trustedRoot, path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Checkpoint source must be a regular file: ${path}`);
  return readFileSync(path);
}

function noPublishEvidence(worktreeRoot, date, dailyState) {
  const candidatePaths = [
    `data/growth/${date}.json`,
    `data/research/${date}.json`,
    `data/reports/${date}.json`,
    `data/reviews/${date}.json`,
  ];
  const documents = new Map();
  const artifactDigests = [];
  for (const relativePath of candidatePaths) {
    const absolutePath = resolve(worktreeRoot, relativePath);
    if (!existsSync(absolutePath)) continue;
    const content = checkedFile(absolutePath, worktreeRoot);
    let document;
    try {
      document = JSON.parse(content.toString("utf8"));
    } catch (error) {
      throw new Error(`No-publish evidence is not valid JSON: ${relativePath}`, { cause: error });
    }
    if (relativePath.includes("/growth/") &&
      (!Number.isFinite(Date.parse(document?.generatedAt || "")) || shanghaiDate(document.generatedAt) !== date)) {
      throw new Error("No-publish growth evidence must be generated on the same Shanghai day");
    }
    if ((relativePath.includes("/research/") || relativePath.includes("/reports/")) && document?.date !== date) {
      throw new Error(`No-publish evidence date does not match: ${relativePath}`);
    }
    if (relativePath.includes("/reviews/") &&
      (!Number.isFinite(Date.parse(document?.reviewedAt || "")) || shanghaiDate(document.reviewedAt) !== date)) {
      throw new Error("No-publish review evidence must belong to the same Shanghai day");
    }
    documents.set(relativePath, document);
    artifactDigests.push({ path: relativePath, sha256: sha256(content), bytes: content.byteLength });
  }

  const growthPath = `data/growth/${date}.json`;
  const growth = documents.get(growthPath);
  if (!growth) throw new Error("No-publish completion requires the same-day growth snapshot");
  const growthSummary = growth.summary;
  for (const field of ["publishedPages", "collectedPages", "unavailablePages"]) {
    if (!Number.isSafeInteger(growthSummary?.[field]) || growthSummary[field] < 0) {
      throw new Error(`No-publish growth evidence has an invalid ${field}`);
    }
  }
  if (typeof growthSummary.attributionJoinReady !== "boolean") {
    throw new Error("No-publish growth evidence needs attributionJoinReady");
  }
  if (!Array.isArray(growth.entries) || growth.entries.length !== growthSummary.publishedPages) {
    throw new Error("No-publish growth evidence must cover every published page");
  }
  const collectedPages = growth.entries.filter((entry) => entry?.state === "collected").length;
  const unavailablePages = growth.entries.filter((entry) => entry?.state === "unavailable").length;
  if (collectedPages !== growthSummary.collectedPages || unavailablePages !== growthSummary.unavailablePages ||
    collectedPages + unavailablePages !== growth.entries.length) {
    throw new Error("No-publish growth evidence summary is inconsistent with its page entries");
  }

  const research = documents.get(`data/research/${date}.json`);
  const report = documents.get(`data/reports/${date}.json`);
  const review = documents.get(`data/reviews/${date}.json`);
  const trendSignals = Array.isArray(report?.trendSignals)
    ? report.trendSignals
    : Array.isArray(research?.trendSignals) ? research.trendSignals : [];
  const trendCollection = report?.trendCollection ?? research?.trendCollection;
  const requireBigQuery = date >=
    seoPolicy.googleTrends.automatedCollectionEnforcedFromReportDate;
  const requireVerifiedAttestation = requireBigQuery &&
    trendCollection?.state === "observed";
  const attestationVerificationKey = String(
    process.env.GOOGLE_TRENDS_BIGQUERY_PRIVATE_KEY || "",
  ).replace(/\\n/g, "\n").trim();
  const expectedAttestationClientEmail = String(
    process.env.GOOGLE_TRENDS_BIGQUERY_CLIENT_EMAIL || "",
  ).trim();
  const candidateKeywords = Array.isArray(report?.opportunities)
    ? report.opportunities.map((item) => item?.keyword)
    : Array.isArray(research?.candidates) ? research.candidates.map((item) => item?.keyword) : [];
  if ((trendSignals.length || trendCollection) && !candidateKeywords.length) {
    throw new Error("No-publish Google Trends evidence has no candidate bindings");
  }
  if (trendSignals.length || trendCollection) {
    validateGoogleTrendsEvidence({
      trendSignals,
      trendCollection,
      candidateKeywords,
      reportDate: date,
      attestationVerificationKey: requireVerifiedAttestation
        ? attestationVerificationKey
        : undefined,
      expectedAttestationClientEmail: requireVerifiedAttestation
        ? expectedAttestationClientEmail
        : undefined,
      requireVerifiedAttestation,
    });
  }
  const trendSummary = summarizeGoogleTrendsEvidence({
    trendSignals,
    trendCollection,
    reportDate: date,
    requireBigQuery,
    attestationVerificationKey,
    expectedAttestationClientEmail,
  });

  return {
    artifactDigests,
    evidenceSummary: {
      dailyState: dailyState.state,
      growth: {
        publishedPages: growthSummary.publishedPages,
        collectedPages: growthSummary.collectedPages,
        unavailablePages: growthSummary.unavailablePages,
        attributionJoinReady: growthSummary.attributionJoinReady,
      },
      trends: trendSummary,
      publicationStatus: typeof report?.publication?.status === "string"
        ? report.publication.status
        : "absent",
      reviewDecision: typeof review?.decision === "string" ? review.decision : "absent",
    },
  };
}

function assertNoPublishReasonEvidence(reasonCode, summary) {
  if (reasonCode === "growth_unavailable" && summary.growth.unavailablePages < 1) {
    throw new Error("growth_unavailable requires at least one unavailable portfolio page");
  }
  if (reasonCode === "attribution_blocked" && summary.growth.attributionJoinReady !== false) {
    throw new Error("attribution_blocked requires attributionJoinReady=false");
  }
  if (reasonCode === "trends_unavailable" &&
    (summary.trends.observed !== 0 || !["absent", "unavailable"].includes(summary.trends.providerState))) {
    throw new Error("trends_unavailable requires an absent or unavailable Google Trends provider");
  }
  if (reasonCode === "trends_not_observed" &&
    (summary.trends.providerState !== "observed" || summary.trends.notObserved < 1 ||
      summary.trends.qualifying !== 0)) {
    throw new Error("trends_not_observed requires a successful collection with exact candidate misses");
  }
  if (reasonCode === "trends_below_threshold" &&
    (summary.trends.observed < 1 || summary.trends.qualifying !== 0)) {
    throw new Error("trends_below_threshold requires observed but non-qualifying Google Trends signals");
  }
  if (reasonCode === "editorial_rejected" && summary.reviewDecision !== "rejected") {
    throw new Error("editorial_rejected requires a same-day rejected review artifact");
  }
}

function feedbackConsumptions(worktreeRoot, date) {
  const reportPath = resolve(worktreeRoot, `data/reports/${date}.json`);
  const inboxDirectory = resolve(worktreeRoot, "data/seo-feedback/inbox");
  if (!existsSync(reportPath) || !existsSync(inboxDirectory)) return [];
  assertSafePath(worktreeRoot, reportPath);
  assertSafePath(worktreeRoot, inboxDirectory);
  const report = readJson(reportPath);
  const decisions = new Map(
    (Array.isArray(report.feedbackDecisions) ? report.feedbackDecisions : [])
      .filter((decision) => typeof decision?.id === "string" && typeof decision?.message === "string")
      .map((decision) => [decision.id, decision.message]),
  );
  const consumptions = [];
  for (const name of readdirSync(inboxDirectory).filter((value) => value.endsWith(".json"))) {
    const path = resolve(inboxDirectory, name);
    assertSafePath(worktreeRoot, path);
    const document = readJson(path);
    for (const entry of Array.isArray(document.entries) ? document.entries : []) {
      if (!decisions.has(entry?.id) || decisions.get(entry.id) !== entry.message ||
        typeof entry.consumedAt !== "string" || !Number.isFinite(Date.parse(entry.consumedAt))) continue;
      consumptions.push({
        path: `data/seo-feedback/inbox/${name}`,
        id: entry.id,
        message: entry.message,
        consumedAt: entry.consumedAt,
      });
    }
  }
  return consumptions;
}

function planFeedbackConsumptions(worktreeRoot, consumptions) {
  const plans = [];
  for (const consumption of Array.isArray(consumptions) ? consumptions : []) {
    if (!/^data\/seo-feedback\/inbox\/[a-z0-9-]+\.json$/.test(consumption?.path || "") ||
      typeof consumption.id !== "string" || typeof consumption.message !== "string" ||
      typeof consumption.consumedAt !== "string" || !Number.isFinite(Date.parse(consumption.consumedAt))) {
      throw new Error("Checkpoint feedback consumption record is invalid");
    }
    const path = resolve(worktreeRoot, consumption.path);
    assertSafePath(worktreeRoot, path);
    if (!existsSync(path)) throw new Error(`Feedback checkpoint target is missing: ${consumption.path}`);
    const document = readJson(path);
    const entry = Array.isArray(document.entries)
      ? document.entries.find((item) => item?.id === consumption.id)
      : null;
    if (!entry || entry.message !== consumption.message) {
      throw new Error(`Feedback checkpoint no longer matches: ${consumption.id}`);
    }
    if (entry.consumedAt && entry.consumedAt !== consumption.consumedAt) {
      throw new Error(`Feedback checkpoint has a conflicting consumedAt: ${consumption.id}`);
    }
    if (!entry.consumedAt) {
      entry.consumedAt = consumption.consumedAt;
      plans.push({
        path,
        document,
        restoredPath: `${consumption.path}#${consumption.id}`,
      });
    }
  }
  return plans;
}

function applyFeedbackConsumptions(plans) {
  const restored = [];
  for (const plan of plans) {
    writeJsonAtomic(plan.path, plan.document);
    restored.push(plan.restoredPath);
  }
  return restored;
}

export function saveDailyCheckpoint({ coordinationRoot, worktreeRoot, date, owner, now = new Date() }) {
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    const state = readDailyRunState({ root: worktreeRoot, date });
    if (state.state === "conflict") throw new Error(`Cannot checkpoint a conflicting daily chain: ${state.conflicts.join(" ")}`);
    if (state.state === "local_publication_complete") assertPublishingWindow(date, now);
    const revision = `${now.toISOString().replaceAll(":", "-")}-${owner}-${randomUUID()}`;
    const revisionRoot = resolve(coordinationDirectory(coordinationRoot, date), "snapshots", revision);
    const files = [];
    for (const relativePath of dailyArtifactPaths(worktreeRoot, date)) {
      const sourcePath = resolve(worktreeRoot, relativePath);
      if (!existsSync(sourcePath)) continue;
      const content = checkedFile(sourcePath, worktreeRoot);
      const snapshotPath = resolve(revisionRoot, relativePath);
      assertSafePath(coordinationDirectory(coordinationRoot, date), dirname(snapshotPath));
      mkdirSync(dirname(snapshotPath), { recursive: true });
      writeFileSync(snapshotPath, content, { flag: "wx" });
      files.push({ path: relativePath.replaceAll("\\", "/"), sha256: sha256(content), bytes: content.byteLength });
    }
    const manifest = {
      schemaVersion: 1,
      date,
      owner,
      leaseId: lease.leaseId,
      generation: lease.generation,
      savedAt: now.toISOString(),
      revision,
      state,
      files,
      feedbackConsumptions: feedbackConsumptions(worktreeRoot, date),
    };
    const current = assertDailyLease({ coordinationRoot, date, owner });
    if (current.leaseId !== lease.leaseId || current.generation !== lease.generation) {
      throw new Error("Daily publishing lease generation changed while saving a checkpoint");
    }
    assertLock();
    createLeaseExclusive(
      resolve(coordinationDirectory(coordinationRoot, date), "manifests", `${revision}.json`),
      manifest,
    );
    assertLock();
    appendLeaseState(
      coordinationRoot,
      date,
      { ...lease, heartbeatAt: now.toISOString(), checkpointRevision: revision },
      current,
    );
    return manifest;
  });
}

export function restoreDailyCheckpoint({ coordinationRoot, worktreeRoot, date, owner }) {
  return withCoordinationLock({ coordinationRoot, date, owner }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    const checkpointRevision = lease.checkpointRevision;
    if (!checkpointRevision) {
      assertLock();
      appendLeaseState(
        coordinationRoot,
        date,
        { ...lease, heartbeatAt: new Date().toISOString() },
        lease,
      );
      return { outcome: "empty", restored: [] };
    }
    if (typeof checkpointRevision !== "string" || !REVISION_PATTERN.test(checkpointRevision)) {
      throw new Error("Daily checkpoint lease pointer is invalid");
    }
    const manifestPath = resolve(
      coordinationDirectory(coordinationRoot, date),
      "manifests",
      `${checkpointRevision}.json`,
    );
    if (!existsSync(manifestPath)) throw new Error("Daily checkpoint manifest is missing");
    const manifest = readJson(manifestPath);
    if (manifest.date !== date || !Array.isArray(manifest.files) ||
      typeof manifest.revision !== "string" || !REVISION_PATTERN.test(manifest.revision) ||
      manifest.revision !== checkpointRevision ||
      !Number.isInteger(manifest.generation) || manifest.generation > lease.generation) {
      throw new Error("Daily checkpoint manifest is invalid or comes from a future lease generation");
    }
    const dailyCoordinationRoot = coordinationDirectory(coordinationRoot, date);
    const snapshotsRoot = resolve(dailyCoordinationRoot, "snapshots");
    const revisionRoot = resolve(snapshotsRoot, manifest.revision);
    if (dirname(revisionRoot) !== snapshotsRoot || !existsSync(revisionRoot) ||
      !lstatSync(revisionRoot).isDirectory() || lstatSync(revisionRoot).isSymbolicLink()) {
      throw new Error("Daily checkpoint revision escaped its snapshot root or is a reparse point");
    }
    assertSafePath(dailyCoordinationRoot, revisionRoot);
    const allowed = new Set(dailyArtifactPaths(revisionRoot, date));
    const pendingWrites = [];
    for (const file of manifest.files) {
      if (!file || typeof file.path !== "string" || !allowed.has(file.path) ||
        typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
        throw new Error("Daily checkpoint contains an unapproved path or digest");
      }
      const snapshotPath = resolve(revisionRoot, file.path);
      const content = checkedFile(snapshotPath, revisionRoot);
      if (sha256(content) !== file.sha256) throw new Error(`Checkpoint digest mismatch: ${file.path}`);
      const destinationPath = resolve(worktreeRoot, file.path);
      assertSafePath(worktreeRoot, destinationPath);
      if (existsSync(destinationPath)) {
        if (sha256(checkedFile(destinationPath, worktreeRoot)) !== file.sha256) {
          throw new Error(`Checkpoint restore would overwrite a different artifact: ${file.path}`);
        }
        continue;
      }
      pendingWrites.push({ destinationPath, content, restoredPath: file.path });
    }
    const feedbackPlans = planFeedbackConsumptions(worktreeRoot, manifest.feedbackConsumptions);
    const feedbackPaths = [...new Set(
      (Array.isArray(manifest.feedbackConsumptions) ? manifest.feedbackConsumptions : [])
        .map((consumption) => consumption.path),
    )];
    const restored = [];
    for (const pending of pendingWrites) {
      writeAtomic(pending.destinationPath, pending.content);
      restored.push(pending.restoredPath);
    }
    restored.push(...applyFeedbackConsumptions(feedbackPlans));
    assertLock();
    appendLeaseState(
      coordinationRoot,
      date,
      { ...lease, heartbeatAt: new Date().toISOString() },
      lease,
    );
    return { outcome: "restored", restored, state: manifest.state, feedbackPaths };
  });
}

export function completeDailyNoPublish({
  coordinationRoot,
  worktreeRoot,
  date,
  owner,
  reasonCode,
  reason,
  now = new Date(),
}) {
  assertDate(date);
  assertOwner(owner);
  const noPublishPolicy = unattendedPolicy.noPublish;
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (unattendedPolicy.allowZeroPageOutcome !== true || noPublishPolicy?.schemaVersion !== 1) {
    throw new Error("The unattended policy does not allow a zero-page outcome");
  }
  if (!noPublishPolicy.reasonCodes.includes(reasonCode)) {
    throw new Error(`Unknown no-publish reason code: ${reasonCode || "<empty>"}`);
  }
  if (normalizedReason.length < noPublishPolicy.minimumReasonChars ||
    normalizedReason.length > noPublishPolicy.maximumReasonChars) {
    throw new Error(
      `No-publish reason must contain ${noPublishPolicy.minimumReasonChars}-${noPublishPolicy.maximumReasonChars} characters`,
    );
  }
  assertPublishingWindow(date, now);

  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    if (lease.releasePreparing || lease.releaseInFlight || lease.publicationReservation ||
      pinnedDailyReleaseRevision(coordinationRoot, date) || readyReleaseCheckpoint(coordinationRoot, date, lease)) {
      throw new Error("No-publish completion cannot replace a prepared, pinned, reserved, or checkpoint-ready release");
    }
    const dailyState = readDailyRunState({ root: worktreeRoot, date });
    if (dailyState.publishedSlug) {
      throw new Error("No-publish completion cannot coexist with a page published on the Shanghai day");
    }
    const evidence = noPublishEvidence(worktreeRoot, date, dailyState);
    assertNoPublishReasonEvidence(reasonCode, evidence.evidenceSummary);
    const receipt = {
      schemaVersion: noPublishPolicy.schemaVersion,
      date,
      outcome: "no_publish",
      reasonCode,
      reason: normalizedReason,
      recordedAt: now.toISOString(),
      ...evidence,
    };
    if (!isDailyNoPublishReceipt(receipt, date)) {
      throw new Error("Generated no-publish receipt does not satisfy the durable receipt contract");
    }
    const terminalState = readDailyRunState({ root: worktreeRoot, date, noPublishReceipt: receipt });
    if (terminalState.state !== "no_publish_complete") {
      throw new Error(
        `No-publish completion conflicts with the daily chain: ${terminalState.conflicts.join(" ")}`,
      );
    }
    const completed = {
      ...lease,
      status: "completed_no_publish",
      completedAt: now.toISOString(),
      heartbeatAt: now.toISOString(),
      noPublishReceipt: receipt,
    };
    const current = assertDailyLease({ coordinationRoot, date, owner });
    if (current.leaseId !== lease.leaseId || current.generation !== lease.generation) {
      throw new Error("Daily publishing lease generation changed before no-publish completion");
    }
    assertLock();
    return appendLeaseState(coordinationRoot, date, completed, current);
  });
}

export function completeDailyLease({
  coordinationRoot,
  worktreeRoot,
  date,
  owner,
  revision,
  slug,
  verification,
  now = new Date(),
}) {
  if (!SHA_PATTERN.test(String(revision || "")) || !SLUG_PATTERN.test(String(slug || ""))) {
    throw new Error("Lease completion requires a full Git SHA and safe published slug");
  }
  let liveReceipt;
  try {
    liveReceipt = JSON.parse(verification?.detail || "");
  } catch {
    throw new Error("Lease completion requires a structured live verification receipt");
  }
  if (verification?.origin !== unattendedPolicy.releaseVerification.origin || verification.revision !== revision ||
    verification.slug !== slug || verification.originMainVerified !== true ||
    verification.originMainTip !== revision ||
    !Number.isFinite(Date.parse(verification.verifiedAt)) || liveReceipt.status !== "verified" ||
    liveReceipt.origin !== verification.origin || liveReceipt.revision !== revision ||
    liveReceipt.slug !== slug || liveReceipt.verificationPasses !== 2) {
    throw new Error("Lease completion requires a matching LoreLens and origin/main verification receipt");
  }
  return withCoordinationLock({ coordinationRoot, date, owner, now }, (assertLock) => {
    const lease = assertDailyLease({ coordinationRoot, date, owner });
    if (lease.releaseInFlight?.revision !== revision || lease.releaseInFlight?.slug !== slug) {
      throw new Error("Lease completion requires the matching persisted release-in-flight marker");
    }
    assertReleaseSettlementWindow(date, now, lease.releaseInFlight);
    const productionDate = shanghaiDate(verification.verifiedAt);
    if (verification.productionDate !== productionDate || productionDate !== shanghaiDate(now)) {
      throw new Error("Lease completion production date must match the live verification time");
    }
    const state = readDailyRunState({ root: worktreeRoot, date });
    if (state.state !== "local_publication_complete" || state.publishedSlug !== slug) {
      throw new Error("Lease completion requires the complete local daily chain for the same slug");
    }
    const { releaseInFlight, ...settledLease } = lease;
    const completed = {
      ...settledLease,
      status: "completed",
      completedAt: now.toISOString(),
      heartbeatAt: now.toISOString(),
      releaseRevision: revision,
      publishedSlug: slug,
      liveVerification: { ...verification, productionDate },
    };
    const current = assertDailyLease({ coordinationRoot, date, owner });
    if (current.leaseId !== lease.leaseId || current.generation !== lease.generation) {
      throw new Error("Daily publishing lease generation changed before completion");
    }
    assertLock();
    return appendLeaseState(coordinationRoot, date, completed, current);
  });
}

export function readDailyLease({ coordinationRoot, date }) {
  assertDate(date);
  return readLease(coordinationRoot, date);
}
