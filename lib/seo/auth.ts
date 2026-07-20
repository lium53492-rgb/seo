import "server-only";

import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isBasicAuthHeaderAuthorized(header: string | null) {
  const password = process.env.WORKBENCH_PASSWORD;
  if (!password) return process.env.NODE_ENV !== "production";

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
