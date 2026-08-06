import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.ts";

test("the legacy public host permanently redirects only root and single-segment routes", async () => {
  const redirects = await nextConfig.redirects();
  const hostMatch = [{ type: "host", value: "seo-pi-fawn.vercel.app" }];

  assert.deepEqual(redirects, [
    {
      source: "/",
      has: hostMatch,
      destination: "https://lorelens.novelai.ai",
      permanent: true,
    },
    {
      source: "/:slug",
      has: hostMatch,
      destination: "https://lorelens.novelai.ai/:slug",
      permanent: true,
    },
  ]);
  assert.equal(
    redirects.some((redirect) => redirect.source.includes(":path*")),
    false,
    "private APIs and attributed /go routes must not be caught by a cross-host wildcard",
  );
});
