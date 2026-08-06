import assert from "node:assert/strict";
import test from "node:test";
import { getReleaseRevision } from "../lib/seo/release.ts";

const sha = "2393ab747dfc301003e3ee1c0215df92ca931508";

test("release revision prefers the Vercel Git SHA", () => {
  assert.equal(getReleaseRevision({
    VERCEL_GIT_COMMIT_SHA: sha.toUpperCase(),
    GITHUB_SHA: "1".repeat(40),
  }), sha);
});

test("release revision supports CI and explicit build fallbacks", () => {
  assert.equal(getReleaseRevision({ GITHUB_SHA: sha }), sha);
  assert.equal(getReleaseRevision({ NEXT_PUBLIC_RELEASE_SHA: sha }), sha);
});

test("release revision omits malformed or shortened values", () => {
  assert.equal(getReleaseRevision({ VERCEL_GIT_COMMIT_SHA: "2393ab7" }), null);
  assert.equal(getReleaseRevision({ VERCEL_GIT_COMMIT_SHA: "z".repeat(40) }), null);
  assert.equal(getReleaseRevision({}), null);
});

test("Vercel builds never fall back to a manually configured public revision", () => {
  assert.equal(getReleaseRevision({
    VERCEL: "1",
    VERCEL_GIT_COMMIT_SHA: "missing",
    GITHUB_SHA: sha,
    NEXT_PUBLIC_RELEASE_SHA: sha,
  }), null);
  assert.equal(getReleaseRevision({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: sha }), sha);
});
