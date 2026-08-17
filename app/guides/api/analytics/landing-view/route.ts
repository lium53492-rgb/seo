import { NextRequest } from "next/server";
import { POST as handlePost } from "@/app/api/analytics/landing-view/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handlePost(request);
}
