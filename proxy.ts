import { NextResponse, type NextRequest } from "next/server";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";

function challenge() {
  return new NextResponse(null, {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SEO Growth Workbench"' },
  });
}

export function proxy(request: NextRequest) {
  const password = process.env.WORKBENCH_PASSWORD;
  if (!password) {
    if (
      process.env.NODE_ENV === "production" &&
      (request.nextUrl.pathname.startsWith("/workbench/preview") ||
        request.nextUrl.pathname.startsWith("/workbench/attribution"))
    ) {
      return new NextResponse(null, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (
      process.env.NODE_ENV === "production" &&
      request.nextUrl.pathname.startsWith("/api/workbench")
    ) {
      return new NextResponse(null, {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  if (!isBasicAuthHeaderAuthorized(request.headers.get("authorization"))) return challenge();
  return NextResponse.next();
}

export const config = {
  matcher: ["/workbench/:path*", "/api/workbench/:path*"],
};
