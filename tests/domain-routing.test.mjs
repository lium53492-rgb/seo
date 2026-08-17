import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.ts";

test("legacy public hosts permanently redirect only root and single-segment routes", async () => {
  const redirects = await nextConfig.redirects();
  assert.deepEqual(redirects, [
    {
      source: "/",
      has: [{ type: "host", value: "guides.playworlds.ai" }],
      destination: "https://lorelens.playworlds.ai",
      permanent: true,
    },
    {
      source: "/:slug",
      has: [{ type: "host", value: "guides.playworlds.ai" }],
      destination: "https://lorelens.playworlds.ai/:slug",
      permanent: true,
    },
    {
      source: "/",
      has: [{ type: "host", value: "seo-eight-snowy.vercel.app" }],
      destination: "https://lorelens.playworlds.ai",
      permanent: true,
    },
    {
      source: "/:slug",
      has: [{ type: "host", value: "seo-eight-snowy.vercel.app" }],
      destination: "https://lorelens.playworlds.ai/:slug",
      permanent: true,
    },
    {
      source: "/",
      has: [{ type: "host", value: "seo-pi-fawn.vercel.app" }],
      destination: "https://lorelens.playworlds.ai",
      permanent: true,
    },
    {
      source: "/:slug",
      has: [{ type: "host", value: "seo-pi-fawn.vercel.app" }],
      destination: "https://lorelens.playworlds.ai/:slug",
      permanent: true,
    },
    {
      source: "/",
      has: [{ type: "host", value: "lorelens.novelai.ai" }],
      destination: "https://lorelens.playworlds.ai",
      permanent: true,
    },
    {
      source: "/:slug",
      has: [{ type: "host", value: "lorelens.novelai.ai" }],
      destination: "https://lorelens.playworlds.ai/:slug",
      permanent: true,
    },
  ]);
  assert.equal(
    redirects.some((redirect) => redirect.source.includes(":path*")),
    false,
    "private APIs and attributed /go routes must not be caught by a cross-host wildcard",
  );
});
