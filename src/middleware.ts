import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isMemberArea =
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/icons") &&
    pathname !== "/manifest.webmanifest" &&
    pathname !== "/sw.js" &&
    pathname !== "/favicon.ico";

  if (isMemberArea && !req.cookies.get("rx_member")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (
    pathname.startsWith("/admin") &&
    pathname !== "/admin/login" &&
    req.cookies.get("rx_admin")?.value !== "1"
  ) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js).*)"],
};
