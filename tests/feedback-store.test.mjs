import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
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
  FeedbackConflictError,
  FeedbackInputError,
  listUnconsumedFeedback,
  markFeedbackConsumed,
  persistWorkbenchFeedback,
} = await import("../lib/seo/feedback-store.ts");
const { GET, PATCH } = await import("../app/api/workbench/feedback/route.ts");
const { createDisconnectedReport } = await import("../lib/seo/default-report.ts");

function snapshotEnvironment() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    WORKBENCH_PASSWORD: process.env.WORKBENCH_PASSWORD,
    GITHUB_REPORTS_TOKEN: process.env.GITHUB_REPORTS_TOKEN,
    GITHUB_REPORTS_REPO: process.env.GITHUB_REPORTS_REPO,
    GITHUB_REPORTS_BRANCH: process.env.GITHUB_REPORTS_BRANCH,
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

function encodeDocument(document) {
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`).toString("base64");
}

test("local feedback remains verbatim, consumption is idempotent, and GET is protected", async () => {
  const originalCwd = process.cwd();
  const environment = snapshotEnvironment();
  const workspace = await mkdtemp(join(tmpdir(), "seo-feedback-store-"));
  try {
    process.chdir(workspace);
    process.env.NODE_ENV = "test";
    process.env.WORKBENCH_PASSWORD = "queue-secret";
    delete process.env.GITHUB_REPORTS_TOKEN;

    const message = "  Keep this first line.\n\nKeep   these spaces too.  ";
    const first = await persistWorkbenchFeedback(message);
    const second = await persistWorkbenchFeedback("A second pending direction.");
    assert.equal(first.entry.message, message);
    assert.equal(first.destination, "local");

    const date = first.path.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    assert.ok(date);
    const storedBefore = JSON.parse(
      await readFile(join(workspace, first.path), "utf8"),
    );
    assert.equal(storedBefore.entries[0].message, message);
    assert.equal(storedBefore.entries.length, 2);

    const pendingBefore = await listUnconsumedFeedback();
    assert.equal(pendingBefore.pendingCount, 2);
    assert.deepEqual(
      new Set(pendingBefore.entries.map((entry) => entry.id)),
      new Set([first.entry.id, second.entry.id]),
    );

    const consumedAt = "2026-07-29T05:30:00.000Z";
    const rationale = "Adopt this exact direction in the next brief.";
    const consumed = await markFeedbackConsumed({
      id: first.entry.id,
      date,
      decision: "adopted",
      rationale,
      consumedAt,
    });
    const repeated = await markFeedbackConsumed({
      id: first.entry.id,
      date,
      decision: "adopted",
      rationale,
      consumedAt: "2026-07-30T05:30:00.000Z",
    });
    assert.equal(consumed.updated, true);
    assert.equal(repeated.updated, false);
    assert.equal(repeated.entry.consumedAt, consumedAt);

    const storedAfter = JSON.parse(
      await readFile(join(workspace, first.path), "utf8"),
    );
    assert.equal(storedAfter.entries.length, 2);
    assert.equal(storedAfter.entries[0].message, message);
    assert.equal(storedAfter.entries[0].decision, "adopted");
    assert.equal(storedAfter.entries[0].rationale, rationale);
    assert.equal(storedAfter.entries[1].id, second.entry.id);
    assert.equal(storedAfter.entries[1].consumedAt, undefined);

    const pendingAfter = await listUnconsumedFeedback();
    assert.equal(pendingAfter.pendingCount, 1);
    assert.equal(pendingAfter.entries[0].id, second.entry.id);
    assert.equal(pendingAfter.entries[0].date, date);

    await assert.rejects(
      markFeedbackConsumed({
        id: first.entry.id,
        date,
        decision: "rejected",
        rationale: "This now conflicts with the durable decision.",
      }),
      FeedbackConflictError,
    );
    await assert.rejects(
      markFeedbackConsumed({
        id: first.entry.id,
        date: "../../outside",
        decision: "adopted",
        rationale,
      }),
      FeedbackInputError,
    );
    await assert.rejects(
      persistWorkbenchFeedback(" \n\t "),
      FeedbackInputError,
    );

    const unauthorized = await GET(new Request("http://localhost/api/workbench/feedback"));
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get("cache-control"), "private, no-store");

    const authorized = await GET(new Request("http://localhost/api/workbench/feedback", {
      headers: { authorization: basicAuth("queue-secret") },
    }));
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers.get("cache-control"), "private, no-store");
    const body = await authorized.json();
    assert.equal(body.ok, true);
    assert.equal(body.queue.pendingCount, 1);
    assert.equal(body.queue.entries[0].message, second.entry.message);

    const patchUnauthorized = await PATCH(new Request("http://localhost/api/workbench/feedback", {
      method: "PATCH",
      body: JSON.stringify({
        id: second.entry.id,
        date,
        reportId: "seo-feedback-route-test",
        decision: "rejected",
        rationale: "This request is missing authorization.",
      }),
    }));
    assert.equal(patchUnauthorized.status, 401);

    const routeRationale = "The next brief uses a more specific interpretation.";
    const routeReport = createDisconnectedReport();
    routeReport.id = "seo-feedback-route-test";
    routeReport.date = date;
    routeReport.feedbackDecisions = [{
      id: second.entry.id,
      date,
      message: second.entry.message,
      decision: "rejected",
      rationale: routeRationale,
    }];
    await mkdir(join(workspace, "data", "reports"), { recursive: true });
    await writeFile(
      join(workspace, "data", "reports", `${date}.json`),
      `${JSON.stringify(routeReport, null, 2)}\n`,
    );

    const patchAuthorized = await PATCH(new Request("http://localhost/api/workbench/feedback", {
      method: "PATCH",
      headers: {
        authorization: basicAuth("queue-secret"),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: second.entry.id,
        date,
        reportId: routeReport.id,
        decision: "rejected",
        rationale: routeRationale,
      }),
    }));
    assert.equal(patchAuthorized.status, 200);
    const patchBody = await patchAuthorized.json();
    assert.equal(patchBody.ok, true);
    assert.equal(patchBody.entry.decision, "rejected");
    assert.equal((await listUnconsumedFeedback()).pendingCount, 0);
  } finally {
    process.chdir(originalCwd);
    restoreEnvironment(environment);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("GitHub optimistic retry merges a concurrent entry instead of losing it", async () => {
  const environment = snapshotEnvironment();
  const originalFetch = globalThis.fetch;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const original = {
    id: "feedback-original",
    createdAt: "2026-07-28T00:00:00.000Z",
    message: "Original remote feedback.",
    source: "workbench",
    kind: "content_guidance",
  };
  const concurrent = {
    id: "feedback-concurrent",
    createdAt: "2026-07-28T01:00:00.000Z",
    message: "Concurrent remote feedback.",
    source: "workbench",
    kind: "content_guidance",
  };
  let remoteDocument = { date, entries: [original] };
  let remoteSha = "sha-one";
  let putAttempts = 0;
  try {
    process.env.NODE_ENV = "production";
    process.env.GITHUB_REPORTS_TOKEN = "github-token";
    process.env.GITHUB_REPORTS_REPO = "safe-owner/safe-repo";
    process.env.GITHUB_REPORTS_BRANCH = "main";

    globalThis.fetch = async (url, init = {}) => {
      const requestUrl = String(url);
      if (init.method === "PUT") {
        putAttempts += 1;
        if (putAttempts === 1) {
          remoteDocument = { date, entries: [original, concurrent] };
          remoteSha = "sha-two";
          return new Response("", { status: 409 });
        }
        const payload = JSON.parse(String(init.body));
        assert.equal(payload.sha, "sha-two");
        remoteDocument = JSON.parse(
          Buffer.from(payload.content, "base64").toString("utf8"),
        );
        remoteSha = "sha-three";
        return Response.json({ content: { sha: remoteSha } });
      }
      if (/\/contents\/data\/seo-feedback\/inbox\?/.test(requestUrl)) {
        return Response.json([{
          type: "file",
          name: `${date}.json`,
          path: `data/seo-feedback/inbox/${date}.json`,
        }]);
      }
      assert.match(requestUrl, /\/contents\/data\/seo-feedback\/inbox\//);
      return Response.json({
        content: encodeDocument(remoteDocument),
        encoding: "base64",
        sha: remoteSha,
      });
    };

    const stored = await persistWorkbenchFeedback("New remote feedback.");
    assert.equal(stored.destination, "github");
    assert.equal(putAttempts, 2);
    assert.equal(remoteDocument.entries.length, 3);
    assert.deepEqual(
      remoteDocument.entries.slice(0, 2).map((entry) => entry.id),
      [original.id, concurrent.id],
    );
    assert.equal(remoteDocument.entries[2].id, stored.entry.id);

    const queue = await listUnconsumedFeedback();
    assert.equal(queue.destination, "github");
    assert.equal(queue.pendingCount, 3);
    assert.deepEqual(
      new Set(queue.entries.map((entry) => entry.id)),
      new Set([original.id, concurrent.id, stored.entry.id]),
    );

    process.env.GITHUB_REPORTS_REPO = "safe-owner/repo?ref=attacker";
    await assert.rejects(
      persistWorkbenchFeedback("Repository config must stay safe."),
      /GITHUB_REPORTS_REPO/,
    );
    assert.equal(remoteDocument.entries.length, 3);

    process.env.GITHUB_REPORTS_REPO = "../safe-repo";
    await assert.rejects(
      listUnconsumedFeedback(),
      /GITHUB_REPORTS_REPO/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});
