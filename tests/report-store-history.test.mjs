import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import test from "node:test";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const emptyServerOnlyModule = "data:text/javascript,export {}";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: emptyServerOnlyModule, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const aliasedPath = specifier.slice(2);
      const path = join(projectRoot, aliasedPath.endsWith(".json") ? aliasedPath : `${aliasedPath}.ts`);
      return {
        url: pathToFileURL(path).href,
        ...(aliasedPath.endsWith(".json") ? { importAttributes: { type: "json" } } : {}),
        shortCircuit: true,
      };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const candidate = fileURLToPath(new URL(`${specifier}.ts`, context.parentURL));
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

test("the architecture cutoff preserves every bundled historical report", async () => {
  const { parseReport } = await import("../lib/seo/report-store.ts");
  const reportsDirectory = join(projectRoot, "data", "reports");
  const names = (await readdir(reportsDirectory)).filter((name) => name.endsWith(".json")).sort();
  assert.ok(names.length > 0);
  for (const name of names) {
    const raw = await readFile(join(reportsDirectory, name), "utf8");
    assert.doesNotThrow(() => parseReport(raw, name), name);
  }
});

test("reports on or after the architecture cutoff cannot omit schema 2", async () => {
  const { parseReport } = await import("../lib/seo/report-store.ts");
  const legacyRaw = await readFile(join(projectRoot, "data", "reports", "2026-08-06.json"), "utf8");
  const future = JSON.parse(legacyRaw);
  future.date = "2026-08-07";
  future.id = "seo-2026-08-07";
  future.generatedAt = "2026-08-07T09:15:00+08:00";
  assert.throws(() => parseReport(JSON.stringify(future), "future-without-architecture.json"), /Invalid SEO report shape/);
});
