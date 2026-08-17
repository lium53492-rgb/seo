import {
  GET as handleGet,
  HEAD as handleHead,
} from "@/app/go/playworlds/[slug]/route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function HEAD(request: Request, context: RouteContext) {
  return handleHead(request, context);
}

export async function GET(request: Request, context: RouteContext) {
  return handleGet(request, context);
}
