import assert from "node:assert/strict";
import test from "node:test";
import { buildNovelAiAttributionUrl, normalizeOutboundLocation } from "../lib/seo/attribution.ts";

test("NovelAI redirect carries a stable revenue attribution contract", () => {
  const clickId = "5e9560bf-66ae-42af-b7f6-ea45fdf36cbd";
  const url = buildNovelAiAttributionUrl({
    clickId,
    keyword: "play an ai roleplay story",
    location: "hero",
    sourceSlug: "play-an-ai-roleplay-story",
    destination: "https://www.novelai.ai/zh-CN/",
  });
  assert.equal(url.hostname, "www.novelai.ai");
  assert.equal(url.searchParams.get("utm_source"), "novelai_seo");
  assert.equal(url.searchParams.get("utm_medium"), "organic_landing");
  assert.equal(url.searchParams.get("utm_content"), "play-an-ai-roleplay-story");
  assert.equal(url.searchParams.get("seo_click_id"), clickId);
  assert.equal(url.searchParams.get("seo_cta_location"), "hero");
});

test("unknown CTA locations are normalized", () => {
  assert.equal(normalizeOutboundLocation("invented-location"), "seo_page");
});

test("redirect refuses a non-NovelAI destination", () => {
  assert.throws(() => buildNovelAiAttributionUrl({
    clickId: "5e9560bf-66ae-42af-b7f6-ea45fdf36cbd",
    keyword: "play an ai roleplay story",
    location: "hero",
    sourceSlug: "play-an-ai-roleplay-story",
    destination: "https://example.com/",
  }), /HTTPS NovelAI URL/);
});
