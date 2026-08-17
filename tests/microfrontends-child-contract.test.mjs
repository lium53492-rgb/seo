import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MicrofrontendConfigIsomorphic } from "@vercel/microfrontends/config";
import { validateRouting } from "@vercel/microfrontends/next/testing";
import childContract from "../data/config/vercel-microfrontends-child.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };

const defaultApplicationKey = "playworlds-main-contract";
const composedContract = {
  applications: {
    [defaultApplicationKey]: {
      development: { fallback: "www.playworlds.ai" },
    },
    [childContract.applicationKey]: {
      packageName: childContract.packageName,
      assetPrefix: childContract.assetPrefix,
      routing: childContract.routing,
    },
  },
};

test("the child application key, package name, and Next wrapper stay aligned", () => {
  assert.equal(childContract.applicationKey, "seo");
  assert.equal(childContract.packageName, packageJson.name);
  assert.equal(childContract.packageName, "novelai-story-seo");
  assert.equal(childContract.assetPrefix, "playworlds-guides-assets");

  const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(nextConfigSource, /@vercel\/microfrontends\/next\/config/);
  assert.match(nextConfigSource, /\? withMicrofrontends\(nextConfig\)/);
});

test("the proposed main contract routes only guides and their assets to the SEO child", () => {
  const config = new MicrofrontendConfigIsomorphic({ config: composedContract });
  assert.doesNotThrow(() => validateRouting(config, {
    [childContract.applicationKey]: [
      "/guides",
      "/guides/x",
      "/guides/robots.txt",
      "/playworlds-guides-assets/_next/x",
    ],
    [defaultApplicationKey]: [
      "/api/x",
      "/workbench/x",
      "/",
    ],
  }));
});
