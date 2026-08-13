import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedProjectId = "prj_Wcu8wFAePajKbNMIKl2eUd2O3K4p";
const expectedTeamId = "team_KY6ZZwNyFhuy7ORN6EKIbfVr";

test("Vercel Analytics defaults target the project serving the canonical domain", async () => {
  const source = await readFile(new URL("../lib/seo/vercel-analytics.ts", import.meta.url), "utf8");
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  assert.match(source, new RegExp(expectedProjectId));
  assert.match(source, new RegExp(expectedTeamId));
  assert.match(example, new RegExp(`VERCEL_ANALYTICS_PROJECT_ID=${expectedProjectId}`));
  assert.match(example, new RegExp(`VERCEL_ANALYTICS_TEAM_ID=${expectedTeamId}`));
  assert.doesNotMatch(source, /prj_Qd3p3ml63hElGzar9myWPNuT9wVJ/);
  assert.doesNotMatch(source, /team_ciR2KmsqedGg5FIi1nqjSJCu/);
});
