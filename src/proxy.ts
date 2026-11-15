import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./lib/auth/token";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Allow public webhooks without user session
  if (pathname.startsWith("/api/webhooks")) {
    return NextResponse.next();
  }

  // 2. Read session token from cookie
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(sessionToken);

  // 3. Login page handling
  if (pathname === "/login") {
    if (session) {
      const from = request.nextUrl.searchParams.get("from");
      const targetUrl = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
      return NextResponse.redirect(new URL(targetUrl, request.url));
    }
    return NextResponse.next();
  }

  // 4. If authenticated, allow request
  if (session) {
    return NextResponse.next();
  }

  // 5. Unauthenticated handling
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized. Please log in to Kraftman Command Center." },
      { status: 401 }
    );
  }

  // Redirect to /login with return URL
  const loginUrl = new URL("/login", request.url);
  const from = pathname + (search || "");
  if (from !== "/") {
    loginUrl.searchParams.set("from", from);
  }
  return NextResponse.redirect(loginUrl);
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public asset extensions (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
