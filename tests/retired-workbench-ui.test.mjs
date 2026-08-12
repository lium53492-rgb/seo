import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [home, notFound, structuredPage, icon, globals, workbench, reports, guide, pipelineStatus] = await Promise.all([
  read("../app/page.tsx"),
  read("../app/not-found.tsx"),
  read("../app/[slug]/StructuredContentPage.tsx"),
  read("../app/icon.svg"),
  read("../app/globals.css"),
  read("../app/workbench/page.tsx"),
  read("../app/workbench/reports/page.tsx"),
  read("../app/workbench/guide/page.tsx"),
  read("../lib/seo/pipeline-status.ts"),
]);

test("the public shell uses one absolute Tabletop Field Notes title and campaign language", () => {
  assert.match(home, /title:\s*\{ absolute: `\$\{pageTitle\} \| Tabletop Field Notes` \}/);
  assert.doesNotMatch(notFound, /STORY PATH|story shelf|next chapter/i);
  assert.match(notFound, /CAMPAIGN ARCHIVE \/ 404/);
  assert.match(structuredPage, />Tabletop Field Notes<\/a>/);
  assert.doesNotMatch(structuredPage, /NovelAI Story Guide/);
  assert.match(icon, /aria-label="Tabletop Field Notes"/);
  assert.doesNotMatch(globals, /#c9f447|#ff9a74|#6ad8e4/);
  assert.doesNotMatch(globals, /\.(?:posterWindow|posterRoom|calendar|tv|couple|person|leftPerson|rightPerson)\b/);
  assert.match(globals, /\.site-not-found[^}]*var\(--war-room\)/);
});

test("the report archive and guide never present a retired slug as a live page", () => {
  assert.match(reports, /isRetired: Boolean\(item\.slug && seoPolicy\.retiredPageSlugs\.includes\(item\.slug\)\)/);
  assert.match(reports, /item\.status === "published" && item\.path && !item\.isRetired/);
  assert.match(reports, /publicationStatus = publications\[0\]\?\.isRetired\s*\? "RETIRED"/);
  assert.match(reports, /reportIndex === 0 && report\.draft\?\.schemaVersion === 2/);
  assert.match(reports, /RETIRED · 查看历史草稿/);

  assert.match(guide, /latestPublicationIsRetired/);
  assert.match(guide, /latestPublicationIsLive[\s\S]*!latestPublicationIsRetired/);
  assert.match(guide, /RETIRED · 查看历史草稿/);
  assert.doesNotMatch(guide, /href=\{report\.publication\.path\}/);
});

test("the workbench labels retired publications and never links them as live pages", () => {
  assert.match(workbench, /seoPolicy\.retiredPageSlugs\.includes\(item\.slug\)/);
  assert.match(workbench, /pipeline\.publicationStatus === "retired" && pipeline\.retirement\.slug === item\.slug/);
  assert.match(workbench, /activePublishedPublications\.map/);
  assert.match(workbench, /item\.isRetired \? "已下线 · RETIRED"/);
  assert.match(workbench, /draftPublication\?\.isRetired \? "查看历史草稿（页面已下线）"/);
  assert.doesNotMatch(
    workbench,
    /publications\.filter\(\(item\) => item\.status === "published" && item\.path\)\.map/,
  );
});

test("the workbench distinguishes BigQuery Rising evidence from legacy relative interest", () => {
  assert.match(workbench, /function trendSignalState\(signal: GoogleTrendsSignal\)/);
  assert.match(workbench, /signal\.state === "not_observed" \? "未进入 Rising 25"/);
  assert.match(workbench, /signal\.bestRank !== null\) return `#\$\{signal\.bestRank\}`/);
  assert.match(workbench, /排名、涨幅和 DMA 覆盖都不是全美搜索量/);
  assert.doesNotMatch(
    workbench,
    /<b>\{signal\.state === "observed" \? signal\.relativeInterest/,
  );
  assert.match(guide, /Google Trends 看 Rising 排名与 DMA 覆盖/);
  assert.match(guide, /精确词未进入 Rising 25 也不等于搜索量为 0/);
});

test("the pipeline turns an exact retirement receipt into a terminal repository status", () => {
  assert.match(pipelineStatus, /assessPublicationRetirement\(\{/);
  assert.match(pipelineStatus, /const retirementComplete = retirementAssessment\.state === "valid" && !publishedPageExists/);
  assert.match(pipelineStatus, /if \(retirementComplete\) stage = "repository_retired"/);
  assert.match(pipelineStatus, /publicationStatus: retirementComplete \? "retired" : currentPublicationStatus/);
});
