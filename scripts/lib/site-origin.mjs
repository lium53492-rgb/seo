import { readFileSync } from "node:fs";

const siteConfig = JSON.parse(
  readFileSync(new URL("../../data/config/site.json", import.meta.url), "utf8"),
);
if (
  siteConfig.schemaVersion !== 2 ||
  typeof siteConfig.canonicalOrigin !== "string" ||
  typeof siteConfig.canonicalBasePath !== "string" ||
  typeof siteConfig.assetBasePath !== "string" ||
  typeof siteConfig.privateServiceOrigin !== "string" ||
  !Array.isArray(siteConfig.privateServiceAliases) ||
  siteConfig.privateServiceAliases.some((value) => typeof value !== "string") ||
  !Array.isArray(siteConfig.legacyOrigins) ||
  siteConfig.legacyOrigins.some((value) => typeof value !== "string")
) {
  throw new Error("data/config/site.json must use site configuration schema version 2");
}

function rootOrigin(value, label, allowDifferentOrigin) {
  const url = new URL(String(value).trim());
  const loopback = url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error(`${label} must use HTTPS (HTTP is allowed only for loopback development)`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain credentials`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be a root origin without a path, query, or fragment`);
  }
  if (!allowDifferentOrigin && !loopback && url.origin !== canonicalSiteOrigin) {
    throw new Error(`${label} must match the canonical production origin ${canonicalSiteOrigin}`);
  }
  return url.origin;
}

export const canonicalSiteOrigin = rootOrigin(
  siteConfig.canonicalOrigin,
  "data/config/site.json canonicalOrigin",
  true,
);

function canonicalBasePath(value, label) {
  const normalized = String(value).trim();
  if (
    !/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(normalized) ||
    normalized === "/"
  ) {
    throw new Error(`${label} must be a non-root absolute path without a trailing slash`);
  }
  return normalized;
}

export const canonicalSiteBasePath = canonicalBasePath(
  siteConfig.canonicalBasePath,
  "data/config/site.json canonicalBasePath",
);
export const publicAssetBasePath = canonicalBasePath(
  siteConfig.assetBasePath,
  "data/config/site.json assetBasePath",
);
if (publicAssetBasePath === canonicalSiteBasePath) {
  throw new Error("data/config/site.json assetBasePath must not equal canonicalBasePath");
}
export const canonicalSiteUrl = `${canonicalSiteOrigin}${canonicalSiteBasePath}`;
export const privateServiceOrigin = rootOrigin(
  siteConfig.privateServiceOrigin,
  "data/config/site.json privateServiceOrigin",
  true,
);
export const privateServiceAliases = Object.freeze(
  siteConfig.privateServiceAliases.map((value) =>
    rootOrigin(value, "data/config/site.json privateServiceAlias", true)),
);

export const legacySiteOrigins = Object.freeze(
  (siteConfig.legacyOrigins || []).map((value) =>
    rootOrigin(value, "data/config/site.json legacyOrigin", true)),
);
if (legacySiteOrigins.includes(canonicalSiteOrigin)) {
  throw new Error("data/config/site.json legacyOrigins must not include canonicalOrigin");
}
if (
  privateServiceOrigin === canonicalSiteOrigin ||
  legacySiteOrigins.includes(privateServiceOrigin) ||
  privateServiceAliases.includes(canonicalSiteOrigin) ||
  privateServiceAliases.includes(privateServiceOrigin) ||
  privateServiceAliases.some((value) => legacySiteOrigins.includes(value)) ||
  new Set(privateServiceAliases).size !== privateServiceAliases.length
) {
  throw new Error("data/config/site.json privateServiceOrigin must be distinct");
}

export function canonicalPublicPath(path) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  ) {
    throw new Error("Public site path must be a same-origin absolute path");
  }
  const parsed = new URL(path, "https://public-path.invalid");
  const pathname = parsed.pathname === canonicalSiteBasePath ||
      parsed.pathname.startsWith(`${canonicalSiteBasePath}/`)
    ? parsed.pathname
    : parsed.pathname === "/"
      ? canonicalSiteBasePath
      : `${canonicalSiteBasePath}${parsed.pathname}`;
  return `${pathname}${parsed.search}${parsed.hash}`;
}

export function canonicalPublicUrl(path = "/") {
  return `${canonicalSiteOrigin}${canonicalPublicPath(path)}`;
}

export function configuredProductionSiteOrigin(value, label = "Site URL") {
  return rootOrigin(value || canonicalSiteOrigin, label, false);
}

export function configuredPrivateServiceOrigin(value, label = "Private service URL") {
  const configured = rootOrigin(value || privateServiceOrigin, label, true);
  const hostname = new URL(configured).hostname;
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  if (!loopback && configured !== privateServiceOrigin) {
    throw new Error(`${label} must match the configured private service origin ${privateServiceOrigin}`);
  }
  return configured;
}
