import { readFileSync } from "node:fs";
import {
  canonicalPublicPath,
  canonicalSiteOrigin,
  canonicalSiteUrl,
} from "./lib/site-origin.mjs";
import {
  robotsDeclaresSitemap,
  robotsDisallowsEntirePathTree,
} from "./lib/robots-policy.mjs";

const playworldsAttribution = JSON.parse(
  readFileSync(new URL("../data/config/playworlds-attribution.json", import.meta.url), "utf8"),
);
const seoPolicy = JSON.parse(
  readFileSync(new URL("../data/config/seo-policy.json", import.meta.url), "utf8"),
);
const productMigrationHoldSlugs = new Set(seoPolicy.productMigrationHoldSlugs || []);

const FULL_GIT_SHA = /^[a-f0-9]{40}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const [requestedSiteUrl = canonicalSiteUrl, revision, slug] = process.argv.slice(2);
const requested = new URL(requestedSiteUrl);
requested.hash = "";
requested.search = "";
const normalizedSiteUrl = requested.toString().replace(/\/$/, "");
if (normalizedSiteUrl !== canonicalSiteUrl) {
  throw new Error(`Release verification must target ${canonicalSiteUrl}`);
}
const origin = canonicalSiteOrigin;
if (!FULL_GIT_SHA.test(String(revision || ""))) {
  throw new Error("Release verification requires the full 40-character Git SHA");
}
if (slug && !SLUG.test(slug)) throw new Error("Release verification slug is invalid");
if (slug && productMigrationHoldSlugs.has(slug)) {
  throw new Error(`Release verification refuses product-migration hold /${slug}`);
}

async function fetchText(path) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "user-agent": "Playworlds Guides release verifier/1.0",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });
  if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
  return {
    body: await response.text(),
    requestId: response.headers.get("x-vercel-id"),
  };
}

async function fetchStatus(path) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "user-agent": "Playworlds Guides release verifier/1.0",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });
  await response.arrayBuffer();
  return { status: response.status, requestId: response.headers.get("x-vercel-id") };
}

async function verifyPlayworldsRedirect(path) {
  const response = await fetch(`${origin}${path}`, {
    method: "HEAD",
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "user-agent": "Playworlds Guides release verifier/1.0",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });
  if (response.status !== 307) {
    throw new Error(`${path} returned HTTP ${response.status}; expected a temporary attributed redirect`);
  }
  const location = response.headers.get("location");
  if (!location) throw new Error(`${path} is missing its Playworlds redirect destination`);
  const destination = new URL(location);
  const expected = new URL(playworldsAttribution.destination);
  if (destination.origin !== expected.origin || destination.pathname !== expected.pathname) {
    throw new Error(`${path} does not target the approved Playworlds Steam listing`);
  }
  const expectedParams = {
    utm_source: playworldsAttribution.utm.source,
    utm_medium: playworldsAttribution.utm.medium,
    utm_campaign: playworldsAttribution.utm.campaign,
    utm_content: slug,
    seo_source_slug: slug,
    seo_cta_location: "seo_page",
    seo_product: playworldsAttribution.product,
    seo_attribution_version: String(playworldsAttribution.schemaVersion),
  };
  for (const [name, expectedValue] of Object.entries(expectedParams)) {
    if (destination.searchParams.get(name) !== expectedValue) {
      throw new Error(`${path} has an invalid ${name} attribution value`);
    }
  }
  if (!destination.searchParams.get("utm_term")) {
    throw new Error(`${path} is missing its researched-keyword attribution value`);
  }
  const clickId = destination.searchParams.get("seo_click_id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clickId)) {
    throw new Error(`${path} is missing a valid seo_click_id`);
  }
  return response.headers.get("x-vercel-id");
}

function assertRevision(html, path) {
  const normalizedRevision = revision.toLowerCase();
  if (!html.includes(`data-release-revision="${normalizedRevision}"`)) {
    throw new Error(`${path} is not serving release ${normalizedRevision}`);
  }
  if (!html.includes(`<meta name="git-revision" content="${normalizedRevision}"`)) {
    throw new Error(`${path} is missing its machine-readable Git revision`);
  }
}

async function verifyProductionSnapshot() {
  const homePath = canonicalPublicPath("/");
  const path = slug ? canonicalPublicPath(`/${slug}`) : null;
  const sitemapPath = canonicalPublicPath("/sitemap.xml");
  const guidesRobotsPath = canonicalPublicPath("/robots.txt");
  const [home, page, sitemap, guidesRobots, rootRobots, heldRoutes] = await Promise.all([
    fetchText(homePath),
    path ? fetchText(path) : Promise.resolve(null),
    fetchText(sitemapPath),
    fetchText(guidesRobotsPath),
    fetchText("/robots.txt"),
    Promise.all([...productMigrationHoldSlugs].map(async (heldSlug) => ({
      slug: heldSlug,
      ...await fetchStatus(canonicalPublicPath(`/${heldSlug}`)),
    }))),
  ]);
  assertRevision(home.body, homePath);
  if (!home.body.includes(`<link rel="canonical" href="${canonicalSiteUrl}"`)) {
    throw new Error("Guides homepage canonical does not match the public guides URL");
  }
  if (/\bnovelai\b/i.test(home.body)) {
    throw new Error("Homepage still exposes the retired NovelAI brand");
  }
  if (path) {
    assertRevision(page.body, path);
    const canonical = `${canonicalSiteUrl}/${slug}`;
    if (!page.body.includes(`<link rel="canonical" href="${canonical}"`)) {
      throw new Error(`${path} canonical does not match the public guides URL`);
    }
    for (const fragment of ["<h1", '"@type":"Article"', '"@type":"FAQPage"', `href="${playworldsAttribution.routePrefix}/${slug}?`]) {
      if (!page.body.includes(fragment)) throw new Error(`${path} is missing required live fragment ${fragment}`);
    }
    if (page.body.includes(`href="/go/novelai/${slug}?`)) {
      throw new Error(`${path} still contains the retired NovelAI CTA route`);
    }
    if (/\bnovelai\b/i.test(page.body)) {
      throw new Error(`${path} still exposes the retired NovelAI brand`);
    }
    if (!sitemap.body.includes(`<loc>${canonical}</loc>`)) {
      throw new Error(`${path} is missing from the production sitemap`);
    }
  }
  for (const heldRoute of heldRoutes) {
    if (heldRoute.status !== 404) {
      throw new Error(`Product-migration hold /${heldRoute.slug} returned HTTP ${heldRoute.status}; expected 404`);
    }
    if (sitemap.body.includes(`<loc>${canonicalSiteUrl}/${heldRoute.slug}</loc>`)) {
      throw new Error(`Product-migration hold /${heldRoute.slug} is still present in the production sitemap`);
    }
  }
  if (!robotsDeclaresSitemap(guidesRobots.body, `${canonicalSiteUrl}/sitemap.xml`)) {
    throw new Error("Guides robots.txt does not reference the canonical guides sitemap");
  }
  if (!robotsDeclaresSitemap(rootRobots.body, `${canonicalSiteUrl}/sitemap.xml`)) {
    throw new Error("Main-site robots.txt does not reference the canonical guides sitemap");
  }
  if (robotsDisallowsEntirePathTree(rootRobots.body, canonicalPublicPath("/"))) {
    throw new Error("Main-site robots.txt blocks the public guides path");
  }
  if (path && robotsDisallowsEntirePathTree(rootRobots.body, path)) {
    throw new Error(`Main-site robots.txt blocks the released page ${path}`);
  }
  const redirectRequestId = path
    ? await verifyPlayworldsRedirect(`${playworldsAttribution.routePrefix}/${slug}?location=seo_page`)
    : null;
  return [home, page, sitemap, guidesRobots, rootRobots, ...heldRoutes].filter(Boolean).map((response) => response.requestId)
    .concat(redirectRequestId).filter(Boolean);
}

const firstRequestIds = await verifyProductionSnapshot();
const secondRequestIds = await verifyProductionSnapshot();
process.stdout.write(`${JSON.stringify({
  status: "verified",
  origin: canonicalSiteUrl,
  canonicalOrigin: canonicalSiteOrigin,
  siteUrl: canonicalSiteUrl,
  slug: slug || null,
  revision: revision.toLowerCase(),
  verificationPasses: 2,
  requestIds: [...firstRequestIds, ...secondRequestIds],
})}\n`);
