import "./load-env.mjs";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const pageDirectory = resolve("data/pages");
const buildDirectory = resolve(".next/server/app");
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://seo-pi-fawn.vercel.app").replace(/\/$/, "");
const allowedCtaLocations = new Set(["seo_page", "hero", "header", "inline", "final_cta", "companion"]);

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
  const requiredFragments = [
    [`<h1>${escapeHtml(page.h1)}</h1>`, "rendered H1"],
    [escapeHtml(page.heroMarkdown), "crawlable hero answer"],
    [`rel="canonical" href="${canonical}"`, "canonical URL"],
    ['"@type":"Article"', "Article JSON-LD"],
    ['"@type":"FAQPage"', "FAQ JSON-LD"],
  ];
  for (const section of page.sections) requiredFragments.push([escapeHtml(section.heading), `section ${section.heading}`]);
  for (const faq of page.faqs) requiredFragments.push([escapeHtml(faq.question), `FAQ ${faq.question}`]);
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
  for (const target of pages) {
    if (target.slug === page.slug) continue;
    if (!html.includes(`href="/${target.slug}"`)) {
      throw new Error(`/${page.slug} is missing a crawlable link to /${target.slug} in initial HTML.`);
    }
  }
}

process.stdout.write(`Verified the homepage and ${pages.length} built SEO pages, their metadata, CTA routes, cross-links, robots, and sitemap entries.\n`);
