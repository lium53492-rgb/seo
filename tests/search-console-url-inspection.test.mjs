import assert from "node:assert/strict";
import test from "node:test";
import {
  readSearchConsoleUrlInspection,
  searchConsoleStatus,
} from "../lib/seo/search-console.ts";

const managedEnv = [
  "NEXT_PUBLIC_SITE_URL",
  "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL",
  "GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY",
  "GOOGLE_SEARCH_CONSOLE_SITE_URL",
];

function environmentSnapshot() {
  return Object.fromEntries(managedEnv.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(snapshot) {
  for (const key of managedEnv) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function configureSearchConsole() {
  process.env.NEXT_PUBLIC_SITE_URL = "https://seo.example.com";
  process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL =
    "seo-reader@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY = "test-private-key";
  process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL = "https://seo.example.com";
}

test("Search Console defaults to the public Playworlds Guides canonical property", () => {
  const environment = environmentSnapshot();
  try {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL;
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL =
      "seo-reader@example.iam.gserviceaccount.com";
    process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY = "test-private-key";

    assert.equal(
      searchConsoleStatus().siteUrl,
      "https://guides.playworlds.ai/",
    );
  } finally {
    restoreEnvironment(environment);
  }
});

test("Search Console rejects a URL-prefix property from the legacy origin", async () => {
  const environment = environmentSnapshot();
  try {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL =
      "seo-reader@example.iam.gserviceaccount.com";
    process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY = "test-private-key";
    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL =
      "https://seo-pi-fawn.vercel.app/";

    assert.throws(
      () => searchConsoleStatus(),
      /URL-prefix property must match the public canonical origin/,
    );

    let requested = false;
    await assert.rejects(
      readSearchConsoleUrlInspection({ sourceSlug: "interactive-voice-story" }, {
        getAccessToken: async () => "google-token",
        fetchImpl: async () => {
          requested = true;
          return Response.json({});
        },
      }),
      /URL-prefix property must match the public canonical origin/,
    );
    assert.equal(requested, false);
  } finally {
    restoreEnvironment(environment);
  }
});

test("Search Console domain properties must cover the canonical hostname", () => {
  const environment = environmentSnapshot();
  try {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL =
      "seo-reader@example.iam.gserviceaccount.com";
    process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY = "test-private-key";

    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL = "sc-domain:playworlds.ai";
    assert.equal(searchConsoleStatus().siteUrl, "sc-domain:playworlds.ai");

    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL =
      "sc-domain:guides.playworlds.ai.";
    assert.equal(
      searchConsoleStatus().siteUrl,
      "sc-domain:guides.playworlds.ai",
    );

    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL = "sc-domain:example.com";
    assert.throws(
      () => searchConsoleStatus(),
      /domain property must cover the public canonical hostname/,
    );
  } finally {
    restoreEnvironment(environment);
  }
});

test("URL Inspection reads only decision evidence for the canonical source slug", async () => {
  const environment = environmentSnapshot();
  try {
    configureSearchConsole();
    assert.equal(searchConsoleStatus().siteUrl, "https://seo.example.com/");

    const requests = [];
    const observed = await readSearchConsoleUrlInspection({
      sourceSlug: "story-based-ai-roleplay",
      pageUrl: "https://attacker.example/injected",
    }, {
      now: () => new Date("2026-07-30T07:00:00.000Z"),
      getAccessToken: async () => "google-token",
      fetchImpl: async (url, init) => {
        requests.push({
          url: String(url),
          authorization: init?.headers?.authorization,
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({
          inspectionResult: {
            inspectionLink: "https://search.google.com/search-console/inspect",
            indexStatusResult: {
              verdict: "PASS",
              coverageState: "Submitted and indexed",
              robotsTxtState: "ALLOWED",
              indexingState: "INDEXING_ALLOWED",
              pageFetchState: "SUCCESSFUL",
              lastCrawlTime: "2026-07-28T03:04:05Z",
              googleCanonical: "https://seo.example.com/story-based-ai-roleplay",
              userCanonical: "https://seo.example.com/story-based-ai-roleplay",
              crawledAs: "MOBILE",
              sitemap: [
                "https://seo.example.com/sitemap.xml",
                "https://seo.example.com/news-sitemap.xml",
              ],
              referringUrls: [
                "https://private-referrer.example/internal-path",
              ],
            },
          },
        });
      },
    });

    assert.deepEqual(requests, [{
      url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      authorization: "Bearer google-token",
      body: {
        inspectionUrl: "https://seo.example.com/story-based-ai-roleplay",
        siteUrl: "https://seo.example.com/",
        languageCode: "en-US",
      },
    }]);
    assert.deepEqual(observed, {
      state: "observed",
      sourceSlug: "story-based-ai-roleplay",
      pageUrl: "https://seo.example.com/story-based-ai-roleplay",
      inspectedAt: "2026-07-30T07:00:00.000Z",
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      robotsTxtState: "ALLOWED",
      indexingState: "INDEXING_ALLOWED",
      pageFetchState: "SUCCESSFUL",
      lastCrawlTime: "2026-07-28T03:04:05Z",
      googleCanonical: "https://seo.example.com/story-based-ai-roleplay",
      userCanonical: "https://seo.example.com/story-based-ai-roleplay",
      crawledAs: "MOBILE",
      sitemap: [],
      detail:
        "Observed Google's indexed-version URL Inspection result for this exact canonical page; this is not a live-page test.",
    });
    assert.equal(Object.hasOwn(observed, "referringUrls"), false);
    assert.equal(Object.hasOwn(observed, "inspectionLink"), false);
  } finally {
    restoreEnvironment(environment);
  }
});

test("URL Inspection strips canonical credentials, queries, and fragments", async () => {
  const environment = environmentSnapshot();
  try {
    configureSearchConsole();

    const result = await readSearchConsoleUrlInspection({
      sourceSlug: "story-based-ai-roleplay",
    }, {
      getAccessToken: async () => "google-token",
      fetchImpl: async () => Response.json({
        inspectionResult: {
          indexStatusResult: {
            verdict: "PASS",
            googleCanonical:
              "https://reader:private@seo.example.com/drafts/../story-based-ai-roleplay?token=secret#private",
            userCanonical:
              "https://seo.example.com/story-based-ai-roleplay?preview=1#draft",
          },
        },
      }),
    });

    assert.equal(result.state, "observed");
    assert.equal(
      result.googleCanonical,
      "https://seo.example.com/story-based-ai-roleplay",
    );
    assert.equal(
      result.userCanonical,
      "https://seo.example.com/story-based-ai-roleplay",
    );
    assert.match(result.detail, /normalized without credentials, query, or fragment/);
    assert.doesNotMatch(JSON.stringify(result), /reader|private|token|secret|preview|draft/);
    assert.deepEqual(result.sitemap, []);
  } finally {
    restoreEnvironment(environment);
  }
});

test("URL Inspection omits cross-site canonicals without leaking their values", async () => {
  const environment = environmentSnapshot();
  try {
    configureSearchConsole();

    const result = await readSearchConsoleUrlInspection({
      sourceSlug: "interactive-voice-story",
    }, {
      getAccessToken: async () => "google-token",
      fetchImpl: async () => Response.json({
        inspectionResult: {
          indexStatusResult: {
            verdict: "NEUTRAL",
            coverageState: "URL is unknown to Google",
            googleCanonical:
              "https://private.example.net/customer/secret?token=value",
            userCanonical: "http://seo.example.com/interactive-voice-story",
            sitemap: [
              "https://private.example.net/customer/private-sitemap.xml",
            ],
          },
        },
      }),
    });

    assert.equal(result.state, "observed");
    assert.equal(result.googleCanonical, null);
    assert.equal(result.userCanonical, null);
    assert.match(result.detail, /cross-site canonical/);
    assert.doesNotMatch(
      JSON.stringify(result),
      /private\.example|customer|secret|token|value|private-sitemap/,
    );
    assert.deepEqual(result.sitemap, []);
  } finally {
    restoreEnvironment(environment);
  }
});

test("URL Inspection does not mark sitemap or crawl metadata alone as observed", async () => {
  const environment = environmentSnapshot();
  try {
    configureSearchConsole();

    const result = await readSearchConsoleUrlInspection({
      sourceSlug: "choose-a-role-ai-story",
    }, {
      getAccessToken: async () => "google-token",
      fetchImpl: async () => Response.json({
        inspectionResult: {
          indexStatusResult: {
            lastCrawlTime: "2026-07-28T03:04:05Z",
            crawledAs: "MOBILE",
            sitemap: ["https://seo.example.com/private-sitemap.xml"],
            googleCanonical: "https://cross-site.example/private",
          },
        },
      }),
    });

    assert.equal(result.state, "unavailable");
    assert.match(result.detail, /no usable decision evidence/);
    assert.match(result.detail, /cross-site canonical was omitted/);
    assert.doesNotMatch(
      JSON.stringify(result),
      /cross-site\.example|private-sitemap/,
    );
    assert.deepEqual(result.sitemap, []);
  } finally {
    restoreEnvironment(environment);
  }
});

test("URL Inspection preserves domain properties and reports HTTP failures as unavailable", async () => {
  const environment = environmentSnapshot();
  try {
    configureSearchConsole();
    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL = "sc-domain:example.com";

    const result = await readSearchConsoleUrlInspection({
      sourceSlug: "interactive-voice-story",
    }, {
      now: () => new Date("2026-07-30T08:00:00.000Z"),
      getAccessToken: async (config) => {
        assert.equal(config.siteUrl, "sc-domain:example.com");
        return "google-token";
      },
      fetchImpl: async (_url, init) => {
        assert.equal(
          JSON.parse(String(init?.body)).siteUrl,
          "sc-domain:example.com",
        );
        return new Response(null, { status: 403 });
      },
    });

    assert.equal(result.state, "unavailable");
    assert.equal(result.detail, "URL Inspection API returned 403.");
    assert.equal(result.pageUrl, "https://seo.example.com/interactive-voice-story");
    assert.equal(result.verdict, null);
    assert.equal(result.coverageState, null);
    assert.deepEqual(result.sitemap, []);
  } finally {
    restoreEnvironment(environment);
  }
});

test("URL Inspection rejects malformed evidence instead of marking it observed", async () => {
  const environment = environmentSnapshot();
  try {
    configureSearchConsole();

    const result = await readSearchConsoleUrlInspection({
      sourceSlug: "choose-a-role-ai-story",
    }, {
      getAccessToken: async () => "google-token",
      fetchImpl: async () => Response.json({
        inspectionResult: {
          indexStatusResult: {
            verdict: "NEW_UNDOCUMENTED_VALUE",
            referringUrls: ["https://sensitive.example/path"],
          },
        },
      }),
    });

    assert.equal(result.state, "unavailable");
    assert.equal(
      result.detail,
      "URL Inspection API returned an invalid index-status result.",
    );
    assert.equal(Object.hasOwn(result, "referringUrls"), false);
  } finally {
    restoreEnvironment(environment);
  }
});

test("URL Inspection validates source slugs before any provider request", async () => {
  const environment = environmentSnapshot();
  try {
    configureSearchConsole();
    let requested = false;
    await assert.rejects(
      readSearchConsoleUrlInspection({
        sourceSlug: "../admin",
      }, {
        getAccessToken: async () => "google-token",
        fetchImpl: async () => {
          requested = true;
          return Response.json({});
        },
      }),
      /source slug is invalid/,
    );
    assert.equal(requested, false);
  } finally {
    restoreEnvironment(environment);
  }
});
