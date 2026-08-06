import { canonicalSiteOrigin } from "./lib/site-origin.mjs";

const FULL_GIT_SHA = /^[a-f0-9]{40}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const [requestedOrigin = canonicalSiteOrigin, revision, slug] = process.argv.slice(2);
const origin = new URL(requestedOrigin).origin;
if (origin !== canonicalSiteOrigin) {
  throw new Error(`Release verification must target ${canonicalSiteOrigin}`);
}
if (!FULL_GIT_SHA.test(String(revision || ""))) {
  throw new Error("Release verification requires the full 40-character Git SHA");
}
if (slug && !SLUG.test(slug)) throw new Error("Release verification slug is invalid");

async function fetchText(path) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "user-agent": "LoreLens release verifier/1.0",
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
  const path = slug ? `/${slug}` : null;
  const [home, page, sitemap, robots] = await Promise.all([
    fetchText("/"),
    path ? fetchText(path) : Promise.resolve(null),
    path ? fetchText("/sitemap.xml") : Promise.resolve(null),
    fetchText("/robots.txt"),
  ]);
  assertRevision(home.body, "/");
  if (!home.body.includes(`<link rel="canonical" href="${origin}"`)) {
    throw new Error("Homepage canonical does not match the production origin");
  }
  if (path) {
    assertRevision(page.body, path);
    if (!page.body.includes(`<link rel="canonical" href="${origin}${path}"`)) {
      throw new Error(`${path} canonical does not match the production origin`);
    }
    for (const fragment of ["<h1", '"@type":"Article"', '"@type":"FAQPage"', `href="/go/novelai/${slug}?`]) {
      if (!page.body.includes(fragment)) throw new Error(`${path} is missing required live fragment ${fragment}`);
    }
    if (!sitemap.body.includes(`<loc>${origin}${path}</loc>`)) {
      throw new Error(`${path} is missing from the production sitemap`);
    }
  }
  if (!robots.body.includes(`Sitemap: ${origin}/sitemap.xml`)) {
    throw new Error("Production robots.txt does not reference the canonical sitemap");
  }
  return [home, page, sitemap, robots].filter(Boolean).map((response) => response.requestId).filter(Boolean);
}

const firstRequestIds = await verifyProductionSnapshot();
const secondRequestIds = await verifyProductionSnapshot();
process.stdout.write(`${JSON.stringify({
  status: "verified",
  origin,
  slug: slug || null,
  revision: revision.toLowerCase(),
  verificationPasses: 2,
  requestIds: [...firstRequestIds, ...secondRequestIds],
})}\n`);
