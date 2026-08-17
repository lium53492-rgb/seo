import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import siteConfig from "../data/config/site.json" with { type: "json" };
import { buildGuidesRobotsText } from "../lib/seo/guides-robots.mjs";
import nextConfig from "../next.config.ts";

const publicBaseUrl = `${siteConfig.canonicalOrigin}${siteConfig.canonicalBasePath}`;
const require = createRequire(import.meta.url);
const { tryToParsePath } = require("next/dist/lib/try-to-parse-path");

test("Next accepts every child redirect and rewrite source pattern", async () => {
  const routeSources = [
    ...(await nextConfig.redirects()).map((route) => route.source),
    ...(await nextConfig.rewrites()).map((route) => route.source),
  ];
  for (const source of routeSources) {
    const result = tryToParsePath(source);
    assert.equal(result.error, undefined, `Next rejected route pattern ${source}`);
    assert.ok(result.regexStr, `Next did not compile route pattern ${source}`);
  }
});

test("legacy public hosts redirect root, guides, and single-page routes to the public guides tree", async () => {
  const redirects = await nextConfig.redirects();
  for (const legacyOrigin of siteConfig.legacyOrigins) {
    const host = new URL(legacyOrigin).host;
    const hostRedirects = redirects.filter((redirect) =>
      redirect.has?.some((condition) => condition.type === "host" && condition.value === host));
    assert.deepEqual(hostRedirects, [
      {
        source: "/",
        has: [{ type: "host", value: host }],
        destination: publicBaseUrl,
        permanent: true,
      },
      {
        source: "/guides",
        has: [{ type: "host", value: host }],
        destination: publicBaseUrl,
        permanent: true,
      },
      {
        source: "/guides/:path*",
        has: [{ type: "host", value: host }],
        destination: `${publicBaseUrl}/:path*`,
        permanent: true,
      },
      {
        source: "/:slug",
        has: [{ type: "host", value: host }],
        destination: `${publicBaseUrl}/:slug`,
        permanent: true,
      },
    ]);
  }
});

test("private service hosts redirect duplicate public roots without catching private routes", async () => {
  const redirects = await nextConfig.redirects();
  for (const privateOrigin of [
    siteConfig.privateServiceOrigin,
    ...siteConfig.privateServiceAliases,
  ]) {
    const host = new URL(privateOrigin).host;
    const hostRedirects = redirects.filter((redirect) =>
      redirect.has?.some((condition) => condition.type === "host" && condition.value === host));
    assert.deepEqual(hostRedirects, [
      {
        source: "/",
        has: [{ type: "host", value: host }],
        destination: publicBaseUrl,
        permanent: true,
      },
      {
        source: "/guides",
        has: [{ type: "host", value: host }],
        destination: publicBaseUrl,
        permanent: true,
      },
      {
        source: "/guides/:path*",
        has: [{ type: "host", value: host }],
        destination: `${publicBaseUrl}/:path*`,
        permanent: true,
      },
      {
        source: "/:slug((?!api|go|guides|workbench)[a-z0-9]+(?:-[a-z0-9]+)*)",
        has: [{ type: "host", value: host }],
        destination: `${publicBaseUrl}/:slug`,
        permanent: true,
      },
    ]);
    for (const privatePrefix of ["/api", "/go", "/workbench"]) {
      assert.equal(
        hostRedirects.some((redirect) => redirect.source === privatePrefix || redirect.source.startsWith(`${privatePrefix}/`)),
        false,
      );
    }
  }
});

test("private-host duplicate redirects never match the canonical www host", async () => {
  const redirects = await nextConfig.redirects();
  const canonicalHost = new URL(siteConfig.canonicalOrigin).host;
  assert.equal(
    redirects.some((redirect) => redirect.has?.some(
      (condition) => condition.type === "host" && condition.value === canonicalHost,
    )),
    false,
  );
});

test("the child owns real guides routes and an asset namespace without Next basePath", async () => {
  assert.equal(nextConfig.basePath, undefined);
  assert.equal(nextConfig.assetPrefix, "/playworlds-guides-assets");
  assert.equal(nextConfig.images?.path, "/playworlds-guides-assets/_next/image");
  const rewrites = await nextConfig.rewrites();
  assert.deepEqual(rewrites, [
    { source: "/playworlds-guides-assets/_next/:path*", destination: "/_next/:path*" },
    { source: "/playworlds-guides-assets/characters/:path*", destination: "/characters/:path*" },
    { source: "/playworlds-guides-assets/cursors/:path*", destination: "/cursors/:path*" },
    { source: "/playworlds-guides-assets/images/:path*", destination: "/images/:path*" },
    { source: "/playworlds-guides-assets/story-scenes/:path*", destination: "/story-scenes/:path*" },
  ]);
});

test("the child emits the expected guides robots policy", () => {
  const routeSource = readFileSync(
    new URL("../app/guides/robots.txt/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(routeSource, /export const dynamic = "force-static"/);
  assert.match(routeSource, /"Content-Type": "text\/plain; charset=utf-8"/);
  assert.equal(buildGuidesRobotsText(
    "/guides",
    "https://www.playworlds.ai/guides/sitemap.xml",
  ), [
    "User-Agent: *",
    "Allow: /guides",
    "Disallow: /guides/api/",
    "Disallow: /guides/go/",
    "Disallow: /guides/workbench/",
    "Disallow: /api/",
    "Disallow: /go/",
    "Disallow: /workbench/",
    "Sitemap: https://www.playworlds.ai/guides/sitemap.xml",
    "",
  ].join("\n"));
});
