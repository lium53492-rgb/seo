import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import test from "node:test";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const emptyServerOnlyModule = "data:text/javascript,export {}";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: emptyServerOnlyModule, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const aliasedPath = specifier.slice(2);
      const path = join(
        projectRoot,
        aliasedPath.endsWith(".json") ? aliasedPath : `${aliasedPath}.ts`,
      );
      return {
        url: pathToFileURL(path).href,
        ...(aliasedPath.endsWith(".json")
          ? { importAttributes: { type: "json" } }
          : {}),
        shortCircuit: true,
      };
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:") &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      const candidate = fileURLToPath(new URL(`${specifier}.ts`, context.parentURL));
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  isAutomationAuthHeaderAuthorized,
  isPrivateAttributionAccessConfigured,
  isPrivateAttributionRequestAuthorized,
} = await import("../lib/seo/auth.ts");
const reportRoute = await import("../app/api/attribution/report/route.ts");
const readinessRoute = await import("../app/api/attribution/readiness/route.ts");

function snapshotEnvironment() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    SEO_AUTOMATION_TOKEN: process.env.SEO_AUTOMATION_TOKEN,
    WORKBENCH_PASSWORD: process.env.WORKBENCH_PASSWORD,
    ATTRIBUTION_SECRET: process.env.ATTRIBUTION_SECRET,
    GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL:
      process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL,
    GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY:
      process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    VERCEL_ANALYTICS_TOKEN: process.env.VERCEL_ANALYTICS_TOKEN,
    VERCEL_TOKEN: process.env.VERCEL_TOKEN,
  };
}

function restoreEnvironment(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function basicAuth(password) {
  return `Basic ${Buffer.from(`operator:${password}`).toString("base64")}`;
}

function reportRequest(authorization) {
  return new Request(
    "http://localhost/api/attribution/report?sourceSlug=definitely-not-published",
    authorization ? { headers: { authorization } } : undefined,
  );
}

test("private attribution routes fail closed and accept the separate machine bearer token", async () => {
  const environment = snapshotEnvironment();
  try {
    process.env.NODE_ENV = "production";
    delete process.env.SEO_AUTOMATION_TOKEN;
    delete process.env.WORKBENCH_PASSWORD;
    delete process.env.ATTRIBUTION_SECRET;
    delete process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL;
    delete process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.VERCEL_ANALYTICS_TOKEN;
    delete process.env.VERCEL_TOKEN;

    assert.equal(isPrivateAttributionAccessConfigured(), false);
    assert.equal(isAutomationAuthHeaderAuthorized("Bearer anything"), false);
    assert.equal(
      isPrivateAttributionRequestAuthorized(reportRequest("Bearer anything")),
      false,
    );

    let response = await reportRoute.GET(reportRequest());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    response = await readinessRoute.GET(
      new Request("http://localhost/api/attribution/readiness"),
    );
    assert.equal(response.status, 503);

    const machineToken = "machine-secret-with-at-least-32-bytes";
    process.env.SEO_AUTOMATION_TOKEN = machineToken;
    assert.equal(isPrivateAttributionAccessConfigured(), true);
    assert.equal(isAutomationAuthHeaderAuthorized(`Bearer ${machineToken}`), true);
    assert.equal(isAutomationAuthHeaderAuthorized("Bearer wrong-secret"), false);
    assert.equal(isAutomationAuthHeaderAuthorized(`Bearer ${machineToken} `), false);
    assert.equal(isAutomationAuthHeaderAuthorized(basicAuth("machine-secret")), false);

    response = await reportRoute.GET(reportRequest("Bearer wrong-secret"));
    assert.equal(response.status, 401);
    response = await readinessRoute.GET(
      new Request("http://localhost/api/attribution/readiness", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    assert.equal(response.status, 401);
    response = await reportRoute.GET(reportRequest(`Bearer ${machineToken}`));
    assert.equal(response.status, 404);
    response = await readinessRoute.GET(
      new Request("http://localhost/api/attribution/readiness", {
        headers: { authorization: `Bearer ${machineToken}` },
      }),
    );
    assert.equal(response.status, 200);

    response = await reportRoute.GET(reportRequest(basicAuth("human-secret")));
    assert.equal(response.status, 401);
    response = await readinessRoute.GET(
      new Request("http://localhost/api/attribution/readiness", {
        headers: { authorization: basicAuth("human-secret") },
      }),
    );
    assert.equal(response.status, 401);
    delete process.env.SEO_AUTOMATION_TOKEN;
    process.env.WORKBENCH_PASSWORD = "human-secret";
    response = await reportRoute.GET(reportRequest(basicAuth("human-secret")));
    assert.equal(response.status, 404);

    delete process.env.WORKBENCH_PASSWORD;
    process.env.SEO_AUTOMATION_TOKEN = "too-short";
    assert.equal(isPrivateAttributionAccessConfigured(), false);
    assert.equal(isAutomationAuthHeaderAuthorized("Bearer too-short"), false);
    response = await reportRoute.GET(reportRequest("Bearer too-short"));
    assert.equal(response.status, 503);
  } finally {
    restoreEnvironment(environment);
  }
});

test("growth command entry points use only the machine automation credential", async () => {
  const scriptPaths = [
    "scripts/check-growth-readiness.mjs",
    "scripts/collect-growth-funnel.mjs",
    "scripts/collect-growth-portfolio.mjs",
  ];
  for (const relativePath of scriptPaths) {
    const source = await readFile(join(projectRoot, relativePath), "utf8");
    assert.match(source, /SEO_AUTOMATION_TOKEN/);
    assert.doesNotMatch(source, /WORKBENCH_PASSWORD/);
  }
  const collectorSource = await readFile(
    join(projectRoot, "scripts/lib/growth-portfolio.mjs"),
    "utf8",
  );
  assert.match(collectorSource, /Bearer \$\{automationToken\}/);
  assert.doesNotMatch(collectorSource, /WORKBENCH_PASSWORD/);

  const workflowSource = await readFile(
    join(projectRoot, ".github/workflows/growth-readiness.yml"),
    "utf8",
  );
  assert.match(workflowSource, /secrets\.SEO_AUTOMATION_TOKEN/);
  assert.doesNotMatch(workflowSource, /secrets\.WORKBENCH_PASSWORD/);
});
