import "server-only";

export function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("pragma", "no-cache");
  return Response.json(body, { ...init, headers });
}
