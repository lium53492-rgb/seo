import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import seoPolicy from "../data/config/seo-policy.json" with { type: "json" };
import unattendedPolicy from "../data/config/unattended-publishing.json" with { type: "json" };
import packageManifest from "../package.json" with { type: "json" };

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("unattended policy targets one page with persistent release recovery", () => {
  assert.equal(unattendedPolicy.timezone, "Asia/Shanghai");
  assert.equal(unattendedPolicy.dailyPageTarget, 1);
  assert.equal(unattendedPolicy.allowZeroPageOutcome, true);
  assert.equal(unattendedPolicy.primarySchedule, "09:15");
  assert.equal(unattendedPolicy.pdfFallbackSchedule, "18:30");
  assert.equal(unattendedPolicy.finalRecoverySchedule, "21:30");
  assert.equal(unattendedPolicy.publishCutoffLocalTime, "23:45");
  assert.equal("releaseSettlementMaxHours" in unattendedPolicy, false);
  assert.equal(unattendedPolicy.resumeConsistentPartialArtifacts, true);
  assert.equal(unattendedPolicy.sharedCheckpoint, "git-common-dir");
  assert.ok(unattendedPolicy.leaseStaleAfterMinutes >= 15);
  assert.ok(unattendedPolicy.heartbeatIntervalMinutes < unattendedPolicy.leaseStaleAfterMinutes);
  assert.equal(unattendedPolicy.allowCreatePageWhenMetricsUnavailable, false);
  assert.ok(unattendedPolicy.networkAttempts >= 3);
  assert.ok(unattendedPolicy.candidateBatchSize.min >= 8);
  assert.ok(unattendedPolicy.minimumFallbackIntents >= 7);
  assert.equal(unattendedPolicy.noPublish.schemaVersion, 1);
  assert.ok(unattendedPolicy.noPublish.reasonCodes.includes("visual_quality_failed"));
  assert.deepEqual(unattendedPolicy.terminalNoPublishSuccess, [
    "zero_pages_published_for_shanghai_day",
    "no_publish_receipt_recorded_for_shanghai_day",
  ]);
});

test("unattended release proof is wired to the canonical production origin", () => {
  assert.equal(unattendedPolicy.releaseVerification.origin, "https://guides.playworlds.ai");
  assert.equal(unattendedPolicy.releaseVerification.expectedOriginRepository, "lium53492-rgb/seo");
  assert.equal(unattendedPolicy.releaseVerification.authoritativeDeploymentEvidence, "live_exact_git_revision");
  assert.equal(unattendedPolicy.releaseVerification.requireOriginMainTip, true);
  assert.equal(unattendedPolicy.releaseVerification.rejectReadyFromDifferentProject, true);
  assert.equal(unattendedPolicy.releaseVerification.revisionAttribute, "data-release-revision");
  assert.equal(unattendedPolicy.releaseVerification.revisionMetaName, "git-revision");
  assert.match(packageManifest.scripts["daily:state"], /check-daily-run-state\.mjs/);
  assert.match(packageManifest.scripts["daily:coord"], /manage-daily-coordination\.mjs/);
  assert.match(packageManifest.scripts["daily:coord"], /run-node-supervised\.mjs 1200000/);
  assert.match(packageManifest.scripts["research:publish"], /run-node-supervised\.mjs 600000/);
  assert.match(packageManifest.scripts["release:verify"], /verify-live-release\.mjs/);
});

test("user-retired pages cannot be recreated by the unattended pipeline", () => {
  assert.deepEqual(seoPolicy.retiredPageSlugs, [
    "ai-roleplay-dialogue-vs-action",
    "ai-roleplay-first-message",
    "ai-roleplay-scene-recovery",
    "ai-voice-roleplay-story",
    "choose-a-role-ai-story",
    "how-to-choose-an-ai-roleplay-app",
    "how-to-start-ai-roleplay",
    "interactive-voice-story",
    "story-based-ai-roleplay",
  ]);
  assert.deepEqual(seoPolicy.retiredRecipeIds, ["playful-story-workshop-v1", "specimen-catalog-v1"]);
  assert.deepEqual(seoPolicy.retiredPaletteIds, ["craft-paper-orange", "museum-cobalt"]);
  const builder = readFileSync(join(root, "scripts", "build-free-research-report.mjs"), "utf8");
  const publisher = readFileSync(join(root, "scripts", "publish-reviewed-page.mjs"), "utf8");
  assert.match(builder, /retiredPageSlugs\.has\(pageSlug\)/);
  assert.match(publisher, /retiredPageSlugs\.has\(review\.slug\)/);
  assert.match(builder, /retiredRecipeIds\.has\(selectedPresentation\?\.recipeId\)/);
  assert.match(builder, /retiredPaletteIds\.has\(selectedPresentation\?\.paletteId\)/);
  assert.match(publisher, /retiredRecipeIds\.has\(draft\.architecture\?\.presentation\?\.recipeId\)/);
  assert.match(publisher, /retiredPaletteIds\.has\(draft\.architecture\?\.presentation\?\.paletteId\)/);
});

test("coordination and publication children have a terminating supervisor", () => {
  const supervisor = readFileSync(join(root, "scripts", "run-node-supervised.mjs"), "utf8");
  assert.match(supervisor, /child\.kill\("SIGTERM"\)/);
  assert.match(supervisor, /child\.kill\("SIGKILL"\)/);
  assert.match(supervisor, /process\.exitCode = timedOut \? 124/);
});

test("completion proves the exact origin/main tip twice and live verification uses two coherent passes", () => {
  const coordinator = readFileSync(join(root, "scripts", "manage-daily-coordination.mjs"), "utf8");
  const releaseGit = readFileSync(join(root, "scripts", "lib", "daily-release-git.mjs"), "utf8");
  const verifier = readFileSync(join(root, "scripts", "verify-live-release.mjs"), "utf8");
  assert.match(releaseGit, /refs\/heads\/main:refs\/remotes\/origin\/main/);
  assert.match(releaseGit, /"ls-remote", "--exit-code", "origin", "refs\/heads\/main"/);
  assert.match(releaseGit, /"get-url", "--push", "--all", "origin"/);
  assert.match(releaseGit, /"hash-object", `--path=\$\{path\}`, path/);
  assert.match(releaseGit, /"--no-renames"/);
  assert.match(releaseGit, /six-artifact allowlist/);
  assert.match(releaseGit, /exactly one non-merge commit above origin\/main/);
  assert.match(releaseGit, /cannot be created after its revision already reached origin\/main/);
  assert.match(releaseGit, /assertSafeDescendantDelta/);
  assert.match(releaseGit, /action: "rebased_equivalent"/);
  assert.match(releaseGit, /constructDailyReleaseOnBase/);
  assert.match(releaseGit, /assertIntermediateDailyReleaseRebasePin/);
  assert.match(releaseGit, /releaseProofContentIsEquivalent/);
  assert.match(coordinator, /rebaseDailyRelease/);
  assert.match(coordinator, /expectedOriginRepository/);
  assert.match(coordinator, /confirmDailyReleaseAtOriginMain/);
  assert.match(coordinator, /const tipBeforeVerification = authoritativeOriginMainTip/);
  assert.match(coordinator, /const originMainTip = confirmDailyReleaseAtOriginMain/);
  assert.match(coordinator, /const afterVerification = prepareDailyReleaseRevision/);
  assert.match(coordinator, /allowPush: false/);
  assert.match(verifier, /const firstRequestIds = await verifyProductionSnapshot\(\)/);
  assert.match(verifier, /const secondRequestIds = await verifyProductionSnapshot\(\)/);
  assert.match(verifier, /verificationPasses: 2/);
});

test("release start and cross-day settlement are persisted before push", () => {
  const coordinator = readFileSync(join(root, "scripts", "manage-daily-coordination.mjs"), "utf8");
  const state = readFileSync(join(root, "scripts", "lib", "daily-coordination.mjs"), "utf8");
  const releaseStartCase = coordinator.slice(coordinator.indexOf('case "release-start"'));
  const releaseSequence = [
    "heartbeatDailyLease({",
    "saveDailyCheckpoint({",
    "pinDailyReleaseRevision({",
    "prepareDailyRelease({",
    "result = startDailyRelease({",
  ].map((needle) => releaseStartCase.indexOf(needle));
  assert.equal(releaseSequence.every((index) => index >= 0), true);
  assert.deepEqual(releaseSequence, [...releaseSequence].sort((left, right) => left - right));
  const localVerifyIndex = releaseStartCase.indexOf("verifyLocalRelease(revision)");
  assert.ok(localVerifyIndex >= 0 && localVerifyIndex < releaseStartCase.indexOf("pinDailyReleaseRevision({"));
  assert.match(coordinator, /case "settle"/);
  assert.match(coordinator, /restoreDailyCheckpoint\([\s\S]*restoration\.feedbackPaths/);
  assert.match(coordinator, /worktree", "add", "--detach", detachedWorktree, releaseRevision/);
  assert.match(coordinator, /verifyLocalRelease\(releaseRevision\)/);
  assert.match(coordinator, /VERCEL_GIT_COMMIT_SHA: releaseRevision/);
  assert.match(coordinator, /materializeCheckpointDailyRelease/);
  assert.match(state, /releasePreparing/);
  assert.match(state, /checkpoint_ready/);
  assert.match(state, /Release start requires a durable release preparation/);
  assert.match(state, /releaseInFlight/);
  assert.match(state, /authorizedReleaseRevision/);
  assert.match(state, /productionDate/);
  assert.match(state, /inspectDailyCarryover/);
});

test("daily lease transitions are immutable rather than overwrite-renamed", () => {
  const coordinator = readFileSync(join(root, "scripts", "lib", "daily-coordination.mjs"), "utf8");
  assert.match(coordinator, /function appendLeaseState/);
  assert.match(coordinator, /lease-states/);
  assert.doesNotMatch(coordinator, /writeJsonAtomic\(leasePath/);
});
