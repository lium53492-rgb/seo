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
    ['data-ip-boundary="original-tabletop-fantasy"', "original-only D&D notice"],
    ['data-srd-material-used="false"', "SRD material boundary"],
    ["Independent, original-only guide", "D&D independence notice heading"],
    [
      "Dungeons &amp; Dragons and D&amp;D are trademarks of Wizards of the Coast.",
      "D&D independence notice body",
    ],
  ];

  if (activePageCount > 0) {
    fragments.push(['id="guide-library"', "guide library"]);
  }

  return fragments;
}
