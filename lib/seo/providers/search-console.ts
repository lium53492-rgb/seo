import "server-only";

import { createSign } from "node:crypto";
import type { PagePerformance } from "../types";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function serviceAccountAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: email,
      scope: GSC_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const signature = signer.sign(privateKey).toString("base64url");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google OAuth failed: ${response.status}`);
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function recommendation(clicks: number, impressions: number, ctr: number, position: number) {
  if (impressions >= 50 && ctr < 0.02) return "高曝光低点击：重写标题、描述与首屏承诺。";
  if (position > 7 && position <= 20) return "处于增长区间：补充独特素材和相关内部链接。";
  if (clicks >= 5 && ctr >= 0.05) return "已有有效需求：扩展同主题角色与剧情集群。";
  return "保持观察，等待更多稳定数据。";
}

export async function fetchSearchConsolePerformance(): Promise<PagePerformance[]> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) return [];
  const token = process.env.GSC_ACCESS_TOKEN || (await serviceAccountAccessToken());
  if (!token) return [];

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);

  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate: isoDate(start),
        endDate: isoDate(end),
        dimensions: ["page", "query"],
        rowLimit: 100,
        dataState: "final",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new Error(`Search Console request failed: ${response.status}`);
  const body = (await response.json()) as {
    rows?: Array<{
      keys: string[];
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
  };

  return (body.rows ?? []).slice(0, 20).map((row) => {
    const url = row.keys[0];
    return {
      url,
      query: row.keys[1],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      recommendedAction: recommendation(
        row.clicks,
        row.impressions,
        row.ctr,
        row.position,
      ),
    };
  });
}
