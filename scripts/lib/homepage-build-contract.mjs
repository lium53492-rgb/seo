export function requiredHomepageBuildFragments({ activePageCount, siteUrl }) {
  if (!Number.isInteger(activePageCount) || activePageCount < 0) {
    throw new TypeError("activePageCount must be a non-negative integer.");
  }

  const fragments = [
    ["<h1>Make the next session", "rendered H1"],
    ["<em>hit harder.</em>", "complete H1"],
    [
      "<title>D&amp;D Field Guides for Players and Game Masters | Tabletop Field Notes</title>",
      "exact page title",
    ],
    [`rel="canonical" href="${siteUrl}"`, "canonical URL"],
    ['"@type":"FAQPage"', "FAQ JSON-LD"],
  ];

  if (activePageCount > 0) {
    fragments.push(['id="guide-library"', "guide library"]);
  }

  return fragments;
}
