import { NextResponse, type NextRequest } from "next/server";

function challenge() {
  return new NextResponse("SEO workbench authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SEO Growth Workbench"' },
  });
}

export function proxy(request: NextRequest) {
  const password = process.env.WORKBENCH_PASSWORD;
  if (!password) {
    if (request.nextUrl.pathname.startsWith("/api/workbench")) {
      return new NextResponse("WORKBENCH_PASSWORD is required to run the workflow", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return challenge();
  try {
    const decoded = atob(authorization.slice(6));
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (supplied !== password) return challenge();
  } catch {
    return challenge();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/workbench/:path*", "/api/workbench/:path*"],
};
