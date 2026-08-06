import { readFileSync } from "node:fs";

const siteConfig = JSON.parse(
  readFileSync(new URL("../../data/config/site.json", import.meta.url), "utf8"),
);
if (
  siteConfig.schemaVersion !== 1 ||
  typeof siteConfig.canonicalOrigin !== "string" ||
  !Array.isArray(siteConfig.legacyOrigins) ||
  siteConfig.legacyOrigins.some((value) => typeof value !== "string")
) {
  throw new Error("data/config/site.json must use site configuration schema version 1");
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

export const legacySiteOrigins = Object.freeze(
  (siteConfig.legacyOrigins || []).map((value) =>
    rootOrigin(value, "data/config/site.json legacyOrigin", true)),
);
if (legacySiteOrigins.includes(canonicalSiteOrigin)) {
  throw new Error("data/config/site.json legacyOrigins must not include canonicalOrigin");
}

export function configuredProductionSiteOrigin(value, label = "Site URL") {
  return rootOrigin(value || canonicalSiteOrigin, label, false);
}
