import assert from "node:assert/strict";
import test from "node:test";
import siteConfig from "../data/config/site.json" with { type: "json" };
import {
  absoluteSiteUrl,
  getAssetBasePath,
  getSiteBasePath,
  getSiteBaseUrl,
  getSiteUrl,
  publicAssetPath,
  publicSitePath,
} from "../lib/seo/site.ts";

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

test("site configuration separates the public guides path from the private service", () => {
  assert.deepEqual(siteConfig, {
    schemaVersion: 2,
    canonicalOrigin: "https://www.playworlds.ai",
    canonicalBasePath: "/guides",
    assetBasePath: "/playworlds-guides-assets",
    privateServiceOrigin: "https://lorelens.playworlds.ai",
    privateServiceAliases: ["https://seo-eight-snowy.vercel.app"],
    legacyOrigins: [
      "https://guides.playworlds.ai",
      "https://seo-pi-fawn.vercel.app",
      "https://lorelens.novelai.ai",
    ],
  });
});

test("getSiteUrl defaults to the configured canonical root origin", () => {
  withSiteUrl(undefined, () => {
    const site = getSiteUrl();
    assert.equal(site.toString(), "https://www.playworlds.ai/");
    assert.equal(site.origin, "https://www.playworlds.ai");
    assert.equal(site.pathname, "/");
    assert.equal(site.search, "");
    assert.equal(site.hash, "");
  });
});

test("public URL helpers retain the real /guides path", () => {
  withSiteUrl("  HTTPS://WWW.PLAYWORLDS.AI  ", () => {
    assert.equal(getSiteUrl().toString(), "https://www.playworlds.ai/");
    assert.equal(getSiteBasePath(), "/guides");
    assert.equal(getAssetBasePath(), "/playworlds-guides-assets");
    assert.equal(getSiteBaseUrl().toString(), "https://www.playworlds.ai/guides/");
    assert.equal(publicSitePath("/"), "/guides");
    assert.equal(publicSitePath("/example"), "/guides/example");
    assert.equal(publicSitePath("/guides/example"), "/guides/example");
    assert.equal(
      publicAssetPath("/images/example.webp"),
      "/playworlds-guides-assets/images/example.webp",
    );
    assert.equal(
      publicAssetPath("/playworlds-guides-assets/images/example.webp"),
      "/playworlds-guides-assets/images/example.webp",
    );
    assert.equal(
      absoluteSiteUrl("/sitemap.xml"),
      "https://www.playworlds.ai/guides/sitemap.xml",
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
          "https://www.playworlds.ai/",
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
    "http://www.playworlds.ai/",
    "ftp://www.playworlds.ai/",
    "https://reader:secret@www.playworlds.ai/",
    "https://www.playworlds.ai/guides",
    "https://www.playworlds.ai/?preview=1",
    "https://www.playworlds.ai/#preview",
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
      /same-origin absolute path/,
    );
    assert.throws(
      () => publicAssetPath("//attacker.example/path"),
      /same-origin absolute path/,
    );
  });
});
