import assert from "node:assert/strict";
import test from "node:test";
import siteConfig from "../data/config/site.json" with { type: "json" };
import { absoluteSiteUrl, getSiteUrl } from "../lib/seo/site.ts";

function withSiteUrl(value, callback) {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = value;
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
}

function withProductionEnvironment(key, callback) {
  const previous = process.env[key];
  process.env[key] = "production";
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

test("site configuration declares the LoreLens canonical and legacy origins", () => {
  assert.deepEqual(siteConfig, {
    schemaVersion: 1,
    canonicalOrigin: "https://lorelens.novelai.ai",
    legacyOrigins: ["https://seo-pi-fawn.vercel.app"],
  });
});

test("getSiteUrl defaults to the configured canonical root origin", () => {
  withSiteUrl(undefined, () => {
    const site = getSiteUrl();
    assert.equal(site.toString(), "https://lorelens.novelai.ai/");
    assert.equal(site.origin, "https://lorelens.novelai.ai");
    assert.equal(site.pathname, "/");
    assert.equal(site.search, "");
    assert.equal(site.hash, "");
  });
});

test("getSiteUrl normalizes host casing and the root trailing slash", () => {
  withSiteUrl("  HTTPS://LORELENS.NOVELAI.AI  ", () => {
    assert.equal(getSiteUrl().toString(), "https://lorelens.novelai.ai/");
    assert.equal(
      absoluteSiteUrl("/sitemap.xml"),
      "https://lorelens.novelai.ai/sitemap.xml",
    );
  });
});

test("getSiteUrl permits HTTP only for loopback development", () => {
  for (const value of [
    "http://localhost:3000/",
    "http://app.localhost:3000/",
    "http://127.0.0.1:3000/",
    "http://127.12.34.56:3000/",
    "http://[::1]:3000/",
  ]) {
    withSiteUrl(value, () => {
      assert.equal(getSiteUrl().origin, value.slice(0, -1));
    });
  }
});

test("production ignores a stale public override and rejects loopback", () => {
  for (const productionKey of ["NODE_ENV", "VERCEL_ENV"]) {
    withProductionEnvironment(productionKey, () => {
      withSiteUrl("https://seo-pi-fawn.vercel.app/", () => {
        assert.equal(
          getSiteUrl().toString(),
          "https://lorelens.novelai.ai/",
        );
      });
      withSiteUrl("http://localhost:3000/", () => {
        assert.throws(() => getSiteUrl(), /loopback origin in production/);
      });
    });
  }
});

test("getSiteUrl rejects non-root, credentialed, and non-HTTPS public URLs", () => {
  const invalidValues = [
    "not a URL",
    "http://lorelens.novelai.ai/",
    "ftp://lorelens.novelai.ai/",
    "https://reader:secret@lorelens.novelai.ai/",
    "https://lorelens.novelai.ai/guides",
    "https://lorelens.novelai.ai/?preview=1",
    "https://lorelens.novelai.ai/#preview",
  ];
  for (const value of invalidValues) {
    withSiteUrl(value, () => {
      assert.throws(() => getSiteUrl(), /NEXT_PUBLIC_SITE_URL/);
    });
  }
});

test("absoluteSiteUrl cannot escape the canonical origin", () => {
  withSiteUrl(undefined, () => {
    assert.throws(
      () => absoluteSiteUrl("//attacker.example/path"),
      /must not resolve outside/,
    );
  });
});
