import assert from "node:assert/strict";
import test from "node:test";
import {
  robotsDeclaresSitemap,
  robotsDisallowsEntirePathTree,
} from "../scripts/lib/robots-policy.mjs";

const rootPath = "/";

test("root robots may protect private endpoints without blocking the public site", () => {
  const fixture = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /go/
Disallow: /workbench/
Sitemap: https://lorelens.playworlds.ai/sitemap.xml
`;
  assert.equal(robotsDisallowsEntirePathTree(fixture, rootPath), false);
  assert.equal(robotsDisallowsEntirePathTree(fixture, "/new-page"), false);
});

test("root robots rejects global rules that block the complete site", () => {
  for (const blockedPath of ["/", "/*", "/$"]) {
    assert.equal(
      robotsDisallowsEntirePathTree(`User-agent: *\nDisallow: ${blockedPath}\n`, rootPath),
      true,
      blockedPath,
    );
  }
  assert.equal(
    robotsDisallowsEntirePathTree("User-agent: *\nDisallow: /api/ # private API\n", rootPath),
    false,
  );
});

test("longest wildcard-agent match wins and an equally specific Allow wins ties", () => {
  for (const fixture of [
    "User-agent: *\nDisallow: /\nAllow: /\n",
    "User-agent: *\nDisallow: /*\nAllow: /\n",
  ]) {
    assert.equal(robotsDisallowsEntirePathTree(fixture, rootPath), false);
  }
  assert.equal(
    robotsDisallowsEntirePathTree(
      "User-agent: *\nAllow: /\nDisallow: /private/\n",
      rootPath,
    ),
    false,
  );
});

test("rules for other crawlers neither override nor hide wildcard-agent rules", () => {
  const allowedFixture = `User-agent: ExampleBot
Disallow: /

User-agent: *
Allow: /
`;
  assert.equal(robotsDisallowsEntirePathTree(allowedFixture, rootPath), false);

  const blockedFixture = `User-agent: ExampleBot
Allow: /

User-agent: *
Disallow: /
`;
  assert.equal(robotsDisallowsEntirePathTree(blockedFixture, rootPath), true);
});

test("Googlebot-specific rules take precedence over wildcard-agent rules", () => {
  const blockedFixture = `User-agent: Googlebot
Disallow: /

User-agent: *
Allow: /
`;
  assert.equal(robotsDisallowsEntirePathTree(blockedFixture, rootPath), true);

  const allowedFixture = `User-agent: Googlebot
Allow: /

User-agent: *
Disallow: /
`;
  assert.equal(robotsDisallowsEntirePathTree(allowedFixture, rootPath), false);
});

test("a leaf page cannot be hidden behind an otherwise crawlable root site", () => {
  const fixture = `User-agent: *
Allow: /
Disallow: /new-page
`;
  assert.equal(robotsDisallowsEntirePathTree(fixture, rootPath), false);
  assert.equal(robotsDisallowsEntirePathTree(fixture, "/new-page"), true);
});

test("only a real exact Sitemap directive satisfies the release contract", () => {
  const sitemap = "https://lorelens.playworlds.ai/sitemap.xml";
  assert.equal(robotsDeclaresSitemap(`Sitemap: ${sitemap}\n`, sitemap), true);
  for (const fixture of [
    `# Sitemap: ${sitemap}\n`,
    `NotSitemap: ${sitemap}\n`,
    "Sitemap: https://guides.playworlds.ai/sitemap.xml\n",
  ]) {
    assert.equal(robotsDeclaresSitemap(fixture, sitemap), false);
  }
});
