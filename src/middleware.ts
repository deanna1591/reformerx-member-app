import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isMemberArea =
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/staff") &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/icons") &&
    pathname !== "/manifest.webmanifest" &&
    pathname !== "/sw.js" &&
    pathname !== "/favicon.ico";

  if (isMemberArea && !req.cookies.get("rx_member")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const isOwnerCookie = req.cookies.get("rx_admin")?.value === "1";
  const staffId = req.cookies.get("rx_staff")?.value;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!isOwnerCookie && !staffId) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    // Owner-only areas: settings, challenge design, staff management.
    const ownerOnly = ["/admin/settings", "/admin/challenges", "/admin/instructors", "/admin/promotions"];
    if (!isOwnerCookie && ownerOnly.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/admin?denied=1", req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js).*)"],
};
