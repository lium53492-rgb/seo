import "./load-env.mjs";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  collectGrowthPortfolio,
  shanghaiDate,
} from "./lib/growth-portfolio.mjs";
import {
  canonicalSiteOrigin,
  configuredPrivateServiceOrigin,
} from "./lib/site-origin.mjs";

const outputArgument = process.argv[2];
const daysArgument = process.argv[3];
const policy = JSON.parse(readFileSync(resolve("data/config/seo-policy.json"), "utf8"));
const days = daysArgument === undefined
  ? Number(policy.feedbackLoop?.reportingWindowDays ?? 28)
  : Number(daysArgument);
const reportingLagDays = Number(policy.feedbackLoop?.reportingLagDays ?? 3);
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const retiredSlugs = [...new Set(policy.retiredPageSlugs || [])]
  .map((slug) => String(slug))
  .sort((left, right) => left.localeCompare(right));
if (retiredSlugs.some((slug) => !safeSlug.test(slug))) {
  throw new Error("seo-policy.json contains an invalid retired page slug");
}
const retiredSlugSet = new Set(retiredSlugs);
const productMigrationHoldSlugSet = new Set(
  (policy.productMigrationHoldSlugs || []).map((slug) => String(slug)),
);
if (
  productMigrationHoldSlugSet.size !== (policy.productMigrationHoldSlugs || []).length ||
  [...productMigrationHoldSlugSet].some((slug) => !safeSlug.test(slug) || retiredSlugSet.has(slug))
) {
  throw new Error("seo-policy.json contains an invalid product-migration hold slug");
}
const retirementBySlug = new Map();
const maintenanceDirectory = resolve("data/maintenance");
if (existsSync(maintenanceDirectory)) {
  for (const name of readdirSync(maintenanceDirectory)
    .filter((entry) => entry.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))) {
    const record = JSON.parse(readFileSync(resolve(maintenanceDirectory, name), "utf8"));
    for (const publication of Array.isArray(record.retiredPublications)
      ? record.retiredPublications
      : []) {
      const slug = String(publication?.slug || "");
      if (
        retiredSlugSet.has(slug) &&
        Number.isFinite(Date.parse(publication?.retiredAt || ""))
      ) {
        retirementBySlug.set(slug, publication.retiredAt);
      }
    }
  }
}
const pagesDirectory = resolve("data/pages");
const pages = existsSync(pagesDirectory)
  ? readdirSync(pagesDirectory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(resolve(pagesDirectory, name), "utf8")))
    .filter((page) => page.status === "published" &&
      !retiredSlugSet.has(page.slug) &&
      !productMigrationHoldSlugSet.has(page.slug))
    .map((page) => ({ slug: page.slug, path: page.path, keyword: page.keyword }))
    .sort((left, right) => left.slug.localeCompare(right.slug))
  : [];
const retiredPages = retiredSlugs.map((slug) => ({
  slug,
  path: `/${slug}`,
  ...(retirementBySlug.has(slug)
    ? { retiredAt: retirementBySlug.get(slug) }
    : {}),
}));

const snapshot = await collectGrowthPortfolio({
  pages,
  retiredPages,
  automationToken: process.env.SEO_AUTOMATION_TOKEN,
  siteUrl: configuredPrivateServiceOrigin(
    process.env.SEO_REPORT_SITE_URL,
    "SEO_REPORT_SITE_URL",
  ),
  publicSiteOrigin: canonicalSiteOrigin,
  days,
  reportingLagDays,
});

if (outputArgument === "-") {
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} else {
  const outputPath = resolve(outputArgument || `data/growth/${shanghaiDate()}.json`);
  if (existsSync(outputPath)) {
    throw new Error(`Refusing to overwrite existing growth portfolio: ${outputPath}`);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, outputPath);
  process.stdout.write(`${outputPath}\n`);
}
