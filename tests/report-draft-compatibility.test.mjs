import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { isReportDraft } from "../lib/seo/report-draft-validation.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("legacy reports remain readable while policy-v3 reports require current draft metadata", async () => {
  const legacyReport = JSON.parse(
    await readFile(join(repoRoot, "data", "reports", "2026-07-22.json"), "utf8"),
  );

  assert.equal(isReportDraft(legacyReport.draft, { allowLegacyMetadata: true }), true);
  assert.equal(isReportDraft(legacyReport.draft), false);

  const currentDraft = {
    ...legacyReport.draft,
    slug: "/interactive-voice-story",
    model: "codex",
    generatedAt: "2026-07-23T09:15:00+08:00",
  };
  assert.equal(isReportDraft(currentDraft), true);
});
