import assert from "node:assert/strict";
import test from "node:test";
import playworldsAttribution from "../data/config/playworlds-attribution.json" with { type: "json" };
import { readBuiltAttributedCtaContracts } from "../scripts/lib/built-cta-contract.mjs";

const baseInput = {
  allowedCtaLocations: playworldsAttribution.allowedCtaLocations,
  destinations: playworldsAttribution.destinations,
  pageSlug: "campaign-guide",
  requireDestinationPlatform: true,
  routePrefix: playworldsAttribution.routePrefix,
};

test("built Playworlds CTA verification accepts either query-parameter order", () => {
  const contracts = readBuiltAttributedCtaContracts({
    ...baseInput,
    html: [
      '<a href="/go/playworlds/campaign-guide?destinationPlatform=steam&amp;location=hero">Hero</a>',
      '<a href="/go/playworlds/campaign-guide?location=final_cta&amp;destinationPlatform=steam">Final</a>',
    ].join(""),
  });

  assert.deepEqual(contracts, [
    { location: "hero", destinationPlatform: "steam" },
    { location: "final_cta", destinationPlatform: "steam" },
  ]);
});

test("built Playworlds CTA verification requires one enabled platform and one valid location", () => {
  assert.throws(() => readBuiltAttributedCtaContracts({
    ...baseInput,
    html: '<a href="/go/playworlds/campaign-guide?location=hero">Missing platform</a>',
  }), /exactly one destinationPlatform/);

  assert.throws(() => readBuiltAttributedCtaContracts({
    ...baseInput,
    html: '<a href="/go/playworlds/campaign-guide?destinationPlatform=web&amp;location=hero">Disabled platform</a>',
  }), /disabled or unknown destination platform/);

  assert.throws(() => readBuiltAttributedCtaContracts({
    ...baseInput,
    html: '<a href="/go/playworlds/campaign-guide?destinationPlatform=steam&amp;location=hero&amp;location=inline">Duplicate location</a>',
  }), /invalid or duplicate CTA location/);
});
