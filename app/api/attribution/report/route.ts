import { isWorkbenchAuthorized } from "@/lib/seo/auth";
import { readLiveGrowthFunnel } from "@/lib/seo/growth-funnel";
import { readPublishedPage } from "@/lib/seo/page-store";
import { privateJson } from "@/lib/seo/private-response";
import { shanghaiReportingWindow } from "@/lib/seo/reporting-period";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function defaultPeriod() {
  return shanghaiReportingWindow(30);
}

export async function GET(request: Request) {
  if (!process.env.WORKBENCH_PASSWORD) {
    return privateJson({ error: "Private attribution reporting is not configured" }, { status: 503 });
  }
  if (!isWorkbenchAuthorized(request)) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const sourceSlug = url.searchParams.get("sourceSlug") || "";
  if (!await readPublishedPage(sourceSlug)) {
    return privateJson({ error: "Unknown SEO source slug" }, { status: 404 });
  }
  const fallback = defaultPeriod();
  const periodStart = url.searchParams.get("from") || fallback.periodStart;
  const periodEnd = url.searchParams.get("to") || fallback.periodEnd;
  try {
    const report = await readLiveGrowthFunnel({ sourceSlug, periodStart, periodEnd });
    return privateJson(report);
  } catch (error) {
    return privateJson({
      error: error instanceof Error ? error.message : "Attribution report failed",
    }, { status: 400 });
  }
}
