export function buildGuidesRobotsText(publicBasePath, sitemapUrl) {
  if (!/^\/[a-z0-9/-]*$/i.test(publicBasePath)) {
    throw new Error("The public guides base path must be an absolute path.");
  }
  if (!/^https:\/\//i.test(sitemapUrl)) {
    throw new Error("The public guides sitemap must use HTTPS.");
  }

  return [
    "User-Agent: *",
    `Allow: ${publicBasePath}`,
    `Disallow: ${publicBasePath}/api/`,
    `Disallow: ${publicBasePath}/go/`,
    `Disallow: ${publicBasePath}/workbench/`,
    "Disallow: /api/",
    "Disallow: /go/",
    "Disallow: /workbench/",
    `Sitemap: ${sitemapUrl}`,
    "",
  ].join("\n");
}
