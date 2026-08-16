import "./load-env.mjs";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderedBodyCopyFragments, servedContentDigest } from "../lib/seo/served-content.mjs";
import { assertPreservedProductMigrationHolds } from "../lib/seo/product-migration-hold.mjs";
import { normalizeContentText } from "../lib/seo/content-similarity.mjs";
import {
  canonicalSiteOrigin,
  configuredProductionSiteOrigin,
  legacySiteOrigins,
} from "./lib/site-origin.mjs";
import { requiredHomepageBuildFragments } from "./lib/homepage-build-contract.mjs";

const pageDirectory = resolve("data/pages");
const buildDirectory = resolve(".next/server/app");
const siteUrl = canonicalSiteOrigin;
if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
  configuredProductionSiteOrigin(
    process.env.NEXT_PUBLIC_SITE_URL,
    "NEXT_PUBLIC_SITE_URL",
  );
}
const allowedCtaLocations = new Set(["seo_page", "hero", "header", "inline", "final_cta", "companion"]);
const seoPolicy = JSON.parse(readFileSync(resolve("data/config/seo-policy.json"), "utf8"));
const playworldsAttribution = JSON.parse(
  readFileSync(resolve("data/config/playworlds-attribution.json"), "utf8"),
);
const currentPageSchema = seoPolicy.contentArchitecture.publishedPageSchemaVersion;
const migratedLegacyCtaSlugs = new Set(
  (seoPolicy.legacyPageGrandfathering?.allowlist || []).map((entry) => entry.slug),
);
const retiredPagePaths = new Set(
  (seoPolicy.retiredPageSlugs || []).map((slug) => `/${slug}`),
);
const productMigrationHoldSlugs = new Set(seoPolicy.productMigrationHoldSlugs || []);
const productMigrationHoldPaths = new Set(
  [...productMigrationHoldSlugs].map((slug) => `/${slug}`),
);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function metadataContent(html, attribute, value, label) {
  const tagPattern = new RegExp(
    `<(?:link|meta)\\b[^>]*\\b${attribute}="${value}"[^>]*>`,
    "gi",
  );
  const tags = [...html.matchAll(tagPattern)].map((match) => match[0]);
  if (tags.length !== 1) {
    throw new Error(`${label} must contain exactly one ${value} metadata tag.`);
  }
  const content = tags[0].match(/\b(?:href|content)="([^"]+)"/i)?.[1];
  if (!content) throw new Error(`${label} ${value} metadata is missing its URL.`);
  return content;
}

function assertCanonicalMetadata(html, canonical, label, requireArticle = false) {
  if (metadataContent(html, "rel", "canonical", label) !== canonical) {
    throw new Error(`${label} canonical metadata does not match ${canonical}.`);
  }
  if (metadataContent(html, "property", "og:url", label) !== canonical) {
    throw new Error(`${label} og:url metadata does not match ${canonical}.`);
  }
  if (!requireArticle) return;
  const jsonLd = [...html.matchAll(
    /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )].map((match) => JSON.parse(match[1]));
  const articles = jsonLd.filter((value) => value?.["@type"] === "Article");
  if (articles.length !== 1) {
    throw new Error(`${label} must contain exactly one Article JSON-LD object.`);
  }
  if (
    articles[0].url !== canonical ||
    articles[0].mainEntityOfPage !== canonical
  ) {
    throw new Error(`${label} Article JSON-LD URL fields do not match ${canonical}.`);
  }
}

function rejectLegacyOrigins(value, label) {
  const legacyOrigin = legacySiteOrigins.find((origin) => value.includes(origin));
  if (legacyOrigin) {
    throw new Error(`${label} still contains legacy origin ${legacyOrigin}.`);
  }
}

if (!existsSync(buildDirectory)) {
  throw new Error("Missing .next build output. Run npm run build before verify:pages.");
}

const pageArtifacts = readdirSync(pageDirectory)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(resolve(pageDirectory, name), "utf8")))
  .filter((page) => page.status === "published");
const pages = pageArtifacts.filter((page) => !productMigrationHoldSlugs.has(page.slug));
assertPreservedProductMigrationHolds(seoPolicy, pageArtifacts);

const sitemapPath = resolve(buildDirectory, "sitemap.xml.body");
if (!existsSync(sitemapPath)) throw new Error("The production build did not emit sitemap.xml.");
const sitemap = readFileSync(sitemapPath, "utf8");
const robotsPath = resolve(buildDirectory, "robots.txt.body");
if (!existsSync(robotsPath)) throw new Error("The production build did not emit robots.txt.");
const robots = readFileSync(robotsPath, "utf8");
for (const fragment of [
  "User-Agent: *",
  "Allow: /",
  "Disallow: /api/",
  "Disallow: /go/",
  "Disallow: /workbench/",
  `Sitemap: ${siteUrl}/sitemap.xml`,
]) {
  if (!robots.includes(fragment)) {
    throw new Error(`The production robots.txt is missing ${fragment}.`);
  }
}
if (robots.split(`Sitemap: ${siteUrl}/sitemap.xml`).length !== 2) {
  throw new Error("The production robots.txt must declare the canonical sitemap exactly once.");
}
rejectLegacyOrigins(robots, "The production robots.txt");

const homepagePath = resolve(buildDirectory, "index.html");
if (!existsSync(homepagePath)) throw new Error("The production build did not emit the homepage HTML.");
const homepage = readFileSync(homepagePath, "utf8");
for (const [fragment, label] of requiredHomepageBuildFragments({
  activePageCount: pages.length,
  siteUrl,
})) {
  if (!homepage.includes(fragment)) throw new Error(`The homepage is missing ${label} in initial HTML.`);
}
assertCanonicalMetadata(homepage, siteUrl, "The homepage");
rejectLegacyOrigins(homepage, "The homepage HTML");
if (/NEXT_REDIRECT|http-equiv="refresh"/i.test(homepage)) {
  throw new Error("The homepage must render first-party content instead of redirecting visitors.");
}
if (/<a\b[^>]*href="https:\/\/(?:www\.)?novelai\.ai/i.test(homepage)) {
  throw new Error("The homepage must keep navigation on the SEO site.");
}
if (/\bnovelai\b/i.test(homepage)) {
  throw new Error("The current homepage must not expose the retired NovelAI brand.");
}
for (const page of pages) {
  if (!homepage.includes(`href="/${page.slug}"`)) {
    throw new Error(`The homepage is missing a crawlable link to /${page.slug}.`);
  }
}
for (const heldPath of productMigrationHoldPaths) {
  if (homepage.includes(`href="${heldPath}"`)) {
    throw new Error(`The homepage still exposes product-migration hold ${heldPath}.`);
  }
}
const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1]);
const expectedSitemapLocations = [
  siteUrl,
  ...pages.map((page) => `${siteUrl}/${page.slug}`),
].sort();
if (
  new Set(sitemapLocations).size !== sitemapLocations.length ||
  JSON.stringify([...sitemapLocations].sort()) !== JSON.stringify(expectedSitemapLocations)
) {
  throw new Error("The built sitemap must contain exactly the homepage and every published canonical page once.");
}
rejectLegacyOrigins(sitemap, "The production sitemap");
for (const retiredPath of retiredPagePaths) {
  if (sitemapLocations.includes(`${siteUrl}${retiredPath}`)) {
    throw new Error(`The built sitemap still exposes retired page ${retiredPath}.`);
  }
}
for (const heldPath of productMigrationHoldPaths) {
  if (sitemapLocations.includes(`${siteUrl}${heldPath}`)) {
    throw new Error(`The built sitemap still exposes product-migration hold ${heldPath}.`);
  }
  if (existsSync(resolve(buildDirectory, `${heldPath.slice(1)}.html`))) {
    throw new Error(`The production build still emits HTML for product-migration hold ${heldPath}.`);
  }
}

for (const page of pages) {
  const htmlPath = resolve(buildDirectory, `${page.slug}.html`);
  if (!existsSync(htmlPath)) throw new Error(`Production HTML is missing for /${page.slug}.`);
  const html = readFileSync(htmlPath, "utf8");
  const canonical = `${siteUrl}/${page.slug}`;
  assertCanonicalMetadata(html, canonical, `/${page.slug}`, true);
  rejectLegacyOrigins(html, `/${page.slug} HTML`);
  const titlePattern = new RegExp(`<title>${escapeRegex(escapeHtml(page.title))}[^<]*<\\/title>`);
  if (!titlePattern.test(html)) {
    throw new Error(`/${page.slug} is missing its reviewed title in initial HTML.`);
  }
  const descriptionPattern = new RegExp(
    `<meta(?=[^>]*\\bname="description")(?=[^>]*\\bcontent="${escapeRegex(escapeHtml(page.metaDescription))}")[^>]*>`,
  );
  if (!descriptionPattern.test(html)) {
    throw new Error(`/${page.slug} is missing its reviewed meta description in initial HTML.`);
  }
  const requiredFragments = [
    [`<h1>${escapeHtml(page.h1)}</h1>`, "rendered H1"],
    [`rel="canonical" href="${canonical}"`, "canonical URL"],
    ['"@type":"Article"', "Article JSON-LD"],
    ['"@type":"FAQPage"', "FAQ JSON-LD"],
  ];
  if (page.schemaVersion !== currentPageSchema) {
    requiredFragments.push([escapeHtml(page.heroMarkdown), "crawlable hero answer"]);
  }
  for (const section of page.sections) requiredFragments.push([escapeHtml(section.heading), `section ${section.heading}`]);
  for (const faq of page.faqs) requiredFragments.push([escapeHtml(faq.question), `FAQ ${faq.question}`]);
  if (page.schemaVersion === currentPageSchema) {
    if (servedContentDigest(page) !== page.servedContentDigest) {
      throw new Error(`/${page.slug} served content no longer matches its release digest.`);
    }
    const mainHtml = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
    if (!mainHtml) throw new Error(`/${page.slug} is missing its structured main element.`);
    const mainText = normalizedHtmlText(mainHtml);
    for (const fragment of renderedBodyCopyFragments(page)) {
      const expectedText = normalizeContentText(fragment);
      if (expectedText && !mainText.includes(expectedText)) {
        throw new Error(`/${page.slug} is missing reviewed runtime copy in its structured main element: ${fragment.slice(0, 48)}.`);
      }
    }
    requiredFragments.push(
      [`data-presentation-recipe="${escapeHtml(page.architecture.presentation.recipeId)}"`, "presentation recipe"],
      [`data-renderer="${escapeHtml(page.architecture.presentation.rendererId)}"`, "renderer contract"],
      [`data-signature-module="${escapeHtml(page.signatureModule.id)}"`, "signature module"],
      [`data-signature-type="${escapeHtml(page.signatureModule.type)}"`, "signature type"],
      [escapeHtml(page.primaryCta), "page-specific CTA label"],
    );
    for (const section of page.sections) {
      requiredFragments.push([`data-content-role="${escapeHtml(section.role)}"`, `content role ${section.role}`]);
      requiredFragments.push([`data-content-format="${escapeHtml(section.format)}"`, `content format ${section.format}`]);
    }
  }
  for (const [fragment, label] of requiredFragments) {
    if (!html.includes(fragment)) throw new Error(`/${page.slug} is missing ${label} in initial HTML.`);
  }
  const usesPlayworldsCta = page.schemaVersion === currentPageSchema || migratedLegacyCtaSlugs.has(page.slug);
  const ctaRoute = usesPlayworldsCta
    ? playworldsAttribution.routePrefix
    : "/go/novelai";
  const ctaPattern = new RegExp(`href="${ctaRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${page.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?location=([a-z_]+)"`, "g");
  const ctaLocations = [...html.matchAll(ctaPattern)].map((match) => match[1]);
  if (!ctaLocations.length) {
    throw new Error(`/${page.slug} is missing its attributed ${usesPlayworldsCta ? "Playworlds" : "legacy NovelAI"} CTA in initial HTML.`);
  }
  if (usesPlayworldsCta && html.includes(`/go/novelai/${page.slug}?`)) {
    throw new Error(`/${page.slug} uses the current runtime but still contains the retired NovelAI CTA route.`);
  }
  if (usesPlayworldsCta && /\bnovelai\b/i.test(html)) {
    throw new Error(`/${page.slug} uses the current runtime but still exposes the retired NovelAI brand.`);
  }
  const invalidCtaLocation = ctaLocations.find((location) => !allowedCtaLocations.has(location));
  if (invalidCtaLocation) throw new Error(`/${page.slug} contains an invalid CTA location: ${invalidCtaLocation}.`);
  for (const link of page.internalLinks || []) {
    if (link.href === "/" && page.schemaVersion !== currentPageSchema) continue;
    if (retiredPagePaths.has(link.href) || productMigrationHoldPaths.has(link.href)) {
      if (html.includes(`href="${escapeHtml(link.href)}"`)) {
        throw new Error(`/${page.slug} still renders a crawlable link to unavailable page ${link.href}.`);
      }
      continue;
    }
    if (!html.includes(`href="${escapeHtml(link.href)}"`)) {
      throw new Error(`/${page.slug} is missing its declared crawlable link to ${link.href} in initial HTML.`);
    }
  }
  if (page.schemaVersion === currentPageSchema && page.architecture.presentation.companion === "none" &&
    html.includes("Animated white story fox guide")) {
    throw new Error(`/${page.slug} declares companion=none but renders the story companion.`);
  }
  if (page.schemaVersion === currentPageSchema && page.architecture.presentation.companion === "story_companion" &&
    !html.includes("Animated white story fox guide")) {
    throw new Error(`/${page.slug} declares story_companion but the companion is missing.`);
  }
  if (page.schemaVersion === currentPageSchema && page.architecture.presentation.gallery === "none" &&
    html.includes("Three moods.")) {
    throw new Error(`/${page.slug} declares gallery=none but renders the shared story gallery.`);
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedHtmlText(value) {
  return normalizeContentText(String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10))));
}

process.stdout.write(`Verified the homepage and ${pages.length} built SEO pages, their metadata, CTA routes, declared links, presentation contracts, robots, and sitemap entries.\n`);
