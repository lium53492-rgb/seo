import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const pageDirectory = resolve("data/pages");
const buildDirectory = resolve(".next/server/app");
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://seo-pi-fawn.vercel.app").replace(/\/$/, "");

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

for (const page of pages) {
  const htmlPath = resolve(buildDirectory, `${page.slug}.html`);
  if (!existsSync(htmlPath)) throw new Error(`Production HTML is missing for /${page.slug}.`);
  const html = readFileSync(htmlPath, "utf8");
  const canonical = `${siteUrl}/${page.slug}`;
  const requiredFragments = [
    [`<h1>${page.h1}</h1>`, "rendered H1"],
    [`rel="canonical" href="${canonical}"`, "canonical URL"],
    ['"@type":"Article"', "Article JSON-LD"],
    ['"@type":"FAQPage"', "FAQ JSON-LD"],
    [`href="/go/novelai/${page.slug}?location=seo_page"`, "attributed NovelAI CTA"],
  ];
  for (const [fragment, label] of requiredFragments) {
    if (!html.includes(fragment)) throw new Error(`/${page.slug} is missing ${label} in initial HTML.`);
  }
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) {
    throw new Error(`/${page.slug} is missing from the built sitemap.`);
  }
}

process.stdout.write(`Verified ${pages.length} built SEO pages, their metadata, CTA routes, and sitemap entries.\n`);
