"use client";

import { useEffect, useRef } from "react";

export function LandingViewBeacon({ sourceSlug }: { sourceSlug: string }) {
  const viewId = useRef<string | null>(null);

  useEffect(() => {
    if (viewId.current === null) viewId.current = globalThis.crypto.randomUUID();
    void fetch("/api/analytics/landing-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceSlug, viewId: viewId.current }),
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
      referrerPolicy: "same-origin",
    }).catch(() => {
      // Analytics must never block or alter the landing-page experience.
    });
  }, [sourceSlug]);

  return null;
}
