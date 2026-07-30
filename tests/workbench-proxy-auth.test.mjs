import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    if (specifier.startsWith("@/")) {
      const aliasedPath = specifier.slice(2);
      return {
        url: pathToFileURL(join(projectRoot, `${aliasedPath}.ts`)).href,
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

const { NextRequest } = await import("next/server.js");
const { proxy } = await import("../proxy.ts");
const { isBasicAuthHeaderAuthorized } = await import("../lib/seo/auth.ts");

function snapshotEnvironment() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    SEO_AUTOMATION_TOKEN: process.env.SEO_AUTOMATION_TOKEN,
    WORKBENCH_PASSWORD: process.env.WORKBENCH_PASSWORD,
  };
}

function restoreEnvironment(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function request(pathname, authorization) {
  return new NextRequest(`https://seo.example${pathname}`, {
    headers: authorization ? { authorization } : undefined,
  });
}

function basicAuth(password) {
  return `Basic ${Buffer.from(`operator:${password}`).toString("base64")}`;
}

test("missing human password fails closed for the complete workbench route families", () => {
  const environment = snapshotEnvironment();
  try {
    process.env.NODE_ENV = "development";
    delete process.env.WORKBENCH_PASSWORD;
    process.env.SEO_AUTOMATION_TOKEN = "machine-secret";

    for (const pathname of [
      "/workbench",
      "/workbench/",
      "/workbench/reports",
      "/workbench/preview/example",
      "/workbench/attribution",
    ]) {
      const response = proxy(request(pathname, "Bearer machine-secret"));
      assert.equal(response.status, 404, pathname);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }

    for (const pathname of [
      "/api/workbench",
      "/api/workbench/run",
      "/api/workbench/feedback",
    ]) {
      const response = proxy(request(pathname, "Bearer machine-secret"));
      assert.equal(response.status, 503, pathname);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }

    assert.equal(isBasicAuthHeaderAuthorized(basicAuth("machine-secret")), false);
  } finally {
    restoreEnvironment(environment);
  }
});

test("configured human password accepts Basic only for workbench access", () => {
  const environment = snapshotEnvironment();
  try {
    process.env.NODE_ENV = "production";
    process.env.WORKBENCH_PASSWORD = "human-secret";
    process.env.SEO_AUTOMATION_TOKEN = "machine-secret";

    for (const pathname of [
      "/workbench",
      "/workbench/reports",
      "/api/workbench/run",
    ]) {
      let response = proxy(request(pathname));
      assert.equal(response.status, 401, pathname);
      assert.equal(
        response.headers.get("www-authenticate"),
        'Basic realm="SEO Growth Workbench"',
      );

      response = proxy(request(pathname, "Bearer machine-secret"));
      assert.equal(response.status, 401, pathname);

      response = proxy(request(pathname, basicAuth("wrong-secret")));
      assert.equal(response.status, 401, pathname);

      response = proxy(request(pathname, basicAuth("human-secret")));
      assert.equal(response.status, 200, pathname);
      assert.equal(response.headers.get("x-middleware-next"), "1");
    }
  } finally {
    restoreEnvironment(environment);
  }
});
