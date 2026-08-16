import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { vercelAnalyticsStatus } from "../lib/seo/vercel-analytics.ts";

test("Vercel Analytics has no stale project or team fallback", async () => {
  const source = await readFile(new URL("../lib/seo/vercel-analytics.ts", import.meta.url), "utf8");
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  assert.doesNotMatch(source, /prj_[A-Za-z0-9]+|team_[A-Za-z0-9]+/);
  assert.match(example, /^VERCEL_ANALYTICS_PROJECT_ID=$/m);
  assert.match(example, /^VERCEL_ANALYTICS_TEAM_ID=$/m);
});

test("Vercel Analytics fails closed until token, project, and team are explicit", () => {
  const keys = [
    "VERCEL_ANALYTICS_TOKEN",
    "VERCEL_TOKEN",
    "VERCEL_ANALYTICS_PROJECT_ID",
    "VERCEL_PROJECT_ID",
    "VERCEL_ANALYTICS_TEAM_ID",
    "VERCEL_TEAM_ID",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    process.env.VERCEL_ANALYTICS_TOKEN = "test-token";
    assert.equal(vercelAnalyticsStatus().configured, false);
    process.env.VERCEL_ANALYTICS_PROJECT_ID = "prj_explicit_fixture";
    assert.equal(vercelAnalyticsStatus().configured, false);
    process.env.VERCEL_ANALYTICS_TEAM_ID = "team_explicit_fixture";
    assert.equal(vercelAnalyticsStatus().configured, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
