import siteConfig from "../../data/config/site.json" with { type: "json" };

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "[::1]"
  ) {
    return true;
  }
  const octets = normalized.split(".");
  return octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

function rootOrigin(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid absolute URL`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain credentials`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be a root origin without a path, query, or fragment`);
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopbackHostname(url.hostname))
  ) {
    throw new Error(`${label} must use HTTPS outside loopback development`);
  }
  return new URL(`${url.origin}/`);
}

function basePath(value: string, label: string) {
  const normalized = value.trim();
  if (
    !/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(normalized) ||
    normalized === "/"
  ) {
    throw new Error(`${label} must be a non-root absolute path without a trailing slash`);
  }
  return normalized;
}

function configuredSite() {
  if (siteConfig.schemaVersion !== 2) {
    throw new Error("Site configuration schemaVersion must be 2");
  }
  const canonical = rootOrigin(
    siteConfig.canonicalOrigin,
    "site canonicalOrigin",
  );
  const publicBasePath = basePath(
    siteConfig.canonicalBasePath,
    "site canonicalBasePath",
  );
  const publicAssetBasePath = basePath(
    siteConfig.assetBasePath,
    "site assetBasePath",
  );
  if (publicAssetBasePath === publicBasePath) {
    throw new Error("Site assetBasePath must not equal canonicalBasePath");
  }
  const privateService = rootOrigin(
    siteConfig.privateServiceOrigin,
    "site privateServiceOrigin",
  );
  if (privateService.origin === canonical.origin) {
    throw new Error("Site privateServiceOrigin must not equal canonicalOrigin");
  }
  for (const privateAlias of siteConfig.privateServiceAliases) {
    const alias = rootOrigin(privateAlias, "site privateServiceAlias");
    if (alias.origin === canonical.origin || alias.origin === privateService.origin) {
      throw new Error("Site privateServiceAliases must be distinct origins");
    }
  }
  for (const legacyOrigin of siteConfig.legacyOrigins) {
    const legacy = rootOrigin(legacyOrigin, "site legacyOrigin");
    if (
      legacy.origin === canonical.origin ||
      legacy.origin === privateService.origin ||
      siteConfig.privateServiceAliases.some(
        (privateAlias) => rootOrigin(privateAlias, "site privateServiceAlias").origin === legacy.origin,
      )
    ) {
      throw new Error(
        "Site legacyOrigins must not include canonicalOrigin or privateServiceOrigin",
      );
    }
  }
  return { canonical, privateService, publicBasePath, publicAssetBasePath };
}

export function getSiteBasePath() {
  return configuredSite().publicBasePath;
}

export function getAssetBasePath() {
  return configuredSite().publicAssetBasePath;
}

export function getSiteUrl() {
  const { canonical } = configuredSite();
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return canonical;

  const candidate = rootOrigin(configured, "NEXT_PUBLIC_SITE_URL");
  const isProduction = process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";
  if (isProduction) {
    if (isLoopbackHostname(candidate.hostname)) {
      throw new Error(
        "NEXT_PUBLIC_SITE_URL must not use a loopback origin in production",
      );
    }
    return canonical;
  }
  return candidate;
}

export function publicSitePath(path: string) {
  const { publicBasePath } = configuredSite();
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  ) {
    throw new Error("Site path must be a same-origin absolute path");
  }
  const parsed = new URL(path, "https://public-path.invalid");
  if (parsed.origin !== "https://public-path.invalid") {
    throw new Error("Site path must be a same-origin absolute path");
  }
  const canonicalPath = parsed.pathname === publicBasePath ||
      parsed.pathname.startsWith(`${publicBasePath}/`)
    ? parsed.pathname
    : parsed.pathname === "/"
      ? publicBasePath
      : `${publicBasePath}${parsed.pathname}`;
  return `${canonicalPath}${parsed.search}${parsed.hash}`;
}

export function publicAssetPath(path: string) {
  const { publicAssetBasePath } = configuredSite();
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  ) {
    throw new Error("Asset path must be a same-origin absolute path");
  }
  const parsed = new URL(path, "https://asset-path.invalid");
  if (parsed.origin !== "https://asset-path.invalid") {
    throw new Error("Asset path must be a same-origin absolute path");
  }
  const assetPath = parsed.pathname === publicAssetBasePath ||
      parsed.pathname.startsWith(`${publicAssetBasePath}/`)
    ? parsed.pathname
    : parsed.pathname === "/"
      ? publicAssetBasePath
      : `${publicAssetBasePath}${parsed.pathname}`;
  return `${assetPath}${parsed.search}${parsed.hash}`;
}

export function getSiteBaseUrl() {
  return new URL(`${absoluteSiteUrl("/")}/`);
}

export function absoluteSiteUrl(path: string) {
  const site = getSiteUrl();
  const absolute = new URL(publicSitePath(path), site);
  if (absolute.origin !== site.origin) {
    throw new Error("Site path must not resolve outside the canonical origin");
  }
  return absolute.toString();
}
