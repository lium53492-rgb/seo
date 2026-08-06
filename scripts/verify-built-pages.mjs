import "./load-env.mjs";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderedBodyCopyFragments, servedContentDigest } from "../lib/seo/served-content.mjs";
import { normalizeContentText } from "../lib/seo/content-similarity.mjs";

const pageDirectory = resolve("data/pages");
const buildDirectory = resolve(".next/server/app");
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://seo-pi-fawn.vercel.app").replace(/\/$/, "");
const allowedCtaLocations = new Set(["seo_page", "hero", "header", "inline", "final_cta", "companion"]);
const seoPolicy = JSON.parse(readFileSync(resolve("data/config/seo-policy.json"), "utf8"));
const currentPageSchema = seoPolicy.contentArchitecture.publishedPageSchemaVersion;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

if (!existsSync(buildDirectory)) {
  throw new Error("Missing .next build output. Run npm run build before verify:pages.");
}

const pages = readdirSync(pageDirectory)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(resolve(pageDirectory, name), "utf8")))
  .filter((page) => page.status === "published");

if (!pages.length) throw new Error("No published SEO pages were found for build verification.");

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

const homepagePath = resolve(buildDirectory, "index.html");
if (!existsSync(homepagePath)) throw new Error("The production build did not emit the homepage HTML.");
const homepage = readFileSync(homepagePath, "utf8");
for (const [fragment, label] of [
  ["<h1>Enter a story.", "rendered H1"],
  ["<em>Choose your role.</em>", "complete H1"],
  [`rel="canonical" href="${siteUrl}"`, "canonical URL"],
  ['id="guide-library"', "guide library"],
  ['"@type":"FAQPage"', "FAQ JSON-LD"],
]) {
  if (!homepage.includes(fragment)) throw new Error(`The homepage is missing ${label} in initial HTML.`);
}
if (/NEXT_REDIRECT|http-equiv="refresh"/i.test(homepage)) {
  throw new Error("The homepage must render first-party content instead of redirecting visitors.");
}
if (/<a\b[^>]*href="https:\/\/(?:www\.)?novelai\.ai/i.test(homepage)) {
  throw new Error("The homepage must keep navigation on the SEO site.");
}
for (const page of pages) {
  if (!homepage.includes(`href="/${page.slug}"`)) {
    throw new Error(`The homepage is missing a crawlable link to /${page.slug}.`);
  }
}
if (!sitemap.includes(`<loc>${siteUrl}</loc>`)) {
  throw new Error("The homepage is missing from the built sitemap.");
}

for (const page of pages) {
  const htmlPath = resolve(buildDirectory, `${page.slug}.html`);
  if (!existsSync(htmlPath)) throw new Error(`Production HTML is missing for /${page.slug}.`);
  const html = readFileSync(htmlPath, "utf8");
  const canonical = `${siteUrl}/${page.slug}`;
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
  const ctaPattern = new RegExp(`href="/go/novelai/${page.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?location=([a-z_]+)"`, "g");
  const ctaLocations = [...html.matchAll(ctaPattern)].map((match) => match[1]);
  if (!ctaLocations.length) throw new Error(`/${page.slug} is missing an attributed NovelAI CTA in initial HTML.`);
  const invalidCtaLocation = ctaLocations.find((location) => !allowedCtaLocations.has(location));
  if (invalidCtaLocation) throw new Error(`/${page.slug} contains an invalid CTA location: ${invalidCtaLocation}.`);
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
    throw new Error(`/${page.slug} is missing from the built sitemap.`);
  }
  for (const link of page.internalLinks || []) {
    if (link.href === "/" && page.schemaVersion !== currentPageSchema) continue;
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
