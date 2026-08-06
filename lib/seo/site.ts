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

function configuredCanonicalOrigin() {
  if (siteConfig.schemaVersion !== 1) {
    throw new Error("Site configuration schemaVersion must be 1");
  }
  const canonical = rootOrigin(
    siteConfig.canonicalOrigin,
    "site canonicalOrigin",
  );
  for (const legacyOrigin of siteConfig.legacyOrigins) {
    const legacy = rootOrigin(legacyOrigin, "site legacyOrigin");
    if (legacy.origin === canonical.origin) {
      throw new Error("Site legacyOrigins must not include canonicalOrigin");
    }
  }
  return canonical;
}

export function getSiteUrl() {
  const canonical = configuredCanonicalOrigin();
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

export function absoluteSiteUrl(path: string) {
  const site = getSiteUrl();
  const absolute = new URL(path, site);
  if (absolute.origin !== site.origin) {
    throw new Error("Site path must not resolve outside the canonical origin");
  }
  return absolute.toString();
}
