import assert from "node:assert/strict";
import test from "node:test";
import {
  robotsDeclaresSitemap,
  robotsDisallowsEntirePathTree,
} from "../scripts/lib/robots-policy.mjs";

const guidesPath = "/guides";

test("main robots may protect private guide endpoints without blocking the public tree", () => {
  const fixture = `User-agent: *
Allow: /guides/
Disallow: /guides/api/
Disallow: /guides/go/
Disallow: /guides/workbench/
Sitemap: https://www.playworlds.ai/guides/sitemap.xml
`;
  assert.equal(robotsDisallowsEntirePathTree(fixture, guidesPath), false);
});

test("main robots rejects global and prefix rules that block the complete guides tree", () => {
  for (const blockedPath of ["/", "/*", "/guides", "/guides/", "/guides/*", "/guides*"]) {
    assert.equal(
      robotsDisallowsEntirePathTree(`User-agent: *\nDisallow: ${blockedPath}\n`, guidesPath),
      true,
      blockedPath,
    );
  }
  assert.equal(
    robotsDisallowsEntirePathTree("User-agent: *\nDisallow: /guides/api/ # private API\n", guidesPath),
    false,
  );
  for (const fixture of [
    "User-agent: *\nDisallow: /guides$\n",
    "User-agent: *\nDisallow: /guides\nAllow: /guides/\n",
  ]) {
    assert.equal(robotsDisallowsEntirePathTree(fixture, guidesPath), true);
  }
});

test("longest wildcard-agent match wins and an equally specific Allow wins ties", () => {
  for (const fixture of [
    "User-agent: *\nDisallow: /\nAllow: /guides\n",
    "User-agent: *\nDisallow: /guides*\nAllow: /guides\n",
    "User-agent: *\nDisallow: /guides/*\nAllow: /guides/\n",
  ]) {
    assert.equal(robotsDisallowsEntirePathTree(fixture, guidesPath), false);
  }
  assert.equal(
    robotsDisallowsEntirePathTree(
      "User-agent: *\nAllow: /guides/\nDisallow: /guides/private/\n",
      guidesPath,
    ),
    false,
  );
});

test("rules for other crawlers neither override nor hide wildcard-agent rules", () => {
  const allowedFixture = `User-agent: ExampleBot
Disallow: /guides/

User-agent: *
Allow: /guides/
`;
  assert.equal(robotsDisallowsEntirePathTree(allowedFixture, guidesPath), false);

  const blockedFixture = `User-agent: ExampleBot
Allow: /guides/

User-agent: *
Disallow: /
`;
  assert.equal(robotsDisallowsEntirePathTree(blockedFixture, guidesPath), true);
});

test("Googlebot-specific rules take precedence over wildcard-agent rules", () => {
  const blockedFixture = `User-agent: Googlebot
Disallow: /guides/

User-agent: *
Allow: /guides
`;
  assert.equal(robotsDisallowsEntirePathTree(blockedFixture, guidesPath), true);

  const allowedFixture = `User-agent: Googlebot
Allow: /guides

User-agent: *
Disallow: /
`;
  assert.equal(robotsDisallowsEntirePathTree(allowedFixture, guidesPath), false);
});

test("a leaf page cannot be hidden behind an otherwise crawlable guides tree", () => {
  const fixture = `User-agent: *
Allow: /guides
Disallow: /guides/new-page
`;
  assert.equal(robotsDisallowsEntirePathTree(fixture, guidesPath), false);
  assert.equal(robotsDisallowsEntirePathTree(fixture, "/guides/new-page"), true);
});

test("only a real exact Sitemap directive satisfies the release contract", () => {
  const sitemap = "https://www.playworlds.ai/guides/sitemap.xml";
  assert.equal(robotsDeclaresSitemap(`Sitemap: ${sitemap}\n`, sitemap), true);
  for (const fixture of [
    `# Sitemap: ${sitemap}\n`,
    `NotSitemap: ${sitemap}\n`,
    "Sitemap: https://www.playworlds.ai/sitemap.xml\n",
  ]) {
    assert.equal(robotsDeclaresSitemap(fixture, sitemap), false);
  }
});
