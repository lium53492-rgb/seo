import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function isStrongAutomationToken(token: string | undefined): token is string {
  return typeof token === "string" && Buffer.byteLength(token, "utf8") >= 32;
}

export function isBasicAuthHeaderAuthorized(header: string | null) {
  const password = process.env.WORKBENCH_PASSWORD;
  if (!password) return false;

  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const suppliedPassword = separator >= 0 ? decoded.slice(separator + 1) : "";
    return safeEqual(suppliedPassword, password);
  } catch {
    return false;
  }
}

export function isWorkbenchAuthorized(request: Request) {
  return isBasicAuthHeaderAuthorized(request.headers.get("authorization"));
}

export function isAutomationAuthHeaderAuthorized(header: string | null) {
  const token = process.env.SEO_AUTOMATION_TOKEN;
  if (!isStrongAutomationToken(token) || !header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice(7), token);
}

export function isPrivateAttributionAccessConfigured() {
  return Boolean(
    isStrongAutomationToken(process.env.SEO_AUTOMATION_TOKEN) ||
    process.env.WORKBENCH_PASSWORD
  );
}

export function isPrivateAttributionRequestAuthorized(request: Request) {
  const header = request.headers.get("authorization");
  if (isAutomationAuthHeaderAuthorized(header)) return true;
  return Boolean(
    process.env.WORKBENCH_PASSWORD &&
    isBasicAuthHeaderAuthorized(header)
  );
}
