/**
 * Optimistic route protection: pages require a session cookie, otherwise the
 * visitor is sent to /login (and back afterwards). The real check happens in
 * the backend on every API call — an expired cookie is cleared by the API
 * proxy and the AuthProvider redirects.
 */
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PAGES = ["/login", "/forgot-password", "/reset-password"]

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = Boolean(request.cookies.get("rr_session")?.value)

  if (pathname.startsWith("/api/media")) {
    return hasSession ? NextResponse.next() : new NextResponse(null, { status: 401 })
  }

  const isPublic = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (isPublic) {
    // Already signed in → no reason to show the login form.
    if (hasSession && pathname === "/login") return NextResponse.redirect(new URL("/", request.url))
    return NextResponse.next()
  }
  if (!hasSession) {
    const url = new URL("/login", request.url)
    if (pathname !== "/") url.searchParams.set("next", pathname + search)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  // Everything except Next internals, the session/proxy API and static files.
  // Media files are listed separately: their .jpg/.mp4 extensions would
  // otherwise be skipped by the static-file exclusion below.
  matcher: [
    "/api/media/:path*",
    "/((?!_next/|api/|favicon|icon|apple-icon|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico|json|txt)$).*)",
  ],
}
